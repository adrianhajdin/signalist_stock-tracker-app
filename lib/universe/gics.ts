/**
 * gics.ts — canonical sector + industry lists for the Universe UI.
 *
 * Sourced from MSCI's GICS taxonomy (11 sectors, 74 industries). We
 * deliberately flatten the 2-level hierarchy so the Universe chip
 * editor doesn't need a "pick sector first, then industry" flow —
 * the user can drop in any subset and the signal router AND-joins
 * what's set.
 *
 * Naming conventions match what the agent writes into `sectors` /
 * `industries` arrays on AgentConfig. Keep labels short + human
 * (never ALL_CAPS in the editable array — we normalize to "Title
 * Case" here, and the router string-matches against these values).
 *
 * If you add a sector or industry, make sure:
 *   1. The name is human-readable (not SCREAMING_SNAKE).
 *   2. The signal router's normalization recognizes it (lib/intelligence/*).
 *   3. The agent archetype skeletons in lib/agent/knowledge/ that
 *      reference this taxonomy still resolve.
 */

export const GICS_SECTORS = [
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Information Technology",
  "Communication Services",
  "Utilities",
  "Real Estate",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

/**
 * GICS industries, grouped by sector for UI display (the combobox can
 * section them by sector). The flat `GICS_INDUSTRIES` export below is
 * what the ChipListComboEditor's options list draws from.
 */
export const GICS_INDUSTRIES_BY_SECTOR: Record<GicsSector, readonly string[]> = {
  "Energy": [
    "Oil & Gas Exploration & Production",
    "Integrated Oil & Gas",
    "Oil & Gas Refining & Marketing",
    "Oil & Gas Equipment & Services",
    "Oil & Gas Storage & Transportation",
    "Coal & Consumable Fuels",
  ],
  "Materials": [
    "Chemicals",
    "Metals & Mining",
    "Gold",
    "Steel",
    "Construction Materials",
    "Containers & Packaging",
    "Paper & Forest Products",
  ],
  "Industrials": [
    "Aerospace & Defense",
    "Airlines",
    "Building Products",
    "Commercial Services & Supplies",
    "Construction & Engineering",
    "Electrical Equipment",
    "Industrial Conglomerates",
    "Machinery",
    "Road & Rail",
    "Trading Companies & Distributors",
    "Transportation Infrastructure",
  ],
  "Consumer Discretionary": [
    "Automobiles",
    "Auto Components",
    "Hotels, Restaurants & Leisure",
    "Household Durables",
    "Internet & Direct Marketing Retail",
    "Leisure Products",
    "Multiline Retail",
    "Specialty Retail",
    "Textiles, Apparel & Luxury Goods",
  ],
  "Consumer Staples": [
    "Beverages",
    "Food Products",
    "Food & Staples Retailing",
    "Household Products",
    "Personal Products",
    "Tobacco",
  ],
  "Health Care": [
    "Biotechnology",
    "Pharmaceuticals",
    "Health Care Equipment & Supplies",
    "Health Care Providers & Services",
    "Health Care Technology",
    "Life Sciences Tools & Services",
  ],
  "Financials": [
    "Banks",
    "Capital Markets",
    "Consumer Finance",
    "Diversified Financial Services",
    "Insurance",
    "Mortgage Real Estate Investment Trusts",
    "Thrifts & Mortgage Finance",
  ],
  "Information Technology": [
    "Semiconductors",
    "Semiconductor Equipment",
    "Software",
    "IT Services",
    "Communications Equipment",
    "Technology Hardware, Storage & Peripherals",
    "Electronic Equipment, Instruments & Components",
  ],
  "Communication Services": [
    "Diversified Telecommunication Services",
    "Wireless Telecommunication Services",
    "Media",
    "Entertainment",
    "Interactive Media & Services",
  ],
  "Utilities": [
    "Electric Utilities",
    "Gas Utilities",
    "Multi-Utilities",
    "Water Utilities",
    "Independent Power Producers & Energy Traders",
  ],
  "Real Estate": [
    "Equity Real Estate Investment Trusts",
    "Real Estate Management & Development",
  ],
};

/** Flat list for the ChipListComboEditor options prop. */
export const GICS_INDUSTRIES: readonly string[] = Object.values(
  GICS_INDUSTRIES_BY_SECTOR,
).flat();
