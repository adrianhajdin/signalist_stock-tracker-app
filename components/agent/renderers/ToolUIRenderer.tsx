"use client";

/**
 * ToolUIRenderer — ui: "tool-ui"
 *
 * The ONE generic renderer. Every list-shaped tool (morning brief, signals,
 * stock data, earnings, options flow, SEC filings, market context, artifact
 * reads, web search, trades, watchlist edits, knowledge library, inbox stats,
 * run completion, etc.) routes here.
 *
 * Contract: tool returns `data.items: ToolUIItem[]`. This renderer wraps
 * them in a collapsible ToolProgress, mapping each item to either
 * ToolProgressTickerItem or ToolProgressItem based on its kind. Tool
 * sources (favicon chips) render below.
 *
 * Legacy-compat: for tool results that predate this consolidation, falls
 * back to deriving items from `data.tickers[]` (old ticker-row shape) or
 * rendering `data.content` as a single generic item. Do NOT lean on this
 * fallback for new tools — set `data.items` explicitly.
 */

import type { ToolResult, ToolUIItem } from "@/lib/agent/tool-result";
import {
  ToolProgress,
  ToolProgressHeader,
  ToolProgressContent,
  ToolProgressItem,
  ToolProgressTickerItem,
} from "@/components/ai-elements/tool-progress";
import {
  extractToolSources,
  SourceChips,
} from "@/components/assistant-ui/tool-uis/tool-ui-shared";

interface Props {
  toolName: string;
  args?: Record<string, unknown>;
  result: Extract<ToolResult, { ok: true }>;
  loading: boolean;
  /** When true, render flat rows only — the group supplies the ToolProgress wrapper */
  inGroup?: boolean;
}

type LegacyTicker = { ticker: string; tag?: string; summary?: string; text?: string };

function deriveItems(
  data: Record<string, unknown> | null,
  args: Record<string, unknown> | undefined,
  summary: string,
): ToolUIItem[] {
  if (!data) return [];

  // Preferred path: tool already returns the canonical items array
  if (Array.isArray(data.items)) return data.items as ToolUIItem[];

  // Legacy replay path: { tickers: [{ticker, tag, summary}] }
  if (Array.isArray(data.tickers)) {
    const tickers = data.tickers as LegacyTicker[];
    return tickers.map((t) => ({
      kind: "ticker" as const,
      ticker: t.ticker,
      tag: t.tag,
      text: t.text ?? t.summary ?? "",
    }));
  }

  // Legacy replay path: { content: "..." } (old GenericRenderer)
  if (typeof data.content === "string" && data.content.trim()) {
    return [{ kind: "generic", text: data.content }];
  }

  // Legacy single-ticker callsites (old TickerRenderer fallback)
  if (typeof args?.ticker === "string" && summary) {
    return [
      {
        kind: "ticker" as const,
        ticker: args.ticker as string,
        text: summary,
      },
    ];
  }

  return [];
}

export function ToolUIRenderer({ toolName, args, result, loading, inGroup }: Props) {
  const data = result.data as Record<string, unknown> | null;
  const items = deriveItems(data, args, result.summary);

  const label =
    result.progressLabel ?? TOOL_LABELS[toolName] ?? result.summary.slice(0, 60);

  const rawResult = { ...(data ?? {}), _sources: result.sources };
  const sources = loading
    ? []
    : extractToolSources(rawResult as Record<string, unknown>);

  const rows =
    items.length > 0
      ? items.map((it, i) =>
          it.kind === "ticker" ? (
            <ToolProgressTickerItem
              key={i}
              ticker={it.ticker}
              tag={it.tag}
              actionIcon={it.actionIcon}
            >
              {it.text}
            </ToolProgressTickerItem>
          ) : (
            <ToolProgressItem key={i}>{it.text}</ToolProgressItem>
          ),
        )
      : [<ToolProgressItem key="fallback">{result.summary}</ToolProgressItem>];

  const body = (
    <>
      {rows}
      <SourceChips sources={sources} />
    </>
  );

  if (inGroup) {
    return <>{body}</>;
  }

  return (
    <ToolProgress defaultOpen={loading}>
      <ToolProgressHeader loading={loading}>{label}</ToolProgressHeader>
      <ToolProgressContent>{body}</ToolProgressContent>
    </ToolProgress>
  );
}

/**
 * Tool-specific header labels — shown when a tool doesn't supply its own
 * progressLabel. Keep these short; the per-tool progressLabel is preferred.
 */
const TOOL_LABELS: Record<string, string> = {
  read_morning_brief: "Morning brief",
  read_signals: "Signals",
  read_artifact: "Reading article",
  web_search: "Web search",
  get_portfolio_context: "Current portfolio",
  complete_run: "Completing run",
};
