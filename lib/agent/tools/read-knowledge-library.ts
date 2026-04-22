/**
 * read_knowledge_library — surfaces the curated knowledge library to
 * the Analyst Builder, Editor, and Manager agents.
 *
 * Three topic modes:
 *   - "archetype" → full StrategyArchetype by ID (or index if id omitted)
 *   - "source"    → full SourceEntry by ID (or index if id omitted)
 *   - "signal"    → full SignalType by ID (or index if id omitted)
 *
 * The builder calls this after the user describes what they want, so
 * it can propose an analyst grounded in a real archetype rather than
 * free-form. The editor uses it when a user says "make it more
 * aggressive" — the archetype delta guides what actually to change.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import {
  getArchetype,
  archetypeIndex,
  getSource,
  sourceIndex,
  getSignalType,
  signalIndex,
} from "@/lib/agent/knowledge";

export const readKnowledgeLibrary = defineTool({
  description:
    "Read an entry from the Hindsight knowledge library — curated strategy archetypes, vetted research sources, and the signal-type taxonomy. " +
    "Call with {topic:'archetype'|'source'|'signal'} and optionally an id. Without an id you get the index; with an id you get the full entry. " +
    "Use this BEFORE calling suggest_config so your proposed config is grounded in a real archetype's prompt skeleton, signal set, and source list.",
  schema: z.object({
    topic: z.enum(["archetype", "source", "signal"]).describe(
      "Which catalog to query: 'archetype' for trading styles, 'source' for research sources, 'signal' for signal types.",
    ),
    id: z.string().optional().describe(
      "The entry ID (e.g. 'EARNINGS_DRIFT', 'SEC_EDGAR', 'INSIDER_BUYING'). Leave empty to list the index.",
    ),
  }),
  ui: "tool-ui" as const,
  groupId: "Knowledge",

  progressLabel: (args) => {
    const humanize = (id: string) =>
      id
        .toLowerCase()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    if (args.topic === "archetype") {
      return args.id
        ? `Reading the ${humanize(args.id)} playbook`
        : "Looking at the strategy playbook library";
    }
    if (args.topic === "signal") {
      return args.id
        ? `Reading the ${humanize(args.id)} signal type`
        : "Looking at the signal types we track";
    }
    // topic === "source"
    return args.id
      ? `Reading ${humanize(args.id)}'s source profile`
      : "Looking at trusted research sources";
  },

  execute: async (args) => {
    const { topic, id } = args;

    // Preview N names inline in the summary so the reader can see what's
    // actually in each catalog without expanding the row. Caps at 5 names
    // + "… and N more" so the line stays on-card.
    const previewNames = (names: string[]): string => {
      if (names.length === 0) return "(empty)";
      if (names.length <= 5) return names.join(", ");
      return `${names.slice(0, 5).join(", ")}, and ${names.length - 5} more`;
    };

    if (topic === "archetype") {
      if (!id) {
        const index = archetypeIndex();
        return {
          summary: `${index.length} playbooks: ${previewNames(index.map((a) => a.name))}`,
          data: {
            topic: "archetype" as const,
            mode: "index" as const,
            count: index.length,
            index,
          },
          // No sources on index views — browsing the catalog isn't a
          // citable claim. Entry loads still emit a source for the
          // specific playbook the agent actually read.
          sources: [],
        };
      }
      const entry = getArchetype(id);
      if (!entry) {
        return {
          summary: `Unknown playbook: ${id}`,
          data: {
            topic: "archetype" as const,
            mode: "entry" as const,
            found: false,
            id,
            hint: `Available playbooks: ${archetypeIndex().map((a) => a.name).join(", ")}`,
          },
          sources: [],
        };
      }
      return {
        summary: `Loaded the ${entry.name} playbook`,
        data: {
          topic: "archetype" as const,
          mode: "entry" as const,
          found: true,
          entry,
          // `content` is the full human-readable text the agent actually
          // read. ToolUIRenderer renders the text via the generic fallback in the
          // tool row — same pattern Claude/Notion use. No custom card.
          content: formatArchetypeMarkdown(entry),
        },
        // No source emission — the playbook IS the tool row itself,
        // expandable to show the full content. A citation chip would
        // imply an external reference, which this isn't.
        sources: [],
      };
    }

    if (topic === "source") {
      if (!id) {
        const index = sourceIndex();
        return {
          summary: `${index.length} research sources: ${previewNames(index.map((s) => s.name))}`,
          data: {
            topic: "source" as const,
            mode: "index" as const,
            count: index.length,
            index,
          },
          sources: [],
        };
      }
      const entry = getSource(id);
      if (!entry) {
        return {
          summary: `Unknown source: ${id}`,
          data: {
            topic: "source" as const,
            mode: "entry" as const,
            found: false,
            id,
            hint: `Known sources: ${sourceIndex().slice(0, 15).map((s) => s.name).join(", ")}…`,
          },
          sources: [],
        };
      }
      return {
        summary: `Loaded source profile: ${entry.name}`,
        data: {
          topic: "source" as const,
          mode: "entry" as const,
          found: true,
          entry,
          content: formatSourceMarkdown(entry),
        },
        sources: [],
      };
    }

    // topic === "signal"
    if (!id) {
      const index = signalIndex();
      return {
        summary: `${index.length} signal types: ${previewNames(index.map((s) => s.name))}`,
        data: {
          topic: "signal" as const,
          mode: "index" as const,
          count: index.length,
          index,
        },
        sources: [],
      };
    }
    const entry = getSignalType(id);
    if (!entry) {
      return {
        summary: `Unknown signal type: ${id}`,
        data: {
          topic: "signal" as const,
          mode: "entry" as const,
          found: false,
          id,
          hint: `Known signal types: ${signalIndex().map((s) => s.name).join(", ")}`,
        },
        sources: [],
      };
    }
    return {
      summary: `Loaded signal type: ${entry.name}`,
      data: {
        topic: "signal" as const,
        mode: "entry" as const,
        found: true,
        entry,
        content: formatSignalMarkdown(entry),
      },
      sources: [],
    };
  },
});

// ── Markdown formatters (content shown in the expanded Tool UI row) ──

type ArchetypeEntry = ReturnType<typeof getArchetype>;
type SourceEntryType = ReturnType<typeof getSource>;
type SignalEntry = ReturnType<typeof getSignalType>;

function humanizeToken(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Plain text formatters — no markdown headings, no ** bold, no list
// markers. Output is a flat text block the Tool UI shows with
// whitespace-pre-wrap so it visually matches the other tool-call content
// bodies (Reading Signals, Reading Morning Briefing, etc).

function formatArchetypeMarkdown(entry: NonNullable<ArchetypeEntry>): string {
  const lines: string[] = [];
  lines.push(entry.name);
  if (entry.tagline) lines.push(entry.tagline);
  lines.push("");
  lines.push(`Direction: ${humanizeToken(entry.directionBias)}`);
  if (entry.holdDurations?.length) {
    lines.push(`Hold durations: ${entry.holdDurations.map(humanizeToken).join(", ")}`);
  }
  lines.push("");
  if (entry.edge) {
    lines.push("Why the edge exists:");
    lines.push(entry.edge);
    lines.push("");
  }
  if (entry.primarySignals?.length) {
    lines.push("Signals that fire this:");
    lines.push(entry.primarySignals.map(humanizeToken).join(", "));
    lines.push("");
  }
  if (entry.keySources?.length) {
    lines.push("Research sources it leans on:");
    lines.push(entry.keySources.map(humanizeToken).join(", "));
    lines.push("");
  }
  if (entry.risk) {
    lines.push("Suggested risk profile:");
    if (entry.risk.minConfidence) {
      lines.push(`  Confidence: ${entry.risk.minConfidence[0]}–${entry.risk.minConfidence[1]}%`);
    }
    if (entry.risk.positionSizeBand) {
      lines.push(
        `  Position size: $${entry.risk.positionSizeBand[0].toLocaleString()}–$${entry.risk.positionSizeBand[1].toLocaleString()}`,
      );
    }
    if (entry.risk.maxOpenPositions != null) {
      lines.push(`  Max concurrent positions: ${entry.risk.maxOpenPositions}`);
    }
    lines.push("");
  }
  if (entry.universeHints) {
    const bits: string[] = [];
    if (entry.universeHints.sectors?.length) bits.push(`sectors: ${entry.universeHints.sectors.join(", ")}`);
    if (entry.universeHints.industries?.length) bits.push(`industries: ${entry.universeHints.industries.join(", ")}`);
    if (entry.universeHints.themes?.length) bits.push(`themes: ${entry.universeHints.themes.join(", ")}`);
    if (entry.universeHints.marketCapMinUSD != null || entry.universeHints.marketCapMaxUSD != null) {
      const lo = entry.universeHints.marketCapMinUSD;
      const hi = entry.universeHints.marketCapMaxUSD;
      bits.push(`market cap: ${lo != null ? "$" + lo.toLocaleString() : "any"}–${hi != null ? "$" + hi.toLocaleString() : "any"}`);
    }
    if (bits.length) {
      lines.push("Universe hints:");
      bits.forEach((b) => lines.push(`  ${b}`));
      lines.push("");
    }
  }
  if (entry.promptSkeleton) {
    lines.push("Prompt skeleton:");
    lines.push(entry.promptSkeleton);
    lines.push("");
  }
  if (entry.watchOutFor?.length) {
    lines.push("Watch out for:");
    entry.watchOutFor.forEach((w) => lines.push(`  • ${w}`));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatSourceMarkdown(entry: NonNullable<SourceEntryType>): string {
  const lines: string[] = [];
  lines.push(entry.name);
  if ("domain" in entry && entry.domain) lines.push(`https://${entry.domain}`);
  lines.push("");
  const fields: Array<[string, unknown]> = Object.entries(entry).filter(
    ([k]) => !["id", "name", "domain"].includes(k),
  );
  for (const [k, v] of fields) {
    if (v == null) continue;
    const label = humanizeToken(k);
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${label}: ${v.map((x) => String(x)).join(", ")}`);
    } else if (typeof v === "object") {
      lines.push(`${label}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${label}: ${String(v)}`);
    }
  }
  return lines.join("\n").trim();
}

function formatSignalMarkdown(entry: NonNullable<SignalEntry>): string {
  const lines: string[] = [];
  lines.push(entry.name);
  lines.push("");
  const fields: Array<[string, unknown]> = Object.entries(entry).filter(
    ([k]) => !["id", "name"].includes(k),
  );
  for (const [k, v] of fields) {
    if (v == null) continue;
    const label = humanizeToken(k);
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${label}: ${v.map((x) => String(x)).join(", ")}`);
    } else if (typeof v === "object") {
      lines.push(`${label}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${label}: ${String(v)}`);
    }
  }
  return lines.join("\n").trim();
}
