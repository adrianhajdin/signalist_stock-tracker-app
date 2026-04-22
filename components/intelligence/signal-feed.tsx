"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FindingDetailDialog } from "@/components/intelligence/finding-detail";
import {
  SignalFilters,
  emptySignalFilters,
  type SignalFiltersValue,
  type AnalystOption,
} from "@/components/intelligence/signal-filters";
import { SkeletonCardStack } from "@/components/domain/skeleton-card";
import { Search } from "lucide-react";
import type { Signal } from "./types";
import { relativeTime } from "./types";
import { PerplexityLogo, FirecrawlLogo, FinnhubLogo, FmpLogo, EmailIcon } from "./icons";

type Icon = React.ComponentType<{ className?: string }>;

// ── Signal Feed ─────────────────────────────────────────────────────────────

interface SignalFeedProps {
  signals: Signal[];
  /** When true, exposes the Analyst + Route multi-selects. /intelligence only. */
  showAnalystFilter?: boolean;
  showRouteFilter?: boolean;
  /** Seed for the ticker combobox "Your stocks" group (analyst pages). */
  tickerSuggestions?: string[];
}

export function SignalFeed({
  signals,
  showAnalystFilter = true,
  showRouteFilter = true,
  tickerSuggestions = [],
}: SignalFeedProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<SignalFiltersValue>(emptySignalFilters());
  const [selected, setSelected] = useState<Signal | null>(null);

  // Derive analyst options from signals' routes — matches exactly the analyst
  // set that has anything routable on this page.
  const analystOptions = useMemo<AnalystOption[]>(() => {
    const map = new Map<string, string>();
    for (const s of signals) {
      for (const r of s.routes) {
        if (r.analyst) map.set(r.analyst.id, r.analyst.name);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [signals]);

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (filters.tickers.length > 0 && !filters.tickers.some((t) => s.tickers.includes(t))) return false;
      if (filters.sectors.length > 0 && !filters.sectors.some((sec) => s.sectors.includes(sec))) return false;
      if (filters.industries.length > 0 && !filters.industries.some((ind) => s.industries.includes(ind))) return false;
      if (filters.analystIds.length > 0 && !s.routes.some((r) => filters.analystIds.includes(r.analystId))) return false;
      if (filters.routeReasonCode && !s.routes.some((r) => r.routeReasonCode === filters.routeReasonCode)) return false;
      if (filters.sources.length > 0 && !filters.sources.includes(s.searchTool ?? "")) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.headline.toLowerCase().includes(q) ||
          s.tickers.some((t) => t.toLowerCase().includes(q)) ||
          s.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [signals, search, filters]);

  const handleSelect = useCallback((signal: Signal) => {
    setSelected(signal);
  }, []);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Search + shared filter row — single line on desktop, wraps on mobile */}
        <div className="flex flex-wrap items-center gap-2">
          <SignalFilters
            value={filters}
            onChange={setFilters}
            analystOptions={analystOptions}
            showAnalyst={showAnalystFilter}
            showRoute={showRouteFilter}
            tickerSuggestions={tickerSuggestions}
          />
          <div className="relative w-full sm:ml-auto sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search signals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Signal list — aggregate signals (market movers, earnings calendar)
            render in the SAME SignalRow shell as individual signals. The rich
            table of tickers/prices lives in the detail dialog instead. */}
        <div className="space-y-2">
          {filtered.length === 0 &&
            (signals.length === 0 ? (
              <SkeletonCardStack
                count={3}
                title="No findings yet"
                subtitle="Every morning, your analysts' monitors search the web, scan market movers, and extract domain sources. Findings appear here automatically."
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No findings match your filters
              </p>
            ))}
          {filtered.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onSelect={handleSelect}
            />
          ))}
        </div>

        <FindingDetailDialog
          signal={selected}
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      </div>
    </TooltipProvider>
  );
}

// ── Aggregate helpers ───────────────────────────────────────────────────────

const AGGREGATE_TITLES: Record<string, string> = {
  MARKET_MOVERS_GAINERS: "Top Gainers",
  MARKET_MOVERS_LOSERS: "Top Losers",
  MARKET_MOVERS_ACTIVES: "Most Active",
  EARNINGS_CALENDAR: "Upcoming Earnings",
};

