"use client";

/**
 * ToolProgress — simplified tool execution display.
 * One level of collapse. Flat dot lists. No per-item icons.
 */

import { memo, useState, type ComponentProps, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  DotIcon,
  Loader2Icon,
  PlusIcon,
  MinusIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  XIcon,
  BanIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Action icon overlay (used by ToolProgressTickerItem for action tools) ──

export type TickerActionIcon =
  | "buy"
  | "sell"
  | "watch"
  | "unwatch"
  | "closed-win"
  | "closed-loss"
  | "failed";

const ACTION_ICON_CONFIG: Record<
  TickerActionIcon,
  { Icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  buy:           { Icon: PlusIcon,   className: "bg-emerald-500 text-white" },
  sell:          { Icon: MinusIcon,  className: "bg-red-500 text-white" },
  watch:         { Icon: EyeIcon,    className: "bg-muted-foreground text-background" },
  unwatch:       { Icon: EyeOffIcon, className: "bg-muted-foreground text-background" },
  "closed-win":  { Icon: CheckIcon,  className: "bg-emerald-500 text-white" },
  "closed-loss": { Icon: XIcon,      className: "bg-red-500 text-white" },
  failed:        { Icon: BanIcon,    className: "bg-muted text-muted-foreground" },
};

// ── ToolProgress (root) ────────────────────────────────────────────────────

export type ToolProgressProps = ComponentProps<"div"> & {
  defaultOpen?: boolean;
};

export const ToolProgress = memo(
  ({ className, defaultOpen = false, children, ...props }: ToolProgressProps) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className={cn("not-prose w-full my-3", className)} data-open={open || undefined} {...props}>
          {children}
        </div>
      </Collapsible>
    );
  }
);
ToolProgress.displayName = "ToolProgress";

// ── Header (inline — chevron right after text) ─────────────────────────────

export type ToolProgressHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
};

export const ToolProgressHeader = memo(
  ({ className, loading, icon: Icon, children, ...props }: ToolProgressHeaderProps) => (
    <CollapsibleTrigger
      className={cn(
        "inline-flex items-center gap-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none",
        className
      )}
      {...props}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span>{children}</span>
      {loading ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <ChevronRightIcon className="size-3 transition-transform [[data-open]_&]:rotate-90" />
      )}
    </CollapsibleTrigger>
  )
);
ToolProgressHeader.displayName = "ToolProgressHeader";

// ── Content ────────────────────────────────────────────────────────────────

export type ToolProgressContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolProgressContent = memo(
  ({ className, ...props }: ToolProgressContentProps) => (
    <CollapsibleContent
      className={cn("space-y-3 pt-2 pb-1", className)}
      {...props}
    />
  )
);
ToolProgressContent.displayName = "ToolProgressContent";

// ── Item (DotIcon + text — same pattern as Notion/Claude CoT) ──────────────

export type ToolProgressItemProps = ComponentProps<"div"> & {
  active?: boolean;
};

export const ToolProgressItem = memo(
  ({ className, active, children, ...props }: ToolProgressItemProps) => (
    <div
      className={cn(
        "flex items-start gap-2 text-sm",
        active ? "text-foreground" : "text-muted-foreground",
        className
      )}
      {...props}
    >
      <div className="size-4 shrink-0 mt-0.5 flex items-center justify-center">
        <DotIcon className={cn("size-5", active && "animate-pulse")} />
      </div>
      <span className={cn("flex-1 min-w-0", active && "shimmer-text")}>{children}</span>
    </div>
  )
);
ToolProgressItem.displayName = "ToolProgressItem";

// ── Ticker Item (logo replaces dot, same fixed-width slot) ─────────────────

export type ToolProgressTickerItemProps = ComponentProps<"div"> & {
  ticker: string;
  tag?: string;
  actionIcon?: TickerActionIcon;
  active?: boolean;
  children: ReactNode;
};

export const ToolProgressTickerItem = memo(
  ({ className, ticker, tag, actionIcon, active, children, ...props }: ToolProgressTickerItemProps) => {
    const overlay = actionIcon ? ACTION_ICON_CONFIG[actionIcon] : null;
    return (
      <div
        className={cn("flex items-start gap-2 text-sm text-muted-foreground", className)}
        {...props}
      >
        <div className="relative size-4 shrink-0 mt-0.5 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://assets.parqet.com/logos/symbol/${ticker}`}
            alt=""
            width={16}
            height={16}
            className="size-4 rounded-full"
            loading="lazy"
            onError={(e) => {
              // Fall back to dot on logo load failure
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              el.parentElement?.classList.add("fallback-dot");
            }}
          />
          {overlay && (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-1 ring-background flex items-center justify-center",
                overlay.className,
              )}
              aria-hidden
            >
              <overlay.Icon className="size-1.5" />
            </span>
          )}
        </div>
        <span className={cn("flex-1 min-w-0", active && "shimmer-text")}>
          <span className="font-medium">${ticker}</span>
          {tag && <span> ({tag})</span>}
          <span> — </span>
          {children}
        </span>
      </div>
    );
  }
);
ToolProgressTickerItem.displayName = "ToolProgressTickerItem";

// ── Sources (uses Badge — matches InlineCitationCardTrigger style) ──────────

export type ToolProgressSourcesProps = ComponentProps<"div"> & {
  domains: string[];
};

export const ToolProgressSources = memo(
  ({ className, domains, ...props }: ToolProgressSourcesProps) => {
    if (domains.length === 0) return null;

    return (
      <div
        className={cn("flex items-center gap-1.5 pt-1.5", className)}
        {...props}
      >
        {domains.map((domain) => (
          <Badge key={domain} variant="secondary" className="font-normal text-muted-foreground rounded-full gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
              alt=""
              width={12}
              height={12}
              className="size-3 shrink-0 rounded-sm"
              loading="lazy"
            />
            {domain}
          </Badge>
        ))}
      </div>
    );
  }
);
ToolProgressSources.displayName = "ToolProgressSources";
