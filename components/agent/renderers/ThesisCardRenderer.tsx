"use client";

/**
 * ThesisCardRenderer — ui: "thesis-card"
 *
 * The FIRST record_thesis/show_thesis call in a message reads forward through
 * all thesis parts, collects every ThesisCardData, and renders the ThesisCarousel.
 * Every subsequent thesis call returns null — the carousel already contains it.
 */

import { useMemo } from "react";
import { useMessage } from "@assistant-ui/react";
import type { ToolResult } from "@/lib/agent/tool-result";
import { ThesisCarousel } from "@/components/domain/thesis-carousel";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThesisCardData } from "@/components/domain/thesis-card";
interface Props {
  toolName: string;
  toolCallId?: string;
  result: Extract<ToolResult, { ok: true }>;
  loading: boolean;
}

export function ThesisCardRenderer({ toolCallId, loading }: Props) {
  const content = useMessage((m) => m.content);

  const thesisParts = useMemo(() => {
    return (content as unknown[])
      .map((p) => p as Record<string, unknown>)
      .filter(
        (p) =>
          p?.type === "tool-call" &&
          (p.toolName === "record_thesis" || p.toolName === "show_thesis"),
      );
  }, [content]);

  // Only the first thesis call renders the carousel
  const myIndex = thesisParts.findIndex((p) => p.toolCallId === toolCallId);
  if (myIndex > 0) return null;

  const readyCount = thesisParts.filter((p) => (p.result ?? p.output) !== undefined).length;
  const pendingCount = thesisParts.length - readyCount;
  const allLoading = readyCount === 0 && loading;

  // Still loading first thesis — show skeleton card(s)
  if (allLoading) {
    const skeletonCount = Math.max(thesisParts.length, 1);
    return (
      <div className="my-2 flex gap-3 overflow-hidden">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="shrink-0 w-72 rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Collect all ready thesis results
  const theses = thesisParts
    .map((p): ThesisCardData | null => {
      const r = (p.result ?? p.output) as Record<string, unknown> | undefined;
      if (!r) return null;

      // Post-change: result.data is minimal {thesis_id, status} — read display
      // fields from the tool input args (always present on tool-call parts).
      // Pre-change fallback: result.data has the full echo — use it if args lack fields.
      const inputArgs = (p.args ?? p.input ?? {}) as Record<string, unknown>;
      const resultData = (r.ok === true && r.data ? r.data : r) as Record<string, unknown>;
      const display = (inputArgs.ticker && inputArgs.direction) ? inputArgs : resultData;

      if (!display.ticker || !display.direction) return null;

      return {
        ticker: display.ticker as string,
        direction: display.direction as "LONG" | "SHORT" | "PASS",
        confidence_score: (display.confidence_score as number) ?? (display.confidenceScore as number) ?? 0,
        reasoning_summary: display.reasoning_summary as string | undefined,
        thesis_bullets: (display.thesis_bullets as string[]) ?? [],
        risk_flags: (display.risk_flags as string[]) ?? [],
        entry_price: display.entry_price as number | null | undefined,
        target_price: display.target_price as number | null | undefined,
        stop_loss: display.stop_loss as number | null | undefined,
        hold_duration: display.hold_duration as string | undefined,
        signal_types: (display.signal_types as string[]) ?? [],
        company_name: display.company_name as string | null | undefined,
        exchange: display.exchange as string | null | undefined,
        fundamentals: display.fundamentals as ThesisCardData["fundamentals"],
        status: (resultData.status as ThesisCardData["status"]) ?? "ACTIVE",
      };
    })
    .filter((t): t is ThesisCardData => t !== null);

  if (theses.length === 0) return null;

  return <ThesisCarousel theses={theses} />;
}
