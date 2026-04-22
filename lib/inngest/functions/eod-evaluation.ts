import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { getLatestPrices } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import { etTradingDayDate } from "@/lib/market-hours";

// ─── P&L helper ───────────────────────────────────────────────────────────────

function calcPnlPct(
  direction: string,
  entryPrice: number,
  currentPrice: number
): number {
  if (direction === "LONG") return ((currentPrice - entryPrice) / entryPrice) * 100;
  return ((entryPrice - currentPrice) / entryPrice) * 100; // SHORT inverted
}

function calcPnlDollars(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  shares: number
): number {
  if (direction === "LONG") return (currentPrice - entryPrice) * shares;
  return (entryPrice - currentPrice) * shares;
}

// ─── Inngest function ─────────────────────────────────────────────────────────

export const eodEvaluation = inngest.createFunction(
  {
    id: "eod-evaluation",
    name: "EOD Evaluation Cron",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: "TZ=America/New_York 0 17 * * 1-5" }, // 5:00 PM ET Mon–Fri (auto-adjusts for EDT/EST)
  async ({ step }) => {
    // Step 1: Load all open positions
    const openPositions = await step.run("load-open-positions", async () => {
      return prisma.position.findMany({
        where: { status: "OPEN" },
        select: {
          id: true,
          symbol: true,
          direction: true,
          avgCost: true,
          quantity: true,
          userId: true,
        },
      });
    });

    if (openPositions.length === 0) {
      return { openChecks: 0, closedEvaluations: 0 };
    }

    // Step 2: Batch-fetch current prices for all open tickers
    const prices = await step.run("fetch-eod-prices", async () => {
      const uniqueTickers = [...new Set(openPositions.map((p) => p.symbol))];
      try {
        const firstUserId = openPositions[0]?.userId;
        const creds = firstUserId ? await resolveAlpacaCredentials(firstUserId) ?? undefined : undefined;
        return await getLatestPrices(uniqueTickers, creds);
      } catch {
        return {} as Record<string, number>;
      }
    });

    // Step 3: Write EOD_CHECK PositionEvent for each open position (idempotent)
    let openChecks = 0;

    for (const position of openPositions) {
      const currentPrice = (prices as Record<string, number>)[position.symbol];
      if (currentPrice === undefined) continue;

      await step.run(`eod-check-${position.id}`, async () => {
        // Idempotency: skip if an EOD_CHECK already exists for this position today
        const todayStart = etTradingDayDate();

        const existing = await prisma.positionEvent.findFirst({
          where: {
            positionId: position.id,
            eventType: "EOD_CHECK",
            createdAt: { gte: todayStart },
          },
          select: { id: true },
        });

        if (existing) return { skipped: true };

        const pnlPct = calcPnlPct(position.direction, position.avgCost, currentPrice);
        const pnlDollars = calcPnlDollars(
          position.direction,
          position.avgCost,
          currentPrice,
          position.quantity
        );
        const sign = pnlPct >= 0 ? "+" : "";

        await prisma.positionEvent.create({
          data: {
            positionId: position.id,
            eventType: "EOD_CHECK",
            description: `EOD | ${position.symbol} | ${sign}${pnlPct.toFixed(2)}% | $${currentPrice.toFixed(2)}`,
            priceAt: currentPrice,
            pnlAt: pnlDollars,
          },
        });

        return { written: true, ticker: position.symbol, pnlPct };
      });

      openChecks++;
    }

    // Step 4: Find positions closed TODAY and fire trade/closed event for any
    //         that haven't been evaluated yet (no EVALUATED PositionEvent)
    const closedToday = await step.run("load-closed-today", async () => {
      const todayStart = etTradingDayDate();

      return prisma.position.findMany({
        where: {
          status: "CLOSED",
          closedAt: { gte: todayStart },
        },
        select: {
          id: true,
          symbol: true,
          events: { where: { eventType: "EVALUATED" }, select: { id: true } },
        },
      });
    });

    // Fire trade/closed for positions that haven't been evaluated yet
    const unevaluated = (
      closedToday as Array<{
        id: string;
        symbol: string;
        events: { id: string }[];
      }>
    ).filter((p) => p.events.length === 0);

    for (const position of unevaluated) {
      await step.sendEvent(`evaluate-${position.id}`, {
        name: "trade/closed",
        data: { positionId: position.id },
      });
    }

    return {
      openChecks,
      closedEvaluations: unevaluated.length,
    };
  }
);
