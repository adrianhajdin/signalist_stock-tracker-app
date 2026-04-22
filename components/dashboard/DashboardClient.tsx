'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';

import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TradeRow as SharedTradeRow } from '@/components/ui/trade-row';
import { StockLogo } from '@/components/StockLogo';
import { Badge } from '@/components/ui/badge';
import { ThesisRow, type ThesisRowData } from '@/components/ui/thesis-row';
import { OnboardingChecklist } from '@/components/domain/onboarding-checklist';
import { EmptyStateBg } from '@/components/domain/empty-state-bg';
import { ProductTourDialog } from '@/components/domain/onboarding-flow';
import { Button } from '@/components/ui/button';
import {
  mockOpenTrades,
  mockEquityCurve,
  mockPortfolio,
  type MockTrade,
} from '@/lib/mock-data/trades';
import type { DashboardData, RecentPick, ActivityFeedItem } from '@/lib/actions/portfolio.actions';
import { useTradeRealtime, type RealtimeTrade } from '@/hooks/useTradeRealtime';
import { toast } from 'sonner';
import { cn, PNL_HEX } from '@/lib/utils';
import { formatCurrency, formatDateLabel } from '@/lib/format';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGES = ['1D', '1W', '1M', '1Y', 'Max'] as const;
type Range = (typeof RANGES)[number];

const RANGE_DAYS: Record<Range, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
  Max: 99999,
};

type ChartView = 'portfolio' | 'by-analyst' | 'vs-spy';
type DisplayMode = 'dollar' | 'percent';
type ShowMode = 'both' | 'realized' | 'unrealized';

const ANALYST_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#f43f5e',
  '#8b5cf6',
  '#06b6d4',
];

const TICK_STYLE = { fontSize: 9, fill: '#71717a', fontFamily: 'var(--font-mono)' };

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  fontSize: '12px',
  color: 'var(--popover-foreground)',
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

function cutoffMs(range: Range) {
  return Date.now() - RANGE_DAYS[range] * 86_400_000;
}

function filterByRange<T extends { date: string }>(data: T[], range: Range): T[] {
  const ms = cutoffMs(range);
  const filtered = data.filter((d) => new Date(d.date + 'T12:00:00').getTime() >= ms);
  return filtered.length > 1 ? filtered : data.slice(-2);
}

/**
 * Build wide-format multi-analyst chart data with index keys (a0, a1, ...).
 * Normalizes each curve as % of $100K starting capital to avoid division-by-zero.
 */
function buildAnalystCompareData(
  analysts: { id: string; name: string }[],
  curves: Record<string, { date: string; value: number }[]>,
  range: Range,
): Record<string, number | string>[] {
  if (analysts.length === 0) return [];

  const maps = new Map<string, Map<string, number>>();
  for (let i = 0; i < analysts.length; i++) {
    const raw = filterByRange(curves[analysts[i].id] ?? [], range);
    if (raw.length === 0) continue;
    const m = new Map<string, number>();
    for (const pt of raw) {
      m.set(pt.date, (pt.value / 100_000) * 100);
    }
    maps.set(`a${i}`, m);
  }
  if (maps.size === 0) return [];

  const allDates = new Set<string>();
  for (const m of maps.values()) for (const d of m.keys()) allDates.add(d);
  const sortedDates = [...allDates].sort();

  return sortedDates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const [key, m] of maps.entries()) {
      const v = m.get(date);
      if (v !== undefined) row[key] = v;
    }
    return row;
  });
}

/**
 * Build two-line % comparison: portfolio vs SPY.
 */
function buildSpyCompareData(
  equityCurve: { date: string; value: number }[],
  spyCandles: { date: string; close: number }[],
  range: Range,
): { date: string; portfolio: number; spy: number }[] {
  const portSlice = filterByRange(equityCurve, range);
  const spySlice = filterByRange(spyCandles.map((c) => ({ date: c.date, value: c.close })), range);
  if (portSlice.length < 2 || spySlice.length < 2) return [];

  const portBase = portSlice[0].value;
  const spyBase = spySlice[0].value;
  if (portBase === 0 || spyBase === 0) return [];

  const spyMap = new Map(spySlice.map((d) => [d.date, d.value]));

  return portSlice
    .filter((d) => spyMap.has(d.date))
    .map((d) => ({
      date: d.date,
      portfolio: ((d.value - portBase) / portBase) * 100,
      spy: ((spyMap.get(d.date)! - spyBase) / spyBase) * 100,
    }));
}

