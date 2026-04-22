/**
 * universe.test.ts — regression coverage for the Session A follow-up fixes.
 *
 * The scenario this locks in:
 *   1. Analyst fence is canonical GICS ("Information Technology") after the
 *      Session A migration.
 *   2. Finnhub's `finnhubIndustry` returns a mix of sectors, industries, and
 *      aliases ("Technology", "Semiconductors", "Software", "Biotech").
 *   3. checkUniverse normalizes the ticker-side value through the canonical
 *      alias table + industry→parent-sector lookup so all of the above match
 *      an IT fence.
 *   4. Held and watchlisted tickers bypass the fence unconditionally.
 */

import { checkUniverse } from "./universe";
import { parentSectorOf, normalizeTickerSector } from "@/lib/universe/canonical";

describe("normalizeTickerSector", () => {
  it("maps canonical sectors to themselves", () => {
    expect(normalizeTickerSector("Information Technology")).toBe(
      "Information Technology",
    );
    expect(normalizeTickerSector("Health Care")).toBe("Health Care");
  });

  it("maps Finnhub sector aliases to canonical", () => {
    expect(normalizeTickerSector("Technology")).toBe("Information Technology");
    expect(normalizeTickerSector("Tech")).toBe("Information Technology");
    expect(normalizeTickerSector("Healthcare")).toBe("Health Care");
  });

  it("resolves GICS industries to their parent sector", () => {
    expect(normalizeTickerSector("Semiconductors")).toBe("Information Technology");
    expect(normalizeTickerSector("Software")).toBe("Information Technology");
    expect(normalizeTickerSector("Biotechnology")).toBe("Health Care");
  });

  it("resolves industry aliases via the industry table then up to the parent sector", () => {
    // "Biotech" is an industry alias that resolves to "Biotechnology",
    // whose parent sector is "Health Care".
    expect(normalizeTickerSector("Biotech")).toBe("Health Care");
    expect(normalizeTickerSector("Pharma")).toBe("Health Care");
  });

  it("returns null for unknown values", () => {
    expect(normalizeTickerSector("Digital Circus")).toBeNull();
    expect(normalizeTickerSector("")).toBeNull();
    expect(normalizeTickerSector(null)).toBeNull();
    expect(normalizeTickerSector(undefined)).toBeNull();
  });
});

describe("parentSectorOf", () => {
  it("resolves industries to their parent sector", () => {
    expect(parentSectorOf("Semiconductors")).toBe("Information Technology");
    expect(parentSectorOf("Software")).toBe("Information Technology");
    expect(parentSectorOf("Biotechnology")).toBe("Health Care");
    expect(parentSectorOf("Automobiles")).toBe("Consumer Discretionary");
    expect(parentSectorOf("Banks")).toBe("Financials");
  });

  it("returns null for non-GICS strings", () => {
    expect(parentSectorOf("AI Capex")).toBeNull();
  });
});

describe("checkUniverse — Session A follow-up regression cases", () => {
  const ITFence = {
    sectors: ["Information Technology"],
  };

  it("passes a ticker whose Finnhub value is 'Technology' against an IT fence", () => {
    const res = checkUniverse(
      { ticker: "MSFT", sector: "Technology" },
      ITFence,
    );
    expect(res.inUniverse).toBe(true);
    expect(res.matched.sector).toBe("Information Technology");
  });

  it("passes a ticker whose Finnhub value is 'Semiconductors' against an IT fence", () => {
    const res = checkUniverse(
      { ticker: "NVDA", sector: "Semiconductors" },
      ITFence,
    );
    expect(res.inUniverse).toBe(true);
    expect(res.matched.sector).toBe("Information Technology");
  });

  it("passes a ticker whose Finnhub value is 'Software' against an IT fence", () => {
    const res = checkUniverse(
      { ticker: "CRM", sector: "Software" },
      ITFence,
    );
    expect(res.inUniverse).toBe(true);
    expect(res.matched.sector).toBe("Information Technology");
  });

  it("fails a ticker whose Finnhub value is in a different sector", () => {
    const res = checkUniverse(
      { ticker: "XOM", sector: "Oil & Gas" },
      ITFence,
    );
    expect(res.inUniverse).toBe(false);
    expect(res.failedReasons[0]).toMatch(/Oil & Gas/);
  });

  it("bypasses the fence for a held position", () => {
    // Fence is strictly Health Care; ticker is a semiconductor — would
    // normally fail. But the analyst is holding it, so it's in-scope.
    const res = checkUniverse(
      { ticker: "NVDA", sector: "Semiconductors" },
      {
        sectors: ["Health Care"],
        positionTickers: ["NVDA"],
      },
    );
    expect(res.inUniverse).toBe(true);
    expect(res.matched.bypass).toBe("position");
  });

  it("bypasses the fence for a watchlisted ticker", () => {
    const res = checkUniverse(
      { ticker: "TSLA", sector: "Automobiles" },
      {
        sectors: ["Information Technology"],
        watchlistTickers: ["TSLA"],
      },
    );
    expect(res.inUniverse).toBe(true);
    expect(res.matched.bypass).toBe("watchlist");
  });

  it("still hard-rejects an excluded ticker even if held", () => {
    // Exclusion wins over the position bypass — the user explicitly blocked
    // this ticker, so surface the block instead of letting holdings slip.
    const res = checkUniverse(
      { ticker: "NVDA", sector: "Semiconductors" },
      {
        sectors: ["Information Technology"],
        positionTickers: ["NVDA"],
        exclusionList: ["NVDA"],
      },
    );
    expect(res.inUniverse).toBe(false);
    expect(res.excluded).toBe(true);
  });

  it("falls back to loose compare when neither side is canonical", () => {
    // Pre-migration fence still carrying legacy "TECHNOLOGY" value should
    // continue to match a Finnhub "Technology" via the raw loose-norm path.
    const res = checkUniverse(
      { ticker: "MSFT", sector: "Technology" },
      { sectors: ["TECHNOLOGY"] },
    );
    expect(res.inUniverse).toBe(true);
  });

  it("honors the 'no filter' semantics on empty dimensions", () => {
    // No fence at all = everything in-scope.
    const res = checkUniverse(
      { ticker: "AAPL", sector: "Technology" },
      {},
    );
    expect(res.inUniverse).toBe(true);
  });

  it("respects industry fence + parent-sector lookup on the ticker side", () => {
    // Analyst fence is the narrower industry; ticker-side value is also the
    // industry. Should match directly.
    const res = checkUniverse(
      { ticker: "NVDA", sector: null, industry: "Semiconductors" },
      { industries: ["Semiconductors"] },
    );
    expect(res.inUniverse).toBe(true);
    expect(res.matched.industry).toBe("Semiconductors");
  });
});
