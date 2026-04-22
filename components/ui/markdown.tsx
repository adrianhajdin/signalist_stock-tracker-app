import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// ── Shared markdown component maps ──────────────────────────────────────────
// Extracted from AnalystDetailClient and other pages.
// Two variants: "prose" (full-page document) and "compact" (cards/sheets).

const proseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-8 scroll-m-20 text-3xl font-bold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 scroll-m-20 text-2xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 scroll-m-20 text-lg font-semibold first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-3 text-base leading-7 first:mt-0 last:mb-0">
      {children}
    </p>
  ),
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
  li: ({ children }) => (
    <li className="text-base leading-7">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
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

const compactComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-lg font-bold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-2 text-sm leading-6 first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-5 list-disc marker:text-muted-foreground [&>li]:mt-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-5 list-decimal marker:text-muted-foreground [&>li]:mt-1">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-6">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground italic text-sm">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-muted-foreground/20" />,
  code: ({ children }) => (
    <code className="rounded-md border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1.5 text-left font-semibold bg-muted/50">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1.5">{children}</td>
  ),
};

const VARIANT_MAP: Record<string, Components> = {
  prose: proseComponents,
  compact: compactComponents,
};

const WRAPPER_CLASS: Record<string, string> = {
  prose: "prose prose-lg dark:prose-invert max-w-none text-foreground/90",
  compact: "max-w-none text-foreground/90",
};

interface MarkdownProps {
  /** The markdown content string */
  children: string;
  /** Display variant */
  variant?: "prose" | "compact";
  /** Additional class names for the wrapper div */
  className?: string;
}

export function Markdown({
  children,
  variant = "prose",
  className,
}: MarkdownProps) {
  return (
    <div className={cn(WRAPPER_CLASS[variant], className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={VARIANT_MAP[variant]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
