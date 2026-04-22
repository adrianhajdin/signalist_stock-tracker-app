/**
 * Signal type catalog — the taxonomy of signals the analyst can subscribe to.
 *
 * Used by:
 *   - signal-router.ts (other session) to classify incoming intelligence
 *   - suggest_config tool for the signalTypes field
 *   - strategy-archetypes.primarySignals to link archetypes to signals
 *   - builder/editor agents via read_signal_types tool
 *
 * Adding one: pick a stable ID in SCREAMING_SNAKE_CASE, fill every field.
 * The `detectors` field names (non-normative) the intelligence methods
 * that typically produce this signal — helps the builder reason about
 * what monitors to propose.
 */

export type SignalCategory =
  | "FUNDAMENTAL"
  | "TECHNICAL"
  | "FLOW"
  | "EVENT"
  | "SENTIMENT"
  | "MACRO";

export interface SignalType {
  id: string;
  name: string;
  category: SignalCategory;
  tagline: string;
  description: string;
  /** Common analyst archetypes that use this signal */
  usedBy: string[];
  /** Non-normative — intel pipeline detectors that typically produce this */
  detectors: string[];
  /** Rough urgency when this signal fires: low/medium/high */
  urgency: "LOW" | "MEDIUM" | "HIGH";
}

export const SIGNAL_TYPES: SignalType[] = [
  // ── FUNDAMENTAL ────────────────────────────────────────────────────────
  {
    id: "EARNINGS_BEAT",
    name: "Earnings Beat + Guide Raise",
    category: "FUNDAMENTAL",
    tagline: "Company beats EPS and raises forward guidance.",
    description:
      "A clean beat-and-raise — EPS and revenue above consensus with forward guidance revised upward. The strongest version of an earnings signal; drives the post-earnings drift. Opposite side (miss + guide cut) is an EARNINGS_MISS signal.",
    usedBy: ["EARNINGS_DRIFT", "MOMENTUM_BREAKOUT"],
    detectors: ["earnings_api", "sonar_earnings_recap", "sec_8k_guidance"],
    urgency: "HIGH",
  },
  {
    id: "EARNINGS_MISS",
    name: "Earnings Miss + Guide Cut",
    category: "FUNDAMENTAL",
    tagline: "Company misses EPS and lowers forward guidance.",
    description:
      "The mirror signal to EARNINGS_BEAT — used by short-biased or both-ways strategies. Drives negative drift over the same 30-60 day window.",
    usedBy: ["EARNINGS_DRIFT"],
    detectors: ["earnings_api", "sonar_earnings_recap", "sec_8k_guidance"],
    urgency: "HIGH",
  },
  {
    id: "ANALYST_REVISION",
    name: "Analyst Estimate Revision",
    category: "FUNDAMENTAL",
    tagline: "Sell-side analysts revise estimates up or down within days of a catalyst.",
    description:
      "Post-earnings estimate revisions are a high-quality lagging confirmation signal. Cluster of upward revisions confirms beat-and-raise; cluster of downward revisions confirms a weakening fundamental story.",
    usedBy: ["EARNINGS_DRIFT", "DEEP_VALUE"],
    detectors: ["finnhub_recommendations", "fmp_estimates", "sonar_sell_side"],
    urgency: "MEDIUM",
  },
  {
    id: "VALUATION_EXTREME",
    name: "Valuation Extreme",
    category: "FUNDAMENTAL",
    tagline: "Multiple compresses or expands to statistical extreme vs history or peers.",
    description:
      "Forward P/E or EV/EBITDA > 1 standard deviation from the stock's 5-year median or sector median. Core signal for deep value (compression) or momentum exhaustion (expansion) strategies.",
    usedBy: ["DEEP_VALUE", "THEMATIC_SECULAR"],
    detectors: ["stock_data", "fmp_valuation"],
    urgency: "LOW",
  },
  {
    id: "ANALYST_DOWNGRADE_EXHAUSTION",
    name: "Analyst Downgrade Exhaustion",
    category: "FUNDAMENTAL",
    tagline: "Sell-side capitulation — last bulls finally downgrade after sustained weakness.",
    description:
      "Contrarian signal — when the last bullish analysts finally cut their ratings, the bad news is usually priced in. A reliable mean-reversion trigger for quality names.",
    usedBy: ["DEEP_VALUE", "MEAN_REVERSION_OVERSOLD"],
    detectors: ["finnhub_recommendations", "sonar_sell_side"],
    urgency: "MEDIUM",
  },
  {
    id: "EARNINGS_GROWTH",
    name: "Sustained Earnings Growth",
    category: "FUNDAMENTAL",
    tagline: "Multi-quarter earnings growth acceleration.",
    description:
      "Three or more consecutive quarters of accelerating EPS and revenue growth. Core signal for secular theme allocators identifying compounders.",
    usedBy: ["THEMATIC_SECULAR", "MOMENTUM_BREAKOUT"],
    detectors: ["earnings_api", "fmp_income_statement"],
    urgency: "LOW",
  },

  // ── TECHNICAL ──────────────────────────────────────────────────────────
  {
    id: "PRICE_BREAKOUT",
    name: "Price Breakout",
    category: "TECHNICAL",
    tagline: "Price breaks through a key resistance level or 52-week high.",
    description:
      "Close above a multi-week base or 52-week high on volume. Confirms a regime shift from consolidation to trend. Most reliable when sector is also trending and relative strength vs SPY is in top quartile.",
    usedBy: ["MOMENTUM_BREAKOUT"],
    detectors: ["technical_analysis", "stockcharts_rs"],
    urgency: "HIGH",
  },
  {
    id: "VOLUME_SPIKE",
    name: "Volume Spike",
    category: "TECHNICAL",
    tagline: "Volume ≥ 2x 20-day average without obvious news.",
    description:
      "Anomalous volume often precedes a news or positioning catalyst. Works best as confirmation of another signal (breakout, options flow, insider buy) rather than standalone.",
    usedBy: ["MOMENTUM_BREAKOUT", "UNUSUAL_OPTIONS"],
    detectors: ["technical_analysis"],
    urgency: "MEDIUM",
  },
  {
    id: "RSI_OVERSOLD",
    name: "RSI Oversold",
    category: "TECHNICAL",
    tagline: "RSI(14) drops below 30 on daily timeframe.",
    description:
      "Classic mean-reversion trigger. Most reliable on quality names pulled down by sector-wide fear, not individual company deterioration. Dangerous in trending bear markets.",
    usedBy: ["MEAN_REVERSION_OVERSOLD"],
    detectors: ["technical_analysis"],
    urgency: "MEDIUM",
  },
  {
    id: "MOVING_AVERAGE_CROSS",
    name: "Moving Average Cross",
    category: "TECHNICAL",
    tagline: "Shorter MA crosses longer MA (e.g. 50d above 200d = golden cross).",
    description:
      "Trend-following signal. Golden cross (50d above 200d) confirms bull regime; death cross confirms bear regime. Lagging but reliable for swing positioning.",
    usedBy: ["MOMENTUM_BREAKOUT", "SECTOR_ROTATION"],
    detectors: ["technical_analysis"],
    urgency: "LOW",
  },

  // ── FLOW ───────────────────────────────────────────────────────────────
  {
    id: "UNUSUAL_OPTIONS_FLOW",
    name: "Unusual Options Flow",
    category: "FLOW",
    tagline: "Single-strike volume > 3x OI with directional bias.",
    description:
      "Institutional positioning leaks into options before equity. Best signals are large-premium single-strike sweeps with a fundamental catalyst within 45 days. Alone, noise; paired with a catalyst, edge.",
    usedBy: ["UNUSUAL_OPTIONS", "CATALYST_EVENT"],
    detectors: ["options_flow_api", "unusual_whales"],
    urgency: "HIGH",
  },
  {
    id: "DARK_POOL",
    name: "Dark Pool Activity",
    category: "FLOW",
    tagline: "Large off-exchange prints suggesting institutional accumulation/distribution.",
    description:
      "Dark pool prints > 0.5% of average daily volume at price levels suggest institutional positioning. Directional interpretation requires tape-reading context.",
    usedBy: ["UNUSUAL_OPTIONS"],
    detectors: ["unusual_whales", "cheddar_flow"],
    urgency: "MEDIUM",
  },
  {
    id: "INSTITUTIONAL_FLOW",
    name: "Institutional Flow",
    category: "FLOW",
    tagline: "13F changes showing major funds adding or trimming.",
    description:
      "Quarterly 13F filings reveal institutional positioning changes. Lagging (45-day filing window) but high quality for multi-quarter allocation strategies.",
    usedBy: ["EARNINGS_DRIFT", "THEMATIC_SECULAR"],
    detectors: ["sec_edgar_13f", "insider_monkey"],
    urgency: "LOW",
  },

  // ── EVENT ──────────────────────────────────────────────────────────────
  {
    id: "FDA_CATALYST",
    name: "FDA Catalyst",
    category: "EVENT",
    tagline: "PDUFA date, advisory committee, or label expansion.",
    description:
      "Binary FDA events with pre-announced dates. The canonical catalyst-driven trade. Requires strict position sizing — 50%+ drawdowns on bad outcomes are routine.",
    usedBy: ["CATALYST_EVENT"],
    detectors: ["fda_calendar", "biopharmcatalyst"],
    urgency: "HIGH",
  },
  {
    id: "TRIAL_READOUT",
    name: "Clinical Trial Readout",
    category: "EVENT",
    tagline: "Phase 2/3 trial results expected at a known conference or date.",
    description:
      "Pre-announced trial data readouts at medical conferences or earnings calls. Binary outcome — primary endpoint met or not.",
    usedBy: ["CATALYST_EVENT"],
    detectors: ["biopharmcatalyst", "sec_8k", "conference_calendar"],
    urgency: "HIGH",
  },
  {
    id: "MA_RUMOR",
    name: "M&A Rumor",
    category: "EVENT",
    tagline: "Credible merger/acquisition chatter, typically in WSJ/Bloomberg/Reuters.",
    description:
      "Named-source M&A reports from institutional outlets. Requires corroboration via Form 4, 13D, or regulatory filings. Unnamed chatter is noise.",
    usedBy: ["CATALYST_EVENT"],
    detectors: ["wsj_scoop", "bloomberg_scoop", "sec_13d"],
    urgency: "HIGH",
  },
  {
    id: "INSIDER_BUYING",
    name: "Insider Buying",
    category: "EVENT",
    tagline: "Open-market insider purchases filed via Form 4.",
    description:
      "Individual insider buys are noise. Clusters (3+ insiders within 30 days) with meaningful dollar amounts (> $500K aggregate) are signal. Role matters — CEO/CFO buys > director qualifying buys.",
    usedBy: ["INSIDER_ACTIVITY", "DEEP_VALUE"],
    detectors: ["sec_edgar_form4", "openinsider", "finviz_insider"],
    urgency: "MEDIUM",
  },
  {
    id: "FORM_4_CLUSTER",
    name: "Form 4 Cluster",
    category: "EVENT",
    tagline: "Multiple insider purchases within a 30-day window.",
    description:
      "The high-quality version of INSIDER_BUYING — 3+ insiders transacting in the same direction within 30 days. Drives conviction because it implies shared internal view.",
    usedBy: ["INSIDER_ACTIVITY"],
    detectors: ["sec_edgar_form4", "openinsider"],
    urgency: "HIGH",
  },
  {
    id: "GUIDANCE",
    name: "Guidance Update",
    category: "EVENT",
    tagline: "Mid-quarter or off-cycle guidance change.",
    description:
      "Guidance raised or cut outside of earnings is a strong signal — it implies management saw enough mid-quarter to act. 8-K filed with details.",
    usedBy: ["CATALYST_EVENT", "EARNINGS_DRIFT"],
    detectors: ["sec_8k", "press_release"],
    urgency: "HIGH",
  },

  // ── SENTIMENT ──────────────────────────────────────────────────────────
  {
    id: "THEME_MOMENTUM",
    name: "Theme Momentum",
    category: "SENTIMENT",
    tagline: "Accelerating news/research coverage of a secular theme.",
    description:
      "Increasing density of premium publications covering a theme (AI infra, GLP-1, EV transition). Signal for secular theme allocators to scale exposure; inverse signal for mean-reversion traders worried about hype.",
    usedBy: ["THEMATIC_SECULAR"],
    detectors: ["sonar_theme", "domain_monitor"],
    urgency: "LOW",
  },
  {
    id: "FEAR_INDICATOR",
    name: "Fear Indicator",
    category: "SENTIMENT",
    tagline: "VIX spike, fear & greed extremes, or put/call extreme.",
    description:
      "Contrarian signal — extreme fear often precedes short-term bounces in quality names. VIX > 25 with Fear & Greed < 25 and put/call > 1.2 is the classic setup.",
    usedBy: ["MEAN_REVERSION_OVERSOLD"],
    detectors: ["market_context", "cnn_fear_greed"],
    urgency: "MEDIUM",
  },
  {
    id: "VOLATILITY_SPIKE",
    name: "Volatility Spike",
    category: "SENTIMENT",
    tagline: "Single-name or index volatility jumps outside 95th percentile.",
    description:
      "Anomalous IV spike often precedes catalysts. Paired with other signals (flow, earnings) reinforces conviction.",
    usedBy: ["MEAN_REVERSION_OVERSOLD", "UNUSUAL_OPTIONS"],
    detectors: ["options_flow_api", "market_context"],
    urgency: "MEDIUM",
  },

  // ── MACRO ──────────────────────────────────────────────────────────────
  {
    id: "SECTOR_ROTATION",
    name: "Sector Rotation",
    category: "MACRO",
    tagline: "Leadership shift among the 11 S&P sectors.",
    description:
      "Relative strength shift between sectors, typically driven by macro regime change (rates, commodity prices, geopolitical). Sector Rotation strategies key off this signal.",
    usedBy: ["SECTOR_ROTATION"],
    detectors: ["spdr_sector_etfs", "market_context"],
    urgency: "MEDIUM",
  },
  {
    id: "MACRO_SHIFT",
    name: "Macro Regime Shift",
    category: "MACRO",
    tagline: "Yield curve, VIX regime, or Fed policy change.",
    description:
      "Multi-factor macro regime change — yield curve inversion/dis-inversion, Fed pivot language, commodity regime. Drives sector rotation and defensive/offensive positioning.",
    usedBy: ["SECTOR_ROTATION", "THEMATIC_SECULAR"],
    detectors: ["macro_api", "fed_communication", "yield_curve"],
    urgency: "MEDIUM",
  },
  {
    id: "CAPEX_TREND",
    name: "Capex Trend",
    category: "MACRO",
    tagline: "Industry-wide capex acceleration or deceleration.",
    description:
      "Multi-quarter capex acceleration in an industry signals secular demand (hyperscaler AI capex being the canonical recent example). Drives picks-and-shovels allocation.",
    usedBy: ["THEMATIC_SECULAR"],
    detectors: ["earnings_calls", "sonar_theme", "10k_filings"],
    urgency: "LOW",
  },
];

/** Lookup by ID. */
export function getSignalType(id: string): SignalType | null {
  return SIGNAL_TYPES.find((s) => s.id === id) ?? null;
}

/** Signal types in a category. */
export function signalsByCategory(category: SignalCategory): SignalType[] {
  return SIGNAL_TYPES.filter((s) => s.category === category);
}

/** Signal types matching a list of IDs (used by archetype lookups). */
export function resolveSignalIds(ids: string[]): SignalType[] {
  return ids.map((id) => getSignalType(id)).filter((s): s is SignalType => s != null);
}

/** All signal IDs — useful for validation in suggest_config. */
export function allSignalIds(): string[] {
  return SIGNAL_TYPES.map((s) => s.id);
}

/** Short list for prompt inclusion. */
export function signalIndex(): Array<{ id: string; name: string; category: SignalCategory; urgency: string }> {
  return SIGNAL_TYPES.map(({ id, name, category, urgency }) => ({ id, name, category, urgency }));
}
