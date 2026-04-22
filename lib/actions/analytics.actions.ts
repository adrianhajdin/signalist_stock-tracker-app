"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const STARTING_CAPITAL = 100_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EquityPoint {
  date: string; // "MM-DD"
  value: number;
}

export interface DirectionBreakdown {
  direction: string;
  wins: number;
  losses: number;
}

export interface DurationBreakdown {
  duration: string;
  avgReturn: number;
}

export interface SectorBreakdown {
  sector: string;
  return: number;
}

export interface ConfidencePoint {
  ticker: string;
  confidence: number;
  return: number;
}

export interface SignalAccuracyStat {
  signal: string;
  winRate: number | null;
  count: number;
}

export interface CalibrationBucket {
  label: string;
  expectedWinRate: number;
  actualWinRate: number | null;
  count: number;
}

export interface CalibrationData {
  signalAccuracy: SignalAccuracyStat[];
  calibrationBuckets: CalibrationBucket[];
  directionStats: {
    long: { winRate: number | null; count: number };
    short: { winRate: number | null; count: number };
  } | null;
  narrativeSummary: string | null;
}

export interface GraduationData {
  currentWinRate: number;
  winRateTarget: number;
  currentClosedTrades: number;
  closedTradesRequired: number;
}

export interface AnalyticsStats {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  avgReturnPerTrade: number;
  openTrades: number;
  closedTrades: number;
  totalTrades: number;
  graduation: GraduationData;
}

export interface AnalystStat {
  analystId: string;
  name: string;
  wins: number;
  losses: number;
  trades: number;
  winRate: number;
  totalPnl: number;
  bestTrade: { ticker: string; pnl: number } | null;
  worstTrade: { ticker: string; pnl: number } | null;
}

export interface ResearchRunSummary {
  id: string;
  startedAt: Date;
  analystName: string;
  thesesCount: number;
  tradesPlaced: number;
  closedTrades: number;
  pnl: number;
  wins: number;
  losses: number;
}

export interface AnalyticsData {
  equityCurve: EquityPoint[];
  directionBreakdown: DirectionBreakdown[];
  durationBreakdown: DurationBreakdown[];
  sectorBreakdown: SectorBreakdown[];
  confidenceScatter: ConfidencePoint[];
  stats: AnalyticsStats;
  analystBreakdown: AnalystStat[];
  recentRuns: ResearchRunSummary[];
  calibration: CalibrationData | null;
}

// ─── Helper: equity curve ─────────────────────────────────────────────────────

