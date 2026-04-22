// ── V3 Intelligence Layer Types ──────────────────────────────────────────────
// Type definitions for the persistent intelligence backbone.
// These types are used by:
//   - Background intelligence jobs (Inngest functions)
//   - Sonar API response parsing
//   - Signal creation/routing utilities
//   - Runtime tools (read_morning_brief, read_signals)
//   - Intelligence config UI

// ── Enums (string unions matching Prisma schema) ────────────────────────────

export type SourceType = "DOMAIN" | "RSS" | "NEWSLETTER" | "TWITTER" | "API";

export type SourceCategory =
  | "MARKET"
  | "SECTOR"
  | "COMPANY"
  | "THEMATIC"
  | "SOCIAL"
  | "EVENT";


export type CheckFrequency = "HOURLY" | "DAILY" | "WEEKLY";

export type QueryCategory =
  | "MARKET"
  | "SECTOR"
  | "TICKER"
  | "THEMATIC"
  | "EVENT";

export type QueryCreator =
  | "USER"
  | "BRIEFING_AGENT"
  | "ANALYST_BUILDER"
  | "ANALYST_RUNTIME";

export type SignalType =
  | "NEWS"
  | "EARNINGS"
  | "FILING"
  | "SOCIAL"
  | "PRICE_ACTION"
  | "ANALYST_NOTE"
  | "OPTIONS"
  | "MACRO"
  | "SECTOR";

export type SignalSentiment = "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED";

export type SignalUrgency = "LOW" | "MEDIUM" | "HIGH" | "BREAKING";

export type SignalFreshness = "BREAKING" | "TODAY" | "THIS_WEEK" | "OLDER";

export type SignalRouteStatus = "PENDING" | "READ" | "ACTED_ON" | "DISMISSED";

export type BatchJobType =
  | "MARKET_SWEEP"
  | "PORTFOLIO_MONITOR"
  | "DOMAIN_MONITOR"
  | "EMAIL_INGEST"
  | "MANUAL";

export type BatchStatus = "RUNNING" | "COMPLETE" | "FAILED";

export type WatchlistRecommendation = "ESCALATE" | "MONITOR" | "REMOVE";

// ── Sonar Response Schema ───────────────────────────────────────────────────
// JSON schema definition passed to Perplexity Sonar via response_format.
// Sonar returns structured data matching this shape.

/** A single signal extracted by Sonar from search results. */
export interface SonarSignalOutput {
  headline: string;
  summary: string;
  tickers: string[];
  themes: string[];
  sectors: string[];
  // Session 3 / Workstream B — narrower industry tags so Signal.industries gets
  // populated for the router's INDUSTRY_MATCH code. Optional in responses for
  // robustness against older prompts that don't request it.
  industries?: string[];
  sentiment: SignalSentiment;
  urgency: SignalUrgency;
  sourceUrls: string[];
  sourceNames: string[];
}

/** The top-level Sonar response_format schema for signal extraction. */
export interface SonarSignalResponse {
  signals: SonarSignalOutput[];
}

/**
 * JSON Schema definition for Sonar response_format parameter.
 * Pass this as `response_format.json_schema.schema` in Sonar API calls.
 */
export const SONAR_SIGNAL_SCHEMA = {
  type: "object" as const,
  properties: {
    signals: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          headline: {
            type: "string" as const,
            description: "One-line summary of the signal",
          },
          summary: {
            type: "string" as const,
            description: "2-3 sentence structured summary of the evidence",
          },
          tickers: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Stock tickers mentioned (e.g. AAPL, TSLA)",
          },
          themes: {
            type: "array" as const,
            items: { type: "string" as const },
            description:
              "Thematic tags (e.g. AI_CAPEX, FED_RATE_CUT, EARNINGS_BEAT)",
          },
          sectors: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Sectors involved (e.g. Technology, Healthcare)",
          },
          industries: {
            type: "array" as const,
            items: { type: "string" as const },
            description:
              "Narrower industry classifications (e.g. Semiconductors, Biotech, EV_OEM, Cloud_Software). Optional.",
          },
          sentiment: {
            type: "string" as const,
            enum: ["BULLISH", "BEARISH", "NEUTRAL", "MIXED"],
          },
          urgency: {
            type: "string" as const,
            enum: ["LOW", "MEDIUM", "HIGH", "BREAKING"],
          },
          sourceUrls: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "URLs of the sources this signal is derived from",
          },
          sourceNames: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Publication names (e.g. Reuters, CNBC)",
          },
        },
        required: [
          "headline",
          "summary",
          "tickers",
          "themes",
          "sectors",
          "sentiment",
          "urgency",
          "sourceUrls",
          "sourceNames",
        ],
      },
    },
  },
  required: ["signals"],
};

