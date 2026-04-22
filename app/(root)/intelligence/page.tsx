"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Loader2,
  Play,
  Radar,
  Search,
  Globe,
  GitBranch,
  FileText,
  Layers,
  ScanSearch,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { SignalFeed } from "@/components/intelligence/signal-feed";
import type { CoverageData } from "@/components/intelligence/coverage-strip";
import { MonitorList } from "@/components/intelligence/config-panel";
import { BriefCards } from "@/components/intelligence/brief-cards";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { HowItWorksSheet } from "@/components/domain/how-it-works-sheet";
import { IntelligenceShowcaseTrigger, IntelligenceShowcaseButton } from "@/components/domain/run-showcase-trigger";
import type {
  Signal,
  MorningBrief,
  Monitor,
} from "@/components/intelligence/types";

// ── Fetch helper ────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [briefs, setBriefs] = useState<MorningBrief[]>([]);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);

  // Coverage lookback is fixed at 7d — matches the "last 7 days" language used
  // in the spec and the natural morning cadence of the pipeline.
  const COVERAGE_DAYS = 7;

  // Brief date selection
  const [briefDate, setBriefDate] = useState<"today" | "yesterday" | "week">(
    "today"
  );

  const [triggering, setTriggering] = useState<string | null>(null);

  const triggerJob = useCallback(async (job: string, label: string) => {
    setTriggering(job);
    try {
      const res = await fetch("/api/intelligence/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      toast.success(`Triggered: ${label}`, { description: "Refresh in a few seconds to see results." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sig, mon, br, cov] = await Promise.all([
        fetchJSON<Signal[]>("/api/intelligence/signals?limit=200").catch(
          () => []
        ),
        fetchJSON<Monitor[]>("/api/intelligence/monitors").catch(() => []),
        fetchJSON<MorningBrief[]>("/api/intelligence/briefs").catch(() => []),
        fetchJSON<CoverageData>(
          `/api/intelligence/coverage?days=${COVERAGE_DAYS}`,
        ).catch(() => null),
      ]);
      setSignals(sig);
      setMonitors(mon);
      setBriefs(br);
      setCoverage(cov);
    } catch (err) {
      console.error("[intelligence] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Load briefs when date changes
  const loadBriefs = useCallback(async () => {
    try {
      const dateParam = getBriefDateParam(briefDate);
      const br = await fetchJSON<MorningBrief[]>(
        `/api/intelligence/briefs${dateParam ? `?date=${dateParam}` : ""}`
      );
      setBriefs(br);
    } catch {
      console.error("[intelligence] Failed to load briefs");
    }
  }, [briefDate]);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);


  return (
    <TooltipProvider>
      <IntelligenceShowcaseTrigger />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="findings">
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="monitors">Monitors</TabsTrigger>
              <TabsTrigger value="briefs">Briefs</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5">
              <IntelligenceShowcaseButton />
              <HowItWorksSheet
                flow="intelligence"
                coverage={coverage}
                coverageDays={COVERAGE_DAYS}
              >
                <ScanSearch className="h-4 w-4" />
              </HowItWorksSheet>
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={triggering !== null}
                  >
                    {triggering ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Start Pipeline</span>
                  </Button>
                } />
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => triggerJob("full-pipeline", "Full Pipeline")}>
                    <Layers className="h-4 w-4" />
                    <span className="whitespace-nowrap">Run Full Pipeline</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => triggerJob("market-sweep", "Market Sweep")}>
                    <Search className="h-4 w-4" />
                    <span className="whitespace-nowrap">Market Sweep</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => triggerJob("portfolio-monitor", "Portfolio Monitor")}>
                    <Radar className="h-4 w-4" />
                    <span className="whitespace-nowrap">Portfolio &amp; Watchlist</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => triggerJob("domain-monitor", "Source Monitor")}>
                    <Globe className="h-4 w-4" />
                    <span className="whitespace-nowrap">Domain Sources</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => triggerJob("signal-router", "Signal Router")}>
                    <GitBranch className="h-4 w-4" />
                    <span className="whitespace-nowrap">Route Signals</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => triggerJob("morning-brief", "Morning Briefs")}>
                    <FileText className="h-4 w-4" />
                    <span className="whitespace-nowrap">Generate Briefs</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={loadAll} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="whitespace-nowrap">Refresh</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Findings tab */}
          <TabsContent value="findings" className="space-y-6 pt-4" keepMounted>
            <SignalFeed signals={signals} />
          </TabsContent>

          {/* Monitors tab */}
          <TabsContent value="monitors" className="pt-4">
            <MonitorList monitors={monitors} onRefresh={loadAll} />
          </TabsContent>

          {/* Briefs tab */}
          <TabsContent value="briefs" className="pt-4 space-y-4">
            <ChipTabs<"today" | "yesterday" | "week">
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "week", label: "This Week" },
              ]}
              value={briefDate}
              onChange={(v) => v && setBriefDate(v)}
              clearable={false}
            />

            <BriefCards briefs={briefs} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function getBriefDateParam(
  selection: "today" | "yesterday" | "week"
): string | null {
  const now = new Date();
  if (selection === "today") {
    return formatDateParam(now);
  }
  if (selection === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDateParam(yesterday);
  }
  // "week" — return null to get all recent briefs
  return null;
}

function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
