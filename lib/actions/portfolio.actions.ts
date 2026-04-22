"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getAccount, getOrder, getLatestPrices, getLatestPricesWithMeta, getPortfolioHistory, type AlpacaCredentials, type PriceLookup } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import type { MockTrade, TradeStatus } from "@/lib/mock-data/trades";
import { etTradingDayDate } from "@/lib/market-hours";

// ─── Constants ────────────────────────────────────────────────────────────────

const STARTING_CAPITAL = 100_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortfolioStats {
  totalValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  winRate: number | null; // 0–1 or null if no closed positions
  openCount: number;
}

export interface AgentConfigSummary {
  id: string;
  name: string;
  enabled: boolean;
  scheduleTime: string;
  lastRunAt: string | null; // ISO string
  tradesPlaced: number;
}

export interface RecentRunSummary {
  id: string;
  agentName: string | null;
  startedAt: string; // ISO string
  completedAt: string | null;
  thesisCount: number;
  tradesPlaced: number;
  status: string;
}

export interface TodaysPick {
  id: string;
  ticker: string;
  direction: string;
  confidenceScore: number;
  signalTypes: string[];
}

export interface RecentPick {
  id: string;
  ticker: string;
  direction: string;
  confidenceScore: number;
  signalTypes: string[];
  reasoningSummary: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  createdAt: string; // ISO
  decision: string | null; // BUY | SELL | PASS | HOLD — actual action taken
  position: {
    id: string;
    status: string;
    tradeStatus: TradeStatus; // derived from order fill state
    avgCost: number;
    quantity: number | null;
    openedAt: string; // ISO
    filledAt: string | null;  // when order filled (null = still pending)
    placedAt: string | null;  // when order was placed
  } | null;
  currentPrice: number | null;
  companyName: string | null;
  analystName: string | null;
  analystId: string | null;
  runId: string;
  sourcesUsed: unknown;
}

export interface SpyBenchmark {
  '1W': number | null;
  '1M': number | null;
  '1Y': number | null;
}

/** A single item in the homepage activity timeline. */
export interface ActivityFeedItem {
  id: string;
  type: "OPENED" | "CLOSED" | "MODIFIED";
  positionId: string;
  symbol: string;
  direction: string;
  timestamp: string;   // ISO — used for sort/display
  label: string;       // e.g. "Opened LONG", "Closed — WIN", "Stop → breakeven"
  source: string;      // "agent" | "price_monitor" | "user"
  reason: string | null;
  pnl: number | null;
  pnlPct: number | null;
  outcome: string | null;
  analystName: string | null;
}

export interface DashboardData {
  openTrades: MockTrade[];
  closedTrades: MockTrade[];
  activityFeed: ActivityFeedItem[];
  portfolio: PortfolioStats;
  /** Total equity curve from Alpaca Portfolio History API (realized + unrealized). Falls back to realizedCurve. */
  equityCurve: { date: string; value: number }[];
  /** Realized-only equity curve (cumulative closed P&L + starting capital). */
  realizedCurve: { date: string; value: number }[];
  agentConfigs: AgentConfigSummary[];
  recentRuns: RecentRunSummary[];
  todaysPicks: TodaysPick[];
  recentPicks: RecentPick[];
  hasAlpacaKey: boolean;
  analystCount: number;
  hasCompletedRun: boolean;
  hasBrief: boolean;
  analysts: { id: string; name: string }[];
  analystEquityCurves: Record<string, { date: string; value: number }[]>;
  spyBenchmark: SpyBenchmark;
  spyCandles: { date: string; close: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(status: string, outcome: string | null): TradeStatus {
  if (status === "OPEN") return "OPEN";
  if (status === "CANCELLED") return "CANCELLED";
  if (outcome === "WIN") return "CLOSED_WIN";
  if (outcome === "LOSS") return "CLOSED_LOSS";
  return "CLOSED_EXPIRED";
}

function calcPnl(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  shares: number
): { dollars: number; pct: number } {
  const dollars =
    direction === "LONG"
      ? (currentPrice - entryPrice) * shares
      : (entryPrice - currentPrice) * shares;
  const pct =
    direction === "LONG"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
  return { dollars, pct };
}

function buildEquityCurve(
  closedPositions: Array<{ closedAt: Date | null; realizedPnl: number | null }>,
  startCapital: number,
  currentTotalValue: number,
  days = 365
): { date: string; value: number }[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const byDay = new Map<string, number>();
  for (const pos of closedPositions) {
    if (!pos.closedAt || !pos.realizedPnl) continue;
    if (pos.closedAt < cutoff) continue;
    const day = pos.closedAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + pos.realizedPnl);
  }

  let balance = startCapital;
  const points: { date: string; value: number }[] = [];

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const iso = date.toISOString().slice(0, 10);
    balance += byDay.get(iso) ?? 0;
    points.push({ date: iso, value: balance });
  }