// ── Intelligence Policy ─────────────────────────────────────────────────────
// Per-analyst policy that controls how the intelligence layer feeds runtime.
// Stored as JSON on AgentConfig.intelligencePolicy.

export interface IntelligencePolicy {
  // Discovery budget — caps how much the agent reads per run
  maxSignalsPerRun: number;        // default 30 — max signals to surface via read_signals
  maxArtifactReads: number;        // default 5 — full article reads per run

  // Source category preferences — steer what types of intelligence get priority
  preferredSourceCategories: SourceCategory[];  // e.g. ["SECTOR", "COMPANY"] — boost these
  excludedSourceCategories: SourceCategory[];   // e.g. ["SOCIAL"] — never surface these

  // Attention weighting — 0-1 floats controlling how signals are prioritized
  // These feed into the signal router's relevance scoring.
  holdingsAttention: number;       // weight for signals about current open positions
  watchlistAttention: number;      // weight for signals about watchlist tickers
  discoveryAttention: number;      // weight for new-opportunity signals (no existing position/watch)

  // Live search permissions — controls whether the agent can do real-time searches
  allowLiveSearch: boolean;        // default true — can the agent call live search tools?
  liveSearchBudget: number;        // max live search calls per run, default 5

  // Signal quality floor — minimum thresholds to surface a signal
  minUrgency: SignalUrgency;       // default "LOW" — signals below this urgency are filtered
  minSourceQuality: number;        // default 2 — minimum source quality score (1-5) to surface
}

/** Sensible defaults for new analysts — balanced attention, moderate budgets. */
export const DEFAULT_INTELLIGENCE_POLICY: IntelligencePolicy = {
  maxSignalsPerRun: 30,
  maxArtifactReads: 5,
  preferredSourceCategories: [],
  excludedSourceCategories: [],
  holdingsAttention: 0.4,
  watchlistAttention: 0.35,
  discoveryAttention: 0.25,
  allowLiveSearch: true,
  liveSearchBudget: 5,
  minUrgency: "LOW",
  minSourceQuality: 2,
};

/**
 * Parse an IntelligencePolicy from a Prisma Json field.
 * Returns defaults for any missing fields — safe to call on null/undefined.
 */
export function parseIntelligencePolicy(raw: unknown): IntelligencePolicy {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INTELLIGENCE_POLICY };
  const obj = raw as Record<string, unknown>;
  return {
    maxSignalsPerRun: typeof obj.maxSignalsPerRun === "number" ? obj.maxSignalsPerRun : DEFAULT_INTELLIGENCE_POLICY.maxSignalsPerRun,
    maxArtifactReads: typeof obj.maxArtifactReads === "number" ? obj.maxArtifactReads : DEFAULT_INTELLIGENCE_POLICY.maxArtifactReads,
    preferredSourceCategories: Array.isArray(obj.preferredSourceCategories) ? obj.preferredSourceCategories as SourceCategory[] : DEFAULT_INTELLIGENCE_POLICY.preferredSourceCategories,
    excludedSourceCategories: Array.isArray(obj.excludedSourceCategories) ? obj.excludedSourceCategories as SourceCategory[] : DEFAULT_INTELLIGENCE_POLICY.excludedSourceCategories,
    holdingsAttention: typeof obj.holdingsAttention === "number" ? obj.holdingsAttention : DEFAULT_INTELLIGENCE_POLICY.holdingsAttention,
    watchlistAttention: typeof obj.watchlistAttention === "number" ? obj.watchlistAttention : DEFAULT_INTELLIGENCE_POLICY.watchlistAttention,
    discoveryAttention: typeof obj.discoveryAttention === "number" ? obj.discoveryAttention : DEFAULT_INTELLIGENCE_POLICY.discoveryAttention,
    allowLiveSearch: typeof obj.allowLiveSearch === "boolean" ? obj.allowLiveSearch : DEFAULT_INTELLIGENCE_POLICY.allowLiveSearch,
    liveSearchBudget: typeof obj.liveSearchBudget === "number" ? obj.liveSearchBudget : DEFAULT_INTELLIGENCE_POLICY.liveSearchBudget,
    minUrgency: (["LOW", "MEDIUM", "HIGH", "BREAKING"] as const).includes(obj.minUrgency as SignalUrgency) ? obj.minUrgency as SignalUrgency : DEFAULT_INTELLIGENCE_POLICY.minUrgency,
    minSourceQuality: typeof obj.minSourceQuality === "number" ? obj.minSourceQuality : DEFAULT_INTELLIGENCE_POLICY.minSourceQuality,
  };
}

