import { cn, pnlBadgeClasses } from "@/lib/utils";

interface PnlBadgeProps {
  value: number;
  format?: "percent" | "currency";
  showSign?: boolean;
  className?: string;
}

export function PnlBadge({
  value,
  format = "percent",
  showSign = true,
  className,
}: PnlBadgeProps) {
  const isPositive = value > 0;

  const formatted =
    format === "percent"
      ? `${showSign && isPositive ? "+" : ""}${value.toFixed(2)}%`
      : `${showSign && isPositive ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
        pnlBadgeClasses(value),
        className,
      )}
    >
      {formatted}
    </span>
  );
}
