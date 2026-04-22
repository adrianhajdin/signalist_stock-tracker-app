/**
 * Reconcile Pending Orders
 *
 * Finds every Order with status = "PENDING" and asks Alpaca what actually
 * happened. Updates the Order row, the linked Position, and writes a
 * PositionEvent so the trade detail timeline reflects reality.
 *
 * Why this exists: place_trade and closeOpenPosition only poll Alpaca for
 * up to 5 seconds before returning. After-hours orders, weekend orders, and
 * occasional Alpaca latency mean a non-trivial fraction of submitted orders
 * are still PENDING when our agent code returns. Without this cron those
 * orders would sit forever in PENDING and the user would have no idea
 * whether their position was real.
 *
 * Runs every 5 minutes 4 AM – 8 PM ET, Mon–Fri (covers pre-market, RTH,
 * and after-hours fills). Re-runs are cheap: pure read until we find work.
 */

import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { getOrder, type AlpacaCredentials } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";

const FIVE_MIN_CRON = "TZ=America/New_York */5 4-19 * * 1-5";

export const reconcileOrders = inngest.createFunction(
  {
    id: "reconcile-pending-orders",
    name: "Reconcile Pending Orders",
    retries: 0,
  },
  { cron: FIVE_MIN_CRON },
  async ({ step }) => {
    // 1. Find pending orders that have an Alpaca id (anything else is unrecoverable)
    const pending = await step.run("fetch-pending-orders", async () => {
      return prisma.order.findMany({
        where: {
          status: "PENDING",
          alpacaOrderId: { not: null },
        },
        select: {
          id: true,
          userId: true,
          positionId: true,
          symbol: true,
          side: true,
          quantity: true,
          alpacaOrderId: true,
          createdAt: true,
        },
      });
    });

    if (pending.length === 0) {
      return { checked: 0, reason: "no-pending-orders" };
    }

    // 2. Group by user so we use each user's Alpaca creds for their own orders
    const byUser = new Map<string, typeof pending>();
    for (const o of pending) {
      const arr = byUser.get(o.userId) ?? [];
      arr.push(o);
      byUser.set(o.userId, arr);
    }

    let filled = 0;
    let cancelled = 0;
    let stillPending = 0;
    let errors = 0;

    for (const [userId, orders] of byUser) {
      const creds: AlpacaCredentials | undefined =
        (await resolveAlpacaCredentials(userId)) ?? undefined;

      for (const order of orders) {
        await step.run(`reconcile-${order.id}`, async () => {
          try {
            const alpacaOrder = await getOrder(order.alpacaOrderId!, creds);
            const status = alpacaOrder.status;

            // ── FILLED ────────────────────────────────────────────────────
            if (status === "filled" && alpacaOrder.filled_avg_price) {
              const fillPrice = parseFloat(alpacaOrder.filled_avg_price);
              const filledAt = alpacaOrder.filled_at
                ? new Date(alpacaOrder.filled_at)
                : new Date();

              await prisma.$transaction(async (tx) => {
                // Idempotent — only flip if still PENDING
                const updated = await tx.order.updateMany({
                  where: { id: order.id, status: "PENDING" },
                  data: {
                    status: "FILLED",
                    filledPrice: fillPrice,
                    filledQty: order.quantity,
                    filledAt,
                  },
                });
                if (updated.count === 0) return;

                // If this is a SELL closing an OPEN position, mark the position CLOSED
                if (order.side === "SELL") {
                  const position = await tx.position.findUnique({
                    where: { id: order.positionId },
                  });
                  if (position && position.status === "OPEN") {
                    const realizedPnl =
                      position.direction === "LONG"
                        ? (fillPrice - position.avgCost) * position.quantity
                        : (position.avgCost - fillPrice) * position.quantity;
                    const positionCost = position.avgCost * position.quantity;
                    const outcome: "WIN" | "LOSS" | "BREAKEVEN" =
                      realizedPnl > 0.01 * positionCost
                        ? "WIN"
                        : realizedPnl < -0.01 * positionCost
                          ? "LOSS"
                          : "BREAKEVEN";

                    await tx.position.update({
                      where: { id: position.id },
                      data: {
                        status: "CLOSED",
                        closePrice: fillPrice,
                        realizedPnl,
                        outcome,
                        closedAt: filledAt,
                      },
                    });
                    await tx.positionEvent.create({
                      data: {
                        positionId: position.id,
                        eventType: "CLOSED",
                        description: `Reconciled: pending close filled at $${fillPrice.toFixed(2)}. P&L: ${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)} — ${outcome}`,
                        priceAt: fillPrice,
                        pnlAt: realizedPnl,
                      },
                    });
                  }
                } else {
                  // BUY filled — update position avgCost to the real fill if it
                  // was set to a guess earlier
                  const position = await tx.position.findUnique({
                    where: { id: order.positionId },
                  });
                  if (position && position.status === "OPEN") {
                    if (Math.abs(position.avgCost - fillPrice) > 0.01) {
                      await tx.position.update({
                        where: { id: position.id },
                        data: { avgCost: fillPrice },
                      });
                    }
                    await tx.positionEvent.create({
                      data: {
                        positionId: position.id,
                        eventType: "OPENED",
                        description: `Reconciled: pending buy filled at $${fillPrice.toFixed(2)}`,
                        priceAt: fillPrice,
                      },
                    });
                  }
                }
              });

              filled++;
              return;
            }

            // ── CANCELLED / REJECTED / EXPIRED ────────────────────────────
            if (["canceled", "cancelled", "expired", "rejected"].includes(status)) {
              await prisma.$transaction(async (tx) => {
                const updated = await tx.order.updateMany({
                  where: { id: order.id, status: "PENDING" },
                  data: { status: status === "rejected" ? "REJECTED" : "CANCELLED" },
                });
                if (updated.count === 0) return;

                // If this was the OPENING buy and the position was just created
                // for it, mark the position CANCELLED so it doesn't sit OPEN forever.
                if (order.side === "BUY") {
                  const position = await tx.position.findUnique({
                    where: { id: order.positionId },
                  });
                  if (position && position.status === "OPEN") {
                    // Only cancel the position if there are no FILLED buy orders for it
                    const filledBuy = await tx.order.findFirst({
                      where: { positionId: position.id, side: "BUY", status: "FILLED" },
                      select: { id: true },
                    });
                    if (!filledBuy) {
                      await tx.position.update({
                        where: { id: position.id },
                        data: {
                          status: "CANCELLED",
                          closedAt: new Date(),
                          closeReason: "MANUAL",
                          realizedPnl: 0,
                        },
                      });
                      await tx.positionEvent.create({
                        data: {
                          positionId: position.id,
                          eventType: "CLOSED",
                          description: `Reconciled: opening order ${status}. Position cancelled.`,
                          priceAt: position.avgCost,
                          pnlAt: 0,
                        },
                      });
                    }
                  }
                }
              });

              cancelled++;
              return;
            }

            // ── Still pending ─────────────────────────────────────────────
            stillPending++;
          } catch (err) {
            errors++;
            console.warn(
              `[reconcile-orders] failed to reconcile ${order.id} (alpaca=${order.alpacaOrderId}): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        });
      }
    }

    return {
      checked: pending.length,
      filled,
      cancelled,
      stillPending,
      errors,
    };
  },
);
