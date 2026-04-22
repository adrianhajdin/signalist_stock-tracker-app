/**
 * canonical.ts — the ONE source of truth for universe vocabulary.
 *
 * Session A (see docs/UNIVERSE_REBUILD_PLAN.md) replaces the vocabulary skew
 * documented in docs/UNIVERSE_CANONICALIZATION.md with a single canonical form
 * applied at every write path:
 *
 *   1. `SECTORS` / `INDUSTRIES` — GICS Title Case, the ONLY legal stored values.
 *   2. `normalizeSector` / `normalizeIndustry` — case-insensitive lookup +
 *      alias table. Used by Sonar ingestion, analyst writes, and the migration
 *      script. Returns `null` for unknowns (we never hallucinate a mapping).
 *   3. `normalizeTheme` — uppercase + snake_case, free-form (no canonical list).
 *
 * Read paths trust canonical values and use plain equality. No upper() hacks,
 * no in-memory filtering, no post-hoc reconciliation.
 *
 * If you add a new Sonar source or see an unmapped value in migration logs,
 * extend the alias tables below. Don't re-introduce case-insensitive compare
 * at the query layer.
 */

import { GICS_SECTORS, GICS_INDUSTRIES, GICS_INDUSTRIES_BY_SECTOR } from "./gics";

// ── Canonical enums ──────────────────────────────────────────────────────────

/**
 * The 11 GICS sectors, Title Case. Re-exported from `gics.ts` so the UI
 * combobox keeps pulling from the same list the router now enforces.
 */
export const SECTORS = GICS_SECTORS;
export type Sector = (typeof SECTORS)[number];

/**
 * GICS industries, Title Case. ~60 entries; same list the UI combobox shows.
 */
export const INDUSTRIES = GICS_INDUSTRIES;
export type Industry = (typeof INDUSTRIES)[number];

// ── Canonical lookup maps (case-insensitive exact match) ─────────────────────
// Keys are built with the same `toLookupKey` normalization used on inputs so
// canonical values round-trip (e.g. "Oil & Gas Exploration & Production"
// becomes the key "oil and gas exploration and production" on both sides).

const SECTOR_LOOKUP = new Map<string, Sector>(
  SECTORS.map((s) => [toLookupKey(s), s]),
);

const INDUSTRY_LOOKUP = new Map<string, Industry>(
  INDUSTRIES.map((i) => [toLookupKey(i), i]),
);

// ── Alias tables ─────────────────────────────────────────────────────────────
//
// Keys are normalized (lowercase, single-spaced, no punctuation).
// Seeded from:
//   - legacy SCREAMING_SNAKE values stored by older Builder proposals
//     (suggest-config.ts historically used "TECHNOLOGY", "HEALTHCARE", …)
//   - common Perplexity-returned variants ("Technology", "Tech", "Healthcare")
//   - industry shorthand Sonar regularly produces ("Biotech", "Auto", "SaaS")
// Extend by running `SELECT DISTINCT unnest(sectors) FROM "Signal"` and
// mapping every entry that doesn't exact-match a canonical value.

const SECTOR_ALIASES: Record<string, Sector> = {
  // Information Technology
  "technology": "Information Technology",
  "tech": "Information Technology",
  "it": "Information Technology",
  "information tech": "Information Technology",
  "info tech": "Information Technology",
  // Health Care
  "healthcare": "Health Care",
  "health": "Health Care",
  "health-care": "Health Care",
  "biotech": "Health Care",
  "pharma": "Health Care",
  "pharmaceutical": "Health Care",
  "pharmaceuticals": "Health Care",
  // Financials
  "finance": "Financials",
  "financial": "Financials",
  "financial services": "Financials",
  "banks": "Financials",
  "banking": "Financials",
  // Consumer Discretionary
  "consumer": "Consumer Discretionary",
  "discretionary": "Consumer Discretionary",
  "consumer disc": "Consumer Discretionary",
  "consumer cyclical": "Consumer Discretionary",
  // Consumer Staples
  "staples": "Consumer Staples",
  "consumer defensive": "Consumer Staples",
  "consumer non cyclical": "Consumer Staples",
  "consumer non-cyclical": "Consumer Staples",
  // Industrials
  "industrial": "Industrials",
  // Communication Services
  "communication": "Communication Services",
  "communications": "Communication Services",
  "telecom": "Communication Services",
  "telecoms": "Communication Services",
  "telecommunication": "Communication Services",
  "telecommunications": "Communication Services",
  "media": "Communication Services",
  // Real Estate
  "reit": "Real Estate",
  "reits": "Real Estate",
  // Energy, Utilities, Materials — exact-matched, listed here only when Sonar
  // returns something non-canonical.
  "oil and gas": "Energy",
  "oil & gas": "Energy",
  "mining": "Materials",
  "metals": "Materials",
  "metals and mining": "Materials",
  "metals & mining": "Materials",
  "utility": "Utilities",
};

