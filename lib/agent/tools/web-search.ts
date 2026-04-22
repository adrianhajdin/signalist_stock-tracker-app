/**
 * web_search — migrated to defineTool().
 *
 * Live Perplexity Sonar search. Respects intelligence policy's
 * allowLiveSearch and liveSearchBudget. Per-run budget tracked
 * via a module-level Map keyed by runId.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { searchSignals } from "@/lib/intelligence/sonar";
import { toSourceRefs, sourceRefsToToolSources } from "@/lib/agent/tool-types";
import type { SignalItem, WebSearchToolData } from "@/lib/agent/tool-types";

// Per-run search count — keyed by runId to scope budget to the current run.
const liveSearchCounts = new Map<string, number>();

export const webSearch = defineTool({
  description:
    "Search the web for real-time information via Perplexity Sonar. Use when pre-gathered intelligence is insufficient and you need live data — breaking news, recent developments, or niche topics not covered by the signal pipeline. Respects your intelligence policy's allowLiveSearch and liveSearchBudget.",
  schema: z.object({
    query: z.string().describe("Search query — be specific and financial-context-aware"),
    recency: z
      .enum(["hour", "day", "week", "month"])
      .optional()
      .describe("How recent results should be (default: day)"),
  }),
  ui: "tool-ui" as const,

  progressLabel: (args) => {
    const q = args.query.trim();
    const truncated = q.length > 50 ? `${q.slice(0, 50)}…` : q;
    return `Searching the web for "${truncated}"`;
  },

  execute: async ({ query, recency = "day" }, ctx) => {
    const policy = ctx.intelligencePolicy;

    if (policy && !policy.allowLiveSearch) {
      return {
        summary: "Live search disabled by intelligence policy.",
        data: {
          query,
          resultCount: 0,
          budgetUsed: 0,
          budgetMax: 0,
          results: [],
          allowed: false,
        } as WebSearchToolData & { allowed: boolean },
        sources: [],
      };
    }

    const budget = policy?.liveSearchBudget ?? 5;
    const count = liveSearchCounts.get(ctx.runId) ?? 0;

    if (count >= budget) {
      return {
        summary: `Live search budget exhausted (${budget}/${budget} used).`,
        data: {
          query,
          resultCount: 0,
          budgetUsed: count,
          budgetMax: budget,
          results: [],
          allowed: false,
        } as WebSearchToolData & { allowed: boolean },
        sources: [],
      };
    }

    liveSearchCounts.set(ctx.runId, count + 1);
    const newCount = count + 1;

    const sonarResult = await searchSignals(query, { recency, model: "sonar" });

    const results: SignalItem[] = sonarResult.signals.map((s) => ({
      headline: s.headline,
      summary: s.summary,
      tickers: s.tickers,
      themes: s.themes,
      sentiment: s.sentiment,
      urgency: s.urgency,
      sources: toSourceRefs(s.sourceNames, s.sourceUrls),
    }));

    return {
      summary: `Found ${results.length} result${results.length !== 1 ? "s" : ""} for "${query.slice(0, 60)}". Budget: ${newCount}/${budget}.`,
      data: {
        query,
        resultCount: results.length,
        budgetUsed: newCount,
        budgetMax: budget,
        results,
        tickers: results
          .filter((r) => r.tickers.length > 0)
          .map((r) => ({ ticker: r.tickers[0], tag: r.sentiment, summary: r.headline })),
      } as WebSearchToolData & { tickers: { ticker: string; tag: string; summary: string }[] },
      sources: sourceRefsToToolSources(results.flatMap((r) => r.sources)),
    };
  },
});
