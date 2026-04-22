import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { StockLogo } from "@/components/StockLogo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConceptTooltip } from "@/components/domain/education-card";
import { RunShowcaseTrigger, RunShowcaseButton } from "@/components/domain/run-showcase-trigger";
import { SkeletonCardStack } from "@/components/domain/skeleton-card";
import {
  buildRunSummary,
  buildActionSegments,
  type ActionColor,
} from "@/lib/run-summary";
import { cn } from "@/lib/utils";

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Corner-dot overlay for logos ────────────────────────────────────────────
//
// Small solid dot in the bottom-right of the logo — green = bought/added,
// red = sold/trimmed, blue = watched. `muted` → no dot (plain logo).

function dotColorBg(color: ActionColor): string {
  if (color === "green") return "bg-emerald-500";
  if (color === "red") return "bg-red-500";
  if (color === "blue") return "bg-sky-500";
  return "";
}

function LogoWithDot({
  ticker,
  badge,
}: {
  ticker: string;
  badge?: { color: ActionColor; partial: boolean };
}) {
  return (
    <div className="relative">
      <StockLogo ticker={ticker} size="sm" className="rounded-full" />
      {badge && badge.color !== "muted" && (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
            dotColorBg(badge.color),
          )}
        />
      )}
    </div>
  );
}

export default async function RunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const runs = await prisma.researchRun.findMany({
    where: { userId },
    include: {
      agentConfig: { select: { id: true, name: true } },
      theses: {
        select: {
          ticker: true,
          direction: true,
          confidenceScore: true,
        },
        orderBy: { createdAt: "asc" },
      },
      decisions: {
        select: {
          symbol: true,
          decision: true,
          position: {
            select: {
              realizedPnl: true,
              outcome: true,
              status: true,
            },
          },
        },
      },
      managementActions: {
        select: {
          actionType: true,
          prevStopLoss: true,
          newStopLoss: true,
          prevTargetPrice: true,
          newTargetPrice: true,
          prevTrailPct: true,
          newTrailPct: true,
          position: {
            select: { symbol: true },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-3">
      <div className="mb-4 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Runs</h1>
            <RunShowcaseButton />
          </div>
          {runs.length === 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/analysts"
                      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                    >
                      Create an Analyst
                    </Link>
                  }
                />
                <TooltipContent side="bottom">
                  <p className="text-xs">Create an analyst to start running research sessions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Structured <ConceptTooltip concept="run">research sessions</ConceptTooltip> from all your analysts
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="pt-8">
          <RunShowcaseTrigger />
          <SkeletonCardStack
            count={3}
            title="No runs yet"
            subtitle="You'll see runs from your analysts here once they run."
          />
        </div>
      ) : (
        runs.map((run) => {
          const analystName =
            run.agentConfig?.name ??
            (run.source === "MANUAL" ? "Manual Research" : "Agent");

          const summary = buildRunSummary(run);
          const segments = buildActionSegments(summary);

          // Logo stack tickers — action tickers first, then researched fill.
          const actionTickers = [...summary.tickerBadges.keys()];
          const thesisTickers = run.theses.map((t) => t.ticker.toUpperCase());
          const orderedTickers = [
            ...new Set([...actionTickers, ...thesisTickers]),
          ];

          const duration = run.completedAt
            ? Math.round(
                (new Date(run.completedAt).getTime() -
                  new Date(run.startedAt).getTime()) /
                  1000
              )
            : null;

          // Only render a status dot for non-COMPLETE runs — green dot
          // on every successful run was visual noise.
          const statusDotClass =
            run.status === "RUNNING"
              ? "bg-amber-500 animate-pulse"
              : run.status === "FAILED"
                ? "bg-negative"
                : null;

          const pnl = summary.realizedPnl;
          const pnlLabel =
            pnl != null
              ? `${pnl >= 0 ? "+" : "-"}$${Math.abs(
                  Math.round(pnl),
                ).toLocaleString("en-US")} realized`
              : null;

          return (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="block border rounded-xl p-4 hover:bg-muted/20 transition-colors"
            >
              {/* Header: status dot (conditional) · analyst name · time · duration | logo stack */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {statusDotClass && (
                    <div className={`h-2 w-2 rounded-full shrink-0 ${statusDotClass}`} />
                  )}
                  <span className="text-sm font-medium truncate">{analystName}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {formatRelativeTime(run.startedAt)}
                    {duration != null && ` · ${duration}s`}
                  </span>
                </div>

                {orderedTickers.length > 0 && (
                  <div className="flex items-center shrink-0">
                    {orderedTickers.slice(0, 5).map((ticker, i) => (
                      <div
                        key={ticker}
                        className={i > 0 ? "-ml-1" : ""}
                        style={{ zIndex: orderedTickers.length - i }}
                      >
                        <LogoWithDot
                          ticker={ticker}
                          badge={summary.tickerBadges.get(ticker)}
                        />
                      </div>
                    ))}
                    {orderedTickers.length > 5 && (
                      <div className="-ml-1 h-6 w-6 rounded-full bg-muted border border-background flex items-center justify-center text-xs font-medium text-muted-foreground">
                        +{orderedTickers.length - 5}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Primary action line — plain text, no dots */}
              <p className="text-sm text-muted-foreground line-clamp-2">
                {segments.map((seg, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1.5 opacity-40">·</span>}
                    <span>{seg.text}</span>
                  </span>
                ))}
              </p>

              {/* Stats row — "N researched" is the headline, rest is breakdown */}
              {summary.counts.researched > 0 && (
                <div className="flex items-center justify-between border-t pt-2 mt-2 text-xs tabular-nums">
                  <span>
                    <span className="font-medium text-foreground">
                      {summary.counts.researched} researched
                    </span>
                    <span className="text-muted-foreground">
                      {summary.counts.new > 0 && ` · ${summary.counts.new} new`}
                      {summary.counts.closed > 0 && ` · ${summary.counts.closed} closed`}
                      {summary.counts.held > 0 && ` · ${summary.counts.held} held`}
                      {summary.counts.passed > 0 && ` · ${summary.counts.passed} passed`}
                      {summary.counts.watchlist > 0 &&
                        ` · ${summary.counts.watchlist} watchlist`}
                    </span>
                  </span>
                  {pnlLabel && (
                    <span
                      className={cn(
                        "font-medium",
                        pnl! >= 0 ? "text-emerald-500" : "text-red-500",
                      )}
                    >
                      {pnlLabel}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })
      )}
    </div>
  );
}
