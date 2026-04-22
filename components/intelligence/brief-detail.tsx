"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";
import { TickerBadge } from "@/components/ui/ticker-badge";
import { TickerMarkdown } from "@/components/ui/ticker-markdown";
import { SourceAvatars } from "@/components/ui/source-avatars";
import { PerplexityLogo, FinnhubLogo, FmpLogo } from "@/components/intelligence/icons";
import { relativeTime } from "./types";
import type { UnifiedBrief } from "./brief-types";

// ── Titles ──────────────────────────────────────────────────────────────────

function briefTitle(brief: UnifiedBrief): string {
  if (brief.type === "run") return `${brief.analystName} Daily Portfolio Briefing`;
  return `${brief.analystName} Research & Signals`;
}

// ── Brief Detail Dialog ─────────────────────────────────────────────────────

interface BriefDetailDialogProps {
  brief: UnifiedBrief | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BriefDetailDialog({ brief, open, onOpenChange }: BriefDetailDialogProps) {
  if (!brief) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{briefTitle(brief)}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {brief.type === "intel" && brief.intelBrief && (
            <IntelBriefContent brief={brief.intelBrief} />
          )}

          {brief.type === "run" && brief.runBrief && (
            <RunBriefContent brief={brief.runBrief} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t p-4">
          {brief.type === "intel" && brief.signalCount != null && (
            <SourceAvatars
              sources={[
                { icon: <PerplexityLogo className="h-3 w-3" /> },
                { icon: <FinnhubLogo className="h-3 w-3" /> },
                { icon: <FmpLogo className="h-3 w-3" /> },
              ]}
              count={brief.signalCount}
              label={`${brief.signalCount} signals`}
            />
          )}
          {brief.type === "run" && (
            <span className="tabular-nums">Portfolio briefing</span>
          )}
          <span>{relativeTime(brief.date)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Intel Brief Content ─────────────────────────────────────────────────────

import type { MorningBrief } from "./types";

function IntelBriefContent({ brief }: { brief: MorningBrief }) {
  const alerts = brief.portfolioAlerts ?? [];
  const updates = brief.watchlistUpdates ?? [];
  const opportunities = brief.newOpportunities ?? [];
  const risks = brief.riskFlags ?? [];

  type TickerItem = {
    ticker: string;
    tag: "Holding" | "Watching" | "Opportunity";
    direction?: "up" | "down" | null;
    summary: string;
  };

  const items: TickerItem[] = [];

  for (const a of alerts) {
    const isBearish = /down|drop|fall|cut|freeze|miss|decline|loss|warning|lower|weak/i.test(a.alert);
    items.push({ ticker: a.ticker, tag: "Holding", direction: isBearish ? "down" : "up", summary: a.alert });
  }
  for (const u of updates) {
    items.push({ ticker: u.ticker, tag: "Watching", summary: u.update });
  }
  for (const o of opportunities) {
    if (o.tickers[0]) {
      items.push({ ticker: o.tickers[0], tag: "Opportunity", summary: o.thesisSeed || o.headline });
    }
  }

  return (
    <>
      {/* Market context */}
      <div className="px-4 py-3 border-b">
        <p className="text-sm text-muted-foreground leading-relaxed">{brief.marketContext}</p>
      </div>

      {/* Per-ticker items */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-b space-y-4">
          {items.map((item, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <TickerBadge ticker={item.ticker} direction={item.direction} />
                <Badge variant="secondary">{item.tag}</Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
            </div>
          ))}
        </div>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <div className="px-4 py-3 border-b space-y-2">
          <p className="text-sm font-medium">Risks</p>
          {risks.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <Flag className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground leading-relaxed">{r}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Run Brief Content ───────────────────────────────────────────────────────

import type { AnalystBriefingItem } from "@/lib/actions/analyst.actions";

type WatchItem = { symbol: string; trigger?: string; suggestedAction?: string };

function RunBriefContent({ brief }: { brief: AnalystBriefingItem }) {
  const snapshot = (brief.portfolioSnapshot as Record<string, unknown>) ?? {};
  const closedPnl = (snapshot.closedPnl as number) ?? 0;
  const wins = snapshot.wins as number | undefined;
  const losses = snapshot.losses as number | undefined;
  const watchItems = Array.isArray(brief.watchTomorrow) ? (brief.watchTomorrow as WatchItem[]) : [];

  return (
    <>
      {/* Portfolio snapshot */}
      {Object.keys(snapshot).length > 0 && (
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>P&L <span className="tabular-nums font-medium">{closedPnl >= 0 ? "+" : ""}{closedPnl.toFixed(2)}</span></span>
            {wins != null && losses != null && (
              <span>Record <span className="tabular-nums font-medium">{wins}W / {losses}L</span></span>
            )}
            {brief.marketPosture && <Badge variant="outline">{brief.marketPosture}</Badge>}
          </div>
        </div>
      )}

      {/* Narrative */}
      <div className="px-4 py-3 border-b">
        <div className="text-sm leading-relaxed">
          <TickerMarkdown>{brief.narrative}</TickerMarkdown>
        </div>
      </div>

      {/* Strategy notes */}
      {brief.strategyNotes && (
        <div className="px-4 py-3 border-b">
          <div className="text-sm text-muted-foreground italic leading-relaxed">
            <TickerMarkdown>{brief.strategyNotes}</TickerMarkdown>
          </div>
        </div>
      )}

      {/* Watch tomorrow */}
      {watchItems.length > 0 && (
        <div className="px-4 py-3 border-b space-y-2">
          <p className="text-sm font-medium">Watch Tomorrow</p>
          {watchItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <TickerBadge ticker={item.symbol} />
              {item.trigger && <span className="text-xs text-muted-foreground">{item.trigger}</span>}
              {item.suggestedAction && <span className="text-xs text-muted-foreground ml-auto">{item.suggestedAction}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
