"use server";

import { prisma } from "@/lib/prisma";
import { closePosition as closeAlpacaPosition, getOrder, getLatestPrice, cancelOrder, type AlpacaCredentials } from "@/lib/alpaca";
import { inngest } from "@/lib/inngest/client";
import { sendEmail, getUserEmail } from "@/lib/email";
import { tradeClosedHtml } from "@/lib/emails/trade-closed";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClosedPositionResult {
  positionId: string;
  orderId: string;
  alpacaOrderId: string | null;
  closePrice: number;
  realizedPnl: number;
  outcome: "WIN" | "LOSS" | "BREAKEVEN";
  fillStatus: "FILLED" | "PENDING";
  placedAt: Date;
  filledAt: Date | null;
}

/** Who triggered the close — determines audit trail source label. */
export type CloseSource = "agent" | "price_monitor" | "user";

// ─── Audit helpers ────────────────────────────────────────────────────────────

/**
 * Generates a human-readable reason string for the audit trail when no
 * explicit reason was provided by the caller.
 */
function buildCloseReason(
  source: CloseSource,
  reason: "TARGET" | "STOP" | "TIME" | "MANUAL",
  symbol: string,
  closePrice: number,
  stopLoss: number | null,
  targetPrice: number | null,
): string {
  if (source === "price_monitor") {
    if (reason === "TARGET" && targetPrice) {
      return `Target price of $${targetPrice.toFixed(2)} was reached. ${symbol} closed at $${closePrice.toFixed(2)} by the automated price monitor.`;
    }
    if (reason === "STOP" && stopLoss) {
      return `Stop loss at $${stopLoss.toFixed(2)} was hit. ${symbol} closed at $${closePrice.toFixed(2)} by the automated price monitor.`;
    }
    if (reason === "TIME") {
      return `Hold duration expired. ${symbol} closed at $${closePrice.toFixed(2)} by the automated price monitor.`;
    }
    return `${symbol} closed at $${closePrice.toFixed(2)} by the automated price monitor (${reason}).`;
  }
  if (source === "user") {
    return `${symbol} manually closed at $${closePrice.toFixed(2)} via the UI.`;
  }
  // agent — should always pass an explicit auditReason, but fallback just in case
  return `${symbol} closed at $${closePrice.toFixed(2)} by the agent (${reason}).`;
}

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Close an open position — called by auto-close logic and manual close button.
 *
 * Lifecycle (mirrors place_trade):
 *   1. Submit close order to Alpaca → get alpacaOrder.id
 *   2. Poll up to 5s for fill confirmation
 *   3. Write the closing Order row with the real fill state (FILLED or PENDING)
 *      and the real alpacaOrderId
 *   4. Update Position to CLOSED *only if* the order actually filled. Pending
 *      sells leave the Position OPEN until the reconcile-orders cron flips it.
 */
