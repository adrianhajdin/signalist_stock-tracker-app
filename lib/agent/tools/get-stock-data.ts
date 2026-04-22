/**
 * get_stock_data — migrated to defineTool().
 *
 * Gets comprehensive stock data: quote, company profile, financials,
 * technical indicators (RSI, SMA, volume), analyst consensus, price
 * targets, and recent news. Finnhub primary, FMP + Alpaca bars fallback
 * for technicals.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { finnhub, calcRSI, calcSMA } from "@/lib/agent/research-helpers";
import { getBars } from "@/lib/alpaca";
import type { NewsItem } from "@/lib/agent/tool-types";
import { checkUniverse } from "@/lib/agent/universe";
import type { UniverseCheck } from "@/lib/agent/universe";

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
    if (!res.ok) return { data: null, error: `FMP ${res.status}` };
    const data = await res.json();
    if (data && typeof data === "object" && !Array.isArray(data) && "Error Message" in data) {
      return { data: null, error: `FMP: ${(data as Record<string, string>)["Error Message"]}` };
    }
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "FMP error" };
  }
}

export const getStockData = defineTool({
  description:
    "Get comprehensive data for a stock: price quote, company profile, key financials, analyst ratings, recent news, technical indicators (RSI, SMA, volume), and analyst price targets. This is your primary research tool — includes everything you need for a single ticker.",
  schema: z.object({
    ticker: z.string().describe("Stock ticker symbol, e.g. AAPL"),
    include_technicals: z
      .boolean()
      .optional()
      .describe("Include technical analysis (RSI, SMA, volume). Default true."),
  }),
  ui: "tool-ui" as const,
  groupId: "Researching",

  progressLabel: (args) => `Pulling $${args.ticker.toUpperCase()}'s snapshot`,

  execute: async ({ ticker, include_technicals }, ctx) => {
    const doTechnicals = include_technicals !== false;
    const now = Math.floor(Date.now() / 1000);
    const ninetyDaysAgo = now - 90 * 86400;

    const [quoteResult, profileResult, financialsResult, newsResult, recsResult, candleResult, priceTargetResult] =
      await Promise.all([
        finnhub(`/quote?symbol=${ticker}`, 2),
        finnhub(`/stock/profile2?symbol=${ticker}`, 2),
        finnhub(`/stock/metric?symbol=${ticker}&metric=all`, 2),
        finnhub(
          `/company-news?symbol=${ticker}&from=${new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`,
          2,
        ),
        finnhub(`/stock/recommendation?symbol=${ticker}`, 2),
        doTechnicals
          ? finnhub(`/stock/candle?symbol=${ticker}&resolution=D&from=${ninetyDaysAgo}&to=${now}`, 2)
          : Promise.resolve({ data: null } as { data: unknown; error?: string }),
        fmp(`/v4/price-target-consensus?symbol=${ticker}`),
      ]);

    const quote = quoteResult.data as Record<string, number> | null;
    const profile = profileResult.data as Record<string, unknown> | null;
    const financials = financialsResult.data as { metric?: Record<string, unknown> } | null;
    const news = newsResult.data;
    const recommendations = recsResult.data;

    const errors: string[] = [];
    if (quoteResult.error) errors.push(quoteResult.error);
    if (profileResult.error) errors.push(profileResult.error);
    if (financialsResult.error) errors.push(financialsResult.error);

    const recentNews: NewsItem[] = Array.isArray(news)
      ? news.slice(0, 3).map((n: { headline: string; summary: string; source: string; url: string; datetime: number }) => ({
          headline: n.headline,
          summary: n.summary?.slice(0, 80),
          source: n.source,
          url: n.url,
          date: new Date(n.datetime * 1000).toISOString().slice(0, 10),
        }))
      : [];

    const latestRec = Array.isArray(recommendations)
      ? (recommendations as Record<string, number>[])[0]
      : null;

    // ── Technical analysis ─────────────────────────────────────────────────
    let techData: {
      currentPrice: number;
      rsi14: number | null;
      sma20: number | null;
      sma50: number | null;
      priceVsSma20: string | null;
      priceVsSma50: string | null;
      positionIn52wRange: string;
      volumeRatio: string | null;
      trend: string;
    } | null = null;
    let techProvider = "Finnhub";

    if (doTechnicals) {
      let candles = candleResult.data as { s?: string; c?: number[]; v?: number[] } | null;

      if (!candles || candles.s !== "ok" || !candles.c?.length) {
        techProvider = "FMP";
        const fmpResult = await fmp(`/historical-price-full/${ticker}?timeseries=90`);
        const fmpHistory = fmpResult.data as { historical?: { close: number; volume: number }[] } | null;
        if (fmpHistory?.historical?.length) {
          const sorted = fmpHistory.historical.slice().reverse();
          candles = { s: "ok", c: sorted.map((d) => d.close), v: sorted.map((d) => d.volume) };
        }
      }

      if (!candles || candles.s !== "ok" || !candles.c?.length) {
        try {
          techProvider = "Alpaca";
          const threeMonthsAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
          const today = new Date().toISOString().slice(0, 10);
          const alpacaBars = await getBars(ticker, { start: threeMonthsAgo, end: today }, ctx.alpacaCreds);
          if (alpacaBars.length >= 14) {
            candles = { s: "ok", c: alpacaBars.map((b) => b.close), v: alpacaBars.map((b) => b.volume) };
          }
        } catch (err) {
          console.warn(`[tool] get_stock_data: Alpaca bars fallback failed for ${ticker}:`, err instanceof Error ? err.message : err);
        }
      }

      if (candles && candles.s === "ok" && candles.c?.length) {
        const closes = candles.c;
        const currentPrice = closes[closes.length - 1];
        const rsi = calcRSI(closes);
        const sma20 = calcSMA(closes, 20);
        const sma50 = calcSMA(closes, 50);
        const high52 = Math.max(...closes);
        const low52 = Math.min(...closes);
        const position52w = high52 !== low52 ? Math.round(((currentPrice - low52) / (high52 - low52)) * 100) : 50;
        const volumes: number[] = candles.v ?? [];
        const avgVol20 = volumes.length >= 20 ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
        const latestVol = volumes[volumes.length - 1];
        const volumeRatio = avgVol20 && avgVol20 > 0 ? Math.round((latestVol / avgVol20) * 100) / 100 : null;

        techData = {
          currentPrice,
          rsi14: rsi,
          sma20,
          sma50,
          priceVsSma20: sma20 ? `${currentPrice > sma20 ? "above" : "below"} (${Math.round(((currentPrice - sma20) / sma20) * 10000) / 100}%)` : null,
          priceVsSma50: sma50 ? `${currentPrice > sma50 ? "above" : "below"} (${Math.round(((currentPrice - sma50) / sma50) * 10000) / 100}%)` : null,
          positionIn52wRange: `${position52w}%`,
          volumeRatio: volumeRatio ? `${volumeRatio}x average (${volumeRatio > 1.5 ? "elevated" : volumeRatio < 0.7 ? "low" : "normal"})` : null,
          trend: sma20 && sma50 ? (sma20 > sma50 ? "bullish (SMA20 > SMA50)" : "bearish (SMA20 < SMA50)") : "unknown",
        };
      }
    }

    // ── Price targets ──────────────────────────────────────────────────────
    const ptArr = priceTargetResult.data as { targetConsensus?: number; targetHigh?: number; targetLow?: number; targetMedian?: number; numberOfAnalysts?: number }[];
    const targetsData = Array.isArray(ptArr) && ptArr.length > 0
      ? {
          consensus: ptArr[0].targetConsensus,
          high: ptArr[0].targetHigh,
          low: ptArr[0].targetLow,
          median: ptArr[0].targetMedian,
          numAnalysts: ptArr[0].numberOfAnalysts,
        }
      : null;

    // ── Normalize data ─────────────────────────────────────────────────────
    const fPct = (n: number | null | undefined) => n != null ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "";
    const fCompact = (n: number | null | undefined) => {
      if (n == null) return "";
      if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
      if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
      return `$${n.toLocaleString()}`;
    };

    const quoteData = quote && quote.c
      ? { price: quote.c, change: quote.d ?? 0, changePct: quote.dp ?? 0, high: quote.h, low: quote.l, open: quote.o, prevClose: quote.pc }
      : null;
    const companyData = profile && profile.name
      ? { name: profile.name as string, sector: (profile.finnhubIndustry as string) ?? "", marketCap: profile.marketCapitalization ? (profile.marketCapitalization as number) * 1_000_000 : null, exchange: (profile.exchange as string) ?? "", country: (profile.country as string) ?? "" }
      : null;
    const financialsData = financials?.metric
      ? { peRatio: financials.metric.peNormalizedAnnual as number | null, pbRatio: financials.metric.pbAnnual as number | null, high52w: financials.metric["52WeekHigh"] as number | null, low52w: financials.metric["52WeekLow"] as number | null, avgVolume10d: financials.metric["10DayAverageTradingVolume"] as number | null, beta: financials.metric.beta as number | null }
      : null;
    const consensusData = latestRec
      ? { buy: latestRec.buy, hold: latestRec.hold, sell: latestRec.sell, strongBuy: latestRec.strongBuy, strongSell: latestRec.strongSell }
      : null;

    // ── Summary ────────────────────────────────────────────────────────────
    const sParts: string[] = [];
    if (companyData?.name) sParts.push(`${ticker} — ${companyData.name}`);
    else sParts.push(ticker);
    if (quoteData) sParts.push(`$${quoteData.price} (${fPct(quoteData.changePct)})`);

    const metaParts: string[] = [];
    if (companyData?.sector) metaParts.push(companyData.sector);
    if (companyData?.marketCap) metaParts.push(fCompact(companyData.marketCap));
    if (financialsData?.peRatio != null) metaParts.push(`P/E ${financialsData.peRatio.toFixed(1)}`);
    if (consensusData) {
      const total = consensusData.strongBuy + consensusData.buy + consensusData.hold + consensusData.sell + consensusData.strongSell;
      if (total > 0) metaParts.push(`${Math.round((consensusData.strongBuy + consensusData.buy) / total * 100)}% Buy`);
    }
    if (metaParts.length > 0) sParts.push(metaParts.join(" · "));
    if (techData) {
      const techParts: string[] = [];
      if (techData.rsi14 != null) techParts.push(`RSI ${techData.rsi14.toFixed(1)}`);
      if (techData.trend && techData.trend !== "unknown") techParts.push(techData.trend.split(" ")[0]);
      if (techParts.length > 0) sParts.push(techParts.join(", "));
    }
    if (recentNews.length > 0) sParts.push(`${recentNews.length} news`);

    const tickerSummaryParts: string[] = [];
    if (companyData?.name) tickerSummaryParts.push(companyData.name);
    if (metaParts.length > 0) tickerSummaryParts.push(metaParts.join(" · "));
    if (techData?.rsi14 != null) tickerSummaryParts.push(`RSI ${techData.rsi14.toFixed(1)} ${techData.trend?.split(" ")[0] ?? ""}`);

    // ── Universe check (informational) ──────────────────────────────────
    // If the analyst has a Universe fence, check whether this ticker falls
    // inside it. The result is included in the data payload so the agent
    // sees "outside Universe — sector mismatch" in the tool result and can
    // decide whether to proceed. This is belt-and-suspenders alongside the
    // prompt-level enforcement.
    let universeCheck: UniverseCheck | undefined;
    const hasFence =
      (ctx.sectors?.length ?? 0) > 0 ||
      (ctx.industries?.length ?? 0) > 0 ||
      (ctx.exclusionList?.length ?? 0) > 0 ||
      ctx.marketCapMin != null ||
      ctx.marketCapMax != null;

    if (hasFence) {
      // Finnhub labels the field `finnhubIndustry` but populates it with a
      // mix of sectors ("Technology"), industries ("Semiconductors"), and
      // shorthand ("Tech", "Biotech"). checkUniverse normalizes through the
      // canonical alias table + industry→parent-sector lookup so an IT fence
      // matches any of those. Held + watchlisted tickers bypass the fence
      // in code — never flagged "outside universe".
      universeCheck = checkUniverse(
        {
          ticker,
          sector: companyData?.sector ?? null,
          industry: null, // Finnhub doesn't separately expose GICS industry
          marketCap: companyData?.marketCap ?? null,
        },
        {
          sectors: ctx.sectors,
          industries: ctx.industries,
          marketCapMin: ctx.marketCapMin ?? null,
          marketCapMax: ctx.marketCapMax ?? null,
          exclusionList: ctx.exclusionList,
          positionTickers: ctx.positionTickers,
          watchlistTickers: ctx.watchlist,
        },
      );
      if (!universeCheck.inUniverse) {
        sParts.push(`⚠ Outside Universe: ${universeCheck.failedReasons.join("; ")}`);
      }
    }

    return {
      summary: sParts.join(". ") + ".",
      data: {
        quote: quoteData,
        company: companyData,
        financials: financialsData,
        technicals: techData,
        analystConsensus: consensusData,
        priceTargets: targetsData,
        news: recentNews,
        ...(universeCheck ? { universeCheck } : {}),
        ...(errors.length > 0 ? { apiErrors: errors } : {}),
        tickers: [{ ticker, tag: "Research", summary: tickerSummaryParts.join(". ") }],
      },
      sources: [
        { provider: "Finnhub", title: `${ticker} Real-Time Quote`, url: "https://finnhub.io/docs/api/quote" },
        { provider: "Finnhub", title: `${ticker} Company Profile`, url: "https://finnhub.io/docs/api/company-profile2" },
        { provider: "Finnhub", title: `${ticker} Key Financials`, url: "https://finnhub.io/docs/api/stock-basic-financials" },
        ...(consensusData ? [{ provider: "Finnhub", title: `${ticker} Analyst Consensus`, url: "https://finnhub.io/docs/api/recommendation-trends" }] : []),
        ...(techData ? [{ provider: techProvider, title: `${ticker} 90-Day Price History`, url: techProvider === "Finnhub" ? "https://finnhub.io/docs/api/stock-candles" : `https://financialmodelingprep.com/financial-statements/${ticker}` }] : []),
        ...(targetsData ? [{ provider: "FMP", title: `${ticker} Analyst Price Targets`, url: `https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${ticker}` }] : []),
      ],
    };
  },
});
