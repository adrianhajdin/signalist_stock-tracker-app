/**
 * get_earnings_data — canary migration using defineTool().
 *
 * Migrated from the inline tool in lib/agent/tools.ts.
 * No logic changes — same Finnhub calls, same data shape.
 * The defineTool() factory provides timing, logging, and error wrapping.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { finnhub } from "@/lib/agent/research-helpers";

export const getEarningsData = defineTool({
  description:
    "Get earnings estimates, historical beat rate, and upcoming earnings date for a stock.",
  schema: z.object({
    ticker: z.string().describe("Stock ticker symbol, e.g. AAPL"),
  }),
  ui: "tool-ui" as const,
  groupId: "Researching",

  progressLabel: (args) => `Pulling $${args.ticker.toUpperCase()} earnings`,

  execute: async ({ ticker }) => {
    const [earningsResult, surprisesResult] = await Promise.all([
      finnhub(`/calendar/earnings?symbol=${ticker}`, 2),
      finnhub(`/stock/earnings?symbol=${ticker}&limit=8`, 2),
    ]);

    const earnings = earningsResult.data as {
      earningsCalendar?: { date: string; epsEstimate: number | null }[];
    } | null;
    const surprises = surprisesResult.data;

    const upcoming = earnings?.earningsCalendar?.[0];
    const history = Array.isArray(surprises) ? surprises : [];
    const beats = history.filter(
      (e: { actual: number; estimate: number }) =>
        e.actual != null && e.estimate != null && e.actual > e.estimate,
    );

    const nextEarnings = upcoming
      ? { date: upcoming.date as string, epsEstimate: upcoming.epsEstimate as number | null }
      : null;

    const beatRate =
      history.length > 0
        ? (() => {
            const periods = history
              .map((e: { period?: string }) => e.period)
              .filter(Boolean) as string[];
            const range =
              periods.length >= 2
                ? `${periods[periods.length - 1]}–${periods[0]}`
                : periods[0] || "recent";
            return `${Math.round((beats.length / history.length) * 100)}% (${beats.length}/${history.length} quarters, ${range})`;
          })()
        : "no history";

    const recentQuarters = history.slice(0, 4).map(
      (e: {
        period: string;
        actual: number;
        estimate: number;
        surprise: number;
        surprisePercent: number;
      }) => ({
        period: e.period,
        actualEps: e.actual,
        estimatedEps: e.estimate,
        surprise: e.surprise,
        surprisePct: e.surprisePercent,
      }),
    );

    const sParts: string[] = [ticker];
    if (nextEarnings) {
      sParts.push(
        `next earnings ${nextEarnings.date}${
          nextEarnings.epsEstimate != null ? ` (est. $${nextEarnings.epsEstimate})` : ""
        }`,
      );
    }
    if (beatRate !== "no history") sParts.push(`Beat rate: ${beatRate}`);

    const tickerSummary = nextEarnings
      ? `Next earnings ${nextEarnings.date}. Beat rate: ${beatRate}`
      : `No upcoming earnings. Beat rate: ${beatRate}`;

    return {
      summary: sParts.join(" — ") + ".",
      data: {
        nextEarnings,
        beatRate,
        recentQuarters,
        // data.tickers feeds ToolUIRenderer via the legacy-tickers fallback path
        tickers: [{ ticker, tag: "Research", summary: tickerSummary }],
      },
      sources: [
        { provider: "Finnhub", title: `${ticker} Earnings Calendar`, url: "https://finnhub.io/docs/api/earnings-calendar" },
        { provider: "Finnhub", title: `${ticker} Earnings History`, url: "https://finnhub.io/docs/api/company-earnings" },
      ],
    };
  },
});
