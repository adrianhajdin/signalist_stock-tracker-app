"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Search,
  Globe,
  Info,
  SlidersHorizontal,
  Lock,
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Monitor } from "./types";
import { relativeTime, ORIGIN_LABELS } from "./types";
import { PerplexityLogo, FirecrawlLogo, FinnhubLogo, FmpLogo } from "./icons";

// ── Category tooltips ────────────────────────────────────────────────────────

const CATEGORY_TOOLTIPS: Record<string, string> = {
  MARKET: "Broad market-level intelligence — indices, macro data, overall sentiment",
  SECTOR: "Industry/sector-specific monitoring — e.g. tech, healthcare, energy",
  TICKER: "Individual stock-level queries or sources for specific companies",
  THEMATIC: "Cross-cutting themes — e.g. AI, tariffs, supply chain trends",
  EVENT: "Time-bound events — earnings, IPOs, FDA decisions, M&A announcements",
  COMPANY: "Company-specific source — covers one company's filings, news, etc.",
  SOCIAL: "Social media / sentiment — StockTwits, Reddit, Twitter/X chatter",
};

const CATEGORY_OPTIONS = [
  { value: "MARKET", label: "Market" },
  { value: "SECTOR", label: "Sector" },
  { value: "TICKER", label: "Ticker" },
  { value: "THEMATIC", label: "Thematic" },
  { value: "EVENT", label: "Event" },
  { value: "COMPANY", label: "Company" },
  { value: "SOCIAL", label: "Social" },
];

// ── Monitor List (renamed from ConfigPanel) ─────────────────────────────────

interface MonitorListProps {
  monitors: Monitor[];
  onRefresh: () => void;
}

