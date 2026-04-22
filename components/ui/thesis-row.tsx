"use client";

import { useState } from "react";
import { StockLogo } from "@/components/StockLogo";
import { PnlBadge } from "@/components/ui/pnl-badge";
import { PnlArrow } from "@/components/ui/pnl-arrow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Favicon } from "@/components/intelligence/signal-feed";
import { TRADE_STATUS_DISPLAY } from "@/lib/trade-status";
import type { TradeStatus } from "@/lib/mock-data/trades";

// ── Types ────────────────────────────────────────────────────────────────────

type SourceItem = { type: string; provider: string; title: string; url?: string | null };

export interface ThesisRowData {
  id: string;
  ticker: string;
  direction: string;
  confidenceScore: number;
  reasoningSummary: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  holdDuration?: string;
  createdAt?: string | null;
  analystName?: string | null;
  analystId?: string | null;
  runId?: string | null;
  currentPrice?: number | null;
  priceChange?: { amount: number; percent: number } | null;
  companyName?: string | null;
  decision?: string | null;
  sourcesUsed?: unknown;
  position?: {
    id: string;
    status: string;
    tradeStatus?: TradeStatus; // derived from order fill state; undefined = legacy/unknown
    avgCost: number;
    quantity?: number | null;
    closePrice?: number | null;
    realizedPnl?: number | null;
    openedAt?: string | null;
    filledAt?: string | null;
    placedAt?: string | null;
  } | null;
}