// ─── Home bottom section (Theses + Activity tabs) ────────────────────────────

type ThesisTabFilter = 'all' | 'open' | 'passed';
type ActivityTabFilter = 'all' | 'opens' | 'closes' | 'updates';

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return '1d ago';
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (d.toDateString() === today) return 'Today';
  if (d.toDateString() === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupActivityByDay(items: ActivityFeedItem[]) {
  const groups: { label: string; items: ActivityFeedItem[] }[] = [];
  for (const item of items) {
    const lbl = dayLabel(item.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === lbl) { last.items.push(item); }
    else { groups.push({ label: lbl, items: [item] }); }
  }
  return groups;
}

// Mirrors ACTION_STATUS from decision-summary-card.tsx
const ACTIVITY_ACTION_STATUS: Record<string, { label: string; dotClass: string; tooltip: string }> = {
  INITIATE: { label: 'Bought',        dotClass: 'bg-positive',                tooltip: 'New position opened' },
  SHORT:    { label: 'Shorted',       dotClass: 'bg-negative',                tooltip: 'Short position opened' },
  ADD:      { label: 'Add',           dotClass: 'bg-positive',                tooltip: 'Added to existing position' },
  REDUCE:   { label: 'Reduce',        dotClass: 'bg-amber-500',               tooltip: 'Trimmed position size' },
  EXIT:     { label: 'Sold',          dotClass: 'bg-muted-foreground/60',     tooltip: 'Position closed' },
  HOLD:     { label: 'Hold',          dotClass: 'bg-muted-foreground/40',     tooltip: 'Monitoring — no action taken' },
  WATCH:    { label: 'Watch',         dotClass: 'bg-blue-500',                tooltip: 'Added to watchlist' },
  STOP:     { label: 'Stop Moved',    dotClass: 'bg-amber-500',               tooltip: 'Stop loss level adjusted' },
  NEAR_TGT: { label: 'Near Target',   dotClass: 'bg-positive',                tooltip: 'Price approaching target' },
  NEAR_STP: { label: 'Near Stop',     dotClass: 'bg-negative',                tooltip: 'Price approaching stop loss' },
};

function getDecisionAction(item: ActivityFeedItem): string {
  if (item.type === 'OPENED') return item.direction === 'SHORT' ? 'SHORT' : 'INITIATE';
  if (item.type === 'CLOSED') return 'EXIT';
  const lbl = item.label.toLowerCase();
  if (lbl.includes('partial') || lbl.includes('reduc')) return 'REDUCE';
  if (lbl.includes('add')) return 'ADD';
  if (lbl.includes('near target') || lbl.includes('approaching target')) return 'NEAR_TGT';
  if (lbl.includes('near stop') || lbl.includes('approaching stop')) return 'NEAR_STP';
  if (lbl.includes('stop')) return 'STOP';
  if (lbl.includes('watch')) return 'WATCH';
  return 'HOLD';
}

function getActivitySentence(item: ActivityFeedItem): string {
  const src = item.source === 'price_monitor' ? 'price monitor' : item.source === 'user' ? 'you' : 'the agent';
  if (item.type === 'OPENED') {
    return item.direction === 'SHORT'
      ? `Short position opened in ${item.symbol} by ${src}.`
      : `Long position opened in ${item.symbol} by ${src}.`;
  }
  if (item.type === 'CLOSED') {
    if (item.pnl != null) {
      const sign = item.pnl >= 0 ? '+' : '';
      const amt = `${sign}$${Math.abs(item.pnl).toFixed(2)}`;
      const pct = item.pnlPct != null ? ` (${sign}${item.pnlPct.toFixed(1)}%)` : '';
      return item.pnl >= 0
        ? `Closed for a profit of ${amt}${pct} by ${src}.`
        : `Closed at a loss of ${amt}${pct} by ${src}.`;
    }
    return `Position closed by ${src}.`;
  }
  if (item.reason) return `${item.reason} (via ${src}).`;
  return `${item.label} via ${src}.`;
}

function pickToThesisRow(pick: RecentPick): ThesisRowData {
  return {
    id: pick.id,
    ticker: pick.ticker,
    direction: pick.direction,
    confidenceScore: pick.confidenceScore,
    reasoningSummary: pick.reasoningSummary,
    entryPrice: pick.entryPrice,
    targetPrice: pick.targetPrice,
    stopLoss: pick.stopLoss,
    createdAt: pick.position?.openedAt ?? pick.createdAt,
    currentPrice: pick.currentPrice,
    companyName: pick.companyName,
    analystName: pick.analystName,
    analystId: pick.analystId,
    runId: pick.runId,
    sourcesUsed: pick.sourcesUsed,
    decision: pick.decision,
    position: pick.position
      ? {
          id: pick.position.id,
          status: pick.position.status,
          tradeStatus: pick.position.tradeStatus,
          avgCost: pick.position.avgCost,
          quantity: pick.position.quantity,
          openedAt: pick.position.openedAt,
          filledAt: pick.position.filledAt,
          placedAt: pick.position.placedAt,
        }
      : null,
  };
}


function ActivityRow({ item }: { item: ActivityFeedItem }) {
  const actionKey = getDecisionAction(item);
  const status = ACTIVITY_ACTION_STATUS[actionKey] ?? ACTIVITY_ACTION_STATUS.HOLD;
  const sentence = getActivitySentence(item);
  const hasPnl = item.type === 'CLOSED' && item.pnl != null;
  const pnlPos = (item.pnl ?? 0) >= 0;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Link
            href={`/trades/${item.positionId}`}
            className="flex items-center gap-1.5 rounded-md p-2 hover:bg-muted/70 transition-colors"
          />
        }
      >
        <StockLogo ticker={item.symbol} size="sm" />
        <span className="text-sm font-semibold font-brand shrink-0 mr-1">{item.symbol}</span>
        <Badge variant="secondary" className="gap-1.5 font-normal shrink-0">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', status.dotClass)} />
          {status.label}
        </Badge>
        {/* Right side: P&L for sells, reasoning text for everything else */}
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
          {hasPnl && (
            <span className={cn('text-xs tabular-nums font-medium shrink-0', pnlPos ? 'text-positive' : 'text-negative')}>
              {pnlPos ? '+' : ''}${Math.abs(item.pnl!).toFixed(2)}
              {item.pnlPct != null && <span className="opacity-70"> ({pnlPos ? '+' : ''}{item.pnlPct.toFixed(1)}%)</span>}
            </span>
          )}
          <span className="text-xs text-muted-foreground truncate hidden sm:block">{sentence}</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <StockLogo ticker={item.symbol} size="md" />
            <span className="text-base font-semibold font-brand">{item.symbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', status.dotClass)} />
              {status.label}
            </Badge>
            {hasPnl && (
              <span className={cn('text-xs tabular-nums font-medium', pnlPos ? 'text-positive' : 'text-negative')}>
                {pnlPos ? '+' : ''}${Math.abs(item.pnl!).toFixed(2)}
                {item.pnlPct != null && <> ({pnlPos ? '+' : ''}{item.pnlPct.toFixed(1)}%)</>}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{sentence}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function HomeBottomSection({ picks, activity, loading }: {
  picks: RecentPick[];
  activity: ActivityFeedItem[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<'theses' | 'activity'>('theses');
  const [thesisFilter, setThesisFilter] = useState<ThesisTabFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityTabFilter>('all');
  const [showTour, setShowTour] = useState(false);

  const filteredPicks = picks.filter((p) => {
    if (thesisFilter === 'open') return p.position?.status === 'OPEN';
    if (thesisFilter === 'passed') return p.direction === 'PASS' || (!p.position && p.decision !== 'BUY');
    return true;
  });

  const filteredActivity = activity.filter((a) => {
    if (activityFilter === 'opens') return a.type === 'OPENED';
    if (activityFilter === 'closes') return a.type === 'CLOSED';
    if (activityFilter === 'updates') return a.type === 'MODIFIED';
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-0">
      {/* Tab bar + filter dropdown */}
      <div className="flex items-center justify-between pb-3">
        <TabsList>
          <TabsTrigger value="theses">Theses</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <div>
          {tab === 'theses' ? (
            <Select value={thesisFilter} onValueChange={(v) => setThesisFilter(v as ThesisTabFilter)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as ActivityTabFilter)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="opens">Opens</SelectItem>
                <SelectItem value="closes">Closes</SelectItem>
                <SelectItem value="updates">Updates</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Theses list */}
      <TabsContent value="theses">
        {picks.length === 0 ? (
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl py-24 px-4">
            <div
              className="absolute inset-0"
              style={{
                maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent), linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)',
                maskComposite: 'intersect',
                WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent), linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)',
                WebkitMaskComposite: 'source-in',
              }}
            >
              <EmptyStateBg />
            </div>
            <div className="relative z-10 flex flex-col items-center gap-3">
              <p className="text-base font-medium text-center">Theses for your Stocks appear after Agents run</p>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Your analyst will research stocks, generate theses, and place paper trades autonomously.
              </p>
              <div className="flex items-center gap-2">
                <Link href="/analysts" className="inline-flex items-center justify-center h-8 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted">
                  Create an Analyst
                </Link>
                <Button variant="ghost" size="sm" onClick={() => setShowTour(true)}>Product Overview</Button>
              </div>
              <ProductTourDialog open={showTour} onOpenChange={setShowTour} />
            </div>
          </div>
        ) : filteredPicks.length === 0 ? (
          <Card className="shadow-none">
            <CardContent className="py-8 flex justify-center">
              <p className="text-sm text-muted-foreground">No theses match this filter.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredPicks.map((pick) => (
              <ThesisRow key={pick.id} thesis={pickToThesisRow(pick)} showTicker={true} />
            ))}
          </div>
        )}
      </TabsContent>

      {/* Activity list */}
      <TabsContent value="activity">
        {activity.length === 0 ? (
          <Card className="shadow-none">
            <CardContent className="py-8 flex flex-col items-center gap-1">
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/60">Trades and position changes appear here as analysts run.</p>
            </CardContent>
          </Card>
        ) : filteredActivity.length === 0 ? (
          <Card className="shadow-none">
            <CardContent className="py-8 flex justify-center">
              <p className="text-sm text-muted-foreground">No activity matches this filter.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {groupActivityByDay(filteredActivity).map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60 px-1 pb-1.5">{group.label}</p>
                <Card className="p-1 gap-1">
                  {group.items.map((item) => <ActivityRow key={item.id} item={item} />)}
                </Card>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}


function DashboardTradeRow({ trade, flash }: { trade: MockTrade; flash?: 'win' | 'loss' }) {
  return (
    <SharedTradeRow
      id={trade.id}
      ticker={trade.ticker}
      currentPrice={trade.currentPrice}
      entryPrice={trade.entryPrice}
      shares={trade.shares}
      pnl={trade.pnl ?? 0}
      pnlPct={trade.pnlPct ?? 0}
      status={trade.status}
      placedAt={trade.placedAt}
      filledAt={trade.filledAt}
      closedAt={trade.closedAt}
      priceSource={trade.priceSource}
      priceUpdatedAt={trade.priceUpdatedAt}
      alpacaOrderId={trade.alpacaOrderId}
      flash={flash}
    />
  );
}

function Empty({ text, subtext }: { text: string; subtext?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-1.5 px-4">
      <p className="text-sm text-muted-foreground text-center">{text}</p>
      {subtext && (
        <p className="text-xs text-muted-foreground/60 text-center">{subtext}</p>
      )}
    </div>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="h-52 flex items-center justify-center">
      <p className="text-xs text-muted-foreground text-center max-w-xs px-4">{text}</p>
    </div>
  );
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

interface DashboardClientProps {
  data?: DashboardData;
  userId?: string;
}

export default function DashboardClient({ data, userId }: DashboardClientProps) {
  const [range, setRange] = useState<Range>('1M');
  const [chartView, setChartView] = useState<ChartView>('portfolio');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('dollar');
  const [showMode, setShowMode] = useState<ShowMode>('both');
  const [realtimeClosedIds, setRealtimeClosedIds] = useState<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Map<string, 'win' | 'loss'>>(new Map());

  const handlePositionUpdate = useCallback((position: RealtimeTrade) => {
    if (position.status === 'CLOSED' || position.status.startsWith('CLOSED_')) {
      const result = position.outcome === 'WIN' ? 'win' : 'loss';
      setFlashIds((prev) => new Map(prev).set(position.id, result));
      toast[result === 'win' ? 'success' : 'error'](
        `${position.symbol} closed — ${result === 'win' ? '✅ WIN' : '❌ LOSS'}`,
        {
          description:
            position.realizedPnl != null
              ? `P&L: $${position.realizedPnl.toFixed(2)}`
              : undefined,
        },
      );
      setTimeout(() => {
        setFlashIds((prev) => {
          const m = new Map(prev);
          m.delete(position.id);
          return m;
        });
        setRealtimeClosedIds((prev) => new Set(prev).add(position.id));
      }, 1200);
    }
  }, []);

  useTradeRealtime({ userId: userId ?? '', onPositionUpdate: handlePositionUpdate });

  // ── Raw data ────────────────────────────────────────────────────────────────
  const openTrades = (data?.openTrades ?? mockOpenTrades).filter(
    (t) => !realtimeClosedIds.has(t.id),
  );
  const closedTrades = data?.closedTrades ?? [];
  const analysts = data?.analysts ?? [];
  const analystEquityCurves = data?.analystEquityCurves ?? {};
  const spyBenchmark = data?.spyBenchmark ?? { '1W': null, '1M': null, '1Y': null };
  const spyCandles = data?.spyCandles ?? [];
  const recentPicks = data?.recentPicks ?? [];

  const rawEquity = data && data.equityCurve.length > 0 ? data.equityCurve : mockEquityCurve;
  const rawRealizedCurve = data?.realizedCurve ?? rawEquity;

  // Derive the active equity curve based on showMode
  const activeCurve = useMemo(() => {
    if (showMode === 'realized') return rawRealizedCurve;
    if (showMode === 'unrealized') {
      // unrealizedPnl at each date = total equity - (startCapital + realizedPnl)
      // realizedCurve[i].value = startCapital + realizedPnl_at_date
      // equityCurve[i].value   = startCapital + realizedPnl + unrealizedPnl
      // → unrealizedPnl = equityCurve - realizedCurve
      // → unrealizedCurve.value = startCapital + unrealizedPnl
      const startCapital = rawRealizedCurve.length > 0 ? rawRealizedCurve[0].value : 100_000;
      const realizedMap = new Map(rawRealizedCurve.map((p) => [p.date, p.value]));
      return rawEquity.map((p) => {
        const realized = realizedMap.get(p.date) ?? startCapital;
        const unrealizedPnl = p.value - realized;
        return { date: p.date, value: startCapital + unrealizedPnl };
      });
    }
    return rawEquity; // 'both' — total equity from Alpaca
  }, [showMode, rawEquity, rawRealizedCurve]);

  const portfolio = data?.portfolio ?? {
    totalValue: mockPortfolio.totalValue,
    unrealizedPnl: mockPortfolio.dayChange,
    realizedPnl: mockPortfolio.totalPnl,
    winRate: 0.6,
    openCount: mockOpenTrades.length,
  };

  // ── Chart data (memoized) ───────────────────────────────────────────────────
  const portfolioData = useMemo(
    () => filterByRange(activeCurve, range),
    [activeCurve, range],
  );

  // ── Portfolio header values ─────────────────────────────────────────────────
  const totalValueStr = formatCurrency(portfolio.totalValue);
  const winRateStr =
    portfolio.winRate != null
      ? `${(portfolio.winRate * 100).toFixed(0)}% win rate`
      : null;

  // Range-aware P&L: delta over the selected range from the active (filtered) curve
  const rangePnl = portfolioData.length >= 2
    ? portfolioData[portfolioData.length - 1].value - portfolioData[0].value
    : portfolio.unrealizedPnl + portfolio.realizedPnl;
  const rangePnlBase = portfolioData.length >= 2 ? portfolioData[0].value : null;
  const rangePnlPct = rangePnlBase && rangePnlBase > 0
    ? (rangePnl / rangePnlBase) * 100
    : 0;
  const pnlPositive = rangePnl >= 0;

  const spyPct: number | null =
    range === '1W' ? spyBenchmark['1W']
    : range === '1M' ? spyBenchmark['1M']
    : range === '1Y' ? spyBenchmark['1Y']
    : null;

  // % return from first data point in the selected range
  const portfolioPercentData = useMemo(() => {
    if (portfolioData.length < 2) return portfolioData;
    const base = portfolioData[0].value;
    if (base === 0) return portfolioData.map((d) => ({ ...d, value: 0 }));
    return portfolioData.map((d) => ({
      date: d.date,
      value: ((d.value - base) / base) * 100,
    }));
  }, [portfolioData]);

  const activePortfolioData = displayMode === 'percent' ? portfolioPercentData : portfolioData;

  const analystCompareData = useMemo(
    () => buildAnalystCompareData(analysts, analystEquityCurves, range),
    [analysts, analystEquityCurves, range],
  );

  const spyCompareData = useMemo(
    () => buildSpyCompareData(rawEquity, spyCandles, range),
    [rawEquity, spyCandles, range],
  );

  // ── Chart visuals ───────────────────────────────────────────────────────────
  // strokeColor is derived from pnlPositive (same range delta) so chart and header always agree
  const strokeColor = pnlPositive ? PNL_HEX.positive : PNL_HEX.negative;

  const analystChartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    analysts.forEach((analyst, i) => {
      cfg[`a${i}`] = {
        label: analyst.name,
        color: ANALYST_COLORS[i % ANALYST_COLORS.length],
      };
    });
    return cfg;
  }, [analysts]);

  const spyChartConfig = useMemo<ChartConfig>(
    () => ({
      portfolio: { label: 'Portfolio', color: strokeColor },
      spy: { label: 'S&P 500', color: '#71717a' },
    }),
    [strokeColor],
  );

  const loading = !data;

  const hasPortfolioData = activePortfolioData.length >= 2;
  const hasAnalystData = analystCompareData.length >= 2 && analysts.length >= 1;
  const hasSpyData = spyCompareData.length >= 2;

  const effectiveView: ChartView =
    chartView === 'by-analyst' && analysts.length === 0 ? 'portfolio'
    : chartView === 'vs-spy' && spyCandles.length === 0 ? 'portfolio'
    : chartView;

  return (
    <div className="overflow-y-auto h-[calc(100dvh-3rem)]">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6 items-start">

          {/* ══ LEFT column ══════════════════════════════════════════════════ */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Portfolio header */}
            <div className="space-y-1">
              {loading ? (
                <>
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-5 w-64" />
                </>
              ) : (
                <>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight">
                    {totalValueStr}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm tabular-nums flex items-center gap-1">
                      <span className={pnlPositive ? 'text-positive' : 'text-negative'}>
                        {pnlPositive ? '+' : '-'}${Math.abs(rangePnl).toFixed(2)}{' '}
                        ({pnlPositive ? '+' : ''}{rangePnlPct.toFixed(2)}%)
                      </span>
                      {winRateStr && (
                        <>
                          <span className="text-muted-foreground mx-0.5">—</span>
                          <span className="text-muted-foreground">{winRateStr}</span>
                        </>
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Chart card */}
            <div
              className="rounded-lg overflow-hidden border"
              style={{
                backgroundImage:
                  'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
                backgroundSize: '18px 18px',
                backgroundColor: 'hsl(var(--muted)/0.3)',
              }}
            >
              {/* Controls: range tabs (left) + settings dropdown (right) */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2">
                {/* Range tabs */}
                <div className="flex items-center gap-0.5 bg-background/80 backdrop-blur-sm rounded-md border px-1 py-0.5">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={cn(
                        'px-2 py-0.5 text-xs rounded transition-colors',
                        range === r
                          ? 'bg-muted text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {/* Settings dropdown */}
                {!loading && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" />}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>View</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={effectiveView}
                          onValueChange={(v) => setChartView(v as ChartView)}
                        >
                          <DropdownMenuRadioItem value="portfolio">Portfolio</DropdownMenuRadioItem>
                          {analysts.length > 0 && (
                            <DropdownMenuRadioItem value="by-analyst">By Analyst</DropdownMenuRadioItem>
                          )}
                          {spyCandles.length > 0 && (
                            <DropdownMenuRadioItem value="vs-spy">vs S&amp;P 500</DropdownMenuRadioItem>
                          )}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuGroup>
                      {effectiveView === 'portfolio' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>Show</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={showMode}
                              onValueChange={(v) => setShowMode(v as ShowMode)}
                            >
                              <DropdownMenuRadioItem value="both">Total (Realized + Unrealized)</DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="realized">Realized Only</DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="unrealized">Unrealized Only</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>Display</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={displayMode}
                              onValueChange={(v) => setDisplayMode(v as DisplayMode)}
                            >
                              <DropdownMenuRadioItem value="dollar">$ Value</DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="percent">% Return</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Chart render */}
              {loading ? (
                <div className="h-[260px] flex items-center justify-center">
                  <Skeleton className="h-1 w-3/4 rounded-full" />
                </div>
              ) : effectiveView === 'portfolio' ? (
                !hasPortfolioData ? (
                  <ChartEmpty text="The equity chart tracks portfolio value over time as trades open and close." />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart
                      data={activePortfolioData}
                      margin={{ top: 4, right: 0, bottom: 0, left: displayMode === 'percent' ? 4 : 0 }}
                    >
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatDateLabel(v).toUpperCase()}
                        interval={Math.max(1, Math.floor(activePortfolioData.length / 6))}
                        padding={{ left: 0, right: 0 }}
                      />
                      {displayMode === 'percent' ? (
                        <YAxis
                          tick={TICK_STYLE}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                          width={44}
                          domain={['dataMin', 'dataMax']}
                        />
                      ) : (
                        <YAxis hide domain={['dataMin * 0.999', 'dataMax * 1.001']} />
                      )}
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v) => [
                          displayMode === 'dollar'
                            ? `$${Number(v).toLocaleString()}`
                            : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`,
                          'Portfolio',
                        ]}
                        labelFormatter={(l: unknown) => formatDateLabel(String(l))}
                        labelStyle={{ color: 'var(--muted-foreground)' }}
                        itemStyle={{ color: 'var(--foreground)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={strokeColor}
                        strokeWidth={1.5}
                        fill="url(#eqGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: strokeColor }}
                        baseValue="dataMin"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )
              ) : effectiveView === 'by-analyst' ? (
                !hasAnalystData ? (
                  <ChartEmpty text="Not enough trade history to compare analysts yet." />
                ) : (
                  <ChartContainer config={analystChartConfig} className="h-[260px] w-full">
                    <LineChart
                      data={analystCompareData}
                      margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        dataKey="date"
                        tick={TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatDateLabel(String(v)).toUpperCase()}
                        interval={Math.max(1, Math.floor(analystCompareData.length / 6))}
                        padding={{ left: 8, right: 8 }}
                      />
                      <YAxis
                        tick={TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                        width={48}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={TOOLTIP_STYLE} className="grid min-w-36 gap-1 rounded-lg px-2.5 py-1.5">
                              <p className="text-xs text-muted-foreground">{formatDateLabel(String(label))}</p>
                              {payload.map((item) => {
                                const key = item.dataKey as string;
                                const name = (analystChartConfig[key]?.label as string) ?? key;
                                const pct = Number(item.value);
                                return (
                                  <div key={key} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                      <span className="text-xs text-muted-foreground">{name}</span>
                                    </div>
                                    <span className="text-xs font-mono font-medium tabular-nums text-foreground">
                                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      <ChartLegend
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          return (
                            <div className="flex items-center justify-center gap-2.5 pt-2">
                              {payload.filter((item) => item.type !== 'none').map((item) => {
                                const key = item.dataKey as string;
                                const label = (analystChartConfig[key]?.label as string) ?? key;
                                return (
                                  <div key={key} title={label} className="h-2 w-2 rounded-full cursor-default" style={{ backgroundColor: item.color }} />
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      {analysts.map((_, i) => (
                        <Line
                          key={`a${i}`}
                          type="monotone"
                          dataKey={`a${i}`}
                          stroke={`var(--color-a${i})`}
                          strokeWidth={1.5}
                          dot={false}
                          activeDot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                )
              ) : (
                !hasSpyData ? (
                  <ChartEmpty text="Not enough data to compare against S&P 500 for this range." />
                ) : (
                  <ChartContainer config={spyChartConfig} className="h-[260px] w-full">
                    <LineChart
                      data={spyCompareData}
                      margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        dataKey="date"
                        tick={TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatDateLabel(String(v)).toUpperCase()}
                        interval={Math.max(1, Math.floor(spyCompareData.length / 6))}
                        padding={{ left: 8, right: 8 }}
                      />
                      <YAxis
                        tick={TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                        width={48}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={TOOLTIP_STYLE} className="grid min-w-32 gap-1 rounded-lg px-2.5 py-1.5">
                              <p className="text-xs text-muted-foreground">{formatDateLabel(String(label))}</p>
                              {payload.map((item) => {
                                const pct = Number(item.value);
                                const name = item.dataKey === 'portfolio' ? 'Portfolio' : 'S&P 500';
                                return (
                                  <div key={item.dataKey as string} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                      <span className="text-xs text-muted-foreground">{name}</span>
                                    </div>
                                    <span className="text-xs font-mono font-medium tabular-nums text-foreground">
                                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Line
                        type="monotone"
                        dataKey="portfolio"
                        stroke="var(--color-portfolio)"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="spy"
                        stroke="var(--color-spy)"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                    </LineChart>
                  </ChartContainer>
                )
              )}
            </div>

            {/* Theses + Activity tabbed section */}
            <HomeBottomSection
              picks={recentPicks}
              activity={data?.activityFeed ?? []}
              loading={loading}
            />
          </div>

          {/* ══ RIGHT column — positions ═══════════════════════════════════ */}
          <div className="hidden lg:block w-80 shrink-0">
            <Tabs defaultValue="open" className="gap-0">
              <TabsList variant="line" className="w-auto self-start px-0">
                <TabsTrigger value="open" className="px-0 mr-4">
                  Open
                  {openTrades.length > 0 && (
                    <span className="ml-1.5 text-[10px] tabular-nums opacity-60">
                      {openTrades.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="closed" className="px-0">
                  Closed
                  {closedTrades.length > 0 && (
                    <span className="ml-1.5 text-[10px] tabular-nums opacity-60">
                      {closedTrades.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <Card className="shadow-none p-0">
                <CardContent className="p-0">
                  <TabsContent value="open" className="mt-0">
                    {loading ? (
                      <div className="space-y-1 px-4 pt-1 pb-2">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-14 rounded-lg" />
                        ))}
                      </div>
                    ) : openTrades.length === 0 ? (
                      <Empty
                        text="No open positions"
                        subtext="Positions appear when an analyst places a paper trade during a run."
                      />
                    ) : (
                      <div>
                        {openTrades.map((t) => (
                          <DashboardTradeRow
                            key={t.id}
                            trade={t}
                            flash={flashIds.get(t.id)}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="closed" className="mt-0">
                    {closedTrades.length === 0 ? (
                      <Empty
                        text="No closed trades yet"
                        subtext="Trades close when they hit a target, stop-loss, or manual exit."
                      />
                    ) : (
                      <div>
                        {closedTrades.map((t) => (
                          <DashboardTradeRow key={t.id} trade={t} />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </CardContent>
              </Card>
            </Tabs>
          </div>

        </div>
      </div>

      {!loading && (
        <OnboardingChecklist
          hasAlpacaKey={data?.hasAlpacaKey ?? false}
          hasAnalyst={(data?.analystCount ?? 0) > 0}
          hasCompletedRun={data?.hasCompletedRun ?? false}
          hasBrief={data?.hasBrief ?? false}
        />
      )}
    </div>
  );
}
