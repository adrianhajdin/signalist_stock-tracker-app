"use client";

import { Card } from "@/components/ui/card";
import { SourceAvatars } from "@/components/ui/source-avatars";
import { PerplexityLogo, FinnhubLogo, FmpLogo } from "@/components/intelligence/icons";
import { relativeTime } from "@/components/intelligence/types";
import type { UnifiedBrief } from "./brief-types";

// ── Brief Card ──────────────────────────────────────────────────────────────
// One card for both brief types. Used on /intelligence and analyst page.

function briefTitle(brief: UnifiedBrief): string {
  if (brief.type === "run") return `${brief.analystName} Daily Portfolio Briefing`;
  return `${brief.analystName} Research & Signals`;
}

function briefMeta(brief: UnifiedBrief): string | null {
  if (brief.type === "run" && brief.runBrief) {
    const snap = (brief.runBrief.portfolioSnapshot as Record<string, unknown>) ?? {};
    const pnl = snap.closedPnl as number | undefined;
    if (pnl != null) return `P&L ${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`;
  }
  return null;
}

export function BriefCard({
  brief,
  onClick,
}: {
  brief: UnifiedBrief;
  onClick: () => void;
}) {
  const title = briefTitle(brief);
  const meta = briefMeta(brief);

  return (
    <Card
      className="p-0 cursor-pointer hover:bg-accent/50 transition-colors overflow-hidden"
      onClick={onClick}
    >
      {/* Top section: metadata + title */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex items-center gap-2 mb-1">
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
          {meta && (
            <span className="text-xs text-muted-foreground tabular-nums">{meta}</span>
          )}
        </div>
        <p className="text-sm font-medium leading-snug">{title}</p>
      </div>

      {/* Body: preview text + timestamp */}
      <div className="px-3 pt-2 pb-3">
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
          {brief.preview}
        </p>
        <span className="text-xs font-mono text-muted-foreground tabular-nums mt-2 block">
          {relativeTime(brief.date)}
        </span>
      </div>
    </Card>
  );
}
