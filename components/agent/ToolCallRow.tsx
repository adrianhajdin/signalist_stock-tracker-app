"use client";

/**
 * ToolCallRow — generic row. Reads result.ui, dispatches to the correct renderer.
 *
 * When inGroup=true, renderers omit their outer ToolProgress wrapper and render
 * flat content only — the group's ToolProgress is the container.
 *
 * Renderer surface is intentionally minimal (see CLAUDE.md):
 *   "tool-ui"        → ToolUIRenderer (the ONE generic renderer)
 *   "thesis-card"    → ThesisCardRenderer
 *   "run-summary"    → RunSummaryRenderer
 *   "config-preview" → ConfigPreviewRenderer
 *   "ask-question"   → AskQuestionRenderer
 *
 * Do NOT add a new renderer for a list-shaped tool. Return `ui: "tool-ui"`
 * and `data.items: ToolUIItem[]` from the tool and let ToolUIRenderer handle it.
 */

import type { ToolUI } from "@/lib/agent/tool-result";
import { normalizeToolResult } from "@/lib/agent/tool-result";
import type { ToolResult } from "@/lib/agent/tool-result";
import { ToolUIRenderer } from "./renderers/ToolUIRenderer";
import { ThesisCardRenderer } from "./renderers/ThesisCardRenderer";
import { RunSummaryRenderer } from "./renderers/RunSummaryRenderer";
import { ConfigPreviewRenderer } from "./renderers/ConfigPreviewRenderer";
import { AskQuestionRenderer } from "./renderers/AskQuestionRenderer";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  toolName: string;
  toolCallId?: string;
  args: Record<string, unknown>;
  rawResult: unknown;
  /** True while the tool is still executing (no result yet) */
  loading: boolean;
  /** True when rendered inside a group's ToolProgressContent */
  inGroup?: boolean;
}

export function ToolCallRow({ toolName, toolCallId, args, rawResult, loading, inGroup }: Props) {
  const result: ToolResult = rawResult != null
    ? normalizeToolResult(toolName, rawResult)
    : { ok: true, ui: inferLoadingUI(toolName), summary: "", data: null, sources: [] };

  if (!result.ok) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-3 text-sm text-destructive">
          {toolName}: {result.error}
        </CardContent>
      </Card>
    );
  }

  const ui: ToolUI = result.ui;

  switch (ui) {
    case "thesis-card":
      return <ThesisCardRenderer toolName={toolName} toolCallId={toolCallId} result={result} loading={loading} />;
    case "run-summary":
      return <RunSummaryRenderer result={result} loading={loading} />;
    case "config-preview":
      return <ConfigPreviewRenderer result={result} loading={loading} />;
    case "ask-question":
      return <AskQuestionRenderer toolName={toolName} result={result} loading={loading} />;
    case "tool-ui":
    default:
      return <ToolUIRenderer toolName={toolName} args={args} result={result} loading={loading} inGroup={inGroup} />;
  }
}

function inferLoadingUI(toolName: string): ToolUI {
  if (toolName === "record_thesis" || toolName === "show_thesis") return "thesis-card";
  if (toolName === "record_run_summary" || toolName === "summarize_run") return "run-summary";
  if (toolName === "suggest_config") return "config-preview";
  if (toolName === "ask_question") return "ask-question";
  return "tool-ui";
}
