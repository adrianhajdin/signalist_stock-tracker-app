"use client";

import { createContext, useContext } from "react";
import type { SourceChipData } from "@/components/chat/SourceChip";

const SourcesContext = createContext<SourceChipData[]>([]);

export function SourcesProvider({
  sources,
  children,
}: {
  sources: SourceChipData[];
  children: React.ReactNode;
}) {
  return (
    <SourcesContext.Provider value={sources}>
      {children}
    </SourcesContext.Provider>
  );
}

export function useSources(): SourceChipData[] {
  return useContext(SourcesContext);
}

/**
 * Extract sources from all tool-call results in a message's content parts.
 * Sources are flattened in order of appearance and numbered sequentially.
 *
 * Checks both envelope shapes:
 *   - New `defineTool()` tools return `{ ok, ui, summary, data, sources }`.
 *   - Legacy tools wrote a top-level `_sources` key.
 * We prefer `sources` (new) and fall back to `_sources` (legacy) so old
 * runs still render citations when replayed.
 */
export function extractSourcesFromParts(
  parts: Array<{ type: string; result?: unknown; output?: unknown }>,
): SourceChipData[] {
  const allSources: SourceChipData[] = [];

  for (const part of parts) {
    if (part.type !== "tool-call") continue;

    // AI SDK v6 streams tool outputs under `output`; older callers used `result`.
    const raw = part.result ?? part.output;
    if (!raw || typeof raw !== "object") continue;
    const result = raw as Record<string, unknown>;

    const newSources = result.sources;
    const legacySources = result._sources;
    const sources = Array.isArray(newSources)
      ? newSources
      : Array.isArray(legacySources)
        ? legacySources
        : null;
    if (!sources) continue;

    for (const s of sources) {
      if (typeof s === "object" && s !== null && "provider" in s && "title" in s) {
        allSources.push({
          provider: String(s.provider),
          title: String(s.title),
          url: typeof s.url === "string" ? s.url : undefined,
          excerpt: typeof s.excerpt === "string" ? s.excerpt : undefined,
        });
      }
    }
  }

  return allSources;
}
