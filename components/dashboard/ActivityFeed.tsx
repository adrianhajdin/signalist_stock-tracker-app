'use client';

/**
 * ActivityFeed — homepage right column.
 * Shows a unified timeline of trade opens, closes, and position management
 * actions (target updates, partial closes, trailing stops, etc.) in
 * reverse-chronological order.
 *
 * Design rules: only ShadCN + existing design tokens. No custom colors.
 * text-positive / text-negative for P&L. text-muted-foreground for metadata.
 */

import Link from 'next/link';
import { StockLogo } from '@/components/StockLogo';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ActivityFeedItem } from '@/lib/actions/portfolio.actions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sourceLabel(source: string): string {
  if (source === 'price_monitor') return 'Auto';
  if (source === 'user') return 'You';
  return 'Agent';
}

// ─── Single feed item ─────────────────────────────────────────────────────────

function FeedItem({ item }: { item: ActivityFeedItem }) {
  const isOpen = item.type === 'OPENED';
  const isClosed = item.type === 'CLOSED';
  const isModified = item.type === 'MODIFIED';

  const pnlPositive = (item.pnl ?? 0) >= 0;
  const hasPnl = item.pnl != null;

  return (
    <Link href={`/trades/${item.positionId}`} className="block">
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
        {/* Stock logo */}
        <div className="shrink-0 mt-0.5">
          <StockLogo ticker={item.symbol} size="sm" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Row 1: ticker + direction badge + time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium tabular-nums">{item.symbol}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                {item.direction}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground/70 tabular-nums shrink-0">
              {relativeTime(item.timestamp)}
            </span>
          </div>

          {/* Row 2: label + source + P&L */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Status dot */}
              <span className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                isOpen ? 'bg-positive' : isClosed ? 'bg-muted-foreground/60' : 'bg-primary/60',
              )} />
              <span className="text-xs text-muted-foreground truncate">{item.label}</span>
              {item.analystName && (
                <span className="text-[10px] text-muted-foreground/50 truncate hidden sm:block">
                  · {item.analystName}
                </span>
              )}
            </div>
            {hasPnl && (
              <span className={cn(
                'text-xs tabular-nums shrink-0 font-medium',
                pnlPositive ? 'text-positive' : 'text-negative',
              )}>
                {pnlPositive ? '+' : ''}${Math.abs(item.pnl!).toFixed(2)}
                {item.pnlPct != null && (
                  <span className="text-[10px] opacity-70 ml-0.5">
                    ({pnlPositive ? '+' : ''}{item.pnlPct.toFixed(1)}%)
                  </span>
                )}
              </span>
            )}
            {!hasPnl && (
              <span className="text-[10px] text-muted-foreground/50 shrink-0">
                {sourceLabel(item.source)}
              </span>
            )}
          </div>

          {/* Row 3: reason (only for MODIFIED, truncated) */}
          {isModified && item.reason && (
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2">
              {item.reason}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-1.5 px-4">
      <p className="text-sm text-muted-foreground text-center">No activity yet</p>
      <p className="text-xs text-muted-foreground/60 text-center max-w-[200px]">
        Trades and position changes will appear here as analysts run.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  items: ActivityFeedItem[];
}

export function ActivityFeed({ items }: Props) {
  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pb-2">
        <span className="text-sm font-medium">Activity</span>
        {items.length > 0 && (
          <Link
            href="/trades"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        )}
      </div>

      <Card className="shadow-none p-0">
        <CardContent className="p-0 divide-y divide-border">
          {items.length === 0 ? (
            <Empty />
          ) : (
            items.map((item) => <FeedItem key={item.id} item={item} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