interface ThesisRowProps {
  thesis: ThesisRowData;
  showTicker?: boolean;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

const $ = (n: number) => `$${n.toFixed(2)}`;
const $k = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${Math.abs(n).toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)}%`;
const pnlCls = (v: number) => v >= 0 ? "text-positive" : "text-negative";
const PctArrow = ({ value }: { value: number }) => (
  <span className={cn("inline-flex items-center gap-0.5 tabular-nums", pnlCls(value))}>
    {value >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
    {pct(value)}
  </span>
);


function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseSources(raw: unknown): SourceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SourceItem => s != null && typeof s === "object" && "title" in s);
}

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// ── Consensus / Position helpers ────────────────────────────────────────────

function consensus(dir: string, conf: number): { label: string; isStrong: boolean } {
  if (dir === "PASS") return { label: "Pass", isStrong: false };
  const isBuy = dir === "LONG";
  if (conf >= 80) return { label: isBuy ? "Strong Buy" : "Strong Sell", isStrong: true };
  if (conf >= 60) return { label: isBuy ? "Buy" : "Sell", isStrong: false };
  return { label: isBuy ? "Lean Buy" : "Lean Sell", isStrong: false };
}


function posBg(ts: TradeStatus): string {
  if (ts === "OPEN" || ts === "CLOSED_WIN") return "bg-positive/10";
  if (ts === "CLOSED_LOSS") return "bg-negative/10";
  return "bg-muted/30";
}

// ── Component ────────────────────────────────────────────────────────────────

export function ThesisRow({ thesis: t, showTicker = true }: ThesisRowProps) {
  const [expanded, setExpanded] = useState(false);
  const pos = t.position;
  const isPass = t.direction === "PASS";
  const isBull = t.direction === "LONG";
  const con = consensus(t.direction, t.confidenceScore);
  const sources = parseSources(t.sourcesUsed);

  const deltaPct = t.priceChange?.percent
    ?? (t.currentPrice && t.entryPrice && t.entryPrice > 0 ? ((t.currentPrice - t.entryPrice) / t.entryPrice) * 100 : null);

  const pnlPct = pos
    ? pos.realizedPnl != null && pos.avgCost > 0 && pos.quantity
      ? (pos.realizedPnl / (pos.avgCost * pos.quantity)) * 100
      : t.currentPrice != null && pos.avgCost > 0
        ? ((t.currentPrice - pos.avgCost) / pos.avgCost) * 100
        : null
    : null;

  const mktVal = pos && t.currentPrice && pos.quantity ? t.currentPrice * pos.quantity : null;

  const upsidePct = !isPass && t.targetPrice && t.targetPrice > 0 && t.entryPrice && t.entryPrice > 0
    ? ((t.targetPrice - t.entryPrice) / t.entryPrice) * 100
    : null;

  return (
    <div className="rounded-xl border bg-background overflow-hidden">

      {/* ── 1. Position row ── */}
      {pos && (() => {
        // Use tradeStatus when available (wired from order fill state).
        // Fall back to deriving from avgCost for legacy/incomplete data.
        const ts: TradeStatus = pos.tradeStatus ?? (pos.avgCost === 0 ? "PENDING" : "OPEN");
        const cfg = TRADE_STATUS_DISPLAY[ts];
        const isPending = ts === "PENDING";
        return (
          <div className={cn("px-4 py-2.5 border-b", posBg(ts))}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground cursor-default shrink-0">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dotClass)} />
                {cfg.label}
              </span>
              <span className="text-sm">
                {pos.quantity && <>{pos.quantity} shares{!isPending && <> @ </>}</>}
                {!isPending && pos.avgCost > 0 && (
                  <span className="tabular-nums font-medium">{$(pos.avgCost)}</span>
                )}
                {t.targetPrice && t.targetPrice > 0 && <>, targeting <span className="tabular-nums font-medium">{$(t.targetPrice)}</span></>}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {!isPending && mktVal != null && (
                  <Tooltip>
                    <TooltipTrigger render={<span className="text-sm tabular-nums font-medium cursor-default">{$k(mktVal)}</span>} />
                    <TooltipContent side="bottom">Current market value of {pos.quantity ?? 0} shares at {$(t.currentPrice ?? 0)}</TooltipContent>
                  </Tooltip>
                )}
                {!isPending && pnlPct != null && <PnlBadge value={pnlPct} />}
              </div>
            </div>
            {!isPending && t.stopLoss && t.stopLoss > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">Stop at <span className="tabular-nums">{$(t.stopLoss)}</span></p>
            )}
          </div>
        );
      })()}

      {/* ── 2. Stock row ── */}
      {showTicker && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b">
          <StockLogo ticker={t.ticker} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{t.companyName ?? t.ticker}</p>
            {t.companyName && <p className="font-mono text-[11px] text-muted-foreground">{t.ticker}</p>}
          </div>
          <div className="flex items-center gap-2">
            {t.currentPrice != null && <span className="text-base tabular-nums">{$(t.currentPrice)}</span>}
            {deltaPct != null && <PctArrow value={deltaPct} />}
          </div>
        </div>
      )}

      {/* ── 3. Analysis + Summary ── */}
      <div className="px-4 py-3" onClick={() => setExpanded(!expanded)}>
        {/* Analysis line */}
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap text-sm">
          {isPass
            ? <span className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />
            : con.isStrong
              ? <PnlArrow direction={isBull ? "up" : "down"} className="h-4 w-4 shrink-0" />
              : <span className={cn("size-2 rounded-full shrink-0", isBull ? "bg-positive" : "bg-negative")} />
          }
          <Tooltip>
            <TooltipTrigger render={<span className="font-medium cursor-default">{con.label}</span>} />
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {con.label} — {t.confidenceScore}% confidence based on signal quality, data consistency, and directional conviction.
            </TooltipContent>
          </Tooltip>
          {!isPass && t.targetPrice && t.targetPrice > 0 && (
            <>
              <span>Price target: <span className="tabular-nums font-medium">{$(t.targetPrice)}</span></span>
              {upsidePct != null && <PctArrow value={upsidePct} />}
              {t.entryPrice && t.entryPrice > 0 && <span>from <span className="tabular-nums">{$(t.entryPrice)}</span></span>}
            </>
          )}
          {isPass && t.entryPrice && t.entryPrice > 0 && (
            <span className="text-muted-foreground tabular-nums">at {$(t.entryPrice)}</span>
          )}
        </div>
        <p className={cn("text-sm text-muted-foreground leading-relaxed", !expanded && "line-clamp-3")}>
          {t.reasoningSummary}
        </p>
      </div>

      {/* ── 4. Footer ── */}
      <div className="px-4 py-2 flex items-center gap-2">
        {sources.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="flex -space-x-1">
              {sources.slice(0, 4).map((s, i) => {
                const d = s.url ? domain(s.url) : null;
                return d ? <span key={i} className="rounded-full border border-background" style={{ zIndex: 4 - i }}><Favicon domain={d} size={14} /></span> : null;
              })}
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">{sources.length} sources</span>
          </div>
        )}
        {t.createdAt && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {sources.length > 0 && <span className="opacity-30 mx-0.5">·</span>}
            {formatDate(t.createdAt)}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {t.analystName && t.analystId && (
            <a href={`/analysts/${t.analystId}`} className="hidden sm:inline-flex items-center h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              {t.analystName}
            </a>
          )}
          {t.runId && (
            <a href={`/runs/${t.runId}`} className="inline-flex items-center h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              View run
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
