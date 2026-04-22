/**
 * ToolResult — canonical shape for all agent tool returns.
 *
 * Every tool using defineTool() returns one of these. The `ui` field is a
 * discriminator that ToolCallRow reads to pick a renderer.
 *
 * Renderer architecture (see CLAUDE.md):
 *   "tool-ui"        → ToolUIRenderer — the ONE generic renderer. Reads
 *                      data.items[] (each item is ticker- or generic-kind)
 *                      and renders them as ToolProgress rows. ~90% of tools
 *                      route here. No per-tool custom renderers.
 *   "thesis-card"    → ThesisCardRenderer — renders the full ThesisCard
 *   "run-summary"    → RunSummaryRenderer — renders the ranked-picks table
 *                      (DecisionSummaryCard) with exposure breakdown
 *   "config-preview" → ConfigPreviewRenderer — builder/editor diff view
 *   "ask-question"   → AskQuestionRenderer — interactive QuickReply flow
 *
 * DO NOT add new UI values for list-shaped tools. If a tool returns a
 * collapsible row with header + items + maybe sources, it uses "tool-ui".
 */

// ── UI discriminator ─────────────────────────────────────────────────────────

export type ToolUI =
  | "tool-ui"          // ToolUIRenderer: ToolProgress with data.items[] + sources
  | "thesis-card"      // ThesisCardRenderer
  | "run-summary"      // RunSummaryRenderer (DecisionSummaryCard)
  | "config-preview"   // ConfigPreviewRenderer
  | "ask-question";    // AskQuestionRenderer

// ── Unified item model for ToolUIRenderer ────────────────────────────────────

/**
 * A single row inside a ToolProgress content area. Every list-shaped tool
 * returns an array of these on `data.items`. Two kinds, matching the two
 * item components in components/ai-elements/tool-progress.tsx:
 *   - "ticker" → ToolProgressTickerItem (ticker logo + chip + text)
 *   - "generic" → ToolProgressItem (dot + text)
 */
export type ToolUIItem =
  | {
      kind: "ticker";
      ticker: string;
      tag?: string;
      text: string;
      /** Optional action badge overlay (buy/sell/watch/etc.) on the logo */
      actionIcon?:
        | "buy"
        | "sell"
        | "watch"
        | "unwatch"
        | "closed-win"
        | "closed-loss"
        | "failed";
    }
  | { kind: "generic"; text: string };

// ── Source attribution ───────────────────────────────────────────────────────

export interface ToolSource {
  provider: string;
  title: string;
  url?: string;
  excerpt?: string;
}

// ── Result shape ─────────────────────────────────────────────────────────────

export type ToolResult<T = unknown> =
  | {
      ok: true;
      ui: ToolUI;
      /** Phase groupId — consecutive tools with same groupId collapse in UI */
      groupId?: string;
      /**
       * Human-readable, present-tense gerund label describing what this
       * tool call is DOING — shown in the row + used to derive the group
       * header. Falls back to the tool name when absent. Examples:
       *   "Reading the Momentum Breakout playbook"
       *   "Checking today's market regime"
       *   "Pulling $NVDA's snapshot"
       */
      progressLabel?: string;
      summary: string;
      data: T;
      sources: ToolSource[];
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      sources: ToolSource[];
    };

// ── Compatibility shim ───────────────────────────────────────────────────────

/**
 * Convert any tool result shape (legacy ResearchToolResult, pre-collapse
 * ToolResult with legacy `ui` values, or current ToolResult) into the
 * current ToolResult shape. Used by ToolCallRow for historical replay.
 */
export function normalizeToolResult(
  toolName: string,
  raw: unknown,
): ToolResult {
  if (raw == null) {
    return { ok: true, ui: "tool-ui", summary: "Complete", data: null, sources: [] };
  }

  // Already a current ToolResult (ok + ui present)
  if (typeof raw === "object" && "ok" in (raw as object)) {
    const r = raw as ToolResult;
    if (r.ok && "ui" in r) {
      // Remap legacy UI discriminators baked into old DB rows.
      return { ...r, ui: remapLegacyUi(r.ui as string) };
    }
    return r;
  }

  const r = raw as Record<string, unknown>;

  // Error shape from old tools (bare errors)
  if (r.error && !r.summary && !r.data) {
    return {
      ok: false,
      error: r.error as string,
      retryable: false,
      sources: [],
    };
  }

  // Legacy ResearchToolResult: { summary, _sources, data, tickers? }
  const summary = (r.summary as string) ?? "Complete";
  const sources = (r._sources as ToolSource[]) ?? [];
  const data = r.data ?? r;
  const ui = inferLegacyUI(toolName);
  const groupId = inferLegacyGroupId(toolName);

  return { ok: true, ui, summary, data, sources, ...(groupId !== undefined ? { groupId } : {}) };
}

function inferLegacyGroupId(toolName: string): string | undefined {
  if (
    toolName === "get_stock_data" ||
    toolName === "get_earnings_data" ||
    toolName === "get_options_flow" ||
    toolName === "get_sec_filings" ||
    toolName === "get_market_context"
  ) return "Researching";
  if (
    toolName === "place_trade" ||
    toolName === "close_position" ||
    toolName === "manage_position" ||
    toolName === "manage_watchlist"
  ) return "Executing";
  return undefined;
}

function inferLegacyUI(toolName: string): ToolUI {
  if (toolName === "record_thesis" || toolName === "show_thesis") return "thesis-card";
  if (toolName === "record_run_summary" || toolName === "summarize_run") return "run-summary";
  if (toolName === "suggest_config") return "config-preview";
  if (toolName === "ask_question") return "ask-question";
  return "tool-ui";
}

/**
 * Remap a ui string persisted by an older tool implementation to the
 * current collapsed ToolUI union. Replayed DB rows can carry strings like
 * "generic" / "ticker" / "ticker-list" / "source" / "morning-brief" /
 * "decision-summary" — all of those now render through the single
 * ToolUIRenderer.
 */
function remapLegacyUi(ui: string): ToolUI {
  switch (ui) {
    case "thesis-card":
    case "run-summary":
    case "config-preview":
    case "ask-question":
    case "tool-ui":
      return ui;
    default:
      // generic | ticker | ticker-list | source | morning-brief
      // | decision-summary | anything-else → unified tool UI
      return "tool-ui";
  }
}
