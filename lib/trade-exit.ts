/**
 * Position exit condition evaluation.
 * Called by the price-monitor Inngest cron for every OPEN position.
 * closeOpenPosition is in lib/actions/closeTrade.actions.ts.
 */

import { prisma } from "@/lib/prisma";
import type { PositionModel } from "@/lib/generated/prisma/models";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExitSignal {
  reason: "TARGET" | "STOP" | "TIME";
  label: string;
}

// ─── Core evaluator (pure, synchronous, easily testable) ─────────────────────

export function evaluateExitStrategy(
  position: Pick<
    PositionModel,
    | "direction"
    | "exitStrategy"
    | "targetPrice"
    | "stopLoss"
    | "exitDate"
    | "trailingStopPct"
  >,
  currentPrice: number,
  peakPrice: number
): ExitSignal | null {
  const isLong = position.direction === "LONG";

  switch (position.exitStrategy) {
    case "PRICE_TARGET": {
      // Target hit
      if (isLong && position.targetPrice && currentPrice >= position.targetPrice) {
        return { reason: "TARGET", label: "Target price reached" };
      }
      if (!isLong && position.targetPrice && currentPrice <= position.targetPrice) {
        return { reason: "TARGET", label: "Target price reached" };
      }
      // Stop loss
      if (position.stopLoss) {
        if (isLong && currentPrice <= position.stopLoss) {
          return { reason: "STOP", label: "Stop loss triggered" };
        }
        if (!isLong && currentPrice >= position.stopLoss) {
          return { reason: "STOP", label: "Stop loss triggered" };
        }
      }
      return null;
    }

    case "TIME_BASED": {
      if (position.exitDate && new Date() >= new Date(position.exitDate)) {
        return { reason: "TIME", label: "Hold duration expired" };
      }
      return null;
    }

    case "TRAILING": {
      const trailPct = position.trailingStopPct ?? 5;
      const trailingStopPrice = isLong
        ? peakPrice * (1 - trailPct / 100)
        : peakPrice * (1 + trailPct / 100);

      if (isLong && currentPrice <= trailingStopPrice) {
        return {
          reason: "STOP",
          label: `Trailing stop hit (${trailPct}% from peak $${peakPrice.toFixed(2)})`,
        };
      }
      if (!isLong && currentPrice >= trailingStopPrice) {
        return {
          reason: "STOP",
          label: `Trailing stop hit (${trailPct}% from peak $${peakPrice.toFixed(2)})`,
        };
      }
      return null;
    }

    case "MANUAL":
    default:
      return null; // Never auto-closes
  }
}

// ─── Proximity helpers ────────────────────────────────────────────────────────

/**
 * Returns how close (0–1) the position is to its target.
 * 1.0 = at target, 0 = at entry.
 */
export function targetProximity(
  position: Pick<PositionModel, "direction" | "avgCost" | "targetPrice">,
  currentPrice: number
): number {
  if (!position.targetPrice) return 0;
  const totalRange = Math.abs(position.targetPrice - position.avgCost);
  if (totalRange === 0) return 0;
  const progress =
    position.direction === "LONG"
      ? currentPrice - position.avgCost
      : position.avgCost - currentPrice;
  return Math.max(0, Math.min(1, progress / totalRange));
}

/**
 * Returns how close (0–1) the position is to its stop loss.
 * 1.0 = at stop, 0 = far from stop.
 */
export function stopProximity(
  position: Pick<PositionModel, "direction" | "avgCost" | "stopLoss">,
  currentPrice: number
): number {
  if (!position.stopLoss) return 0;
  const totalRange = Math.abs(position.avgCost - position.stopLoss);
  if (totalRange === 0) return 0;
  const distanceToStop =
    position.direction === "LONG"
      ? position.avgCost - currentPrice   // positive when price drops toward stop
      : currentPrice - position.avgCost;  // positive when price rises toward stop
  return Math.max(0, Math.min(1, distanceToStop / totalRange));
}

// ─── Main export: called by price-monitor ────────────────────────────────────

/**
 * Evaluates exit conditions for a position.
 * Uses stored peakPrice from Position row (maintained by price-monitor).
 * Falls back to avgCost only when peakPrice is null (first tick).
 *
 * Side effects:
 *  - Writes NEAR_TARGET PositionEvent + PositionManagementAction (once per 2h)
 *  - Writes NEAR_STOP PositionEvent + PositionManagementAction (once per 2h)
 *  - Calls closeOpenPosition when exit signal fires
 */
export async function checkExitConditions(
  position: PositionModel,
  currentPrice: number,
  storedPeakPrice?: number | null,
): Promise<void> {
  // Use stored peak if available (avoids full event-scan query)
  const peak = storedPeakPrice ?? position.peakPrice ?? position.avgCost;
  const signal = evaluateExitStrategy(position, currentPrice, peak);

  // ── Near-target alert ─────────────────────────────────────────────────────
  if (!signal && position.targetPrice) {
    const proximity = targetProximity(position, currentPrice);
    if (proximity >= 0.9) {
      const pct = Math.round(proximity * 100);
      const recentAlert = await prisma.positionEvent.findFirst({
        where: {
          positionId: position.id,
          eventType: "NEAR_TARGET",
          createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
      });
      if (!recentAlert) {
        const description = `${position.symbol} approaching target: $${currentPrice.toFixed(2)} (${pct}% to target $${position.targetPrice.toFixed(2)})`;
        await prisma.$transaction([
          prisma.positionEvent.create({
            data: {
              positionId: position.id,
              eventType: "NEAR_TARGET",
              description,
              priceAt: currentPrice,
            },
          }),
          prisma.positionManagementAction.create({
            data: {
              positionId: position.id,
              actionType: "NEAR_TARGET",
              source: "price_monitor",
              newTargetPrice: position.targetPrice,
              reason: description,
            },
          }),
        ]);
      }
    }
  }

  // ── Near-stop alert ───────────────────────────────────────────────────────
  if (!signal && position.stopLoss) {
    const proximity = stopProximity(position, currentPrice);
    if (proximity >= 0.8) {
      const pct = Math.round(proximity * 100);
      const recentAlert = await prisma.positionEvent.findFirst({
        where: {
          positionId: position.id,
          eventType: "NEAR_STOP",
          createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
      });
      if (!recentAlert) {
        const description = `${position.symbol} approaching stop loss: $${currentPrice.toFixed(2)} (${pct}% to stop $${position.stopLoss.toFixed(2)})`;
        await prisma.$transaction([
          prisma.positionEvent.create({
            data: {
              positionId: position.id,
              eventType: "NEAR_STOP",
              description,
              priceAt: currentPrice,
            },
          }),
          prisma.positionManagementAction.create({
            data: {
              positionId: position.id,
              actionType: "NEAR_STOP",
              source: "price_monitor",
              newStopLoss: position.stopLoss,
              reason: description,
            },
          }),
        ]);
      }
    }
  }

  if (!signal) return;

  // Lazy import to avoid circular dependency
  const { closeOpenPosition } = await import("@/lib/actions/closeTrade.actions");
  await closeOpenPosition(position.id, signal.reason, currentPrice, undefined, "price_monitor");
}
