/**
 * close_position — migrated to defineTool().
 *
 * Closes an existing open position via Alpaca and records EXIT decision
 * + RunEvent + thesis lifecycle transition in the DB.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import { getAccount } from "@/lib/alpaca";

export const closePosition = defineTool({
  description:
    "Explicitly close an existing open position by symbol. " +
    "This tool performs one action only: closing the position. " +
    "Call this during the execution phase when your analysis indicates a position should be exited.",
  schema: z.object({
    ticker: z.string().describe("Ticker symbol of the position to close"),
    reason: z
      .enum(["TARGET", "STOP", "MANUAL"])
      .default("MANUAL")
      .describe("TARGET if hit price target, STOP if risk management, MANUAL for portfolio rebalancing"),
    notes: z.string().optional().describe("Optional notes explaining the close decision"),
  }),
  ui: "tool-ui" as const,
  groupId: "Executing",

  progressLabel: (args) => `Closing $${args.ticker.toUpperCase()} position`,

  execute: async (args, ctx) => {
    const ticker = args.ticker.toUpperCase().trim();
    try {
      const position = await prisma.position.findFirst({
        where: { userId: ctx.userId, symbol: ticker, status: "OPEN" },
        include: { analyst: { select: { name: true } } },
      });

      if (!position) {
        const noPosMsg = `No open position in ${ticker}. No action taken.`;
        return {
          summary: `No position to close: $${ticker}`,
          data: {
            success: true,
            ticker,
            reason: args.reason,
            status: "NO_POSITION" as const,
            message: noPosMsg,
            tickers: [{ ticker, tag: "N/A", summary: noPosMsg, actionIcon: "failed" }],
          },
          sources: [],
        };
      }

      const { closeOpenPosition } = await import("@/lib/actions/closeTrade.actions");
      const agentAuditReason = args.notes
        ? args.notes
        : `${position.direction} position in ${ticker} closed by agent — reason: ${args.reason}.`;
      const result = await closeOpenPosition(position.id, args.reason, undefined, undefined, "agent", agentAuditReason, ctx.runId);

      const analystId = ctx.analystId || position.analystId;
      const fillNote = result.fillStatus === "PENDING" ? " (close order pending fill)" : "";
      const reasoningNote = args.notes
        ? `Closed ${position.direction} position: ${args.reason}. ${args.notes}. P&L: $${result.realizedPnl.toFixed(2)} (${result.outcome})${fillNote}`
        : `Closed ${position.direction} position: ${args.reason}. P&L: $${result.realizedPnl.toFixed(2)} (${result.outcome})${fillNote}`;

      try {
        await prisma.tradeDecision.create({
          data: {
            runId: ctx.runId,
            analystId,
            userId: ctx.userId,
            symbol: ticker,
            decision: "EXIT",
            reasoning: reasoningNote,
            positionId: position.id,
            orderId: result.orderId,
          },
        });
      } catch (decisionErr) {
        console.warn("[tool] close_position TradeDecision write failed:", decisionErr);
      }

      if (ctx.runId) {
        try {
          await prisma.runEvent.create({
            data: {
              runId: ctx.runId,
              type: "position_closed",
              title: `Closed ${position.direction} ${ticker}`,
              message: `Closed ${position.quantity} shares at $${result.closePrice.toFixed(2)} — ${result.outcome} ($${result.realizedPnl.toFixed(2)})`,
              payload: {
                ticker,
                direction: position.direction,
                shares: position.quantity,
                entry_price: position.avgCost,
                close_price: result.closePrice,
                realized_pnl: result.realizedPnl,
                outcome: result.outcome,
                reason: args.reason,
                notes: args.notes ?? null,
              } as object,
            },
          });
        } catch (evtErr) {
          console.warn("[tool] close_position RunEvent write failed:", evtErr);
        }
      }

      // Mark linked thesis as CLOSED (non-fatal)
      try {
        const activeThesis = await prisma.thesis.findFirst({
          where: {
            ticker,
            status: "ACTIVE",
            direction: { not: "PASS" },
            researchRun: { agentConfigId: analystId },
          },
          orderBy: { createdAt: "desc" },
        });
        if (activeThesis) {
          await prisma.thesis.update({ where: { id: activeThesis.id }, data: { status: "CLOSED" } });
        }
      } catch (thesisErr) {
        console.warn(`[tool] close_position failed to mark thesis CLOSED for ${ticker}:`, thesisErr);
      }

      const pnlPct = position.avgCost > 0
        ? (result.realizedPnl / (position.avgCost * position.quantity)) * 100
        : 0;

      let portfolioUpdate: { remainingSlots: number; remainingBuyingPower: number; openPositionCount: number } | null = null;
      try {
        const currentOpenCount = await prisma.position.count({ where: { analystId, status: "OPEN" } });
        const postAccount = await getAccount(ctx.alpacaCreds);
        portfolioUpdate = {
          remainingSlots: (ctx.maxOpenPositions ?? 5) - currentOpenCount,
          remainingBuyingPower: parseFloat(postAccount.buying_power),
          openPositionCount: currentOpenCount,
        };
      } catch (portfolioErr) {
        console.warn("[tool] close_position portfolio update fetch failed:", portfolioErr);
      }

      const isPending = result.fillStatus === "PENDING";
      const pnlSign = result.realizedPnl >= 0 ? "+" : "";
      const closeMessage = isPending
        ? `Close order submitted for ${position.direction} ${position.quantity} shares of ${ticker} — awaiting Alpaca fill (estimated price $${result.closePrice.toFixed(2)})`
        : `Closed ${position.direction} ${position.quantity} shares of ${ticker} at $${result.closePrice.toFixed(2)}. ${result.outcome}: $${pnlSign}${result.realizedPnl.toFixed(2)}`;

      const isWin = result.realizedPnl >= 0;
      const closeActionIcon = isPending ? "sell" : (isWin ? "closed-win" : "closed-loss");
      const tickerSummary = isPending
        ? `Close order submitted — ${position.direction} ${position.quantity} shares, awaiting fill`
        : `Closed ${position.direction} @ $${result.closePrice.toFixed(2)} — ${result.outcome} ${pnlSign}$${result.realizedPnl.toFixed(2)} (${Math.round(pnlPct * 100) / 100}%)`;

      return {
        summary: isPending
          ? `Close submitted (pending): $${ticker}`
          : `Closed $${ticker}: ${result.outcome} ${pnlSign}$${result.realizedPnl.toFixed(2)}`,
        data: {
          success: true,
          ticker,
          reason: args.reason,
          shares: position.quantity,
          status: isPending ? ("PENDING" as const) : ("CLOSED" as const),
          fillStatus: result.fillStatus,
          direction: position.direction,
          entryPrice: position.avgCost,
          closePrice: result.closePrice,
          realizedPnl: result.realizedPnl,
          pnlPct: Math.round(pnlPct * 100) / 100,
          outcome: result.outcome,
          orderId: result.orderId,
          alpacaOrderId: result.alpacaOrderId,
          placedAt: result.placedAt.toISOString(),
          filledAt: result.filledAt?.toISOString() ?? null,
          message: closeMessage,
          ...(portfolioUpdate ? { portfolioUpdate } : {}),
          tickers: [{ ticker, tag: "Closed", summary: tickerSummary, actionIcon: closeActionIcon }],
        },
        sources: [{ provider: "Alpaca", title: `Close ${ticker}` }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Position close failed";
      console.error(`[tool] close_position FAILED for ${ticker}: ${msg}`);
      return {
        summary: `Close failed: $${ticker}`,
        data: {
          success: false,
          ticker,
          reason: args.reason,
          status: "FAILED" as const,
          message: msg,
          tickers: [{ ticker, tag: "Failed", summary: msg, actionIcon: "failed" }],
        },
        sources: [],
      };
    }
  },
});
