/**
 * Universe helpers — shared by agent tools that need to check whether a
 * ticker / sector / industry / cap is in-scope for the analyst's fence.
 *
 * Match semantics (see docs/UNIVERSE_HANDOFF.md):
 *   - empty array / null numeric = no filter on that dimension
 *   - AND across non-empty dimensions, OR within a dimension
 *   - exclusionList wins (hard reject)
 *   - watchlist + open positions bypass the fence — enforced in-code here,
 *     not just at the prompt layer
 *
 * Session A follow-up: values arriving from Finnhub's `finnhubIndustry` field
 * are a mix of sectors, industries, and aliases. checkUniverse runs them
 * through `normalizeTickerSector` so a fence of `["Information Technology"]`
 * matches tickers whose ticker-side field is `"Technology"`, `"Software"`,
 * `"Semiconductors"`, etc.
 */

import {
  normalizeTickerSector,
  normalizeIndustry,
} from "@/lib/universe/canonical";

export interface UniverseFence {
  sectors?: string[];
  industries?: string[];
  themes?: string[];
  marketCapMin?: number | null;
  marketCapMax?: number | null;
  exclusionList?: string[];
  /**
   * Tickers the analyst already holds. Bypasses the sector / industry / cap
   * checks — an existing position is always in-scope for analysis.
   */
  positionTickers?: string[];
  /**
   * Tickers on the analyst's watchlist. Bypasses the fence like positions
   * do, so a watchlisted ticker never gets flagged "outside universe".
   */
  watchlistTickers?: string[];
}

export interface TickerFacts {
  ticker: string;
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null; // dollars
}

export interface UniverseCheck {
  /** true = every non-empty dimension is satisfied and the ticker is NOT excluded */
  inUniverse: boolean;
  /** true only for hard-reject exclusionList hits */
  excluded: boolean;
  /** one-line reasons the ticker failed (empty if inUniverse) */
  failedReasons: string[];
  /** dimension values that matched (for UI / narration) */
  matched: {
    sector?: string;
    industry?: string;
    marketCapOk?: boolean;
    /** When the ticker bypassed the fence due to being held or watchlisted. */
    bypass?: "position" | "watchlist";
  };
}

/** Normalize a tag for loose matching: lowercase, strip non-alphanumeric. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Case-insensitive normalized contains check for a value in an array. */
function includesNorm(haystack: string[], needle: string): boolean {
  const n = norm(needle);
  if (!n) return false;
  return haystack.some((h) => norm(h) === n);
}

/**
 * Is the ticker on the analyst's exclusionList? Hard reject — wins over
 * every other dimension. Used to block place_trade and manage_watchlist ADD.
 */
export function isExcluded(ticker: string, fence: UniverseFence): boolean {
  const list = fence.exclusionList;
  if (!list?.length) return false;
  const upper = ticker.toUpperCase().trim();
  return list.some((e) => e.toUpperCase().trim() === upper);
}

/**
 * Full Universe check given the analyst's fence and the ticker's facts.
 * Returns a structured result the tool can include in its data payload for
 * UI rendering + narration hints.
 *
 * When a dimension on the analyst side is empty (e.g. no industries set),
 * that dimension is considered satisfied (no filter). If a dimension is set
 * but the ticker's facts don't include the corresponding field, the check
 * is inconclusive — we treat that as "satisfied" (don't block on missing
 * data) and record it so the caller can narrate "data missing" if useful.
 */
