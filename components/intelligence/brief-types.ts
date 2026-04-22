import type { MorningBrief } from "./types";
import type { AnalystBriefingItem } from "@/lib/actions/analyst.actions";

// ── Unified Brief ───────────────────────────────────────────────────────────
// Normalized shape for the card. The dialog gets the original data.

export type UnifiedBrief = {
  id: string;
  type: "intel" | "run";
  analystName: string;
  date: string; // ISO
  preview: string;
  tickers: string[];
  signalCount?: number;
  // Original data for the dialog
  intelBrief?: MorningBrief;
  runBrief?: AnalystBriefingItem;
};

// ── Normalizers ─────────────────────────────────────────────────────────────

export function normalizeIntelBrief(brief: MorningBrief): UnifiedBrief {
  return {
    id: brief.id,
    type: "intel",
    analystName: brief.analyst.name,
    date: brief.generatedAt,
    preview: brief.marketContext,
    tickers: brief.attentionPriority ?? [],
    signalCount: brief.signalCount,
    intelBrief: brief,
  };
}

export function normalizeRunBrief(brief: AnalystBriefingItem, analystName: string): UnifiedBrief {
  // Extract tickers from watchTomorrow
  const watchItems = Array.isArray(brief.watchTomorrow) ? brief.watchTomorrow : [];
  const tickers = watchItems
    .map((w: { symbol?: string }) => w.symbol)
    .filter((s): s is string => !!s);

  return {
    id: brief.id,
    type: "run",
    analystName,
    date: new Date(brief.createdAt).toISOString(),
    preview: brief.narrative.length > 200 ? brief.narrative.slice(0, 197) + "..." : brief.narrative,
    tickers,
    runBrief: brief,
  };
}
