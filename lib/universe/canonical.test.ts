import {
  SECTORS,
  INDUSTRIES,
  normalizeSector,
  normalizeIndustry,
  normalizeTheme,
  normalizeSectors,
  normalizeIndustries,
  normalizeThemes,
} from "./canonical";

// ── Sector normalization ─────────────────────────────────────────────────────

describe("normalizeSector — canonical exact match", () => {
  it("returns canonical Title Case values unchanged", () => {
    for (const s of SECTORS) {
      expect(normalizeSector(s)).toBe(s);
    }
  });

  it("is case-insensitive on canonical input", () => {
    expect(normalizeSector("information technology")).toBe("Information Technology");
    expect(normalizeSector("INFORMATION TECHNOLOGY")).toBe("Information Technology");
    expect(normalizeSector("Information Technology ")).toBe("Information Technology");
  });
});

describe("normalizeSector — legacy SCREAMING_SNAKE", () => {
  it("maps TECHNOLOGY → Information Technology", () => {
    expect(normalizeSector("TECHNOLOGY")).toBe("Information Technology");
  });

  it("maps HEALTHCARE → Health Care", () => {
    expect(normalizeSector("HEALTHCARE")).toBe("Health Care");
    expect(normalizeSector("HEALTH_CARE")).toBe("Health Care");
  });

  it("maps FINANCE → Financials", () => {
    expect(normalizeSector("FINANCE")).toBe("Financials");
    expect(normalizeSector("FINANCIAL_SERVICES")).toBe("Financials");
  });

  it("maps legacy CONSUMER → Consumer Discretionary", () => {
    expect(normalizeSector("CONSUMER")).toBe("Consumer Discretionary");
    expect(normalizeSector("CONSUMER_DISCRETIONARY")).toBe("Consumer Discretionary");
    expect(normalizeSector("CONSUMER_STAPLES")).toBe("Consumer Staples");
  });

  it("maps REAL_ESTATE → Real Estate", () => {
    expect(normalizeSector("REAL_ESTATE")).toBe("Real Estate");
  });

  it("maps COMMUNICATION → Communication Services", () => {
    expect(normalizeSector("COMMUNICATION")).toBe("Communication Services");
    expect(normalizeSector("COMMUNICATIONS")).toBe("Communication Services");
    expect(normalizeSector("TELECOM")).toBe("Communication Services");
  });

  it("maps INDUSTRIAL → Industrials", () => {
    expect(normalizeSector("INDUSTRIAL")).toBe("Industrials");
  });
});

describe("normalizeSector — Sonar shorthand", () => {
  it("maps Technology → Information Technology", () => {
    expect(normalizeSector("Technology")).toBe("Information Technology");
    expect(normalizeSector("Tech")).toBe("Information Technology");
  });

  it("maps Healthcare → Health Care", () => {
    expect(normalizeSector("Healthcare")).toBe("Health Care");
    expect(normalizeSector("Biotech")).toBe("Health Care");
    expect(normalizeSector("Pharma")).toBe("Health Care");
  });

  it("maps Oil & Gas → Energy", () => {
    expect(normalizeSector("Oil & Gas")).toBe("Energy");
    expect(normalizeSector("oil and gas")).toBe("Energy");
  });

  it("maps Metals & Mining → Materials", () => {
    expect(normalizeSector("Metals & Mining")).toBe("Materials");
    expect(normalizeSector("Mining")).toBe("Materials");
  });
});

describe("normalizeSector — unknowns", () => {
  it("returns null for unmappable strings", () => {
    expect(normalizeSector("Widgets")).toBeNull();
    expect(normalizeSector("XXXXX")).toBeNull();
    expect(normalizeSector("")).toBeNull();
    expect(normalizeSector("   ")).toBeNull();
    expect(normalizeSector(null)).toBeNull();
    expect(normalizeSector(undefined)).toBeNull();
  });
});

// ── Industry normalization ───────────────────────────────────────────────────

