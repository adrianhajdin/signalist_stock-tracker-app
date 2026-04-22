"use client";

/**
 * Markdown renderer with inline $TICKER chip support.
 * Wraps react-markdown and processes text nodes to replace $AAPL patterns
 * with interactive TickerChip components (live price + hover card).
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  TickerChip,
  parseTickerMentions,
  usePrefetchTickers,
} from "@/components/chat/TickerChip";
import { Fragment, type ReactNode, Children, isValidElement, cloneElement, useMemo } from "react";

// ── Ticker processing ─────────────────────────────────────────────────────────

function processTextWithTickers(text: string, keyPrefix: string): ReactNode[] {
  const segments = parseTickerMentions(text);
  if (segments.length === 1 && segments[0].type === "text") {
    return [text];
  }
  return segments.map((seg, i) =>
    seg.type === "text" ? (
      <Fragment key={`${keyPrefix}-${i}`}>{seg.value}</Fragment>
    ) : (
      <TickerChip key={`${keyPrefix}-tk${i}`} symbol={seg.symbol} />
    )
  );
}

function processChildrenWithTickers(children: ReactNode): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      const nodes = processTextWithTickers(child, `n${idx}`);
      if (nodes.length === 1 && typeof nodes[0] === "string") return child;
      return nodes;
    }
    if (isValidElement(child)) {
      const props = child.props as Record<string, unknown>;
      if (props.children) {
        return cloneElement(
          child,
          undefined,
          processChildrenWithTickers(props.children as ReactNode)
        );
      }
    }
    return child;
  });
}

// ── Ticker-aware markdown component wrappers ────────────────────────────────

function TickerP({ children }: { children?: ReactNode }) {
  return (
    <p className="my-3 text-base leading-7 first:mt-0 last:mb-0">
      {processChildrenWithTickers(children)}
    </p>
  );
}

function TickerLi({ children }: { children?: ReactNode }) {
  return (
    <li className="text-base leading-7">
      {processChildrenWithTickers(children)}
    </li>
  );
}

function TickerBlockquote({ children }: { children?: ReactNode }) {
  return (
    <blockquote className="my-4 border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
      {processChildrenWithTickers(children)}
    </blockquote>
  );
}

// ── Component maps ──────────────────────────────────────────────────────────

const tickerProseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-8 scroll-m-20 text-2xl font-bold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-6 scroll-m-20 text-lg font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 scroll-m-20 text-base font-semibold first:mt-0">
      {children}
    </h3>
  ),
  p: TickerP,
  ul: ({ children }) => (
    <ul className="my-3 ml-6 list-disc marker:text-muted-foreground [&>li]:mt-1.5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-6 list-decimal marker:text-muted-foreground [&>li]:mt-1.5">
      {children}
    </ol>
  ),
  li: TickerLi,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: TickerBlockquote,
  hr: () => <hr className="my-6 border-muted-foreground/20" />,
  code: ({ children }) => (
    <code className="rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-3 py-2 text-left font-semibold bg-muted/50">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-2">{children}</td>
  ),
};

// ── Extract tickers from markdown for batch prefetch ─────────────────────────

const TICKER_RE = /(?<!\w)\$([A-Z]{1,5})(?!\w)/g;

function extractTickers(text: string): string[] {
  const matches = text.matchAll(TICKER_RE);
  return [...new Set([...matches].map((m) => m[1]))];
}

// ── Public component ────────────────────────────────────────────────────────

interface TickerMarkdownProps {
  children: string;
  className?: string;
}

export function TickerMarkdown({ children, className }: TickerMarkdownProps) {
  const tickers = useMemo(() => extractTickers(children), [children]);
  usePrefetchTickers(tickers);

  return (
    <div className={cn("max-w-none text-foreground/90", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={tickerProseComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
