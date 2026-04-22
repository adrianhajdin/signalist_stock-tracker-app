"use client";

import type { SourceChipData } from "@/components/chat/SourceChip";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselPrev,
  InlineCitationCarouselNext,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { Fragment } from "react";

// ─── Provider URL fallbacks ─────────────────────────────────────────────────

const PROVIDER_DOMAINS: Record<string, string> = {
  finnhub: "https://finnhub.io",
  fmp: "https://financialmodelingprep.com",
  reddit: "https://reddit.com",
  stocktwits: "https://stocktwits.com",
  twitter: "https://x.com",
  technical: "https://finnhub.io",
  earnings: "https://finnhub.io",
  options: "https://financialmodelingprep.com",
  sec: "https://sec.gov",
};

function sourceUrl(s: SourceChipData): string {
  if (s.url) return s.url;
  const key = s.provider.toLowerCase().replace(/[^a-z ]/g, "");
  return PROVIDER_DOMAINS[key] ?? `https://${s.provider.toLowerCase().replace(/[^a-z]/g, "")}.com`;
}

function faviconFromUrl(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return null;
  }
}

function ProviderRow({ provider, url }: { provider: string; url: string }) {
  const favicon = faviconFromUrl(url);
  return (
    <span className="flex items-center gap-2 mb-1">
      {favicon && (
        <img src={favicon} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm" />
      )}
      <span className="text-xs font-medium text-muted-foreground">{provider}</span>
    </span>
  );
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export type Segment =
  | { type: "text"; value: string }
  | { type: "citation"; index: number };

export function parseMarkers(text: string): Segment[] {
  const pattern = /\[(\d+)\]/g;
  const segments: Segment[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastEnd) {
      segments.push({ type: "text", value: text.slice(lastEnd, match.index) });
    }
    segments.push({ type: "citation", index: parseInt(match[1], 10) });
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd < text.length) {
    segments.push({ type: "text", value: text.slice(lastEnd) });
  }

  return segments;
}

// ─── Collect consecutive citations into groups ──────────────────────────────

type GroupedSegment =
  | { type: "text"; value: string }
  | { type: "citations"; indices: number[] };

function groupConsecutiveCitations(segments: Segment[]): GroupedSegment[] {
  const grouped: GroupedSegment[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      grouped.push(seg);
    } else {
      const last = grouped[grouped.length - 1];
      if (last && last.type === "citations") {
        last.indices.push(seg.index);
      } else {
        grouped.push({ type: "citations", indices: [seg.index] });
      }
    }
  }

  return grouped;
}

// ─── CitedText ───────────────────────────────────────────────────────────────

export function CitedText({
  text,
  sources = [],
  className,
}: {
  text: string;
  sources?: SourceChipData[];
  className?: string;
}) {
  const segments = parseMarkers(text);

  // No citations found — render plain text
  if (segments.length === 1 && segments[0].type === "text") {
    return <span className={className}>{text}</span>;
  }

  const grouped = groupConsecutiveCitations(segments);

  return (
    <span className={className}>
      {grouped.map((seg, i) => {
        if (seg.type === "text") {
          return <Fragment key={i}>{seg.value}</Fragment>;
        }

        // Gather sources for this citation group
        const citationSources = seg.indices
          .map((idx) => sources[idx - 1])
          .filter(Boolean);

        if (citationSources.length === 0) {
          return (
            <sup key={i} className="text-muted-foreground">
              [{seg.indices.join("][")}]
            </sup>
          );
        }

        const urls = citationSources.map(sourceUrl);

        return (
          <InlineCitation key={i}>
            <InlineCitationCard>
              <InlineCitationCardTrigger sources={urls} />
              <InlineCitationCardBody>
                <InlineCitationCarousel>
                  <InlineCitationCarouselHeader>
                    <InlineCitationCarouselPrev />
                    <InlineCitationCarouselNext />
                    <InlineCitationCarouselIndex />
                  </InlineCitationCarouselHeader>
                  <InlineCitationCarouselContent>
                    {citationSources.map((s, j) => (
                      <InlineCitationCarouselItem key={j}>
                        <ProviderRow provider={s.provider} url={sourceUrl(s)} />
                        <InlineCitationSource
                          title={s.title}
                          url={s.url}
                          description={s.excerpt}
                        />
                      </InlineCitationCarouselItem>
                    ))}
                  </InlineCitationCarouselContent>
                </InlineCitationCarousel>
              </InlineCitationCardBody>
            </InlineCitationCard>
          </InlineCitation>
        );
      })}
    </span>
  );
}
