/**
 * place_trade — migrated to defineTool().
 *
 * Places a paper trade on Alpaca and creates Position + Order + PositionEvent
 * + TradeDecision + RunEvent in a single DB transaction.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import { placeMarketOrder, getOrder, getLatestPrice, getAccount } from "@/lib/alpaca";
import { isExcluded } from "@/lib/agent/universe";

type TransactionClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export const placeTrade = defineTool({
  description:
    "Place a paper trade on Alpaca. The trade will be executed immediately. Requires thesis_id from record_thesis. Will fail if any analyst already holds an open position in this ticker.",
  schema: z.object({
    ticker: z.string(),
    company_name: z.string().optional().describe("Company name from get_stock_data"),
    exchange: z.string().optional().describe("Exchange from get_stock_data, e.g. NASDAQ"),
    direction: z.enum(["LONG", "SHORT"]),
    entry_price: z.number(),
    target_price: z.number(),
    stop_loss: z.number(),
    notional: z.number().optional().describe("Dollar amount to invest (e.g. 5000 for $5,000). Preferred over shares — just pass your position size budget directly."),
    shares: z.number().optional().describe("Number of shares. Only use if you need a specific share count; prefer notional instead."),
    thesis_id: z.string().describe("REQUIRED — the thesis_id returned by record_thesis. Every trade must link to a thesis."),
  }),
  ui: "tool-ui" as const,
  groupId: "Executing",

  progressLabel: (args) => {
    const t = args.ticker.toUpperCase();
    const verb = args.direction === "LONG" ? "Buying" : "Shorting";
    const size = args.notional
      ? ` $${Math.round(args.notional).toLocaleString()}`
      : args.shares
        ? ` ${args.shares} shares of`
        : "";
    return `${verb}${size} ${t}`;
  },

  execute: async (args, ctx) => {
    // Normalize ticker to uppercase — model sometimes passes lowercase/mixed case,
    // which bypasses the duplicate check and hits Alpaca with a 422.
    const ticker = args.ticker.toUpperCase().trim();
    try {
      // 0a. Universe exclusion check — hard reject
      // exclusionList is the hard block dimension of Universe. The analyst's
      // system prompt already narrates Universe but we don't trust the model
      // to always respect it — this is the backstop.
      if (isExcluded(ticker, { exclusionList: ctx.exclusionList })) {
        const blockedMsg = `$${ticker} is on this analyst's exclusion list — cannot trade.`;
        return {
          summary: `Trade blocked: $${ticker} — excluded`,
          data: {
            success: false,
            ticker,
            status: "FAILED" as const,
            direction: args.direction,
            message: blockedMsg,
            tickers: [{ ticker, tag: "Failed", summary: blockedMsg, actionIcon: "failed" }],
          },
          sources: [],
        };
      }

      // 0. Check for existing open position (scoped to this analyst only)
      const existingPosition = await prisma.position.findFirst({
        where: { userId: ctx.userId, analystId: ctx.analystId ?? undefined, symbol: ticker, status: "OPEN" },
        select: { id: true, symbol: true },
      });

      if (existingPosition) {
        const blockedMsg = `Already holding an open position in ${ticker}. Cannot open duplicate positions for this analyst.`;
        return {
          summary: `Trade blocked: $${ticker} — duplicate position`,
          data: {
            success: false,
            ticker,
            status: "FAILED" as const,
            direction: args.direction,
            message: blockedMsg,
            tickers: [{ ticker, tag: "Failed", summary: blockedMsg, actionIcon: "failed" }],
          },
          sources: [],
        };
      }

      // 0b. Analyst config guardrails — minConfidence, maxOpenPositions,
      // maxPositionSize. Previously these were advisory (passed to the
      // prompt) and the model could ignore them. Now they're hard gates:
      // a violation returns a FAILED trade result. This protects the
      // paper book from the model overriding its own stated rules.

      // ── Guardrail 1: thesis confidence ≥ minConfidence ─────────────
      if (ctx.minConfidence != null) {
        const thesis = await prisma.thesis.findUnique({
          where: { id: args.thesis_id },
          select: { confidenceScore: true, direction: true },
        });
        if (thesis && thesis.confidenceScore < ctx.minConfidence) {
          const blockedMsg = `Trade blocked: thesis confidence ${thesis.confidenceScore}% is below this analyst's minimum (${ctx.minConfidence}%). Raise confidence or skip the trade.`;
          return {
            summary: `Trade blocked: $${ticker} — below min confidence`,
            data: {
              success: false,
              ticker,
              status: "FAILED" as const,
              direction: args.direction,
              message: blockedMsg,
              tickers: [{ ticker, tag: "Failed", summary: blockedMsg, actionIcon: "failed" }],
            },
            sources: [],
          };
        }
      }

      // ── Guardrail 2: open position count < maxOpenPositions ────────
      if (ctx.maxOpenPositions != null && ctx.analystId) {
        const openCount = await prisma.position.count({
          where: {
            analystId: ctx.analystId,
            status: "OPEN",
          },
        });
        if (openCount >= ctx.maxOpenPositions) {
          const blockedMsg = `Trade blocked: this analyst already has ${openCount} open position${openCount !== 1 ? "s" : ""}, at its ${ctx.maxOpenPositions}-slot cap. Close something first.`;
          return {
            summary: `Trade blocked: $${ticker} — at max open positions`,
            data: {
              success: false,
              ticker,
              status: "FAILED" as const,
              direction: args.direction,
              message: blockedMsg,
              tickers: [{ ticker, tag: "Failed", summary: blockedMsg, actionIcon: "failed" }],
            },
            sources: [],
          };
        }
      }

      // ── Guardrail 3: requested notional ≤ maxPositionSize ──────────
      // Only checks when the model explicitly sized the trade (notional
      // or shares). If neither is set, the fallback path below uses
      // maxPositionSize as the budget so no violation is possible.
      if (ctx.maxPositionSize != null) {
        const requestedNotional =
          args.notional != null && args.notional > 0
            ? args.notional
            : args.shares != null && args.shares > 0
              ? args.shares * args.entry_price
              : null;
        if (requestedNotional != null && requestedNotional > ctx.maxPositionSize) {
          const blockedMsg = `Trade blocked: requested $${Math.round(requestedNotional).toLocaleString()} exceeds this analyst's max position size ($${ctx.maxPositionSize.toLocaleString()}). Scale it down.`;
          return {
            summary: `Trade blocked: $${ticker} — exceeds max position size`,
            data: {
              success: false,
              ticker,
              status: "FAILED" as const,
              direction: args.direction,
              message: blockedMsg,
              tickers: [{ ticker, tag: "Failed", summary: blockedMsg, actionIcon: "failed" }],
            },
            sources: [],
          };
        }
      }

      // 1. Resolve qty — prefer notional (dollar amount), fall back to shares
      // Server-side calculation removes a cognitive step from the model.
      let resolvedShares: number | undefined;
      let resolvedNotional: number | undefined;
      if (args.notional != null && args.notional > 0) {
        resolvedNotional = args.notional;
        // Compute shares for DB record (approximate — actual fill may differ)
        resolvedShares = Math.max(1, Math.floor(args.notional / args.entry_price));
      } else if (args.shares != null && args.shares > 0) {
        resolvedShares = args.shares;
      } else {
        // Final fallback: use max position size from context
        const budget = ctx.maxPositionSize ?? 5000;
        resolvedNotional = budget;
        resolvedShares = Math.max(1, Math.floor(budget / args.entry_price));
      }

      // 2. Place Alpaca paper order
      const alpacaOrder = await placeMarketOrder({
        symbol: ticker,
        ...(resolvedNotional != null ? { notional: resolvedNotional } : { qty: resolvedShares }),
        side: args.direction === "LONG" ? "buy" : "sell",
      }, ctx.alpacaCreds);

      // Recalculate resolvedShares from notional fill if Alpaca returns qty
      // (paper trading fills notional orders with fractional shares sometimes)
      // 3. Wait for fill (max 5s)
      let fillPrice = args.entry_price;
      let didFill = false;
      let filledAt: Date | null = null;
      const placedAt = new Date();
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const order = await getOrder(alpacaOrder.id, ctx.alpacaCreds);
        if (order.status === "filled" && order.filled_avg_price) {
          fillPrice = parseFloat(order.filled_avg_price);
          didFill = true;
          filledAt = order.filled_at ? new Date(order.filled_at) : new Date();
          break;
        }
        if (["cancelled", "expired", "rejected"].includes(order.status)) {
          throw new Error(`Alpaca order ${order.status}`);
        }
        await new Promise((r) => setTimeout(r, 1_000));
      }
      if (!didFill) {
        try { fillPrice = await getLatestPrice(args.ticker, ctx.alpacaCreds); } catch { /* keep entry_price */ }
        // Recompute shares from notional using actual fill price
        if (resolvedNotional != null) {
          resolvedShares = Math.max(1, Math.floor(resolvedNotional / fillPrice));
        }
      }

      // 4. Create Position + Order + PositionEvent + TradeDecision + RunEvent
      const analystId = ctx.analystId;
      if (!analystId) {
        throw new Error("Cannot place trade without an analyst ID. Ensure the run is linked to an analyst.");
      }

      const finalShares = resolvedShares ?? 1;

      const { position, order } = await prisma.$transaction(async (tx: TransactionClient) => {
        const pos = await tx.position.create({
          data: {
            analystId,
            userId: ctx.userId,
            symbol: ticker,
            direction: args.direction,
            status: "OPEN",
            quantity: finalShares,
            avgCost: fillPrice,
            targetPrice: args.target_price,
            stopLoss: args.stop_loss,
            exitStrategy: "PRICE_TARGET",
            initialQty: finalShares,
          },
        });

        const ord = await tx.order.create({
          data: {
            positionId: pos.id,
            userId: ctx.userId,
            symbol: ticker,
            side: args.direction === "LONG" ? "BUY" : "SELL",
            orderType: "MARKET",
            quantity: finalShares,
            status: didFill ? "FILLED" : "PENDING",
            filledPrice: didFill ? fillPrice : null,
            filledQty: didFill ? finalShares : null,
            filledAt: didFill ? (filledAt ?? new Date()) : null,
            alpacaOrderId: alpacaOrder.id,
            createdAt: placedAt,
          },
        });

        await tx.positionEvent.create({
          data: {
            positionId: pos.id,
            eventType: "OPENED",
            description: `${args.direction} ${finalShares} shares of ${ticker} at $${fillPrice.toFixed(2)}`,
            priceAt: fillPrice,
          },
        });

        await tx.tradeDecision.create({
          data: {
            runId: ctx.runId,
            analystId,
            userId: ctx.userId,
            symbol: ticker,
            decision: "INITIATE",
            reasoning: `${args.direction} ${finalShares} shares at $${fillPrice.toFixed(2)} (target: $${args.target_price.toFixed(2)}, stop: $${args.stop_loss.toFixed(2)})`,
            thesisId: args.thesis_id,
            positionId: pos.id,
            orderId: ord.id,
          },
        });

        if (ctx.runId) {
          await tx.runEvent.create({
            data: {
              runId: ctx.runId,
              type: "trade_placed",
              title: `Trade placed: ${args.direction} ${ticker}`,
              message: `${args.direction} ${finalShares} shares of ${ticker} at $${fillPrice.toFixed(2)}`,
              payload: {
                ticker,
                direction: args.direction,
                entry: fillPrice,
                target_price: args.target_price,
                stop_loss: args.stop_loss,
                shares: finalShares,
                position_id: pos.id,
                order_id: ord.id,
              } as object,
            },
          });
        }

        return { position: pos, order: ord };
      });

      // Graduate watchlist item (non-fatal)
      try {
        const watchlistItem = await prisma.analystWatchlistItem.findFirst({
          where: { analystId, symbol: ticker, status: "ACTIVE" },
        });
        if (watchlistItem) {
          await prisma.analystWatchlistItem.update({
            where: { id: watchlistItem.id },
            data: { status: "GRADUATED", removeReason: "Promoted to active position", removedAt: new Date(), promotedToPositionId: position.id },
          });
          const activeItems = await prisma.analystWatchlistItem.findMany({
            where: { analystId, status: "ACTIVE" },
            select: { symbol: true },
          });
          await prisma.agentConfig.update({
            where: { id: analystId },
            data: { watchlist: activeItems.map((i) => i.symbol) },
          });
        }
      } catch (err) {
        console.warn(`[tool] place_trade watchlist graduation failed:`, err instanceof Error ? err.message : err);
      }

      // Fetch post-trade portfolio context (non-fatal)
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
        console.warn("[tool] place_trade portfolio update fetch failed:", portfolioErr);
      }

      const message = didFill
        ? `${args.direction} ${finalShares} shares of ${ticker} filled at $${fillPrice.toFixed(2)}`
        : `${args.direction} ${finalShares} shares of ${ticker} submitted to Alpaca — awaiting fill (current price $${fillPrice.toFixed(2)})`;

      const tickerTag = args.direction === "LONG" ? "Long" : "Short";
      const tickerSummary = didFill
        ? `Placed ${args.direction} ${finalShares} shares @ $${fillPrice.toFixed(2)} — target $${args.target_price.toFixed(2)}, stop $${args.stop_loss.toFixed(2)}`
        : `Order submitted (pending): ${args.direction} ${finalShares} shares @ $${fillPrice.toFixed(2)}`;

      return {
        summary: didFill
          ? `Placed order: ${args.direction} ${finalShares} $${ticker} @ $${fillPrice.toFixed(2)}`
          : `Order submitted (pending): ${args.direction} ${finalShares} $${ticker}`,
        data: {
          success: true,
          ticker,
          status: didFill ? ("FILLED" as const) : ("PENDING" as const),
          fillStatus: didFill ? ("FILLED" as const) : ("PENDING" as const),
          direction: args.direction,
          shares: finalShares,
          entryPrice: fillPrice,
          targetPrice: args.target_price,
          stopLoss: args.stop_loss,
          positionId: position.id,
          orderId: order.id,
          alpacaOrderId: alpacaOrder.id,
          placedAt: placedAt.toISOString(),
          filledAt: filledAt ? filledAt.toISOString() : null,
          message,
          ...(portfolioUpdate ? { portfolioUpdate } : {}),
          tickers: [{ ticker, tag: tickerTag, summary: tickerSummary, actionIcon: "buy" }],
        },
        sources: [{ provider: "Alpaca", title: `Trade ${ticker}` }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Trade placement failed";
      console.error(`[tool] place_trade FAILED for ${ticker}: ${msg}`);
      return {
        summary: `Trade failed: $${ticker}`,
        data: {
          success: false,
          ticker,
          status: "FAILED" as const,
          direction: args.direction,
          message: msg,
          tickers: [{ ticker, tag: "Failed", summary: msg, actionIcon: "failed" }],
        },
        sources: [],
      };
    }
  },
});