export function aggregateTitle(aggregateType: string | null): string {
  if (!aggregateType) return "Market Summary";
  return AGGREGATE_TITLES[aggregateType] ?? "Market Summary";
}

/** Comma-joined `$TICKER` preview for aggregate rows. Caps at 12 tickers to
 *  keep the two-line clamp honest. */
export function aggregatePreview(signal: Signal): string {
  const count = signal.itemCount ?? signal.tickers.length;
  const max = 12;
  const head = signal.tickers.slice(0, max).map((t) => `$${t}`).join(", ");
  const remaining = Math.max(0, count - max);
  return remaining > 0 ? `${head} · and ${remaining} more` : head;
}

// ── Signal Row ──────────────────────────────────────────────────────────────

export const SignalRow = memo(function SignalRow({
  signal,
  onSelect,
}: {
  signal: Signal;
  onSelect: (signal: Signal) => void;
}) {
  const sourceCount = signal.sourceUrls.length;
  const primarySource = signal.sourceNames[0];
  const primaryDomain = extractDomainFromUrls(signal.sourceUrls);
  const isEmail = signal.searchTool === "EMAIL_INGEST";
  const isAggregate = signal.aggregateType != null;

  // Aggregate rows use a friendly title and a ticker preview instead of the
  // producer's headline/summary. The source row underneath stays identical
  // so the row reads the same as every other card.
  const title = isAggregate ? aggregateTitle(signal.aggregateType) : signal.headline;
  const preview = isAggregate ? aggregatePreview(signal) : signal.summary;

  // Tool logo for aggregates (FMP, Finnhub, etc.). Falls back to Favicon when
  // we can't resolve a tool config — e.g. Sonar-style signals keep their
  // existing favicon rendering.
  const toolConfig = signal.searchTool ? TOOL_CONFIG[signal.searchTool] : null;
  const AggregateSourceIcon = toolConfig?.icon;

  return (
    <Card
      className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => onSelect(signal)}
    >
      <div className="space-y-2">
        {/* Row 1: title */}
        <p className="text-sm font-medium leading-tight">{title}</p>

        {/* Row 2: preview — summary for news, ticker list for aggregates */}
        <p className="text-sm text-muted-foreground line-clamp-2">{preview}</p>

        {/* Row 3: source + timestamp. Identical shell across card variants:
            icon + source name · relative time. Email swaps the favicon for a
            mailbox icon; aggregates swap for the tool logo. */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isAggregate && AggregateSourceIcon ? (
            <>
              <AggregateSourceIcon className="h-4 w-4 shrink-0" />
              {primarySource && <span>{primarySource}</span>}
            </>
          ) : isEmail ? (
            <>
              <EmailIcon className="h-4 w-4 shrink-0" />
              {primarySource && <span>{primarySource}</span>}
            </>
          ) : sourceCount > 1 ? (
            <div className="flex -space-x-2">
              {signal.sourceUrls.map((url, i) => {
                const domain = extractDomainFromUrls([url]);
                return (
                  <span
                    key={`${url}-${i}`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background"
                  >
                    {domain && <Favicon domain={domain} size={16} />}
                  </span>
                );
              })}
            </div>
          ) : (
            <>
              {primaryDomain && <Favicon domain={primaryDomain} />}
              {primarySource && <span>{primarySource}</span>}
            </>
          )}
          <span>·</span>
          <span className="tabular-nums">{relativeTime(signal.createdAt)}</span>
        </div>
      </div>
    </Card>
  );
});


// ── Favicon ──────────────────────────────────────────────────────────────────
// Uses Google's favicon service for any domain.

export function Favicon({ domain, size = 16 }: { domain: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?sz=${size}&domain=${domain}`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
      loading="lazy"
    />
  );
}

/** Extract a domain from source URLs */
function extractDomainFromUrls(urls: string[]): string | null {
  for (const url of urls) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { /* skip */ }
  }
  return null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TOOL_CONFIG: Record<string, { name: string; icon: Icon }> = {
  PERPLEXITY_SONAR: { name: "Perplexity Sonar", icon: PerplexityLogo },
  FMP: { name: "Financial Modeling Prep", icon: FmpLogo },
  FINNHUB: { name: "Finnhub", icon: FinnhubLogo },
  FIRECRAWL: { name: "Firecrawl", icon: FirecrawlLogo },
};

