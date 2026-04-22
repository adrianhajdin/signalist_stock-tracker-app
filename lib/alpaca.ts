/**
 * Alpaca Paper Trading Client
 * Wraps @alpacahq/alpaca-trade-api with full TypeScript types.
 *
 * Supports two credential modes:
 * 1. Per-user credentials (AlpacaCredentials passed explicitly)
 * 2. Env-var fallback (ALPACA_API_KEY / ALPACA_API_SECRET / ALPACA_BASE_URL)
 *
 * All exported functions accept an optional `creds` parameter.
 * When omitted, falls back to env vars (backward-compatible).
 */

import AlpacaAPI from "@alpacahq/alpaca-trade-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
  baseUrl?: string; // defaults to paper-api.alpaca.markets
}

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  buying_power: string;
  shorting_enabled: boolean;
  trade_suspended_by_user: boolean;
  trading_blocked: boolean;
  pattern_day_trader: boolean;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  status: string;
  filled_qty: string;
  filled_avg_price: string | null;
  limit_price: string | null;
  stop_price: string | null;
  created_at: string;
  filled_at: string | null;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: "long" | "short";
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  cost_basis: string;
}

export interface OrderParams {
  symbol: string;
  qty?: number;
  side: "buy" | "sell";
  notional?: number; // dollar amount instead of qty
}

export interface LimitOrderParams extends OrderParams {
  limitPrice: number;
}

// ─── Client factory ──────────────────────────────────────────────────────────

const PAPER_BASE_URL = "https://paper-api.alpaca.markets";

function createClient(creds?: AlpacaCredentials): AlpacaAPI {
  if (creds) {
    return new AlpacaAPI({
      keyId: creds.keyId,
      secretKey: creds.secretKey,
      baseUrl: creds.baseUrl || PAPER_BASE_URL,
      paper: true,
    });
  }
  // Env-var fallback (backward-compatible for crons / single-user)
  return new AlpacaAPI({
    keyId: process.env.ALPACA_API_KEY!,
    secretKey: process.env.ALPACA_API_SECRET!,
    baseUrl: process.env.ALPACA_BASE_URL || PAPER_BASE_URL,
    paper: true,
  });
}

// Lazy singleton for env-var mode only — safe for serverless
let _envClient: AlpacaAPI | null = null;

function getClient(creds?: AlpacaCredentials): AlpacaAPI {
  if (creds) return createClient(creds);
  if (!_envClient) _envClient = createClient();
  return _envClient;
}

// ─── Account ──────────────────────────────────────────────────────────────────

