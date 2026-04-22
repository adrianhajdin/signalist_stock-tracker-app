/**
 * Tool Result Types — canonical shapes for all agent tool returns.
 *
 * Conventions:
 *   - camelCase for all field names
 *   - Research/intelligence tools return ResearchToolResult<T>
 *   - Action tools return domain-specific shapes matching their UI card props
 *   - null for missing data, not undefined (JSON serialization)
 *   - Prices as raw floats, percentages as floats (e.g. 2.5 = 2.5%)
 *   - Dates as ISO strings "YYYY-MM-DD"
 */

// ─── Shared Types ───────────────────────────────────────────────────────────

/** Source attribution — used in _sources arrays and UI SourceChips */
export interface ToolSource {
  provider: string;
  title: string;
  url?: string;
  excerpt?: string;
}

/** Per-ticker finding — the universal "here's what I found about a stock" unit */
export interface TickerFinding {
  ticker: string;
  tag?: string; // "Holding" | "Watching" | "Opportunity" | "Research" | urgency levels
  summary: string;
}

/** Envelope — every research/intelligence tool returns this shape */
export interface ResearchToolResult<T = Record<string, unknown>> {
  summary: string;
  tickers?: TickerFinding[];
  _sources: ToolSource[];
  data: T;
}

/** News item — Finnhub news in get_stock_data */
export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  date: string;
}

/** Source reference inside signal/search results — replaces parallel sourceNames[]/sourceUrls[] */
export interface SourceRef {
  name: string;
  url: string;
}

/**
 * routeReasonCode — canonical routing enum set by signal-router.ts.
 * Shared contract with the B workstream (UNIVERSE_HANDOFF.md):
 *   POSITION        — ticker is in the analyst's open positions
 *   WATCHLIST       — ticker is on the analyst's watchlist
 *   DIRECT_TICKER   — explicit ticker allowlist hit (DIRECTED mode)
 *   DISCOVERY       — matched multiple universe dimensions (sector + industry/theme)
 *   INDUSTRY_MATCH  — matched universe.industries only
 *   SECTOR_MATCH    — matched universe.sectors only
 *   THEME_MATCH     — matched universe.themes only
 *   CROSS_ANALYST   — routed from a peer analyst (penalty applied)
 */
export type RouteReasonCode =
  | "POSITION"
  | "WATCHLIST"
  | "DIRECT_TICKER"
  | "DISCOVERY"
  | "INDUSTRY_MATCH"
  | "SECTOR_MATCH"
  | "THEME_MATCH"
  | "CROSS_ANALYST";

/**
 * matchedUniverse — JSON payload persisted on AnalystSignalRoute explaining
 * which universe dimensions matched. Populated by signal-router.ts.
 */
export interface MatchedUniverse {
  sectors?: string[];
  industries?: string[];
  themes?: string[];
  inWatchlist?: boolean;
  inPositions?: boolean;
  fromAnalystId?: string;
  marketCap?: number | null;
}

/** Signal item — shared shape for read_signals and web_search results */
export interface SignalItem {
  headline: string;
  summary: string;
  tickers: string[];
  themes: string[];
  sentiment: string; // BULLISH | BEARISH | NEUTRAL | MIXED
  urgency: string; // LOW | MEDIUM | HIGH | BREAKING
  sources: SourceRef[];
  // Signal-specific (present in read_signals, absent in web_search)
  signalId?: string;
  type?: string;
  freshness?: string;
  relevanceScore?: number;
  routeReason?: string;
  artifactId?: string | null;
  // Session 3: canonical routing code + universe-match payload (read_signals only).
  routeReasonCode?: RouteReasonCode;
  matchedUniverse?: MatchedUniverse | null;
  // Cross-analyst provenance — populated when routeReasonCode === "CROSS_ANALYST".
  crossAnalystSource?: string | null;
}

// ─── Per-Tool Data Types ────────────────────────────────────────────────────

/** get_market_context → data */
export interface MarketContextData {
  spy: { price: number; changePct: number; dayHigh: number; dayLow: number } | null;
  vix: { level: number; changePct: number | null } | null;
  regime: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
  spyTrend: {
    sma20: number;
    position: "above" | "below";
    pctFromSma: number;
  } | null;
  sectors: { symbol: string; changePct: number }[];
  macroEvents: {
    event: string;
    actual: number | null;
    estimate: number | null;
    impact: "HIGH" | "MEDIUM" | "LOW";
  }[];
  earningsDensity: { count: number; period: string };
  apiErrors?: string[];
}

