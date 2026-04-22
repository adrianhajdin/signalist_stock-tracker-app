/**
 * read_morning_brief — migrated to defineTool().
 *
 * Reads today's pre-generated intelligence brief from the DB.
 * Contains market context, portfolio alerts, watchlist updates,
 * new opportunities, and risk flags.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import { etTradingDayDate } from "@/lib/market-hours";
import type { ToolSource, ToolUIItem } from "@/lib/agent/tool-result";
import type { MorningBriefToolData } from "@/lib/agent/tool-types";

export const readMorningBrief = defineTool({
  description:
    "Read today's pre-generated intelligence brief. Contains market context, portfolio alerts, watchlist updates, new opportunities, and risk flags — all gathered by background jobs before your session started. Call this in Phase 0 to understand what happened overnight.",
  schema: z.object({}),
  ui: "tool-ui" as const,

  progressLabel: () => "Reading today's morning brief",

  execute: async (_args, ctx) => {
    if (!ctx.analystId) {
      return {
        summary: "No analyst context — cannot read brief.",
        data: { available: false } as MorningBriefToolData,
        sources: [],
      };
    }

    const today = etTradingDayDate();

    const brief = await prisma.morningBrief.findUnique({
      where: { analystId_date: { analystId: ctx.analystId, date: today } },
    });

    if (!brief) {
      return {
        summary: "No morning brief available for today. Intelligence jobs may not have run yet.",
        data: { available: false } as MorningBriefToolData,
        sources: [],
      };
    }

    const alerts = Array.isArray(brief.portfolioAlerts)
      ? brief.portfolioAlerts as { ticker: string; alert: string; urgency: string; signalIds: string[] }[]
      : [];
    const watches = Array.isArray(brief.watchlistUpdates)
      ? brief.watchlistUpdates as { ticker: string; update: string; recommendation: string; signalIds: string[] }[]
      : [];
    const opps = Array.isArray(brief.newOpportunities)
      ? brief.newOpportunities as { headline: string; tickers: string[]; thesisSeed: string; signalIds: string[] }[]
      : [];

    // Unified items for the generic Tool UI renderer. Market context is a
    // narrative prose row (kind: "generic"); alerts / watches / opportunities
    // are real ticker rows. Never shove marketContext into a fake ticker —
    // that's how the $MARKET bug was born.
    const items: ToolUIItem[] = [
      ...(brief.marketContext
        ? [{ kind: "generic" as const, text: brief.marketContext }]
        : []),
      ...alerts.map((a) => ({ kind: "ticker" as const, ticker: a.ticker, tag: "Holding", text: a.alert })),
      ...watches.map((w) => ({ kind: "ticker" as const, ticker: w.ticker, tag: "Watching", text: w.update })),
      ...opps.map((o) => ({
        kind: "ticker" as const,
        ticker: o.tickers?.[0] ?? "?",
        tag: "Opportunity",
        text: o.thesisSeed || o.headline,
      })),
    ];

    // Resolve real signal sources
    const allSignalIds = [
      ...alerts.flatMap((a) => a.signalIds ?? []),
      ...watches.flatMap((w) => w.signalIds ?? []),
      ...opps.flatMap((o) => o.signalIds ?? []),
    ];

    const briefSources: ToolSource[] = [];
    if (allSignalIds.length > 0) {
      const signals = await prisma.signal.findMany({
        where: { id: { in: allSignalIds } },
        select: { headline: true, sourceUrls: true, sourceNames: true },
      });
      const seen = new Set<string>();
      for (const s of signals) {
        for (let i = 0; i < s.sourceUrls.length; i++) {
          const url = s.sourceUrls[i];
          if (!url || seen.has(url)) continue;
          seen.add(url);
          briefSources.push({
            provider: s.sourceNames[i] ?? new URL(url).hostname,
            title: s.headline,
            url,
          });
          if (briefSources.length >= 12) break;
        }
        if (briefSources.length >= 12) break;
      }
    }

    return {
      summary: `Morning brief: ${alerts.length} portfolio alert${alerts.length !== 1 ? "s" : ""}, ${watches.length} watchlist update${watches.length !== 1 ? "s" : ""}, ${opps.length} opportunit${opps.length !== 1 ? "ies" : "y"}. ${brief.signalCount} signals.`,
      data: {
        available: true,
        date: brief.date.toISOString().slice(0, 10),
        marketContext: brief.marketContext ?? undefined,
        attentionPriority: brief.attentionPriority,
        riskFlags: brief.riskFlags,
        signalCount: brief.signalCount,
        generatedAt: brief.generatedAt.toISOString(),
        portfolioAlerts: alerts,
        watchlistUpdates: watches,
        newOpportunities: opps,
        items,
      } as MorningBriefToolData & { items: ToolUIItem[] },
      sources: briefSources,
    };
  },
});
