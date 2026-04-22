/**
 * Pure utility for computing accuracy / calibration stats.
 * No "use server" directive — safe to import from Inngest functions,
 * API routes, or anywhere on the server.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalibrationBucket = {
  label: string;           // e.g. "60-70"
  minConf: number;
  maxConf: number;
  count: number;
  winRate: number | null;  // null when no trades in bucket
  expectedWinRate: number; // the midpoint confidence (e.g. 0.65 for 60-70 bucket)
};

export type SignalAccuracy = {
  signal: string;
  count: number;
  winRate: number | null;
};

export type DirectionStats = {
  direction: "LONG" | "SHORT";
  count: number;
  winRate: number | null;
};

export type ShadowStats = {
  totalPasses: number;
  goodPasses: number;       // price moved against the would-be trade (pass was correct)
  badPasses: number;        // price moved in favor (missed opportunity)
  passAccuracy: number | null;  // goodPasses / totalPasses
  avgMissedGain: number;    // avg $ missed on bad passes
  avgAvoidedLoss: number;   // avg $ avoided on good passes
};

export type AccuracyStats = {
  tradesAnalyzed: number;
  overallWinRate: number | null;
  calibration: CalibrationBucket[];
  signalAccuracy: SignalAccuracy[];
  directionStats: DirectionStats[];
  longestWinStreak: number;
  longestLossStreak: number;
  shadowStats: ShadowStats | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONFIDENCE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0–40",  min: 0,  max: 40  },
  { label: "41–55", min: 41, max: 55  },
  { label: "56–70", min: 56, max: 70  },
  { label: "71–85", min: 71, max: 85  },
  { label: "86+",   min: 86, max: 100 },
];

function winRateFrom(wins: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((wins / total) * 1000) / 1000; // 3 dp
}

function streaks(outcomes: string[]): { win: number; loss: number } {
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  for (const o of outcomes) {
    if (o === "WIN") {
      curWin++;
      curLoss = 0;
      maxWin = Math.max(maxWin, curWin);
    } else if (o === "LOSS") {
      curLoss++;
      curWin = 0;
      maxLoss = Math.max(maxLoss, curLoss);
    } else {
      curWin = 0;
      curLoss = 0;
    }
  }
  return { win: maxWin, loss: maxLoss };
}

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Compute calibration + signal accuracy for all closed positions for a user.
 * Optionally scope to a date range (e.g. last 30 days).
 */
export async function getAccuracyStats(
  userId: string,
  since?: Date
): Promise<AccuracyStats> {
  const positions = await prisma.position.findMany({
    where: {
      userId,
      status: "CLOSED",
      outcome: { in: ["WIN", "LOSS", "BREAKEVEN"] },
      ...(since ? { closedAt: { gte: since } } : {}),
    },
    include: {
      decisions: {
        take: 1,
        include: {
          thesis: {
            select: { confidenceScore: true, signalTypes: true },
          },
        },
      },
    },
    orderBy: { closedAt: "asc" },
  });

  const n = positions.length;
  if (n === 0) {
    return {
      tradesAnalyzed: 0,
      overallWinRate: null,
      calibration: CONFIDENCE_BUCKETS.map((b) => ({
        label: b.label,
        minConf: b.min,
        maxConf: b.max,
        count: 0,
        winRate: null,
        expectedWinRate: (b.min + b.max) / 200,
      })),
      signalAccuracy: [],
      directionStats: [],
      longestWinStreak: 0,
      longestLossStreak: 0,
      shadowStats: null,
    };
  }

  // Helper to get thesis from position via TradeDecision
  const getThesis = (p: (typeof positions)[number]) => p.decisions[0]?.thesis;

  // ── Overall win rate ──────────────────────────────────────────────────────
  const wins = positions.filter((p) => p.outcome === "WIN").length;
  const overallWinRate = winRateFrom(wins, n);

  // ── Calibration buckets ───────────────────────────────────────────────────
  const calibration: CalibrationBucket[] = CONFIDENCE_BUCKETS.map((b) => {
    const inBucket = positions.filter((p) => {
      const conf = getThesis(p)?.confidenceScore ?? 0;
      return conf >= b.min && conf <= b.max;
    });
    const bucketWins = inBucket.filter((p) => p.outcome === "WIN").length;
    return {
      label: b.label,
      minConf: b.min,
      maxConf: b.max,
      count: inBucket.length,
      winRate: winRateFrom(bucketWins, inBucket.length),
      expectedWinRate: (b.min + b.max) / 200,
    };
  });

  // ── Signal-type accuracy ──────────────────────────────────────────────────
  const signalMap = new Map<string, { wins: number; total: number }>();
  for (const pos of positions) {
    const signals: string[] = getThesis(pos)?.signalTypes ?? [];
    for (const sig of signals) {
      const entry = signalMap.get(sig) ?? { wins: 0, total: 0 };
      entry.total++;
      if (pos.outcome === "WIN") entry.wins++;
      signalMap.set(sig, entry);
    }
  }
  const signalAccuracy: SignalAccuracy[] = Array.from(signalMap.entries())
    .map(([signal, { wins: w, total }]) => ({
      signal,
      count: total,
      winRate: winRateFrom(w, total),
    }))
    .sort((a, b) => b.count - a.count);

  // ── Direction stats ───────────────────────────────────────────────────────
  const directionStats: DirectionStats[] = (["LONG", "SHORT"] as const).map((dir) => {
    const group = positions.filter((p) => p.direction === dir);
    const groupWins = group.filter((p) => p.outcome === "WIN").length;
    return {
      direction: dir,
      count: group.length,
      winRate: winRateFrom(groupWins, group.length),
    };
  });

  // ── Streaks ───────────────────────────────────────────────────────────────
  const { win: longestWinStreak, loss: longestLossStreak } = streaks(
    positions.map((p) => p.outcome ?? "")
  );

  // ── Shadow / pass accuracy (from PASS decisions) ──────────────────────────
  // PASS decisions don't create positions — shadow stats are no longer tracked
  // in the new Position/Order schema. Return null until a separate pass-tracking
  // mechanism is built.
  const shadowStats: ShadowStats | null = null;

  return {
    tradesAnalyzed: n,
    overallWinRate,
    calibration,
    signalAccuracy,
    directionStats,
    longestWinStreak,
    longestLossStreak,
    shadowStats,
  };
}
