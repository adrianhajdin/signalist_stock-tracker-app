'use client';

import { StockLogo } from '@/components/StockLogo';
import { PnlArrow } from '@/components/ui/pnl-arrow';

/**
 * TickerBadge — THE one way to show a ticker everywhere in the app.
 *
 * Rounded logo + ticker name in brand font + optional up/down arrow.
 * That's it. No mono font, no badges, no 7 different versions.
 */

interface TickerBadgeProps {
  ticker: string;
  /** "up" for bullish/positive, "down" for bearish/negative, omit for neutral */
  direction?: 'up' | 'down' | null;
}

export function TickerBadge({ ticker, direction }: TickerBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <StockLogo ticker={ticker} size="sm" />
      <span className="text-sm font-brand font-bold">{ticker}</span>
      {direction && <PnlArrow direction={direction} className="h-4 w-4" />}
    </span>
  );
}
