/**
 * read_analyst_inbox_stats — Editor tool.
 *
 * Summarizes what's actually been hitting THIS analyst's inbox over the
 * last N days via AnalystSignalRoute. Used by the editor to propose
 * targeted config changes grounded in the analyst's real experience:
 *
 *   "You've gotten 40% more Healthcare signals than Tech — rebalance?"
 *   "Your 'AI_CAPEX' theme has produced 0 routes in 2 weeks — drop or rename?"
 *   "$TSLA has shown up 12× but isn't on your watchlist — add it?"
 *
 * Returns aggregated counts for:
 *   - Top tickers (frequency of mention across routed signals)
 *   - Top sectors + themes that actually routed
 *   - Active themes from the analyst's fence that produced zero routes ("dead")
 *   - Signal type distribution (NEWS / EARNINGS / FILING / etc.)
 *   - Route reason code distribution (DISCOVERY / WATCHLIST / POSITION / ...)
 *   - Inbox activity level (total routes + avg per day)
 *
 * Requires ctx.analystId. Editor mode always has it.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";

interface TickerCount {
  ticker: string;
  count: number;
  inWatchlist: boolean;
  inExclusion: boolean;
}

interface TagCount {
  tag: string;
  count: number;
}

interface InboxStatsData {
  lookbackDays: number;
  totalRoutes: number;
  avgPerDay: number;
  topTickers: TickerCount[];
  topSectors: TagCount[];
  topThemes: TagCount[];
  deadThemes: string[]; // themes on the fence with 0 routes
  deadSectors: string[]; // sectors on the fence with 0 routes
  signalTypeDist: TagCount[];
  routeReasonDist: TagCount[];
  unwatchedHotTickers: TickerCount[]; // top tickers NOT on watchlist
  /** Row view for the ticker-list renderer */
  tickers: { ticker: string; tag: string; summary: string }[];
}

