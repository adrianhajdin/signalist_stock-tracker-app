"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Check, Search, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const Silk = dynamic(() => import("@/components/Silk"), { ssr: false });
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { StockLogo } from "@/components/StockLogo";
import { Markdown } from "@/components/ui/markdown";
import type { AgentConfigData } from "@/components/domain/agent-config-card";

// ─── Signal type tooltips ─────────────────────────────────────────────────────

const signalTips: Record<string, string> = {
  MOMENTUM: "Trades based on price momentum — stocks moving with strong trend continuation.",
  EARNINGS_BEAT: "Trades around earnings surprises — buys after positive EPS beats.",
  BREAKOUT: "Trades when price breaks through key support/resistance levels.",
  TECHNICAL_BREAKOUT: "Trades when price breaks through key support/resistance levels.",
  MEAN_REVERSION: "Buys oversold dips expecting price to revert to its moving average.",
  CATALYST: "Trades driven by specific events — FDA approvals, product launches, M&A.",
  OPTIONS_FLOW: "Follows unusual options activity as a signal for directional bets.",
  SECTOR_ROTATION: "Trades based on capital flowing between market sectors.",
  SENTIMENT: "Uses social/news sentiment analysis to gauge market direction.",
  VALUE: "Identifies undervalued stocks based on fundamental metrics.",
  GAP_FILL: "Trades overnight gaps expecting price to fill back to prior close.",
};

// ─── Panel ────────────────────────────────────────────────────────────────────

interface AnalystConfigPanelProps {
  config: AgentConfigData;
  onConfirm: () => void;
  isCreating: boolean;
  confirmLabel?: string;
  confirmingLabel?: string;
}

