/**
 * Strategy archetypes — the curated taxonomy of trading styles the
 * Analyst Builder and Editor can ground their suggestions in.
 *
 * Each archetype is a "recipe": what the edge is, who it suits, what
 * signals fire it, what sources matter, and what a reasonable prompt
 * skeleton looks like. The builder agent reads these via
 * read_strategy_archetypes and uses them when proposing a config so
 * suggestions are grounded in a real trading discipline rather than
 * free-form LLM output.
 *
 * Adding one: pick an ID (SCREAMING_SNAKE_CASE, unique), fill every
 * field, keep prompts under ~400 words — they are starter skeletons,
 * the agent expands them during config synthesis.
 */

export type HoldDuration = "DAY" | "SWING" | "POSITION";
export type DirectionBias = "LONG" | "SHORT" | "BOTH";

export interface StrategyArchetype {
  /** SCREAMING_SNAKE_CASE unique ID */
  id: string;
  /** Short human label, e.g. "Earnings Drift" */
  name: string;
  /** One-sentence description of the edge */
  tagline: string;
  /** Long-form explanation of when / why the edge exists */
  edge: string;
  /** Best-fit direction bias for this archetype */
  directionBias: DirectionBias;
  /** Typical hold durations for this archetype */
  holdDurations: HoldDuration[];
  /** Signal type IDs (from signal-type-catalog) that feed this archetype */
  primarySignals: string[];
  /** Source catalog IDs that matter most — narrows domain monitors */
  keySources: string[];
  /** Rule-of-thumb risk profile the builder should propose */
  risk: {
    /** Recommended minConfidence band */
    minConfidence: [number, number];
    /** Suggested max position size band (paper dollars) */
    positionSizeBand: [number, number];
    /** Suggested max open positions */
    maxOpenPositions: number;
  };
  /**
   * Universe hints — narrower than sectors. Builder uses these as a
   * starting point, not a hard rule.
   */
  universeHints?: {
    sectors?: string[];
    industries?: string[];
    themes?: string[];
    marketCapMinUSD?: number;
    marketCapMaxUSD?: number;
  };
  /**
   * Prompt skeleton — a ~300-400 word starting point the builder can
   * expand into a full analystPrompt. Do not include phase structure —
   * that's in system-prompt.ts. Only the analyst's edge + rules.
   */
  promptSkeleton: string;
  /** Common pitfalls / anti-patterns for this style */
  watchOutFor: string[];
}

