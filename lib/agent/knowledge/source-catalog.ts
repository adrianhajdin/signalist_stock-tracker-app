/**
 * Source catalog — curated list of research sources with quality scores,
 * categories, and analyst-fit notes.
 *
 * The builder/editor agents read this via read_source_catalog when
 * proposing domain monitors. Prevents the agent from hallucinating
 * random financial-sounding domains and keeps the set of sources
 * aligned with what the intelligence pipeline knows how to monitor.
 *
 * Each source has:
 *   - id — STABLE unique ID used by archetypes.keySources and by tools
 *   - domain — used by the domain monitor + Firecrawl
 *   - category — MARKET | SECTOR | COMPANY | THEMATIC | SOCIAL | EVENT | DATA | PRIMARY
 *   - quality — 1-5, drives surfacing priority
 *   - bestFor — which archetypes or topics this source serves best
 *   - caveats — known gotchas (paywall, stale data, quality dips)
 */

export type SourceCategory =
  | "MARKET"
  | "SECTOR"
  | "COMPANY"
  | "THEMATIC"
  | "SOCIAL"
  | "EVENT"
  | "DATA"
  | "PRIMARY";

export interface SourceEntry {
  id: string;
  name: string;
  domain: string;
  category: SourceCategory;
  /** 1 = low, 5 = best-in-class */
  quality: 1 | 2 | 3 | 4 | 5;
  /** What this source is actually good for */
  bestFor: string[];
  /** Short description shown in UIs and prompts */
  description: string;
  /** Known gotchas */
  caveats?: string[];
  /** True if usually behind paywall — builder should warn user */
  paywalled?: boolean;
}

