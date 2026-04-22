"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EducationEmptyState } from "@/components/domain/education-card";
import { SignalRow } from "@/components/intelligence/signal-feed";
import { FindingDetailDialog } from "@/components/intelligence/finding-detail";
import {
  SignalFilters,
  emptySignalFilters,
  hasActiveFilters,
  type SignalFiltersValue,
} from "@/components/intelligence/signal-filters";
import type { Signal } from "@/components/intelligence/types";

interface AnalystFindingsTabProps {
  analystId: string;
  /** Tickers to pre-suggest in the ticker combobox — typically holdings + watchlist. */
  tickerSuggestions?: string[];
}

// ── AnalystFindingsTab ──────────────────────────────────────────────────────
// Same signal card + shared filter row as /intelligence — analyst scoping
// happens at the API level (analystId=). Analyst + Route dimensions are
// hidden here since we're already scoped to one analyst. Filtering is
// entirely client-side over the loaded window.

export function AnalystFindingsTab({
  analystId,
  tickerSuggestions = [],
}: AnalystFindingsTabProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Signal | null>(null);
  const [filters, setFilters] = useState<SignalFiltersValue>(emptySignalFilters());

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ analystId, limit: "100" });
    fetch(`/api/intelligence/signals?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setSignals)
      .finally(() => setLoading(false));
  }, [analystId]);

  const handleSelect = useCallback((signal: Signal) => {
    setSelected(signal);
  }, []);

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (filters.tickers.length > 0 && !filters.tickers.some((t) => s.tickers.includes(t))) return false;
      if (filters.sectors.length > 0 && !filters.sectors.some((sec) => s.sectors.includes(sec))) return false;
      if (filters.industries.length > 0 && !filters.industries.some((ind) => s.industries.includes(ind))) return false;
      return true;
    });
  }, [signals, filters]);

  const noResults = !loading && filtered.length === 0;

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SignalFilters
            value={filters}
            onChange={setFilters}
            tickerSuggestions={tickerSuggestions}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : noResults ? (
          hasActiveFilters(filters) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No findings match your filters.
            </p>
          ) : (
            <EducationEmptyState stateKey="analyst-findings" />
          )
        ) : (
          <div className="space-y-2">
            {filtered.map((signal) => (
              <SignalRow key={signal.id} signal={signal} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>

      <FindingDetailDialog
        signal={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
