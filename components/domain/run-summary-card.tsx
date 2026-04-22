"use client";

import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Target,
} from "lucide-react";
import { StockLogo } from "@/components/StockLogo";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PickRanking = {
  rank: number;
  ticker: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  reasoning: string;
  action: "TRADE" | "WATCH" | "PASS";
};

export type RunSummaryData = {
  marketSummary: string;
  rankedPicks: PickRanking[];
  exposureBreakdown?: {
    longExposure: number;
    shortExposure: number;
    netExposure: number;
    sectorConcentration?: string;
  };
  riskNotes?: string[];
  overallAssessment?: string;
};

export type RunSummaryCardProps = ComponentProps<typeof Card> & RunSummaryData;

// ─── Verdict helper (matches thesis-card) ─────────────────────────────────────

function pickVerdict(
  action: "TRADE" | "WATCH" | "PASS",
  direction: "LONG" | "SHORT",
  confidence: number,
): { label: string; variant: "positive" | "negative" | "secondary" } {
  if (action === "PASS") return { label: "Pass", variant: "secondary" };
  if (action === "WATCH") return { label: "Watch", variant: "secondary" };
  if (direction === "LONG") {
    if (confidence >= 80) return { label: "Strong Buy", variant: "positive" };
    if (confidence >= 60) return { label: "Buy", variant: "positive" };
    return { label: "Lean Buy", variant: "positive" };
  }
  if (confidence >= 80) return { label: "Strong Sell", variant: "negative" };
  if (confidence >= 60) return { label: "Sell", variant: "negative" };
  return { label: "Lean Sell", variant: "negative" };
}

// ─── RunSummaryCard ───────────────────────────────────────────────────────────

export function RunSummaryCard({
  marketSummary,
  rankedPicks,
  exposureBreakdown,
  riskNotes = [],
  overallAssessment,
  className,
  ...cardProps
}: RunSummaryCardProps) {
  const trades = rankedPicks.filter((p) => p.action === "TRADE");

  return (
    <Card className={cn("overflow-hidden p-0", className)} {...cardProps}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Portfolio Synthesis</span>
        </div>
        <Badge variant="secondary">
          <Target className="h-2.5 w-2.5" />
          {trades.length} trade{trades.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* ── Market summary ──────────────────────────────── */}
        <p className="text-sm text-foreground/80 leading-relaxed">
          {marketSummary}
        </p>

        {/* ── Ranked picks — trade-table style rows ──────── */}
        {rankedPicks.length > 0 && (
          <div>
            {rankedPicks.map((pick) => {
              const isLong = pick.direction === "LONG";
              const DirIcon = isLong ? ArrowUpRight : ArrowDownRight;
              const verdict = pickVerdict(pick.action, pick.direction, pick.confidence);

              return (
                <div
                  key={`${pick.ticker}-${pick.rank}`}
                  className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                >
                  <StockLogo ticker={pick.ticker} size="sm" />
                  <span className="text-sm font-brand font-semibold min-w-0 truncate">
                    {pick.ticker}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-xs font-medium",
                      isLong ? "text-positive" : "text-negative",
                    )}
                  >
                    <DirIcon className="h-3 w-3" />
                    {pick.direction}
                  </span>
                  <span
                    className={cn(
                      "text-xs tabular-nums font-medium",
                      pick.confidence >= 70
                        ? "text-positive"
                        : pick.confidence >= 50
                          ? "text-amber-500"
                          : "text-negative",
                    )}
                  >
                    {pick.confidence}%
                  </span>
                  <Badge variant={verdict.variant} className="ml-auto">
                    {verdict.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Exposure — simple inline text ───────────────── */}
        {exposureBreakdown && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>
              <span className="uppercase tracking-wide">Long</span>{" "}
              <span className="tabular-nums font-medium text-positive">
                ${exposureBreakdown.longExposure.toLocaleString()}
              </span>
            </span>
            <span>
              <span className="uppercase tracking-wide">Short</span>{" "}
              <span className="tabular-nums font-medium text-negative">
                ${exposureBreakdown.shortExposure.toLocaleString()}
              </span>
            </span>
            <span>
              <span className="uppercase tracking-wide">Net</span>{" "}
              <span
                className={cn(
                  "tabular-nums font-medium",
                  exposureBreakdown.netExposure >= 0 ? "text-positive" : "text-negative",
                )}
              >
                ${Math.abs(exposureBreakdown.netExposure).toLocaleString()}
                {exposureBreakdown.netExposure >= 0 ? " long" : " short"}
              </span>
            </span>
          </div>
        )}

        {/* ── Risk notes — plain text ────────────────────── */}
        {riskNotes.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Risk Notes
            </span>
            {riskNotes.map((note, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                {note}
              </p>
            ))}
          </div>
        )}

        {/* ── Assessment — plain text ────────────────────── */}
        {overallAssessment && (
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assessment
            </span>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {overallAssessment}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
