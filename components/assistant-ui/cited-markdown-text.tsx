"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import {
  type FC,
  type ReactNode,
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  memo,
  useState,
} from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { useSources } from "@/components/assistant-ui/message-sources-context";
import { parseMarkers } from "@/components/chat/CitedText";
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
import type { SourceChipData } from "@/components/chat/SourceChip";
import { TickerChip, parseTickerMentions } from "@/components/chat/TickerChip";

// ─── Citation processing ────────────────────────────────────────────────────

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

type GroupedSeg =
  | { type: "text"; value: string }
  | { type: "citations"; indices: number[] };

function groupCitations(segments: { type: string; value?: string; index?: number }[]): GroupedSeg[] {
  const grouped: GroupedSeg[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      grouped.push({ type: "text", value: seg.value! });
    } else {
      const last = grouped[grouped.length - 1];
      if (last && last.type === "citations") {
        last.indices.push(seg.index!);
      } else {
        grouped.push({ type: "citations", indices: [seg.index!] });
      }
    }
  }
  return grouped;
}

/**
 * Process a plain text string: first handle [N] citations (grouped into
 * InlineCitation carousel pills), then $TICKER mentions.
 */
function processTextNode(
  text: string,
  sources: SourceChipData[],
  keyPrefix: string,
): ReactNode[] {
  const result: ReactNode[] = [];

  // Step 1: Split on citations [N] and group consecutive ones
  const rawSegments = parseMarkers(text);
  const grouped = groupCitations(rawSegments);

  for (let i = 0; i < grouped.length; i++) {
    const seg = grouped[i];

    if (seg.type === "citations") {
      const citationSources = seg.indices
        .map((idx) => sources[idx - 1])
        .filter(Boolean);

      if (citationSources.length === 0) {
        result.push(
          <sup key={`${keyPrefix}-c${i}`} className="text-muted-foreground text-[10px]">
            [{seg.indices.join("][")}]
          </sup>,
        );
      } else {
        const urls = citationSources.map(sourceUrl);
        result.push(
          <InlineCitation key={`${keyPrefix}-c${i}`}>
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
          </InlineCitation>,
        );
      }
      continue;
    }

    // Step 2: Plain text — check for $TICKER mentions
    const tickerSegments = parseTickerMentions(seg.value);
    if (tickerSegments.length === 1 && tickerSegments[0].type === "text") {
      result.push(<Fragment key={`${keyPrefix}-t${i}`}>{seg.value}</Fragment>);
    } else {
      for (let j = 0; j < tickerSegments.length; j++) {
        const tseg = tickerSegments[j];
        if (tseg.type === "text") {
          result.push(<Fragment key={`${keyPrefix}-t${i}-${j}`}>{tseg.value}</Fragment>);
        } else {
          result.push(<TickerChip key={`${keyPrefix}-tk${i}-${j}`} symbol={tseg.symbol} />);
        }
      }
    }
  }

  return result;
}

/**
 * Recursively walks React children, replacing text containing [N] patterns
 * with InlineCitationBadge popovers and $TICKER with interactive chips.
 * Handles nested elements (strong, em, a, etc.)
 */
function processCitationChildren(
  children: ReactNode,
  sources: SourceChipData[],
): ReactNode {
  return Children.map(children, (child, idx) => {
    // String text node — process citations + tickers
    if (typeof child === "string") {
      const nodes = processTextNode(child, sources, `n${idx}`);
      // If nothing was transformed, return plain string
      if (nodes.length === 1 && typeof nodes[0] === "string") return child;
      return nodes;
    }

    // React element with children — recurse into it
    if (isValidElement(child)) {
      const props = child.props as Record<string, unknown>;
      if (props.children) {
        return cloneElement(
          child,
          undefined,
          processCitationChildren(props.children as ReactNode, sources),
        );
      }
    }

    return child;
  });
}

// ─── Citation-aware text container components ───────────────────────────────

/**
 * Process children: always run through processCitationChildren which now
 * handles both [N] citations AND $TICKER mentions. Even with 0 sources,
 * we still want tickers to render.
 */
