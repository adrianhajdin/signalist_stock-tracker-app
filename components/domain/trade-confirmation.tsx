"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradeConfirmationData = {
  ticker: string;
  direction: "LONG" | "SHORT";
  shares?: number;
  estimatedPrice?: number | null;
  estimatedCost?: number | null;
  action?: "BUY" | "SELL" | "CLOSE" | "MODIFY";
};

export type TradeConfirmationProps = TradeConfirmationData & {
  /** Called when user confirms the trade */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether the trade is being executed */
  isExecuting?: boolean;
  /** Whether the confirmation was already resolved */
  resolved?: "confirmed" | "cancelled" | null;
  className?: string;
};

// ─── Action labels ────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  BUY: "Place Trade",
  SELL: "Close Position",
  CLOSE: "Close Position",
  MODIFY: "Modify Position",
};

// ─── TradeConfirmation ────────────────────────────────────────────────────────

export function TradeConfirmation({
  ticker,
  direction,
  shares,
  estimatedPrice,
  estimatedCost,
  action = "BUY",
  onConfirm,
  onCancel,
  isExecuting = false,
  resolved = null,
  className,
}: TradeConfirmationProps) {
  const [hovering, setHovering] = useState<"confirm" | "cancel" | null>(null);
  const isLong = direction === "LONG";
  const DirIcon = isLong ? ArrowUpRight : ArrowDownRight;
  const dirColor = isLong ? "text-positive" : "text-negative";
  const actionLabel = ACTION_LABELS[action] ?? "Execute Trade";

  if (resolved === "cancelled") {
    return (
      <Card className={cn("p-4 border-dashed", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <X className="h-4 w-4" />
          Trade cancelled — {ticker} {direction.toLowerCase()} not executed.
        </div>
      </Card>
    );
  }

  if (resolved === "confirmed") {
    return (
      <Card className={cn("p-4 border-positive/30 bg-positive/10", className)}>
        <div className="flex items-center gap-2 text-sm text-positive">
          <Check className="h-4 w-4" />
          Trade confirmed — executing {ticker} {direction.toLowerCase()}.
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      {/* Warning header */}
      <div className="px-5 py-3 border-b bg-amber-500/5 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-sm font-medium">Confirm trade action</span>
      </div>

      {/* Trade summary */}
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold font-mono">{ticker}</span>
          <span className={cn("flex items-center gap-1 text-sm font-semibold", dirColor)}>
            <DirIcon className="h-3.5 w-3.5" />
            {direction}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/40 p-3 text-center">
          {shares != null && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                Shares
              </p>
              <p className="text-sm tabular-nums font-semibold">{shares}</p>
            </div>
          )}
          {estimatedPrice != null && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                Est. Price
              </p>
              <p className="text-sm tabular-nums font-semibold">
                ${estimatedPrice.toFixed(2)}
              </p>
            </div>
          )}
          {estimatedCost != null && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                Est. Cost
              </p>
              <p className="text-sm tabular-nums font-semibold">
                ${estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={onConfirm}
            disabled={isExecuting}
            className={cn(
              "flex-1 h-9",
              hovering === "confirm" && "ring-2 ring-positive/30"
            )}
            size="sm"
            onMouseEnter={() => setHovering("confirm")}
            onMouseLeave={() => setHovering(null)}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            {isExecuting ? "Executing..." : actionLabel}
          </Button>
          <Button
            onClick={onCancel}
            disabled={isExecuting}
            variant="outline"
            className={cn(
              "h-9",
              hovering === "cancel" && "ring-2 ring-negative/30"
            )}
            size="sm"
            onMouseEnter={() => setHovering("cancel")}
            onMouseLeave={() => setHovering(null)}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
