"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Favicon, aggregateTitle } from "@/components/intelligence/signal-feed";
import { StockLogo } from "@/components/StockLogo";
import { TickerChip } from "@/components/chat/TickerChip";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PerplexityLogo, FirecrawlLogo, EmailIcon } from "@/components/intelligence/icons";
import { Globe, Search, Shuffle, Zap } from "lucide-react";
import type { MatchedUniverse, RouteReasonCode, Signal } from "./types";
import {
  ROUTE_REASON_LABELS,
  ROUTE_REASON_TOOLTIPS,
  relativeTime,
} from "./types";

// ── Monitor type → icon ─────────────────────────────────────────────────────

const MONITOR_ICON = {
  SEARCH: Search,
  DOMAIN: Globe,
  API: Zap,
  EMAIL: EmailIcon,
} as const;

function getMonitorType(signal: Signal): keyof typeof MONITOR_ICON {
  if (signal.searchTool === "EMAIL_INGEST") return "EMAIL";
  if (
    signal.monitor?.type === "DOMAIN" ||
    signal.searchContext?.startsWith("domain_group:")
  )
    return "DOMAIN";
  if (
    signal.monitor?.type === "API" ||
    signal.searchContext?.startsWith("market_movers:") ||
    signal.searchContext === "earnings_calendar"
  )
    return "API";
  return "SEARCH";
}

/** Pull "<subject>" out of searchContext which the email-ingest route stores
 *  as "Inbound email: <subject>". Returns null if not an email signal. */
function emailSubject(signal: Signal): string | null {
  if (signal.searchTool !== "EMAIL_INGEST") return null;
  const ctx = signal.searchContext ?? "";
  const prefix = "Inbound email: ";
  return ctx.startsWith(prefix) ? ctx.slice(prefix.length) : null;
}

// ── Finding Detail Dialog ───────────────────────────────────────────────────

