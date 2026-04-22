"use client";

import { cn } from "@/lib/utils";
import { useMarketPulse } from "@/hooks/useMarketPulse";

interface Props {
  /** Tickers for open trades — added to WebSocket subscription dynamically */
  openTradeTickers?: string[];
  /** Whether market is currently open — passed from server so no client-side calc needed */
  marketOpen: boolean;
}

// ── Skeleton for a ticker item before first price arrives ─────────────────────

function TickerSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 animate-pulse">
      <span className="text-xs font-medium text-muted-foreground">
        {symbol}
      </span>
      <span className="h-3 w-14 bg-muted rounded" />
      <span className="h-3 w-10 bg-muted rounded" />
    </div>
  );
}

// ── Market status pill (exported for use in header) ──────────────────────────

export function MarketStatusPill({ open }: { open: boolean }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {open ? (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-positive" />
        </span>
      ) : (
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      )}
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          open ? "text-positive" : "text-muted-foreground"
        )}
      >
        {open ? "OPEN" : "CLOSED"}
        <span className="hidden md:inline"> · {dateStr}</span>
      </span>
    </div>
  );
}

// ── Sidebar marquee — slow infinite scroll ───────────────────────────────────

export function SidebarMarquee({
  openTradeTickers = [],
}: {
  openTradeTickers?: string[];
}) {
  const { quotes, tickers } = useMarketPulse(openTradeTickers);

  const items = tickers.map((symbol) => {
    const q = quotes[symbol];
    if (!q || q.price === 0) {
      return <TickerSkeleton key={symbol} symbol={symbol} />;
    }

    const positive = q.changePct >= 0;
    const priceStr =
      symbol === "BTC-USD" || symbol === "ETH-USD"
        ? q.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : q.price.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
    const label =
      symbol === "BTC-USD" ? "BTC" : symbol === "ETH-USD" ? "ETH" : symbol;

    return (
      <div key={symbol} className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "text-xs font-medium tabular-nums transition-colors duration-300",
            q.flash === "up" && "text-positive",
            q.flash === "down" && "text-negative",
            !q.flash && "text-foreground"
          )}
        >
          {priceStr}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            positive ? "text-positive" : "text-negative"
          )}
        >
          {positive ? "+" : ""}
          {q.changePct.toFixed(2)}%
        </span>
      </div>
    );
  });

  return (
    <div className="overflow-hidden border-t group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-6 py-2 px-3 animate-marquee whitespace-nowrap">
        {items}
        {/* Duplicate for seamless loop */}
        {items}
      </div>
    </div>
  );
}

// ── Legacy full strip (keep default export for backwards compat) ─────────────

export default function MarketPulseStrip({
  openTradeTickers = [],
  marketOpen,
}: Props) {
  const { quotes, tickers } = useMarketPulse(openTradeTickers);

  return (
    <div className="h-9 flex items-center gap-5 border-b px-4 overflow-x-auto bg-background shrink-0">
      {tickers.map((symbol) => {
        const q = quotes[symbol];
        if (!q || q.price === 0) {
          return <TickerSkeleton key={symbol} symbol={symbol} />;
        }

        const positive = q.changePct >= 0;
        const priceStr =
          symbol === "BTC-USD" || symbol === "ETH-USD"
            ? q.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
            : q.price.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
        const label = symbol === "BTC-USD" ? "BTC" : symbol === "ETH-USD" ? "ETH" : symbol;

        return (
          <div key={symbol} className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-medium text-muted-foreground hidden sm:block">
              {label}
            </span>
            <span
              className={cn(
                "text-xs font-medium tabular-nums transition-colors duration-300",
                q.flash === "up" && "text-positive",
                q.flash === "down" && "text-negative",
                !q.flash && "text-foreground"
              )}
            >
              {priceStr}
            </span>
            <span
              className={cn(
                "text-xs tabular-nums font-medium",
                positive ? "text-positive" : "text-negative"
              )}
            >
              {positive ? "+" : ""}
              {q.changePct.toFixed(2)}%
            </span>
          </div>
        );
      })}

      <div className="ml-auto pl-4">
        <MarketStatusPill open={marketOpen} />
      </div>
    </div>
  );
}