describe("normalizeIndustry", () => {
  it("returns canonical industries unchanged", () => {
    for (const i of INDUSTRIES) {
      expect(normalizeIndustry(i)).toBe(i);
    }
  });

  it("maps common shorthand", () => {
    expect(normalizeIndustry("Semiconductor")).toBe("Semiconductors");
    expect(normalizeIndustry("SaaS")).toBe("Software");
    expect(normalizeIndustry("Biotech")).toBe("Biotechnology");
    expect(normalizeIndustry("Auto")).toBe("Automobiles");
    expect(normalizeIndustry("Auto Manufacturers")).toBe("Automobiles");
    expect(normalizeIndustry("EV OEMs")).toBe("Automobiles");
  });

  it("maps Sonar aliases seeded from prod backfill", () => {
    // Sonar-style SCREAMING_SNAKE labels pulled from the prod unmapped report.
    expect(normalizeIndustry("Aerospace_Defense")).toBe("Aerospace & Defense");
    expect(normalizeIndustry("Defense_Contractors")).toBe("Aerospace & Defense");
    expect(normalizeIndustry("AI_Hardware")).toBe("Semiconductors");
    expect(normalizeIndustry("AI_Accelerators")).toBe("Semiconductors");
    expect(normalizeIndustry("Memory_Chips")).toBe("Semiconductors");
    expect(normalizeIndustry("Foundry")).toBe("Semiconductors");
    expect(normalizeIndustry("AI_Software")).toBe("Software");
    expect(normalizeIndustry("Cybersecurity")).toBe("Software");
    expect(normalizeIndustry("Ecommerce")).toBe("Internet & Direct Marketing Retail");
    expect(normalizeIndustry("Gold Mining")).toBe("Gold");
    expect(normalizeIndustry("Precious Metals")).toBe("Metals & Mining");
    expect(normalizeIndustry("Rare_Earths")).toBe("Metals & Mining");
    expect(normalizeIndustry("Solar")).toBe("Independent Power Producers & Energy Traders");
    expect(normalizeIndustry("Nuclear_Energy")).toBe("Independent Power Producers & Energy Traders");
    expect(normalizeIndustry("EV_Batteries")).toBe("Electrical Equipment");
    expect(normalizeIndustry("Robotics")).toBe("Machinery");
    expect(normalizeIndustry("Satellite")).toBe("Communications Equipment");
    expect(normalizeIndustry("Networking")).toBe("Communications Equipment");
    expect(normalizeIndustry("Autonomous_Vehicles")).toBe("Automobiles");
    expect(normalizeIndustry("Medical_Devices")).toBe("Health Care Equipment & Supplies");
    expect(normalizeIndustry("Genomics")).toBe("Biotechnology");
    expect(normalizeIndustry("Mortgage REITs")).toBe("Mortgage Real Estate Investment Trusts");
  });

  it("keeps theme-shaped strings unmapped (they belong in themes, not industries)", () => {
    // Tightened Sonar prompt tells the model to avoid these, but defensively
    // we also return null so they don't poison the industries column.
    expect(normalizeIndustry("AI_Infrastructure")).toBeNull();
    expect(normalizeIndustry("Quantum_Computing")).toBeNull();
    expect(normalizeIndustry("Data_Centers")).toBeNull();
    expect(normalizeIndustry("AI_LLM")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(normalizeIndustry("SEMICONDUCTORS")).toBe("Semiconductors");
    expect(normalizeIndustry("semiconductors")).toBe("Semiconductors");
  });

  it("returns null for unknowns", () => {
    expect(normalizeIndustry("Unknown Industry")).toBeNull();
    expect(normalizeIndustry(null)).toBeNull();
    expect(normalizeIndustry(undefined)).toBeNull();
  });
});

// ── Theme normalization ──────────────────────────────────────────────────────

describe("normalizeTheme", () => {
  it("uppercases and snake_cases free-form input", () => {
    expect(normalizeTheme("AI infrastructure")).toBe("AI_INFRASTRUCTURE");
    expect(normalizeTheme("ai_infrastructure")).toBe("AI_INFRASTRUCTURE");
    expect(normalizeTheme("AI Infrastructure")).toBe("AI_INFRASTRUCTURE");
    expect(normalizeTheme("EV transition")).toBe("EV_TRANSITION");
  });

  it("strips punctuation", () => {
    expect(normalizeTheme("GLP-1")).toBe("GLP_1");
    expect(normalizeTheme("Data-center capex")).toBe("DATA_CENTER_CAPEX");
  });

  it("collapses duplicate underscores + trims edge underscores", () => {
    expect(normalizeTheme("__foo__bar__")).toBe("FOO_BAR");
    expect(normalizeTheme(" foo bar ")).toBe("FOO_BAR");
  });

  it("returns null for empty input", () => {
    expect(normalizeTheme("")).toBeNull();
    expect(normalizeTheme("   ")).toBeNull();
    expect(normalizeTheme("!!!")).toBeNull();
    expect(normalizeTheme(null)).toBeNull();
  });
});

// ── Array helpers ────────────────────────────────────────────────────────────

describe("array normalizers", () => {
  it("normalizeSectors dedupes after mapping to canonical", () => {
    // "TECHNOLOGY", "Tech", "Information Technology" all collapse to the same
    // canonical value — so the output is a single entry.
    expect(
      normalizeSectors(["TECHNOLOGY", "Tech", "Information Technology"]),
    ).toEqual(["Information Technology"]);
  });

  it("normalizeSectors drops unmappable entries silently", () => {
    expect(normalizeSectors(["TECHNOLOGY", "Widgets", "HEALTHCARE"])).toEqual([
      "Information Technology",
      "Health Care",
    ]);
  });

  it("normalizeIndustries handles mixed vocab", () => {
    expect(
      normalizeIndustries(["Semiconductor", "SaaS", "cloud software"]),
    ).toEqual(["Semiconductors", "Software"]);
  });

  it("normalizeThemes dedupes", () => {
    expect(
      normalizeThemes(["AI infrastructure", "ai_infrastructure", "AI Infrastructure"]),
    ).toEqual(["AI_INFRASTRUCTURE"]);
  });

  it("handles null/undefined inputs", () => {
    expect(normalizeSectors([null, undefined, "", "Tech"])).toEqual([
      "Information Technology",
    ]);
  });
});