export function checkUniverse(facts: TickerFacts, fence: UniverseFence): UniverseCheck {
  const failedReasons: string[] = [];
  const matched: UniverseCheck["matched"] = {};
  const upperTicker = facts.ticker.toUpperCase().trim();

  // 1. Exclusion — hard reject (wins even over held positions)
  if (isExcluded(facts.ticker, fence)) {
    return {
      inUniverse: false,
      excluded: true,
      failedReasons: [`$${upperTicker} is on the exclusion list`],
      matched: {},
    };
  }

  // 2. Position / watchlist bypass — a ticker the analyst already owns or is
  // watching is always in-scope for analysis. The fence exists to CONTROL
  // discovery; it should never block review of known holdings. This is now
  // enforced by code (not just prompt narration), so a prompt-layer wobble
  // can't cause the agent to silently drop held positions.
  if (fence.positionTickers?.some((t) => t.toUpperCase().trim() === upperTicker)) {
    return {
      inUniverse: true,
      excluded: false,
      failedReasons: [],
      matched: { bypass: "position" },
    };
  }
  if (fence.watchlistTickers?.some((t) => t.toUpperCase().trim() === upperTicker)) {
    return {
      inUniverse: true,
      excluded: false,
      failedReasons: [],
      matched: { bypass: "watchlist" },
    };
  }

  // 3. Sectors (AND dimension)
  // The ticker-side `sector` field usually comes from Finnhub's
  // `finnhubIndustry`, which is a grab bag of sector names ("Technology"),
  // industry names ("Semiconductors"), and aliases ("Tech", "Biotech"). We
  // run it through normalizeTickerSector first so an "Information Technology"
  // fence matches either a reported sector of "Technology" OR a reported
  // industry like "Semiconductors" / "Software" whose parent sector is IT.
  if (fence.sectors?.length) {
    const normalizedFactsSector = normalizeTickerSector(facts.sector);
    const canonicalFence = fence.sectors
      .map((s) => normalizeTickerSector(s))
      .filter((s): s is NonNullable<typeof s> => s != null);

    if (
      normalizedFactsSector &&
      canonicalFence.includes(normalizedFactsSector)
    ) {
      matched.sector = normalizedFactsSector;
    } else if (facts.sector && includesNorm(fence.sectors, facts.sector)) {
      // Fallback: raw loose-norm compare. Catches pre-Session-A analyst
      // configs still carrying legacy values + any Finnhub string outside
      // the alias table that happens to match the fence verbatim.
      matched.sector = facts.sector;
    } else if (facts.sector) {
      failedReasons.push(`sector ${facts.sector} not in [${fence.sectors.join(", ")}]`);
    }
    // If facts.sector is null, don't fail — data missing, treat as inconclusive.
  }

  // 4. Industries (AND dimension)
  // Same treatment as sectors — try canonical industry matching first, fall
  // back to loose-norm compare so legacy values keep working.
  if (fence.industries?.length) {
    const normalizedFactsIndustry = normalizeIndustry(facts.industry);
    const canonicalFence = fence.industries
      .map((i) => normalizeIndustry(i))
      .filter((i): i is NonNullable<typeof i> => i != null);

    if (
      normalizedFactsIndustry &&
      canonicalFence.includes(normalizedFactsIndustry)
    ) {
      matched.industry = normalizedFactsIndustry;
    } else if (facts.industry && includesNorm(fence.industries, facts.industry)) {
      matched.industry = facts.industry;
    } else if (facts.industry) {
      failedReasons.push(`industry ${facts.industry} not in [${fence.industries.join(", ")}]`);
    }
  }

  // 4. Market cap (AND dimension — value must fall inside [min, max])
  if (fence.marketCapMin != null || fence.marketCapMax != null) {
    const cap = facts.marketCap;
    if (cap != null) {
      let capOk = true;
      if (fence.marketCapMin != null && cap < fence.marketCapMin) {
        capOk = false;
        failedReasons.push(`market cap ${formatCap(cap)} below minimum ${formatCap(fence.marketCapMin)}`);
      }
      if (fence.marketCapMax != null && cap > fence.marketCapMax) {
        capOk = false;
        failedReasons.push(`market cap ${formatCap(cap)} above maximum ${formatCap(fence.marketCapMax)}`);
      }
      matched.marketCapOk = capOk;
    }
  }

  return {
    inUniverse: failedReasons.length === 0,
    excluded: false,
    failedReasons,
    matched,
  };
}

/** Short human label for a dollar amount. 500_000_000 → "$500M". */
export function formatCap(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  if (amount >= 1_000_000_000_000) return `$${(amount / 1_000_000_000_000).toFixed(1)}T`;
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${amount.toFixed(0)}`;
}