export async function getAccount(creds?: AlpacaCredentials): Promise<AlpacaAccount> {
  return (await getClient(creds).getAccount()) as AlpacaAccount;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function placeMarketOrder(
  params: OrderParams,
  creds?: AlpacaCredentials,
): Promise<AlpacaOrder> {
  const order: Record<string, unknown> = {
    symbol: params.symbol,
    side: params.side,
    type: "market",
    time_in_force: "day",
  };

  if (params.notional !== undefined) {
    order.notional = params.notional.toFixed(2);
  } else {
    order.qty = params.qty;
  }

  return (await withTimeout(getClient(creds).createOrder(order), `placeMarketOrder(${params.symbol})`)) as AlpacaOrder;
}

export async function placeLimitOrder(
  params: LimitOrderParams,
  creds?: AlpacaCredentials,
): Promise<AlpacaOrder> {
  return (await getClient(creds).createOrder({
    symbol: params.symbol,
    qty: params.qty,
    side: params.side,
    type: "limit",
    time_in_force: "gtc",
    limit_price: params.limitPrice,
  })) as AlpacaOrder;
}

export async function getOrder(orderId: string, creds?: AlpacaCredentials): Promise<AlpacaOrder> {
  return (await withTimeout(getClient(creds).getOrder(orderId), `getOrder(${orderId.slice(0, 8)})`)) as AlpacaOrder;
}

// ─── Positions ────────────────────────────────────────────────────────────────

export async function getPosition(
  symbol: string,
  creds?: AlpacaCredentials,
): Promise<AlpacaPosition | null> {
  try {
    return (await getClient(creds).getPosition(symbol)) as AlpacaPosition;
  } catch (err: unknown) {
    // Alpaca returns 404 when no position exists
    const e = err as { statusCode?: number };
    if (e?.statusCode === 404) return null;
    throw err;
  }
}

export async function getAllPositions(creds?: AlpacaCredentials): Promise<AlpacaPosition[]> {
  return (await getClient(creds).getPositions()) as AlpacaPosition[];
}

export async function closePosition(symbol: string, creds?: AlpacaCredentials): Promise<AlpacaOrder> {
  return (await getClient(creds).closePosition(symbol)) as AlpacaOrder;
}

/**
 * Partially close a position by submitting a market sell/buy for a specific qty.
 * Alpaca paper trading supports this via a market order for the subset quantity.
 */
export async function closePositionPartial(
  symbol: string,
  qty: number,
  side: "sell" | "buy",
  creds?: AlpacaCredentials,
): Promise<AlpacaOrder> {
  return (await getClient(creds).createOrder({
    symbol,
    qty: qty.toString(),
    side,
    type: "market",
    time_in_force: "day",
  } as Parameters<ReturnType<typeof getClient>["createOrder"]>[0])) as AlpacaOrder;
}

export async function cancelOrder(orderId: string, creds?: AlpacaCredentials): Promise<void> {
  await getClient(creds).cancelOrder(orderId);
}

export async function getOpenOrders(creds?: AlpacaCredentials): Promise<AlpacaOrder[]> {
  return (await getClient(creds).getOrders({
    status: "open",
    until: null,
    after: null,
    limit: 500,
    direction: "desc",
    nested: false,
    symbols: null,
  } as Parameters<ReturnType<typeof getClient>["getOrders"]>[0])) as AlpacaOrder[];
}

// ─── Timeout helper (Alpaca SDK doesn't support AbortSignal) ─────────────────

const ALPACA_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Alpaca ${label} TIMEOUT after ${ALPACA_TIMEOUT_MS}ms`)), ALPACA_TIMEOUT_MS)
    ),
  ]);
}

// ─── Market data ──────────────────────────────────────────────────────────────

/**
 * Returns the latest trade price for a US equity symbol.
 * Uses Alpaca Data API v2 — real-time during market hours, last close after.
 */
export async function getLatestPrice(symbol: string, creds?: AlpacaCredentials): Promise<number> {
  const trade = await withTimeout(getClient(creds).getLatestTrade(symbol), `getLatestPrice(${symbol})`);
  // SDK v3 returns PascalCase fields: { Price, Size, Timestamp, ... }
  const t = trade as { Price?: number; p?: number };
  const price = t.Price ?? t.p;
  if (price === undefined) {
    throw new Error(`No price available for ${symbol}`);
  }
  return price;
}

/**
 * Returns latest prices for multiple symbols in one call.
 *
 * Resilient design (free Alpaca plans use the IEX feed which has very spotty
 * coverage outside RTH and for many tickers):
 *  1. Try Alpaca `getLatestTrades` — handles Map / object / array return
 *     shapes from SDK v3 and tries multiple price field names.
 *  2. For any symbol that didn't get a price, fall back to Finnhub `/quote`
 *     in parallel (free tier covers ~all US equities).
 *  3. For any symbol *still* missing, fall back to single-symbol Alpaca
 *     `getLatestTrade` (uses a different SDK code path that we know works).
 *  4. Anything still missing is left unset — caller must handle.
 *
 * Returns a `PriceLookup` containing the price map plus per-symbol source
 * metadata so the UI can show "live" vs "stale" indicators.
 */

export type PriceSource = "alpaca" | "finnhub" | "missing";

export interface PriceLookup {
  prices: Record<string, number>;
  sources: Record<string, PriceSource>;
  fetchedAt: string; // ISO timestamp
}

function extractPrice(trade: unknown): number | undefined {
  if (trade == null || typeof trade !== "object") return undefined;
  const t = trade as Record<string, unknown>;
  const candidates = [t.Price, t.price, t.p, t.tp, t.tradePrice, t.ClosePrice, t.c];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

export async function getLatestPrices(
  symbols: string[],
  creds?: AlpacaCredentials,
): Promise<Record<string, number>> {
  // Backwards-compatible wrapper — many callers only need the price map.
  const lookup = await getLatestPricesWithMeta(symbols, creds);
  return lookup.prices;
}

export async function getLatestPricesWithMeta(
  symbols: string[],
  creds?: AlpacaCredentials,
): Promise<PriceLookup> {
  const result: Record<string, number> = {};
  const sources: Record<string, PriceSource> = {};
  const fetchedAt = new Date().toISOString();

  if (symbols.length === 0) {
    return { prices: result, sources, fetchedAt };
  }

  // ── 1. Alpaca batch trades (works on free IEX feed for liquid US equities) ──
  try {
    const trades = await withTimeout(
      getClient(creds).getLatestTrades(symbols),
      `getLatestPrices(${symbols.length} symbols)`,
    );

    if (trades instanceof Map) {
      trades.forEach((trade, symbol) => {
        const price = extractPrice(trade);
        if (price !== undefined) {
          result[symbol] = price;
          sources[symbol] = "alpaca";
        }
      });
    } else if (Array.isArray(trades)) {
      for (const entry of trades as Array<{ Symbol?: string; symbol?: string; S?: string } & Record<string, unknown>>) {
        const sym = entry.Symbol ?? entry.symbol ?? entry.S;
        if (typeof sym !== "string") continue;
        const price = extractPrice(entry);
        if (price !== undefined) {
          result[sym] = price;
          sources[sym] = "alpaca";
        }
      }
    } else if (trades && typeof trades === "object") {
      for (const [sym, trade] of Object.entries(trades as Record<string, unknown>)) {
        const price = extractPrice(trade);
        if (price !== undefined) {
          result[sym] = price;
          sources[sym] = "alpaca";
        }
      }
    }
  } catch (err) {
    console.warn(
      `[alpaca] getLatestTrades batch failed (${symbols.length} symbols), falling back to Finnhub: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // ── 2. Finnhub fallback for anything Alpaca missed ─────────────────────────
  const missing = symbols.filter((s) => result[s] === undefined);
  if (missing.length > 0) {
    try {
      const { getStockQuote } = await import("@/lib/actions/finnhub.actions");
      const quotes = await Promise.allSettled(
        missing.map(async (sym) => ({ sym, quote: await getStockQuote(sym) })),
      );
      for (const r of quotes) {
        if (r.status !== "fulfilled") continue;
        const { sym, quote } = r.value;
        const c = quote?.c;
        if (typeof c === "number" && Number.isFinite(c) && c > 0) {
          result[sym] = c;
          sources[sym] = "finnhub";
        }
      }
    } catch (err) {
      console.warn(
        `[alpaca] Finnhub fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── 3. Single-symbol Alpaca for anything still missing ────────────────────
  const stillMissing = symbols.filter((s) => result[s] === undefined);
  if (stillMissing.length > 0) {
    const single = await Promise.allSettled(
      stillMissing.map(async (sym) => ({ sym, price: await getLatestPrice(sym, creds) })),
    );
    for (const r of single) {
      if (r.status !== "fulfilled") continue;
      const { sym, price } = r.value;
      if (Number.isFinite(price) && price > 0) {
        result[sym] = price;
        sources[sym] = "alpaca";
      }
    }
  }

  // Mark anything still missing
  for (const sym of symbols) {
    if (result[sym] === undefined) sources[sym] = "missing";
  }

  const okCount = Object.values(sources).filter((s) => s !== "missing").length;
  if (okCount < symbols.length) {
    console.warn(
      `[alpaca] getLatestPrices resolved ${okCount}/${symbols.length} symbols. Missing: ${symbols
        .filter((s) => sources[s] === "missing")
        .join(", ")}`,
    );
  }

  return { prices: result, sources, fetchedAt };
}

// ─── Portfolio history ────────────────────────────────────────────────────────

export interface PortfolioHistoryPoint {
  date: string; // YYYY-MM-DD
  equity: number; // Total portfolio value including unrealized P&L
  profitLoss: number; // P&L for this data point
}

/**
 * Returns daily portfolio history from Alpaca's Portfolio History API.
 * equity[] = total account value including both realized and unrealized P&L.
 * This is the most accurate source for the equity curve — one call, server-side.
 */
export async function getPortfolioHistory(
  options: { period?: string; timeframe?: string } = {},
  creds?: AlpacaCredentials,
): Promise<PortfolioHistoryPoint[]> {
  const baseUrl = (creds?.baseUrl || process.env.ALPACA_BASE_URL || PAPER_BASE_URL).replace(/\/$/, "");
  const keyId = creds?.keyId || process.env.ALPACA_API_KEY!;
  const secretKey = creds?.secretKey || process.env.ALPACA_API_SECRET!;

  const params = new URLSearchParams({
    period: options.period ?? "5A",
    timeframe: options.timeframe ?? "1D",
  });

  const url = `${baseUrl}/v2/account/portfolio/history?${params}`;

  const raw = await withTimeout(
    fetch(url, {
      headers: {
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secretKey,
      },
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Alpaca portfolio history ${res.status}: ${body.slice(0, 200)}`);
      }
      return res.json() as Promise<{
        timestamp: number[];
        equity: (number | null)[];
        profit_loss: (number | null)[];
        base_value: number;
      }>;
    }),
    "getPortfolioHistory",
  );

  if (!Array.isArray(raw.timestamp) || !Array.isArray(raw.equity)) {
    throw new Error("Alpaca portfolio history: unexpected response shape");
  }

  const points: PortfolioHistoryPoint[] = [];
  for (let i = 0; i < raw.timestamp.length; i++) {
    const equity = raw.equity[i];
    if (equity == null || !Number.isFinite(equity) || equity <= 0) continue;
    points.push({
      date: new Date(raw.timestamp[i] * 1000).toISOString().slice(0, 10),
      equity,
      profitLoss: raw.profit_loss?.[i] ?? 0,
    });
  }

  return points;
}

// ─── Historical bars ─────────────────────────────────────────────────────────

/**
 * Returns daily bars for a symbol using Alpaca Data API v2.
 * Useful as a fallback when Finnhub/FMP lack candle data (micro-caps, ADRs).
 */
export async function getBars(
  symbol: string,
  options: { start: string; end: string; timeframe?: string; limit?: number },
  creds?: AlpacaCredentials,
): Promise<{ close: number; volume: number }[]> {
  const bars: { close: number; volume: number }[] = [];

  // Wrap entire iteration in a timeout since Alpaca SDK async iterators can hang
  const collectBars = async () => {
    const barIterator = getClient(creds).getBarsV2(symbol, {
      start: options.start,
      end: options.end,
      timeframe: options.timeframe || "1Day",
      limit: options.limit || 90,
    });

    for await (const bar of barIterator) {
      const b = bar as { ClosePrice?: number; c?: number; Volume?: number; v?: number };
      const close = b.ClosePrice ?? b.c;
      const volume = b.Volume ?? b.v;
      if (close !== undefined) {
        bars.push({ close, volume: volume ?? 0 });
      }
    }
    return bars;
  };

  return withTimeout(collectBars(), `getBars(${symbol})`);
}