  if (points.length > 0) {
    points[points.length - 1] = {
      ...points[points.length - 1],
      value: currentTotalValue,
    };
  }

  return points;
}

// ─── Inline order reconciliation ─────────────────────────────────────────────
// Belt-and-suspenders: if the Inngest cron hasn't reconciled pending orders
// (e.g. sync issue, deployment gap), reconcile them inline when the page loads.
// Only checks orders that have an alpacaOrderId and are still PENDING.

async function reconcilePendingOrdersInline(
  pendingOrders: Array<{
    id: string;
    positionId: string;
    side: string;
    quantity: number;
    alpacaOrderId: string | null;
    position: { id: string; direction: string; avgCost: number; quantity: number; status: string };
  }>,
  creds: AlpacaCredentials | undefined,
): Promise<number> {
  if (pendingOrders.length === 0 || !creds) return 0;

  let reconciled = 0;
  await Promise.allSettled(
    pendingOrders.map(async (order) => {
      if (!order.alpacaOrderId) return;
      try {
        const alpacaOrder = await getOrder(order.alpacaOrderId, creds);
        const status = alpacaOrder.status;

        if (status === "filled" && alpacaOrder.filled_avg_price) {
          const fillPrice = parseFloat(alpacaOrder.filled_avg_price);
          const filledAt = alpacaOrder.filled_at
            ? new Date(alpacaOrder.filled_at)
            : new Date();

          await prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
              where: { id: order.id, status: "PENDING" },
              data: {
                status: "FILLED",
                filledPrice: fillPrice,
                filledQty: order.quantity,
                filledAt,
              },
            });
            if (updated.count === 0) return;

            if (order.side === "SELL") {
              const pos = order.position;
              if (pos.status === "OPEN") {
                const realizedPnl =
                  pos.direction === "LONG"
                    ? (fillPrice - pos.avgCost) * pos.quantity
                    : (pos.avgCost - fillPrice) * pos.quantity;
                const positionCost = pos.avgCost * pos.quantity;
                const outcome: "WIN" | "LOSS" | "BREAKEVEN" =
                  realizedPnl > 0.01 * positionCost
                    ? "WIN"
                    : realizedPnl < -0.01 * positionCost
                      ? "LOSS"
                      : "BREAKEVEN";
                await tx.position.update({
                  where: { id: pos.id },
                  data: { status: "CLOSED", closePrice: fillPrice, realizedPnl, outcome, closedAt: filledAt },
                });
              }
            } else {
              // BUY filled — update avgCost to real fill price
              if (Math.abs(order.position.avgCost - fillPrice) > 0.01) {
                await tx.position.update({
                  where: { id: order.position.id },
                  data: { avgCost: fillPrice },
                });
              }
            }
          });

          reconciled++;
          console.log(`[portfolio] Inline reconciled order ${order.id}: FILLED at $${fillPrice.toFixed(2)}`);
        } else if (["canceled", "cancelled", "expired", "rejected"].includes(status)) {
          await prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
              where: { id: order.id, status: "PENDING" },
              data: { status: status === "rejected" ? "REJECTED" : "CANCELLED" },
            });
            if (updated.count === 0) return;

            if (order.side === "BUY") {
              const filledBuy = await tx.order.findFirst({
                where: { positionId: order.positionId, side: "BUY", status: "FILLED" },
                select: { id: true },
              });
              if (!filledBuy) {
                await tx.position.update({
                  where: { id: order.positionId },
                  data: { status: "CANCELLED", closedAt: new Date(), closeReason: "MANUAL", realizedPnl: 0 },
                });
              }
            }
          });

          reconciled++;
          console.log(`[portfolio] Inline reconciled order ${order.id}: ${status.toUpperCase()}`);
        }
      } catch (err) {
        console.warn(`[portfolio] Inline reconcile failed for order ${order.id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );

  return reconciled;
}

// ─── Main data loader ─────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emptyPortfolio: PortfolioStats = {
    totalValue: STARTING_CAPITAL,
    unrealizedPnl: 0,
    realizedPnl: 0,
    winRate: null,
    openCount: 0,
  };

  if (!user) {
    return {
      openTrades: [],
      closedTrades: [],
      activityFeed: [],
      portfolio: emptyPortfolio,
      equityCurve: [],
      realizedCurve: [],
      agentConfigs: [],
      recentRuns: [],
      todaysPicks: [],
      recentPicks: [],
      hasAlpacaKey: false,
      analystCount: 0,
      hasCompletedRun: false,
      hasBrief: false,
      analysts: [],
      analystEquityCurves: {},
      spyBenchmark: { '1W': null, '1M': null, '1Y': null },
      spyCandles: [],
    };
  }

  const userId = user.id;
  const todayMidnight = etTradingDayDate();

  // ── Phase A: every DB read that doesn't depend on another result ─────────
  // Previously these were 7 sequential awaits stretched across the function;
  // collapsing them into one Promise.all turns a ~500ms waterfall into a
  // single round trip bounded by the slowest query.
  const [
    alpacaCreds,
    dbOpenPositions,
    dbClosedPositions,
    dbRecentPicks,
    dbAgentConfigs,
    positionsWithAnalyst,
    dbRecentRuns,
    dbTodaysPicks,
    dbManagementActions,
  ] = await Promise.all([
    resolveAlpacaCredentials(userId).then((c) => c ?? undefined),
    prisma.position.findMany({
      where: { userId, status: "OPEN" },
      include: {
        analyst: { select: { name: true } },
        // Most recent BUY/SELL order — used to surface fill state in UI
        orders: {
          where: { side: { in: ["BUY", "SELL"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            side: true,
            status: true,
            filledAt: true,
            filledPrice: true,
            createdAt: true,
            alpacaOrderId: true,
            quantity: true,
          },
        },
      },
      orderBy: { openedAt: "desc" },
    }).catch(() => [] as never[]),
    prisma.position.findMany({
      where: { userId, status: { in: ["CLOSED", "CANCELLED"] } },
      include: {
        analyst: { select: { name: true } },
      },
      orderBy: { closedAt: "desc" },
      take: 50,
    }).catch(() => [] as never[]),
    prisma.thesis.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        ticker: true,
        researchRunId: true,
        direction: true,
        confidenceScore: true,
        signalTypes: true,
        reasoningSummary: true,
        entryPrice: true,
        targetPrice: true,
        stopLoss: true,
        createdAt: true,
        sourcesUsed: true,
        researchRun: {
          select: { agentConfig: { select: { id: true, name: true } } },
        },
        // Pull the *opening* decision (INITIATE) so the position fields shown
        // on the thesis card always reflect the original entry, not a later
        // HOLD/EVALUATE decision that may have a null position link.
        decisions: {
          where: { decision: "INITIATE" },
          take: 1,
          orderBy: { createdAt: "asc" as const },
          select: {
            decision: true,
            position: {
              select: {
                id: true,
                status: true,
                avgCost: true,
                quantity: true,
                openedAt: true,
                orders: {
                  where: { side: { in: ["BUY", "SELL"] } },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { status: true, filledAt: true, createdAt: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.agentConfig.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      // select only what AgentConfigSummary needs — skip the big JSON/string
      // columns (analystPrompt, strategyInstructions, tickerUniverse, etc).
      select: {
        id: true,
        name: true,
        enabled: true,
        scheduleTime: true,
        researchRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { startedAt: true },
        },
      },
    }),
    prisma.position.findMany({
      where: { userId },
      select: { id: true, analystId: true },
    }),
    prisma.researchRun.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 10,
      // select only what RecentRunSummary needs — skip the `parameters`
      // JSON blob (can be huge) and the rest of the run's scalars.
      select: {
        id: true,
        startedAt: true,
        completedAt: true,
        status: true,
        agentConfig: { select: { name: true } },
        theses: { select: { id: true } },
        decisions: {
          where: { decision: "BUY" },
          select: { id: true },
        },
      },
    }),
    prisma.thesis.findMany({
      where: {
        userId,
        createdAt: { gte: todayMidnight },
        direction: { in: ["LONG", "SHORT"] },
      },
      orderBy: { confidenceScore: "desc" },
      take: 5,
      select: {
        id: true,
        ticker: true,
        direction: true,
        confidenceScore: true,
        signalTypes: true,
      },
    }),
    // Activity feed: recent management actions with position context
    // .catch(() => []) — silently degrades if table hasn't been migrated yet
    prisma.positionManagementAction.findMany({
      where: { position: { userId } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        positionId: true,
        actionType: true,
        source: true,
        reason: true,
        fillPrice: true,
        fillQty: true,
        createdAt: true,
        position: {
          select: {
            symbol: true,
            direction: true,
            realizedPnl: true,
            avgCost: true,
            quantity: true,
            outcome: true,
            analyst: { select: { name: true } },
          },
        },
      },
    }).catch(() => [] as never[]),
  ]);

  // ── Phase A½: inline reconcile pending orders ──────────────────────────
  // If any open position has a PENDING order, check Alpaca directly.
  // This is a belt-and-suspenders fallback in case the Inngest cron hasn't
  // run (deployment gap, sync issue, etc.). Runs concurrently with Phase B.
  const pendingOrders = dbOpenPositions.flatMap((p) => {
    const order = p.orders?.[0];
    if (!order || order.status !== "PENDING" || !order.alpacaOrderId) return [];
    return [{
      id: order.id,
      positionId: p.id,
      side: order.side ?? (p.direction === "LONG" ? "BUY" : "SELL"),
      quantity: order.quantity ?? p.quantity,
      alpacaOrderId: order.alpacaOrderId,
      position: { id: p.id, direction: p.direction, avgCost: p.avgCost, quantity: p.quantity, status: p.status },
    }];
  });

  // ── Phase B: price + name lookups + SPY benchmark, parallel ────────────
  // These depend on tickers from phase A but are independent of each other,
  // so run them in parallel instead of sequentially.
  const openTickers = [...new Set(dbOpenPositions.map((p) => p.symbol))];
  const pickTickers = [...new Set(dbRecentPicks.map((p) => p.ticker))];
  const allTickers = [...new Set([...openTickers, ...pickTickers])];

  const emptyPriceLookup: PriceLookup = {
    prices: {},
    sources: {},
    fetchedAt: new Date().toISOString(),
  };

  function computeSpyReturn(candles: { date: string; close: number }[], days: number): number | null {
    if (candles.length < 2) return null;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sliced = candles.filter((c) => new Date(c.date + 'T12:00:00') >= cutoff);
    if (sliced.length < 2) return null;
    const start = sliced[0].close;
    const end = sliced[sliced.length - 1].close;
    return ((end - start) / start) * 100;
  }

  const [priceLookup, nameMap, spyCandles, portfolioHistory, alpacaAccount, reconciledCount] = await Promise.all([
    allTickers.length > 0
      ? getLatestPricesWithMeta(allTickers, alpacaCreds).catch((err) => {
          console.error(
            `[portfolio] getLatestPricesWithMeta threw — ${err instanceof Error ? err.message : err}. Falling back to entry prices.`,
          );
          return emptyPriceLookup;
        })
      : Promise.resolve(emptyPriceLookup),
    (async () => {
      const map: Record<string, string> = {};
      try {
        const { getStockProfile } = await import("@/lib/actions/finnhub.actions");
        const profiles = await Promise.allSettled(
          pickTickers.map(async (t) => {
            const p = await getStockProfile(t);
            return { ticker: t, name: p?.name ?? null };
          }),
        );
        for (const r of profiles) {
          if (r.status === "fulfilled" && r.value.name) {
            map[r.value.ticker] = r.value.name;
          }
        }
      } catch {
        // Finnhub down — names will be null
      }
      return map;
    })(),
    (async () => {
      try {
        const { getStockCandles } = await import("@/lib/actions/finnhub.actions");
        const candles = await getStockCandles('SPY', 400);
        return candles.map((c) => ({ date: c.date, close: c.close }));
      } catch {
        return [] as { date: string; close: number }[];
      }
    })(),
    // Alpaca Portfolio History — total equity including unrealized P&L
    alpacaCreds
      ? getPortfolioHistory({}, alpacaCreds).catch((err) => {
          console.warn(`[portfolio] getPortfolioHistory failed: ${err instanceof Error ? err.message : err}`);
          return [] as import("@/lib/alpaca").PortfolioHistoryPoint[];
        })
      : Promise.resolve([] as import("@/lib/alpaca").PortfolioHistoryPoint[]),
    // Alpaca Account — live equity (source of truth for total portfolio value)
    alpacaCreds
      ? getAccount(alpacaCreds).catch((err) => {
          console.warn(`[portfolio] getAccount failed: ${err instanceof Error ? err.message : err}`);
          return null;
        })
      : Promise.resolve(null),
    // Inline reconcile pending orders — runs concurrently with price lookups
    reconcilePendingOrdersInline(pendingOrders, alpacaCreds),
  ]);
  const priceMap = priceLookup.prices;

  // If we reconciled any orders, re-read positions so the page reflects
  // the updated status (FILLED instead of PENDING, or CLOSED/CANCELLED).
  let effectiveOpenPositions = dbOpenPositions;
  if (reconciledCount > 0) {
    console.log(`[portfolio] Re-reading positions after reconciling ${reconciledCount} order(s)`);
    effectiveOpenPositions = await prisma.position.findMany({
      where: { userId, status: "OPEN" },
      include: {
        analyst: { select: { name: true } },
        orders: {
          where: { side: { in: ["BUY", "SELL"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, side: true, status: true, filledAt: true, filledPrice: true, createdAt: true, alpacaOrderId: true, quantity: true },
        },
      },
      orderBy: { openedAt: "desc" },
    }).catch(() => dbOpenPositions);
  }

  const spyBenchmark: SpyBenchmark = {
    '1W': computeSpyReturn(spyCandles, 7),
    '1M': computeSpyReturn(spyCandles, 30),
    '1Y': computeSpyReturn(spyCandles, 365),
  };

  // ── 4. Map open positions → MockTrade shape ────────────────────────────────
  const openTrades: MockTrade[] = effectiveOpenPositions.map((p) => {
    const livePrice = priceMap[p.symbol];
    const priceSource = priceLookup.sources[p.symbol] ?? "missing";
    const currentPrice = livePrice ?? p.avgCost;
    const { dollars, pct } = calcPnl(p.direction, p.avgCost, currentPrice, p.quantity);
    const order = p.orders?.[0];
    // Derive the display status from Position.status + latest Order.status.
    // Position stays OPEN until its BUY actually fills; the PENDING/REJECTED
    // view-model statuses are UI-only denormalizations.
    let displayStatus: TradeStatus = "OPEN";
    if (order?.status === "REJECTED") displayStatus = "REJECTED";
    else if (order?.status === "PENDING" || (order && order.filledAt == null)) displayStatus = "PENDING";
    return {
      id: p.id,
      ticker: p.symbol,
      direction: p.direction as "LONG" | "SHORT",
      entryPrice: p.avgCost,
      currentPrice,
      targetPrice: p.targetPrice ?? p.avgCost * 1.1,
      stopPrice: p.stopLoss ?? p.avgCost * 0.9,
      confidenceScore: 0, // TODO: join via TradeDecision → Thesis
      status: displayStatus,
      pnl: livePrice !== undefined ? dollars : 0,
      pnlPct: livePrice !== undefined ? pct : 0,
      openedAt: p.openedAt.toISOString(),
      closedAt: undefined,
      thesis: "",
      shares: p.quantity,
      analystName: p.analyst?.name ?? undefined,
      analystId: p.analystId ?? undefined,
      placedAt: order?.createdAt?.toISOString(),
      filledAt: order?.filledAt?.toISOString(),
      orderStatus: order?.status,
      alpacaOrderId: order?.alpacaOrderId ?? undefined,
      priceSource,
      priceUpdatedAt: livePrice !== undefined ? priceLookup.fetchedAt : undefined,
    };
  });

  // ── 5. Map closed positions → MockTrade shape ──────────────────────────────
  const closedTrades: MockTrade[] = dbClosedPositions.map((p) => {
    const closePrice = p.closePrice ?? p.avgCost;
    const positionCost = p.avgCost * p.quantity;
    const realizedPnl = p.realizedPnl ?? 0;
    return {
      id: p.id,
      ticker: p.symbol,
      direction: p.direction as "LONG" | "SHORT",
      entryPrice: p.avgCost,
      currentPrice: closePrice,
      targetPrice: p.targetPrice ?? p.avgCost * 1.1,
      stopPrice: p.stopLoss ?? p.avgCost * 0.9,
      confidenceScore: 0,
      status: mapStatus(p.status, p.outcome),
      pnl: realizedPnl,
      pnlPct: positionCost > 0 ? (realizedPnl / positionCost) * 100 : 0,
      openedAt: p.openedAt.toISOString(),
      closedAt: p.closedAt?.toISOString(),
      thesis: "",
      shares: p.quantity,
      analystName: p.analyst?.name ?? undefined,
      analystId: p.analystId ?? undefined,
    };
  });

  // ── 6. Portfolio stats ─────────────────────────────────────────────────────
  const realizedPnl = dbClosedPositions.reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0);
  const unrealizedPnl = openTrades.reduce((sum, t) => sum + t.pnl, 0);
  // Use Alpaca's live equity as the source of truth. Falls back to DB math
  // only if Alpaca creds are missing or the account call failed.
  const totalValue = alpacaAccount
    ? parseFloat(alpacaAccount.equity)
    : STARTING_CAPITAL + realizedPnl + unrealizedPnl;

  const closedWithOutcome = dbClosedPositions.filter((p) => p.outcome);
  const winRate =
    closedWithOutcome.length > 0
      ? closedWithOutcome.filter((p) => p.outcome === "WIN").length /
        closedWithOutcome.length
      : null;

  // ── 7. Equity curves ───────────────────────────────────────────────────────
  // realizedCurve: cumulative closed P&L starting from STARTING_CAPITAL (old behavior)
  const realizedCurve = buildEquityCurve(dbClosedPositions, STARTING_CAPITAL, totalValue);

  // equityCurve: total equity from Alpaca Portfolio History API (includes unrealized)
  // Falls back to realizedCurve if Alpaca creds are missing or call failed.
  const equityCurve: { date: string; value: number }[] =
    portfolioHistory.length >= 2
      ? portfolioHistory.map((p) => ({ date: p.date, value: p.equity }))
      : realizedCurve;

  // ── 7b. Per-analyst equity curves (cumulative P&L, starting from 0) ────────
  const analystEquityCurves: Record<string, { date: string; value: number }[]> = {};
  const analystsWithTrades = new Set<string>([
    ...dbClosedPositions.map((p) => p.analystId),
    ...dbOpenPositions.map((p) => p.analystId),
  ]);
  for (const analystId of analystsWithTrades) {
    const closedForAnalyst = dbClosedPositions.filter((p) => p.analystId === analystId);
    const analystOpenPnl = openTrades
      .filter((t) => t.analystId === analystId)
      .reduce((s, t) => s + t.pnl, 0);
    const analystRealizedPnl = closedForAnalyst.reduce((s, p) => s + (p.realizedPnl ?? 0), 0);
    analystEquityCurves[analystId] = buildEquityCurve(
      closedForAnalyst,
      0,
      analystRealizedPnl + analystOpenPnl,
      365,
    );
  }

  // ── 8. Agent configs with last-run info (fetched in phase A) ──────────
  const tradeCountMap = new Map<string, number>();
  for (const pos of positionsWithAnalyst) {
    tradeCountMap.set(pos.analystId, (tradeCountMap.get(pos.analystId) ?? 0) + 1);
  }

  const agentConfigs: AgentConfigSummary[] = dbAgentConfigs.map((a) => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    scheduleTime: a.scheduleTime,
    lastRunAt: a.researchRuns[0]?.startedAt.toISOString() ?? null,
    tradesPlaced: tradeCountMap.get(a.id) ?? 0,
  }));

  const analysts = dbAgentConfigs
    .filter((a) => analystsWithTrades.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));

  // ── 9. Recent research runs (fetched in phase A) ─────────────────────
  const recentRuns: RecentRunSummary[] = dbRecentRuns.map((r) => ({
    id: r.id,
    agentName: r.agentConfig?.name ?? null,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    thesisCount: r.theses.length,
    tradesPlaced: r.decisions.length,
    status: r.status,
  }));

  // ── 10. Today's picks (fetched in phase A) ───────────────────────────
  const todaysPicks: TodaysPick[] = dbTodaysPicks.map((t) => ({
    id: t.id,
    ticker: t.ticker,
    direction: t.direction,
    confidenceScore: t.confidenceScore,
    signalTypes: t.signalTypes,
  }));

  // ── 11. Map recentPicks ────────────────────────────────────────────────────
  const recentPicks: RecentPick[] = dbRecentPicks.map((p) => {
    const dec = p.decisions[0]; // INITIATE decision only (filtered in query)
    const rawPos = dec?.position ?? null;

    let positionData: RecentPick["position"] = null;
    if (rawPos) {
      const order = rawPos.orders?.[0];
      // Derive tradeStatus from order fill state — same logic as trade sidebar.
      // Position.status is always "OPEN" until closed; "PENDING" is UI-only.
      let tradeStatus: TradeStatus = "OPEN";
      if (order?.status === "REJECTED") tradeStatus = "REJECTED";
      else if (order?.status === "CANCELLED") tradeStatus = "CANCELLED";
      else if (order && order.filledAt == null) tradeStatus = "PENDING";

      positionData = {
        id: rawPos.id,
        status: rawPos.status,
        tradeStatus,
        avgCost: rawPos.avgCost,
        quantity: rawPos.quantity ?? null,
        openedAt: rawPos.openedAt.toISOString(),
        filledAt: order?.filledAt ? new Date(order.filledAt).toISOString() : null,
        placedAt: order?.createdAt ? new Date(order.createdAt).toISOString() : null,
      };
    }

    return {
      id: p.id,
      ticker: p.ticker,
      direction: p.direction,
      confidenceScore: p.confidenceScore,
      signalTypes: p.signalTypes,
      reasoningSummary: p.reasoningSummary,
      entryPrice: p.entryPrice,
      targetPrice: p.targetPrice,
      stopLoss: p.stopLoss,
      createdAt: p.createdAt.toISOString(),
      decision: dec?.decision ?? null,
      position: positionData,
      currentPrice: priceMap[p.ticker] ?? null,
      companyName: nameMap[p.ticker] ?? null,
      analystName: p.researchRun?.agentConfig?.name ?? null,
      analystId: p.researchRun?.agentConfig?.id ?? null,
      runId: p.researchRunId,
      sourcesUsed: p.sourcesUsed,
    };
  });

  // ── 12. Activity feed — merge trade opens/closes + management actions ──────
  const activityFeed: ActivityFeedItem[] = [];

  // Recent opens (last 20)
  for (const p of dbOpenPositions.slice(0, 20)) {
    activityFeed.push({
      id: `open-${p.id}`,
      type: "OPENED",
      positionId: p.id,
      symbol: p.symbol,
      direction: p.direction,
      timestamp: p.openedAt.toISOString(),
      label: `Opened ${p.direction}`,
      source: "agent",
      reason: null,
      pnl: null,
      pnlPct: null,
      outcome: null,
      analystName: p.analyst?.name ?? null,
    });
  }

  // Recent closes (last 20)
  for (const p of dbClosedPositions.slice(0, 20)) {
    const pnl = p.realizedPnl ?? 0;
    const positionCost = p.avgCost * p.quantity;
    const pnlPct = positionCost > 0 ? (pnl / positionCost) * 100 : 0;
    const sign = pnl >= 0 ? "+" : "";
    activityFeed.push({
      id: `close-${p.id}`,
      type: "CLOSED",
      positionId: p.id,
      symbol: p.symbol,
      direction: p.direction,
      timestamp: (p.closedAt ?? p.updatedAt).toISOString(),
      label: p.outcome === "WIN" ? `Closed — WIN ${sign}$${Math.abs(pnl).toFixed(0)}`
           : p.outcome === "LOSS" ? `Closed — LOSS $${Math.abs(pnl).toFixed(0)}`
           : `Closed`,
      source: (p as { closeSource?: string | null }).closeSource ?? "agent",
      reason: null,
      pnl,
      pnlPct: Math.round(pnlPct * 10) / 10,
      outcome: p.outcome ?? null,
      analystName: p.analyst?.name ?? null,
    });
  }

  // Management actions (non-close — the close is already represented above)
  for (const action of dbManagementActions) {
    if (action.actionType === "FULL_CLOSE") continue; // already shown as CLOSED
    let label = "Position updated";
    if (action.actionType === "PARTIAL_CLOSE") label = "Partial close";
    else if (action.actionType === "ADD_TO_POSITION") label = "Added to position";
    else if (action.actionType === "UPDATE_TARGETS") label = "Targets updated";
    else if (action.actionType === "MOVE_STOP_TO_BREAKEVEN") label = "Stop → breakeven";
    else if (action.actionType === "SET_TRAILING_STOP") label = "Trailing stop set";
    else if (action.actionType === "NEAR_TARGET") label = "Approaching target";
    else if (action.actionType === "NEAR_STOP") label = "Approaching stop";

    activityFeed.push({
      id: `action-${action.id}`,
      type: "MODIFIED",
      positionId: action.positionId,
      symbol: action.position.symbol,
      direction: action.position.direction,
      timestamp: action.createdAt.toISOString(),
      label,
      source: action.source,
      reason: action.reason,
      pnl: action.actionType === "PARTIAL_CLOSE" && action.fillPrice && action.fillQty
        ? action.position.direction === "LONG"
          ? (action.fillPrice - action.position.avgCost) * action.fillQty
          : (action.position.avgCost - action.fillPrice) * action.fillQty
        : null,
      pnlPct: null,
      outcome: null,
      analystName: action.position.analyst?.name ?? null,
    });
  }

  // Sort descending by timestamp, keep top 40
  activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const trimmedFeed = activityFeed.slice(0, 40);

  return {
    openTrades,
    closedTrades,
    activityFeed: trimmedFeed,
    portfolio: {
      totalValue,
      unrealizedPnl,
      realizedPnl,
      winRate,
      openCount: openTrades.length,
    },
    equityCurve,
    realizedCurve,
    agentConfigs,
    recentRuns,
    todaysPicks,
    recentPicks,
    hasAlpacaKey: alpacaCreds !== undefined,
    analystCount: dbAgentConfigs.length,
    hasCompletedRun: dbRecentRuns.some((r) => r.status === "COMPLETE"),
    hasBrief: recentPicks.length > 0,
    analysts,
    analystEquityCurves,
    spyBenchmark,
    spyCandles,
  };
}