export const readAnalystInboxStats = defineTool({
  description:
    "Summarize what's actually been hitting this analyst's inbox over the last N days. Use this in the Editor BEFORE proposing any config changes — it grounds your suggestions in the analyst's real experience instead of guessing. Returns top tickers, top sectors/themes, dead themes (fence dimensions with zero routes), signal type distribution, and hot unwatched tickers.",
  schema: z.object({
    lookbackDays: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe("How many days of routes to scan. Default 30, max 60."),
    topN: z
      .number()
      .int()
      .min(3)
      .max(20)
      .optional()
      .describe("How many items to return per ranked list. Default 10."),
  }),
  ui: "tool-ui" as const,
  groupId: "InboxStats",

  progressLabel: (args) => {
    const days = args.lookbackDays ?? 30;
    return `Reviewing what's hit this analyst's inbox (${days}d)`;
  },

  execute: async (args, ctx) => {
    if (!ctx.analystId) {
      throw new Error(
        "read_analyst_inbox_stats requires an analyst context (editor mode).",
      );
    }

    const lookbackDays = args.lookbackDays ?? 30;
    const topN = args.topN ?? 10;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    // Pull the analyst's current fence so we can flag "dead" dimensions.
    const analyst = await prisma.agentConfig.findUnique({
      where: { id: ctx.analystId },
      select: {
        sectors: true,
        industries: true,
        themes: true,
        watchlist: true,
        exclusionList: true,
      },
    });

    const watchlistSet = new Set(
      (analyst?.watchlist ?? []).map((w) => w.toUpperCase()),
    );
    const exclusionSet = new Set(
      (analyst?.exclusionList ?? []).map((w) => w.toUpperCase()),
    );
    const fenceSectors = analyst?.sectors ?? [];
    const fenceThemes = analyst?.themes ?? [];

    const routes = await prisma.analystSignalRoute.findMany({
      where: {
        analystId: ctx.analystId,
        routedAt: { gte: since },
      },
      include: { signal: true },
      orderBy: { routedAt: "desc" },
    });

    const totalRoutes = routes.length;
    const avgPerDay = Math.round((totalRoutes / lookbackDays) * 10) / 10;

    // ── Tally ──────────────────────────────────────────────────────────────
    const tickerMap = new Map<string, number>();
    const sectorMap = new Map<string, number>();
    const themeMap = new Map<string, number>();
    const typeMap = new Map<string, number>();
    const reasonMap = new Map<string, number>();

    for (const r of routes) {
      const s = r.signal;
      for (const t of s.tickers) {
        const up = t.toUpperCase();
        if (!up || up.length > 6) continue;
        tickerMap.set(up, (tickerMap.get(up) ?? 0) + 1);
      }
      for (const sec of s.sectors) {
        sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + 1);
      }
      for (const th of s.themes) {
        themeMap.set(th, (themeMap.get(th) ?? 0) + 1);
      }
      typeMap.set(s.type, (typeMap.get(s.type) ?? 0) + 1);
      const reason = r.routeReasonCode ?? r.routeReason ?? "unknown";
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    }

    const toTopN = (m: Map<string, number>): TagCount[] =>
      Array.from(m.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);

    const topTickers: TickerCount[] = Array.from(tickerMap.entries())
      .map(([ticker, count]) => ({
        ticker,
        count,
        inWatchlist: watchlistSet.has(ticker),
        inExclusion: exclusionSet.has(ticker),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    const topSectors = toTopN(sectorMap);
    const topThemes = toTopN(themeMap);
    const signalTypeDist = toTopN(typeMap);
    const routeReasonDist = toTopN(reasonMap);

    // Dead = on the fence but 0 routes in the window
    const deadThemes = fenceThemes.filter(
      (t) => !themeMap.has(t) || themeMap.get(t) === 0,
    );
    const deadSectors = fenceSectors.filter(
      (s) => !sectorMap.has(s) || sectorMap.get(s) === 0,
    );

    const unwatchedHotTickers = topTickers.filter(
      (t) => !t.inWatchlist && !t.inExclusion,
    );

    // Ticker-list renderer row view: prioritize unwatched hot tickers first
    // (that's the actionable list), then fill with general top tickers.
    const rowTickers = [
      ...unwatchedHotTickers.slice(0, 5).map((t) => ({
        ticker: t.ticker,
        tag: `${t.count}× — unwatched`,
        summary: `Routed ${t.count} time${t.count === 1 ? "" : "s"} but not on watchlist`,
      })),
      ...topTickers
        .filter((t) => t.inWatchlist)
        .slice(0, 5)
        .map((t) => ({
          ticker: t.ticker,
          tag: `${t.count}× — watched`,
          summary: `Routed ${t.count} time${t.count === 1 ? "" : "s"}; already on watchlist`,
        })),
    ];

    const summaryBits: string[] = [`${totalRoutes} routes in ${lookbackDays}d (~${avgPerDay}/day)`];
    if (unwatchedHotTickers.length > 0) {
      summaryBits.push(`${unwatchedHotTickers.length} hot unwatched ticker${unwatchedHotTickers.length === 1 ? "" : "s"}`);
    }
    if (deadThemes.length > 0) {
      summaryBits.push(`${deadThemes.length} dead theme${deadThemes.length === 1 ? "" : "s"}`);
    }
    if (deadSectors.length > 0) {
      summaryBits.push(`${deadSectors.length} dead sector${deadSectors.length === 1 ? "" : "s"}`);
    }

    return {
      summary: summaryBits.join(" · "),
      data: {
        lookbackDays,
        totalRoutes,
        avgPerDay,
        topTickers,
        topSectors,
        topThemes,
        deadThemes,
        deadSectors,
        signalTypeDist,
        routeReasonDist,
        unwatchedHotTickers,
        tickers: rowTickers,
      } satisfies InboxStatsData,
      // No sources — this tool reads internal DB state, not external
      // references. Don't pollute the citation chips with fake
      // "Analyst Inbox" sources. The user sees the tool row directly;
      // they don't need a citation chip for internal data.
      sources: [],
    };
  },
});
