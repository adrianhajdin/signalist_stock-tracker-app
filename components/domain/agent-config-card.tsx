"use client";

import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoRow } from "@/components/ui/info-row";
import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  User,
} from "lucide-react";
import { StockLogo } from "@/components/StockLogo";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentConfigData = {
  name: string;
  description?: string;
  analystPrompt: string;
  directionBias?: "LONG" | "SHORT" | "BOTH";
  holdDurations?: string[];
  sectors?: string[];
  // ── Universe (B1) — mirror of AgentConfig shape ───────────────────
  industries?: string[];
  themes?: string[];
  marketCapMin?: number | null;
  marketCapMax?: number | null;
  signalTypes?: string[];
  minConfidence?: number;
  maxPositionSize?: number;
  maxOpenPositions?: number;
  minMarketCapTier?: string;
  watchlist?: (string | { symbol: string; reason?: string; priority?: string })[];
  exclusionList?: string[];
  domainMonitorProposal?: {
    name: string;
    sources: Array<{
      name: string;
      domain: string;
      category: string;
      qualityScore: number;
      reason: string;
    }>;
  };
  intelligenceQueries?: Array<{
    query: string;
    category: string;
    reason: string;
  }>;
  intelligencePolicy?: {
    holdingsAttention: number;
    watchlistAttention: number;
    discoveryAttention: number;
    maxSignalsPerRun?: number;
    maxArtifactReads?: number;
    allowLiveSearch?: boolean;
    liveSearchBudget?: number;
  };
};

export type AgentConfigCardProps = ComponentProps<typeof Card> &
  AgentConfigData & {
    onConfirm?: () => void;
    isCreating?: boolean;
    showConfirmButton?: boolean;
    confirmLabel?: string;
    confirmingLabel?: string;
  };

// ─── Direction config ─────────────────────────────────────────────────────────

const directionIcon = {
  LONG: <ArrowUpRight className="h-4 w-4" />,
  SHORT: <ArrowDownRight className="h-4 w-4" />,
  BOTH: <ArrowLeftRight className="h-4 w-4" />,
};

// ─── AgentConfigCard ──────────────────────────────────────────────────────────

export function AgentConfigCard({
  name,
  description,
  analystPrompt,
  directionBias = "BOTH",
  holdDurations = [],
  sectors = [],
  industries = [],
  themes = [],
  marketCapMin,
  marketCapMax,
  signalTypes = [],
  minConfidence = 0,
  maxPositionSize = 0,
  maxOpenPositions = 0,
  watchlist = [],
  exclusionList = [],
  onConfirm,
  isCreating,
  showConfirmButton = true,
  confirmLabel = "Create Analyst",
  confirmingLabel = "Creating...",
  className,
  ...cardProps
}: AgentConfigCardProps) {
  return (
    <Card className={cn("overflow-hidden p-0", className)} {...cardProps}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="p-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <User className="size-3.5" />
              </div>
              <h3 className="text-sm font-semibold truncate">{name}</h3>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 pl-9">
                {description}
              </p>
            )}
          </div>
          <Badge
            variant={
              directionBias === "LONG"
                ? "positive"
                : directionBias === "SHORT"
                  ? "negative"
                  : "secondary"
            }
          >
            {directionIcon[directionBias]}
            {directionBias}
          </Badge>
        </div>
      </div>

      {/* ── Strategy ──────────────────────────────────────────────── */}
      {analystPrompt && (
        <div className="p-3 border-b">
          <p className="text-sm font-medium mb-1">Strategy</p>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
            {analystPrompt}
          </p>
        </div>
      )}

      {/* ── Config rows ───────────────────────────────────────────── */}
      <div className="p-3 border-b flex flex-col gap-1">
        <InfoRow label="Min Confidence" value={`${minConfidence}%`} mono />
        <InfoRow label="Position Size" value={`$${maxPositionSize.toLocaleString()}`} mono />
        <InfoRow label="Max Positions" value={String(maxOpenPositions)} mono />
        <InfoRow label="Hold Duration" value={holdDurations.join(", ") || "—"} border={false} />
      </div>

      {/* ── Universe (sectors / industries / themes / market cap) ────────── */}
      {(sectors.length > 0 ||
        industries.length > 0 ||
        themes.length > 0 ||
        marketCapMin != null ||
        marketCapMax != null) && (
        <div className="p-3 border-b space-y-2">
          <p className="text-sm font-medium">Universe</p>
          {sectors.length > 0 && (
            <UniverseRow label="Sectors" values={sectors} />
          )}
          {industries.length > 0 && (
            <UniverseRow label="Industries" values={industries} />
          )}
          {themes.length > 0 && (
            <UniverseRow label="Themes" values={themes} />
          )}
          {(marketCapMin != null || marketCapMax != null) && (
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-20 shrink-0 pt-0.5">
                Market Cap
              </span>
              <span className="text-sm tabular-nums">
                {formatCap(marketCapMin ?? null)} – {formatCap(marketCapMax ?? null)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Signal Types ───────────────────────────────────────────── */}
      {signalTypes.length > 0 && (
        <div className="p-3 border-b">
          <p className="text-sm font-medium mb-1.5">Signals</p>
          <div className="flex flex-wrap gap-1.5">
            {signalTypes.map((s) => (
              <Badge key={s} variant="outline">
                {s.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Watchlist ──────────────────────────────────────────────── */}
      {watchlist.length > 0 && (
        <div className="p-3 border-b">
          <p className="text-sm font-medium mb-1.5">Watchlist</p>
          <div className="flex flex-col gap-1">
            {watchlist.map((t) => {
              const symbol = typeof t === "string" ? t : t.symbol;
              return (
                <div
                  key={symbol}
                  className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0"
                >
                  <StockLogo ticker={symbol} size="sm" />
                  <span className="font-mono tabular-nums font-medium">{symbol}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Exclusion list ─────────────────────────────────────────── */}
      {exclusionList.length > 0 && (
        <div className="p-3 border-b">
          <p className="text-sm font-medium mb-1.5">Excluded</p>
          <div className="flex flex-col gap-1">
            {exclusionList.map((t) => (
              <div
                key={t}
                className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0"
              >
                <StockLogo ticker={t} size="sm" />
                <span className="font-mono tabular-nums text-muted-foreground">{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirm button ────────────────────────────────────────────── */}
      {showConfirmButton && onConfirm && (
        <div className="p-3">
          <Button
            onClick={onConfirm}
            disabled={isCreating}
            className="w-full"
            size="default"
          >
            <Check className="h-4 w-4 mr-2" />
            {isCreating ? confirmingLabel : confirmLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Universe row (label + canonical value chips) ────────────────────────────

function UniverseRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-20 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="outline">{v}</Badge>
        ))}
      </div>
    </div>
  );
}

function formatCap(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "any";
  if (amount >= 1_000_000_000_000) return `$${(amount / 1_000_000_000_000).toFixed(1)}T`;
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${amount.toFixed(0)}`;
}
