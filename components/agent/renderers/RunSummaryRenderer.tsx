"use client";

import type { ToolResult } from "@/lib/agent/tool-result";
import { HugeiconsIcon } from "@hugeicons/react";
import { MessageSearch01Icon } from "@hugeicons/core-free-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DecisionSummaryCard,
  type DecisionPick,
} from "@/components/domain/decision-summary-card";

interface Props {
  result: Extract<ToolResult, { ok: true }>;
  loading: boolean;
}

export function RunSummaryRenderer({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="my-3 inline-flex items-center gap-1.5 py-1 text-sm text-muted-foreground">
        <HugeiconsIcon icon={MessageSearch01Icon} className="size-3.5 shrink-0" />
        <span>Summarizing run…</span>
      </div>
    );
  }

  const data = result.data as {
    rankedPicks?: DecisionPick[];
    exposureBreakdown?: { longExposure?: number; shortExposure?: number; netExposure?: number };
  } | null;

  const exposure = data?.exposureBreakdown;
  const invested = (exposure?.longExposure ?? 0) + (exposure?.shortExposure ?? 0);
  const picks = data?.rankedPicks ?? [];

  return (
    <div className="my-3 space-y-1">
      <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <HugeiconsIcon icon={MessageSearch01Icon} className="size-3.5 shrink-0" />
        <span>Summarizing run</span>
        {invested > 0 && (
          <>
            <span>—</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="tabular-nums cursor-default">
                    ${invested.toLocaleString()} deployed
                  </span>
                }
              />
              <TooltipContent>
                Long ${(exposure?.longExposure ?? 0).toLocaleString()} ·{" "}
                Short ${(exposure?.shortExposure ?? 0).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
      {picks.length > 0 && (
        <DecisionSummaryCard rankedPicks={picks} />
      )}
    </div>
  );
}
