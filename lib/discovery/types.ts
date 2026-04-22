/**
 * Discovery Layer v1 — Canonical Output Contracts
 *
 * These types define the exact shapes returned by discovery tools.
 * All parallel implementation tracks MUST conform to these contracts.
 *
 * Conventions:
 *   - snake_case for all field names (matches existing tool outputs)
 *   - _sources array on every tool result (provider, title, url?, excerpt?)
 *   - Enums as string unions, not TS enums
 *   - null for missing data, not undefined (JSON serialization)
 *   - Numbers: prices as raw floats, percentages as floats (e.g. 2.5 = 2.5%)
 *   - Dates: ISO string "YYYY-MM-DD"
 */

// ─── Shared types ────────────────────────────────────────────────────────────

/** Source attribution — every tool result includes _sources */
export interface ToolSource {
  provider: string;   // "Finnhub", "FMP", "Reddit", "StockTwits", "SEC EDGAR"
  title: string;      // Human-readable label
  url: string;        // Link to data source (empty string if N/A)
  excerpt: string;    // Short summary of what this source contributed (empty string if N/A)
}

/** Market regime classification */
export type MarketRegime = "RISK_ON" | "RISK_OFF" | "NEUTRAL";

/** Theme direction */
export type ThemeDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

/** Catalyst types */
export type CatalystType = "EARNINGS" | "ECONOMIC" | "INSIDER" | "ANALYST_ACTION";

/** Impact level */
export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";

/** Direction bias for catalysts */
export type DirectionBias = "BULLISH" | "BEARISH" | "UNKNOWN";

/** Sector momentum classification */
export type SectorMomentum = "leading" | "lagging";

// ─── Tool 1: get_market_overview (enhanced) ──────────────────────────────────

export interface SpyTrend {
  sma_20: number;
  position: "above" | "below";
  pct_from_sma: number;            // e.g. 2.3 means 2.3% above SMA
}

export interface EarningsDensity {
  count: number;                    // companies reporting in next 5 days
  period: string;                   // e.g. "Mar 15–Mar 20"
}

export interface MacroEvent {
  event: string;                    // "FOMC Rate Decision"
  actual: number | null;
  estimate: number | null;
  impact: ImpactLevel;
}

export interface SectorQuote {
  symbol: string;                   // "XLK", "XLF", etc.
  price: number;
  change_pct: number;
  momentum?: SectorMomentum;       // above/below 10d SMA
}

export interface MarketOverviewResult {
  // Existing fields (unchanged)
  spy: {
    price: number;
    change_pct: number;
    day_high: number;
    day_low: number;
  } | null;
  vix: {
    level: number;
    change_pct: number | null;
  } | null;
  sectors: SectorQuote[];

  // v1 additions
  regime: MarketRegime;
  spy_trend: SpyTrend | null;
  macro_events_today: MacroEvent[];
  earnings_density: EarningsDensity;

  // Error handling (existing pattern)
  api_errors?: string[];
  note?: string;

  _sources: ToolSource[];
}

/** MarketContextResult — extends MarketOverviewResult with inline theme detection */
export interface MarketContextResult extends MarketOverviewResult {
  themes: MarketTheme[];
}

// ─── Tool 2: detect_market_themes ────────────────────────────────────────────

export interface MarketTheme {
  id: string;                       // snake_case key from THEME_DEFINITIONS
  label: string;                    // "AI Infrastructure", "GLP-1 / Weight Loss"
  strength: number;                 // 0–1, normalized across themes
  direction: ThemeDirection;
  tickers: string[];                // representative tickers from theme
  headline_matches: number;         // how many headlines matched
  reddit_overlap: number;           // tickers also trending on Reddit
  representative_headlines: string[]; // up to 3 representative headlines
}

export interface DetectMarketThemesResult {
  themes: MarketTheme[];
  meta: {
    headlines_analyzed: number;
    reddit_tickers_found: number;
    lookback_days: number;
  };

  _sources: ToolSource[];
}

// ─── Tool 3: scan_catalysts ──────────────────────────────────────────────────

export interface Catalyst {
  ticker: string | null;            // null for macro events like "FOMC Meeting"
  catalyst_type: CatalystType;
  date: string;                     // ISO "YYYY-MM-DD"
  expected_impact: ImpactLevel;
  direction_bias: DirectionBias;
  details: string;                  // "Q1 2026 earnings, EPS est $2.35"
}

export interface ScanCatalystsResult {
  catalysts: Catalyst[];
  summary: {
    total: number;
    by_type: Record<CatalystType, number>;
    next_high_impact: string | null;  // ISO date of next HIGH impact catalyst
  };

  _sources: ToolSource[];
}

// ─── Tool 4: scan_candidates (simplified — quality filtering deferred to get_stock_data) ──

export interface ScanCandidate {
  ticker: string;
  score: number;                    // multi-source ranking score
  sources: string[];                // which data sources surfaced this ticker
  change_pct?: number;              // daily change if from movers
  date?: string;                    // earnings date if from earnings calendar
  catalysts?: { type: string; date: string; details: string }[];
}

export interface ScanCandidatesResult {
  candidates: ScanCandidate[];
  total_found: number;
  sources_queried: string[];
  note: string;

