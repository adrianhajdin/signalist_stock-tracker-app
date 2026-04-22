"use client";

import Link from "next/link";
import { useState, useMemo, useTransition } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalystConfigSheet } from "@/components/analysts/AnalystConfigSheet";
import { StockCombobox } from "@/components/analysts/StockCombobox";
import { StockLogo } from "@/components/StockLogo";
import { deleteAnalyst } from "@/lib/actions/analyst.actions";
import {
  addWatchlistItem,
  removeWatchlistItem,
  type WatchlistItemView,
} from "@/lib/actions/watchlist.actions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RunResearchButton } from "@/components/RunResearchButton";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { TeamSheetContent } from "@/components/domain/team-card";
import { getTeam } from "@/lib/agent/workflow-registry";
import { TradeRow } from "@/components/ui/trade-row";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { AnalystFindingsTab } from "@/components/analysts/AnalystFindingsTab";
import { BriefCard } from "@/components/intelligence/brief-card";
import { BriefDetailDialog } from "@/components/intelligence/brief-detail";
import { normalizeIntelBrief, normalizeRunBrief } from "@/components/intelligence/brief-types";
import type { UnifiedBrief } from "@/components/intelligence/brief-types";
import { TickerMarkdown } from "@/components/ui/ticker-markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Settings2,
  FileText,
  Eye,
  X,
  Pencil,
  Trash2,
  Loader2,
  EllipsisVertical,
  ScanSearch,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { EducationEmptyState } from "@/components/domain/education-card";
import { RunShowcaseTrigger } from "@/components/domain/run-showcase-trigger";
import { SkeletonCardStack } from "@/components/domain/skeleton-card";
import { RunShowcaseDialog } from "@/components/domain/showcase-dialog";
import { ShowcaseIcon } from "@/components/ui/showcase-icon";
import type {
  AnalystDetail,
  PositionWithThesis,
} from "@/lib/actions/analyst.actions";
import { cn, PNL_HEX, pnlBadgeClasses } from "@/lib/utils";
import { formatCurrency, formatDateLabel } from "@/lib/format";
import { useRouter } from "next/navigation";
import { ChatEntryComposer } from "@/components/assistant-ui/chat-entry-composer";

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANGES = ["1W", "1M", "3M", "1Y", "Max"] as const;
type Range = (typeof RANGES)[number];

const RANGE_DAYS: Record<Range, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  Max: 99999,
};

function sliceByRange(
  data: { date: string; value: number }[],
  range: Range,
) {
  const cutoffMs = Date.now() - RANGE_DAYS[range] * 86_400_000;
  const filtered = data.filter(
    (d) => new Date(d.date + "T12:00:00").getTime() >= cutoffMs,
  );
  return filtered.length > 1 ? filtered : data.slice(-2);
}

// ── Sidebar trade row (uses shared TradeRow component) ───────────────────────

function AnalystTradeRow({ trade, livePrice }: { trade: PositionWithThesis; livePrice?: number }) {
  const isOpen = trade.status === "OPEN";
  const currentPrice = isOpen ? (livePrice ?? trade.avgCost) : (trade.closePrice ?? trade.avgCost);
  const pnl = isOpen
    ? (currentPrice - trade.avgCost) * trade.quantity * (trade.direction === "SHORT" ? -1 : 1)
    : (trade.realizedPnl ?? 0);
  const price = currentPrice;
  // For closed trades use realizedPnl/cost-basis (works even when closePrice is null).
  // For open trades use price delta (only valid when we have a live price).
  const pnlPct = isOpen
    ? (trade.avgCost > 0
        ? ((price - trade.avgCost) / trade.avgCost) * 100 * (trade.direction === "SHORT" ? -1 : 1)
        : 0)
    : (trade.avgCost > 0 && trade.quantity > 0
        ? ((trade.realizedPnl ?? 0) / (trade.avgCost * trade.quantity)) * 100
        : 0);

  // Show P&L for closed trades always (realizedPnl from DB); for open trades only
  // when we have a live price (otherwise we'd show a stale entry-price delta as $0).
  const hasPnl = !isOpen || livePrice !== undefined;

  return (
    <TradeRow
      id={trade.id}
      ticker={trade.symbol}
      currentPrice={price}
      entryPrice={trade.avgCost}
      shares={trade.quantity}
      pnl={hasPnl ? pnl : 0}
      pnlPct={hasPnl ? pnlPct : 0}
      status={trade.status}
      openedAt={trade.openedAt}
      priceSource={isOpen ? (livePrice !== undefined ? "alpaca" : "missing") : undefined}
    />
  );
}

