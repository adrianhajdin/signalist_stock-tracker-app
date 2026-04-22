/**
 * get_market_context — migrated to defineTool().
 *
 * Gets current market conditions: SPY/VIX, sector ETFs, macro events,
 * earnings density, and regime classification.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { finnhub, calcSMA } from "@/lib/agent/research-helpers";
import type { MacroEvent } from "@/lib/discovery/types";

const FMP_KEY = process.env.FMP_API_KEY!;

async function fmp(path: string): Promise<{ data: unknown; error?: string }> {
  const base = path.startsWith("/v4/")
    ? `https://financialmodelingprep.com/api${path}`
    : `https://financialmodelingprep.com/api/v3${path}`;
  const url = `${base}${path.includes("?") ? "&" : "?"}apikey=${FMP_KEY}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { data: null, error: `FMP ${res.status} for ${path}` };
    return { data: await res.json() };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "FMP error" };
  }
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const SECTOR_ETFS = ["XLK", "XLF", "XLV", "XLY", "XLP", "XLE", "XLI", "XLB", "XLRE", "XLU", "XLC"];

export const getMarketContext = defineTool({
  description:
    "Get current market conditions: S&P 500, VIX, sector ETF performance, macro events, and regime classification. A quick price snapshot for market orientation.",
  schema: z.object({}),
  ui: "tool-ui" as const,
  groupId: "Researching",

  progressLabel: () => "Checking today's market regime",

  execute: async () => {
    const errors: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;
    const fiveDaysForward = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);

    const allSymbols = ["SPY", ...SECTOR_ETFS];
    const [quoteResults, spyCandleResult, macroCalResult, earningsDensityResult] = await Promise.all([
      Promise.all(
        allSymbols.map(async (sym) => {
          const res = await finnhub(`/quote?symbol=${sym}`, 2);
          const d = res.data as Record<string, number> | null;
          if (d && typeof d.c === "number" && d.c > 0) {
            return { symbol: sym, price: d.c, changesPercentage: d.dp ?? 0, dayHigh: d.h ?? d.c, dayLow: d.l ?? d.c };
          }
          if (res.error) errors.push(res.error);
          return null;
        })
      ),
      finnhub(`/stock/candle?symbol=SPY&resolution=D&from=${thirtyDaysAgo}&to=${now}`, 2),
      fmp(`/economic_calendar?from=${today}&to=${today}`),
      finnhub(`/calendar/earnings?from=${today}&to=${fiveDaysForward}`, 2),
    ]);

    const spyData = quoteResults[0];
    const sectorsRaw = quoteResults.slice(1).filter(Boolean);

    // VIX: Finnhub first, then VIXY fallback
    let vixLevel: number | null = null;
    let vixChangePct: number | null = null;
    const vixFinnhubResult = await finnhub(`/quote?symbol=${encodeURIComponent("^VIX")}`, 2);
    const vixFinnhub = vixFinnhubResult.data as Record<string, number> | null;
    if (vixFinnhub && typeof vixFinnhub.c === "number" && vixFinnhub.c > 0) {
      vixLevel = vixFinnhub.c;
      vixChangePct = vixFinnhub.dp ?? null;
    } else {
      const vixyResult = await finnhub("/quote?symbol=VIXY", 2);
      const vixy = vixyResult.data as Record<string, number> | null;
      if (vixy && typeof vixy.c === "number" && vixy.c > 0) {
        vixLevel = vixy.c;
        vixChangePct = vixy.dp ?? null;
      }
    }

    // SPY trend + regime classification
    let spyTrend: { sma_20: number; position: "above" | "below"; pct_from_sma: number } | null = null;
    let regime: "RISK_ON" | "RISK_OFF" | "NEUTRAL" = "NEUTRAL";
    let fiveDayReturn = 0;

    const spyCandle = spyCandleResult.data as { c?: number[]; s?: string } | null;
    if (spyCandle && spyCandle.s === "ok" && Array.isArray(spyCandle.c) && spyCandle.c.length >= 5) {
      const closes = spyCandle.c;
      const sma20 = calcSMA(closes, 20);
      const currentPrice = closes[closes.length - 1];
      fiveDayReturn = closes.length >= 6
        ? ((currentPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100
        : 0;
      if (sma20 !== null) {
        const position: "above" | "below" = currentPrice >= sma20 ? "above" : "below";
        const pctFromSma = Math.round(((currentPrice - sma20) / sma20) * 10000) / 100;
        spyTrend = { sma_20: sma20, position, pct_from_sma: pctFromSma };
      }
    } else if (spyCandleResult.error) {
      errors.push(spyCandleResult.error);
    }

    const spyAboveSma = spyTrend?.position === "above";
    if (vixLevel !== null && vixLevel < 16 && spyAboveSma) {
      regime = "RISK_ON";
    } else if ((vixLevel !== null && vixLevel > 25) || (!spyAboveSma && fiveDayReturn < -1)) {
      regime = "RISK_OFF";
    }

    // Macro events today
    let macroEventsToday: MacroEvent[] = [];
    try {
      const macroRaw = macroCalResult.data as { event?: string; country?: string; actual?: number | null; estimate?: number | null; impact?: string }[] | null;
      if (Array.isArray(macroRaw)) {
        macroEventsToday = macroRaw
          .filter((e) => e.country === "US")
          .map((e) => ({
            event: e.event ?? "Unknown",
            actual: e.actual ?? null,
            estimate: e.estimate ?? null,
            impact: e.impact === "High" ? "HIGH" as const : e.impact === "Medium" ? "MEDIUM" as const : "LOW" as const,
          }));
      }
    } catch { /* non-fatal */ }

    // Earnings density
    let earningsDensity: { count: number; period: string } = { count: 0, period: `${today}–${fiveDaysForward}` };
    try {
      const earningsRaw = earningsDensityResult.data as { earningsCalendar?: { symbol: string }[] } | null;
      if (earningsRaw?.earningsCalendar) {
        earningsDensity = {
          count: earningsRaw.earningsCalendar.length,
          period: `${formatShortDate(today)}–${formatShortDate(fiveDaysForward)}`,
        };
      }
    } catch { /* non-fatal */ }

    const sectors = sectorsRaw
      .filter((s): s is NonNullable<typeof s> => s != null)
      .map((s) => ({ symbol: s.symbol, changePct: s.changesPercentage }))
      .sort((a, b) => b.changePct - a.changePct);

    const fPct = (n: number | null | undefined) => n != null ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "";
    const summaryParts: string[] = [];
    if (spyData) summaryParts.push(`SPY $${spyData.price} (${fPct(spyData.changesPercentage)})`);
    if (vixLevel !== null) summaryParts.push(`VIX ${vixLevel.toFixed(1)}`);
    summaryParts.push(`Regime: ${regime}`);
    if (macroEventsToday.length > 0) summaryParts.push(`${macroEventsToday.length} macro event${macroEventsToday.length !== 1 ? "s" : ""} today`);
    if (earningsDensity.count > 0) summaryParts.push(`${earningsDensity.count} earnings ${earningsDensity.period}`);

    return {
      summary: summaryParts.join(". ") + ".",
      data: {
        spy: spyData
          ? { price: spyData.price, changePct: spyData.changesPercentage, dayHigh: spyData.dayHigh, dayLow: spyData.dayLow }
          : null,
        vix: vixLevel !== null ? { level: vixLevel, changePct: vixChangePct } : null,
        regime,
        spyTrend: spyTrend
          ? { sma20: spyTrend.sma_20, position: spyTrend.position, pctFromSma: spyTrend.pct_from_sma }
          : null,
        sectors,
        macroEvents: macroEventsToday,
        earningsDensity,
        ...(errors.length > 0 ? { apiErrors: errors } : {}),
        // Tool UI renders the summary; raw market data lives on data for downstream consumers
        tickers: spyData
          ? [{ ticker: "SPY", summary: `$${spyData.price} (${fPct(spyData.changesPercentage)})${spyTrend ? `, ${spyTrend.position} SMA-20 by ${fPct(spyTrend.pct_from_sma)}` : ""}` }]
          : [],
      },
      sources: [
        { provider: "Finnhub", title: "SPY Real-Time Quote", url: "https://finnhub.io/docs/api/quote" },
        { provider: "Finnhub", title: "CBOE VIX Index", url: "https://finnhub.io/docs/api/quote" },
        { provider: "Finnhub", title: "S&P 500 Sector ETF Performance", url: "https://finnhub.io/docs/api/quote" },
        { provider: "Finnhub", title: "SPY 30-Day Candles (SMA-20 + Regime)", url: "https://finnhub.io/docs/api/stock-candles" },
        { provider: "FMP", title: "US Economic Calendar", url: "https://site.financialmodelingprep.com/developer/docs#economic-calendar" },
        { provider: "Finnhub", title: "Earnings Calendar (5-Day Density)", url: "https://finnhub.io/docs/api/earnings-calendar" },
      ],
    };
  },
});