/** get_stock_data → data */
export interface StockDataData {
  quote: {
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
    open: number;
    prevClose: number;
  } | null;
  company: {
    name: string;
    sector: string;
    marketCap: number | null;
    exchange: string;
    country: string;
  } | null;
  financials: {
    peRatio: number | null;
    pbRatio: number | null;
    high52w: number | null;
    low52w: number | null;
    avgVolume10d: number | null;
    beta: number | null;
  } | null;
  technicals: {
    currentPrice: number;
    rsi14: number | null;
    sma20: number | null;
    sma50: number | null;
    priceVsSma20: string | null;
    priceVsSma50: string | null;
    positionIn52wRange: string;
    volumeRatio: string | null;
    trend: string;
  } | null;
  analystConsensus: {
    buy: number;
    hold: number;
    sell: number;
    strongBuy: number;
    strongSell: number;
  } | null;
  priceTargets: {
    consensus: number | undefined;
    high: number | undefined;
    low: number | undefined;
    median: number | undefined;
    numAnalysts: number | undefined;
  } | null;
  news: NewsItem[];
  apiErrors?: string[];
}

/** get_earnings_data → data */
export interface EarningsDataData {
  nextEarnings: { date: string; epsEstimate: number | null } | null;
  beatRate: string;
  recentQuarters: {
    period: string;
    actualEps: number;
    estimatedEps: number;
    surprise: number;
    surprisePct: number;
  }[];
}

/** get_options_flow → data */
export interface OptionsFlowData {
  available: boolean;
  putCallRatio: number | null;
  totalCallVolume: number;
  totalPutVolume: number;
  contractsAvailable: number;
  unusualContracts: {
    type: string;
    strike: number;
    expiration: string;
    volume: number;
    openInterest?: number;
    premium?: number;
  }[];
  signal: string;
  dataSource: string;
}

/** get_sec_filings → data */
export interface SecFilingsData {
  filings: { type: string; date: string; description: string }[];
  count: number;
}

/** read_morning_brief → data */
export interface MorningBriefToolData {
  available: boolean;
  date?: string;
  marketContext?: string;
  attentionPriority?: string[];
  riskFlags?: string[];
  signalCount?: number;
  generatedAt?: string;
  // Raw DB arrays preserved for agent deep-dives
  portfolioAlerts?: {
    ticker: string;
    alert: string;
    urgency: string;
    signalIds: string[];
  }[];
  watchlistUpdates?: {
    ticker: string;
    update: string;
    recommendation: string;
    signalIds: string[];
  }[];
  newOpportunities?: {
    headline: string;
    tickers: string[];
    thesisSeed: string;
    signalIds: string[];
  }[];
}

/** read_signals → data */
export interface SignalsToolData {
  count: number;
  fallback?: boolean;
  fallbackReason?: string;
  policyApplied?: {
    maxSignals: number;
    minUrgency: string;
    minSourceQuality: number;
    excludedCategories: string[];
  };
  // Flat list — kept for legacy renderers and sorting by urgency.
  signals: SignalItem[];
  // Session 3: segmented view. Same signals, split by routeReasonCode.
  //   portfolioSignals  — routeReasonCode === "POSITION"
  //   watchlistSignals  — routeReasonCode === "WATCHLIST"
  //   discoverySignals  — DISCOVERY | SECTOR_MATCH | INDUSTRY_MATCH | THEME_MATCH
  //                       | DIRECT_TICKER | CROSS_ANALYST (anything that is not
  //                       already in the analyst's book or watchlist)
  portfolioSignals: SignalItem[];
  watchlistSignals: SignalItem[];
  discoverySignals: SignalItem[];
  // Guidance text to surface directly to the agent when discovery is empty.
  discoveryNote?: string;
}

/** read_artifact → data */
export interface ArtifactToolData {
  title: string;
  url: string;
  publishedAt: string | null;
  contentSummary: string | null;
  contentMarkdown: string | null;
}

/** web_search → data */
export interface WebSearchToolData {
  query: string;
  resultCount: number;
  budgetUsed: number;
  budgetMax: number;
  results: SignalItem[];
}

// ─── Helper: convert parallel sourceNames/sourceUrls to SourceRef[] ─────────

export function toSourceRefs(
  sourceNames: string[],
  sourceUrls: string[],
): SourceRef[] {
  return sourceUrls.map((url, i) => ({
    name: sourceNames[i] ?? "",
    url,
  }));
}

// ─── Helper: build ToolSource[] from SourceRef[] for _sources envelope ──────

export function sourceRefsToToolSources(refs: SourceRef[]): ToolSource[] {
  const seen = new Set<string>();
  const sources: ToolSource[] = [];
  for (const ref of refs) {
    if (seen.has(ref.url)) continue;
    seen.add(ref.url);
    let domain = "";
    try {
      domain = new URL(ref.url).hostname.replace(/^www\./, "");
    } catch {
      /* */
    }
    sources.push({
      provider: domain || ref.name,
      title: ref.name || domain,
      url: ref.url,
    });
  }
  return sources;
}
