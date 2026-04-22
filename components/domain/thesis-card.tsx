"use client";

import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PnlBadge } from "@/components/ui/pnl-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { StockLogo } from "@/components/StockLogo";

import {
  ThesisSheetBody,
  verdictLabel,
  hasFundamentalDetails,
} from "@/components/agent/sheets/ThesisSheet";
import type { FundamentalsData, ThesisCardData } from "@/components/agent/sheets/ThesisSheet";

// Types are defined in ThesisSheet.tsx (the more primitive file) and re-exported
// here so existing consumers importing from thesis-card don't need to change.
export type { FundamentalsData, ThesisCardData };

export type ThesisCardProps = ComponentProps<typeof Card> &
  ThesisCardData & {
    /**
     * Optional render-prop replacement for the default card trigger.
     * When provided, it is used as the entire SheetTrigger surface and the
     * built-in card layout is suppressed. The original sheet content is
     * preserved. Used by ThesisMiniCard so the carousel cards open the
     * same sheet that the full ThesisCard opens.
     */
    customTrigger?: React.ReactElement;
  };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rrRatio(entry: number, target: number, stop: number): string {
  const risk = entry - stop;
  if (risk === 0) return "\u2014";
  return ((target - entry) / risk).toFixed(1);
}

// Re-export for consumers that import from thesis-card
export { verdictLabel, hasFundamentalDetails };

// ─── ThesisCard ───────────────────────────────────────────────────────────────

