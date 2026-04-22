"use client";

/**
 * Sources — collapsible source list for tool results.
 * Thin wrapper around the existing SourceChips component.
 */

import { SourceChips } from "@/components/assistant-ui/tool-uis/tool-ui-shared";
import type { ToolSource as AgentToolSource } from "@/lib/agent/tool-result";

interface SourcesProps {
  sources: AgentToolSource[];
}

export function Sources({ sources }: SourcesProps) {
  if (!sources.length) return null;
  // ToolSource in tool-result.ts is structurally identical to ToolSource in tool-types.ts
  return <SourceChips sources={sources as Parameters<typeof SourceChips>[0]["sources"]} />;
}
