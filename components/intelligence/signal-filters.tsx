"use client";

import { useEffect, useState } from "react";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { StockLogo } from "@/components/StockLogo";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { useDebounce } from "@/hooks/useDebounce";
import { GICS_SECTORS, GICS_INDUSTRIES } from "@/lib/universe/gics";
import { cn } from "@/lib/utils";
import { ROUTE_REASON_LABELS, type RouteReasonCode } from "./types";

// ── Public API ───────────────────────────────────────────────────────────────

export interface SignalFiltersValue {
  tickers: string[];
  sectors: string[];
  industries: string[];
  analystIds: string[];
  routeReasonCode: RouteReasonCode | null;
  /** Matches Signal.searchTool. Empty = no filter. */
  sources: string[];
}

export interface AnalystOption {
  id: string;
  name: string;
}

export function emptySignalFilters(): SignalFiltersValue {
  return {
    tickers: [],
    sectors: [],
    industries: [],
    analystIds: [],
    routeReasonCode: null,
    sources: [],
  };
}

export function hasActiveFilters(v: SignalFiltersValue): boolean {
  return (
    v.tickers.length > 0 ||
    v.sectors.length > 0 ||
    v.industries.length > 0 ||
    v.analystIds.length > 0 ||
    v.routeReasonCode != null ||
    v.sources.length > 0
  );
}

// ── Source filter options ─────────────────────────────────────────────────
// Keys match Signal.searchTool; labels are what the user sees. Firecrawl is
// intentionally absent — it's an enrichment layer that writes Artifacts, not
// Signals, so no Signal row ever has `searchTool = "FIRECRAWL"`.

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "EMAIL_INGEST", label: "Email" },
  { value: "PERPLEXITY_SONAR", label: "Sonar" },
  { value: "FMP", label: "FMP" },
  { value: "FINNHUB", label: "Finnhub" },
];

interface SignalFiltersProps {
  value: SignalFiltersValue;
  onChange: (next: SignalFiltersValue) => void;
  analystOptions?: AnalystOption[];
  showAnalyst?: boolean;
  showRoute?: boolean;
  tickerSuggestions?: string[];
}

/**
 * Renders the filter triggers as inline elements — no outer wrapper. The
 * parent places them in a flex row together with the search input.
 */
export function SignalFilters({
  value,
  onChange,
  analystOptions = [],
  showAnalyst = false,
  showRoute = false,
  tickerSuggestions = [],
}: SignalFiltersProps) {
  const patch = <K extends keyof SignalFiltersValue>(
    k: K,
    next: SignalFiltersValue[K],
  ) => onChange({ ...value, [k]: next });

  const active = hasActiveFilters(value);

  return (
    <>
      <TickerFilter
        values={value.tickers}
        suggestions={tickerSuggestions}
        onChange={(v) => patch("tickers", v)}
      />
      <StaticMultiFilter
        label="Sector"
        values={value.sectors}
        options={GICS_SECTORS as unknown as string[]}
        onChange={(v) => patch("sectors", v)}
      />
      <StaticMultiFilter
        label="Industry"
        values={value.industries}
        options={GICS_INDUSTRIES as unknown as string[]}
        onChange={(v) => patch("industries", v)}
      />
      {showAnalyst && (
        <AnalystFilter
          values={value.analystIds}
          options={analystOptions}
          onChange={(v) => patch("analystIds", v)}
        />
      )}
      {showRoute && (
        <RouteFilter
          value={value.routeReasonCode}
          onChange={(v) => patch("routeReasonCode", v)}
        />
      )}
      <SourceFilter
        values={value.sources}
        onChange={(v) => patch("sources", v)}
      />
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(emptySignalFilters())}
        >
          Clear
        </Button>
      )}
    </>
  );
}

// ── Filter trigger ──────────────────────────────────────────────────────────
// Returns a <Button> element (NOT a component) so base-ui's PopoverTrigger
// `render` prop merges click handlers, aria-expanded, and ref directly onto
// the Button. Wrapping in a component swallows those props — the trigger
// stops being clickable.
//
// Inactive: default outline, muted foreground. Active (count > 0):
// foreground-color border + foreground text, count in a small primary badge
// instead of the chevron.

function renderFilterTrigger(label: string, count: number) {
  const isActive = count > 0;
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "font-normal",
        isActive
          ? "border-foreground text-foreground"
          : "text-muted-foreground",
      )}
    >
      {label}
      {isActive ? (
        <Badge
          variant="default"
          className="h-4 min-w-4 px-1 tabular-nums"
        >
          {count}
        </Badge>
      ) : (
        <ChevronsUpDown />
      )}
    </Button>
  );
}