  _sources: ToolSource[];
}

// ─── Theme keyword map (used by detect_market_themes and scan_candidates) ────

export interface ThemeDefinition {
  label: string;                    // Display name: "AI Infrastructure"
  keywords: string[];
  tickers: string[];
  sectors: string[];                // Sector ETF symbols: ["XLK"]
}

/**
 * Shared theme keyword map — used by detect_market_themes for clustering
 * and by scan_candidates for theme_filter scoring.
 *
 * Keys are snake_case identifiers; `label` is the display name.
 */
export const THEME_DEFINITIONS: Record<string, ThemeDefinition> = {
  ai_infrastructure: {
    label: "AI Infrastructure",
    keywords: ["artificial intelligence", "AI", "GPU", "data center",
      "machine learning", "LLM", "generative AI", "neural", "compute", "chips"],
    tickers: ["NVDA", "AMD", "AVGO", "MRVL", "SMCI", "MSFT", "GOOGL", "META",
      "AMZN", "TSM"],
    sectors: ["XLK"],
  },
  semiconductor_cycle: {
    label: "Semiconductor Cycle",
    keywords: ["semiconductor", "chip", "wafer", "foundry", "DRAM", "NAND",
      "memory", "fab", "lithography", "EUV"],
    tickers: ["NVDA", "AMD", "INTC", "TSM", "AVGO", "QCOM", "MU", "LRCX",
      "AMAT", "KLAC", "ASML"],
    sectors: ["XLK"],
  },
  energy_transition: {
    label: "Energy Transition",
    keywords: ["solar", "wind", "EV", "battery", "lithium", "renewable",
      "clean energy", "hydrogen", "grid", "nuclear"],
    tickers: ["TSLA", "ENPH", "FSLR", "NEE", "LI", "RIVN", "PLUG", "BE",
      "VST", "CEG"],
    sectors: ["XLE", "XLU"],
  },
  biotech_pharma: {
    label: "Biotech & Pharma",
    keywords: ["FDA", "drug", "trial", "biotech", "pharma", "approval",
      "pipeline", "clinical", "PDUFA", "GLP-1", "obesity"],
    tickers: ["LLY", "NVO", "MRNA", "AMGN", "GILD", "BIIB", "VRTX", "REGN",
      "BMY", "PFE"],
    sectors: ["XLV"],
  },
  china_trade: {
    label: "China & Trade",
    keywords: ["China", "tariff", "trade war", "export ban", "sanctions",
      "geopolitical", "Taiwan", "decoupling", "reshoring"],
    tickers: ["BABA", "PDD", "JD", "BIDU", "NIO", "XPEV", "FXI", "KWEB"],
    sectors: ["XLK", "XLI"],
  },
  rates_and_fed: {
    label: "Rates & Fed Policy",
    keywords: ["Fed", "rate cut", "rate hike", "inflation", "CPI", "PPI",
      "jobs", "unemployment", "treasury", "yield", "dovish", "hawkish",
      "FOMC", "Powell"],
    tickers: ["TLT", "SHY", "GLD", "JPM", "BAC", "GS", "MS"],
    sectors: ["XLF"],
  },
  consumer_spending: {
    label: "Consumer Spending",
    keywords: ["consumer", "retail", "spending", "e-commerce", "holiday",
      "luxury", "discretionary", "credit card"],
    tickers: ["AMZN", "WMT", "COST", "TGT", "HD", "NKE", "SBUX", "MCD",
      "V", "MA"],
    sectors: ["XLY", "XLP"],
  },
  real_estate_reits: {
    label: "Real Estate & REITs",
    keywords: ["real estate", "REIT", "housing", "mortgage",
      "commercial real estate", "office", "CRE"],
    tickers: ["O", "AMT", "PLD", "EQIX", "SPG", "DLR", "PSA", "AVB"],
    sectors: ["XLRE"],
  },
  commodities_resources: {
    label: "Commodities & Resources",
    keywords: ["oil", "crude", "gold", "copper", "mining", "commodity",
      "OPEC", "natural gas", "steel"],
    tickers: ["XOM", "CVX", "COP", "SLB", "FCX", "NEM", "BHP", "RIO", "CLF"],
    sectors: ["XLE", "XLB"],
  },
  defense_aerospace: {
    label: "Defense & Aerospace",
    keywords: ["defense", "military", "Pentagon", "aerospace", "drone",
      "missile", "contract", "NATO", "conflict"],
    tickers: ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "KTOS"],
    sectors: ["XLI"],
  },
  meme_retail_squeeze: {
    label: "Meme / Retail Squeeze",
    keywords: ["meme stock", "short squeeze", "gamma squeeze", "WSB",
      "wallstreetbets", "diamond hands", "YOLO", "retail traders",
      "to the moon"],
    tickers: ["GME", "AMC", "BBBY", "BB", "PLTR"],
    sectors: [],
  },
  banking_financial_stress: {
    label: "Banking / Financial Stress",
    keywords: ["bank", "banking crisis", "deposit", "SVB", "FDIC",
      "regional bank", "credit", "loan loss", "delinquency", "bank run"],
    tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS", "KRE", "SCHW"],
    sectors: ["XLF"],
  },
};
