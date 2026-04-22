"use server";

/**
 * Server-side loader for the Sources + Theses tabs on /runs/[id].
 *
 * Pulls real data from the DB instead of parsing tool-call results in the
 * browser. Three things come back:
 *
 * 1. brief    — the analyst's MorningBrief for the run's trading day, if any.
 *               Used to render a single "Hindsight Intelligence" card that
 *               opens BriefDetailDialog when clicked.
 *
 * 2. sources  — every unique sourceUrl from the Signals routed to this analyst
 *               on the run's trading day. This is the "real" source list —
 *               news articles, filings, social posts, etc — instead of the
 *               Finnhub-spammed `_sources` arrays from each research tool call.
 *
 * 3. theses   — the run's Thesis records, normalized into the same shape as
 *               the dashboard's RecentPick / ThesisRowData so we can reuse
 *               <ThesisRow /> in the new Theses tab.
 */

import { prisma } from "@/lib/prisma";
import type { MorningBrief as IntelMorningBrief } from "@/components/intelligence/types";
import type { ThesisRowData } from "@/components/ui/thesis-row";

// ── Types ────────────────────────────────────────────────────────────────────

export type RunSourceItem = {
  /** Unique key for React */
  id: string;
  /** Site name or domain (e.g. "Reuters", "sec.gov") */
  siteName: string;
  /** Headline / title — line 1 of the card */
  headline: string;
  /** Body / excerpt — line 2 of the card (may be empty) */
  body: string;
  /** Outbound URL */
  url: string;
  /** Favicon URL */
  favicon: string;
};

export type RunSourcesData = {
  brief: IntelMorningBrief | null;
  sources: RunSourceItem[];
  theses: ThesisRowData[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=64`;
}

/**
 * Trading day window for a run. Signals routed within ±18h of the run's
 * start time are considered "the run's intelligence". Wider than 24h would
 * pull in the next day's brief; narrower would miss morning sweep signals
 * routed at 06:30 ET when the run started at 08:00 ET.
 */
function tradingDayWindow(startedAt: Date): { from: Date; to: Date } {
  const from = new Date(startedAt.getTime() - 18 * 3600 * 1000);
  const to = new Date(startedAt.getTime() + 18 * 3600 * 1000);
  return { from, to };
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function getRunSourcesData(args: {
  runId: string;
  analystId: string | null;
  startedAt: Date;
}): Promise<RunSourcesData> {
  const { runId, analystId, startedAt } = args;

  // ── 1. Morning brief for this analyst on the run's trading day ───────
  let brief: IntelMorningBrief | null = null;
  if (analystId) {
    // Match by date (00:00 UTC of the trading day). The agent reads briefs
    // by ET trading-day date; we approximate by looking up the brief whose
    // generatedAt is closest to startedAt within the same calendar window.
    const dbBrief = await prisma.morningBrief.findFirst({
      where: {
        analystId,
        generatedAt: {
          gte: tradingDayWindow(startedAt).from,
          lte: tradingDayWindow(startedAt).to,
        },
      },
      include: { analyst: { select: { id: true, name: true } } },
      orderBy: { generatedAt: "desc" },
    });

    if (dbBrief) {
      brief = {
        id: dbBrief.id,
        analystId: dbBrief.analystId,
        date: dbBrief.date.toISOString().slice(0, 10),
        marketContext: dbBrief.marketContext,
        portfolioAlerts: (dbBrief.portfolioAlerts as IntelMorningBrief["portfolioAlerts"]) ?? [],
        watchlistUpdates: (dbBrief.watchlistUpdates as IntelMorningBrief["watchlistUpdates"]) ?? [],
        newOpportunities: (dbBrief.newOpportunities as IntelMorningBrief["newOpportunities"]) ?? [],
        attentionPriority: dbBrief.attentionPriority,
        riskFlags: dbBrief.riskFlags,
        signalCount: dbBrief.signalCount,
        generatedAt: dbBrief.generatedAt.toISOString(),
        analyst: dbBrief.analyst,
      };
    }
  }

  // ── 2. Sources from signals routed to this analyst that day ─────────
  // Roll up unique URLs from Signal.sourceUrls. The previous "Finnhub spam"
  // came from each research tool call appending its own _sources array even
  // when no real article was involved. Signal sourceUrls are real URLs that
  // back the intelligence pipeline's findings, so we use those instead.
  const sources: RunSourceItem[] = [];
  if (analystId) {
    const { from, to } = tradingDayWindow(startedAt);
    const routes = await prisma.analystSignalRoute.findMany({
      where: {
        analystId,
        routedAt: { gte: from, lte: to },
      },
      include: {
        signal: {
          select: {
            id: true,
            headline: true,
            summary: true,
            sourceUrls: true,
            sourceNames: true,
          },
        },
      },
      orderBy: { routedAt: "desc" },
      take: 200,
    });

    const seen = new Set<string>();
    for (const r of routes) {
      const sig = r.signal;
      if (!sig) continue;
      // Pair url ↔ name; fall back to domain when names are missing.
      for (let i = 0; i < sig.sourceUrls.length; i++) {
        const url = sig.sourceUrls[i];
        if (!url || seen.has(url)) continue;
        seen.add(url);
        sources.push({
          id: `${sig.id}-${i}`,
          siteName: sig.sourceNames[i] ?? extractDomain(url),
          headline: sig.headline,
          body: sig.summary,
          url,
          favicon: faviconUrl(url),
        });
      }
    }
  }

  // ── 3. Theses recorded by this run, in row format ────────────────────
  const dbTheses = await prisma.thesis.findMany({
    where: { researchRunId: runId },
    include: {
      decisions: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { position: true },
      },
      researchRun: { include: { agentConfig: { select: { id: true, name: true } } } },
    },
    orderBy: { confidenceScore: "desc" },
  });

  const theses: ThesisRowData[] = dbTheses.map((t) => {
    const dec = t.decisions[0];
    const position = dec?.position;
    return {
      id: t.id,
      ticker: t.ticker,
      direction: t.direction,
      confidenceScore: t.confidenceScore,
      reasoningSummary: t.reasoningSummary,
      entryPrice: t.entryPrice,
      targetPrice: t.targetPrice,
      stopLoss: t.stopLoss,
      createdAt: t.createdAt.toISOString(),
      decision: dec?.decision ?? null,
      position: position
        ? {
            id: position.id,
            status: position.status,
            avgCost: position.avgCost,
            quantity: position.quantity ?? null,
            openedAt: position.openedAt.toISOString(),
          }
        : null,
      currentPrice: null,
      companyName: null,
      analystName: t.researchRun?.agentConfig?.name ?? null,
      analystId: t.researchRun?.agentConfig?.id ?? null,
      runId: t.researchRunId,
      sourcesUsed: t.sourcesUsed,
    };
  });

  return { brief, sources, theses };
}
