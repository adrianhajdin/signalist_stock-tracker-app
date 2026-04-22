"use client";

/**
 * ToolCallGroup — generic collapsible group.
 *
 * Groups consecutive tool-call parts with the same groupId into one
 * ToolProgress block. Every child renders via <ToolCallRow inGroup />.
 * Solo parts (no groupId) render via <ToolCallRow /> directly.
 *
 * Zero knowledge of group type. Zero special-case blocks.
 */

import { useMessage } from "@assistant-ui/react";
import { useMemo, type ReactNode } from "react";
import { ToolCallRow } from "./ToolCallRow";
import { normalizeToolResult } from "@/lib/agent/tool-result";
import { useToolDedupeCursor } from "./tool-dedupe-context";
import {
  ToolProgress,
  ToolProgressHeader,
  ToolProgressContent,
} from "@/components/ai-elements/tool-progress";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolCallPart {
  type: string;
  toolName: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  state?: string;
}

type Block =
  | { kind: "solo"; part: ToolCallPart; index: number }
  | { kind: "group"; groupId: string; parts: Array<{ part: ToolCallPart; index: number }> };

interface ToolGroupProps {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ToolCallGroup({ startIndex, endIndex }: ToolGroupProps) {
  const content = useMessage((m) => m.content);
  // Cross-message dedup cursor. Each ToolCallGroup renders for ONE
  // message only, so within-message dedup can't catch the same tool
  // call repeated across adjacent messages. The cursor here is a
  // shared ref updated as each ToolCallGroup renders — React renders
  // messages top-down, so by the time this instance runs, the cursor
  // holds the previous message's last key.
  const dedupeCursor = useToolDedupeCursor();

  const blocks = useMemo<Block[]>(() => {
    const result: Block[] = [];
    let groupBuffer: Array<{ part: ToolCallPart; index: number }> | null = null;
    let activeGroupId: string | null = null;

    const flushGroup = () => {
      if (groupBuffer && groupBuffer.length > 0) {
        result.push({ kind: "group", groupId: activeGroupId!, parts: groupBuffer });
        groupBuffer = null;
        activeGroupId = null;
      }
    };

    const stableArgKey = (part: ToolCallPart): string => {
      const args = part.args ?? part.input ?? {};
      try {
        return `${part.toolName}::${JSON.stringify(args)}`;
      } catch {
        return part.toolName;
      }
    };

    // Seed local cursor from the cross-message cursor. This way dedup
    // catches BOTH (a) duplicates inside this message's parts and (b)
    // a duplicate at the top of this message that matches the last
    // call of the PREVIOUS message.
    //
    // IMPORTANT: prevArgKey persists across non-tool-call parts. If the
    // model emits `tool-call X → reasoning/text → tool-call X`, we
    // still want to skip the second. Only the *grouping* breaks on
    // non-tool-call boundaries (via flushGroup), NOT the dedup key.
    let prevArgKey: string | null = dedupeCursor.current.lastKey;

    for (let i = startIndex; i <= endIndex; i++) {
      const part = (content as unknown[])[i] as ToolCallPart | undefined;
      if (!part || part.type !== "tool-call") {
        flushGroup();
        continue;
      }

      const argKey = stableArgKey(part);
      if (argKey === prevArgKey) {
        // Skip duplicate consecutive tool call with identical args.
        continue;
      }
      prevArgKey = argKey;

      const rawResult = part.result ?? part.output;
      const normalized = rawResult != null
        ? normalizeToolResult(part.toolName, rawResult)
        : null;

      const partGroupId = normalized?.ok ? normalized.groupId ?? null : null;

      if (partGroupId) {
        if (partGroupId === activeGroupId) {
          groupBuffer!.push({ part, index: i });
        } else {
          flushGroup();
          activeGroupId = partGroupId;
          groupBuffer = [{ part, index: i }];
        }
      } else {
        flushGroup();
        result.push({ kind: "solo", part, index: i });
      }
    }

    flushGroup();

    // Publish this message's last key back to the cross-message cursor
    // so the NEXT message's ToolCallGroup sees it. Done in the render
    // pass, not a useEffect, so the next message renders with correct
    // state on this same pass.
    dedupeCursor.current.lastKey = prevArgKey;

    return result;
  }, [content, startIndex, endIndex, dedupeCursor]);

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, idx) => {
        // Single-element group? Render as solo — otherwise the group
        // wrapper's header and the child's own header are identical,
        // and the user sees the same label stacked twice (e.g.
        // "Reading the Catalyst Event playbook" nested inside
        // "Reading the Catalyst Event playbook"). The group wrapper
        // only earns its keep when it's collapsing ≥2 sibling calls
        // with "(+N more)" semantics.
        if (block.kind === "solo" || (block.kind === "group" && block.parts.length === 1)) {
          const { part, index } = block.kind === "solo"
            ? block
            : { part: block.parts[0].part, index: block.parts[0].index };
          const rawResult = part.result ?? part.output;
          const args = part.args ?? part.input ?? {};
          const isLoading = rawResult === undefined && part.state !== "output-available";
          return (
            <ToolCallRow
              key={`solo-${index}`}
              toolName={part.toolName}
              toolCallId={part.toolCallId}
              args={args as Record<string, unknown>}
              rawResult={rawResult}
              loading={isLoading}
            />
          );
        }

        // Generic group — ONE ToolProgress, all children via ToolCallRow
        const loadingAny = block.parts.some(
          (p) => (p.part.result ?? p.part.output) === undefined,
        );

        // Derive a Chain-of-Thought-style header: use the first part's
        // progressLabel as the narrative lead, append "(+N more)" when
        // there are sibling calls in the same phase. Falls back to the
        // groupId (a short noun) when no part has a label yet.
        const progressLabels = block.parts
          .map(({ part }) => {
            const rawResult = part.result ?? part.output;
            if (rawResult == null) return null;
            const normalized = normalizeToolResult(part.toolName, rawResult);
            return normalized.ok ? normalized.progressLabel ?? null : null;
          })
          .filter((l): l is string => typeof l === "string" && l.length > 0);

        let header: string;
        if (progressLabels.length > 0) {
          const [first, ...rest] = progressLabels;
          header = rest.length > 0 ? `${first} (+${rest.length} more)` : first;
        } else {
          const tickers = [
            ...new Set(
              block.parts
                .map(({ part }) => {
                  const args = (part.args ?? part.input ?? {}) as Record<string, unknown>;
                  return args.ticker as string | undefined;
                })
                .filter(Boolean) as string[],
            ),
          ];
          header = tickers.length > 0 ? `${block.groupId} ${tickers.join(", ")}` : block.groupId;
        }

        return (
          <ToolProgress key={`group-${idx}`} defaultOpen={true}>
            <ToolProgressHeader loading={loadingAny}>{header}</ToolProgressHeader>
            <ToolProgressContent>
              {block.parts.map(({ part, index }) => {
                const rawResult = part.result ?? part.output;
                const args = part.args ?? part.input ?? {};
                const isLoading = rawResult === undefined && part.state !== "output-available";
                return (
                  <ToolCallRow
                    key={index}
                    toolName={part.toolName}
                    toolCallId={part.toolCallId}
                    args={args as Record<string, unknown>}
                    rawResult={rawResult}
                    loading={isLoading}
                    inGroup
                  />
                );
              })}
            </ToolProgressContent>
          </ToolProgress>
        );
      })}
    </>
  );
}
