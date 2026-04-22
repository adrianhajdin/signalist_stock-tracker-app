"use client";

/**
 * RunSourcesPanel — unified Sources tab for /runs/[id].
 *
 * One card design, applied to every item:
 *   ┌─────────────────────────────────┐
 *   │ favicon  Site Name (xs muted)   │
 *   │ Headline — text-sm, 2 lines     │
 *   │ Body excerpt — text-xs muted    │
 *   └─────────────────────────────────┘
 *
 * The first card is always the analyst's MorningBrief if one exists for the
 * run's trading day — clicking it opens BriefDetailDialog (the same dialog
 * the analyst overview uses). All other cards are real signal sources
 * (news, filings, social, etc.) pulled from Signal.sourceUrls.
 */

import { useState } from "react";
import { Search } from "lucide-react";
import { BriefDetailDialog } from "@/components/intelligence/brief-detail";
import type { UnifiedBrief } from "@/components/intelligence/brief-types";
import type { RunSourceItem } from "@/lib/actions/run-sources.actions";
import type { MorningBrief as IntelMorningBrief } from "@/components/intelligence/types";
import HindsightLogo from "@/components/HindsightLogo";

// ── Unified card ────────────────────────────────────────────────────────────

function SourceCard({
  faviconUrl,
  faviconNode,
  siteName,
  headline,
  body,
  onClick,
  href,
  accent,
}: {
  faviconUrl?: string;
  faviconNode?: React.ReactNode;
  siteName: string;
  headline: string;
  body: string;
  onClick?: () => void;
  href?: string;
  /** Optional badge rendered next to the site name (e.g. live pulse dot) */
  accent?: React.ReactNode;
}) {
  const inner = (
    <div className="rounded-md p-2 flex flex-col gap-1 cursor-pointer hover:bg-muted/60 transition-colors">
      <div className="flex items-center gap-1.5">
        {faviconNode ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            alt=""
            width={16}
            height={16}
            className="size-4 rounded-sm shrink-0"
            loading="lazy"
          />
        )}
        <span className="text-xs text-muted-foreground truncate">{siteName}</span>
        {accent}
      </div>
      <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{headline}</p>
      {body && (
        <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">{body}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {inner}
      </button>
    );
  }
  return inner;
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function RunSourcesPanel({
  brief,
  sources,
}: {
  brief: IntelMorningBrief | null;
  sources: RunSourceItem[];
}) {
  const [openBrief, setOpenBrief] = useState<UnifiedBrief | null>(null);

  const isEmpty = !brief && sources.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">No sources yet</p>
        <p className="text-xs mt-1">
          Sources will appear here as the agent researches
        </p>
      </div>
    );
  }

  const totalCount = sources.length + (brief ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-medium">Research Sources</h3>
        <span className="text-xs text-muted-foreground tabular-nums ml-auto">
          {totalCount}
        </span>
      </div>

      <div className="space-y-3">
        {brief && (
          <SourceCard
            faviconNode={
              <span className="size-4 shrink-0 inline-flex items-center justify-center text-brand">
                <HindsightLogo className="size-4" />
              </span>
            }
            siteName="Hindsight Morning Brief"
            accent={
              <span className="relative inline-flex size-1.5 shrink-0">
                <span className="absolute inset-0 rounded-full bg-brand-blue opacity-60 animate-ping" />
                <span className="relative size-1.5 rounded-full bg-brand-blue" />
              </span>
            }
            headline={`Morning Brief — ${brief.signalCount} signal${brief.signalCount === 1 ? "" : "s"}`}
            body={brief.marketContext}
            onClick={() =>
              setOpenBrief({
                id: brief.id,
                type: "intel",
                analystName: brief.analyst.name,
                date: brief.generatedAt,
                preview: brief.marketContext,
                tickers: brief.attentionPriority ?? [],
                signalCount: brief.signalCount,
                intelBrief: brief,
              })
            }
          />
        )}

        {sources.map((s) => (
          <SourceCard
            key={s.id}
            faviconUrl={s.favicon}
            siteName={s.siteName}
            headline={s.headline}
            body={s.body}
            href={s.url}
          />
        ))}
      </div>

      <BriefDetailDialog
        brief={openBrief}
        open={openBrief !== null}
        onOpenChange={(open) => !open && setOpenBrief(null)}
      />
    </div>
  );
}
