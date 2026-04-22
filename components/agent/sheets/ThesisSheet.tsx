"use client";

/**
 * ThesisSheet — standalone sheet body extracted from thesis-card.tsx.
 *
 * Exports:
 *  - ThesisSheetBody: raw content (no Sheet wrapper). Used by ThesisCard.
 *  - ThesisSheet: controlled Sheet wrapping ThesisSheetBody. Used by
 *    ThesisCardRenderer and any surface that needs to open the sheet
 *    programmatically without the card trigger.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PnlArrow } from "@/components/ui/pnl-arrow";
import { InfoRow } from "@/components/ui/info-row";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { StockLogo } from "@/components/StockLogo";
import { TickBar, PriceGauge, type Tick } from "@/components/ui/gauge";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { SourceChipData } from "@/components/chat/SourceChip";

// ─── Types (canonical definitions — re-exported from thesis-card.tsx) ─────────

export type FundamentalsData = {
  market_cap?: number;
  pe_ratio?: number;
  beta?: number;
  avg_volume?: number;
  high_52w?: number;
  low_52w?: number;
  sector?: string;
  analyst_consensus?: { buy: number; hold: number; sell: number };
};

export type ThesisCardData = {
  ticker: string;
  direction: "LONG" | "SHORT" | "PASS";
  confidence_score: number;
  reasoning_summary?: string;
  thesis_bullets?: string[];
  risk_flags?: string[];
  entry_price?: number | null;
  target_price?: number | null;
  stop_loss?: number | null;
  hold_duration?: string;
  signal_types?: string[];
  sources?: SourceChipData[];
  pass_reason?: string;
  company_name?: string | null;
  exchange?: string | null;
  fundamentals?: FundamentalsData | null;
  status?: "ACTIVE" | "INVALIDATED" | "CLOSED" | "SUPERSEDED";
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive a human-friendly verdict from direction + confidence */
export function verdictLabel(
  direction: "LONG" | "SHORT" | "PASS",
  confidence: number,
): { label: string; variant: "positive" | "negative" | "secondary" } {
  if (direction === "PASS") return { label: "Pass", variant: "secondary" };
  if (direction === "LONG") {
    if (confidence >= 80) return { label: "Strong Buy", variant: "positive" };
    if (confidence >= 60) return { label: "Buy", variant: "positive" };
    return { label: "Lean Buy", variant: "positive" };
  }
  // SHORT
  if (confidence >= 80) return { label: "Strong Sell", variant: "negative" };
  if (confidence >= 60) return { label: "Sell", variant: "negative" };
  return { label: "Lean Sell", variant: "negative" };
}

