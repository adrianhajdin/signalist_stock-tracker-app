// ── Centralized formatting helpers ────────────────────────────────────────────
// Use these everywhere instead of inline toLocaleString / Intl.NumberFormat.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "$1,234.56" */
export function formatCurrency(value: number): string {
  return USD.format(value);
}

/** "+$1,234.56" or "-$1,234.56" */
export function formatSignedCurrency(value: number): string {
  const abs = USD.format(Math.abs(value));
  return value >= 0 ? `+${abs}` : `-${abs}`;
}

/** "$1.2K", "$3.5M" — for compact displays */
export function formatCompactCurrency(value: number): string {
  return USD_COMPACT.format(value);
}

/** "12.34%" */
export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/** "+12.34%" or "-12.34%" */
export function formatSignedPercent(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** "just now", "5s ago", "3m ago", "2h ago", "4d ago" */
export function formatRelativeTime(date: Date | string): string {
  const d = Date.now() - new Date(date).getTime();
  const s = Math.floor(d / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "Mar 14" from "2024-03-14", or "2:30 PM" from "2024-03-14T14:30" */
export function formatDateLabel(d: string): string {
  if (d.includes("T")) {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (d.length === 10 && d.includes("-")) {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d;
}
