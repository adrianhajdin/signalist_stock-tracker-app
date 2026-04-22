// Mock Prisma and closeTrade so we can test pure functions without DB
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/actions/closeTrade.actions", () => ({
  closeTrade: jest.fn(),
}));

import { evaluateExitStrategy, targetProximity } from "./trade-exit";

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const baseLong = {
  direction: "LONG" as const,
  exitStrategy: "PRICE_TARGET" as const,
  avgCost: 100,
  targetPrice: 120,
  stopLoss: 90,
  exitDate: null,
  trailingStopPct: null,
};

const baseShort = {
  direction: "SHORT" as const,
  exitStrategy: "PRICE_TARGET" as const,
  avgCost: 100,
  targetPrice: 80,
  stopLoss: 110,
  exitDate: null,
  trailingStopPct: null,
};

// ─── PRICE_TARGET ─────────────────────────────────────────────────────────────

describe("PRICE_TARGET — LONG", () => {
  it("returns TARGET when currentPrice >= targetPrice", () => {
    expect(evaluateExitStrategy(baseLong, 120, 120)).toEqual({
      reason: "TARGET",
      label: "Target price reached",
    });
    expect(evaluateExitStrategy(baseLong, 125, 125)).toEqual({
      reason: "TARGET",
      label: "Target price reached",
    });
  });

  it("returns STOP when currentPrice <= stopLoss", () => {
    expect(evaluateExitStrategy(baseLong, 90, 100)).toEqual({
      reason: "STOP",
      label: "Stop loss triggered",
    });
    expect(evaluateExitStrategy(baseLong, 85, 100)).toEqual({
      reason: "STOP",
      label: "Stop loss triggered",
    });
  });

  it("returns null when price is between entry and target", () => {
    expect(evaluateExitStrategy(baseLong, 110, 110)).toBeNull();
  });

  it("returns null when stopLoss is null", () => {
    const noStop = { ...baseLong, stopLoss: null };
    expect(evaluateExitStrategy(noStop, 85, 100)).toBeNull();
  });
});

describe("PRICE_TARGET — SHORT", () => {
  it("returns TARGET when currentPrice <= targetPrice", () => {
    expect(evaluateExitStrategy(baseShort, 80, 80)).toEqual({
      reason: "TARGET",
      label: "Target price reached",
    });
    expect(evaluateExitStrategy(baseShort, 75, 80)).toEqual({
      reason: "TARGET",
      label: "Target price reached",
    });
  });

  it("returns STOP when currentPrice >= stopLoss", () => {
    expect(evaluateExitStrategy(baseShort, 110, 100)).toEqual({
      reason: "STOP",
      label: "Stop loss triggered",
    });
  });

  it("returns null when price is between entry and target", () => {
    expect(evaluateExitStrategy(baseShort, 90, 100)).toBeNull();
  });
});

// ─── TIME_BASED ───────────────────────────────────────────────────────────────

describe("TIME_BASED", () => {
  const timeTrade = {
    direction: "LONG" as const,
    exitStrategy: "TIME_BASED" as const,
    avgCost: 100,
    targetPrice: null,
    stopLoss: null,
    trailingStopPct: null,
  };

  it("returns TIME when exitDate has passed", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(
      evaluateExitStrategy({ ...timeTrade, exitDate: new Date(past) }, 105, 105)
    ).toEqual({ reason: "TIME", label: "Hold duration expired" });
  });

  it("returns null when exitDate is in the future", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(
      evaluateExitStrategy({ ...timeTrade, exitDate: new Date(future) }, 105, 105)
    ).toBeNull();
  });

  it("returns null when exitDate is null", () => {
    expect(
      evaluateExitStrategy({ ...timeTrade, exitDate: null }, 105, 105)
    ).toBeNull();
  });
});

// ─── TRAILING ─────────────────────────────────────────────────────────────────

describe("TRAILING — LONG", () => {
  const trailingLong = {
    direction: "LONG" as const,
    exitStrategy: "TRAILING" as const,
    avgCost: 100,
    targetPrice: null,
    stopLoss: null,
    exitDate: null,
    trailingStopPct: 10,
  };

  it("returns STOP when price drops 10% from peak", () => {
    // peak = 130, 10% trail = 117, current = 115 → STOP
    expect(evaluateExitStrategy(trailingLong, 115, 130)).toEqual({
      reason: "STOP",
      label: "Trailing stop hit (10% from peak $130.00)",
    });
  });

  it("returns null when price is above trailing stop", () => {
    // peak = 130, 10% trail = 117, current = 120 → hold
    expect(evaluateExitStrategy(trailingLong, 120, 130)).toBeNull();
  });

  it("uses default 5% when trailingStopPct is null", () => {
    const noTrail = { ...trailingLong, trailingStopPct: null };
    // peak = 100, 5% trail = 95, current = 94 → STOP
    expect(evaluateExitStrategy(noTrail, 94, 100)).toEqual({
      reason: "STOP",
      label: "Trailing stop hit (5% from peak $100.00)",
    });
  });
});

describe("TRAILING — SHORT", () => {
  const trailingShort = {
    direction: "SHORT" as const,
    exitStrategy: "TRAILING" as const,
    avgCost: 100,
    targetPrice: null,
    stopLoss: null,
    exitDate: null,
    trailingStopPct: 10,
  };

  it("returns STOP when price rises 10% from peak (lowest point)", () => {
    // peak (lowest) = 70, 10% trail up = 77, current = 78 → STOP
    expect(evaluateExitStrategy(trailingShort, 78, 70)).toEqual({
      reason: "STOP",
      label: "Trailing stop hit (10% from peak $70.00)",
    });
  });

  it("returns null when price is below trailing stop", () => {
    // peak = 70, trail = 77, current = 75 → hold
    expect(evaluateExitStrategy(trailingShort, 75, 70)).toBeNull();
  });
});

// ─── MANUAL ───────────────────────────────────────────────────────────────────

describe("MANUAL", () => {
  it("never auto-closes regardless of price", () => {
    const manual = {
      direction: "LONG" as const,
      exitStrategy: "MANUAL" as const,
      avgCost: 100,
      targetPrice: 50, // would normally trigger
      stopLoss: 200, // would normally trigger
      exitDate: new Date(Date.now() - 1000), // in the past
      trailingStopPct: null,
    };
    expect(evaluateExitStrategy(manual, 30, 30)).toBeNull();
    expect(evaluateExitStrategy(manual, 250, 250)).toBeNull();
  });
});

// ─── targetProximity ──────────────────────────────────────────────────────────

describe("targetProximity", () => {
  it("returns 1.0 when at target (LONG)", () => {
    expect(
      targetProximity({ direction: "LONG", avgCost: 100, targetPrice: 120 }, 120)
    ).toBe(1);
  });

  it("returns 0.5 halfway to target (LONG)", () => {
    expect(
      targetProximity({ direction: "LONG", avgCost: 100, targetPrice: 120 }, 110)
    ).toBe(0.5);
  });

  it("returns 0.9 for 90% to target (SHORT)", () => {
    expect(
      targetProximity({ direction: "SHORT", avgCost: 100, targetPrice: 80 }, 82)
    ).toBeCloseTo(0.9);
  });

  it("returns 0 at entry price", () => {
    expect(
      targetProximity({ direction: "LONG", avgCost: 100, targetPrice: 120 }, 100)
    ).toBe(0);
  });

  it("clamps to 0 if price moves away from target", () => {
    expect(
      targetProximity({ direction: "LONG", avgCost: 100, targetPrice: 120 }, 90)
    ).toBe(0);
  });
});
