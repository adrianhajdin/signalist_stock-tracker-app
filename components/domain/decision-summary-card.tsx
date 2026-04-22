"use client";

import type { ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StockLogo } from "@/components/StockLogo";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionPick = {
  rank: number;
  ticker: string;
  direction: string;
  confidence: number;
  reasoning: string;
  action: string;
};

export type DecisionSummaryData = {
  rankedPicks: DecisionPick[];
};

export type DecisionSummaryCardProps = ComponentProps<typeof Card> &
  DecisionSummaryData;

// ─── Action → status mapping (label, dot, tooltip) ───────────────────────────

type ActionStatus = {
  label: string;
  dotClass: string;
  tooltip: string;
};

const ACTION_STATUS: Record<string, ActionStatus> = {
  INITIATE:     { label: "Order",    dotClass: "bg-amber-500 animate-pulse", tooltip: "New position opened this run" },
  ADD:          { label: "Add",      dotClass: "bg-amber-500 animate-pulse", tooltip: "Added to existing position" },
  HOLD:         { label: "Hold",     dotClass: "bg-muted-foreground/60",     tooltip: "Position held — thesis still valid" },
  REDUCE:       { label: "Reduce",   dotClass: "bg-amber-500",               tooltip: "Trimmed position size" },
  EXIT:         { label: "Sold",     dotClass: "bg-positive",                tooltip: "Position closed this run" },
  WATCH:        { label: "Watch",    dotClass: "bg-blue-500",                tooltip: "Added to watchlist" },
  REMOVE_WATCH: { label: "Unwatch",  dotClass: "bg-muted-foreground/60",     tooltip: "Removed from watchlist" },
  PASS:         { label: "Pass",     dotClass: "bg-muted-foreground/40",     tooltip: "Researched but not actioned" },
  FAILED:       { label: "Failed",   dotClass: "bg-negative",                tooltip: "Order rejected (e.g. duplicate position)" },
};

function getStatus(action: string): ActionStatus {
  return ACTION_STATUS[action.toUpperCase()] ?? ACTION_STATUS.PASS;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 70) return "text-positive";
  if (confidence >= 50) return "text-amber-500";
  return "text-negative";
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function PickRow({ pick }: { pick: DecisionPick }) {
  const status = getStatus(pick.action);

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <div className="flex items-center gap-1.5 rounded-md p-2 hover:bg-muted/70 transition-colors cursor-default" />
        }
      >
        <StockLogo ticker={pick.ticker} size="sm" />
        <span className="text-sm font-semibold font-brand shrink-0 mr-1">
          {pick.ticker}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="secondary" className="gap-1.5 font-normal">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", status.dotClass)} />
                  {status.label}
                </Badge>
              }
            />
            <TooltipContent>{status.tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="flex-1 min-w-0 text-right text-xs text-muted-foreground truncate">
          {pick.reasoning}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <StockLogo ticker={pick.ticker} size="md" />
            <div className="text-base font-semibold font-brand">{pick.ticker}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", status.dotClass)} />
              {status.label}
              {pick.direction && pick.direction !== "PASS" && (
                <span className="text-muted-foreground">· {pick.direction}</span>
              )}
            </Badge>
            <span className={cn("text-xs tabular-nums font-medium", confidenceColor(pick.confidence))}>
              {pick.confidence}% confidence
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{pick.reasoning}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── DecisionSummaryCard ─────────────────────────────────────────────────────

export function DecisionSummaryCard({
  rankedPicks,
  className,
  ...cardProps
}: DecisionSummaryCardProps) {
  return (
    <div className={cn("not-prose w-full", className)}>
      <Card className="p-1 gap-1" {...cardProps}>
        {rankedPicks.map((pick) => (
          <PickRow key={`${pick.ticker}-${pick.rank}`} pick={pick} />
        ))}
      </Card>
    </div>
  );
}
