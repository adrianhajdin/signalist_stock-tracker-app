"use client";

/**
 * ThesisMiniCard — compact thesis card for the agent chat carousel.
 *
 * Visual style mirrors components/intelligence/brief-card.tsx (white card,
 * border, p-3) and uses Polymarket-style price rows for Entry / Target /
 * Stop with a percentage delta badge to the right.
 *
 * Click → opens the SAME sheet that the full <ThesisCard /> opens. We do
 * this by passing the mini-card JSX to <ThesisCard customTrigger={...} />.
 * The original sheet content (ButtonGroup verdict, stock identity row,
 * Bull Case / Risks / Fundamentals etc.) is preserved untouched — we only
 * swap the trigger surface.
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StockLogo } from "@/components/StockLogo";
import { ThesisCard, type ThesisCardData } from "@/components/domain/thesis-card";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pctDelta(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function directionLabel(dir: string, confidence: number): { label: string; cls: string } {
  if (dir === "PASS") return { label: "Pass", cls: "bg-muted text-muted-foreground" };
  if (dir === "SHORT") {
    if (confidence >= 75) return { label: "Strong Sell", cls: "bg-negative/15 text-negative" };
    return { label: "Sell", cls: "bg-negative/15 text-negative" };
  }
  if (confidence >= 75) return { label: "Strong Buy", cls: "bg-positive/15 text-positive" };
  return { label: "Buy", cls: "bg-positive/15 text-positive" };
}

// ── Row ─────────────────────────────────────────────────────────────────────

function PriceRow({
  label,
  price,
  delta,
}: {
  label: string;
  price: number | null | undefined;
  delta: number | null;
}) {
  const positive = delta != null && delta >= 0;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 tabular-nums">
        {delta != null && (
          <Badge
            variant="secondary"
            className={cn(
              "font-normal",
              positive ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative",
            )}
          >
            {fmtPct(delta)}
          </Badge>
        )}
        <span className="text-foreground">{fmtPrice(price)}</span>
      </div>
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

export function ThesisMiniCard({ thesis }: { thesis: ThesisCardData }) {
  const dir = directionLabel(thesis.direction, thesis.confidence_score);
  const targetDelta = pctDelta(thesis.entry_price, thesis.target_price);
  const stopDelta = pctDelta(thesis.entry_price, thesis.stop_loss);

  const miniCard = (
    <Card className="p-3 gap-2 cursor-pointer hover:bg-accent/40 transition-colors h-full text-left">
      <>
        {/* ── Header: logo + name + direction badge ───────────────── */}
        <div className="flex items-center gap-2">
          <StockLogo ticker={thesis.ticker} size="sm" />
          <span className="text-sm font-semibold truncate">
            {thesis.company_name ?? thesis.ticker}
          </span>
          <Badge
            variant="secondary"
            className={cn("ml-auto font-normal shrink-0", dir.cls)}
          >
            {dir.label}
          </Badge>
        </div>

        {/* ── Polymarket-style price rows ──────────────────────────── */}
        <div className="flex flex-col gap-1 pt-1">
          <PriceRow label="Entry" price={thesis.entry_price} delta={null} />
          <PriceRow label="Target" price={thesis.target_price} delta={targetDelta} />
          <PriceRow label="Stop" price={thesis.stop_loss} delta={stopDelta} />
        </div>

        {/* ── Reasoning summary ─────────────────────────────────────── */}
        {thesis.reasoning_summary && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-snug pt-1">
            {thesis.reasoning_summary}
          </p>
        )}
      </>
    </Card>
  );

  return <ThesisCard {...thesis} customTrigger={miniCard} />;
}
