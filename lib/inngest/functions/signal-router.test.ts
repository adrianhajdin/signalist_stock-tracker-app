// Integration test for the Session A canonical universe contract:
// when an ingested Signal and an analyst's AgentConfig both flow through the
// canonical normalizers, the router's `overlap` check matches them with plain
// equality (no case-folding, no alias-time reconciliation).
//
// Prisma + Inngest are mocked away — we only exercise the pure matcher.

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: () => ({}) },
}));
jest.mock("@/lib/market-hours", () => ({
  etTradingDayDate: () => new Date(),
}));

import {
  normalizeSector,
  normalizeIndustry,
  normalizeTheme,
} from "@/lib/universe/canonical";
import { matchUniverse, type AnalystProfile } from "./signal-router";

function emptyProfile(overrides: Partial<AnalystProfile>): AnalystProfile {
  return {
    id: "analyst-1",
    positionTickers: [],
    watchlistTickers: [],
    sectors: [],
    industries: [],
    themes: [],
    exchanges: [],
    exclusions: [],
    keywords: [],
    ...overrides,
  };
}

describe("router fence — post-canonicalization", () => {
  it(`routes a signal tagged "technology" to an analyst configured with "Information Technology"`, () => {
    // Analyst config came through updateAnalystField → normalizeSectors →
    // "Information Technology" stored as-is.
    const profile = emptyProfile({
      sectors: [normalizeSector("Information Technology")!],
    });

    // Signal came out of Sonar with sectors:["technology"]; cleanSonarSignal
    // canonicalized it to "Information Technology" before insert.
    const signal = {
      sectors: [normalizeSector("technology")!],
      industries: [],
      themes: [],
    };

    const matched = matchUniverse(signal, profile);
    expect(matched).not.toBeNull();
    expect(matched?.sectors).toEqual(["Information Technology"]);
  });

  it(`routes a signal tagged "HEALTHCARE" to an analyst configured with "Health Care"`, () => {
    const profile = emptyProfile({
      sectors: [normalizeSector("Health Care")!],
    });
    const signal = {
      sectors: [normalizeSector("HEALTHCARE")!],
      industries: [],
      themes: [],
    };
    expect(matchUniverse(signal, profile)?.sectors).toEqual(["Health Care"]);
  });

  it("routes by industry canonical form", () => {
    const profile = emptyProfile({
      industries: [normalizeIndustry("Semiconductors")!],
    });
    const signal = {
      sectors: [],
      // Sonar returned "Semiconductor" (singular) — normalized to plural canonical.
      industries: [normalizeIndustry("Semiconductor")!],
      themes: [],
    };
    expect(matchUniverse(signal, profile)?.industries).toEqual([
      "Semiconductors",
    ]);
  });

  it("routes by theme canonical form (uppercase snake)", () => {
    const profile = emptyProfile({
      themes: [normalizeTheme("AI infrastructure")!],
    });
    const signal = {
      sectors: [],
      industries: [],
      // Sonar returned "ai_infrastructure" — canonicalized to "AI_INFRASTRUCTURE".
      themes: [normalizeTheme("ai_infrastructure")!],
    };
    expect(matchUniverse(signal, profile)?.themes).toEqual([
      "AI_INFRASTRUCTURE",
    ]);
  });

  it("drops a signal whose sector doesn't overlap the analyst's fence", () => {
    const profile = emptyProfile({
      sectors: [normalizeSector("Information Technology")!],
    });
    const signal = {
      sectors: [normalizeSector("Energy")!],
      industries: [],
      themes: [],
    };
    expect(matchUniverse(signal, profile)).toBeNull();
  });

  it("empty analyst fence = no filter (vacuously in-universe)", () => {
    const profile = emptyProfile({});
    const signal = {
      sectors: [normalizeSector("Energy")!],
      industries: [],
      themes: [],
    };
    const matched = matchUniverse(signal, profile);
    expect(matched).not.toBeNull();
    expect(matched).toEqual({});
  });
});