export function MonitorList({ monitors, onRefresh }: MonitorListProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const categories = useMemo(() => {
    const set = new Set(monitors.map((m) => m.category));
    return Array.from(set).sort();
  }, [monitors]);

  const filtered = useMemo(() => {
    return monitors.filter((m) => {
      if (typeFilter !== "ALL" && m.type !== typeFilter) return false;
      if (categoryFilter !== "ALL" && m.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const cfg = m.config ?? {};
        const extra = m.type === "SEARCH" ? (cfg.query as string) ?? ""
          : m.type === "DOMAIN" ? (cfg.domain as string) ?? ""
          : "";
        const searchable = `${m.name} ${extra}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [monitors, typeFilter, categoryFilter, search]);

  const toggleMonitor = async (monitor: Monitor) => {
    try {
      await fetch("/api/intelligence/monitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: monitor.id, enabled: !monitor.enabled }),
      });
      onRefresh();
    } catch {
      toast.error("Failed to toggle");
    }
  };

  const deleteMonitor = async (monitor: Monitor) => {
    if (monitor.builtIn) return;
    try {
      await fetch(`/api/intelligence/monitors?id=${monitor.id}`, {
        method: "DELETE",
      });
      toast.success("Deleted");
      onRefresh();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of monitors) {
      counts[m.type] = (counts[m.type] ?? 0) + 1;
    }
    return counts;
  }, [monitors]);

  const hasFilters = typeFilter !== "ALL" || categoryFilter !== "ALL" || search !== "";

  return (
    <TooltipProvider>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Add new */}
        <AddMonitorInput onRefresh={onRefresh} />

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search monitors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Type</SelectItem>
              <SelectItem value="SEARCH">Search ({typeCounts.SEARCH ?? 0})</SelectItem>
              <SelectItem value="DOMAIN">Domain ({typeCounts.DOMAIN ?? 0})</SelectItem>
              <SelectItem value="API">API ({typeCounts.API ?? 0})</SelectItem>
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0) + c.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TooltipTrigger>
            <TooltipContent>Filter by category</TooltipContent>
          </Tooltip>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTypeFilter("ALL"); setCategoryFilter("ALL"); setSearch(""); }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Results */}
        <p className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} of {monitors.length} monitors
        </p>

        {/* Table */}
        <Table>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    {monitors.length === 0
                      ? "No monitors configured"
                      : "No monitors match your filters"}
                  </p>
                  {monitors.length === 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Monitors are search queries and tracked websites checked daily by the intelligence pipeline. Create an analyst to generate monitors automatically.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((monitor) => (
              <MonitorRow
                key={monitor.id}
                monitor={monitor}
                onToggle={() => toggleMonitor(monitor)}
                onDelete={() => deleteMonitor(monitor)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

// Keep old export name for backward compat during transition
export { MonitorList as ConfigPanel };

// ── Monitor Row ──────────────────────────────────────────────────────────────

function MonitorRow({
  monitor,
  onToggle,
  onDelete,
}: {
  monitor: Monitor;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [tickersOpen, setTickersOpen] = useState(false);
  const hasTickers =
    monitor.monitoredTickers &&
    monitor.monitoredTickers.length > 0;

  const config = monitor.config ?? {};
  const isSearch = monitor.type === "SEARCH";
  const isDomain = monitor.type === "DOMAIN";
  const isApi = monitor.type === "API";

  return (
    <TableRow>
      {/* Colored type icon */}
      <TableCell>
        <MonitorTypeIcon type={monitor.type} />
      </TableCell>

      {/* Name / detail — domain shows URL on a second line, search/api on one.
          max-w-0 w-full forces this column to absorb leftover width and clip
          long content with truncate, instead of pushing the row off-screen. */}
      <TableCell className="max-w-0 w-full">
        <div className="min-w-0">
          {isSearch && (
            <p className={cn("text-sm truncate", !monitor.enabled && "text-muted-foreground")}>
              {(config.query as string) ?? monitor.name}
            </p>
          )}
          {isDomain && (
            <div className="min-w-0">
              <p className={cn("text-sm truncate", !monitor.enabled && "text-muted-foreground")}>
                {monitor.name}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {(config.domain as string) ?? ""}
              </p>
            </div>
          )}
          {isApi && (
            <p className={cn("text-sm truncate", !monitor.enabled && "text-muted-foreground")}>
              {monitor.name}
              <span className="text-xs text-muted-foreground ml-2">
                from {monitor.method === "finnhub" ? "Finnhub" : "FMP"}
              </span>
            </p>
          )}
          {!isSearch && !isDomain && !isApi && (
            <p className={cn("text-sm truncate", !monitor.enabled && "text-muted-foreground")}>
              {monitor.name}
            </p>
          )}
          {hasTickers && (
            <Collapsible open={tickersOpen} onOpenChange={setTickersOpen}>
              <CollapsibleTrigger
                render={<Button variant="ghost" size="sm" className="h-auto px-0 py-0.5" />}
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {monitor.monitoredTickers!.length} tickers
                </span>
                {tickersOpen ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground ml-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground ml-1" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-1 mt-1">
                  {monitor.monitoredTickers!.map((t) => (
                    <Tooltip key={t.ticker}>
                      <TooltipTrigger render={<span className="inline-flex" />}>
                        <Badge variant="secondary">${t.ticker}</Badge>
                      </TooltipTrigger>
                      {t.reason && (
                        <TooltipContent>{t.reason}</TooltipContent>
                      )}
                    </Tooltip>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </TableCell>

      {/* Scope — compressed; analyst name lives in the info popover */}
      <TableCell className="w-20">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {monitor.scope === "FIRM" ? "Firm" : "1 analyst"}
        </span>
      </TableCell>

      {/* Today's findings count — only show badge when > 0 */}
      <TableCell>
        {monitor._count.signals > 0 && (
          <Badge variant="secondary">
            <span className="tabular-nums">{monitor._count.signals}</span>
          </Badge>
        )}
      </TableCell>

      {/* Enabled toggle */}
      <TableCell>
        <Switch checked={monitor.enabled} onCheckedChange={onToggle} />
      </TableCell>

      {/* Detail popover */}
      <TableCell>
        <MonitorInfoPopover monitor={monitor} onDelete={onDelete} />
      </TableCell>
    </TableRow>
  );
}

// ── Type Icons ───────────────────────────────────────────────────────────────

function MonitorTypeIcon({ type }: { type: string }) {
  if (type === "DOMAIN") {
    return (
      <div className="h-7 w-7 rounded-md flex items-center justify-center bg-brand-orange/10 text-brand-orange">
        <Globe className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (type === "API") {
    return (
      <div className="h-7 w-7 rounded-md flex items-center justify-center bg-purple-500/10 text-purple-500">
        <Activity className="h-3.5 w-3.5" />
      </div>
    );
  }
  // SEARCH
  return (
    <div className="h-7 w-7 rounded-md flex items-center justify-center bg-brand-blue/10 text-brand-blue">
      <Search className="h-3.5 w-3.5" />
    </div>
  );
}

// ── Shared visuals (kept from original) ──────────────────────────────────────

function SearchQueryVisual({ query }: { query: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <p className="text-sm text-foreground truncate">{query}</p>
    </div>
  );
}

function DomainVisual({ domain, name }: { domain: string; name: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{name}</p>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground font-mono truncate">{domain}</p>
      </div>
    </div>
  );
}

function ApiCallVisual({ name, endpoint }: { name: string; endpoint: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{name}</p>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono">
        <Badge variant="secondary" className="shrink-0 text-[10px] font-mono">
          GET
        </Badge>
        <p className="text-xs text-foreground truncate">{endpoint}</p>
      </div>
    </div>
  );
}

// ── Detail Popover ───────────────────────────────────────────────────────────

function MonitorInfoPopover({
  monitor,
  onDelete,
}: {
  monitor: Monitor;
  onDelete: () => void;
}) {
  const config = monitor.config ?? {};
  const isSearch = monitor.type === "SEARCH";
  const isDomain = monitor.type === "DOMAIN";
  const isApi = monitor.type === "API";
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" />}
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-80">
        {/* Visual header */}
        <div className="pb-1">
          {isSearch ? (
            <SearchQueryVisual query={(config.query as string) ?? monitor.name} />
          ) : isApi ? (
            <ApiCallVisual name={monitor.name} endpoint={(config.endpoint as string) ?? ""} />
          ) : isDomain ? (
            <DomainVisual name={monitor.name} domain={(config.domain as string) ?? ""} />
          ) : (
            <SearchQueryVisual query={monitor.name} />
          )}
        </div>

        <Separator />

        {/* Provider rows — one per service involved */}
        <div className="text-xs space-y-3">
          {isSearch && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <PerplexityLogo className="h-4 w-4 text-foreground shrink-0" />
                <span className="font-medium text-foreground">Perplexity Sonar</span>
                {monitor.lastRunAt && (
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {relativeTime(monitor.lastRunAt)}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Searches the web for this query and returns the best results. Each quality result becomes a finding with the headline, summary, and source URL. Findings are tagged with relevant stock tickers and scored so they can be routed to the right analysts.
              </p>
            </div>
          )}

          {isDomain && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <PerplexityLogo className="h-4 w-4 text-foreground shrink-0" />
                  <span className="font-medium text-foreground">Perplexity Sonar</span>
                  {monitor.lastRunAt && (
                    <span className="text-muted-foreground ml-auto tabular-nums">
                      {relativeTime(monitor.lastRunAt)}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Searches only within this website for recent articles and news. Does not crawl every page — it finds the most relevant recent content on the domain and returns findings with headlines, summaries, and source URLs.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <FirecrawlLogo className="h-4 w-4 text-foreground shrink-0" />
                  <span className="font-medium text-foreground">Firecrawl</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  For important articles Sonar finds, Firecrawl visits the actual page and extracts the full article text. This lets the agent read the complete article during a run instead of just the summary.
                </p>
              </div>
            </>
          )}

          {isApi && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                {monitor.method === "finnhub"
                  ? <FinnhubLogo className="h-4 w-4 text-foreground shrink-0" />
                  : <FmpLogo className="h-4 w-4 text-foreground shrink-0" />}
                <span className="font-medium text-foreground">
                  {monitor.method === "finnhub" ? "Finnhub" : "FMP"}
                </span>
                {monitor.lastRunAt && (
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {relativeTime(monitor.lastRunAt)}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {getApiDescription(monitor)}
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <span className="text-muted-foreground">Category</span>
          <Tooltip>
            <TooltipTrigger render={<span className="text-foreground underline decoration-dotted cursor-help" />}>
              {monitor.category.charAt(0) + monitor.category.slice(1).toLowerCase()}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {CATEGORY_TOOLTIPS[monitor.category] ?? monitor.category}
            </TooltipContent>
          </Tooltip>

          <span className="text-muted-foreground">Scope</span>
          <span className="text-foreground">
            {monitor.scope === "FIRM" ? "Firm-wide" : monitor.analyst?.name ?? "Analyst-specific"}
          </span>

          <span className="text-muted-foreground">Origin</span>
          <span className="text-foreground">
            {ORIGIN_LABELS[monitor.origin] ?? monitor.origin}
          </span>

          <span className="text-muted-foreground">Findings today</span>
          <span className="text-foreground tabular-nums">{monitor._count.signals}</span>

          {monitor.expiresAt && (
            <>
              <span className="text-muted-foreground">Expires</span>
              <span className="text-foreground">
                {new Date(monitor.expiresAt).toLocaleDateString()}
              </span>
            </>
          )}
        </div>

        {/* Monitored tickers */}
        {monitor.monitoredTickers && monitor.monitoredTickers.length > 0 && (
          <>
            <Separator />
            <div className="text-xs space-y-1.5">
              <span className="text-muted-foreground font-medium">
                Monitoring {monitor.monitoredTickers.length} tickers
              </span>
              <div className="flex flex-wrap gap-1">
                {monitor.monitoredTickers.map((t) => (
                  <Badge key={t.ticker} variant="secondary">${t.ticker}</Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Delete (non-builtIn only) */}
        {!monitor.builtIn && (
          <>
            <Separator />
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="ghost" size="sm" className="w-full text-red-500 hover:text-red-600" />}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete monitor
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete monitor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove &ldquo;{monitor.name.slice(0, 60)}&rdquo; from intelligence monitoring.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Add Monitor Input ────────────────────────────────────────────────────────

function AddMonitorInput({ onRefresh }: { onRefresh: () => void }) {
  const [kind, setKind] = useState<"search" | "source">("search");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("MARKET");
  const [sourceName, setSourceName] = useState("");
  const [qualityScore, setQualityScore] = useState("3");
  const [adding, setAdding] = useState(false);

  const canSubmit = kind === "search"
    ? value.trim().length > 0
    : value.trim().length > 0 && sourceName.trim().length > 0;

  const handleAdd = async () => {
    if (!canSubmit || adding) return;
    setAdding(true);
    try {
      const body = kind === "search"
        ? {
            name: value.trim(),
            type: "SEARCH",
            method: "perplexity_sonar",
            config: { query: value.trim() },
            category,
            scope: "FIRM",
            origin: "USER",
          }
        : {
            name: sourceName.trim(),
            type: "DOMAIN",
            method: "perplexity_sonar",
            config: { domain: value.trim(), qualityScore: parseInt(qualityScore) },
            category,
            scope: "FIRM",
            origin: "USER",
          };

      const res = await fetch("/api/intelligence/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(kind === "search" ? "Search added" : "Source added");
      setValue("");
      setSourceName("");
      onRefresh();
    } catch (err) {
      toast.error(`Failed to add ${kind}`);
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <InputGroup className="h-auto">
      <InputGroupInput
        placeholder={kind === "search"
          ? "semiconductor supply chain disruptions today..."
          : "seekingalpha.com"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />

      <InputGroupAddon align="block-end">
        {/* Type selector */}
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Select value={kind} onValueChange={(v) => v && setKind(v as "search" | "source")}>
              <SelectTrigger size="sm" chevron={false}>
                {kind === "search" ? (
                  <Search className="h-3.5 w-3.5" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="search">
                  <Search className="h-3.5 w-3.5" /> Search
                </SelectItem>
                <SelectItem value="source">
                  <Globe className="h-3.5 w-3.5" /> Source
                </SelectItem>
              </SelectContent>
            </Select>
          </TooltipTrigger>
          <TooltipContent>{kind === "search" ? "Search query" : "Monitored source"}</TooltipContent>
        </Tooltip>

        {/* Category selector */}
        <Select value={category} onValueChange={(v) => v && setCategory(v)}>
          <SelectTrigger size="sm" chevron={false}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Source options popover */}
        {kind === "source" && (
          <Popover>
            <PopoverTrigger
              render={<Button variant="ghost" size="sm" />}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-64">
              <PopoverHeader>
                <PopoverTitle>Source Options</PopoverTitle>
              </PopoverHeader>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Display name
                  </label>
                  <Input
                    placeholder="e.g. Seeking Alpha"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Quality score
                  </label>
                  <Select value={qualityScore} onValueChange={(v) => v && setQualityScore(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Low reliability</SelectItem>
                      <SelectItem value="2">2 — Fair</SelectItem>
                      <SelectItem value="3">3 — Good</SelectItem>
                      <SelectItem value="4">4 — High reliability</SelectItem>
                      <SelectItem value="5">5 — Premium / official</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Button
          size="sm"
          className="ml-auto"
          onClick={handleAdd}
          disabled={!canSubmit || adding}
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? "Adding..." : "Add"}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiDescription(monitor: Monitor): string {
  const config = monitor.config ?? {};
  const endpoint = (config.endpoint as string) ?? "";

  if (endpoint.includes("gainers")) {
    return "Calls the FMP API every morning to get today's top 10 stocks with the biggest price gains. Returns one finding with a table of tickers, current prices, and percentage changes.";
  }
  if (endpoint.includes("losers")) {
    return "Calls the FMP API every morning to get today's top 10 stocks with the biggest price drops. Returns one finding with a table of tickers, current prices, and percentage changes.";
  }
  if (endpoint.includes("actives")) {
    return "Calls the FMP API every morning to get today's 10 most-traded stocks by volume. Returns one finding with a table of tickers, current prices, and trading volume.";
  }
  if (endpoint.includes("earnings")) {
    return "Calls the Finnhub API to get all companies reporting earnings in the next 7 days. Returns one finding with a list of tickers, earnings dates, and EPS estimates.";
  }
  // Fallback to stored description
  return (config.description as string) ?? "Calls this API endpoint and returns the results as a single finding.";
}
