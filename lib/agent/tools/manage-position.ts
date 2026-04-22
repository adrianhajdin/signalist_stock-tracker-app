/**
 * manage_position — replaces the binary close_position with a full suite of
 * position management actions. Every action writes a PositionManagementAction
 * audit record with a human-readable reason string.
 *
 * Actions:
 *   full_close          — exit the entire position
 *   partial_close       — sell close_pct% of current shares
 *   add_to_position     — add add_notional dollars to the position
 *   update_targets      — change targetPrice and/or stopLoss
 *   move_stop_to_breakeven — set stopLoss = avgCost
 *   set_trailing_stop   — switch exitStrategy to TRAILING with trail_pct
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import type { ToolContext } from "@/lib/agent/tool-context";
import { prisma } from "@/lib/prisma";
import { getAccount, getOrder, getLatestPrice, closePositionPartial, placeMarketOrder } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";

type ManagePositionStatus = "NO_POSITION" | "CLOSED" | "PARTIAL_CLOSE" | "ADDED" | "UPDATED" | "FAILED";

interface ManagePositionTicker {
  ticker: string;
  tag: string;
  summary: string;
  actionIcon: string;
}

interface ManagePositionData {
  success: boolean;
  ticker: string;
  action: string;
  status: ManagePositionStatus;
  message: string;
  tickers: ManagePositionTicker[];
  // optional per-action fields
  direction?: string;
  entryPrice?: number;
  closePrice?: number;
  realizedPnl?: number;
  pnlPct?: number;
  outcome?: string;
  closedQty?: number;
  remainingQty?: number;
  fillPrice?: number;
  partialPnl?: number;
  addedQty?: number;
  newTotalQty?: number;
  newAvgCost?: number;
  newTargetPrice?: number | null;
  newStopLoss?: number | null;
  trailPct?: number;
  portfolioUpdate?: { remainingSlots: number; remainingBuyingPower: number; openPositionCount: number };
}

type ManagePositionReturn = { summary: string; data: ManagePositionData; sources: never[] };

function makeReturn(summary: string, data: ManagePositionData): ManagePositionReturn {
  return { summary, data, sources: [] };
}

const schema = z.object({
  symbol: z.string().describe("Ticker symbol of the position to manage"),
  action: z.enum([
    "full_close",
    "partial_close",
    "add_to_position",
    "update_targets",
    "move_stop_to_breakeven",
    "set_trailing_stop",
  ]).describe("What to do with this position"),
  reason: z
    .string()
    .min(20)
    .describe(
      "Required: 1–3 sentences explaining your decision. Written to the audit log visible to the user. Be specific — cite the price, catalyst, and expected outcome.",
    ),

  // partial_close
  close_pct: z
    .number()
    .min(1)
    .max(99)
    .optional()
    .describe("For partial_close: percentage of the position to exit (1–99)"),

  // add_to_position
  add_notional: z
    .number()
    .positive()
    .optional()
    .describe("For add_to_position: dollar amount to add to the position"),

  // update_targets
  new_target_price: z.number().positive().optional().describe("New target price"),
  new_stop_loss: z.number().positive().optional().describe("New stop loss price"),

  // set_trailing_stop
  trail_pct: z
    .number()
    .min(0.5)
    .max(25)
    .optional()
    .describe("For set_trailing_stop: trail percentage from peak (e.g. 4 = exit if 4% below peak)"),

  // full_close reason code
  close_reason: z
    .enum(["TARGET", "STOP", "THESIS_INVALIDATED", "RISK_MANAGEMENT", "MANUAL"])
    .optional()
    .describe("For full_close or partial_close: the reason code for the exit"),
});

export const managePosition = defineTool({
  description:
    "Manage an existing open position with nuanced actions beyond binary buy/sell. " +
    "Use this instead of close_position for any position management: partial exits, " +
    "target/stop updates, trailing stops, or adding to a winning position. " +
    "Every action is audit-logged with your reason.",
  schema,
  ui: "tool-ui" as const,
  groupId: "Executing",

  progressLabel: (args) => {
    const t = args.symbol.toUpperCase();
    switch (args.action) {
      case "full_close":
        return `Closing the ${t} position`;
      case "partial_close":
        return `Trimming ${t}${args.close_pct ? ` by ${args.close_pct}%` : ""}`;
      case "add_to_position":
        return `Adding to the ${t} position`;
      case "update_targets":
        return `Updating ${t} target and stop`;
      case "move_stop_to_breakeven":
        return `Moving ${t} stop to breakeven`;
      case "set_trailing_stop":
        return `Setting a ${args.trail_pct ?? 5}% trailing stop on ${t}`;
      default:
        return `Managing the ${t} position`;
    }
  },

  execute: async (args: z.infer<typeof schema>, ctx: ToolContext): Promise<ManagePositionReturn> => {
    const ticker = args.symbol.toUpperCase().trim();

    const position = await prisma.position.findFirst({
      where: { userId: ctx.userId, symbol: ticker, status: "OPEN" },
      include: { analyst: { select: { name: true } } },
    });

    if (!position) {
      return {
        summary: `No open position in ${ticker}`,
        data: {
          success: false,
          ticker,
          action: args.action,
          status: "NO_POSITION" as const,
          message: `No open position in ${ticker}. No action taken.`,
          tickers: [{ ticker, tag: "N/A", summary: `No open position in ${ticker}`, actionIcon: "failed" }],
        },
        sources: [],
      };
    }

    const analystId = ctx.analystId || position.analystId;
    const creds = ctx.alpacaCreds ?? await resolveAlpacaCredentials(ctx.userId) ?? undefined;

    try {
      switch (args.action) {
        // ── FULL CLOSE ──────────────────────────────────────────────────────
        case "full_close": {
          const closeReasonCode =
            (args.close_reason === "TARGET" || args.close_reason === "STOP" || args.close_reason === "MANUAL")
              ? args.close_reason
              : "MANUAL";

          const { closeOpenPosition } = await import("@/lib/actions/closeTrade.actions");
          const result = await closeOpenPosition(
            position.id,
            closeReasonCode,
            undefined,
            creds,
            "agent",
            args.reason,
            ctx.runId,
          );

          const pnlSign = result.realizedPnl >= 0 ? "+" : "";
          const pnlPct = position.avgCost > 0
            ? (result.realizedPnl / (position.avgCost * position.quantity)) * 100
            : 0;

          if (ctx.runId) {
            await prisma.runEvent.create({
              data: {
                runId: ctx.runId,
                type: "position_closed",
                title: `Closed ${position.direction} ${ticker}`,
                message: `Closed ${position.quantity} shares at $${result.closePrice.toFixed(2)} — ${result.outcome} ($${pnlSign}${result.realizedPnl.toFixed(2)})`,
                payload: {
                  ticker,
                  direction: position.direction,
                  shares: position.quantity,
                  entry_price: position.avgCost,
                  close_price: result.closePrice,
                  realized_pnl: result.realizedPnl,
                  outcome: result.outcome,
                  reason: args.close_reason ?? "MANUAL",
                  audit_reason: args.reason,
                } as object,
              },
            });
          }

          // Mark thesis CLOSED
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
          } catch { /* non-fatal */ }

          return {
            summary: `Closed $${ticker}: ${result.outcome} ${pnlSign}$${result.realizedPnl.toFixed(2)}`,
            data: {
              success: true,
              ticker,
              action: args.action,
              status: "CLOSED" as const,
              direction: position.direction,
              entryPrice: position.avgCost,
              closePrice: result.closePrice,
              realizedPnl: result.realizedPnl,
              pnlPct: Math.round(pnlPct * 100) / 100,
              outcome: result.outcome,
              message: `Closed ${position.direction} ${position.quantity} shares of ${ticker} at $${result.closePrice.toFixed(2)}. ${result.outcome}: ${pnlSign}$${result.realizedPnl.toFixed(2)}`,
              tickers: [{ ticker, tag: "Closed", summary: `${result.outcome} ${pnlSign}$${result.realizedPnl.toFixed(2)} (${Math.round(pnlPct * 100) / 100}%)`, actionIcon: result.realizedPnl >= 0 ? "closed-win" : "closed-loss" }],
            },
            sources: [],
          };
        }

        // ── PARTIAL CLOSE ───────────────────────────────────────────────────
        case "partial_close": {
          const pct = args.close_pct ?? 50;
          const closeQty = Math.max(1, Math.floor(position.quantity * (pct / 100)));

          if (closeQty >= position.quantity) {
            return {
              summary: `Partial close would exit entire position — use full_close instead`,
              data: {
                success: false, ticker, action: args.action, status: "FAILED" as const,
                message: "Partial close percentage would close the entire position. Use full_close.",
                tickers: [{ ticker, tag: "Failed", summary: "Use full_close to exit entirely", actionIcon: "failed" }],
              },
              sources: [],
            };
          }

          const closeSide = position.direction === "LONG" ? "sell" : "buy";
          let fillPrice: number | null = null;
          let alpacaOrderId: string | null = null;

          try {
            const alpacaOrder = await closePositionPartial(ticker, closeQty, closeSide, creds);
            alpacaOrderId = alpacaOrder.id;
            // Poll up to 5s for fill
            const deadline = Date.now() + 5_000;
            while (Date.now() < deadline) {
              const polled = await getOrder(alpacaOrder.id, creds);
              if (polled.status === "filled" && polled.filled_avg_price) {
                fillPrice = parseFloat(polled.filled_avg_price);
                break;
              }
              await new Promise((r) => setTimeout(r, 1_000));
            }
          } catch { /* fall back to latest price */ }

          if (!fillPrice) {
            try { fillPrice = await getLatestPrice(ticker, creds); }
            catch { fillPrice = position.avgCost; }
          }

          const newQty = position.quantity - closeQty;
          const partialPnl = position.direction === "LONG"
            ? (fillPrice - position.avgCost) * closeQty
            : (position.avgCost - fillPrice) * closeQty;
          const pnlSign = partialPnl >= 0 ? "+" : "";

          await prisma.$transaction(async (tx) => {
            // Update position qty
            await tx.position.update({
              where: { id: position.id },
              data: { quantity: newQty },
            });

            // Create the partial-sell order
            const ord = await tx.order.create({
              data: {
                positionId: position.id,
                userId: ctx.userId,
                symbol: ticker,
                side: closeSide === "sell" ? "SELL" : "BUY",
                orderType: "MARKET",
                quantity: closeQty,
                status: "FILLED",
                filledPrice: fillPrice!,
                filledQty: closeQty,
                filledAt: new Date(),
                alpacaOrderId,
              },
            });

            // Position event
            await tx.positionEvent.create({
              data: {
                positionId: position.id,
                eventType: "PARTIAL_CLOSE",
                description: `Partial close: sold ${closeQty} of ${position.quantity} shares (${pct}%) at $${fillPrice!.toFixed(2)}. P&L on portion: ${pnlSign}$${partialPnl.toFixed(2)}. Remaining: ${newQty} shares.`,
                priceAt: fillPrice!,
                pnlAt: partialPnl,
              },
            });

            // Audit record
            await tx.positionManagementAction.create({
              data: {
                positionId: position.id,
                runId: ctx.runId ?? null,
                actionType: "PARTIAL_CLOSE",
                source: "agent",
                prevQty: position.quantity,
                newQty,
                reason: args.reason,
                alpacaOrderId: alpacaOrderId ?? null,
                fillPrice: fillPrice!,
                fillQty: closeQty,
              },
            });

            if (ctx.runId) {
              await tx.runEvent.create({
                data: {
                  runId: ctx.runId,
                  type: "position_modified",
                  title: `Partial close: ${ticker}`,
                  message: `Sold ${closeQty} of ${position.quantity} shares (${pct}%) at $${fillPrice!.toFixed(2)}. ${pnlSign}$${partialPnl.toFixed(2)} realized. ${newQty} shares remain.`,
                  payload: { ticker, action: "partial_close", closeQty, newQty, fillPrice, partialPnl, pct } as object,
                },
              });
            }

            // Record as a TradeDecision
            await tx.tradeDecision.create({
              data: {
                runId: ctx.runId,
                analystId,
                userId: ctx.userId,
                symbol: ticker,
                decision: "PARTIAL_EXIT",
                reasoning: args.reason,
                positionId: position.id,
                orderId: ord.id,
              },
            });
          });

          return {
            summary: `Partial close ${ticker}: sold ${pct}% (${closeQty} shares) ${pnlSign}$${partialPnl.toFixed(2)}`,
            data: {
              success: true,
              ticker,
              action: args.action,
              status: "PARTIAL_CLOSE" as const,
              closedQty: closeQty,
              remainingQty: newQty,
              fillPrice,
              partialPnl,
              message: `Sold ${closeQty} shares of ${ticker} at $${fillPrice.toFixed(2)}. ${pnlSign}$${partialPnl.toFixed(2)} realized. ${newQty} shares remain.`,
              tickers: [{ ticker, tag: `Partial (-${pct}%)`, summary: `Sold ${closeQty} shares @ $${fillPrice.toFixed(2)}. ${pnlSign}$${partialPnl.toFixed(2)} realized.`, actionIcon: partialPnl >= 0 ? "closed-win" : "closed-loss" }],
            },
            sources: [],
          };
        }

        // ── ADD TO POSITION ──────────────────────────────────────────────────
        case "add_to_position": {
          const notional = args.add_notional;
          if (!notional) {
            return {
              summary: `add_notional required for add_to_position`,
              data: {
                success: false, ticker, action: args.action, status: "FAILED" as const,
                message: "add_notional is required for add_to_position.",
                tickers: [{ ticker, tag: "Failed", summary: "Missing add_notional", actionIcon: "failed" }],
              },
              sources: [],
            };
          }

          // Size guard: don't exceed 150% of configured max position size
          const maxPosSize = ctx.maxPositionSize ?? 5000;
          const currentValue = position.avgCost * position.quantity;
          if (currentValue + notional > maxPosSize * 1.5) {
            return {
              summary: `Add would exceed max position size`,
              data: {
                success: false, ticker, action: args.action, status: "FAILED" as const,
                message: `Adding $${notional} to the current $${currentValue.toFixed(0)} position would exceed 150% of max position size ($${maxPosSize}).`,
                tickers: [{ ticker, tag: "Failed", summary: "Exceeds max size limit", actionIcon: "failed" }],
              },
              sources: [],
            };
          }

          const addOrder = await placeMarketOrder({
            symbol: ticker,
            side: position.direction === "LONG" ? "buy" : "sell",
            notional,
          }, creds);

          let fillPrice: number | null = null;
          let fillQty: number | null = null;
          const alpacaOrderId = addOrder.id;

          const deadline = Date.now() + 5_000;
          while (Date.now() < deadline) {
            const polled = await getOrder(addOrder.id, creds);
            if (polled.status === "filled" && polled.filled_avg_price && polled.filled_qty) {
              fillPrice = parseFloat(polled.filled_avg_price);
              fillQty = parseFloat(polled.filled_qty);
              break;
            }
            await new Promise((r) => setTimeout(r, 1_000));
          }

          if (!fillPrice) fillPrice = await getLatestPrice(ticker, creds).catch(() => position.avgCost);
          if (!fillQty) fillQty = Math.floor(notional / fillPrice);

          const newTotalQty = position.quantity + fillQty;
          const newAvgCost = ((position.avgCost * position.quantity) + (fillPrice * fillQty)) / newTotalQty;

          await prisma.$transaction(async (tx) => {
            await tx.position.update({
              where: { id: position.id },
              data: { quantity: newTotalQty, avgCost: newAvgCost },
            });

            const ord = await tx.order.create({
              data: {
                positionId: position.id,
                userId: ctx.userId,
                symbol: ticker,
                side: position.direction === "LONG" ? "BUY" : "SELL",
                orderType: "MARKET",
                quantity: fillQty!,
                status: "FILLED",
                filledPrice: fillPrice!,
                filledQty: fillQty!,
                filledAt: new Date(),
                alpacaOrderId,
              },
            });

            await tx.positionEvent.create({
              data: {
                positionId: position.id,
                eventType: "ADDED",
                description: `Added ${fillQty} shares at $${fillPrice!.toFixed(2)}. New position: ${newTotalQty} shares @ avg $${newAvgCost.toFixed(2)}.`,
                priceAt: fillPrice!,
              },
            });

            await tx.positionManagementAction.create({
              data: {
                positionId: position.id,
                runId: ctx.runId ?? null,
                actionType: "ADD_TO_POSITION",
                source: "agent",
                prevQty: position.quantity,
                newQty: newTotalQty,
                reason: args.reason,
                alpacaOrderId,
                fillPrice: fillPrice!,
                fillQty: fillQty!,
              },
            });

            if (ctx.runId) {
              await tx.runEvent.create({
                data: {
                  runId: ctx.runId,
                  type: "position_modified",
                  title: `Added to ${ticker}`,
                  message: `Added ${fillQty} shares at $${fillPrice!.toFixed(2)}. Now ${newTotalQty} shares @ avg $${newAvgCost.toFixed(2)}.`,
                  payload: { ticker, action: "add_to_position", addedQty: fillQty, newTotalQty, fillPrice, newAvgCost } as object,
                },
              });
            }

            await tx.tradeDecision.create({
              data: {
                runId: ctx.runId,
                analystId,
                userId: ctx.userId,
                symbol: ticker,
                decision: "ADD",
                reasoning: args.reason,
                positionId: position.id,
                orderId: ord.id,
              },
            });
          });

          return {
            summary: `Added to ${ticker}: +${fillQty} shares @ $${fillPrice.toFixed(2)}. Now ${newTotalQty} shares.`,
            data: {
              success: true, ticker, action: args.action, status: "ADDED" as const,
              addedQty: fillQty, newTotalQty, fillPrice, newAvgCost,
              message: `Added ${fillQty} shares of ${ticker} at $${fillPrice.toFixed(2)}. Position is now ${newTotalQty} shares at avg cost $${newAvgCost.toFixed(2)}.`,
              tickers: [{ ticker, tag: "Added", summary: `+${fillQty} shares @ $${fillPrice.toFixed(2)}. ${newTotalQty} total.`, actionIcon: "buy" }],
            },
            sources: [],
          };
        }

        // ── UPDATE TARGETS ───────────────────────────────────────────────────
        case "update_targets": {
          if (!args.new_target_price && !args.new_stop_loss) {
            return {
              summary: `No target or stop provided`,
              data: {
                success: false, ticker, action: args.action, status: "FAILED" as const,
                message: "Provide new_target_price and/or new_stop_loss.",
                tickers: [{ ticker, tag: "Failed", summary: "Missing target/stop values", actionIcon: "failed" }],
              },
              sources: [],
            };
          }

          const updateData: Record<string, number> = {};
          if (args.new_target_price) updateData.targetPrice = args.new_target_price;
          if (args.new_stop_loss) updateData.stopLoss = args.new_stop_loss;

          await prisma.$transaction(async (tx) => {
            await tx.position.update({ where: { id: position.id }, data: updateData });

            await tx.positionEvent.create({
              data: {
                positionId: position.id,
                eventType: "TARGET_UPDATED",
                description: [
                  args.new_target_price ? `Target: $${position.targetPrice?.toFixed(2) ?? "—"} → $${args.new_target_price.toFixed(2)}` : null,
                  args.new_stop_loss ? `Stop: $${position.stopLoss?.toFixed(2) ?? "—"} → $${args.new_stop_loss.toFixed(2)}` : null,
                ].filter(Boolean).join(" · "),
                priceAt: null,
              },
            });

            await tx.positionManagementAction.create({
              data: {
                positionId: position.id,
                runId: ctx.runId ?? null,
                actionType: "UPDATE_TARGETS",
                source: "agent",
                prevTargetPrice: position.targetPrice ?? null,
                newTargetPrice: args.new_target_price ?? null,
                prevStopLoss: position.stopLoss ?? null,
                newStopLoss: args.new_stop_loss ?? null,
                reason: args.reason,
              },
            });

            if (ctx.runId) {
              await tx.runEvent.create({
                data: {
                  runId: ctx.runId,
                  type: "position_modified",
                  title: `Updated targets: ${ticker}`,
                  message: args.reason,
                  payload: { ticker, action: "update_targets", prevTarget: position.targetPrice, newTarget: args.new_target_price, prevStop: position.stopLoss, newStop: args.new_stop_loss } as object,
                },
              });
            }
          });

          const changes = [
            args.new_target_price ? `target $${args.new_target_price.toFixed(2)}` : null,
            args.new_stop_loss ? `stop $${args.new_stop_loss.toFixed(2)}` : null,
          ].filter(Boolean).join(", ");

          return {
            summary: `Updated ${ticker}: ${changes}`,
            data: {
              success: true, ticker, action: args.action, status: "UPDATED" as const,
              newTargetPrice: args.new_target_price ?? position.targetPrice,
              newStopLoss: args.new_stop_loss ?? position.stopLoss,
              message: `Updated ${ticker} — ${changes}. Reason: ${args.reason}`,
              tickers: [{ ticker, tag: "Updated", summary: `Set ${changes}`, actionIcon: "hold" }],
            },
            sources: [],
          };
        }

        // ── MOVE STOP TO BREAKEVEN ────────────────────────────────────────────
        case "move_stop_to_breakeven": {
          const prevStop = position.stopLoss;
          const newStop = position.avgCost;

          await prisma.$transaction(async (tx) => {
            await tx.position.update({
              where: { id: position.id },
              data: { stopLoss: newStop },
            });

            await tx.positionEvent.create({
              data: {
                positionId: position.id,
                eventType: "STOP_MOVED",
                description: `Stop moved to breakeven: $${prevStop?.toFixed(2) ?? "—"} → $${newStop.toFixed(2)} (avg cost)`,
                priceAt: null,
              },
            });

            await tx.positionManagementAction.create({
              data: {
                positionId: position.id,
                runId: ctx.runId ?? null,
                actionType: "MOVE_STOP_TO_BREAKEVEN",
                source: "agent",
                prevStopLoss: prevStop ?? null,
                newStopLoss: newStop,
                reason: args.reason,
              },
            });

            if (ctx.runId) {
              await tx.runEvent.create({
                data: {
                  runId: ctx.runId,
                  type: "position_modified",
                  title: `Stop → breakeven: ${ticker}`,
                  message: `Moved ${ticker} stop to breakeven at $${newStop.toFixed(2)}. ${args.reason}`,
                  payload: { ticker, action: "move_stop_to_breakeven", prevStop, newStop } as object,
                },
              });
            }
          });

          return {
            summary: `${ticker}: stop moved to breakeven $${newStop.toFixed(2)}`,
            data: {
              success: true, ticker, action: args.action, status: "UPDATED" as const,
              newStopLoss: newStop,
              message: `Stop loss moved to breakeven ($${newStop.toFixed(2)}) for ${ticker}. Trade now risk-free.`,
              tickers: [{ ticker, tag: "BE stop", summary: `Stop at $${newStop.toFixed(2)} (breakeven)`, actionIcon: "hold" }],
            },
            sources: [],
          };
        }

        // ── SET TRAILING STOP ────────────────────────────────────────────────
        case "set_trailing_stop": {
          const pct = args.trail_pct ?? 5;

          await prisma.$transaction(async (tx) => {
            await tx.position.update({
              where: { id: position.id },
              data: {
                exitStrategy: "TRAILING",
                trailingStopPct: pct,
              },
            });

            await tx.positionEvent.create({
              data: {
                positionId: position.id,
                eventType: "MODIFIED",
                description: `Trailing stop activated: ${pct}% from peak. Exit strategy changed from ${position.exitStrategy} to TRAILING.`,
                priceAt: null,
              },
            });

            await tx.positionManagementAction.create({
              data: {
                positionId: position.id,
                runId: ctx.runId ?? null,
                actionType: "SET_TRAILING_STOP",
                source: "agent",
                prevTrailPct: position.trailingStopPct ?? null,
                newTrailPct: pct,
                reason: args.reason,
              },
            });

            if (ctx.runId) {
              await tx.runEvent.create({
                data: {
                  runId: ctx.runId,
                  type: "position_modified",
                  title: `Trailing stop: ${ticker}`,
                  message: `${ticker} now using ${pct}% trailing stop. ${args.reason}`,
                  payload: { ticker, action: "set_trailing_stop", trailPct: pct } as object,
                },
              });
            }
          });

          return {
            summary: `${ticker}: ${pct}% trailing stop activated`,
            data: {
              success: true, ticker, action: args.action, status: "UPDATED" as const,
              trailPct: pct,
              message: `${ticker} now using a ${pct}% trailing stop. Will auto-exit if price falls ${pct}% from its peak.`,
              tickers: [{ ticker, tag: `${pct}% trail`, summary: `Trailing stop: ${pct}% from peak`, actionIcon: "hold" }],
            },
            sources: [],
          };
        }

        default:
          return {
            summary: `Unknown action`,
            data: {
              success: false, ticker, action: args.action, status: "FAILED" as const,
              message: `Unknown action: ${args.action}`,
              tickers: [{ ticker, tag: "Failed", summary: "Unknown action", actionIcon: "failed" }],
            },
            sources: [],
          };
      }
    } catch (err) {
      // Refresh portfolio context for the error response
      let portfolioUpdate: { remainingSlots: number; remainingBuyingPower: number; openPositionCount: number } | null = null;
      try {
        const currentOpenCount = await prisma.position.count({ where: { analystId, status: "OPEN" } });
        const postAccount = await getAccount(creds);
        portfolioUpdate = {
          remainingSlots: (ctx.maxOpenPositions ?? 5) - currentOpenCount,
          remainingBuyingPower: parseFloat(postAccount.buying_power),
          openPositionCount: currentOpenCount,
        };
      } catch { /* non-fatal */ }

      const msg = err instanceof Error ? err.message : "manage_position failed";
      console.error(`[tool] manage_position FAILED for ${ticker} (${args.action}): ${msg}`);
      return {
        summary: `manage_position failed: ${ticker}`,
        data: {
          success: false, ticker, action: args.action, status: "FAILED" as const,
          message: msg,
          ...(portfolioUpdate ? { portfolioUpdate } : {}),
          tickers: [{ ticker, tag: "Failed", summary: msg, actionIcon: "failed" }],
        },
        sources: [],
      };
    }
  },
});
