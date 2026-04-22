import Link from "next/link";
import { StockLogo } from "@/components/StockLogo";
import { PnlBadge } from "@/components/ui/pnl-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, pnlColor } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { TRADE_STATUS_DISPLAY, shortAlpacaId } from "@/lib/trade-status";
import type { TradeStatus } from "@/lib/mock-data/trades";

// ── TradeRow ─────────────────────────────────────────────────────────────────
// Compact trade list item. One dot, one ticker, one price, one P&L.
// The dot color + tooltip encodes the entire status story — no text label.

interface TradeRowProps {
  id: string;
  ticker: string;
  currentPrice: number;
  entryPrice?: number;
  shares?: number;
  pnl: number;
  pnlPct: number;
  status: string;
  openedAt?: Date | string;
  closedAt?: string;
  placedAt?: string;
  filledAt?: string;
  priceSource?: "alpaca" | "finnhub" | "missing";
  priceUpdatedAt?: string;
  alpacaOrderId?: string;
  flash?: "win" | "loss";
  className?: string;
}

function fmtShort(d: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    d instanceof Date ? d : new Date(d),
  );
}

function fmtPriceSource(source: string | undefined, updatedAt: string | undefined): string {
  if (source === "alpaca") return `Live via Alpaca${updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}` : ""}`;
  if (source === "finnhub") return `Via Finnhub${updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}` : ""}`;
  if (source === "missing") return "No live price — showing entry";
  return "";
}

export function TradeRow({
  id,
  ticker,
  currentPrice,
  entryPrice,
  shares = 1,
  pnl,
  pnlPct,
  status,
  openedAt,
  closedAt,
  placedAt,
  filledAt,
  priceSource,
  priceUpdatedAt,
  alpacaOrderId,
  flash,
  className,
}: TradeRowProps) {
  const totalWorth = currentPrice * shares;
  const dateStr = openedAt ? fmtShort(openedAt) : null;

  const isPending = status === "PENDING";
  const isOpen = status === "OPEN" || isPending;
  const isStalePrice = isOpen && priceSource === "missing";

  const cfg = TRADE_STATUS_DISPLAY[(status as TradeStatus)] ?? TRADE_STATUS_DISPLAY.OPEN;
  const timeLabel = cfg.timeLabel({ placedAt, filledAt, closedAt });
  const shortId = shortAlpacaId(alpacaOrderId);
  const priceSourceLabel = isOpen ? fmtPriceSource(priceSource, priceUpdatedAt) : null;

  return (
    <Link
      href={`/trades/${id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors border-b border-border/40 last:border-0",
        flash === "win" && "bg-positive/10",
        flash === "loss" && "bg-negative/10",
        className,
      )}
    >
      <StockLogo ticker={ticker} size="md" className="rounded-md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{ticker}</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 cursor-default", cfg.dotClass)} />
                }
              />
              <TooltipContent side="top">
                <div>
                  <div>{timeLabel}</div>
                  {shortId && <div className="opacity-60 font-mono text-[10px]">Alpaca {shortId}</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex items-center gap-1 text-sm tabular-nums font-light cursor-default">
                  ${currentPrice.toFixed(2)}
                </span>
              }
            />
            <TooltipContent side="top">
              <div>
                {priceSourceLabel ? (
                  <div>{priceSourceLabel}</div>
                ) : (
                  <div>Closing price</div>
                )}
                {isStalePrice && entryPrice != null && (
                  <div className="opacity-60 text-[10px]">Showing entry ${entryPrice.toFixed(2)}</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(totalWorth)} — {shares} share
            {shares !== 1 ? "s" : ""}
            {dateStr && <> · {dateStr}</>}
          </span>
          <div className="flex items-center gap-1.5">
            {isStalePrice ? (
              <span className="text-[10px] text-amber-500/80">no live price</span>
            ) : isPending ? (
              <span className="text-[10px] text-muted-foreground/50">—</span>
            ) : (
              <>
                <span className={cn("text-sm tabular-nums", pnlColor(pnl))}>
                  {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
                </span>
                <PnlBadge value={pnlPct} format="percent" className="text-xs" />
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