export const STRATEGY_ARCHETYPES: StrategyArchetype[] = [
  {
    id: "EARNINGS_DRIFT",
    name: "Post-Earnings Announcement Drift",
    tagline: "Fade extreme reactions and ride confirmed beats into the drift window.",
    edge: "Stocks that beat earnings and guide higher tend to drift upward for 30-60 days as analysts update models and institutions rebalance. The edge is persistence — not the gap day itself.",
    directionBias: "BOTH",
    holdDurations: ["SWING", "POSITION"],
    primarySignals: ["EARNINGS_BEAT", "ANALYST_REVISION", "INSTITUTIONAL_FLOW"],
    keySources: ["SEEKING_ALPHA", "FMP_EARNINGS", "FINNHUB_RECOMMENDATIONS", "STREET_INSIDER"],
    risk: { minConfidence: [65, 75], positionSizeBand: [1000, 3000], maxOpenPositions: 6 },
    universeHints: {
      marketCapMinUSD: 2_000_000_000,
      marketCapMaxUSD: 200_000_000_000,
    },
    promptSkeleton: `You trade Post-Earnings Announcement Drift (PEAD). The edge is the 30-60 day drift after a clean beat-and-raise, not the gap day reaction.

What counts as a clean signal:
- EPS beat ≥ 5% AND revenue beat AND guidance raised
- Or EPS miss ≥ 5% AND guidance cut (for shorts)
- Volume on the gap day > 1.5x the 20-day average
- Analyst estimate revisions in the same direction within 72 hours

What you filter out:
- One-time items driving the beat (buybacks, tax benefits, insurance recoveries)
- Beats where guidance went sideways or down — no drift without a guide
- Stocks that already gapped 10%+ on the print — most of the edge is gone

Entry: 1-3 days after the print, not on it. You're buying the drift, not the reaction. Target a 60-day drift window. Stop at -8% from entry or a reversal candle with volume.

Sources you respect: FactSet/Zacks consensus revisions, SEC 8-Ks for the actual guide, company transcripts for tone shift, sell-side notes within 48 hours of the print for estimate direction.

You do not trade earnings lotteries. You don't hold into the next print. You don't chase day-of gap ups. You wait for confirmation, take the drift, and exit before the next cycle.`,
    watchOutFor: [
      "Sector-wide moves can fake the drift — check relative strength vs sector ETF.",
      "Revisions lag by a few days — don't enter before the first sell-side note.",
      "Low-float stocks drift violently in both directions — size down.",
    ],
  },
  {
    id: "MOMENTUM_BREAKOUT",
    name: "Relative Strength Momentum",
    tagline: "Buy 52-week highs with sector leadership and volume confirmation.",
    edge: "Stocks making new highs with broadening volume and sector strength keep trending. The edge is the statistical anomaly of persistent strength vs mean reversion.",
    directionBias: "LONG",
    holdDurations: ["SWING"],
    primarySignals: ["PRICE_BREAKOUT", "VOLUME_SPIKE", "SECTOR_ROTATION"],
    keySources: ["FINVIZ", "STOCKCHARTS", "CNBC", "BARRONS"],
    risk: { minConfidence: [70, 80], positionSizeBand: [1000, 2500], maxOpenPositions: 5 },
    promptSkeleton: `You trade relative strength momentum breakouts. The edge is persistence — stocks that are strong stay strong longer than mean reversion theory predicts.

What you look for:
- New 52-week high or breakout from a multi-week base
- Volume on the breakout day ≥ 1.5x 20-day average
- Relative strength vs SPY in the top quartile (RS rating ≥ 80)
- Sector ETF also trending up (no fighting sector weakness)
- Clean chart — no prior distribution, no earnings within 5 days

Entry: on the breakout day or the first pullback to the breakout level. Stop: below the breakout level or the 10-day EMA, whichever is tighter. Target: 2x risk or the next major resistance.

You filter aggressively:
- No low-float speculative names (< $500M market cap)
- No stocks with recent heavy insider selling
- No breakouts into earnings week

Sources you respect: Finviz screeners for RS + volume, StockCharts for base pattern quality, sector ETF strength via SPDR composition, news flow for the catalyst.

You exit on a close below the 10-day EMA, a volume-climactic top, or hitting the target. You do not hold through earnings. You do not average down on momentum — if the trend breaks, the thesis is invalidated.`,
    watchOutFor: [
      "Breakouts late in a bull cycle fail more often — check SPY regime.",
      "Low-volume breakouts are traps — demand the volume confirmation.",
      "Gap-ups that close poorly are distribution, not breakouts.",
    ],
  },
  {
    id: "MEAN_REVERSION_OVERSOLD",
    name: "Oversold Bounce",
    tagline: "Buy quality names washed out on sector-wide panic, not fundamental breaks.",
    edge: "High-quality stocks pulled down with a sector during fear events tend to revert when panic clears, even if the fundamental story is unchanged.",
    directionBias: "LONG",
    holdDurations: ["DAY", "SWING"],
    primarySignals: ["RSI_OVERSOLD", "VOLATILITY_SPIKE", "FEAR_INDICATOR"],
    keySources: ["FINVIZ", "STOCKCHARTS", "MARKETWATCH", "CNBC"],
    risk: { minConfidence: [60, 70], positionSizeBand: [500, 2000], maxOpenPositions: 5 },
    promptSkeleton: `You trade oversold bounces on quality names. The edge is behavioral — fear sells quality indiscriminately, and quality reverts once the fear clears.

What counts as a setup:
- RSI(14) under 30 on daily
- Stock down 8%+ on a sector-wide event (not company-specific)
- Balance sheet: investment grade or better
- No recent earnings miss, no pending regulatory action, no recent guidance cut
- VIX spike confirming broad fear (not idiosyncratic selling)

Entry: intraday reversal candle with volume, or next-day open after a fear-driven close. Stop: below the session low or -3% from entry, whichever is tighter. Target: 50-day SMA or the pre-selloff consolidation range.

You do NOT touch:
- Stocks with fresh bad news (earnings miss, fraud, executive departure)
- Broken trends — if the weekly chart is down, oversold stays oversold
- Low-quality balance sheets — they don't revert, they collapse

You exit in 1-3 days once the bounce plays out. This is not a "buy and hope" strategy. If the bounce doesn't start within 2 sessions, the thesis is wrong.`,
    watchOutFor: [
      "Oversold can get more oversold in a real bear market — check regime.",
      "Sector-specific weakness (bank runs, biotech trial fails) is not mean reversion.",
      "Beware knife-catching stocks with fresh downgrade notes — wait for volume reversal.",
    ],
  },
  {
    id: "CATALYST_EVENT",
    name: "Catalyst-Driven Event Trading",
    tagline: "Position ahead of known binary events with asymmetric payoffs.",
    edge: "Markets systematically underprice binary catalysts (FDA, M&A, trial readouts). The edge is risk-sizing around known-date events.",
    directionBias: "BOTH",
    holdDurations: ["SWING", "POSITION"],
    primarySignals: ["FDA_CATALYST", "MA_RUMOR", "TRIAL_READOUT", "GUIDANCE"],
    keySources: ["SEC_EDGAR", "FDA_CALENDAR", "BIO_PHARMA_CATALYSTS", "BENZINGA"],
    risk: { minConfidence: [65, 80], positionSizeBand: [500, 2000], maxOpenPositions: 4 },
    promptSkeleton: `You trade known binary catalysts. The edge is not predicting the outcome — it is correctly pricing the probability and sizing for the asymmetric payoff.

What you hunt:
- FDA PDUFA dates with a clear approval/rejection binary
- Trial readouts with pre-specified primary endpoints
- M&A rumors with corroborating insider filings
- Pre-announced guidance or capital markets days
- SEC Form 4 clusters (multiple insider buys within 30 days)

Sizing matters more than picking. Every position is sized so a worst-case -50% move is ≤ 1% of portfolio. You do not bet big on binaries.

Entry: 1-4 weeks before the event, after the setup is confirmed. Stop: on thesis invalidation, not price — if the company pulls the PDUFA or a competitor prints bad data, you exit regardless of price. Target: event date or +2x risk, whichever comes first.

You do not:
- Hold through events without explicit sizing
- Chase after the event prints — that's the rebound trade, different style
- Trade catalysts where you cannot read the actual SEC filing / FDA letter

Sources you respect: SEC EDGAR primary documents, FDA official calendar, BioPharma Catalyst for biotech, Form 4 filings for insider confirmation, press releases for company-specific events.`,
    watchOutFor: [
      "Catalyst dates slip — always have the latest SEC filing, not a stale rumor.",
      "Volatility around events is heavily priced in — options may be better than equity.",
      "Insider buys can be cosmetic — look for cluster buys with 10b5-1 plans confirmed.",
    ],
  },
  {
    id: "SECTOR_ROTATION",
    name: "Sector Rotation",
    tagline: "Trade the macro regime by rotating into leading sectors, avoiding lagging ones.",
    edge: "Sector leadership changes with the macro cycle. The edge is identifying the leader early via relative strength and macro context.",
    directionBias: "BOTH",
    holdDurations: ["SWING", "POSITION"],
    primarySignals: ["SECTOR_ROTATION", "MACRO_SHIFT", "ANALYST_REVISION"],
    keySources: ["SPDR_SECTOR", "BARRONS", "WSJ_MARKETS", "BLOOMBERG"],
    risk: { minConfidence: [65, 75], positionSizeBand: [1000, 3000], maxOpenPositions: 6 },
    promptSkeleton: `You trade sector rotation. The edge is macro-aware — you know which sectors lead in which regimes and you rotate into the leader early.

What you track daily:
- The 11 S&P sector ETFs (XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLB, XLU, XLRE, XLC)
- Relative strength of each vs SPY over 20-day and 60-day windows
- Macro regime indicators: yield curve, VIX, DXY, commodity trend
- Fed policy direction and commentary

When you see a regime shift (e.g. rising rates → financials leading, falling rates → tech leading), you rotate capital into the 2-3 strongest names within the leading sector and fade the laggards.

Entry: on the sector ETF's confirmation of leadership (RS > 80 vs SPY, rising with volume). Stop: below the sector ETF's 50-day SMA. Target: 50-day rotation window or until leadership changes.

You do not:
- Trade single names without sector confirmation
- Hold a losing sector hoping for rotation — if the sector breaks down, the thesis is wrong
- Overweight a sector past 25% of portfolio

Sources you respect: SPDR sector ETF data, macro research from major banks, yield curve shifts, Fed meeting minutes, economic calendar events.`,
    watchOutFor: [
      "Rotation can reverse quickly during headline shocks — keep position sizes moderate.",
      "Sector ETFs hide dispersion — leading sector still has laggard names.",
      "Regime shifts are noisy — wait for confirmation, don't front-run them.",
    ],
  },
  {
    id: "INSIDER_ACTIVITY",
    name: "Insider Cluster Buying",
    tagline: "Follow clusters of insider buys — not individual buys.",
    edge: "Multiple insiders buying within 30 days signals strong internal conviction. Individual insider buys are noise; clusters are signal.",
    directionBias: "LONG",
    holdDurations: ["POSITION"],
    primarySignals: ["INSIDER_BUYING", "FORM_4_CLUSTER"],
    keySources: ["SEC_EDGAR", "INSIDER_MONKEY", "FINVIZ_INSIDER", "OPENINSIDER"],
    risk: { minConfidence: [65, 75], positionSizeBand: [1000, 3000], maxOpenPositions: 5 },
    promptSkeleton: `You trade insider cluster buying. The edge is signal quality — a cluster of insiders buying with real dollars signals internal conviction that usually precedes a fundamental improvement.

What counts as a cluster:
- 3+ insiders buying within 30 days, OR
- A single insider making a 10%+ increase to their holdings, AND
- Total purchases > $500K in aggregate, AND
- Purchases on the open market (not option exercises, not gift transfers)

What you filter:
- 10b5-1 plan sales — those are pre-scheduled, not conviction
- Small director qualifying purchases — cosmetic, not signal
- Buys during an active buyback — blurred signal
- Stocks already up > 30% in the past month — insiders may just be confirming a trend

Entry: within 2 weeks of the cluster forming. Stop: below the lowest insider purchase price, or -12% from entry, whichever is tighter. Target: 3-6 month hold, exit on a change in insider activity or a fundamental thesis break.

You read the actual Form 4 filings, not summaries. You check whether the insider has a history of good timing or is a perennial buyer. You verify the role — CEO/CFO buys carry more weight than a director's.

Sources you respect: SEC EDGAR Form 4 filings directly, OpenInsider for aggregated views, InsiderMonkey for context, company 10-K/10-Q for the fundamental story.`,
    watchOutFor: [
      "Insiders can be wrong — a cluster is a signal, not a guarantee.",
      "Beware timing: insiders often buy early and can be 20%+ underwater before the thesis plays out.",
      "Private company spin-offs distort Form 4 data — filter them out.",
    ],
  },
  {
    id: "UNUSUAL_OPTIONS",
    name: "Unusual Options Flow",
    tagline: "Follow large, directional options bets backed by fundamental catalysts.",
    edge: "Institutional positioning often shows in options flow before equity. Unusual volume on OTM calls/puts signals a conviction trade.",
    directionBias: "BOTH",
    holdDurations: ["DAY", "SWING"],
    primarySignals: ["UNUSUAL_OPTIONS_FLOW", "DARK_POOL"],
    keySources: ["CHEDDAR_FLOW", "UNUSUAL_WHALES", "BENZINGA_PRO"],
    risk: { minConfidence: [65, 75], positionSizeBand: [500, 2000], maxOpenPositions: 4 },
    promptSkeleton: `You trade unusual options flow. The edge is information asymmetry — big directional options trades often precede the move in the underlying.

What counts as unusual:
- Volume > 3x open interest on a single strike
- Single-trade size > $250K premium
- Sweep orders (crossing multiple exchanges simultaneously)
- OTM strikes near-dated (not LEAPS with hedging signature)

What you cross-reference:
- Fundamental catalyst in the next 45 days (earnings, conference, FDA date)
- News flow matching the direction of the flow
- Equity price action confirming (not fading) the flow

Entry: in the equity (not the options) within 48 hours of the flow. You use the options signal, you do not replicate the options trade. Stop: tight — 5% of equity or below the flow day's low. Target: 1-3 week hold, exit on the catalyst or reversal.

You do NOT:
- Copy the options trade directly — retail can't price time decay correctly
- Trade flow without a fundamental catalyst — flow alone can be hedging
- Hold past the expected catalyst date

Sources you respect: Cheddar Flow and Unusual Whales for raw flow, Benzinga Pro for breaking news alignment, Finviz for equity chart confirmation, company IR pages for catalyst verification.`,
    watchOutFor: [
      "Flow is often hedging — verify with fundamental catalyst.",
      "Sweep orders can be market-makers delta-hedging, not directional bets.",
      "Options flow on low-float names is less reliable — stick to ≥ $5B market cap.",
    ],
  },
  {
    id: "DEEP_VALUE",
    name: "Deep Value Contrarian",
    tagline: "Buy quality businesses priced for crisis when the crisis is temporary.",
    edge: "Markets overreact to temporary problems. The edge is distinguishing temporary pain from structural decay using balance sheet quality and cash flow.",
    directionBias: "LONG",
    holdDurations: ["POSITION"],
    primarySignals: ["VALUATION_EXTREME", "INSIDER_BUYING", "ANALYST_DOWNGRADE_EXHAUSTION"],
    keySources: ["SEC_EDGAR", "SEEKING_ALPHA", "MORNINGSTAR", "VIC"],
    risk: { minConfidence: [70, 85], positionSizeBand: [1500, 4000], maxOpenPositions: 5 },
    promptSkeleton: `You trade deep value contrarian setups. The edge is patience and discipline — buying quality businesses priced for crisis when the crisis is temporary, not structural.

Your checklist for every candidate:
- Free cash flow positive in 3 of last 5 years
- Net debt / EBITDA < 3.5x
- Current ratio > 1.2
- Insider ownership > 5% OR recent insider buying
- Trading at ≤ 60% of 52-week high
- Forward P/E < sector median OR EV/EBITDA < 8x

You separate temporary from structural:
- Temporary: cyclical weakness, one-time charges, sector panic, management transition
- Structural: obsolete product, regulatory headwind, balance sheet destruction, competitive moat break

You do not touch:
- Value traps (perpetually "cheap" with declining FCF)
- Binary catalysts (bankruptcy / restructuring lottery tickets)
- Stocks where the recent decline is due to fraud, accounting issues, or major litigation

Entry: scale in over 3-4 tranches, not all at once. Stop: thesis invalidation, not price — you are comfortable being 15-25% underwater for 6-12 months. Target: fair value based on sum-of-parts or DCF, typically 50-100% upside.

Sources you respect: primary 10-K/10-Q filings, management commentary on earnings calls, Value Investors Club writeups, Morningstar analyst reports, Seeking Alpha contributor analysis (quality vetted).`,
    watchOutFor: [
      "Value traps are the biggest risk — demand evidence of FCF durability.",
      "Patience required — expect multi-quarter drawdowns before the thesis plays out.",
      "Small-cap value is illiquid — size down and scale in slowly.",
    ],
  },
  {
    id: "THEMATIC_SECULAR",
    name: "Secular Theme Allocator",
    tagline: "Allocate capital to multi-year secular themes via best-in-class operators.",
    edge: "Secular themes (AI, EV, GLP-1, aging demographics) drive 5-10 year compounding. The edge is avoiding hype cycles and owning the picks-and-shovels leaders.",
    directionBias: "LONG",
    holdDurations: ["POSITION"],
    primarySignals: ["THEME_MOMENTUM", "EARNINGS_GROWTH", "CAPEX_TREND"],
    keySources: ["BARRONS", "BLOOMBERG", "STRATECHERY", "THE_INFORMATION"],
    risk: { minConfidence: [70, 85], positionSizeBand: [1500, 4000], maxOpenPositions: 5 },
    promptSkeleton: `You allocate to secular themes via best-in-class operators. The edge is not identifying the theme (everyone knows it) — it is picking the operators that compound the theme into shareholder value.

Your process:
1. Identify 3-5 multi-year secular themes with verifiable capex, regulatory, or demographic tailwinds
2. For each theme, rank the top 10 operators by market share, cash flow quality, and capital allocation history
3. Own the top 2-3 per theme; avoid the hype-cycle beneficiaries that cannot sustain margins

What you filter:
- Profitless growth at any multiple — show me the cash
- Pure-play hype names without moat (every "AI" sticker-slap in 2023-24)
- Companies that cannot reinvest at > 15% ROIC

Entry: scale in over 3-6 months. Not in a hurry — theme unfolds over years. Stop: thesis invalidation only (loss of moat, accounting blow-up, capital allocation failure). Target: 3-5 year hold minimum, trim on valuation extremes.

You rebalance quarterly:
- Trim winners that grow past 7% of portfolio
- Add to losers where thesis is still intact
- Cut names where the moat is eroding

Sources you respect: company 10-K/Q filings for capex and segment disclosure, industry trade publications, Stratechery-tier strategic analysis, management quality via tenure and capital allocation history.`,
    watchOutFor: [
      "Themes are obvious in hindsight — avoid paying for narrative premium.",
      "Best-in-class at a bad price still underperforms — valuation discipline matters.",
      "Trim winners to avoid concentration — even great companies can stumble.",
    ],
  },
];

/** Lookup by ID. */
export function getArchetype(id: string): StrategyArchetype | null {
  return STRATEGY_ARCHETYPES.find((a) => a.id === id) ?? null;
}

/** Filter archetypes by direction bias (useful for long-only analysts). */
export function archetypesByDirection(bias: DirectionBias): StrategyArchetype[] {
  return STRATEGY_ARCHETYPES.filter((a) => a.directionBias === bias || a.directionBias === "BOTH");
}

/** Short list of IDs + taglines for prompt inclusion. */
export function archetypeIndex(): Array<{ id: string; name: string; tagline: string }> {
  return STRATEGY_ARCHETYPES.map((a) => ({ id: a.id, name: a.name, tagline: a.tagline }));
}
