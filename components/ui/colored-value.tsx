import { cn, pnlColor, pnlBadgeClasses } from "@/lib/utils";
import {
  formatCurrency,
  formatSignedCurrency,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

// ── ColoredValue ─────────────────────────────────────────────────────────────
// The single component for rendering any positive/negative financial metric.
//
// Usage:
//   <ColoredValue value={-2.3} format="percent" />        → "-2.30%" in red
//   <ColoredValue value={150} format="currency" />        → "+$150.00" in green
//   <ColoredValue value={-50} format="currency" badge />  → badge with red bg
//   <ColoredValue value={0.82} format="number" neutral /> → "0.82" in muted

type Format = "currency" | "percent" | "number";

interface ColoredValueProps {
  /** The numeric value to display */
  value: number;
  /** How to format the number */
  format?: Format;
  /** Decimal places (for percent and number formats) */
  decimals?: number;
  /** Show as a badge with background color instead of plain text */
  badge?: boolean;
  /** Force neutral/muted styling regardless of value */
  neutral?: boolean;
  /** Custom color override — bypasses automatic positive/negative logic */
  colorClass?: string;
  /** Additional class names */
  className?: string;
}

function formatValue(value: number, format: Format, decimals: number): string {
  switch (format) {
    case "currency":
      return formatSignedCurrency(value);
    case "percent":
      return formatSignedPercent(value, decimals);
    case "number":
      return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
  }
}

export function ColoredValue({
  value,
  format = "number",
  decimals = 2,
  badge = false,
  neutral = false,
  colorClass,
  className,
}: ColoredValueProps) {
  const color = neutral
    ? "text-muted-foreground"
    : colorClass ?? pnlColor(value);

  if (badge) {
    const badgeColor = neutral
      ? "bg-muted text-muted-foreground"
      : pnlBadgeClasses(value);

    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
          badgeColor,
          className,
        )}
      >
        {formatValue(value, format, decimals)}
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", color, className)}>
      {formatValue(value, format, decimals)}
    </span>
  );
}

// ── UnsignedColoredValue ─────────────────────────────────────────────────────
// For values where you want color but NO +/- sign prefix.
// e.g., target price ($125.50 in green), stop loss ($95.00 in red)

interface UnsignedColoredValueProps {
  value: number;
  format?: "currency" | "percent" | "number";
  decimals?: number;
  /** Whether value is "good" (green) or "bad" (red) */
  positive?: boolean;
  className?: string;
}

export function UnsignedColoredValue({
  value,
  format = "number",
  decimals = 2,
  positive,
  className,
}: UnsignedColoredValueProps) {
  const color =
    positive === undefined
      ? "text-foreground"
      : positive
        ? "text-positive"
        : "text-negative";

  let formatted: string;
  switch (format) {
    case "currency":
      formatted = formatCurrency(value);
      break;
    case "percent":
      formatted = formatPercent(value, decimals);
      break;
    case "number":
      formatted = value.toFixed(decimals);
      break;
  }

  return (
    <span className={cn("tabular-nums", color, className)}>
      {formatted}
    </span>
  );
}
