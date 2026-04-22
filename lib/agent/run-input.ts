/**
 * Run Input Model — consolidates all context loading for an agent run.
 *
 * Replaces the scattered history-block construction in:
 *   - app/api/research/agent/route.ts
 *   - lib/inngest/functions/morning-research.ts
 *
 * Zero schema changes — reads existing tables only.
 *
 * RESILIENCE: Each section has its own try/catch so one failure
 * (e.g., Alpaca down) does NOT kill watchlist/theses/briefs.
 */

import { prisma } from "@/lib/prisma";
import { getLatestPrices, getAccount, type AlpacaCredentials } from "@/lib/alpaca";
import { parseIntelligencePolicy, type IntelligencePolicy } from "@/lib/intelligence/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RunInput {
  analyst: {
    name: string;
    mandate: string | null;
    voice: string | null;
    directionBias: string;
    holdDurations: string[];
    sectors: string[];
    // ── Universe (B1) ────────────────────────────────────────────────────
    industries: string[];
    themes: string[];
    marketCapMin: number | null; // dollars; null = no lower bound
    marketCapMax: number | null; // dollars; null = no upper bound
    exclusionList: string[];
    minConfidence: number;
    maxPositionSize: number;
    maxOpenPositions: number;
  };
  portfolio: {
    cash: number;
    buyingPower: number;
    portfolioValue: number;
    positions: Array<{
      symbol: string;
      direction: string;
      quantity: number;
      avgCost: number;
      currentPrice: number;
      unrealizedPnl: number;
      unrealizedPnlPct: number;
      targetPrice: number | null;
      stopLoss: number | null;
      exitStrategy: string;
      daysHeld: number;
      activeThesisId: string | null;
      activeThesisSummary: string | null;
    }>;
    exposure: {
      long: number;
      short: number;
      net: number;
      utilizationPct: number;
    };
  };
  watchlist: Array<{
    symbol: string;
    reason: string;
    priority: string;
    thesisDirection: string | null;
    targetPrice: number | null;
    stopPrice: number | null;
    conviction: number | null;
    catalyst: string | null;
    daysOnList: number;
    lastReviewedDaysAgo: number;
  }>;
  activeTheses: Array<{
    id: string;
    ticker: string;
    direction: string;
    confidence: number;
    reasoningSummary: string;
    entryPrice: number | null;
    targetPrice: number | null;
    stopLoss: number | null;
    createdAt: string;
    runId: string;
    status: string;
  }>;
  priorBrief: {
    date: string;
    narrative: string;
    strategyNotes: string | null;
    marketPosture: string | null;
    watchTomorrow: Array<{ symbol: string; trigger: string; suggestedAction: string; priority?: string }> | null;
    unresolvedItems: Array<{ item: string; impact: string; affectedPositions?: string[] }> | null;
    selfCorrections: Array<{ observation: string; adjustment: string }> | null;
  } | null;
  performance: {
    winRate: number | null;
    totalTrades: number;
    calibrationNote: string | null;
    // Per-signal win rates (top signals by count)
    signalAccuracy: Array<{ signal: string; winRate: number | null; count: number }> | null;
    // Confidence calibration: are high-confidence theses actually winning more?
    calibrationBuckets: Array<{ label: string; expectedWinRate: number; actualWinRate: number | null; count: number }> | null;
    // LONG vs SHORT directional performance
    directionStats: { long: { winRate: number | null; count: number }; short: { winRate: number | null; count: number } } | null;
  } | null;
  recentClosedTrades: Array<{
    symbol: string;
    direction: string;
    outcome: string | null;
    pnlPct: number;
    closeReason: string | null;
    daysHeld: number;
    lesson: string | null;
  }>;
  // Positions flagged by the price monitor in the last 24h — must be reviewed
  priorityReviews: Array<{
    symbol: string;
    positionId: string;
    alertType: "NEAR_TARGET" | "NEAR_STOP";
    triggeredAt: string;
    targetOrStop: number | null;
    reason: string;
  }> | null;
  intelligencePolicy: IntelligencePolicy;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export async function buildRunInput(
  analystId: string,
  userId: string,
  alpacaCreds?: AlpacaCredentials,
): Promise<RunInput> {
  // ── Analyst config (REQUIRED — fail hard if missing) ───────────────
  const config = await prisma.agentConfig.findFirst({
    where: { id: analystId, userId },
  });

  if (!config) {
    throw new Error(`AgentConfig not found: analystId=${analystId} userId=${userId}`);
  }

  // ── Each section loads with its own error handling ─────────────────
  // One failure (e.g., Alpaca API down) does NOT kill other sections.

  // 1. Open positions
  let openPositions: Array<{
    id: string; symbol: string; direction: string; quantity: number;
    avgCost: number; targetPrice: number | null; stopLoss: number | null;
    exitStrategy: string; openedAt: Date;
  }> = [];
  try {
    openPositions = await prisma.position.findMany({
      where: { analystId, userId, status: "OPEN" },
      select: {
        id: true, symbol: true, direction: true, quantity: true,
        avgCost: true, targetPrice: true, stopLoss: true,
        exitStrategy: true, openedAt: true,
      },
    });
  } catch (err) {
    console.error("[buildRunInput] FAILED positions:", err);
  }

  // 2. Watchlist (must be loaded before active theses which uses watchSymbols)
  let watchlistItems: Array<{
    symbol: string; reason: string; priority: string;
    thesisDirection: string | null; targetPrice: number | null;
    stopPrice: number | null; conviction: number | null;
    catalyst: string | null; createdAt: Date; lastReviewedAt: Date | null;
  }> = [];
  try {
    watchlistItems = await prisma.analystWatchlistItem.findMany({
      where: { analystId, status: "ACTIVE" },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      select: {
        symbol: true, reason: true, priority: true, thesisDirection: true,
        targetPrice: true, stopPrice: true, conviction: true, catalyst: true,
        createdAt: true, lastReviewedAt: true,
      },
    });
  } catch (err) {
    console.error("[buildRunInput] FAILED watchlist:", err);
  }

  // 3. Account balances (Alpaca — may be down)
  let cash = 0;
  let buyingPower = 0;
  let portfolioValue = 0;
  try {
    const account = await getAccount(alpacaCreds);
    cash = parseFloat(account.cash);
    buyingPower = parseFloat(account.buying_power);
    portfolioValue = parseFloat(account.portfolio_value);
  } catch (err) {
    console.error("[buildRunInput] FAILED account (Alpaca):", err);
  }

  // 4. Live prices for positions
  const symbols = openPositions.map((p) => p.symbol);
  let livePrices: Record<string, number> = {};
  if (symbols.length > 0) {
    try {
      livePrices = await getLatestPrices(symbols, alpacaCreds);
    } catch (err) {
      console.warn("[buildRunInput] Failed to fetch live prices:", err);
    }
  }

  // Build position array with P&L
  const positions = openPositions.map((p) => {
    const currentPrice = livePrices[p.symbol] ?? Number(p.avgCost);
    const avgCost = Number(p.avgCost);
    const unrealizedPnl =
      (currentPrice - avgCost) *
      p.quantity *
      (p.direction === "SHORT" ? -1 : 1);
    const unrealizedPnlPct =
      avgCost > 0 ? (unrealizedPnl / (avgCost * p.quantity)) * 100 : 0;
    const daysHeld = Math.floor(
      (Date.now() - p.openedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      symbol: p.symbol,
      direction: p.direction,
      quantity: p.quantity,
      avgCost,
      currentPrice,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      unrealizedPnlPct: Math.round(unrealizedPnlPct * 100) / 100,
      targetPrice: p.targetPrice ? Number(p.targetPrice) : null,
      stopLoss: p.stopLoss ? Number(p.stopLoss) : null,
      exitStrategy: p.exitStrategy,
      daysHeld,
      activeThesisId: null as string | null,
      activeThesisSummary: null as string | null,
    };
  });

  // Calculate exposure
  const longExposure = positions
    .filter((p) => p.direction === "LONG")
    .reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
  const shortExposure = positions
    .filter((p) => p.direction === "SHORT")
    .reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);

  const totalExposure = longExposure + shortExposure;
  const utilizationPct =
    portfolioValue > 0
      ? Math.round((totalExposure / portfolioValue) * 100 * 100) / 100
      : 0;

  // 5. Active theses (depends on positions + watchlist symbols)
  const openSymbols = openPositions.map((p) => p.symbol);
  const watchSymbols = watchlistItems.map((w) => w.symbol);
  const allRelevantSymbols = [...new Set([...openSymbols, ...watchSymbols])];

  let activeTheses: Array<{
    id: string; ticker: string; direction: string; confidenceScore: number;
    reasoningSummary: string; entryPrice: number | null; targetPrice: number | null;
    stopLoss: number | null; createdAt: Date; researchRunId: string; status: string;
  }> = [];

  if (allRelevantSymbols.length > 0) {
    try {
      activeTheses = await prisma.thesis.findMany({
        where: {
          status: "ACTIVE",
          ticker: { in: allRelevantSymbols },
          researchRun: { agentConfigId: analystId },
        },
        orderBy: { createdAt: "desc" },
        distinct: ["ticker"],
        select: {
          id: true, ticker: true, direction: true, confidenceScore: true,
          reasoningSummary: true, entryPrice: true, targetPrice: true,
          stopLoss: true, createdAt: true, researchRunId: true, status: true,
        },
      });
    } catch (err) {
      console.error("[buildRunInput] FAILED active theses:", err);
    }
  }

  // Link active theses to positions
  for (const pos of positions) {
    const thesis = activeTheses.find((t) => t.ticker === pos.symbol);
    if (thesis) {
      pos.activeThesisId = thesis.id;
      pos.activeThesisSummary = thesis.reasoningSummary.slice(0, 200);
    }
  }

  const now = Date.now();
  const watchlist = watchlistItems.map((w) => ({
    symbol: w.symbol,
    reason: w.reason,
    priority: w.priority,
    thesisDirection: w.thesisDirection,
    targetPrice: w.targetPrice,
    stopPrice: w.stopPrice,
    conviction: w.conviction,
    catalyst: w.catalyst,
    daysOnList: Math.floor(
      (now - w.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    ),
    lastReviewedDaysAgo: w.lastReviewedAt
      ? Math.floor(
          (now - w.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24),
        )
      : 999,
  }));

  // 6. Prior brief
  let latestBriefing: {
    narrative: string; strategyNotes: string | null; marketPosture: string | null;
    watchTomorrow: unknown; unresolvedItems: unknown; selfCorrections: unknown;
    createdAt: Date;
  } | null = null;
  try {
    latestBriefing = await prisma.analystBriefing.findFirst({
      where: { analystId },
      orderBy: { createdAt: "desc" },
      select: {
        narrative: true, strategyNotes: true, marketPosture: true,
        watchTomorrow: true, unresolvedItems: true, selfCorrections: true,
        createdAt: true,
      },
    });
  } catch (err) {
    console.error("[buildRunInput] FAILED brief:", err);
  }

  const priorBrief = latestBriefing
    ? {
        date: latestBriefing.createdAt.toISOString().slice(0, 10),
        narrative: latestBriefing.narrative,
        strategyNotes: latestBriefing.strategyNotes,
        marketPosture: latestBriefing.marketPosture ?? null,
        watchTomorrow: (latestBriefing.watchTomorrow as Array<{ symbol: string; trigger: string; suggestedAction: string; priority?: string }>) ?? null,
        unresolvedItems: (latestBriefing.unresolvedItems as Array<{ item: string; impact: string; affectedPositions?: string[] }>) ?? null,
        selfCorrections: (latestBriefing.selfCorrections as Array<{ observation: string; adjustment: string }>) ?? null,
      }
    : null;

  // 7. Performance — load rich calibration data from the latest AccuracyReport
  let latestAccuracy: {
    winRate: number | null; tradesAnalyzed: number | null;
    narrativeSummary: string | null;
    signalAccuracy: unknown;
    calibrationData: unknown;
    directionStats: unknown;
  } | null = null;
  try {
    latestAccuracy = await prisma.accuracyReport.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        winRate: true, tradesAnalyzed: true, narrativeSummary: true,
        signalAccuracy: true, calibrationData: true, directionStats: true,
      },
    });
  } catch (err) {
    console.error("[buildRunInput] FAILED performance:", err);
  }

  // Parse signal accuracy — top 8 by count
  type RawSignal = { signal: string; winRate: number | null; count: number };
  type RawBucket = { label: string; expectedWinRate: number; winRate: number | null; count: number };
  type RawDirStats = Record<string, { winRate: number | null; count: number }>;

  const parsedSignals: Array<{ signal: string; winRate: number | null; count: number }> | null = (() => {
    try {
      const raw = latestAccuracy?.signalAccuracy;
      if (!Array.isArray(raw) || raw.length === 0) return null;
      return (raw as RawSignal[])
        .filter((s) => s.count > 0)
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, 8)
        .map((s) => ({ signal: s.signal, winRate: s.winRate, count: s.count }));
    } catch { return null; }
  })();

  const parsedBuckets: Array<{ label: string; expectedWinRate: number; actualWinRate: number | null; count: number }> | null = (() => {
    try {
      const raw = latestAccuracy?.calibrationData;
      if (!Array.isArray(raw) || raw.length === 0) return null;
      return (raw as RawBucket[])
        .filter((b) => b.count > 0)
        .map((b) => ({ label: b.label, expectedWinRate: b.expectedWinRate, actualWinRate: b.winRate, count: b.count }));
    } catch { return null; }
  })();

  const parsedDirStats: { long: { winRate: number | null; count: number }; short: { winRate: number | null; count: number } } | null = (() => {
    try {
      const raw = latestAccuracy?.directionStats as RawDirStats | null;
      if (!raw) return null;
      const long = raw["LONG"] ?? raw["long"];
      const short = raw["SHORT"] ?? raw["short"];
      if (!long && !short) return null;
      return {
        long: { winRate: long?.winRate ?? null, count: long?.count ?? 0 },
        short: { winRate: short?.winRate ?? null, count: short?.count ?? 0 },
      };
    } catch { return null; }
  })();

  const performance = latestAccuracy
    ? {
        winRate: latestAccuracy.winRate ? Number(latestAccuracy.winRate) : null,
        totalTrades: latestAccuracy.tradesAnalyzed ?? 0,
        calibrationNote: latestAccuracy.narrativeSummary
          ? String(latestAccuracy.narrativeSummary).slice(0, 400)
          : null,
        signalAccuracy: parsedSignals,
        calibrationBuckets: parsedBuckets,
        directionStats: parsedDirStats,
      }
    : null;

  // 8. Recent closed trades
  let recentTrades: Array<{
    symbol: string; direction: string; outcome: string | null;
    avgCost: number; closePrice: number | null; closeReason: string | null;
    closedAt: Date | null; openedAt: Date; realizedPnl: number | null;
    agentEvaluation: string | null;
  }> = [];
  try {
    recentTrades = await prisma.position.findMany({
      where: { userId, status: "CLOSED", analystId },
      orderBy: { closedAt: "desc" },
      take: 10,
      select: {
        symbol: true, direction: true, outcome: true, avgCost: true,
        closePrice: true, closeReason: true, closedAt: true, openedAt: true,
        realizedPnl: true, agentEvaluation: true,
      },
    });
  } catch (err) {
    console.error("[buildRunInput] FAILED closedTrades:", err);
  }

  const recentClosedTrades = recentTrades.map((t) => {
    const avgCost = Number(t.avgCost);
    const pnlPct =
      avgCost > 0 && t.realizedPnl != null
        ? (t.realizedPnl / avgCost) * 100
        : 0;
    const daysHeld =
      t.closedAt && t.openedAt
        ? Math.floor(
            (t.closedAt.getTime() - t.openedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;
    return {
      symbol: t.symbol,
      direction: t.direction,
      outcome: t.outcome,
      pnlPct: Math.round(pnlPct * 100) / 100,
      closeReason: t.closeReason,
      daysHeld,
      lesson: t.agentEvaluation
        ? t.agentEvaluation.slice(0, 200)
        : null,
    };
  });

  // 9. Priority reviews — NEAR_TARGET / NEAR_STOP alerts from price monitor (last 24h)
  let priorityReviews: RunInput["priorityReviews"] = null;
  if (openPositions.length > 0) {
    try {
      const positionIds = openPositions.map((p) => p.id);
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const alerts = await prisma.positionManagementAction.findMany({
        where: {
          positionId: { in: positionIds },
          actionType: { in: ["NEAR_TARGET", "NEAR_STOP"] },
          source: "price_monitor",
          createdAt: { gte: cutoff },
        },
        orderBy: { createdAt: "desc" },
        select: {
          positionId: true,
          actionType: true,
          newTargetPrice: true,
          newStopLoss: true,
          reason: true,
          createdAt: true,
          position: { select: { symbol: true } },
        },
      });

      // Deduplicate: one alert per (positionId, alertType) — keep the most recent
      const seen = new Set<string>();
      const deduped = alerts.filter((a) => {
        const key = `${a.positionId}:${a.actionType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (deduped.length > 0) {
        priorityReviews = deduped.map((a) => ({
          symbol: a.position.symbol,
          positionId: a.positionId,
          alertType: a.actionType as "NEAR_TARGET" | "NEAR_STOP",
          triggeredAt: a.createdAt.toISOString(),
          targetOrStop: a.actionType === "NEAR_TARGET" ? (a.newTargetPrice ?? null) : (a.newStopLoss ?? null),
          reason: a.reason,
        }));
      }
    } catch (err) {
      console.error("[buildRunInput] FAILED priorityReviews:", err);
    }
  }

  // 10. Intelligence policy
  const intelligencePolicy = parseIntelligencePolicy(
    (config as Record<string, unknown>).intelligencePolicy
  );

  // ── Structured load summary ────────────────────────────────────────
  console.log(
    `[buildRunInput] LOADED: analyst=${config.name} positions=${positions.length} watchlist=${watchlist.length} theses=${activeTheses.length} hasBrief=${!!priorBrief} hasPerformance=${!!performance} closedTrades=${recentClosedTrades.length} priorityReviews=${priorityReviews?.length ?? 0} cash=$${cash.toFixed(0)} buyingPower=$${buyingPower.toFixed(0)} policy.maxSignals=${intelligencePolicy.maxSignalsPerRun}`,
  );

  return {
    analyst: {
      name: config.name,
      mandate: config.analystPrompt,
      voice: null,
      directionBias: config.directionBias,
      holdDurations: config.holdDurations,
      sectors: config.sectors,
      industries: config.industries,
      themes: config.themes,
      marketCapMin: config.marketCapMin != null ? Number(config.marketCapMin) : null,
      marketCapMax: config.marketCapMax != null ? Number(config.marketCapMax) : null,
      exclusionList: config.exclusionList,
      minConfidence: config.minConfidence,
      maxPositionSize: Number(config.maxPositionSize),
      maxOpenPositions: config.maxOpenPositions,
    },
    portfolio: {
      cash,
      buyingPower,
      portfolioValue,
      positions,
      exposure: {
        long: Math.round(longExposure * 100) / 100,
        short: Math.round(shortExposure * 100) / 100,
        net: Math.round((longExposure - shortExposure) * 100) / 100,
        utilizationPct,
      },
    },
    watchlist,
    activeTheses: activeTheses.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      direction: t.direction,
      confidence: t.confidenceScore,
      reasoningSummary: t.reasoningSummary,
      entryPrice: t.entryPrice,
      targetPrice: t.targetPrice,
      stopLoss: t.stopLoss,
      createdAt: t.createdAt.toISOString(),
      runId: t.researchRunId,
      status: t.status,
    })),
    priorBrief,
    performance,
    recentClosedTrades,
    priorityReviews,
    intelligencePolicy,
  };
}
