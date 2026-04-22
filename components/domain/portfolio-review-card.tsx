"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PnlBadge } from "@/components/ui/pnl-badge";
import { StockLogo } from "@/components/StockLogo";
import { Briefcase, TrendingUp, TrendingDown, Eye } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ThesisRow = {
  ticker: string;
  direction: string;
  confidence: number;
  entry_price?: number | null;
  target_price?: number | null;
  stop_loss?: number | null;
  reasoning?: string;
};

type PositionRow = {
  ticker: string;
  direction: string;
  shares: number;
  entry_price: number;
  current_price: number;
  pnl_dollars: number;
  pnl_pct: number;
  analyst_name?: string | null;
};

type WatchlistRow = {
  ticker: string;
  reason: string;
  priority: string;
  thesis_direction?: string | null;
  conviction?: number | null;
  catalyst?: string | null;
};

type AccountData = {
  cash: number;
  buying_power: number;
  portfolio_value: number;
};

export type PortfolioReviewData = {
  run_theses: ThesisRow[];
  open_positions: PositionRow[];
  watchlist?: WatchlistRow[];
  account: AccountData;
  max_position_size?: number;
  max_open_positions?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompact(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return fmtMoney(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PortfolioReviewCard({
  run_theses,
  open_positions,
  watchlist,
  account,
}: PortfolioReviewData) {
  const longTheses = run_theses.filter((t) => t.direction === "LONG");
  const shortTheses = run_theses.filter((t) => t.direction === "SHORT");
  const passTheses = run_theses.filter((t) => t.direction === "PASS");
  const actionableCount = longTheses.length + shortTheses.length;

  return (
    <Card className="overflow-hidden p-0 gap-0">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b bg-muted flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-brand font-semibold">Portfolio Review</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{actionableCount} actionable</span>
          <span className="opacity-30">·</span>
          <span className="tabular-nums">{passTheses.length} pass</span>
        </div>
      </div>

      {/* ── Account summary ────────────────────────────────────── */}
      <div className="px-3 py-2 border-b flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>
          <span className="uppercase tracking-wide">Cash</span>{" "}
          <span className="tabular-nums font-medium text-foreground/70">{fmtCompact(account.cash)}</span>
        </span>
        <span>
          <span className="uppercase tracking-wide">Portfolio</span>{" "}
          <span className="tabular-nums font-medium text-foreground/70">{fmtCompact(account.portfolio_value)}</span>
        </span>
      </div>

      {/* ── New Research section ────────────────────────────────── */}
      {run_theses.length > 0 && (
        <div className="border-b">
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              New Research ({run_theses.length})
            </span>
          </div>
          {run_theses.map((t) => {
            const DirIcon = t.direction === "LONG" ? TrendingUp : t.direction === "SHORT" ? TrendingDown : null;
            return (
              <div key={t.ticker} className="px-3 py-1.5 flex items-center gap-2 border-t">
                <StockLogo ticker={t.ticker} size="sm" />
                <span className="text-sm font-medium">{t.ticker}</span>
                {DirIcon && <DirIcon className="h-3 w-3 text-muted-foreground" />}
                <Badge
                  variant={
                    t.direction === "LONG" ? "positive"
                      : t.direction === "SHORT" ? "negative"
                        : "secondary"
                  }
                >
                  {t.direction}
                </Badge>
                <span className="tabular-nums text-xs text-muted-foreground">{t.confidence}%</span>
                <span className="ml-auto tabular-nums text-xs text-muted-foreground">
                  {t.entry_price != null ? `$${t.entry_price.toFixed(2)}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Current Holdings section ───────────────────────────── */}
      {open_positions.length > 0 && (
        <div>
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Current Holdings ({open_positions.length})
            </span>
          </div>
          {open_positions.map((p) => (
            <div key={p.ticker} className="px-3 py-1.5 flex items-center gap-2 border-t">
              <StockLogo ticker={p.ticker} size="sm" />
              <span className="text-sm font-medium">{p.ticker}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{p.shares} shares</span>
              <span className="text-xs text-muted-foreground tabular-nums">@ {fmtMoney(p.entry_price)}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-sm tabular-nums font-medium">{fmtMoney(p.current_price)}</span>
                <PnlBadge value={p.pnl_pct} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Watchlist section ──────────────────────────────────── */}
      {watchlist && watchlist.length > 0 && (
        <div className="border-t">
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Watchlist ({watchlist.length})
            </span>
          </div>
          {watchlist.map((w) => (
            <div key={w.ticker} className="px-3 py-1.5 flex items-center gap-2 border-t">
              <Eye className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium">{w.ticker}</span>
              {w.thesis_direction && (
                <span className={`text-[9px] font-medium uppercase ${
                  w.thesis_direction === "LONG" ? "text-positive"
                    : w.thesis_direction === "SHORT" ? "text-negative"
                      : "text-muted-foreground"
                }`}>{w.thesis_direction}</span>
              )}
              {w.priority === "HIGH" && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
              {w.conviction != null && (
                <span className="text-[9px] text-muted-foreground tabular-nums">{w.conviction}%</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[200px]">
                {w.catalyst ?? w.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────── */}
      {run_theses.length === 0 && open_positions.length === 0 && (!watchlist || watchlist.length === 0) && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No theses, positions, or watchlist items.
        </div>
      )}
    </Card>
  );
}
