"use client";

import { cn } from "@/lib/utils";

/**
 * ChipTabs — reusable segmented filter shaped like the Trades All/Open/Closed
 * row on the analyst page. Single visual language for small inline filters:
 *
 *   - Rounded full pill
 *   - Active  → secondary fill
 *   - Inactive → ghost, text at 60% opacity, full opacity on hover
 *   - No counts in the chip itself (caller surfaces totals separately if needed)
 *
 * Used on:
 *   - Analyst page trades filter
 *   - Intelligence Briefs date selector
 *   - Analyst page Routing stats strip
 */

export interface ChipTabOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional accessible tooltip — useful when the label is an abbreviation. */
  title?: string;
}

interface ChipTabsProps<T extends string = string> {
  options: readonly ChipTabOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /**
   * When true, clicking the active chip clears the selection (returns null).
   * When false, the active chip is non-toggleable. Default: true.
   */
  clearable?: boolean;
  className?: string;
}

export function ChipTabs<T extends string = string>({
  options,
  value,
  onChange,
  clearable = true,
  className,
}: ChipTabsProps<T>) {
  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (isActive && clearable) onChange(null);
              else if (!isActive) onChange(opt.value);
            }}
            title={opt.title}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground border-secondary"
                : "text-muted-foreground opacity-60 hover:opacity-100 border-transparent",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