export function AnalystConfigPanel({
  config,
  onConfirm,
  isCreating,
  confirmLabel = "Create Analyst",
  confirmingLabel = "Creating...",
}: AnalystConfigPanelProps) {
  // Silk background — plays on mount and when applying changes
  const [silkActive, setSilkActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSilkActive(false), 2000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (isCreating) setSilkActive(true);
  }, [isCreating]);

  const direction = config.directionBias ?? "BOTH";
  const sectors = config.sectors ?? [];
  const industries = config.industries ?? [];
  const themes = config.themes ?? [];
  const watchlist = config.watchlist ?? [];
  const exclusionList = config.exclusionList ?? [];
  const holdDurations = config.holdDurations ?? [];
  const sources = config.domainMonitorProposal?.sources ?? [];
  const queries = config.intelligenceQueries ?? [];
  const policy = config.intelligencePolicy;
  const marketCapMin = config.marketCapMin ?? null;
  const marketCapMax = config.marketCapMax ?? null;

  const formatMarketCap = (v: number | null): string | null => {
    if (v == null) return null;
    const m = Math.round(v / 1_000_000);
    if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`;
    return `$${m}M`;
  };
  const marketCapRange =
    marketCapMin == null && marketCapMax == null
      ? null
      : `${formatMarketCap(marketCapMin) ?? "any"} – ${formatMarketCap(marketCapMax) ?? "any"}`;

  return (
    <div className="flex flex-col h-full rounded-xl border bg-background shadow-2xl overflow-hidden relative">
      {/* Full-panel Silk intro */}
      <div
        className="absolute inset-0 z-[5] transition-opacity duration-1000 ease-out pointer-events-none"
        style={{ opacity: silkActive ? 1 : 0 }}
      >
        <Silk speed={5} scale={0.85} color="#919191" noiseIntensity={1.5} rotation={0} />
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative z-[6] shrink-0 p-3">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full overflow-hidden shrink-0">
            <Silk speed={5} scale={0.85} color="#919191" noiseIntensity={1.5} rotation={0} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-brand font-semibold truncate leading-tight">
              {config.name || "Untitled Analyst"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="relative z-[6] flex-1 flex flex-col min-h-0">
        <div className="px-3 pt-1 shrink-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Overview tab ───────────────────────────────────────── */}
        <TabsContent value="overview" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 w-full flex flex-col gap-3">
              {config.description && (
                <p className="text-base text-foreground">
                  {config.description}
                </p>
              )}
              {config.analystPrompt && (
                <div>
                  <p className="text-sm font-medium mb-1">Strategy</p>
                  <Markdown variant="compact" className="text-muted-foreground">
                    {config.analystPrompt}
                  </Markdown>
                </div>
              )}

              {exclusionList.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Excluded</p>
                  <div className="flex flex-col gap-1">
                    {exclusionList.map((symbol) => (
                      <div
                        key={symbol}
                        className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0"
                      >
                        <StockLogo ticker={symbol} size="sm" />
                        <span className="font-mono tabular-nums text-muted-foreground">{symbol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {exclusionList.length === 0 && !config.analystPrompt && (
                <div className="text-xs text-muted-foreground/40 py-2 text-center">
                  No configuration details yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Intelligence tab ───────────────────────────────────── */}
        <TabsContent value="intelligence" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <TooltipProvider>
              <div>
                {/* Watchlist */}
                {watchlist.length > 0 && (
                  <div className="p-3 border-b">
                    <p className="text-sm font-medium mb-1.5">Watchlist</p>
                    <div className="flex flex-col gap-1">
                      {watchlist.map((t) => {
                        const symbol = typeof t === "string" ? t : t.symbol;
                        const reason = typeof t === "object" ? t.reason : undefined;
                        return (
                          <div
                            key={symbol}
                            className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0"
                          >
                            <StockLogo ticker={symbol} size="sm" />
                            <div className="flex-1 min-w-0">
                              <span className="font-mono tabular-nums font-medium">{symbol}</span>
                              {reason && (
                                <p className="text-xs text-muted-foreground truncate">{reason}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                  <div className="p-3 border-b">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <p className="text-sm font-medium">Sources</p>
                      <Tooltip>
                        <TooltipTrigger render={<span className="cursor-help" />}>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Websites monitored daily for new articles. Perplexity Sonar searches each domain, then Firecrawl extracts full article text for the agent to read.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex flex-col gap-1">
                      {sources.map((s) => (
                        <Tooltip key={s.domain}>
                          <TooltipTrigger
                            render={
                              <div className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0 cursor-default min-h-8">
                                <img
                                  src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=16`}
                                  alt=""
                                  width={14}
                                  height={14}
                                  className="size-3.5 rounded-sm shrink-0"
                                />
                                <span className="truncate flex-1">{s.name}</span>
                              </div>
                            }
                          />
                          <TooltipContent side="left">{s.reason}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search Queries */}
                {queries.length > 0 && (
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <p className="text-sm font-medium">Search Queries</p>
                      <Tooltip>
                        <TooltipTrigger render={<span className="cursor-help" />}>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Perplexity Sonar runs these queries daily before the agent wakes up. Results become findings that get routed to the analyst based on relevance.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex flex-col gap-1">
                      {queries.map((q, i) => (
                        <Tooltip key={i}>
                          <TooltipTrigger
                            render={
                              <div className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0 cursor-default min-h-8">
                                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1">{q.query}</span>
                              </div>
                            }
                          />
                          <TooltipContent side="left">{q.reason}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )}

                {watchlist.length === 0 && sources.length === 0 && queries.length === 0 && (
                  <div className="text-xs text-muted-foreground/40 py-6 text-center">
                    No intelligence configuration yet.
                  </div>
                )}
              </div>
            </TooltipProvider>
          </ScrollArea>
        </TabsContent>

        {/* ── Config tab ─────────────────────────────────────────── */}
        {/* Read-only mirror of AnalystConfigSheet's Config tab — same     */}
        {/* three sections, same labels, same tooltip copy. Edits happen   */}
        {/* in the Sheet; this panel is the glance view.                   */}
        <TabsContent value="config" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 flex flex-col gap-4">
              {/* ── Trading rules ─────────────────────────────── */}
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium mb-1">Trading rules</p>
                <InfoRow
                  label="Direction"
                  value={direction}
                  tooltip="Bias the agent can take: Long only, Short only, or Both."
                />
                <InfoRow
                  label="Hold Duration"
                  value={holdDurations.join(", ") || "Swing"}
                  tooltip="Typical holding period: Day (intraday), Swing (days to weeks), Position (weeks to months)."
                />
                <InfoRow
                  label="Min Confidence"
                  value={`${config.minConfidence ?? 65}%`}
                  mono
                  tooltip="Lowest thesis confidence (0-100) that can place a trade. Enforced — below this and the trade is rejected."
                />
                <InfoRow
                  label="Max Positions"
                  value={String(config.maxOpenPositions ?? 5)}
                  mono
                  tooltip="Most concurrent open positions this analyst can hold. Enforced."
                />
                <InfoRow
                  label="Max Position Size"
                  value={`$${(config.maxPositionSize ?? 5000).toLocaleString()}`}
                  mono
                  tooltip="Biggest single trade (paper dollars) this analyst can open. Enforced."
                />
              </div>

              {/* ── Signal attention ───────────────────────────── */}
              {policy && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium mb-1">Signal attention</p>
                  <InfoRow
                    label="Holdings attention"
                    value={`${Math.round(policy.holdingsAttention * 100)}%`}
                    mono
                    tooltip="Share of signal budget biased toward tickers this analyst already holds."
                  />
                  <InfoRow
                    label="Watchlist attention"
                    value={`${Math.round(policy.watchlistAttention * 100)}%`}
                    mono
                    tooltip="Share of signal budget biased toward watchlist tickers (not yet held)."
                  />
                  <InfoRow
                    label="Discovery attention"
                    value={`${Math.round(policy.discoveryAttention * 100)}%`}
                    mono
                    tooltip="Share reserved for new opportunities that match the Universe fence but aren't on the watchlist."
                  />
                  {policy.maxSignalsPerRun != null && (
                    <InfoRow
                      label="Signal budget"
                      value={String(policy.maxSignalsPerRun)}
                      mono
                      tooltip="Hard cap on signals the agent reads per run."
                    />
                  )}
                  <InfoRow
                    label="Live search"
                    value={policy.allowLiveSearch ? "On" : "Off"}
                    tooltip="When on, the agent can call live Perplexity Sonar during a run."
                  />
                </div>
              )}

              {/* ── Universe ───────────────────────────────────── */}
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium mb-1">Universe</p>
                <InfoRow
                  label="Sectors"
                  value={sectors.length > 0 ? sectors.join(", ") : "—"}
                  tooltip="GICS sectors. Only signals from these sectors enter the fence."
                />
                <InfoRow
                  label="Industries"
                  value={industries.length > 0 ? industries.join(", ") : "—"}
                  tooltip="Narrower than Sectors — must match (AND-joined with Sectors)."
                />
                <InfoRow
                  label="Themes"
                  value={themes.length > 0 ? themes.join(", ") : "—"}
                  tooltip="Analyst-defined narratives like 'AI infrastructure' or 'GLP-1'. Signals tagged with any enter the fence."
                />
                {marketCapRange && (
                  <InfoRow
                    label="Market Cap"
                    value={marketCapRange}
                    mono
                    tooltip="Market cap range for the fence. Blank bound = no limit on that side."
                  />
                )}
                {exclusionList.length > 0 && (
                  <InfoRow
                    label="Excluded"
                    value={exclusionList.join(", ")}
                    mono
                    border={false}
                    tooltip="Hard-blocked tickers. Rejected even when held or on the watchlist."
                  />
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="relative z-[6] shrink-0 border-t px-4 py-3 flex">
        <Button
          onClick={onConfirm}
          disabled={isCreating}
          size="default"
          className="w-full"
        >
          <Check className="h-4 w-4 mr-2" />
          {isCreating ? confirmingLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
