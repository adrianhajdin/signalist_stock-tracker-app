// Mock data — structure matches the real Prisma Position schema shape for easy swap-in

export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus =
  | 'OPEN'
  | 'PENDING'
  | 'CLOSED_WIN'
  | 'CLOSED_LOSS'
  | 'CLOSED_EXPIRED'
  | 'CANCELLED'
  | 'REJECTED';
export type PriceSource = 'alpaca' | 'finnhub' | 'missing';

export interface MockTrade {
  id: string;
  ticker: string;
  companyName?: string;
  direction: TradeDirection;
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopPrice: number;
  confidenceScore: number; // 0–100
  status: TradeStatus;
  pnl: number;
  pnlPct: number;
  openedAt: string;
  closedAt?: string;
  thesis: string;
  shares?: number;
  analystName?: string;
  analystId?: string;
  alpacaOrderId?: string;

  // ── Order lifecycle (derived from latest Order row) ───────────────────────
  /** When the latest order was submitted to Alpaca */
  placedAt?: string;
  /** When the latest order filled — undefined if still pending */
  filledAt?: string;
  /** Raw latest Order.status: PENDING | FILLED | CANCELLED | REJECTED */
  orderStatus?: string;

  // ── Price freshness metadata ──────────────────────────────────────────────
  priceSource?: PriceSource;
  priceUpdatedAt?: string;
}

export const mockOpenTrades: MockTrade[] = [
  {
    id: '1',
    ticker: 'NVDA',
    companyName: 'NVIDIA Corp',
    direction: 'LONG',
    entryPrice: 875.00,
    currentPrice: 921.00,
    targetPrice: 950.00,
    stopPrice: 840.00,
    confidenceScore: 82,
    status: 'OPEN',
    pnl: 46.00,
    pnlPct: 5.26,
    openedAt: '2026-03-01',
    thesis: 'AI chip demand accelerating into data center build-out cycle.',
  },
  {
    id: '2',
    ticker: 'TSLA',
    companyName: 'Tesla Inc',
    direction: 'SHORT',
    entryPrice: 245.00,
    currentPrice: 231.00,
    targetPrice: 215.00,
    stopPrice: 260.00,
    confidenceScore: 71,
    status: 'OPEN',
    pnl: 14.00,
    pnlPct: 5.71,
    openedAt: '2026-03-03',
    thesis: 'Deliveries miss expected in Q1; margin pressure from price cuts.',
  },
  {
    id: '3',
    ticker: 'AAPL',
    companyName: 'Apple Inc',
    direction: 'LONG',
    entryPrice: 195.00,
    currentPrice: 198.00,
    targetPrice: 210.00,
    stopPrice: 188.00,
    confidenceScore: 68,
    status: 'OPEN',
    pnl: 3.00,
    pnlPct: 1.54,
    openedAt: '2026-03-05',
    thesis: 'Services revenue inflection + India manufacturing ramp.',
  },
];

