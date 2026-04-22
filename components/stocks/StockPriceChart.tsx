'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { StockCandle } from '@/lib/actions/finnhub.actions';

// ─── Types ──────────────────────────────────────────────────────────────────

type PriceReferenceLine = {
  price: number;
  color: string;
  label: string;
  dashed?: boolean;
};

type Props = {
  candles: StockCandle[];
  referenceLines?: PriceReferenceLine[];
  children?: React.ReactNode;
};

// ─── Range config ───────────────────────────────────────────────────────────

const RANGES = ['1W', '1M', '3M', '1Y'] as const;
type Range = (typeof RANGES)[number];

const RANGE_DAYS: Record<Range, number> = {
  '1W': 5,
  '1M': 22,
  '3M': 66,
  '1Y': 252,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StockPriceChart({ candles, referenceLines, children }: Props) {
  const [range, setRange] = useState<Range>('3M');

  const data = useMemo(() => {
    const days = RANGE_DAYS[range];
    return candles.slice(-days);
  }, [candles, range]);

  if (data.length < 2) {
    return (
      <div
        className="relative rounded-lg overflow-hidden border h-[300px] flex items-center justify-center"
        style={{
          backgroundImage:
            'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          backgroundColor: 'hsl(var(--muted)/0.3)',
        }}
      >
        <p className="text-xs text-muted-foreground">No price data available</p>
      </div>
    );
  }

  const firstClose = data[0].close;
  const lastClose = data[data.length - 1].close;
  const isUp = lastClose >= firstClose;
  // Use hex colors — CSS variables are oklch() which don't work in SVG stroke/fill
  const strokeColor = isUp ? '#22c55e' : '#ef4444';

  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{
        backgroundImage:
          'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        backgroundColor: 'hsl(var(--muted)/0.3)',
      }}
    >
      {children}
      <div className="relative">
      {/* Range pills — absolute top-left of chart area */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-0.5 bg-background/80 backdrop-blur-sm rounded-md border px-1 py-0.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              range === r
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 40, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#71717a', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatDateLabel(v).toUpperCase()}
            interval={Math.max(1, Math.floor(data.length / 6))}
            padding={{ left: 0, right: 0 }}
          />
          <YAxis hide domain={['dataMin * 0.98', 'dataMax * 1.15']} />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--popover-foreground)',
            }}
            formatter={(v: number) => [
              `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Close',
            ]}
            labelFormatter={(l: string) => formatDateLabel(l)}
            labelStyle={{ color: 'var(--muted-foreground)' }}
          />
          {/* Reference lines for trade entry/target/stop */}
          {referenceLines?.map((line) => (
            <ReferenceLine
              key={line.label}
              y={line.price}
              stroke={line.color}
              strokeDasharray={line.dashed !== false ? '4 4' : undefined}
              strokeWidth={1}
              label={{
                value: `${line.label} $${line.price.toFixed(2)}`,
                position: 'right',
                fontSize: 9,
                fill: line.color,
              }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="close"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill="url(#stockGrad)"
            dot={false}
            activeDot={{ r: 3, fill: strokeColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
