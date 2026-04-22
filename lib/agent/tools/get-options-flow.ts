/**
 * get_options_flow — migrated to defineTool().
 *
 * Gets unusual options activity: put/call ratio, unusual volume contracts,
 * and implied volatility signals. FMP primary, Finnhub fallback.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { finnhub } from "@/lib/agent/research-helpers";

const FMP_KEY = process.env.FMP_API_KEY!;

async function fmp(path: string): Promise<{ data: unknown; error?: string }> {
  const base = `https://financialmodelingprep.com/api/v3${path}`;
  const url = `${base}${path.includes("?") ? "&" : "?"}apikey=${FMP_KEY}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { data: null, error: `FMP ${res.status}` };
    return { data: await res.json() };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "FMP error" };
  }
}

export const getOptionsFlow = defineTool({
  description:
    "Get unusual options activity for a stock: put/call ratio, unusual volume contracts, and implied volatility signals.",
  schema: z.object({
    ticker: z.string().describe("Stock ticker symbol, e.g. AAPL"),
  }),
  ui: "tool-ui" as const,
  groupId: "Researching",

  progressLabel: (args) => `Pulling $${args.ticker.toUpperCase()} options flow`,

  execute: async ({ ticker }) => {
    // Primary: FMP options chain
    const fmpResult = await fmp(`/options/chain/${ticker.toUpperCase()}`);
    const fmpData = fmpResult.data;

    if (Array.isArray(fmpData) && fmpData.length > 0) {
      let totalCallVol = 0;
      let totalPutVol = 0;
      const unusualContracts: {
        type: string;
        strike: number;
        expiration: string;
        volume: number;
        openInterest: number;
        premium: number;
      }[] = [];

      for (const contract of fmpData) {
        const ctype = (contract.type ?? "").toUpperCase();
        const vol = Number(contract.volume ?? 0);
        const oi = Number(contract.openInterest ?? 0);
        const lastPrice = Number(contract.lastPrice ?? 0);
        if (ctype === "CALL") totalCallVol += vol;
        else if (ctype === "PUT") totalPutVol += vol;
        const volOiRatio = oi > 0 ? vol / oi : vol;
        const premium = lastPrice * vol * 100;
        if (vol > 0 && (volOiRatio >= 5 || premium >= 500_000)) {
          unusualContracts.push({ type: ctype, strike: Number(contract.strike ?? 0), expiration: contract.expirationDate ?? "", volume: vol, openInterest: oi, premium: Math.round(premium) });
        }
      }

      unusualContracts.sort((a, b) => b.premium - a.premium);
      const pcr = totalCallVol > 0 ? Math.round((totalPutVol / totalCallVol) * 100) / 100 : null;
      const sig = totalCallVol > 0 && totalPutVol / totalCallVol < 0.7
        ? "bullish (low put/call ratio)"
        : totalCallVol > 0 && totalPutVol / totalCallVol > 1.3
          ? "bearish (high put/call ratio)"
          : "neutral";
      const topContracts = unusualContracts.slice(0, 3);

      return {
        summary: `${ticker} options — P/C ratio ${pcr ?? "N/A"}, ${sig.split(" ")[0]}. ${topContracts.length} unusual contract${topContracts.length !== 1 ? "s" : ""}.`,
        data: {
          available: true, putCallRatio: pcr, totalCallVolume: totalCallVol, totalPutVolume: totalPutVol,
          contractsAvailable: fmpData.length, unusualContracts: topContracts, signal: sig, dataSource: "fmp",
          tickers: [{ ticker, tag: "Research", summary: `P/C ${pcr ?? "N/A"} ${sig.split(" ")[0]}, ${topContracts.length} unusual contracts` }],
        },
        sources: [{ provider: "FMP", title: `${ticker} Options Chain`, url: `https://financialmodelingprep.com/api/v3/options/chain/${ticker}`, excerpt: `P/C ratio ${pcr ?? "—"} | ${totalCallVol.toLocaleString()} calls / ${totalPutVol.toLocaleString()} puts` }],
      };
    }

    // Fallback: Finnhub option chain
    const expDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const finnhubResult = await finnhub(`/stock/option-chain?symbol=${ticker}&expiration=${expDate}`, 2);
    const finnhubData = finnhubResult.data as { data?: { options?: { CALL?: { volume: number }[]; PUT?: { volume: number }[] } }[] } | null;

    if (finnhubData?.data?.length) {
      const options = finnhubData.data[0];
      const calls = options?.options?.CALL ?? [];
      const puts = options?.options?.PUT ?? [];
      const totalCallVol = calls.reduce((sum: number, o: { volume: number }) => sum + (o.volume || 0), 0);
      const totalPutVol = puts.reduce((sum: number, o: { volume: number }) => sum + (o.volume || 0), 0);
      const pcr2 = totalCallVol > 0 ? Math.round((totalPutVol / totalCallVol) * 100) / 100 : null;
      const sig2 = totalCallVol > 0 && totalPutVol / totalCallVol < 0.7
        ? "bullish (low put/call ratio)"
        : totalCallVol > 0 && totalPutVol / totalCallVol > 1.3
          ? "bearish (high put/call ratio)"
          : "neutral";

      return {
        summary: `${ticker} options — P/C ratio ${pcr2 ?? "N/A"}, ${sig2.split(" ")[0]}.`,
        data: {
          available: true, putCallRatio: pcr2, totalCallVolume: totalCallVol, totalPutVolume: totalPutVol,
          contractsAvailable: calls.length + puts.length, unusualContracts: [], signal: sig2, dataSource: "finnhub",
          tickers: [{ ticker, tag: "Research", summary: `P/C ${pcr2 ?? "N/A"} ${sig2.split(" ")[0]}` }],
        },
        sources: [{ provider: "Finnhub", title: `${ticker} Options Chain`, url: "https://finnhub.io/docs/api/stock-option-chain", excerpt: `P/C ratio ${pcr2 ?? "—"} | ${calls.length} calls / ${puts.length} puts` }],
      };
    }

    return {
      summary: `No options data available for ${ticker}.`,
      data: {
        available: false, putCallRatio: null, totalCallVolume: 0, totalPutVolume: 0,
        contractsAvailable: 0, unusualContracts: [], signal: "unavailable", dataSource: "none",
        tickers: [{ ticker, tag: "Research", summary: "No options data — may be small-cap or illiquid" }],
      },
      sources: [{ provider: "Finnhub", title: `${ticker} Options Chain (No Data)`, url: "https://finnhub.io/docs/api/stock-option-chain", excerpt: "No options contracts found" }],
    };
  },
});
