import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── P&L color helpers ─────────────────────────────────────────────
// Use these everywhere instead of hardcoding emerald/red classes.
// The colors come from --positive / --negative CSS variables.

/** Returns the text color class for a numeric value */
export function pnlColor(value: number): string {
  if (value === 0) return "text-muted-foreground";
  return value > 0 ? "text-positive" : "text-negative";
}

/** Returns text + bg classes for badge-style rendering (bg at 10% opacity) */
export function pnlBadgeClasses(value: number): string {
  if (value === 0) return "bg-muted text-muted-foreground";
  return value > 0
    ? "bg-positive/10 text-positive"
    : "bg-negative/10 text-negative";
}

/** Returns the hex value for charts/SVGs where CSS classes won't work */
export const PNL_HEX = {
  positive: "#51b857",
  negative: "#ff6d87",
} as const;

/** Returns the correct hex for a numeric value (for chart strokes, etc.) */
export function pnlHex(value: number): string {
  return value >= 0 ? PNL_HEX.positive : PNL_HEX.negative;
}

export function getFormattedTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