function CitedP({ className, children, ...props }: React.ComponentProps<"p">) {
  const sources = useSources();
  return (
    <p className={cn("aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0", className)} {...props}>
      {processCitationChildren(children, sources)}
    </p>
  );
}

function CitedLi({ className, children, ...props }: React.ComponentProps<"li">) {
  const sources = useSources();
  return (
    <li className={cn("aui-md-li leading-normal", className)} {...props}>
      {processCitationChildren(children, sources)}
    </li>
  );
}

function CitedTd({ className, children, ...props }: React.ComponentProps<"td">) {
  const sources = useSources();
  return (
    <td
      className={cn(
        "aui-md-td border-muted-foreground/20 border-b border-l px-2 py-1 text-left last:border-r [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    >
      {processCitationChildren(children, sources)}
    </td>
  );
}

function CitedBlockquote({ className, children, ...props }: React.ComponentProps<"blockquote">) {
  const sources = useSources();
  return (
    <blockquote
      className={cn(
        "aui-md-blockquote my-2.5 border-muted-foreground/30 border-l-2 pl-3 text-muted-foreground italic",
        className,
      )}
      {...props}
    >
      {processCitationChildren(children, sources)}
    </blockquote>
  );
}

// ─── Copy-to-clipboard hook ─────────────────────────────────────────────────

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

// ─── Code header ────────────────────────────────────────────────────────────

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root mt-2.5 flex items-center justify-between rounded-t-lg border border-border/50 border-b-0 bg-muted/50 px-3 py-1.5 text-xs">
      <span className="aui-code-header-language font-medium text-muted-foreground lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

// ─── Cited markdown components ──────────────────────────────────────────────
// Same as the base markdown-text.tsx components, but p, li, td, blockquote
// have citation support via the SourcesContext.

const citedComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "aui-md-h1 mb-2 scroll-m-20 font-semibold text-base first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "aui-md-h2 mt-3 mb-1.5 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, children, ...props }) => {
    // Belt-and-suspenders: strip "Stage N — NAME" / "Phase N — NAME" headings
    // that GPT-4o copies from system prompt structure despite the narration rule.
    // The system prompt uses these as internal instruction labels (not ### headers),
    // but the model still sometimes outputs them. This filter is the last line of
    // defense. DO NOT REMOVE — it will be needed as long as stage terminology
    // appears anywhere in the system prompt.
    const text = Array.isArray(children)
      ? children.map((c) => (typeof c === "string" ? c : "")).join("")
      : typeof children === "string"
        ? children
        : "";
    if (/^(Stage|Phase)\s+\d+\s*[—–\-]/i.test(text.trim())) return null;
    return (
      <h3
        className={cn(
          "aui-md-h3 mt-2.5 mb-1 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0",
          className,
        )}
        {...props}
      >
        {children}
      </h3>
    );
  },
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "aui-md-h4 mt-2 mb-1 scroll-m-20 font-medium text-sm first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "aui-md-h5 mt-2 mb-1 font-medium text-sm first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "aui-md-h6 mt-2 mb-1 font-medium text-sm first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  // ── Citation-aware text containers ──
  p: CitedP,
  li: CitedLi,
  td: CitedTd,
  blockquote: CitedBlockquote,
  // ── Non-citation components (same as base) ──
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "aui-md-a text-primary underline underline-offset-2 hover:text-primary/80",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "aui-md-ul my-2 ml-4 list-disc marker:text-muted-foreground [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "aui-md-ol my-2 ml-4 list-decimal marker:text-muted-foreground [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn("aui-md-hr my-2 border-muted-foreground/20", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(
        "aui-md-table my-2 w-full border-separate border-spacing-0 overflow-y-auto",
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "aui-md-th bg-muted px-2 py-1 text-left font-medium first:rounded-tl-lg last:rounded-tr-lg [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "aui-md-pre overflow-x-auto rounded-t-none rounded-b-lg border border-border/50 border-t-0 bg-muted/30 p-3 text-xs leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock &&
            "aui-md-inline-code rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});

// ─── CitedMarkdownText ──────────────────────────────────────────────────────

const CitedMarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={citedComponents}
    />
  );
};

export const CitedMarkdownText = memo(CitedMarkdownTextImpl);
