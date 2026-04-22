"use client";

import type { ComponentProps } from "react";

import { Card } from "@/components/ui/card";
import { PnlBadge } from "@/components/ui/pnl-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
import { BarGauge, priceToRange } from "@/components/ui/bar-gauge";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradeCardData = {
  ticker: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  shares?: number;
  status?: "OPEN" | "PENDING" | "CLOSED" | "CANCELLED";
  outcome?: "WIN" | "LOSS" | "BREAKEVEN" | null;
  closePrice?: number | null;
  realizedPnl?: number | null;
  targetPrice?: number | null;
  stopLoss?: number | null;
  companyName?: string | null;
  exchange?: string | null;
  // Order lifecycle metadata
  placedAt?: string | null;
  filledAt?: string | null;
  alpacaOrderId?: string | null;
};

export type TradeCardProps = ComponentProps<typeof Card> & TradeCardData;

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; dotClass: string; icon: typeof CheckCircle2 }
> = {
  OPEN: {
    label: "Holding",
    dotClass: "bg-positive",
    icon: CheckCircle2,
  },
  PENDING: {
    label: "Pending",
    dotClass: "bg-amber-500 animate-pulse",
    icon: Clock,
  },
  CLOSED: { label: "Closed", dotClass: "bg-muted-foreground/60", icon: CheckCircle2 },
  CANCELLED: {
    label: "Cancelled",
    dotClass: "border border-muted-foreground/60 bg-transparent",
    icon: XCircle,
  },
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTarget(target: number | null | undefined, stop: number | null | undefined): string {
  if (target != null && stop != null) {
    return `Target $${target.toFixed(2)} with stop limit $${stop.toFixed(2)}`;
  }
  if (target != null) return `Target $${target.toFixed(2)}`;
  if (stop != null) return `Stop limit $${stop.toFixed(2)}`;
  return "";
}

// ─── TradeCard ────────────────────────────────────────────────────────────────

export function TradeCard({
  ticker,
  direction,
  entryPrice,
  shares,
  status = "OPEN",
  outcome,
  closePrice,
  realizedPnl,
  targetPrice,
  stopLoss,
  companyName,
  exchange,
  placedAt,
  filledAt,
  alpacaOrderId,
  className,
  ...cardProps
}: TradeCardProps) {
  const isLong = direction === "LONG";
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OPEN;
  const isClosed = status === "CLOSED";

  // For open trades, show entry price. For closed, show close price as "current".
  const displayPrice = isClosed && closePrice != null ? closePrice : entryPrice;

  // Delta from entry
  const deltaAmount =
    isClosed && closePrice != null
      ? (closePrice - entryPrice) * (isLong ? 1 : -1)
      : null;
  const deltaPct =
    deltaAmount != null && entryPrice > 0
      ? (deltaAmount / entryPrice) * 100
      : null;
  const deltaPositive = deltaAmount != null ? deltaAmount >= 0 : null;

  const targetLine = !isClosed ? formatTarget(targetPrice, stopLoss) : "";

  return (
    <Card className={cn("overflow-hidden p-0", className)} {...cardProps}>
      {/* ── TOP: logo · name · status · price — IDENTICAL to ThesisCard ── */}
      <div className="p-3 border-b">
        <div className="flex items-start justify-between gap-4">

          {/* Left: logo + company name + status badge + ticker subhead */}
          <div className="flex items-center gap-2.5 min-w-0">
            <StockLogo ticker={ticker} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-lg font-brand font-bold text-foreground truncate leading-tight">
                  {companyName ?? ticker}
                </p>
                {/* Status badge inline */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-transparent shrink-0 cursor-default">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusCfg.dotClass)} />
                        {statusCfg.label}
                      </span>
                    }
                  />
                  <TooltipContent side="bottom">
                    <div>
                      <div>
                        {filledAt
                          ? `Filled ${fmtDateTime(filledAt)}`
                          : placedAt
                            ? `Ordered ${fmtDateTime(placedAt)}`
                            : statusCfg.label}
                      </div>
                      {status === "PENDING" && !filledAt && (
                        <div className="text-amber-500">Awaiting fill</div>
                      )}
                      {alpacaOrderId && (
                        <div className="opacity-60 font-mono text-[10px]">
                          Alpaca {alpacaOrderId.slice(0, 8)}…
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* Ticker · Exchange · Confidence */}
              <div className="font-mono text-[11px] text-muted-foreground leading-tight mt-0.5 flex items-center gap-1 flex-wrap">
                <span>{ticker}</span>
                {exchange && (
                  <>
                    <span className="opacity-30">&middot;</span>
                    <span>{exchange}</span>
                  </>
                )}
                <span className="opacity-30">&middot;</span>
                <Tooltip>
                  <TooltipTrigger render={<span className="cursor-default" />}>
                    {shares != null ? `${shares} shares` : direction}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {isLong ? "Long" : "Short"} position{shares != null ? ` — ${shares} shares` : ""}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Right: price + $delta + %badge — ALL ONE ROW, target below */}
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-2">
              <p className="text-lg font-medium tabular-nums text-foreground leading-none">
                ${displayPrice.toFixed(2)}
              </p>
              {deltaAmount != null && (
                <span
                  className={cn(
                    "text-lg tabular-nums font-light",
                    deltaPositive ? "text-positive" : "text-negative",
                  )}
                >
                  {deltaPositive ? "+" : "\u2212"}${Math.abs(deltaAmount).toFixed(2)}
                </span>
              )}
              {deltaPct != null && <PnlBadge value={deltaPct} />}
            </div>
            {targetLine && (
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {targetLine}
              </p>
            )}
            {isClosed && closePrice != null && (
              <p className="text-xs text-muted-foreground mt-1 text-right">
                Closed at ${closePrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── SECOND: entry sentence + gauge ── */}
      <div className="p-3 space-y-3">
        {/* Entry sentence */}
        <p className="text-sm text-foreground font-medium">
          {isLong ? "Bought" : "Sold short"} {shares != null ? `${shares} shares` : "shares"} at{" "}
          <span className="tabular-nums">${entryPrice.toFixed(2)}</span> entry
          {shares != null && (
            <span className="text-muted-foreground font-normal">
              {" "}&middot; <span className="tabular-nums">${(shares * entryPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> total
            </span>
          )}
        </p>

        {/* Price gauge (OPEN trades only) */}
        {!isClosed && (targetPrice != null || stopLoss != null) && (
          <BarGauge
            mode="range"
            value={Math.max(0, Math.min(1, priceToRange({
              entry: entryPrice,
              target: targetPrice,
              stop: stopLoss,
              direction,
            })))}
          />
        )}
      </div>
    </Card>
  );
}