// ── Watching row for sidebar ──────────────────────────────────────────────────

function WatchingRow({
  item,
  onRemove,
}: {
  item: WatchlistItemView;
  onRemove: (symbol: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors border-b border-border/40 last:border-0 group">
      <Link href={`/stocks/${item.symbol}`} className="shrink-0">
        <StockLogo ticker={item.symbol} size="md" className="rounded-md" />
      </Link>
      <Link href={`/stocks/${item.symbol}`} className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{item.symbol}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {item.reason}
          </span>
        </div>
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); onRemove(item.symbol); }}
        className="p-1 rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Floating composer (redirects to editor page on send) ─────────────────

function FloatingEditorComposer({ analystId }: { analystId: string }) {
  return (
    <ChatEntryComposer
      targetUrl={`/analysts/${analystId}/edit`}
      queryParam="message"
      features={{
        placeholder: "Ask a question or suggest strategy changes…",
        tickerSearch: true,
        slashCommands: true,
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalystDetailClient({
  detail,
  hasRunning,
  initialWatchlist = [],
  livePrices = {},
}: {
  detail: AnalystDetail;
  hasRunning: boolean;
  initialWatchlist?: WatchlistItemView[];
  livePrices?: Record<string, number>;
}) {
  const { config: rawConfig, stats, recentTrades } = detail;

  // Defensive defaults for array fields that may be missing from older data
  const config = useMemo(() => ({
    ...rawConfig,
    sectors: rawConfig.sectors ?? [],
    signalTypes: rawConfig.signalTypes ?? [],
    holdDurations: rawConfig.holdDurations ?? [],
    watchlist: rawConfig.watchlist ?? [],
    exclusionList: rawConfig.exclusionList ?? [],
    dailyLossLimit: rawConfig.dailyLossLimit ?? 0,
  }), [rawConfig]);

  const router = useRouter();
  const [configOpen, setConfigOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [range, setRange] = useState<Range>("Max");
  const [tradeFilter, setTradeFilter] = useState<"all" | "open" | "closed">("all");
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemView[]>(initialWatchlist);
  const [, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showRunShowcase, setShowRunShowcase] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      await deleteAnalyst(config.id);
      toast.success("Analyst deleted");
      router.push("/analysts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleteLoading(false);
    }
  }

  const handleAddStock = (symbol: string) => {
    const upper = symbol.toUpperCase();
    if (watchlistItems.some((i) => i.symbol === upper)) return;
    // Optimistic add
    const tempItem: WatchlistItemView = {
      id: `temp-${upper}`,
      symbol: upper,
      reason: "Added manually",
      notes: null,
      addedBy: "USER",
      priority: "NORMAL",
      status: "ACTIVE",
      thesisDirection: null,
      targetPrice: null,
      stopPrice: null,
      conviction: null,
      catalyst: null,
      lastReviewedAt: null,
      createdAt: new Date(),
      thesisCount: 0,
      latestThesis: null,
    };
    setWatchlistItems((prev) => [...prev, tempItem]);
    startTransition(async () => {
      const item = await addWatchlistItem(config.id, upper);
      // Replace temp item with real one
      setWatchlistItems((prev) =>
        prev.map((i) => (i.id === tempItem.id ? item : i)),
      );
    });
  };

  const handleRemoveStock = (symbol: string) => {
    setWatchlistItems((prev) => prev.filter((i) => i.symbol !== symbol));
    startTransition(async () => {
      await removeWatchlistItem(config.id, symbol);
    });
  };

  // ── Chart data ──────────────────────────────────────────────────────────
  const openPositions = recentTrades.filter((t) => t.status === "OPEN");
  const hasOpenPositions = openPositions.length > 0;

  // Compute total unrealized P&L from live prices
  const totalUnrealizedPnl = useMemo(() => {
    return openPositions.reduce((sum, t) => {
      const lp = livePrices[t.symbol];
      if (lp == null) return sum;
      const dir = t.direction === "SHORT" ? -1 : 1;
      return sum + (lp - t.avgCost) * t.quantity * dir;
    }, 0);
  }, [openPositions, livePrices]);

  // Total cost basis for open positions (initial investment)
  const totalCostBasis = useMemo(() => {
    return openPositions.reduce((sum, t) => sum + t.avgCost * t.quantity, 0);
  }, [openPositions]);

  // Current portfolio value from live prices
  const totalCurrentValue = useMemo(() => {
    return openPositions.reduce((sum, t) => {
      const lp = livePrices[t.symbol] ?? t.avgCost;
      return sum + lp * t.quantity;
    }, 0);
  }, [openPositions, livePrices]);

  const equityData = useMemo(() => {
    const closed = recentTrades
      .filter((t) => t.closedAt && t.realizedPnl != null)
      .sort(
        (a, b) =>
          new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime(),
      );

    const points: { date: string; pnl: number; value: number }[] = [];

    // Start at 0 P&L on the earliest trade open date
    const allTrades = [...recentTrades].sort(
      (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(),
    );
    if (allTrades.length > 0) {
      points.push({
        date: new Date(allTrades[0].openedAt).toISOString().slice(0, 10),
        pnl: 0,
        value: 0,
      });
    }

    // Add closed trade points (cumulative realized P&L from 0 baseline)
    let cum = 0;
    for (const t of closed) {
      cum += t.realizedPnl!;
      points.push({
        date: new Date(t.closedAt!).toISOString().slice(0, 10),
        pnl: cum,
        value: cum,
      });
    }

    // Add today's point including unrealized P&L from open positions
    const today = new Date().toISOString().slice(0, 10);
    const todayPnl = cum + totalUnrealizedPnl;
    const lastPoint = points[points.length - 1];
    if (!lastPoint || lastPoint.date !== today) {
      // Always add today if we have open positions or at least one trade
      if (hasOpenPositions || recentTrades.length > 0) {
        points.push({ date: today, pnl: todayPnl, value: todayPnl });
      }
    } else {
      lastPoint.pnl = todayPnl;
      lastPoint.value = todayPnl;
    }

    // Ensure at least 2 distinct points so the chart renders
    if (points.length === 1) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      points.unshift({ date: yesterday, pnl: 0, value: 0 });
    }

    return points.length >= 2 ? points : [];
  }, [recentTrades, hasOpenPositions, totalUnrealizedPnl]);

  const filteredEquity = useMemo(
    () => sliceByRange(equityData, range),
    [equityData, range],
  );

  const chartDataKey = "pnl";
  const chartMode = "pnl";

  const equityStroke = useMemo(() => {
    if (equityData.length === 0) return PNL_HEX.positive;
    const last = equityData[equityData.length - 1];
    return last.pnl >= 0 ? PNL_HEX.positive : PNL_HEX.negative;
  }, [equityData]);

  // ── Display values ──────────────────────────────────────────────────────
  const totalPnl = stats.totalPnl + totalUnrealizedPnl;
  const hasTrades = stats.totalTrades > 0 || hasOpenPositions;
  const pnlColorClass = hasTrades
    ? totalPnl >= 0 ? "text-positive" : "text-negative"
    : "text-muted-foreground";
  // Both modes show total P&L (realized + unrealized) since the chart tracks
  // cumulative P&L from 0. "Value" mode uses the last equity point (same number)
  // so the overlay always reflects what the chart end-point actually shows.
  const overlayValue = hasTrades
    ? (totalPnl >= 0 ? "+" : "") + formatCurrency(totalPnl)
    : "$0.00";
  const overlayLabel = "P&L";
  const overlayColorClass = pnlColorClass;

  return (
    <>
      <RunShowcaseTrigger />
      <RunShowcaseDialog open={showRunShowcase} onOpenChange={setShowRunShowcase} />
      <div className="lg:grid lg:grid-cols-3 h-[calc(100dvh-3rem)] overflow-y-auto lg:overflow-hidden">
        {/* ── Left: Analyst briefing ──────────────────────────────────── */}
        <div className="lg:col-span-2 lg:h-full lg:overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-4">
            {/* Left Side Analyst Name */}
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base font-brand font-semibold truncate">{config.name}</h1>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    config.enabled
                      ? "bg-positive"
                      : "bg-muted-foreground/40",
                  )}
                />
                {hasRunning && (
                  <Badge
                    variant="secondary"
                  >
                    Research Running…
                  </Badge>
                )}
              </div>
              {/* Stats strip */}
              <div className="flex items-center gap-3 flex-wrap">
                {[
                  { label: "Runs", value: String(stats.totalRuns) },
                  { label: "Theses", value: String(stats.totalTheses) },
                  { label: "Trades", value: String(stats.totalTrades) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-1 font-mono text-[11px] uppercase text-muted-foreground leading-tight">
                    <p className="tabular-nums">{value}</p>
                    <p>{label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Right Side Settings, Menu, and Run Research Button */}
            <div className="flex items-center gap-1 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="ghost" size="icon-sm">
                    <EllipsisVertical />
                  </Button>
                } />
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => router.push(`/analysts/${config.id}/edit`)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfigOpen(true)}>
                    <Settings2 className="h-3.5 w-3.5" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowRunShowcase(true)}>
                    <ShowcaseIcon className="h-3.5 w-3.5" />
                    How Runs Work
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOverviewOpen(true)}>
                    <ScanSearch className="h-3.5 w-3.5" />
                    Run Workflow
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-negative focus:text-negative"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete analyst
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <RunResearchButton
                analystId={config.id}
                hasRunning={hasRunning}
              />
            </div>
          </div>

          {/* ── Tabs: Snapshot | Briefs | Findings ───── */}
          <Tabs defaultValue={0} className="flex-1">
            <div className="px-4">
              <TabsList>
                <TabsTrigger value={0}>Snapshot</TabsTrigger>
                <TabsTrigger value={1}>Briefs</TabsTrigger>
                <TabsTrigger value={2}>Findings</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value={0}>
              <AnalystSnapshotSection
                analystName={config.name}
                morningBriefs={detail.morningBriefs}
                runBriefs={detail.briefings}
              />
            </TabsContent>
            <TabsContent value={1}>
              <AnalystAllBriefsSection
                analystName={config.name}
                morningBriefs={detail.morningBriefs}
                runBriefs={detail.briefings}
              />
            </TabsContent>
            <TabsContent value={2}>
              <div className="w-full mx-auto px-4 py-6">
                <AnalystFindingsTab
                  analystId={config.id}
                  tickerSuggestions={Array.from(
                    new Set([
                      ...openPositions.map((p) => p.symbol),
                      ...watchlistItems.map((w) => w.symbol),
                    ]),
                  )}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* ── Floating composer — desktop only ── */}
          <div className="hidden lg:block sticky bottom-0 px-4 pb-4">
            <FloatingEditorComposer analystId={config.id} />
          </div>
        </div>

        {/* ── Right sidebar: portfolio-style ─────────────────────────────── */}
        <div className="p-4 lg:h-full">
          <div className="h-full rounded-xl border bg-background overflow-hidden flex flex-col">
            {/* Equity chart */}
            {equityData.length < 2 ? (
              <div className="h-[200px] shrink-0 relative">
                {/* Value overlay — matches filled chart style */}
                <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-muted-foreground">$0</p>
                    <p className="text-[10px] text-muted-foreground">Value</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {hasOpenPositions ? "Updates on close" : "Waiting for first trade"}
                  </p>
                </div>
                <ChartContainer
                  config={{ value: { label: "Value", color: "var(--muted-foreground)" } } satisfies ChartConfig}
                  className="h-full w-full"
                >
                  <AreaChart
                    data={[
                      { date: "W1", value: 20 },
                      { date: "W2", value: 35 },
                      { date: "W3", value: 28 },
                      { date: "W4", value: 45 },
                      { date: "W5", value: 38 },
                      { date: "W6", value: 55 },
                      { date: "W7", value: 48 },
                      { date: "W8", value: 62 },
                    ]}
                    margin={{ top: 50, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="emptyChartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={[0, 80]} />
                    <Area
                      type="natural"
                      dataKey="value"
                      stroke="var(--muted-foreground)"
                      strokeWidth={1}
                      strokeOpacity={0.2}
                      fill="url(#emptyChartGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            ) : (
              <div className="relative shrink-0">
                {/* Value/P&L overlay + mode toggle */}
                <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between">
                  <div>
                    <p
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        overlayColorClass,
                      )}
                    >
                      {overlayValue}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{overlayLabel}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {stats.winRate != null && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium tabular-nums",
                          pnlBadgeClasses(stats.winRate - 0.5),
                        )}
                      >
                        {Math.round(stats.winRate * 100)}%
                      </span>
                    )}
                  </div>
                </div>
                {/* Range tabs */}
                <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between">
                  <div className="flex items-center gap-0.5 bg-background/80 backdrop-blur-sm rounded-md border px-0.5 py-0.5">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] rounded transition-colors",
                          range === r
                            ? "bg-muted text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <ChartContainer
                  config={{
                    pnl: { label: "P&L", color: equityStroke },
                  } satisfies ChartConfig}
                  className="h-[200px] w-full"
                >
                  <AreaChart
                    data={filteredEquity}
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="analystEqGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={equityStroke}
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="100%"
                          stopColor={equityStroke}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis
                      hide
                      domain={['auto', 'auto']}
                      padding={{ top: 20 }}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(l) => formatDateLabel(String(l))}
                          formatter={(value) => (
                            <span className="font-mono text-xs tabular-nums">
                              ${Number(value).toFixed(2)}
                            </span>
                          )}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey={chartDataKey}
                      stroke={equityStroke}
                      strokeWidth={1.5}
                      fill="url(#analystEqGrad)"
                      baseValue={0}
                      dot={false}
                      activeDot={{ r: 2, fill: equityStroke }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            )}

            {/* Sidebar tabs: Trades | Watching */}
            <Tabs defaultValue={0} className="flex-1 overflow-hidden">
              <div className="px-3 pt-2 shrink-0">
                <TabsList>
                  <TabsTrigger value={0}>Trades</TabsTrigger>
                  <TabsTrigger value={1}>Watching</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={0} className="flex-1 overflow-y-auto flex flex-col">
                {recentTrades.length === 0 ? (
                  <div className="space-y-0 px-3 py-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 py-2.5">
                        <div className="h-6 w-6 rounded-full bg-muted" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 w-16 rounded bg-muted" />
                          <div className="h-2 w-24 rounded bg-muted/60" />
                        </div>
                        <div className="h-2.5 w-12 rounded bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 shrink-0">
                      <ChipTabs<"all" | "open" | "closed">
                        options={[
                          { value: "all", label: "All" },
                          { value: "open", label: "Open" },
                          { value: "closed", label: "Closed" },
                        ]}
                        value={tradeFilter}
                        onChange={(v) => v && setTradeFilter(v)}
                        clearable={false}
                      />
                    </div>
                    {recentTrades
                      .filter((t) => tradeFilter === "all" || (tradeFilter === "open" ? t.status === "OPEN" : t.status !== "OPEN"))
                      .map((trade) => (
                        <AnalystTradeRow key={trade.id} trade={trade} livePrice={livePrices[trade.symbol]} />
                      ))
                    }
                  </>
                )}
              </TabsContent>

              <TabsContent value={1} className="flex-1 overflow-y-auto">
                <div className="px-3 py-2 shrink-0">
                  <StockCombobox
                    onSelect={handleAddStock}
                    excludeSymbols={watchlistItems.map((i) => i.symbol)}
                  />
                </div>
                {watchlistItems.length === 0 ? (
                  <EducationEmptyState stateKey="analyst-watchlist" size="inline" />
                ) : (
                  watchlistItems.map((item) => (
                    <WatchingRow
                      key={item.id}
                      item={item}
                      onRemove={handleRemoveStock}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
        {/* End Sidebar */}
      </div>

      {/* Config Sheet */}
      <AnalystConfigSheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
      />

      {/* Agent overview sheet */}
      <Sheet open={overviewOpen} onOpenChange={setOverviewOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-md overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <SheetTitle>Research Agent</SheetTitle>
            <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
              <X className="h-4 w-4" />
            </SheetClose>
          </div>
          <div className="px-4 pb-6">
            <TeamSheetContent team={getTeam("agent")} />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete {config.name}</DialogTitle>
            <DialogDescription>
              This will permanently delete this analyst and all associated data:
              runs, theses, trades, events, and briefings. Any open Alpaca
              positions will be closed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="gap-2"
            >
              {deleteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {deleteLoading ? "Deleting…" : "Delete Analyst"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Analyst Briefs Section ───────────────────────────────────────────────────
// Inline summary from most recent + 3-col grid of recent briefs + click to dialog

import type { MorningBriefItem, AnalystBriefingItem } from "@/lib/actions/analyst.actions";
import type { MorningBrief } from "@/components/intelligence/types";

// Helper to normalize all briefs into unified shape
function buildAllBriefs(analystName: string, morningBriefs: MorningBriefItem[], runBriefs: AnalystBriefingItem[]): UnifiedBrief[] {
  return [
    ...morningBriefs.map((b) =>
      normalizeIntelBrief({
        ...b,
        analystId: "",
        date: new Date(b.date).toISOString(),
        generatedAt: new Date(b.generatedAt).toISOString(),
        analyst: { id: "", name: analystName },
        portfolioAlerts: (b.portfolioAlerts ?? []) as MorningBrief["portfolioAlerts"],
        watchlistUpdates: (b.watchlistUpdates ?? []) as MorningBrief["watchlistUpdates"],
        newOpportunities: (b.newOpportunities ?? []) as MorningBrief["newOpportunities"],
      })
    ),
    ...runBriefs.map((b) => normalizeRunBrief(b, analystName)),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ── Feature showcase for empty analyst ────────────────────────────────────────


// ── Snapshot tab: latest run brief inline + 3 recent cards ──────────────────

function AnalystSnapshotSection({
  analystName,
  morningBriefs,
  runBriefs,
}: {
  analystName: string;
  morningBriefs: MorningBriefItem[];
  runBriefs: AnalystBriefingItem[];
}) {
  const [selected, setSelected] = useState<UnifiedBrief | null>(null);
  const latestRunBrief = runBriefs[0] ?? null;
  const allBriefs = buildAllBriefs(analystName, morningBriefs, runBriefs);
  // For the 3 cards, exclude the latest run brief since it's shown inline
  const cards = allBriefs.filter((b) => !(b.type === "run" && b.runBrief?.id === latestRunBrief?.id)).slice(0, 3);

  if (!latestRunBrief && cards.length === 0) {
    return (
      <div className="px-4 py-6">
        <SkeletonCardStack
          count={2}
          title="No brief yet"
          subtitle="Your analyst runs automatically each morning at 8 AM ET. You'll see a brief here after the first session."
        />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto px-4 py-6">
      {latestRunBrief && (
        <div className="text-sm leading-relaxed">
          <TickerMarkdown>{latestRunBrief.narrative}</TickerMarkdown>
        </div>
      )}
    </div>
  );
}

// ── Briefs tab: all briefs as cards ─────────────────────────────────────────

function AnalystAllBriefsSection({
  analystName,
  morningBriefs,
  runBriefs,
}: {
  analystName: string;
  morningBriefs: MorningBriefItem[];
  runBriefs: AnalystBriefingItem[];
}) {
  const [selected, setSelected] = useState<UnifiedBrief | null>(null);
  const allBriefs = buildAllBriefs(analystName, morningBriefs, runBriefs);

  if (allBriefs.length === 0) {
    return (
      <div className="px-4 py-6">
        <SkeletonCardStack
          count={2}
          title="No briefs yet"
          subtitle="Morning briefs are generated at 7:45 AM ET. Post-run standups appear after each research session."
        />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto px-4 py-6 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {allBriefs.map((b) => (
          <BriefCard key={b.id} brief={b} onClick={() => setSelected(b)} />
        ))}
      </div>

      <BriefDetailDialog
        brief={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
