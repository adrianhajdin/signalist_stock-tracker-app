/**
 * get_sec_filings — migrated to defineTool().
 *
 * Fetches recent SEC filings (10-K, 10-Q, 8-K, Form 4) from EDGAR.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";

const SEC_USER_AGENT = "Hindsight Research Bot research@hindsight.app";

async function getCIK(ticker: string): Promise<string> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SEC tickers lookup failed: ${res.status}`);
  const data = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  for (const entry of Object.values(data)) {
    if (entry.ticker.toUpperCase() === ticker.toUpperCase()) {
      return String(entry.cik_str).padStart(10, "0");
    }
  }
  throw new Error(`No CIK found for ${ticker}`);
}

export const getSecFilings = defineTool({
  description:
    "Fetch recent SEC filings (10-K, 10-Q, 8-K, Form 4) for a stock from EDGAR. " +
    "Use this to check for recent regulatory filings, insider transactions, or material events.",
  schema: z.object({
    symbol: z.string().describe("Ticker symbol, e.g. AAPL"),
  }),
  ui: "tool-ui" as const,
  groupId: "Researching",

  progressLabel: (args) => `Pulling $${args.symbol.toUpperCase()} SEC filings`,

  execute: async ({ symbol }) => {
    try {
      const cik = await getCIK(symbol);
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return {
          summary: `SEC returned ${res.status} for ${symbol}.`,
          data: {
            filings: [] as { type: string; date: string; description: string }[],
            count: 0,
            tickers: [{ ticker: symbol, tag: "Research", summary: `SEC error ${res.status}` }],
          },
          sources: [{ provider: "SEC EDGAR", title: `${symbol} EDGAR Filings`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}` }],
        };
      }

      const data = (await res.json()) as {
        filings?: {
          recent?: {
            form?: string[];
            filingDate?: string[];
            primaryDocDescription?: string[];
          };
        };
      };

      const recent = data.filings?.recent;
      if (!recent) {
        return {
          summary: `No recent filings found for ${symbol}.`,
          data: { filings: [], count: 0, tickers: [{ ticker: symbol, tag: "Research", summary: "No filings" }] },
          sources: [{ provider: "SEC EDGAR", title: `${symbol} EDGAR Filings`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}` }],
        };
      }

      const relevantTypes = new Set(["10-K", "10-Q", "8-K", "S-1", "DEF 14A", "4"]);
      const filings: { type: string; date: string; description: string }[] = [];
      const forms = recent.form ?? [];
      const dates = recent.filingDate ?? [];
      const descs = recent.primaryDocDescription ?? [];
      const maxIdx = Math.min(forms.length, dates.length, descs.length, 50);

      for (let i = 0; i < maxIdx; i++) {
        if (!relevantTypes.has(forms[i])) continue;
        filings.push({ type: forms[i], date: dates[i], description: descs[i] ?? forms[i] });
        if (filings.length >= 8) break;
      }

      const types = filings.map((f) => f.type);
      const summary = filings.length > 0
        ? `${symbol} — ${filings.length} SEC filing${filings.length !== 1 ? "s" : ""} (${[...new Set(types)].join(", ")}).`
        : `No recent SEC filings for ${symbol}.`;

      return {
        summary,
        data: {
          filings,
          count: filings.length,
          tickers: [{ ticker: symbol, tag: "Research", summary: filings.length > 0 ? `${filings.length} SEC filing${filings.length !== 1 ? "s" : ""}` : "No recent filings" }],
        },
        sources: [{ provider: "SEC EDGAR", title: `${symbol} EDGAR Filings`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=&dateb=&owner=include&count=40` }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SEC lookup failed";
      return {
        summary: `SEC filings lookup failed for ${symbol}: ${msg}`,
        data: {
          filings: [],
          count: 0,
          tickers: [{ ticker: symbol, tag: "Research", summary: `SEC lookup failed` }],
        },
        sources: [{ provider: "SEC EDGAR", title: `${symbol} EDGAR Filings`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}` }],
      };
    }
  },
});
