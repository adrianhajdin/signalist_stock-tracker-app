"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChipTabs, type ChipTabOption } from "@/components/ui/chip-tabs";
import { Info } from "lucide-react";
import type { RouteReasonCode } from "@/components/intelligence/types";

interface RoutingStats {
  total: number;
  legacy: number;
  byReason: Partial<Record<RouteReasonCode, number>>;
  since: string | null;
}

// ── Route reason groups ─────────────────────────────────────────────────────
// The router tags 8 distinct reason codes, but for the user three of them
// ("you already care about this ticker") collapse into one bucket. Keeping
// this mapping in one place so the strip chip, the API filter string, and
// the analyst signal feed all stay in sync.

export type RouteGroup =
  | "holdings"
  | "discovery"
  | "sector"
  | "industry"
  | "theme"
  | "cross"
  | "legacy";

export const ROUTE_GROUP_CODES: Record<RouteGroup, RouteReasonCode[]> = {
  holdings: ["POSITION", "WATCHLIST", "DIRECT_TICKER"],
  discovery: ["DISCOVERY"],
  sector: ["SECTOR_MATCH"],
  industry: ["INDUSTRY_MATCH"],
  theme: ["THEME_MATCH"],
  cross: ["CROSS_ANALYST"],
  legacy: [], // special-cased: counts routes with no routeReasonCode
};

const GROUP_LABEL: Record<RouteGroup, string> = {
  holdings: "Holdings",
  discovery: "Discovery",
  sector: "Sector",
  industry: "Industry",
  theme: "Theme",
  cross: "Cross-analyst",
  legacy: "Legacy",
};

const GROUP_TOOLTIP: Record<RouteGroup, string> = {
  holdings:
    "Signal mentions a ticker you already hold, watch, or have a ticker-specific monitor for. Bypasses the sector fence.",
  discovery:
    "Signal matched two or more universe dimensions (e.g. sector + theme). Came through the fence, not via a known ticker.",
  sector: "Signal matched only the analyst's sector dimension.",
  industry: "Signal matched only the industry dimension.",
  theme: "Signal matched only the theme dimension.",
  cross:
    "Signal was routed to another analyst first, cross-posted here because a ticker overlap exists.",
  legacy:
    "Routes from before the router tagged reason codes. Historical context only.",
};

// Display order — holdings first (most relevant), discovery next, then the
// single-dimension matches, then cross-analyst, then the legacy fallback.
const GROUP_DISPLAY_ORDER: RouteGroup[] = [
  "holdings",
  "discovery",
  "sector",
  "industry",
  "theme",
  "cross",
  "legacy",
];

function countForGroup(
  group: RouteGroup,
  stats: RoutingStats,
): number {
  if (group === "legacy") return stats.legacy;
  return ROUTE_GROUP_CODES[group].reduce(
    (acc, code) => acc + (stats.byReason[code] ?? 0),
    0,
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface RoutingStatsStripProps {
  analystId: string;
  days?: number;
  activeGroup?: RouteGroup | null;
  onGroupChange?: (group: RouteGroup | null) => void;
}

export function RoutingStatsStrip({
  analystId,
  days = 30,
  activeGroup = null,
  onGroupChange,
}: RoutingStatsStripProps) {
  const [stats, setStats] = useState<RoutingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analysts/${analystId}/routing-stats?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analystId, days]);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        0 routes in the last {days} days — this analyst&apos;s fence doesn&apos;t
        match any recent signals. Check sectors / industries / themes in the
        Config tab.
      </div>
    );
  }

  // Only show groups that have at least one route in the window. Keeps the
  // strip tight instead of stacking dead chips with zero counts.
  const visibleGroups: RouteGroup[] = GROUP_DISPLAY_ORDER.filter(
    (g) => countForGroup(g, stats) > 0,
  );

  const options: ChipTabOption<RouteGroup>[] = visibleGroups.map((g) => ({
    value: g,
    label: GROUP_LABEL[g],
    title: GROUP_TOOLTIP[g],
  }));

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Routes · {days}d
          </span>
          <Tooltip>
            <TooltipTrigger render={<span className="cursor-help" />}>
              <Info className="h-3 w-3 text-muted-foreground/70" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              How recent signals landed in this analyst&apos;s inbox, grouped
              by why they matched. Click a chip to filter the list below.
            </TooltipContent>
          </Tooltip>
        </div>
        <span className="text-sm tabular-nums font-medium">{stats.total}</span>

        <ChipTabs<RouteGroup>
          options={options}
          value={activeGroup}
          onChange={(v) => onGroupChange?.(v)}
          className="ml-1"
        />
      </div>
    </TooltipProvider>
  );
}