export async function closeOpenPosition(
  positionId: string,
  reason: "TARGET" | "STOP" | "TIME" | "MANUAL",
  closePriceOverride?: number,
  alpacaCreds?: AlpacaCredentials | null,
  source: CloseSource = "agent",
  auditReason?: string,
  runId?: string,
): Promise<ClosedPositionResult> {
  // 1. Load the position
  const position = await prisma.position.findUniqueOrThrow({
    where: { id: positionId },
  });

  if (position.status !== "OPEN") {
    throw new Error(`Position ${positionId} is not OPEN (status: ${position.status})`);
  }

  // Resolve per-user Alpaca credentials if not provided
  const creds = alpacaCreds ?? await resolveAlpacaCredentials(position.userId) ?? undefined;

  // 2. Submit close order to Alpaca + poll for fill
  const placedAt = new Date();
  let closePrice = closePriceOverride ?? 0;
  let alpacaOrderId: string | null = null;
  let didFill = false;
  let filledAt: Date | null = null;

  if (closePriceOverride === undefined) {
    let alpacaOrder;
    try {
      alpacaOrder = await closeAlpacaPosition(position.symbol, creds);
      alpacaOrderId = alpacaOrder.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404") || msg.includes("position does not exist")) {
        // Alpaca says no position — DB is out of sync. Use latest price for accounting.
        closePrice = await getLatestPrice(position.symbol, creds);
        didFill = true;
        filledAt = new Date();
      } else {
        throw err;
      }
    }

    if (alpacaOrder) {
      // Initial fill check from the create response
      if (alpacaOrder.filled_avg_price) {
        closePrice = parseFloat(alpacaOrder.filled_avg_price);
        didFill = true;
        filledAt = alpacaOrder.filled_at ? new Date(alpacaOrder.filled_at) : new Date();
      } else {
        // Poll up to 5s for fill confirmation
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          const polled = await getOrder(alpacaOrder.id, creds);
          if (polled.status === "filled" && polled.filled_avg_price) {
            closePrice = parseFloat(polled.filled_avg_price);
            didFill = true;
            filledAt = polled.filled_at ? new Date(polled.filled_at) : new Date();
            break;
          }
          if (["cancelled", "expired", "rejected"].includes(polled.status)) {
            throw new Error(`Alpaca close order ${polled.status}`);
          }
          await new Promise((r) => setTimeout(r, 1_000));
        }
        // If still not filled, fall back to latest price for the recorded snapshot.
        // The Order row stays PENDING; reconcile-orders will flip it later.
        if (!didFill) {
          try { closePrice = await getLatestPrice(position.symbol, creds); }
          catch { closePrice = position.avgCost; }
        }
      }
    }
  } else {
    // Caller provided the close price (auto-close path) — treat as filled.
    didFill = true;
    filledAt = new Date();
  }

  // 3. Calculate realized P&L based on the price we ended up with
  const realizedPnl =
    position.direction === "LONG"
      ? (closePrice - position.avgCost) * position.quantity
      : (position.avgCost - closePrice) * position.quantity;

  // 4. Determine outcome (1% threshold)
  const positionCost = position.avgCost * position.quantity;
  const outcome: "WIN" | "LOSS" | "BREAKEVEN" =
    realizedPnl > 0.01 * positionCost
      ? "WIN"
      : realizedPnl < -0.01 * positionCost
        ? "LOSS"
        : "BREAKEVEN";

  // 5. Write Order + Position update + PositionEvent atomically
  const sign = realizedPnl >= 0 ? "+" : "";
  const orderId = await prisma.$transaction(async (tx) => {
    // Create the closing sell Order — honest about fill state
    const ord = await tx.order.create({
      data: {
        positionId,
        userId: position.userId,
        symbol: position.symbol,
        side: position.direction === "LONG" ? "SELL" : "BUY",
        orderType: "MARKET",
        quantity: position.quantity,
        status: didFill ? "FILLED" : "PENDING",
        filledPrice: didFill ? closePrice : null,
        filledQty: didFill ? position.quantity : null,
        filledAt: didFill ? (filledAt ?? new Date()) : null,
        alpacaOrderId,
        createdAt: placedAt,
      },
    });

    // Only mark Position CLOSED if the close order actually filled.
    // Pending close orders leave the Position OPEN until reconcile flips them.
    if (didFill) {
      await tx.position.update({
        where: { id: positionId },
        data: {
          status: "CLOSED",
          closePrice,
          closeReason: reason,
          closeSource: source,
          realizedPnl,
          outcome,
          closedAt: filledAt ?? new Date(),
        },
      });

      await tx.positionEvent.create({
        data: {
          positionId,
          eventType: "CLOSED",
          description: `Position closed (${reason}) at $${closePrice.toFixed(2)}. P&L: ${sign}$${realizedPnl.toFixed(2)} — ${outcome}`,
          priceAt: closePrice,
          pnlAt: realizedPnl,
        },
      });

      // Audit record — every close gets a reason string visible to the user
      const generatedReason = auditReason ?? buildCloseReason(source, reason, position.symbol, closePrice, position.stopLoss, position.targetPrice);
      await tx.positionManagementAction.create({
        data: {
          positionId,
          runId: runId ?? null,
          actionType: "FULL_CLOSE",
          source,
          reason: generatedReason,
          fillPrice: closePrice,
          fillQty: position.quantity,
          alpacaOrderId: alpacaOrderId,
        },
      });
    } else {
      // Order is pending — log a PRICE_CHECK-style event so the timeline shows the attempt
      await tx.positionEvent.create({
        data: {
          positionId,
          eventType: "PRICE_CHECK",
          description: `Close order submitted (${reason}). Awaiting Alpaca fill.`,
          priceAt: closePrice,
        },
      });
    }

    return ord.id;
  });

  // 6. Fire post-trade evaluator + email — only if the close actually completed
  if (didFill) {
    await inngest.send({ name: "trade/closed", data: { positionId } });

    getUserEmail(position.userId).then((toEmail) => {
      if (!toEmail) return;
      const pnlPct = positionCost > 0 ? (realizedPnl / positionCost) * 100 : 0;
      const daysHeld = Math.max(
        1,
        Math.round((Date.now() - new Date(position.openedAt).getTime()) / 86_400_000)
      );
      const isWin = outcome === "WIN";
      const sign2 = realizedPnl >= 0 ? "+" : "";
      sendEmail({
        to: toEmail,
        subject: isWin
          ? `✅ ${position.symbol} closed ${sign2}${pnlPct.toFixed(1)}% — WIN`
          : `⛔ ${position.symbol} closed ${sign2}${pnlPct.toFixed(1)}% — ${outcome}`,
        html: tradeClosedHtml({
          ticker: position.symbol,
          direction: position.direction as "LONG" | "SHORT",
          entryPrice: position.avgCost,
          closePrice,
          realizedPnl,
          realizedPnlPct: pnlPct,
          outcome,
          closeReason: reason,
          daysHeld,
          tradeId: positionId,
        }),
      });
    });
  }

  return {
    positionId,
    orderId,
    alpacaOrderId,
    closePrice,
    realizedPnl,
    outcome,
    fillStatus: didFill ? "FILLED" : "PENDING",
    placedAt,
    filledAt,
  };
}

