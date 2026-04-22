"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarGauge } from "@/components/ui/bar-gauge";
import type { CoverageData } from "@/components/intelligence/coverage-strip";

// ── Coverage tab ────────────────────────────────────────────────────────────
// Non-clickable breakdown of the last N days of signals. Three stacked
// muted-bg cards (Sector / Industry / Theme); each renders the top 15 as
// name + fill bar + count. "Show all" expands to the full list. Lives in
// HowItWorksSheet on /intelligence so the page header stays clean.

interface CoverageTabProps {
  data: CoverageData | null;
  days: number;
}

const INITIAL_ROWS = 15;

export function CoverageTab({ data, days }: CoverageTabProps) {
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Coverage stats aren&apos;t available yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last {days} days
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {data.total} signals
          {data.orphanCount > 0 ? ` · ${data.orphanCount} orphaned` : ""}
        </p>
      </div>

      <CoverageSection
        label="Sectors"
        items={data.sectors}
        total={data.total}
      />
      <CoverageSection
        label="Industries"
        items={data.industries}
        total={data.total}
      />
      <CoverageSection
        label="Themes"
        items={data.themes}
        total={data.total}
      />
    </div>
  );
}

// ── One section ─────────────────────────────────────────────────────────────

function CoverageSection({
  label,
  items,
  total,
}: {
  label: string;
  items: { name: string; count: number }[];
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_ROWS);
  const remaining = items.length - INITIAL_ROWS;

  return (
    <Card size="sm" className="bg-muted/40">
      <CardContent>
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {items.length}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No coverage yet.</p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((item) => {
              const pct = total > 0 ? item.count / total : 0;
              return (
                <div
                  key={item.name}
                  className="flex items-center gap-3 py-1"
                >
                  <span className="flex-1 min-w-0 truncate text-xs">
                    {item.name}
                  </span>
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
                </div>
              );
            })}

            {remaining > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less" : `Show all ${items.length}`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