// ── Dynamic Query Types ─────────────────────────────────────────────────────
// Output from the briefing agent's dynamic_queries section.

export interface DynamicQueryOutput {
  query: string;
  category: QueryCategory;
  reason: string;
  expires_days: number;
}


// ── Morning Brief Types ─────────────────────────────────────────────────────
// Structured output from the morning brief generator job.

export interface PortfolioAlert {
  ticker: string;
  alert: string;
  urgency: SignalUrgency;
  signalIds: string[];
}

export interface WatchlistUpdate {
  ticker: string;
  update: string;
  recommendation: WatchlistRecommendation;
  signalIds: string[];
}

export interface NewOpportunity {
  headline: string;
  tickers: string[];
  thesisSeed: string;
  signalIds: string[];
}

export interface MorningBriefData {
  marketContext: string;
  portfolioAlerts: PortfolioAlert[];
  watchlistUpdates: WatchlistUpdate[];
  newOpportunities: NewOpportunity[];
  attentionPriority: string[];
  riskFlags: string[];
}

// ── Signal Creation Input ───────────────────────────────────────────────────
// Used by intelligence jobs to create signals in the DB.

export interface CreateSignalInput {
  batchId: string;
  artifactId?: string;
  monitorId?: string;
  type: SignalType;
  headline: string;
  summary: string;
  evidence?: string;
  tickers: string[];
  themes: string[];
  sectors: string[];
  // Session 3 / Workstream B — narrower industry classification so the router's
  // INDUSTRY_MATCH code can fire. Producers tag at signal creation (omit when
  // unknown — empty = no filter, not a hard reject).
  industries?: string[];
  sentiment: SignalSentiment;
  noveltyScore?: number;
  urgency: SignalUrgency;
  sourceQuality?: number;
  freshness: SignalFreshness;
  sourceUrls: string[];
  sourceNames: string[];
  // Provenance
  searchTool?: string;    // "PERPLEXITY_SONAR" | "FMP" | "FINNHUB" | "FIRECRAWL"
  searchQuery?: string;   // the actual query or URL sent to the tool
  searchContext?: string; // why this search happened
  // Aggregate findings
  aggregateType?: string; // "MARKET_MOVERS_GAINERS" | "MARKET_MOVERS_LOSERS" | "MARKET_MOVERS_ACTIVES" | "EARNINGS_CALENDAR"
  dataPayload?: unknown;  // [{ticker, change, price, volume}...] or [{ticker, date, epsEstimate}...]
  itemCount?: number;     // how many items in the aggregate
  expiresAt?: Date;
  // Resend inbound email_id — set only by the email-ingest route. Enables
  // duplicate-delivery dedup across webhook retries.
  emailMessageId?: string;
}

// ── Signal Routing ──────────────────────────────────────────────────────────

export interface RouteDecision {
  analystId: string;
  signalId: string;
  relevanceScore: number;
  routeReason: string;
}


// ── Runtime Tool Types ──────────────────────────────────────────────────────
// Used by agent runtime tools to query the intelligence layer.

export interface ReadSignalsFilter {
  analystId: string;
  tickers?: string[];
  themes?: string[];
  urgency?: SignalUrgency;
  status?: SignalRouteStatus;
  limit?: number;
}

export interface ReadSignalsResult {
  signals: Array<{
    id: string;
    headline: string;
    summary: string;
    tickers: string[];
    themes: string[];
    sentiment: SignalSentiment;
    urgency: SignalUrgency;
    freshness: SignalFreshness;
    sourceNames: string[];
    relevanceScore: number;
    routeReason: string;
  }>;
  totalCount: number;
}