function buildEquityCurve(
  closedTrades: Array<{ closedAt: Date | null; realizedPnl: number | null }>,
  days = 30
): EquityPoint[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const byDay = new Map<string, number>();

  for (const t of closedTrades) {
    if (!t.closedAt || !t.realizedPnl) continue;
    if (t.closedAt < cutoff) continue;
    const day = t.closedAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + t.realizedPnl);
  }

  let balance = STARTING_CAPITAL;
  const points: EquityPoint[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const iso = date.toISOString().slice(0, 10);
    balance += byDay.get(iso) ?? 0;
    points.push({ date: iso.slice(5), value: balance });
  }
  return points;
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export async function getAnalyticsData(): Promise<AnalyticsData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user?.id;

  // ── Fetch positions, open count, agent config, recent runs, accuracy ─────
  const [closedPositions, openCount, agentConfig, completedRuns, latestAccuracy] = await Promise.all([
    userId
      ? prisma.position.findMany({
          where: { userId, status: "CLOSED" },
          select: {
            direction: true,
            outcome: true,
            realizedPnl: true,
            closedAt: true,
            avgCost: true,
            quantity: true,
            symbol: true,
            analystId: true,
            analyst: { select: { name: true } },
            decisions: {
              take: 1,
              include: {
                thesis: {
                  select: {
                    confidenceScore: true,
                    sector: true,
                    holdDuration: true,
                    ticker: true,
                  },
                },
              },
            },
          },
          orderBy: { closedAt: "asc" },
        })
      : Promise.resolve([]),
    userId
      ? prisma.position.count({ where: { userId, status: "OPEN" } })
      : Promise.resolve(0),
    userId
      ? prisma.agentConfig.findFirst({ where: { userId } })
      : Promise.resolve(null),
    userId
      ? prisma.researchRun.findMany({
          where: { userId, status: "COMPLETE" },
          orderBy: { startedAt: "desc" },
          take: 20,
          select: {
            id: true,
            startedAt: true,
            source: true,
            agentConfig: { select: { name: true } },
            decisions: {
              where: { decision: "BUY" },
              select: {
                position: {
                  select: { outcome: true, realizedPnl: true, status: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    userId
      ? prisma.accuracyReport.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            winRate: true,
            tradesAnalyzed: true,
            narrativeSummary: true,
            signalAccuracy: true,
            calibrationData: true,
            directionStats: true,
          },
        })
      : Promise.resolve(null),
  ]);

  // ── Equity curve ──────────────────────────────────────────────────────────

  const equityCurve = buildEquityCurve(closedPositions);

  // Helper to get thesis from position via TradeDecision
  type ClosedPos = (typeof closedPositions)[number];
  const getThesis = (p: ClosedPos) => p.decisions[0]?.thesis;

  // ── P&L stats ─────────────────────────────────────────────────────────────

  const totalReturn = closedPositions.reduce((s, p) => s + (p.realizedPnl ?? 0), 0);
  const totalReturnPct = (totalReturn / STARTING_CAPITAL) * 100;

  const positionsWithOutcome = closedPositions.filter((p) => p.outcome);
  const wins = positionsWithOutcome.filter((p) => p.outcome === "WIN");
  const winRate = positionsWithOutcome.length > 0 ? (wins.length / positionsWithOutcome.length) * 100 : 0;

  const avgReturnPerTrade =
    closedPositions.length > 0
      ? closedPositions.reduce((s, p) => {
          const cost = p.avgCost * p.quantity;
          return s + (cost > 0 ? ((p.realizedPnl ?? 0) / cost) * 100 : 0);
        }, 0) / closedPositions.length
      : 0;

  // ── Direction breakdown ───────────────────────────────────────────────────

  const dirMap = new Map<string, { wins: number; losses: number }>();
  for (const p of positionsWithOutcome) {
    const key = p.direction;
    const entry = dirMap.get(key) ?? { wins: 0, losses: 0 };
    if (p.outcome === "WIN") entry.wins++;
    else entry.losses++;
    dirMap.set(key, entry);
  }
  const directionBreakdown: DirectionBreakdown[] = ["LONG", "SHORT"]
    .map((d) => ({ direction: d, ...(dirMap.get(d) ?? { wins: 0, losses: 0 }) }));

  // ── Hold duration breakdown ───────────────────────────────────────────────

  const durMap = new Map<string, number[]>();
  for (const p of closedPositions) {
    const dur = getThesis(p)?.holdDuration ?? "SWING";
    const cost = p.avgCost * p.quantity;
    const ret = cost > 0 ? ((p.realizedPnl ?? 0) / cost) * 100 : 0;
    const arr = durMap.get(dur) ?? [];
    arr.push(ret);
    durMap.set(dur, arr);
  }
  const durationBreakdown: DurationBreakdown[] = Array.from(durMap.entries()).map(([duration, rets]) => ({
    duration,
    avgReturn: rets.reduce((s, r) => s + r, 0) / rets.length,
  }));

  // ── Sector breakdown ──────────────────────────────────────────────────────

  const secMap = new Map<string, number[]>();
  for (const p of closedPositions) {
    const sec = getThesis(p)?.sector ?? "Unknown";
    const cost = p.avgCost * p.quantity;
    const ret = cost > 0 ? ((p.realizedPnl ?? 0) / cost) * 100 : 0;
    const arr = secMap.get(sec) ?? [];
    arr.push(ret);
    secMap.set(sec, arr);
  }
  const sectorBreakdown: SectorBreakdown[] = Array.from(secMap.entries())
    .map(([sector, rets]) => ({
      sector,
      return: rets.reduce((s, r) => s + r, 0) / rets.length,
    }))
    .sort((a, b) => b.return - a.return);

  // ── Confidence scatter ────────────────────────────────────────────────────

  const confidenceScatter: ConfidencePoint[] = closedPositions
    .filter((p) => getThesis(p)?.confidenceScore != null)
    .map((p) => {
      const thesis = getThesis(p)!;
      const cost = p.avgCost * p.quantity;
      const ret = cost > 0 ? ((p.realizedPnl ?? 0) / cost) * 100 : 0;
      return {
        ticker: thesis.ticker,
        confidence: thesis.confidenceScore,
        return: ret,
      };
    });

  // ── Graduation progress ───────────────────────────────────────────────────

  const winRateTarget = (agentConfig?.graduationWinRate ?? 0.65) * 100;
  const closedTradesRequired = agentConfig?.graduationMinTrades ?? 50;

  const stats: AnalyticsStats = {
    totalReturn,
    totalReturnPct,
    winRate,
    avgReturnPerTrade,
    openTrades: openCount,
    closedTrades: closedPositions.length,
    totalTrades: openCount + closedPositions.length,
    graduation: {
      currentWinRate: winRate,
      winRateTarget,
      currentClosedTrades: closedPositions.length,
      closedTradesRequired,
    },
  };

  // ── Per-analyst breakdown ─────────────────────────────────────────────────

  interface AnalystAccum {
    name: string; wins: number; losses: number; totalPnl: number;
    bestTrade: { ticker: string; pnl: number } | null;
    worstTrade: { ticker: string; pnl: number } | null;
  }
  const analystMap = new Map<string, AnalystAccum>();

  for (const p of positionsWithOutcome) {
    const analystId = p.analystId ?? "__unassigned__";
    const analystName = p.analyst?.name ?? "Unassigned";
    const acc = analystMap.get(analystId) ?? { name: analystName, wins: 0, losses: 0, totalPnl: 0, bestTrade: null, worstTrade: null };
    if (p.outcome === "WIN") acc.wins++;
    else if (p.outcome === "LOSS") acc.losses++;
    const pnl = p.realizedPnl ?? 0;
    acc.totalPnl += pnl;
    const ticker = p.symbol;
    if (!acc.bestTrade || pnl > acc.bestTrade.pnl) acc.bestTrade = { ticker, pnl };
    if (!acc.worstTrade || pnl < acc.worstTrade.pnl) acc.worstTrade = { ticker, pnl };
    analystMap.set(analystId, acc);
  }

  const analystBreakdown: AnalystStat[] = Array.from(analystMap.entries())
    .map(([analystId, acc]) => ({
      analystId,
      name: acc.name,
      wins: acc.wins,
      losses: acc.losses,
      trades: acc.wins + acc.losses,
      winRate: acc.wins + acc.losses > 0 ? (acc.wins / (acc.wins + acc.losses)) * 100 : 0,
      totalPnl: acc.totalPnl,
      bestTrade: acc.bestTrade,
      worstTrade: acc.worstTrade,
    }))
    .sort((a, b) => b.trades - a.trades);

  // ── Research run summaries ────────────────────────────────────────────────

  const recentRuns: ResearchRunSummary[] = completedRuns.map((run) => {
    const allPositions = run.decisions.flatMap((d) => (d.position ? [d.position] : []));
    const closed = allPositions.filter((pos) => pos.status === "CLOSED");
    const runWins = closed.filter((pos) => pos.outcome === "WIN").length;
    const runLosses = closed.filter((pos) => pos.outcome === "LOSS").length;
    const pnl = closed.reduce((s, pos) => s + (pos.realizedPnl ?? 0), 0);
    return {
      id: run.id,
      startedAt: run.startedAt,
      analystName: run.agentConfig?.name ?? (run.source === "MANUAL" ? "Manual" : "Agent"),
      thesesCount: run.decisions.length,
      tradesPlaced: allPositions.length,
      closedTrades: closed.length,
      pnl,
      wins: runWins,
      losses: runLosses,
    };
  });

  // ── Calibration data from AccuracyReport ─────────────────────────────────

  type RawSignal = { signal: string; winRate: number | null; count: number };
  type RawBucket = { label: string; expectedWinRate: number; winRate: number | null; count: number };
  type RawDirStats = Record<string, { winRate: number | null; count: number }>;

  let calibration: CalibrationData | null = null;
  if (latestAccuracy) {
    const signalAccuracy: SignalAccuracyStat[] = (() => {
      try {
        const raw = latestAccuracy.signalAccuracy;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        return (raw as RawSignal[])
          .filter((s) => s.count > 0)
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
          .slice(0, 10)
          .map((s) => ({ signal: s.signal, winRate: s.winRate, count: s.count }));
      } catch { return []; }
    })();

    const calibrationBuckets: CalibrationBucket[] = (() => {
      try {
        const raw = latestAccuracy.calibrationData;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        return (raw as RawBucket[])
          .filter((b) => b.count > 0)
          .map((b) => ({
            label: b.label,
            expectedWinRate: b.expectedWinRate,
            actualWinRate: b.winRate,
            count: b.count,
          }));
      } catch { return []; }
    })();

    const directionStats: CalibrationData["directionStats"] = (() => {
      try {
        const raw = latestAccuracy.directionStats as RawDirStats | null;
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

    if (signalAccuracy.length > 0 || calibrationBuckets.length > 0) {
      calibration = {
        signalAccuracy,
        calibrationBuckets,
        directionStats,
        narrativeSummary: latestAccuracy.narrativeSummary
          ? String(latestAccuracy.narrativeSummary).slice(0, 500)
          : null,
      };
    }
  }

  return {
    equityCurve,
    directionBreakdown,
    durationBreakdown,
    sectorBreakdown,
    confidenceScatter,
    stats,
    analystBreakdown,
    recentRuns,
    calibration,
  };
}