export function ThesisCard({
  ticker,
  direction,
  confidence_score,
  reasoning_summary,
  thesis_bullets = [],
  risk_flags = [],
  entry_price,
  target_price,
  stop_loss,
  hold_duration,
  signal_types = [],
  sources: _sources = [],
  pass_reason,
  company_name,
  exchange,
  fundamentals,
  status,
  customTrigger,
  className,
  ...cardProps
}: ThesisCardProps) {
  const isLong = direction === "LONG";
  const isPass = direction === "PASS";

  const DirIcon = isLong ? TrendingUp : TrendingDown;

  const hasEntry = entry_price != null;
  const hasTarget = target_price != null;
  const hasStop = stop_loss != null;

  const rr =
    hasEntry && hasTarget && hasStop
      ? rrRatio(entry_price!, target_price!, stop_loss!)
      : null;

  const displayName = company_name ?? ticker;
  const verdict = verdictLabel(direction, confidence_score);

  // ── Shared header for ALL states ──────────────────────────────
  const header = (
    <div className="px-3 py-2 w-full border-b bg-muted flex items-center justify-between gap-4">
      {/* Left: logo + name + confidence with tooltip */}
      <div className="flex items-center gap-2 min-w-0">
        <StockLogo ticker={ticker} size="sm" />
        <span className="text-sm font-brand font-semibold text-foreground truncate">
          {displayName}
        </span>
        <Tooltip>
          <TooltipTrigger render={<span className="text-sm tabular-nums text-muted-foreground cursor-default" />}>
            {confidence_score}%
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Confidence score — signal quality, data consistency, and directional conviction
          </TooltipContent>
        </Tooltip>
      </div>
      {/* Right: status + verdict badge */}
      <div className="flex items-center gap-1.5">
        {status && status !== "ACTIVE" && (
          <Badge variant="outline">
            {status}
          </Badge>
        )}
        <Badge variant={verdict.variant}>
          {!isPass && <DirIcon className="h-3.5 w-3.5" />}
          {verdict.label}
        </Badge>
      </div>
    </div>
  );

  // ── PASS state — clickable card with sheet for full details ──
  if (isPass) {
    const passCardContent = (
      <Card
        className={cn(
          "overflow-hidden p-0 gap-0 cursor-pointer transition-colors hover:border-foreground/25",
          className,
        )}
        {...cardProps}
      >
        {header}
        {(pass_reason || reasoning_summary) && (
          <div className="px-3 py-2">
            <p className="text-sm font-light text-muted-foreground leading-relaxed line-clamp-2">
              {pass_reason || reasoning_summary}
              <span className="text-foreground/50 ml-1">&hellip; details</span>
            </p>
          </div>
        )}
      </Card>
    );

    return (
      <Sheet>
        <SheetTrigger render={customTrigger ?? passCardContent} />
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto"
        >
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">{displayName} Thesis</SheetTitle>
          </SheetHeader>

          <ThesisSheetBody
            ticker={ticker}
            direction={direction}
            confidence_score={confidence_score}
            reasoning_summary={reasoning_summary}
            pass_reason={pass_reason}
            thesis_bullets={thesis_bullets}
            risk_flags={risk_flags}
            entry_price={entry_price}
            target_price={target_price}
            stop_loss={stop_loss}
            hold_duration={hold_duration}
            signal_types={signal_types}
            company_name={company_name}
            exchange={exchange}
            fundamentals={fundamentals}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // ── LONG/SHORT — same header + price rows + reasoning → sheet ──
  const cardContent = (
    <Card
      className={cn(
        "overflow-hidden p-0 gap-0 cursor-pointer transition-colors hover:border-foreground/25",
        className,
      )}
      {...cardProps}
    >
      {header}
      {/* ── Price rows ────────────────────────────────────────── */}
      {(hasEntry || hasTarget || hasStop) && (
        <div className="flex flex-col">
          {hasEntry && (
            <div className="px-3 py-1 flex items-center border-b">
              <span className="text-sm font-light text-muted-foreground grow">Entry</span>
              <span className="text-sm font-medium tabular-nums text-foreground">${entry_price!.toFixed(2)}</span>
            </div>
          )}
          {hasTarget && (
            <div className="px-3 py-1 flex items-center gap-2 border-b">
              <span className="text-sm font-light text-muted-foreground grow">Target</span>
              {hasEntry && (
                <PnlBadge value={((target_price! - entry_price!) / entry_price!) * 100} />
              )}
              <span className="text-sm font-medium tabular-nums text-positive">${target_price!.toFixed(2)}</span>
            </div>
          )}
          {hasStop && (
            <div className="px-3 py-1 flex items-center gap-2 border-b">
              <span className="text-sm font-light text-muted-foreground grow">Stop</span>
              {hasEntry && (
                <PnlBadge value={((stop_loss! - entry_price!) / entry_price!) * 100} />
              )}
              <span className="text-sm font-medium tabular-nums text-negative">${stop_loss!.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
      {/* ── Meta line + reasoning preview ─────────────────────── */}
      <div className="px-3 pt-2 pb-0">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <span>{direction}</span>
          {hold_duration && (
            <>
              <span className="opacity-30">&middot;</span>
              <span>{hold_duration}</span>
            </>
          )}
          {rr != null && (
            <>
              <span className="opacity-30">&middot;</span>
              <span>{rr}&times; R:R</span>
            </>
          )}
        </span>
      </div>
      {reasoning_summary && (
        <div className="px-3 pt-1 pb-2">
          <p className="text-sm font-light text-muted-foreground leading-relaxed line-clamp-3">
            {reasoning_summary}
            <span className="text-foreground/50 ml-1">&hellip; read more</span>
          </p>
        </div>
      )}
    </Card>
  );

  return (
    <Sheet>
      <SheetTrigger render={customTrigger ?? cardContent} />

      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="sr-only">{displayName} Thesis</SheetTitle>
        </SheetHeader>

        <ThesisSheetBody
          ticker={ticker}
          direction={direction}
          confidence_score={confidence_score}
          reasoning_summary={reasoning_summary}
          pass_reason={pass_reason}
          thesis_bullets={thesis_bullets}
          risk_flags={risk_flags}
          entry_price={entry_price}
          target_price={target_price}
          stop_loss={stop_loss}
          hold_duration={hold_duration}
          signal_types={signal_types}
          company_name={company_name}
          exchange={exchange}
          fundamentals={fundamentals}
        />
      </SheetContent>
    </Sheet>
  );
}