function fmtCompact(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtVol(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function hasFundamentalDetails(f: FundamentalsData): boolean {
  return (
    f.market_cap != null ||
    f.pe_ratio != null ||
    f.beta != null ||
    f.avg_volume != null ||
    f.high_52w != null ||
    f.low_52w != null ||
    !!f.sector
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BulletSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      <ul className="list-disc pl-4 marker:text-muted-foreground/40 space-y-1">
        {items.map((b, i) => (
          <li key={i} className="text-sm text-muted-foreground leading-relaxed">
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceTargetsBlock({
  entry,
  target,
  stop,
}: {
  entry: number;
  target: number | null;
  stop: number | null;
}) {
  const lo = Math.min(stop ?? Number.POSITIVE_INFINITY, entry, target ?? Number.POSITIVE_INFINITY);
  const hi = Math.max(stop ?? Number.NEGATIVE_INFINITY, entry, target ?? Number.NEGATIVE_INFINITY);
  const safeLo = Number.isFinite(lo) ? lo : entry * 0.95;
  const safeHi = Number.isFinite(hi) ? hi : entry * 1.05;
  const span = safeHi - safeLo || entry * 0.1;
  const COUNT = 60;
  const EDGE_PAD = 3;
  const usable = COUNT - EDGE_PAD * 2 - 1;
  const entryIdx = Math.round(EDGE_PAD + ((entry - safeLo) / span) * usable);
  const entryPct = entryIdx / (COUNT - 1);

  return (
    <Card className="bg-muted/40 p-2 gap-6">
      <p className="text-sm font-medium">Price Targets</p>

      <div className="space-y-2">
        <div className="relative h-4">
          <span
            className="absolute -translate-x-1/2 text-xs font-medium tabular-nums whitespace-nowrap"
            style={{ left: `${entryPct * 100}%` }}
          >
            ${entry.toFixed(2)}
          </span>
        </div>

        <PriceGauge entry={entry} target={target} stop={stop} />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{stop != null ? `Stop $${stop.toFixed(2)}` : "Stop —"}</span>
          <span>{target != null ? `Target $${target.toFixed(2)}` : "Target —"}</span>
        </div>
      </div>
    </Card>
  );
}

function AnalystConsensusBlock({
  consensus,
}: {
  consensus: { buy: number; hold: number; sell: number };
}) {
  const { buy, hold, sell } = consensus;
  const total = buy + hold + sell;
  const buyPct = total > 0 ? buy / total : 0;
  const verdict =
    buyPct >= 0.7
      ? { label: "Strong Buy", variant: "positive" as const }
      : buyPct >= 0.5
        ? { label: "Buy", variant: "positive" as const }
        : buyPct >= 0.3
          ? { label: "Hold", variant: "secondary" as const }
          : { label: "Sell", variant: "negative" as const };

  const ticks: Tick[] = Array.from({ length: total }, (_, i) => ({
    color:
      i < sell
        ? "bg-negative"
        : i < sell + hold
          ? "bg-muted-foreground/40"
          : "bg-positive",
    tall: true,
  }));

  return (
    <Card className="bg-muted/40 p-2 gap-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Analyst Consensus</p>
        <Badge variant={verdict.variant} className="font-normal">
          {verdict.label}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Based on {total} {total === 1 ? "analyst" : "analysts"}
        </p>

        <TickBar ticks={ticks} />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-positive" />
            {buy} Bullish
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            {hold} Neutral
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-negative" />
            {sell} Bearish
          </span>
        </div>
      </div>
    </Card>
  );
}

function FundamentalsContent({ fundamentals }: { fundamentals: FundamentalsData }) {
  const { market_cap, pe_ratio, beta, avg_volume, high_52w, low_52w, sector } = fundamentals;
  return (
    <div className="flex flex-col gap-1">
      {sector && <InfoRow label="Sector" value={sector} />}
      {market_cap != null && (
        <InfoRow label="Market Cap" value={fmtCompact(market_cap)} mono />
      )}
      {pe_ratio != null && (
        <InfoRow label="P/E Ratio" value={`${pe_ratio.toFixed(1)}x`} mono />
      )}
      {beta != null && <InfoRow label="Beta" value={beta.toFixed(2)} mono />}
      {avg_volume != null && (
        <InfoRow label="Avg Volume (10d)" value={fmtVol(avg_volume)} mono />
      )}
      {high_52w != null && low_52w != null && (
        <InfoRow
          label="52W Range"
          mono
          value={`$${low_52w.toFixed(2)} – $${high_52w.toFixed(2)}`}
          border={false}
        />
      )}
    </div>
  );
}

// ─── ThesisSheetBody ──────────────────────────────────────────────────────────

export interface ThesisSheetBodyProps {
  ticker: string;
  direction: "LONG" | "SHORT" | "PASS";
  confidence_score: number;
  reasoning_summary?: string;
  pass_reason?: string;
  thesis_bullets: string[];
  risk_flags: string[];
  entry_price?: number | null;
  target_price?: number | null;
  stop_loss?: number | null;
  hold_duration?: string;
  signal_types: string[];
  company_name?: string | null;
  exchange?: string | null;
  fundamentals?: FundamentalsData | null;
}

export function ThesisSheetBody({
  ticker,
  direction,
  confidence_score,
  reasoning_summary,
  pass_reason,
  thesis_bullets,
  risk_flags,
  entry_price,
  target_price,
  stop_loss,
  signal_types,
  company_name,
  exchange,
  fundamentals,
}: ThesisSheetBodyProps) {
  const isPass = direction === "PASS";
  const displayName = company_name ?? ticker;
  const verdict = verdictLabel(direction, confidence_score);
  const DirIcon = direction === "LONG" ? TrendingUp : TrendingDown;
  const summaryText = isPass ? (pass_reason ?? reasoning_summary) : reasoning_summary;

  const hasEntry = entry_price != null;
  const hasTarget = target_price != null;
  const hasStop = stop_loss != null;
  const showLevels = !isPass && hasEntry && (hasTarget || hasStop);

  return (
    <div className="px-4 pb-6 pt-2 space-y-5">
      {/* ── Verdict ButtonGroup ──────────────────────────────── */}
      <div>
        <Tooltip>
          <TooltipTrigger
            render={
              <ButtonGroup className="cursor-default">
                <Badge variant={verdict.variant} className="rounded-r-none">
                  {!isPass && <DirIcon className="h-3 w-3" />}
                  {verdict.label}
                </Badge>
                <ButtonGroupSeparator />
                <Badge variant={verdict.variant} className="rounded-l-none tabular-nums">
                  {confidence_score}%
                </Badge>
              </ButtonGroup>
            }
          />
          <TooltipContent side="bottom" className="text-xs max-w-xs">
            Confidence score — signal quality, data consistency, and directional conviction
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Stock identity ───────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <StockLogo ticker={ticker} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold truncate">{displayName}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {ticker}
            {exchange ? ` · ${exchange}` : ""}
          </p>
        </div>
      </div>

      {/* ── Summary ───────────────────────────────────────────── */}
      {summaryText && (
        <p className="text-sm leading-relaxed">{summaryText}</p>
      )}

      {/* ── Bullish View ──────────────────────────────────────── */}
      {thesis_bullets.length > 0 && (
        <BulletSection
          title="Bullish View"
          icon={<PnlArrow direction="up" className="size-4" />}
          items={thesis_bullets}
        />
      )}

      {/* ── Bearish View ──────────────────────────────────────── */}
      {risk_flags.length > 0 && (
        <BulletSection
          title="Bearish View"
          icon={<PnlArrow direction="down" className="size-4" />}
          items={risk_flags}
        />
      )}

      {/* ── Price Targets ─────────────────────────────────────── */}
      {showLevels && (
        <PriceTargetsBlock
          entry={entry_price!}
          target={target_price ?? null}
          stop={stop_loss ?? null}
        />
      )}

      {/* ── Analyst Consensus ─────────────────────────────────── */}
      {fundamentals?.analyst_consensus &&
        (fundamentals.analyst_consensus.buy +
          fundamentals.analyst_consensus.hold +
          fundamentals.analyst_consensus.sell >
          0) && (
          <AnalystConsensusBlock consensus={fundamentals.analyst_consensus} />
        )}

      {/* ── Fundamentals ──────────────────────────────────────── */}
      {fundamentals && hasFundamentalDetails(fundamentals) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fundamentals</p>
          <FundamentalsContent fundamentals={fundamentals} />
        </div>
      )}

      {/* ── Signal types ──────────────────────────────────────── */}
      {signal_types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signal_types.map((s) => (
            <Badge key={s} variant="outline" className="font-normal">
              {s.replace(/_/g, " ").toLowerCase()}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ThesisSheet — controlled standalone sheet ────────────────────────────────

interface ThesisSheetProps extends ThesisCardData {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThesisSheet({ open, onOpenChange, ...data }: ThesisSheetProps) {
  const displayName = data.company_name ?? data.ticker;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-0">
          <SheetTitle className="sr-only">{displayName} Thesis</SheetTitle>
        </SheetHeader>
        <ThesisSheetBody
          ticker={data.ticker}
          direction={data.direction}
          confidence_score={data.confidence_score}
          reasoning_summary={data.reasoning_summary}
          pass_reason={data.pass_reason}
          thesis_bullets={data.thesis_bullets ?? []}
          risk_flags={data.risk_flags ?? []}
          entry_price={data.entry_price}
          target_price={data.target_price}
          stop_loss={data.stop_loss}
          hold_duration={data.hold_duration}
          signal_types={data.signal_types ?? []}
          company_name={data.company_name}
          exchange={data.exchange}
          fundamentals={data.fundamentals}
        />
      </SheetContent>
    </Sheet>
  );
}