export const mockClosedTrades: MockTrade[] = [
  {
    id: '4',
    ticker: 'META',
    companyName: 'Meta Platforms',
    direction: 'LONG',
    entryPrice: 510.00,
    currentPrice: 562.00,
    targetPrice: 560.00,
    stopPrice: 490.00,
    confidenceScore: 79,
    status: 'CLOSED_WIN',
    pnl: 52.00,
    pnlPct: 10.20,
    openedAt: '2026-02-10',
    closedAt: '2026-02-28',
    thesis: 'Ad revenue beat driven by Reels monetization.',
  },
  {
    id: '5',
    ticker: 'COIN',
    companyName: 'Coinbase Global',
    direction: 'LONG',
    entryPrice: 280.00,
    currentPrice: 251.00,
    targetPrice: 320.00,
    stopPrice: 255.00,
    confidenceScore: 61,
    status: 'CLOSED_LOSS',
    pnl: -29.00,
    pnlPct: -10.36,
    openedAt: '2026-02-12',
    closedAt: '2026-02-20',
    thesis: 'Bitcoin ETF inflows thesis failed on regulatory uncertainty.',
  },
  {
    id: '6',
    ticker: 'MSFT',
    companyName: 'Microsoft Corp',
    direction: 'LONG',
    entryPrice: 420.00,
    currentPrice: 448.00,
    targetPrice: 450.00,
    stopPrice: 405.00,
    confidenceScore: 85,
    status: 'CLOSED_WIN',
    pnl: 28.00,
    pnlPct: 6.67,
    openedAt: '2026-02-01',
    closedAt: '2026-02-15',
    thesis: 'Copilot adoption inflection in Azure cloud segment.',
  },
  {
    id: '7',
    ticker: 'AMD',
    companyName: 'Advanced Micro Devices',
    direction: 'LONG',
    entryPrice: 175.00,
    currentPrice: 162.00,
    targetPrice: 200.00,
    stopPrice: 162.00,
    confidenceScore: 66,
    status: 'CLOSED_LOSS',
    pnl: -13.00,
    pnlPct: -7.43,
    openedAt: '2026-01-20',
    closedAt: '2026-02-05',
    thesis: 'MI300X share gain thesis stopped out on inventory overhang.',
  },
  {
    id: '8',
    ticker: 'AMZN',
    companyName: 'Amazon.com',
    direction: 'LONG',
    entryPrice: 208.00,
    currentPrice: 229.00,
    targetPrice: 230.00,
    stopPrice: 195.00,
    confidenceScore: 77,
    status: 'CLOSED_WIN',
    pnl: 21.00,
    pnlPct: 10.10,
    openedAt: '2026-01-15',
    closedAt: '2026-01-30',
    thesis: 'AWS re-acceleration + retail margin expansion.',
  },
  {
    id: '9',
    ticker: 'SNAP',
    companyName: 'Snap Inc',
    direction: 'SHORT',
    entryPrice: 12.50,
    currentPrice: 14.20,
    targetPrice: 9.00,
    stopPrice: 14.00,
    confidenceScore: 58,
    status: 'CLOSED_LOSS',
    pnl: -17.00,
    pnlPct: -13.60,
    openedAt: '2026-01-08',
    closedAt: '2026-01-14',
    thesis: 'Ad revenue decline and user growth stagnation — stop hit on short squeeze.',
  },
  {
    id: '10',
    ticker: 'NFLX',
    companyName: 'Netflix Inc',
    direction: 'LONG',
    entryPrice: 890.00,
    currentPrice: 895.00,
    targetPrice: 960.00,
    stopPrice: 850.00,
    confidenceScore: 64,
    status: 'CLOSED_EXPIRED',
    pnl: 5.00,
    pnlPct: 0.56,
    openedAt: '2026-01-02',
    closedAt: '2026-01-16',
    thesis: 'Ad-supported tier monetization — thesis expired without reaching target or stop.',
  },
];

// Portfolio summary derived from positions
export const mockPortfolio = {
  totalValue: 100_000 + mockOpenTrades.reduce((sum, t) => sum + t.pnl, 0) * 100,
  dayChange: 312.50,
  dayChangePct: 0.31,
  totalPnl: mockOpenTrades.reduce((sum, t) => sum + t.pnl, 0),
  totalPnlPct: 3.86,
};

// Equity curve — 30 days of mock portfolio values
export const mockEquityCurve = Array.from({ length: 30 }, (_, i) => {
  const date = new Date('2026-02-07');
  date.setDate(date.getDate() + i);
  const base = 100_000;
  const noise = Math.sin(i * 0.4) * 800 + Math.random() * 400;
  const trend = i * 120;
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: Math.round(base + trend + noise),
  };
});

// Mock watchlist tickers
export const mockWatchlist = [
  { ticker: 'SPY', name: 'S&P 500 ETF', price: 584.20, changePct: 0.42 },
  { ticker: 'QQQ', name: 'Nasdaq-100 ETF', price: 492.80, changePct: 0.68 },
  { ticker: 'NVDA', name: 'NVIDIA Corp', price: 921.00, changePct: 1.82 },
  { ticker: 'TSLA', name: 'Tesla Inc', price: 231.00, changePct: -0.74 },
  { ticker: 'AAPL', name: 'Apple Inc', price: 198.00, changePct: 0.35 },
  { ticker: 'MSFT', name: 'Microsoft Corp', price: 448.00, changePct: 0.21 },
  { ticker: 'META', name: 'Meta Platforms', price: 596.40, changePct: 1.14 },
];