// ── Static multi combobox (Sector, Industry) ────────────────────────────────

function StaticMultiFilter({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v],
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={renderFilterTrigger(label, values.length)}
      />
      <PopoverContent align="start" className="p-0">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  data-checked={values.includes(opt) ? "true" : undefined}
                  onSelect={() => toggle(opt)}
                >
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Analyst multi filter ────────────────────────────────────────────────────

function AnalystFilter({
  values,
  options,
  onChange,
}: {
  values: string[];
  options: AnalystOption[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(
      values.includes(id) ? values.filter((x) => x !== id) : [...values, id],
    );

  if (options.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={renderFilterTrigger("Analyst", values.length)}
      />
      <PopoverContent align="start" className="p-0">
        <Command>
          <CommandInput placeholder="Search analysts…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  data-checked={values.includes(o.id) ? "true" : undefined}
                  onSelect={() => toggle(o.id)}
                >
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Route single-select ─────────────────────────────────────────────────────

const ROUTE_REASON_CODES: RouteReasonCode[] = [
  "DISCOVERY",
  "SECTOR_MATCH",
  "INDUSTRY_MATCH",
  "THEME_MATCH",
  "WATCHLIST",
  "POSITION",
  "DIRECT_TICKER",
  "CROSS_ANALYST",
];

function RouteFilter({
  value,
  onChange,
}: {
  value: RouteReasonCode | null;
  onChange: (next: RouteReasonCode | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={renderFilterTrigger("Route", value ? 1 : 0)}
      />
      <PopoverContent align="start" className="p-0">
        <Command>
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="_all"
                data-checked={value === null ? "true" : undefined}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                All routes
              </CommandItem>
              {ROUTE_REASON_CODES.map((code) => (
                <CommandItem
                  key={code}
                  value={code}
                  data-checked={value === code ? "true" : undefined}
                  onSelect={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                >
                  {ROUTE_REASON_LABELS[code]}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Source multi filter ──────────────────────────────────────────────────

function SourceFilter({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v],
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={renderFilterTrigger("Source", values.length)} />
      <PopoverContent align="start" className="p-0">
        <Command>
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {SOURCE_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  data-checked={values.includes(opt.value) ? "true" : undefined}
                  onSelect={() => toggle(opt.value)}
                >
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Ticker async multi filter ───────────────────────────────────────────────

function TickerFilter({
  values,
  suggestions,
  onChange,
}: {
  values: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ symbol: string; name: string }[]>(
    [],
  );

  const runSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const r = await searchStocks(query.trim());
      setResults(r.map((s) => ({ symbol: s.symbol, name: s.name })));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };
  const debouncedSearch = useDebounce(runSearch, 300);

  useEffect(() => {
    debouncedSearch();
  }, [query, debouncedSearch]);

  const toggle = (sym: string) =>
    onChange(
      values.includes(sym)
        ? values.filter((x) => x !== sym)
        : [...values, sym],
    );

  // Merge suggestions + selected values so selected items still render in the
  // "Your stocks" group with a checkmark rather than being hoisted into a
  // separate group. Keeps the dropdown flat.
  const suggestionOptions = Array.from(
    new Set([...values, ...suggestions]),
  );
  const showingSuggestions = !query.trim() && suggestionOptions.length > 0;
  const showingResults = !!query.trim() && results.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={renderFilterTrigger("Ticker", values.length)}
      />
      <PopoverContent align="start" className="p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search tickers…"
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Searching…
                </span>
              </div>
            )}
            {!loading &&
              !query.trim() &&
              suggestionOptions.length === 0 && (
                <CommandEmpty>Type a ticker to search</CommandEmpty>
              )}
            {!loading && query.trim() && results.length === 0 && (
              <CommandEmpty>No results</CommandEmpty>
            )}

            {showingSuggestions && (
              <CommandGroup heading="Your stocks">
                {suggestionOptions.map((sym) => (
                  <CommandItem
                    key={sym}
                    value={sym}
                    data-checked={values.includes(sym) ? "true" : undefined}
                    onSelect={() => toggle(sym)}
                  >
                    <StockLogo ticker={sym} size="sm" />
                    <span className="font-medium">{sym}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {showingResults && (
              <CommandGroup heading="Results">
                {results.map((r) => (
                  <CommandItem
                    key={r.symbol}
                    value={r.symbol}
                    data-checked={values.includes(r.symbol) ? "true" : undefined}
                    onSelect={() => toggle(r.symbol)}
                  >
                    <StockLogo ticker={r.symbol} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.symbol}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.name}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