const INDUSTRY_ALIASES: Record<string, Industry> = {
  // Semiconductors
  "semiconductor": "Semiconductors",
  "semis": "Semiconductors",
  "chip": "Semiconductors",
  "chips": "Semiconductors",
  "memory chips": "Semiconductors",
  "nand flash": "Semiconductors",
  "foundry": "Semiconductors",
  "foundry services": "Semiconductors",
  "ai hardware": "Semiconductors",
  "ai accelerators": "Semiconductors",
  "ai chips": "Semiconductors",
  // Semiconductor Equipment
  "semi equipment": "Semiconductor Equipment",
  "semiconductor equipment and materials": "Semiconductor Equipment",
  "eda": "Semiconductor Equipment",
  "eda software": "Semiconductor Equipment",
  "silicon photonics": "Semiconductor Equipment",
  "test equipment": "Semiconductor Equipment",
  "equipment manufacturing": "Semiconductor Equipment",
  // Software
  "saas": "Software",
  "cloud software": "Software",
  "enterprise software": "Software",
  "application software": "Software",
  "systems software": "Software",
  "cloud infrastructure": "Software",
  "software development": "Software",
  "ai software": "Software",
  "cybersecurity": "Software",
  "network security": "Software",
  // IT Services
  "it services": "IT Services",
  "tech services": "IT Services",
  // Biotechnology
  "biotech": "Biotechnology",
  "biotechs": "Biotechnology",
  "genomics": "Biotechnology",
  // Automobiles
  "auto": "Automobiles",
  "autos": "Automobiles",
  "automotive": "Automobiles",
  "auto manufacturers": "Automobiles",
  "auto makers": "Automobiles",
  "automakers": "Automobiles",
  "car manufacturers": "Automobiles",
  "ev": "Automobiles",
  "ev oem": "Automobiles",
  "ev oems": "Automobiles",
  "ev manufacturers": "Automobiles",
  "auto oem": "Automobiles",
  "autonomous vehicles": "Automobiles",
  // Pharmaceuticals
  "pharma": "Pharmaceuticals",
  "drug manufacturers": "Pharmaceuticals",
  // Health Care Equipment & Supplies / Health Care Technology
  "medical devices": "Health Care Equipment & Supplies",
  "precision medicine": "Health Care Technology",
  "ai healthcare": "Health Care Technology",
  "healthcare ai": "Health Care Technology",
  // Media / Entertainment / Interactive Media
  "streaming": "Entertainment",
  "social media": "Interactive Media & Services",
  "internet": "Interactive Media & Services",
  "digital advertising": "Interactive Media & Services",
  "content delivery": "Interactive Media & Services",
  // Banks
  "bank": "Banks",
  "commercial banks": "Banks",
  "regional banks": "Banks",
  "retail banking": "Banks",
  // Capital Markets
  "asset management": "Capital Markets",
  "etfs": "Capital Markets",
  "spac": "Capital Markets",
  "cryptocurrency": "Capital Markets",
  "investment banking": "Capital Markets",
  // Mortgage REITs
  "mortgage reits": "Mortgage Real Estate Investment Trusts",
  // Oil & Gas normalizations
  "oil and gas e&p": "Oil & Gas Exploration & Production",
  "e&p": "Oil & Gas Exploration & Production",
  "exploration and production": "Oil & Gas Exploration & Production",
  "lng": "Oil & Gas Storage & Transportation",
  // Aerospace & Defense
  "aerospace": "Aerospace & Defense",
  "defense": "Aerospace & Defense",
  "aerospace and defense": "Aerospace & Defense",
  "aerospace defense": "Aerospace & Defense",
  "defense contractors": "Aerospace & Defense",
  "defense contracting": "Aerospace & Defense",
  "military equipment": "Aerospace & Defense",
  "missile defense": "Aerospace & Defense",
  "munitions manufacturing": "Aerospace & Defense",
  // Internet retail
  "ecommerce": "Internet & Direct Marketing Retail",
  "e commerce": "Internet & Direct Marketing Retail",
  // Gold / Metals & Mining
  "gold mining": "Gold",
  "precious metals": "Metals & Mining",
  "rare earths": "Metals & Mining",
  "rare earth processing": "Metals & Mining",
  "copper": "Metals & Mining",
  "lithium": "Metals & Mining",
  "lithium processing": "Metals & Mining",
  // Communications Equipment
  "networking": "Communications Equipment",
  "telecom infrastructure": "Communications Equipment",
  "fiber networks": "Communications Equipment",
  "optical connectivity": "Communications Equipment",
  "satellite": "Communications Equipment",
  // Independent Power / Electric Utilities
  "solar": "Independent Power Producers & Energy Traders",
  "wind": "Independent Power Producers & Energy Traders",
  "renewables": "Independent Power Producers & Energy Traders",
  "geothermal": "Independent Power Producers & Energy Traders",
  "nuclear": "Independent Power Producers & Energy Traders",
  "nuclear energy": "Independent Power Producers & Energy Traders",
  "power grid": "Electric Utilities",
  "energy infrastructure": "Electric Utilities",
  // Electrical Equipment — battery / fuel-cell cluster
  "batteries": "Electrical Equipment",
  "battery tech": "Electrical Equipment",
  "battery technology": "Electrical Equipment",
  "battery storage": "Electrical Equipment",
  "battery materials": "Electrical Equipment",
  "ev batteries": "Electrical Equipment",
  "fuel cells": "Electrical Equipment",
  // Chemicals
  "fertilizers": "Chemicals",
  // Machinery / Transportation
  "robotics": "Machinery",
  "shipbuilding": "Machinery",
  "shipping": "Transportation Infrastructure",
  "shipping logistics": "Transportation Infrastructure",
  // Misc
  "financial services": "Diversified Financial Services",
  "construction": "Construction & Engineering",
  "consumer electronics": "Technology Hardware, Storage & Peripherals",
  "textiles": "Textiles, Apparel & Luxury Goods",
  "footwear": "Textiles, Apparel & Luxury Goods",
  "protective apparel": "Textiles, Apparel & Luxury Goods",
};

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * Collapse a raw sector/industry string to a lookup key:
 *   - lowercased
 *   - unicode-normalized
 *   - ampersand → " and " (so "Oil & Gas" → "oil and gas")
 *   - punctuation stripped
 *   - whitespace collapsed to single spaces
 *   - underscores treated as spaces ("HEALTH_CARE" → "health care")
 *
 * The lookup key is used against both the canonical lowercase list and the
 * alias tables. Canonical-in-canonical-out round-trips perfectly.
 */
function toLookupKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_\-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a raw sector string to its canonical Title Case form.
 * Returns `null` for unmappable values — callers must drop or flag them.
 */
export function normalizeSector(
  raw: string | null | undefined,
): Sector | null {
  if (raw == null) return null;
  const key = toLookupKey(raw);
  if (!key) return null;
  return SECTOR_LOOKUP.get(key) ?? SECTOR_ALIASES[key] ?? null;
}

/**
 * Map a raw industry string to its canonical Title Case form.
 * Returns `null` for unmappable values.
 */
export function normalizeIndustry(
  raw: string | null | undefined,
): Industry | null {
  if (raw == null) return null;
  const key = toLookupKey(raw);
  if (!key) return null;
  return INDUSTRY_LOOKUP.get(key) ?? INDUSTRY_ALIASES[key] ?? null;
}

// ── Industry → parent sector lookup ──────────────────────────────────────────
//
// Flipped view of GICS_INDUSTRIES_BY_SECTOR. Used to answer "if the ticker's
// Finnhub-reported value is the industry 'Semiconductors', which sector does
// that belong to?" — so a fence of `["Information Technology"]` still matches
// a ticker whose reported sector field is actually "Semiconductors".

const SECTOR_FOR_INDUSTRY: Record<string, Sector> = (() => {
  const out: Record<string, Sector> = {};
  for (const [sector, industries] of Object.entries(GICS_INDUSTRIES_BY_SECTOR) as [Sector, readonly string[]][]) {
    for (const industry of industries) {
      out[toLookupKey(industry)] = sector;
    }
  }
  return out;
})();

