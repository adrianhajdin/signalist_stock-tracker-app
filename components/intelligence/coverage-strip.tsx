"use client";

import { useState } from "react";
import { BarGauge } from "@/components/ui/bar-gauge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CoverageData {
  total: number;
  orphanCount: number;
  sectors: { name: string; count: number }[];
  industries: { name: string; count: number }[];
  themes: { name: string; count: number }[];
  since: string | null;
}

interface CoverageStripProps {
  data: CoverageData | null;
  loading: boolean;
  days: number;
  activeSector: string | null;
  activeIndustry: string | null;
  activeTheme: string | null;
  orphanOnly: boolean;
  onSectorClick: (name: string | null) => void;
  onIndustryClick: (name: string | null) => void;
  onThemeClick: (name: string | null) => void;
  onOrphanToggle: () => void;
}

// ── Coverage strip — 3-column signal universe breakdown ─────────────────────
// Matches the minimal bar pattern: uppercase label, segmented bar, count.
// Columns scroll independently if they overflow. Click a row → filter.

export function CoverageStrip({
  data,
  loading,
  days,
  activeSector,
  activeIndustry,
  activeTheme,
  orphanOnly,
  onSectorClick,
  onIndustryClick,
  onThemeClick,
  onOrphanToggle,
}: CoverageStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            {[1, 2, 3, 4].map((j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.total === 0) return null;

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Header: total + orphan chip */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Signal universe — last {days}d
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {data.total} signals
            </span>
          </div>
          {data.orphanCount > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={orphanOnly ? "secondary" : "ghost"}
                    size="sm"
                    onClick={onOrphanToggle}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span className="tabular-nums">{data.orphanCount} orphan</span>
                  </Button>
                }
              />
              <TooltipContent className="max-w-xs">
                Signals with no sector AND no theme tag. Either Sonar drift or missing normalization aliases — these slip past the universe fence.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 3-column breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <CoverageColumn
            label="Sectors"
            tooltip="Canonical GICS sectors tagged on recent signals."
            items={data.sectors}
            total={data.total}
            active={activeSector}
            onClick={onSectorClick}
          />
          <CoverageColumn
            label="Industries"
            tooltip="Canonical GICS industries tagged on recent signals."
            items={data.industries}
            total={data.total}
            active={activeIndustry}
            onClick={onIndustryClick}
          />
          <CoverageColumn
            label="Themes"
            tooltip="Analyst-defined themes tagged on recent signals."
            items={data.themes}
            total={data.total}
            active={activeTheme}
            onClick={onThemeClick}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── One column (sector / industry / theme) ──────────────────────────────────

const INITIAL_ROWS = 6;

function CoverageColumn({
  label,
  tooltip,
  items,
  total,
  active,
  onClick,
}: {
  label: string;
  tooltip: string;
  items: { name: string; count: number }[];
  total: number;
  active: string | null;
  onClick: (name: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_ROWS);
  const remaining = items.length - INITIAL_ROWS;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-help" />}>
            <Info className="h-3 w-3 text-muted-foreground/70" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
        </Tooltip>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 text-xs"
            onClick={() => onClick(null)}
          >
            Clear
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">—</p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((item) => {
            const isActive = active === item.name;
            const pct = total > 0 ? item.count / total : 0;
            return (
              <button
                key={item.name}
                onClick={() => onClick(isActive ? null : item.name)}
                className={cn(
                  "w-full flex items-center gap-3 text-left rounded-md px-1.5 py-1 -mx-1.5 hover:bg-accent/40 transition-colors",
                  isActive && "bg-accent/60",
                )}
              >
                <span className="flex-1 min-w-0 truncate text-xs">{item.name}</span>
                <BarGauge
                  mode="fill"
                  value={pct}
                  color="muted-foreground"
                  segments={16}
                  className="w-16 shrink-0"
                />
                <span className="text-xs tabular-nums text-muted-foreground w-6 text-right shrink-0">
                  {item.count}
                </span>
              </button>
            );
          })}
          {remaining > 0 && !expanded && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setExpanded(true)}
            >
              +{remaining} more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
