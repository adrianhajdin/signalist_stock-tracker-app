import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { getLatestPrices } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import { isMarketOpen } from "@/lib/market-hours";
import { checkExitConditions } from "@/lib/trade-exit";
import type { PositionModel } from "@/lib/generated/prisma/models";
import { sendEmail, getUserEmail } from "@/lib/email";
import { nearTargetHtml } from "@/lib/emails/near-target";

// ─── P&L helpers ─────────────────────────────────────────────────────────────

function calculatePnl(
  position: PositionModel,
  currentPrice: number
): { dollars: number; pct: number } {
  const dollars =
    position.direction === "LONG"
      ? (currentPrice - position.avgCost) * position.quantity
      : (position.avgCost - currentPrice) * position.quantity;
  const pct =
    position.direction === "LONG"
      ? ((currentPrice - position.avgCost) / position.avgCost) * 100
      : ((position.avgCost - currentPrice) / position.avgCost) * 100;
  return { dollars, pct };
}

// ─── Inngest function ─────────────────────────────────────────────────────────

export const priceMonitor = inngest.createFunction(
  {
    id: "price-monitor",
    name: "Hourly Price Monitor",
    retries: 0,
  },
  { cron: "TZ=America/New_York 0 9-17 * * 1-5" },
  async ({ step }) => {
    // Step 1: Fetch all OPEN positions
    const openPositions = await step.run("fetch-open-positions", async () => {
      return prisma.position.findMany({ where: { status: "OPEN" } });
    });

    if (openPositions.length === 0) return { checked: 0, reason: "no-open-positions" };

    // Step 2: Skip if market is closed
    const marketOpen = await step.run("check-market-hours", async () => {
      return isMarketOpen();
    });

    if (!marketOpen) {
      return { checked: 0, reason: "market-closed" };
    }

    // Step 3: Batch fetch current prices via Alpaca Data API
    const uniqueTickers = [...new Set(openPositions.map((p) => p.symbol))];

    const priceMap = await step.run("fetch-prices", async () => {
      try {
        // Use the first user's creds for market data (same prices for all accounts)
        const firstUserId = openPositions[0]?.userId;
        const creds = firstUserId ? await resolveAlpacaCredentials(firstUserId) ?? undefined : undefined;
        return await getLatestPrices(uniqueTickers, creds);
      } catch {
        return {} as Record<string, number>;
      }
    });

    // Step 4: Per-position price check + exit condition evaluation
    let checked = 0;
    let errors = 0;

    for (const position of openPositions) {
      await step.run(`check-position-${position.id}`, async () => {
        try {
          const currentPrice = priceMap[position.symbol];
          if (!currentPrice) {
            await prisma.positionEvent.create({
              data: {
                positionId: position.id,
                eventType: "PRICE_CHECK",
                description: `Price unavailable for ${position.symbol}`,
                priceAt: null,
                pnlAt: null,
              },
            });
            return;
          }

          const pnl = calculatePnl(position as unknown as PositionModel, currentPrice);

          // Maintain running peak/trough on the Position row itself (avoids recomputing from events)
          const isLong = position.direction === "LONG";
          const peakUpdate: Record<string, number | Date> = {};
          if (isLong) {
            if (!position.peakPrice || currentPrice > position.peakPrice) {
              peakUpdate.peakPrice = currentPrice;
              peakUpdate.peakAt = new Date();
            }
            if (!position.troughPrice || currentPrice < position.troughPrice) {
              peakUpdate.troughPrice = currentPrice;
              peakUpdate.troughAt = new Date();
            }
          } else {
            // SHORT: peak = lowest price seen, trough = highest
            if (!position.peakPrice || currentPrice < position.peakPrice) {
              peakUpdate.peakPrice = currentPrice;
              peakUpdate.peakAt = new Date();
            }
            if (!position.troughPrice || currentPrice > position.troughPrice) {
              peakUpdate.troughPrice = currentPrice;
              peakUpdate.troughAt = new Date();
            }
          }
          if (Object.keys(peakUpdate).length > 0) {
            await prisma.position.update({ where: { id: position.id }, data: peakUpdate });
          }

          // Write PRICE_CHECK event
          await prisma.positionEvent.create({
            data: {
              positionId: position.id,
              eventType: "PRICE_CHECK",
              description: `Price check: $${currentPrice.toFixed(2)} (${pnl.pct >= 0 ? "+" : ""}${pnl.pct.toFixed(1)}%)`,
              priceAt: currentPrice,
              pnlAt: pnl.dollars,
            },
          });

          // Check exit conditions — pass stored peakPrice to avoid event-scan query
          await checkExitConditions(position as unknown as PositionModel, currentPrice, position.peakPrice);

          // Near-target alert — send once when ≥80% of the way to price target
          if (
            position.targetPrice &&
            !position.nearTargetAlertSent
          ) {
            const totalMove =
              position.direction === "LONG"
                ? position.targetPrice - position.avgCost
                : position.avgCost - position.targetPrice;
            const currentMove =
              position.direction === "LONG"
                ? currentPrice - position.avgCost
                : position.avgCost - currentPrice;
            const progress = totalMove > 0 ? currentMove / totalMove : 0;

            if (progress >= 0.8) {
              await prisma.position.update({
                where: { id: position.id },
                data: { nearTargetAlertSent: true },
              });
              getUserEmail(position.userId).then((toEmail) => {
                if (!toEmail) return;
                const unrealizedPnl =
                  position.direction === "LONG"
                    ? (currentPrice - position.avgCost) * position.quantity
                    : (position.avgCost - currentPrice) * position.quantity;
                sendEmail({
                  to: toEmail,
                  subject: `🎯 ${position.symbol} is ${Math.round(progress * 100)}% to target`,
                  html: nearTargetHtml({
                    ticker: position.symbol,
                    direction: position.direction as "LONG" | "SHORT",
                    entryPrice: position.avgCost,
                    currentPrice,
                    targetPrice: position.targetPrice!,
                    progressPct: progress * 100,
                    unrealizedPnl,
                    unrealizedPnlPct: pnl.pct,
                    tradeId: position.id,
                  }),
                });
              });
            }
          }

          checked++;
        } catch {
          errors++;
        }
      });
    }

    return { checked, errors, total: openPositions.length };
  }
);
