"use client";

import { useState, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FirstVisitTooltipProps {
  /** Bold header */
  title: string;
  /** Subtitle / description */
  description: string;
  storageKey: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  /** "brand" = emerald green background */
  variant?: "default" | "brand";
  children: ReactNode;
}

export function FirstVisitTooltip({
  title,
  description,
  storageKey,
  side = "top",
  align = "start",
  variant = "default",
  children,
}: FirstVisitTooltipProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const key = `hindsight-fvt-${storageKey}`;
    if (!localStorage.getItem(key)) {
      setShow(true);
    }
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(`hindsight-fvt-${storageKey}`, "1");
    setShow(false);
  }

  return (
    <div className="relative">
      {children}

      {show && (
        <>
          {/* Dismiss backdrop */}
          <div className="fixed inset-0 z-40" onClick={dismiss} aria-hidden="true" />

          <div
            role="tooltip"
            className={cn(
              "absolute z-50 w-72 rounded-xl px-3 py-2.5 shadow-lg",
              "animate-in fade-in-0 zoom-in-95 duration-200",
              side === "top"
                ? "bottom-[calc(100%+10px)]"
                : "top-[calc(100%+10px)]",
              align === "start" && "left-0",
              align === "center" && "left-1/2 -translate-x-1/2",
              align === "end" && "right-0",
              variant === "brand"
                ? "bg-brand text-brand-foreground"
                : "border bg-popover text-popover-foreground",
            )}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{title}</p>
              <button
                onClick={dismiss}
                className={cn(
                  "shrink-0 rounded p-0.5 transition-colors",
                  variant === "brand"
                    ? "hover:bg-brand-foreground/10"
                    : "hover:bg-muted",
                )}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Description */}
            <p
              className={cn(
                "mt-1 text-xs leading-relaxed",
                variant === "brand"
                  ? "text-brand-foreground/70"
                  : "text-muted-foreground",
              )}
            >
              {description}
            </p>

            {/* Arrow */}
            <span
              className={cn(
                "absolute h-2.5 w-2.5 rotate-45",
                side === "top" ? "bottom-[-5px]" : "top-[-5px]",
                align === "start" && "left-4",
                align === "center" && "left-1/2 -translate-x-1/2",
                align === "end" && "right-4",
                variant === "brand"
                  ? "bg-brand"
                  : cn(
                      "border bg-popover",
                      side === "top"
                        ? "border-t-0 border-l-0"
                        : "border-b-0 border-r-0",
                    ),
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
