/**
 * suggest_config tool — used in builder and editor modes.
 *
 * Returns the config object as-is. The UI side reads the tool call args
 * (via the ToolCallRow config-preview renderer) to render a preview card.
 */

import { tool } from "ai";
import { z } from "zod";
import { SECTORS, INDUSTRIES } from "@/lib/universe/canonical";
import { GICS_INDUSTRIES_BY_SECTOR, type GicsSector } from "@/lib/universe/gics";

// z.enum needs a non-empty tuple literal; derive one from the canonical lists.
const SECTOR_VALUES = [...SECTORS] as [string, ...string[]];
const INDUSTRY_VALUES = [...INDUSTRIES] as [string, ...string[]];

// ── Normalizer: strips common agent mistakes before Zod validation ──────────
// Every trip-wire below was being hit by real editor/builder runs and
// producing a Zod wall of red in the UI. We now heal the config silently:
// strip sentinel zeros, clamp oversized market-cap ceilings, and back-fill
// `industries` from the chosen `sectors` when the agent forgets to narrow.
// Auto-fill defaults to ALL GICS industries inside the chosen sectors — the
// same semantics as "cross-industry sector-wide exposure" the strict refine
// used to demand the user ask for. Wider fence is recoverable; a hard error
// mid-edit is not.
//
// Kept strict: unknown sector/industry enum values, market-cap sentinels
// above $5T (still caught by the belt-and-suspenders refine below).
function normalizeSuggestConfig(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const cfg: Record<string, unknown> = { ...(input as Record<string, unknown>) };

  // Strip sentinel 0s on market cap — agents send 0 when they mean "no floor".
  if (cfg.marketCapMin === 0) delete cfg.marketCapMin;
  if (cfg.marketCapMax === 0) delete cfg.marketCapMax;
  if (typeof cfg.marketCapMax === "number" && cfg.marketCapMax >= 5e12) {
    delete cfg.marketCapMax;
  }

  // Auto-fill top-level industries from sectors when missing/empty.
  if (Array.isArray(cfg.sectors) && cfg.sectors.length > 0) {
    const industries = cfg.industries;
    if (!Array.isArray(industries) || industries.length === 0) {
      cfg.industries = (cfg.sectors as string[]).flatMap(
        (s) => GICS_INDUSTRIES_BY_SECTOR[s as GicsSector] ?? [],
      );
    }
  }

  // Same normalizations inside the universe sub-object.
  if (cfg.universe && typeof cfg.universe === "object") {
    const u: Record<string, unknown> = { ...(cfg.universe as Record<string, unknown>) };
    if (u.marketCapMin === 0) delete u.marketCapMin;
    if (u.marketCapMax === 0) delete u.marketCapMax;
    if (typeof u.marketCapMax === "number" && u.marketCapMax >= 5e12) {
      delete u.marketCapMax;
    }
    if (u.priceMin === 0) delete u.priceMin;
    if (u.priceMax === 0) delete u.priceMax;

    if (Array.isArray(u.sectors) && u.sectors.length > 0) {
      const industries = u.industries;
      if (!Array.isArray(industries) || industries.length === 0) {
        u.industries = (u.sectors as string[]).flatMap(
          (s) => GICS_INDUSTRIES_BY_SECTOR[s as GicsSector] ?? [],
        );
      }
    }
    cfg.universe = u;
  }

  return cfg;
}