// ─── Cancel Position (pending orders that haven't been filled) ───────────────

export async function cancelPosition(positionId: string): Promise<void> {
  const position = await prisma.position.findUniqueOrThrow({
    where: { id: positionId },
  });

  if (position.status !== "OPEN") {
    throw new Error(`Position ${positionId} is not OPEN (status: ${position.status})`);
  }

  // Resolve per-user Alpaca credentials
  const creds = await resolveAlpacaCredentials(position.userId) ?? undefined;

  // Cancel any pending Alpaca orders first
  const pendingOrders = await prisma.order.findMany({
    where: { positionId, status: "PENDING" },
    select: { id: true, alpacaOrderId: true },
  });
  for (const order of pendingOrders) {
    if (order.alpacaOrderId) {
      try {
        await cancelOrder(order.alpacaOrderId, creds);
      } catch {
        // Order may already be filled or cancelled — fall through
      }
    }
  }

  // Mark Orders + Position cancelled atomically
  await prisma.$transaction(async (tx) => {
    if (pendingOrders.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: pendingOrders.map((o) => o.id) } },
        data: { status: "CANCELLED" },
      });
    }

    await tx.position.update({
      where: { id: positionId },
      data: {
        status: "CANCELLED",
        closedAt: new Date(),
        closeReason: "MANUAL",
        closeSource: "user",
        realizedPnl: 0,
      },
    });

    await tx.positionEvent.create({
      data: {
        positionId,
        eventType: "CLOSED",
        description: `Position cancelled manually. ${pendingOrders.length} pending order(s) cancelled.`,
        priceAt: position.avgCost,
        pnlAt: 0,
      },
    });
  });
}

// ─── Legacy aliases (for old code paths during migration) ────────────────────

export type ClosedTradeResult = ClosedPositionResult;

export async function closeTrade(
  tradeId: string,
  reason: "TARGET" | "STOP" | "TIME" | "MANUAL",
  closePriceOverride?: number
): Promise<ClosedPositionResult> {
  return closeOpenPosition(tradeId, reason, closePriceOverride);
}

export async function cancelTrade(tradeId: string): Promise<void> {
  return cancelPosition(tradeId);
}
