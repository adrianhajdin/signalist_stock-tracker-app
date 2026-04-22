"use client";

import { memo, useRef, useState, useEffect, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { DotIcon } from "lucide-react";

export type ClampedTextProps = ComponentProps<"div"> & {
  lines?: number;
};

export const ClampedText = memo(
  ({ className, lines = 2, children, ...props }: ClampedTextProps) => {
    const [expanded, setExpanded] = useState(false);
    const [needsClamp, setNeedsClamp] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
    }, [children]);

    const clampClass = !expanded && lines === 2 ? "line-clamp-2"
      : !expanded && lines === 3 ? "line-clamp-3"
      : undefined;

    return (
      <div className={cn("flex items-start gap-1 text-sm text-muted-foreground", className)} {...props}>
        <DotIcon className="size-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div ref={ref} className={clampClass}>
            {children}
          </div>
          {needsClamp && !expanded && (
            <button
              type="button"
              className="text-xs text-muted-foreground/70 hover:text-foreground mt-0.5"
              onClick={() => setExpanded(true)}
            >
              Show more
            </button>
          )}
        </div>
      </div>
    );
  }
);
ClampedText.displayName = "ClampedText";