const rawConfigSchema = z.object({
  name: z.string().describe("Short analyst name (2-4 words). E.g. 'EV Momentum Trader'"),
  analystPrompt: z
    .string()
    .describe(
      "A detailed, thorough strategy prompt (at least 3-5 paragraphs) that will guide the agent during every research run. " +
      "Include: the core thesis/edge, what patterns to look for, what sources matter most, " +
      "entry/exit criteria, risk management philosophy, what makes a trade worth taking, " +
      "and any contrarian or unique angles. Write it as if you're briefing a brilliant junior analyst " +
      "who will execute this strategy autonomously every morning."
    ),
  description: z
    .string()
    .optional()
    .describe("One-line description for display. E.g. 'Aggressive day trader focused on EV catalysts'"),
  directionBias: z
    .enum(["LONG", "SHORT", "BOTH"])
    .describe("LONG = only buy, SHORT = only short-sell, BOTH = either direction"),
  holdDurations: z
    .array(z.enum(["DAY", "SWING", "POSITION"]))
    .min(1)
    .describe("DAY = close same day, SWING = hold 2-10 days, POSITION = hold weeks+"),
  // Session A: sectors are enumerated against the canonical GICS Title Case
  // list. The agent literally cannot propose an unknown value — no more
  // SCREAMING_SNAKE or "Tech" strings sneaking back into AgentConfig.
  sectors: z
    .array(z.enum(SECTOR_VALUES))
    .describe(
      "Canonical GICS sectors (Title Case). One of: " +
        SECTORS.join(", ") +
        ". Empty = all sectors.",
    ),
  // ── Universe (B1) — narrower discovery fence ─────────────────────────────
  industries: z
    .array(z.enum(INDUSTRY_VALUES))
    .optional()
    .describe(
      "Canonical GICS industries (Title Case) — narrower than sector. " +
        "Pick from the canonical list; the tool call will be rejected if you " +
        "propose a value not in the list. Empty = no filter on industry.",
    ),
  themes: z
    .array(z.string())
    .optional()
    .describe(
      "Analyst-defined themes the strategy hunts. E.g. 'AI infrastructure', 'EV transition', 'GLP-1', 'datacenter capex'. " +
      "These route theme-tagged signals into the inbox. 3-6 themes is typical. Empty = no theme filter.",
    ),
  // $10T ceiling — no company approaches this, and models like to send
  // Number.MAX_SAFE_INTEGER when they interpret "no upper bound" as a
  // sentinel instead of omitting the field. Reject at the tool layer.
  marketCapMin: z
    .number()
    .int()
    .nonnegative()
    .max(1e13)
    .optional()
    .describe(
      "Minimum market cap in dollars (integer). E.g. 500000000 for $500M. " +
      "OMIT this field entirely for no lower bound — do NOT send 0 or any sentinel. " +
      "Use with marketCapMax to define a cap band (e.g. small-caps only, large-caps only).",
    ),
  marketCapMax: z
    .number()
    .int()
    .nonnegative()
    .max(1e13)
    .optional()
    .describe(
      "Maximum market cap in dollars (integer). E.g. 10000000000 for $10B. " +
      "OMIT this field entirely for no upper bound — do NOT send Number.MAX_SAFE_INTEGER " +
      "or any absurd sentinel. If you want an implicit cap above the largest mega-cap, omit.",
    ),
  // NOTE: signalTypes was removed here because it doesn't filter anything
  // at runtime — it was a cosmetic badge field. Builder/Editor should NOT
  // propose it. The signal router cares about sectors / industries /
  // themes instead. If we ever want event-type preferences, we'll add a
  // dedicated router feature, not this orphaned field.
  minConfidence: z
    .number()
    .min(40)
    .max(95)
    .describe("Minimum confidence score (0-100) to auto-place a paper trade. Default 70"),
  maxPositionSize: z
    .number()
    .min(100)
    .max(10000)
    .describe("Maximum dollar amount per trade. Paper money."),
  maxOpenPositions: z
    .number()
    .min(1)
    .max(20)
    .describe("Maximum simultaneous open trades. Default 5."),
  minMarketCapTier: z
    .enum(["LARGE", "MID", "SMALL"])
    .describe("Minimum market cap. LARGE = $10B+, MID = $2-10B, SMALL = <$2B"),
  watchlist: z
    .array(
      z.object({
        symbol: z.string().describe("Ticker symbol, e.g. NVDA"),
        reason: z.string().describe("Why this stock should be watched."),
        priority: z.enum(["HIGH", "NORMAL", "LOW"]).optional(),
      }),
    )
    .optional()
    .describe("Initial watchlist with reasons."),
  exclusionList: z
    .array(z.string())
    .optional()
    .describe("Tickers to never trade."),
  domainMonitorProposal: z
    .object({
      name: z.string().describe("Monitor group name, e.g. 'EV Industry Monitors'"),
      sources: z
        .array(
          z.object({
            name: z.string().describe("Source name, e.g. 'Electrek'"),
            domain: z.string().describe("Source domain, e.g. 'electrek.co'"),
            category: z.enum(["MARKET", "SECTOR", "COMPANY", "THEMATIC", "SOCIAL", "EVENT"]),
            qualityScore: z.number().min(1).max(5),
            reason: z.string().describe("Why this source matters for this analyst's strategy"),
          })
        )
        .min(4)
        .max(6),
    })
    .optional()
    .describe("Domain monitors: 4-6 websites the intelligence pipeline monitors daily."),
  intelligenceQueries: z
    .array(
      z.object({
        query: z
          .string()
          .describe(
            "A DISCOVERY query that finds NEW tickers matching the analyst's Universe. Examples: 'breakout tech stocks this week small cap', 'emerging EV companies 2026 production ramp', 'AI infrastructure under-the-radar plays'. DO NOT write per-ticker queries like 'NVIDIA supply chain news' or '$NVDA AI accelerator updates' — per-ticker coverage is FREE and AUTOMATIC via portfolio-watchlist-monitor for every position and watchlist item. Per-ticker queries here are redundant spend."
          )
          .refine(
            (q) => !/\$[A-Z]{1,5}\b/.test(q),
            "Query must not contain $TICKER symbols — per-ticker monitoring is automatic."
          ),
        category: z.enum(["MARKET", "SECTOR", "THEMATIC", "EVENT"]),
        reason: z
          .string()
          .describe(
            "Why this DISCOVERY query matters. Explain what Universe dimension it surfaces new names for (e.g., 'finds semiconductor small-caps outside current watchlist')."
          ),
      })
    )
    .min(3)
    .max(5)
    .optional()
    .describe(
      "Discovery search monitors: 3-5 queries the system searches daily via Perplexity Sonar to find NEW tickers. Per-ticker news coverage is handled automatically by portfolio-watchlist-monitor — do NOT duplicate it here."
    ),
  intelligencePolicy: z
    .object({
      holdingsAttention: z.number().min(0).max(1),
      watchlistAttention: z.number().min(0).max(1),
      discoveryAttention: z.number().min(0).max(1),
      maxSignalsPerRun: z.number().min(10).max(100).optional(),
      maxArtifactReads: z.number().min(2).max(20).optional(),
      allowLiveSearch: z.boolean().optional(),
      liveSearchBudget: z.number().min(0).max(20).optional(),
    })
    .optional()
    .describe("Intelligence policy — attention weights should sum to ~1.0."),
  // Session 3: Universe — the fence for discovery routing. Tickers/signals
  // matching this Universe surface as new-ticker candidates in the morning
  // brief even when they're not in watchlist/positions. Distinct from the
  // DIRECTED-mode tickerUniverse allowlist.
  universe: z
    .object({
      sectors: z
        .array(z.enum(SECTOR_VALUES))
        .describe(
          "Canonical GICS sectors (Title Case). Pick from: " +
            SECTORS.join(", "),
        ),
      industries: z
        .array(z.enum(INDUSTRY_VALUES))
        .describe(
          "Canonical GICS industries (Title Case). Pick from the canonical list.",
        ),
      themes: z
        .array(z.string())
        .describe("Thematic tags, e.g. AI_INFRASTRUCTURE, EV_ADOPTION."),
      exchanges: z
        .array(z.string())
        .optional()
        .describe("Exchange filter, e.g. NASDAQ, NYSE. Empty = all."),
      marketCapMin: z
        .number()
        .optional()
        .describe("Minimum market cap in USD. Omit for no floor."),
      marketCapMax: z
        .number()
        .optional()
        .describe("Maximum market cap in USD. Omit for no ceiling."),
      priceMin: z
        .number()
        .optional()
        .describe("Minimum share price. Omit for no floor."),
      priceMax: z
        .number()
        .optional()
        .describe("Maximum share price. Omit for no ceiling."),
      exclusions: z
        .array(z.string())
        .optional()
        .describe("Tickers explicitly off-limits for discovery."),
    })
    .optional()
    .describe(
      "The analyst's discovery universe. Populate with sectors/industries/themes " +
      "relevant to the strategy — this is the fence for new-ticker discovery. " +
      "Keep it focused (5-10 items total); too broad makes discovery noise."
    ),
});

// Final exported schema: preprocess heals the common agent mistakes before
// rawConfigSchema runs. Order matters — normalization first, then Zod.
export const configSchema = z.preprocess(normalizeSuggestConfig, rawConfigSchema);

export type ConfigSchema = z.infer<typeof configSchema>;

/** The suggest_config tool — same in builder and editor modes. */
export const suggestConfigTool = tool({
  description:
    "Suggest a complete analyst configuration. Call this when you have enough information to build a thorough config with a detailed strategy prompt. In editor mode, call this with the full updated config (all fields).",
  inputSchema: configSchema,
  execute: async (config) => config,
});