export const SOURCE_CATALOG: SourceEntry[] = [
  // ── PRIMARY SOURCES (regulatory, official) ────────────────────────────────
  {
    id: "SEC_EDGAR",
    name: "SEC EDGAR",
    domain: "sec.gov",
    category: "PRIMARY",
    quality: 5,
    bestFor: ["Insider activity", "SEC filings", "Proxy statements", "10-K/10-Q", "8-K events"],
    description: "Primary source for all U.S. public company SEC filings. The ground truth for insider transactions (Form 4), annual reports (10-K), quarterly updates (10-Q), and material events (8-K).",
    caveats: ["Raw filings — needs parsing. Use get_sec_filings tool rather than scraping directly."],
  },
  {
    id: "FDA_CALENDAR",
    name: "FDA Calendar",
    domain: "fda.gov",
    category: "PRIMARY",
    quality: 5,
    bestFor: ["PDUFA dates", "Drug approvals", "Advisory committee meetings"],
    description: "Official FDA calendar and press releases. Critical for any biotech-adjacent strategy. PDUFA dates are binary, high-conviction catalysts.",
    caveats: ["FDA can extend PDUFA dates with short notice — always verify latest."],
  },

  // ── MARKET / MACRO ────────────────────────────────────────────────────────
  {
    id: "WSJ_MARKETS",
    name: "WSJ Markets",
    domain: "wsj.com",
    category: "MARKET",
    quality: 5,
    bestFor: ["Market commentary", "Macro analysis", "Fed coverage", "Breaking market news"],
    description: "Institutional-grade market coverage. Strong on Fed policy, macro, and M&A reporting.",
    paywalled: true,
  },
  {
    id: "BARRONS",
    name: "Barron's",
    domain: "barrons.com",
    category: "MARKET",
    quality: 5,
    bestFor: ["Weekly market analysis", "Stock picks", "Cover story catalysts"],
    description: "Weekly market magazine with institutional following. Cover stories often drive monday moves.",
    paywalled: true,
  },
  {
    id: "BLOOMBERG",
    name: "Bloomberg",
    domain: "bloomberg.com",
    category: "MARKET",
    quality: 5,
    bestFor: ["Breaking financial news", "M&A", "Macro coverage"],
    description: "First-break news for financial events. Deep coverage of debt markets and global macro.",
    paywalled: true,
  },
  {
    id: "CNBC",
    name: "CNBC",
    domain: "cnbc.com",
    category: "MARKET",
    quality: 3,
    bestFor: ["Breaking news", "Guidance updates", "Analyst commentary"],
    description: "Real-time market news, often first with earnings previews and guidance chatter.",
    caveats: ["Commentary-heavy — filter signal from noise. Strong for breaking news, weak for analysis."],
  },
  {
    id: "MARKETWATCH",
    name: "MarketWatch",
    domain: "marketwatch.com",
    category: "MARKET",
    quality: 3,
    bestFor: ["General market news", "Economic data releases", "Stock summaries"],
    description: "Broad market news with a consumer tilt. Good for earnings recaps and economic data.",
  },

  // ── SECTOR / INDUSTRY ────────────────────────────────────────────────────
  {
    id: "ELECTREK",
    name: "Electrek",
    domain: "electrek.co",
    category: "SECTOR",
    quality: 4,
    bestFor: ["EV/clean energy", "Tesla coverage", "Battery technology"],
    description: "Best-in-class EV and clean energy industry coverage.",
  },
  {
    id: "BIO_PHARMA_CATALYSTS",
    name: "BioPharmaCatalyst",
    domain: "biopharmcatalyst.com",
    category: "SECTOR",
    quality: 4,
    bestFor: ["Biotech catalyst calendar", "Clinical trial readouts", "FDA calendar"],
    description: "Crowd-sourced biotech catalyst calendar. Essential for any biotech-adjacent strategy.",
  },
  {
    id: "ENDPOINTS_NEWS",
    name: "Endpoints News",
    domain: "endpts.com",
    category: "SECTOR",
    quality: 5,
    bestFor: ["Biotech deep reporting", "M&A in pharma", "Trial analysis"],
    description: "Premier biotech industry reporting. Institutional following.",
    paywalled: true,
  },
  {
    id: "STRATECHERY",
    name: "Stratechery",
    domain: "stratechery.com",
    category: "SECTOR",
    quality: 5,
    bestFor: ["Tech strategy analysis", "Platform economics", "Secular theme framing"],
    description: "Ben Thompson's long-form tech strategy analysis. Strong for picks-and-shovels thinking.",
    paywalled: true,
  },
  {
    id: "THE_INFORMATION",
    name: "The Information",
    domain: "theinformation.com",
    category: "SECTOR",
    quality: 5,
    bestFor: ["Tech company scoops", "Private/VC-backed company coverage"],
    description: "Premium tech journalism with frequent scoops on Big Tech and startups.",
    paywalled: true,
  },
  {
    id: "SEMIANALYSIS",
    name: "SemiAnalysis",
    domain: "semianalysis.com",
    category: "SECTOR",
    quality: 5,
    bestFor: ["Semiconductor industry deep-dives", "AI infrastructure", "Data center capex"],
    description: "Deep technical semiconductor and AI infrastructure analysis.",
    paywalled: true,
  },

  // ── COMPANY / RESEARCH ────────────────────────────────────────────────────
  {
    id: "SEEKING_ALPHA",
    name: "Seeking Alpha",
    domain: "seekingalpha.com",
    category: "COMPANY",
    quality: 3,
    bestFor: ["Long-form company analysis", "Bear cases", "Earnings recaps"],
    description: "Crowd-sourced stock analysis. Quality is highly variable — filter by contributor reputation.",
    caveats: ["Quality varies wildly by contributor. Favor vetted authors with track records."],
  },
  {
    id: "MORNINGSTAR",
    name: "Morningstar",
    domain: "morningstar.com",
    category: "COMPANY",
    quality: 4,
    bestFor: ["Moat analysis", "Fair value estimates", "Fund research"],
    description: "Institutional-quality equity research focused on moats and fair value. Good for long-term investors.",
  },
  {
    id: "VIC",
    name: "Value Investors Club",
    domain: "valueinvestorsclub.com",
    category: "COMPANY",
    quality: 5,
    bestFor: ["Deep-value ideas", "Contrarian thesis writeups"],
    description: "Invite-only value investing community. 45-day delayed but high-quality writeups.",
    caveats: ["Free tier has 45-day delay — recent ideas require membership."],
  },
  {
    id: "STREET_INSIDER",
    name: "StreetInsider",
    domain: "streetinsider.com",
    category: "COMPANY",
    quality: 3,
    bestFor: ["Analyst ratings changes", "Insider transactions", "Earnings summaries"],
    description: "Aggregates analyst actions and insider data. Fast but thin analysis.",
  },

  // ── DATA / TOOLS ──────────────────────────────────────────────────────────
  {
    id: "FINVIZ",
    name: "Finviz",
    domain: "finviz.com",
    category: "DATA",
    quality: 4,
    bestFor: ["Stock screening", "Heatmaps", "News aggregation"],
    description: "Fast stock screener and market heatmap. Good for discovering setups.",
  },
  {
    id: "FINVIZ_INSIDER",
    name: "Finviz Insider",
    domain: "finviz.com/insidertrading.ashx",
    category: "DATA",
    quality: 4,
    bestFor: ["Insider transactions", "Cluster buying detection"],
    description: "Clean tabular view of recent Form 4 filings.",
  },
  {
    id: "OPENINSIDER",
    name: "OpenInsider",
    domain: "openinsider.com",
    category: "DATA",
    quality: 4,
    bestFor: ["Insider transaction analysis", "Cluster detection"],
    description: "Free insider activity aggregator. Strong for cluster buying strategies.",
  },
  {
    id: "STOCKCHARTS",
    name: "StockCharts",
    domain: "stockcharts.com",
    category: "DATA",
    quality: 4,
    bestFor: ["Technical analysis", "Chart patterns", "Relative strength"],
    description: "Technical charting platform. Best-in-class for RS analysis and pattern identification.",
  },
  {
    id: "SPDR_SECTOR",
    name: "SPDR Sector ETFs",
    domain: "sectorspdrs.com",
    category: "DATA",
    quality: 4,
    bestFor: ["Sector rotation analysis", "Sector composition"],
    description: "Official SPDR sector ETF data. Definitive source for sector performance and top holdings.",
  },
  {
    id: "FMP_EARNINGS",
    name: "FMP Earnings Calendar",
    domain: "financialmodelingprep.com",
    category: "DATA",
    quality: 4,
    bestFor: ["Earnings calendar", "EPS estimates", "Historical EPS"],
    description: "API-driven earnings calendar. Powers our get_earnings_data tool.",
  },
  {
    id: "FINNHUB_RECOMMENDATIONS",
    name: "Finnhub Recommendations",
    domain: "finnhub.io",
    category: "DATA",
    quality: 4,
    bestFor: ["Analyst ratings", "Price targets", "Revisions"],
    description: "Aggregated analyst recommendation data via API. Powers get_stock_data analyst consensus.",
  },

  // ── SOCIAL / ALT-DATA ────────────────────────────────────────────────────
  {
    id: "UNUSUAL_WHALES",
    name: "Unusual Whales",
    domain: "unusualwhales.com",
    category: "SOCIAL",
    quality: 3,
    bestFor: ["Options flow", "Dark pool activity", "Political trades"],
    description: "Options flow aggregator with retail-friendly UI.",
    caveats: ["Flow alone is noisy — needs fundamental cross-reference."],
    paywalled: true,
  },
  {
    id: "CHEDDAR_FLOW",
    name: "Cheddar Flow",
    domain: "cheddarflow.com",
    category: "SOCIAL",
    quality: 3,
    bestFor: ["Options flow detection"],
    description: "Real-time options flow alerts.",
    paywalled: true,
  },
  {
    id: "BENZINGA_PRO",
    name: "Benzinga Pro",
    domain: "pro.benzinga.com",
    category: "EVENT",
    quality: 4,
    bestFor: ["Breaking news terminal", "Event-driven trading", "M&A rumors"],
    description: "Real-time news terminal favored by day traders.",
    paywalled: true,
  },
  {
    id: "BENZINGA",
    name: "Benzinga",
    domain: "benzinga.com",
    category: "EVENT",
    quality: 3,
    bestFor: ["Breaking news", "Analyst action summaries"],
    description: "Free-tier market news with fast breaks on analyst actions.",
  },

  // ── THEMATIC / LONG-FORM ─────────────────────────────────────────────────
  {
    id: "WSJ_TECH",
    name: "WSJ Technology",
    domain: "wsj.com/tech",
    category: "THEMATIC",
    quality: 5,
    bestFor: ["Tech trends", "Industry shifts", "Regulatory coverage"],
    description: "WSJ tech vertical. Strong for thematic analysis.",
    paywalled: true,
  },
  {
    id: "FT_MARKETS",
    name: "Financial Times Markets",
    domain: "ft.com",
    category: "THEMATIC",
    quality: 5,
    bestFor: ["Global macro", "European markets", "Commodity coverage"],
    description: "UK/European-anchored coverage. Strong for FX, commodity, global macro.",
    paywalled: true,
  },
  {
    id: "AXIOS_MARKETS",
    name: "Axios Markets",
    domain: "axios.com/markets",
    category: "THEMATIC",
    quality: 3,
    bestFor: ["Daily macro digest", "Policy coverage"],
    description: "Quick-read daily market brief. Good for high-level policy context.",
  },

  // ── INSIDER / COMPETITIVE ────────────────────────────────────────────────
  {
    id: "INSIDER_MONKEY",
    name: "Insider Monkey",
    domain: "insidermonkey.com",
    category: "SOCIAL",
    quality: 2,
    bestFor: ["13F fund tracking", "Insider activity recaps"],
    description: "Aggregates 13F data and insider activity. Content quality variable.",
    caveats: ["Heavy SEO noise — filter for primary data."],
  },
];

/** Lookup by ID. */
export function getSource(id: string): SourceEntry | null {
  return SOURCE_CATALOG.find((s) => s.id === id) ?? null;
}

/** Sources filtered by category. */
export function sourcesByCategory(category: SourceCategory): SourceEntry[] {
  return SOURCE_CATALOG.filter((s) => s.category === category);
}

/** High-quality subset (quality >= 4). */
export function premiumSources(): SourceEntry[] {
  return SOURCE_CATALOG.filter((s) => s.quality >= 4);
}

/** Short list for prompt inclusion. */
export function sourceIndex(): Array<{ id: string; name: string; domain: string; category: SourceCategory; quality: number }> {
  return SOURCE_CATALOG.map(({ id, name, domain, category, quality }) => ({
    id,
    name,
    domain,
    category,
    quality,
  }));
}

/** Bulk lookup used by archetypes.keySources. */
export function resolveSourceIds(ids: string[]): SourceEntry[] {
  return ids.map((id) => getSource(id)).filter((s): s is SourceEntry => s != null);
}
