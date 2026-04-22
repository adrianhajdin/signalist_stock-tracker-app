import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FillProps = {
  mode: "fill";
  /** 0–1 percentage filled */
  value: number;
  /** Which semantic color for filled bars */
  color?: "positive" | "negative" | "muted-foreground";
};

type RangeProps = {
  mode: "range";
  /** 0–1 where 0=stop, 0.5=entry, 1=target */
  value: number;
};

type DistributionRange = { count: number; color: string };

type DistributionProps = {
  mode: "distribution";
  /** Color ranges rendered left-to-right; total bars = sum of counts (min 20) */
  ranges: DistributionRange[];
};

type BarGaugeProps = (FillProps | RangeProps | DistributionProps) & {
  /** Number of bars (minimum 12, default 24) */
  segments?: number;
  className?: string;
};

// ─── Color helpers ────────────────────────────────────────────────────────────

const FILL_COLORS: Record<string, string> = {
  positive: "bg-positive",
  negative: "bg-negative",
  "muted-foreground": "bg-muted-foreground",
};

function buildColors(props: FillProps | RangeProps | DistributionProps, segments: number): string[] {
  if (props.mode === "fill") {
    const filled = Math.round(props.value * segments);
    const fillClass = FILL_COLORS[props.color ?? "positive"] ?? "bg-positive";
    return Array.from({ length: segments }, (_, i) =>
      i < filled ? fillClass : "bg-muted",
    );
  }

  if (props.mode === "range") {
    const mid = Math.floor(segments / 2);
    const pos = Math.round(props.value * segments);
    const clamped = Math.max(0, Math.min(segments, pos));

    return Array.from({ length: segments }, (_, i) => {
      if (i >= clamped) return "bg-muted";
      // Below entry midpoint → negative zone
      if (clamped <= mid) return "bg-negative";
      // At or above entry: bars before midpoint are light green, after are strong green
      return i < mid ? "bg-positive/40" : "bg-positive";
    });
  }

  // distribution
  const colors: string[] = [];
  for (const range of props.ranges) {
    for (let j = 0; j < range.count; j++) {
      colors.push(range.color);
    }
  }
  // Pad to fill segment count
  while (colors.length < segments) {
    colors.push("bg-muted");
  }
  return colors.slice(0, segments);
}

// ─── Price → range helper ─────────────────────────────────────────────────────

/** Convert entry/target/stop prices to a 0–1 range value for mode="range" */
export function priceToRange(opts: {
  entry: number;
  current?: number;
  target?: number | null;
  stop?: number | null;
  direction?: "LONG" | "SHORT";
}): number {
  const { entry, current, target, stop, direction = "LONG" } = opts;
  const s = stop ?? entry;
  const t = target ?? entry;
  const range = t - s;
  if (range === 0) return 0.5;

  const price = current ?? entry;
  if (direction === "LONG") {
    return (price - s) / range;
  }
  return (s - price) / (s - t);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BarGauge(props: BarGaugeProps) {
  const { className, ...modeProps } = props;

  // Distribution mode: total bars = sum of counts, minimum 12
  let segments = props.segments ?? 24;
  if (modeProps.mode === "distribution" && !props.segments) {
    const total = modeProps.ranges.reduce((sum, r) => sum + r.count, 0);
    segments = Math.max(segments, total);
  }

  const colors = buildColors(modeProps, segments);

  return (
    <div
      className={cn("grid gap-[1px]", className)}
      style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}
    >
      {colors.map((color, i) => (
        <div
          key={i}
          className={cn("h-[3px] rounded-sm", color)}
        />
      ))}
    </div>
  );
}