interface FindingDetailDialogProps {
  signal: Signal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FindingDetailDialog({
  signal,
  open,
  onOpenChange,
}: FindingDetailDialogProps) {
  if (!signal) return null;

  const monitorType = getMonitorType(signal);
  const MonitorIcon = MONITOR_ICON[monitorType];
  const isEmail = monitorType === "EMAIL";
  const isAggregate = signal.aggregateType != null;
  const subject = emailSubject(signal);
  // Query bar text priority: aggregate title → email subject → search query → headline.
  const query = isAggregate
    ? aggregateTitle(signal.aggregateType)
    : subject ?? signal.searchQuery ?? signal.headline;
  const usedPerplexity =
    !isEmail && !isAggregate && (!signal.searchTool || signal.searchTool === "PERPLEXITY_SONAR");
  const usedFirecrawl = !!signal.artifactId;

  const hasSources = signal.sourceUrls.length > 0;

  // Headline/description also use the aggregate title when relevant so the
  // dialog reads cohesively instead of showing the producer's raw headline.
  const dialogTitle = isAggregate ? aggregateTitle(signal.aggregateType) : signal.headline;
  const dialogDescription = signal.summary;

  const tagLine = [
    ...signal.sectors,
    ...signal.industries,
    ...signal.themes.map((t) => t.replace(/_/g, " ")),
  ].join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-3xl">
        <TooltipProvider>
          {/* Search bar — query + tool provenance */}
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 min-w-0">
            <MonitorIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground/80 truncate flex-1 min-w-0">
              {query}
            </span>
            {usedPerplexity && (
              <ToolPopover
                icon={PerplexityLogo}
                name="Perplexity Sonar"
                description="Real-time web search via Perplexity's Sonar API. Returns structured results with headlines, summaries, source URLs, and extracted tickers."
              />
            )}
            {usedFirecrawl && (
              <ToolPopover
                icon={FirecrawlLogo}
                name="Firecrawl"
                description="Full-page HTML extraction. The article was scraped and stored as a readable artifact so the AI agent can read the complete text during runs."
              />
            )}
          </div>

          {/* Sources + timestamp — Sonar cites 1..N articles per signal.
              Single source renders as a favicon + name link; multiple
              sources render as stacked avatars with a tooltip per one. */}
          {hasSources && (
            <div className="flex items-center gap-2">
              {signal.sourceUrls.length > 1 ? (
                <div className="flex -space-x-2">
                  {signal.sourceUrls.map((url, i) => {
                    const domain = extractDomain(url);
                    const name = signal.sourceNames[i] ?? domain;
                    return (
                      <Tooltip key={`${url}-${i}`}>
                        <TooltipTrigger
                          render={
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={name}
                            />
                          }
                        >
                          <Avatar size="sm" className="ring-2 ring-background">
                            <AvatarImage
                              src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
                              alt={name}
                            />
                            <AvatarFallback>
                              {name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{name}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ) : (
                (() => {
                  const url = signal.sourceUrls[0];
                  const domain = extractDomain(url);
                  const name = signal.sourceNames[0] ?? domain;
                  return (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-ml-1.5 inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {isEmail ? (
                        <EmailIcon className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Favicon domain={domain} size={14} />
                      )}
                      <span>{name}</span>
                    </a>
                  );
                })()
              )}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {relativeTime(signal.createdAt)}
              </span>
            </div>
          )}

          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          {/* Body: aggregate signals render a structured table using the
              dataPayload (ticker + price/change for movers, ticker + date +
              EPS for earnings). Non-aggregate signals render inline ticker
              chips with live quotes. */}
          {isAggregate ? (
            <AggregateTable signal={signal} />
          ) : (
            signal.tickers.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {signal.tickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5"
                  >
                    <StockLogo ticker={t} size="sm" className="h-5 w-5" />
                    <TickerChip symbol={t} />
                  </span>
                ))}
              </div>
            )
          )}

          {/* Routing — ButtonGroup per analyst */}
          {signal.routes && signal.routes.length > 0 && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Shuffle className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Routed to
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {signal.routes.map((r) => (
                  <RouteGroup
                    key={r.id}
                    analystName={r.analyst.name}
                    code={r.routeReasonCode}
                    matched={r.matchedUniverse}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tags — very bottom, comma-separated, uppercase mono xs muted */}
          {tagLine && (
            <p className="text-xs font-mono uppercase text-muted-foreground pt-1">
              {tagLine}
            </p>
          )}
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

// ── Route group — analyst | category with tooltip ───────────────────────────

function RouteGroup({
  analystName,
  code,
  matched,
}: {
  analystName: string;
  code: RouteReasonCode | null;
  matched: MatchedUniverse | null;
}) {
  const categoryLabel = code ? ROUTE_REASON_LABELS[code] : "Legacy";
  const matchedValues = extractMatchedValues(matched);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ButtonGroup className="cursor-default">
            <Badge variant="secondary" className="rounded-r-none font-normal">
              {analystName}
            </Badge>
            <ButtonGroupSeparator />
            <Badge
              variant="secondary"
              className="rounded-l-none text-muted-foreground font-normal"
            >
              {categoryLabel}
            </Badge>
          </ButtonGroup>
        }
      />
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="flex flex-col gap-1.5 text-xs">
          <p className="leading-relaxed">
            {code
              ? ROUTE_REASON_TOOLTIPS[code]
              : "Routed before reason codes were tracked."}
          </p>
          {matchedValues.length > 0 && (
            <p className="opacity-70">Matched: {matchedValues.join(", ")}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Tool Popover ────────────────────────────────────────────────────────────

function ToolPopover({
  icon: Icon,
  name,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
}) {
  return (
    <Popover>
      <PopoverTrigger className="rounded-md p-1 hover:bg-background/60 transition-colors">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{name}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractMatchedValues(m: MatchedUniverse | null): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.sectors?.length) out.push(...m.sectors);
  if (m.industries?.length) out.push(...m.industries);
  if (m.themes?.length) out.push(...m.themes.map((t) => t.replace(/_/g, " ")));
  if (m.inWatchlist) out.push("watchlist hit");
  if (m.inPositions) out.push("open position");
  return out;
}

// ── Aggregate table ──────────────────────────────────────────────────────
// Renders the dataPayload for market movers / earnings calendar signals as a
// structured table. Uses the same StockLogo + TickerChip components that the
// regular ticker section uses so row chrome stays consistent.
//
// We cap the visible rows at 20 (and surface the remainder inline) because
// the earnings calendar can contain ~1000 items and each TickerChip fetches
// its own quote. 20 is enough to scan the top of the calendar without
// torching Finnhub's quote quota.

const MAX_ROWS = 20;

function AggregateTable({ signal }: { signal: Signal }) {
  const rawPayload = signal.dataPayload;
  const items = Array.isArray(rawPayload)
    ? (rawPayload as Array<Record<string, unknown>>)
    : [];
  const visible = items.slice(0, MAX_ROWS);
  const remaining = Math.max(0, items.length - visible.length);
  const isMovers = signal.aggregateType?.startsWith("MARKET_MOVERS") ?? false;
  const isEarnings = signal.aggregateType === "EARNINGS_CALENDAR";

  if (visible.length === 0) return null;

  return (
    <div className="border-t pt-3">
      <div className="space-y-1.5">
        {visible.map((item, i) => {
          const ticker = String(item.ticker ?? "").toUpperCase();
          if (!ticker) return null;
          return (
            <div
              key={`${ticker}-${i}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="inline-flex items-center gap-1.5 min-w-0">
                <StockLogo ticker={ticker} size="sm" className="h-5 w-5 shrink-0" />
                <TickerChip symbol={ticker} />
              </div>
              {isMovers && <MoversMeta item={item} />}
              {isEarnings && <EarningsMeta item={item} />}
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          and {remaining} more
        </p>
      )}
    </div>
  );
}

function MoversMeta({ item }: { item: Record<string, unknown> }) {
  const change = Number(item.change ?? 0);
  const price = Number(item.price ?? 0);
  const isPositive = change >= 0;
  return (
    <div className="flex items-center gap-4 tabular-nums shrink-0">
      <span
        className={
          isPositive
            ? "text-xs text-positive"
            : "text-xs text-negative"
        }
      >
        {isPositive ? "+" : ""}
        {change.toFixed(1)}%
      </span>
      <span className="text-xs text-muted-foreground">
        ${price.toFixed(2)}
      </span>
    </div>
  );
}

function EarningsMeta({ item }: { item: Record<string, unknown> }) {
  const date = String(item.date ?? "");
  const epsEstimate =
    typeof item.epsEstimate === "number" ? item.epsEstimate : null;
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums shrink-0">
      {date && <span>{date}</span>}
      {epsEstimate !== null && <span>EPS est: ${epsEstimate.toFixed(2)}</span>}
    </div>
  );
}
