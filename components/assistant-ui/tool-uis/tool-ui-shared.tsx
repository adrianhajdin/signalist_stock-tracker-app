"use client";

import { createContext, useContext } from "react";
import type { AgentConfigData } from "@/components/domain/agent-config-card";
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

// ─── Context for passing callbacks into tool UIs ────────────────────────────

export type ToolUICallbacks = {
  /** Builder mode: create from config */
  onConfirmConfig?: (config: AgentConfigData) => void;
  /** Builder mode: notify parent that config was suggested (for panel) */
  onConfigSuggested?: (config: AgentConfigData) => void;
  isCreating?: boolean;
  confirmLabel?: string;
  confirmingLabel?: string;
  /** Editor mode: apply diff against existing config */
  currentConfig?: Record<string, unknown>;
  onApplyConfig?: (config: AgentConfigData) => void;
  isApplying?: boolean;
  applied?: boolean;
};

const ToolUICallbacksContext = createContext<ToolUICallbacks>({});

export const ToolUICallbacksProvider = ToolUICallbacksContext.Provider;
export const useToolUICallbacks = () => useContext(ToolUICallbacksContext);

// ─── Source attribution helpers ─────────────────────────────────────────────

import type { ToolSource } from "@/lib/agent/tool-types";

/** @deprecated Use ToolSource from lib/agent/tool-types.ts */
export type SourceData = ToolSource;

/** Extract _sources from a tool result */
export function extractToolSources(result: Record<string, unknown>): ToolSource[] {
  const raw = result._sources;
  if (Array.isArray(raw)) {
    return raw.filter(
      (s): s is ToolSource =>
        typeof s === "object" &&
        s !== null &&
        "provider" in s &&
        "title" in s &&
        // Filter out the legacy fake "Hindsight Intelligence" placeholder
        // baked into old persisted morning_brief tool results.
        String((s as { provider: unknown }).provider).toLowerCase() !== "hindsight intelligence",
    );
  }
  return [];
}

// ─── Source Chips (InlineCitation badge + hover carousel) ──────────────────

const PROVIDER_DOMAINS: Record<string, string> = {
  finnhub: "https://finnhub.io",
  fmp: "https://financialmodelingprep.com",
  reddit: "https://reddit.com",
  stocktwits: "https://stocktwits.com",
  twitter: "https://x.com",
  "fmp social": "https://financialmodelingprep.com",
  technical: "https://finnhub.io",
  earnings: "https://finnhub.io",
  options: "https://financialmodelingprep.com",
  sec: "https://sec.gov",
};

function sourceUrl(s: ToolSource): string {
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
    <div className="flex items-center gap-2 mb-1">
      {favicon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm" />
      )}
      <span className="text-xs font-medium text-muted-foreground">{provider}</span>
    </div>
  );
}

export function SourceChips({ sources }: { sources: ToolSource[] }) {
  if (!sources.length) return null;
  const urls = sources.map(sourceUrl);

  return (
    <div className="mt-1.5">
      <InlineCitation>
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
                {sources.map((s, i) => (
                  <InlineCitationCarouselItem key={`${s.provider}-${i}`}>
                    <ProviderRow provider={s.provider} url={urls[i]} />
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
    </div>
  );
}