/**
 * Parent-sector lookup: given a canonical industry, return its parent sector.
 * Returns `null` for unknown industries.
 */
export function parentSectorOf(industry: Industry | string): Sector | null {
  return SECTOR_FOR_INDUSTRY[toLookupKey(industry)] ?? null;
}

/**
 * Ticker-side sector normalizer. The problem this solves: Finnhub's
 * `finnhubIndustry` field returns a mix of canonical sectors ("Technology"),
 * canonical industries ("Semiconductors"), and aliased shorthand ("Tech",
 * "Biotech"). Fence comparisons expect canonical GICS sectors, so:
 *
 *   1. Try `normalizeSector` — catches sector names + sector aliases.
 *   2. Try `normalizeIndustry` → parent-sector lookup — catches industry-
 *      shaped values like "Semiconductors" → "Information Technology".
 *   3. Return `null` when neither path resolves; caller decides whether to
 *      flag "outside universe" or fall back to a loose string compare.
 *
 * Canonical-in → canonical-out (round-trips cleanly for already-canonical
 * sectors or industries).
 */
export function normalizeTickerSector(
  raw: string | null | undefined,
): Sector | null {
  if (raw == null) return null;
  const sector = normalizeSector(raw);
  if (sector) return sector;
  const industry = normalizeIndustry(raw);
  if (industry) return parentSectorOf(industry);
  return null;
}

/**
 * Themes are analyst-coined; we don't maintain a canonical list. The only
 * "normalization" is uppercasing + snake_casing so "AI infrastructure",
 * "ai_infrastructure", and "AI Infrastructure" all collapse to
 * "AI_INFRASTRUCTURE".
 *
 * Returns `null` for empty input so callers can filter.
 */
export function normalizeTheme(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const cleaned = raw
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || null;
}

// ── Array-level helpers (the common case at write boundaries) ────────────────

/**
 * Normalize a raw sector array, dropping unmappable entries and deduplicating.
 * Used at every Sonar/analyst write path.
 */
export function normalizeSectors(raw: readonly (string | null | undefined)[]): Sector[] {
  const seen = new Set<Sector>();
  const out: Sector[] = [];
  for (const item of raw) {
    const canon = normalizeSector(item);
    if (canon && !seen.has(canon)) {
      seen.add(canon);
      out.push(canon);
    }
  }
  return out;
}

/** Normalize a raw industry array, dropping unmappable entries + deduping. */
export function normalizeIndustries(
  raw: readonly (string | null | undefined)[],
): Industry[] {
  const seen = new Set<Industry>();
  const out: Industry[] = [];
  for (const item of raw) {
    const canon = normalizeIndustry(item);
    if (canon && !seen.has(canon)) {
      seen.add(canon);
      out.push(canon);
    }
  }
  return out;
}

/** Normalize a raw theme array, dropping empties and deduping. */
export function normalizeThemes(
  raw: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const canon = normalizeTheme(item);
    if (canon && !seen.has(canon)) {
      seen.add(canon);
      out.push(canon);
    }
  }
  return out;
}
