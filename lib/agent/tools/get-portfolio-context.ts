/**
 * get_portfolio_context — returns live situational awareness of the analyst's
 * entire portfolio. Called at the start of Stage 2 (holdings review) to give
 * the agent real-time P&L, days held, peak price, and original thesis context.
 *
 * The system prompt already has a static portfolio table injected, but this
 * tool provides:
 *   - Live prices (not snapshot from run start)
 *   - Peak price and distance from peak (for trailing stop decisions)
 *   - Original thesis reasoning per position
 *   - Capital summary (slots, buying power, utilization)
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import { getLatestPrices, getAccount } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";

interface PositionDetail {
  positionId: string;
  symbol: string;
  direction: string;
  qty: number;
  initialQty: number;
  avgCost: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  daysHeld: number;
  targetPrice: number | null;
  stopLoss: number | null;
  exitStrategy: string | null;
  trailPct: number | null;
  peakPrice: number | null;
  distanceFromPeak: number | null;
  thesis: { id: string; reasoning: string; confidence: number; signalTypes: string[]; status: string } | null;
}

interface CapitalSummary {
  totalEquity: number;
  buyingPower: number;
  deployedCapital: number;
  deployedPct: number;
  openPositionCount: number;
  maxPositions: number;
  slotsRemaining: number;
}

type PortfolioContextData = {
  positions: PositionDetail[];
  capitalSummary: CapitalSummary | null;
  summaryLines: string[];
  tickers: { ticker: string; tag: string; summary: string }[];
};

export const getPortfolioContext = defineTool({
  description:
    "Returns live portfolio context: all open positions with current P&L, " +
    "days held, distance from peak, exit levels, and the original thesis reasoning. " +
    "Call this at the start of your holdings review to get real-time data before making management decisions.",
  schema: z.object({
    include_thesis: z
      .boolean()
      .default(true)
      .describe("Whether to include the original thesis reasoning for each position"),
  }),
  ui: "tool-ui" as const,

  progressLabel: () => "Checking live portfolio P&L and exit levels",

  execute: async (args, ctx) => {
    const analystId = ctx.analystId;
    if (!analystId) {
      return {
        summary: "No analyst context — portfolio context unavailable",
        data: { positions: [] as PositionDetail[], capitalSummary: null, summaryLines: [], tickers: [] } satisfies PortfolioContextData,
        sources: [],
      };
    }

    const creds = ctx.alpacaCreds ?? await resolveAlpacaCredentials(ctx.userId) ?? undefined;

    // Load all open positions for this analyst
    const openPositions = await prisma.position.findMany({
      where: { analystId, status: "OPEN" },
      orderBy: { openedAt: "asc" },
    });

    if (openPositions.length === 0) {
      let capitalSummary = null;
      try {
        const account = await getAccount(creds);
        capitalSummary = {
          totalEquity: parseFloat(account.equity),
          buyingPower: parseFloat(account.buying_power),
          deployedCapital: 0,
          deployedPct: 0,
          openPositionCount: 0,
          maxPositions: ctx.maxOpenPositions ?? 5,
          slotsRemaining: ctx.maxOpenPositions ?? 5,
        };
      } catch { /* non-fatal */ }

      return {
        summary: "No open positions",
        data: { positions: [] as PositionDetail[], capitalSummary, summaryLines: [], tickers: [] } satisfies PortfolioContextData,
        sources: [],
      };
    }

    // Fetch live prices
    const symbols = openPositions.map((p) => p.symbol);
    let prices: Record<string, number> = {};
    try {
      prices = await getLatestPrices(symbols, creds);
    } catch { /* use avgCost as fallback */ }

    // Load theses if requested
    const thesisMap = new Map<string, { id: string; reasoning: string; confidence: number; signalTypes: string[]; status: string } | null>();
    if (args.include_thesis) {
      for (const pos of openPositions) {
        try {
          const thesis = await prisma.thesis.findFirst({
            where: {
              ticker: pos.symbol,
              status: "ACTIVE",
              researchRun: { agentConfigId: analystId },
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              reasoningSummary: true,
              confidenceScore: true,
              signalTypes: true,
              status: true,
            },
          });
          thesisMap.set(pos.id, thesis
            ? {
                id: thesis.id,
                reasoning: thesis.reasoningSummary,
                confidence: thesis.confidenceScore,
                signalTypes: thesis.signalTypes,
                status: thesis.status,
              }
            : null);
        } catch { thesisMap.set(pos.id, null); }
      }
    }

    // Build enriched position objects
    const now = Date.now();
    const positionDetails: PositionDetail[] = openPositions.map((pos) => {
      const currentPrice = prices[pos.symbol] ?? pos.avgCost;
      const isLong = pos.direction === "LONG";
      const unrealizedPnl = isLong
        ? (currentPrice - pos.avgCost) * pos.quantity
        : (pos.avgCost - currentPrice) * pos.quantity;
      const unrealizedPnlPct = pos.avgCost > 0
        ? (isLong
            ? ((currentPrice - pos.avgCost) / pos.avgCost)
            : ((pos.avgCost - currentPrice) / pos.avgCost)) * 100
        : 0;
      const daysHeld = Math.max(0, Math.floor((now - new Date(pos.openedAt).getTime()) / 86_400_000));

      // Distance from peak (for trailing stop context)
      let distanceFromPeak: number | null = null;
      if (pos.peakPrice) {
        distanceFromPeak = isLong
          ? ((currentPrice - pos.peakPrice) / pos.peakPrice) * 100
          : ((pos.peakPrice - currentPrice) / pos.peakPrice) * 100;
      }

      return {
        positionId: pos.id,
        symbol: pos.symbol,
        direction: pos.direction,
        qty: pos.quantity,
        initialQty: pos.initialQty ?? pos.quantity,
        avgCost: pos.avgCost,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPct: Math.round(unrealizedPnlPct * 100) / 100,
        daysHeld,
        targetPrice: pos.targetPrice ?? null,
        stopLoss: pos.stopLoss ?? null,
        exitStrategy: pos.exitStrategy,
        trailPct: pos.trailingStopPct ?? null,
        peakPrice: pos.peakPrice ?? null,
        distanceFromPeak: distanceFromPeak !== null ? Math.round(distanceFromPeak * 100) / 100 : null,
        thesis: thesisMap.get(pos.id) ?? null,
      };
    });

    // Capital summary from Alpaca
    let capitalSummary = null;
    try {
      const account = await getAccount(creds);
      const deployedCapital = positionDetails.reduce((sum, p) => sum + p.avgCost * p.qty, 0);
      const totalEquity = parseFloat(account.equity);
      capitalSummary = {
        totalEquity,
        buyingPower: parseFloat(account.buying_power),
        deployedCapital,
        deployedPct: totalEquity > 0 ? Math.round((deployedCapital / totalEquity) * 100) : 0,
        openPositionCount: openPositions.length,
        maxPositions: ctx.maxOpenPositions ?? 5,
        slotsRemaining: (ctx.maxOpenPositions ?? 5) - openPositions.length,
      };
    } catch { /* non-fatal */ }

    // Build summary text for the agent to read
    const summaryLines = positionDetails.map((p) => {
      const pnlSign = p.unrealizedPnlPct >= 0 ? "+" : "";
      const peakStr = p.distanceFromPeak !== null ? ` | ${p.distanceFromPeak >= 0 ? "+" : ""}${p.distanceFromPeak}% from peak` : "";
      return `${p.symbol} ${p.direction} ${p.qty}sh @ $${p.avgCost.toFixed(2)} | now $${p.currentPrice.toFixed(2)} (${pnlSign}${p.unrealizedPnlPct}%) | ${p.daysHeld}d held${peakStr}`;
    });

    // Ticker rows for UI rendering — portfolio data, not stock data
    const tickers = positionDetails.map((p) => {
      const pnlSign = p.unrealizedPnlPct >= 0 ? "+" : "";
      const peakStr = p.distanceFromPeak !== null ? ` | ${p.distanceFromPeak >= 0 ? "+" : ""}${p.distanceFromPeak}% from peak` : "";
      return {
        ticker: p.symbol,
        tag: p.direction,
        summary: `$${p.currentPrice.toFixed(2)} (${pnlSign}${p.unrealizedPnlPct}%) | ${p.qty}sh @ $${p.avgCost.toFixed(2)} | ${p.daysHeld}d held${peakStr}`,
      };
    });

    return {
      summary: `Portfolio: ${openPositions.length} open position${openPositions.length !== 1 ? "s" : ""}${capitalSummary ? ` | ${capitalSummary.deployedPct}% deployed | $${capitalSummary.buyingPower.toFixed(0)} buying power` : ""}`,
      data: {
        positions: positionDetails,
        capitalSummary,
        summaryLines,
        tickers,
      },
      sources: [],
    };
  },
});
