/**
 * Knowledge library — the structured "book of the firm" the Analyst
 * Builder/Editor/Manager agents consult when making decisions.
 *
 * Three catalogs, one unified entry point:
 *   - strategy archetypes — trading styles with edge, risk, prompt skeletons
 *   - source catalog — vetted research sources with quality scores
 *   - signal type catalog — the taxonomy of signals the router speaks
 *
 * Each file is safe to import independently. This index re-exports the
 * high-traffic symbols and provides a `summarizeKnowledgeForPrompt()`
 * helper that turns the library into a compact system-prompt block.
 */

export {
  STRATEGY_ARCHETYPES,
  getArchetype,
  archetypesByDirection,
  archetypeIndex,
  type StrategyArchetype,
  type HoldDuration,
  type DirectionBias,
} from "./strategy-archetypes";

export {
  SOURCE_CATALOG,
  getSource,
  sourcesByCategory,
  premiumSources,
  sourceIndex,
  resolveSourceIds,
  type SourceEntry,
  type SourceCategory,
} from "./source-catalog";

export {
  SIGNAL_TYPES,
  getSignalType,
  signalsByCategory,
  resolveSignalIds,
  allSignalIds,
  signalIndex,
  type SignalType,
  type SignalCategory,
} from "./signal-type-catalog";

import { archetypeIndex } from "./strategy-archetypes";
import { sourceIndex } from "./source-catalog";
import { signalIndex } from "./signal-type-catalog";

/**
 * Compact summary string for inclusion in system prompts. Keeps the
 * payload small (the full catalogs are read on demand via the
 * read_knowledge_library tool).
 */
export function summarizeKnowledgeForPrompt(): string {
  const archetypes = archetypeIndex()
    .map((a) => `  - ${a.id}: ${a.name} — ${a.tagline}`)
    .join("\n");
  const signals = signalIndex()
    .map((s) => `  - ${s.id} [${s.category}]: ${s.name}`)
    .join("\n");
  const topSources = sourceIndex()
    .filter((s) => s.quality >= 4)
    .map((s) => `  - ${s.id} (${s.domain}) [${s.category}]: ${s.name}`)
    .join("\n");

  return `## Knowledge Library (summary)

You have access to a structured knowledge library of trading strategies,
research sources, and signal types. Use it to ground every config proposal.

### Strategy archetypes
${archetypes}

### Signal types
${signals}

### Premium sources (quality ≥ 4)
${topSources}

When you need the full entry for an archetype, source, or signal type,
call the \`read_knowledge_library\` tool. Do NOT invent archetypes,
signal IDs, or sources that are not in the catalog — they must match
these IDs exactly for the router and monitors to pick them up.`;
}
