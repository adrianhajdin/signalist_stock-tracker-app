/**
 * complete_run — migrated to defineTool().
 *
 * STAGE 6 — final tool call. Marks the run COMPLETE, fires the
 * post-run briefing agent (updateAnalystBriefing), writes the
 * briefing_generated RunEvent. Briefing block preserved byte-for-byte.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import { updateAnalystBriefing } from "@/lib/agent/update-analyst-briefing";

export const completeRun = defineTool({
  description:
    "STAGE 6. Mark the run complete. This is your absolute final tool call. No arguments needed. Calling this triggers the post-run briefing agent automatically.",
  schema: z.object({}),
  ui: "tool-ui" as const,

  progressLabel: () => "Wrapping up the run",

  execute: async (_args, ctx) => {
    try {
      // Atomic: only transition non-COMPLETE → COMPLETE
      const completeResult = await prisma.researchRun.updateMany({
        where: { id: ctx.runId, status: { not: "COMPLETE" } },
        data: { status: "COMPLETE", completedAt: new Date() },
      });
      if (completeResult.count === 0) {
        console.log(`[tool] complete_run: run ${ctx.runId} already COMPLETE, skipping status update`);
      }

      if (ctx.runId) {
        try {
          await prisma.runEvent.create({
            data: {
              runId: ctx.runId,
              type: "run_complete",
              title: "Run complete",
              message: null,
              payload: {} as object,
            },
          });
        } catch (evtErr) {
          console.error(`[tool] complete_run run_complete event failed:`, evtErr instanceof Error ? evtErr.message : evtErr);
        }
      }

      // ── Briefing block (UNTOUCHED from PR #132) ──────────────────────────
      console.log(`[tool] complete_run: ENTERING briefing block for run=${ctx.runId} analystId=${ctx.analystId ?? "MISSING"}`);
      let briefingStatus: "success" | "failed" | "skipped" = "skipped";
      let briefingError: string | null = null;
      if (ctx.analystId) {
        try {
          const briefStart = Date.now();
          await updateAnalystBriefing({ analystId: ctx.analystId, runId: ctx.runId, userId: ctx.userId });
          console.log(`[tool] complete_run: updateAnalystBriefing returned for run=${ctx.runId} in ${Date.now() - briefStart}ms`);
          const writtenBrief = await prisma.analystBriefing.findFirst({
            where: { runId: ctx.runId },
            select: { id: true },
          });
          if (writtenBrief) {
            briefingStatus = "success";
          } else {
            briefingStatus = "failed";
            briefingError = "updateAnalystBriefing returned without throwing but no AnalystBriefing row was persisted.";
            console.error(`[tool] complete_run: ❌ ${briefingError}`);
          }
        } catch (briefErr) {
          briefingStatus = "failed";
          briefingError = briefErr instanceof Error ? briefErr.message : String(briefErr);
          console.error(`[tool] complete_run: briefing generation THREW for run=${ctx.runId}:`, briefingError);
        }
      } else {
        briefingError = "No analyst linked to this run — briefing requires an analyst context.";
        console.warn(`[tool] complete_run: no analystId in context (runId=${ctx.runId}) — briefing skipped`);
      }
      console.log(`[tool] complete_run: EXITING briefing block for run=${ctx.runId} status=${briefingStatus}`);

      try {
        await prisma.runEvent.create({
          data: {
            runId: ctx.runId,
            type: "briefing_generated",
            title:
              briefingStatus === "success"
                ? "Portfolio briefing written"
                : briefingStatus === "failed"
                  ? "Portfolio briefing FAILED"
                  : "Portfolio briefing skipped",
            message:
              briefingStatus === "success"
                ? "GPT-4o reviewed the full session and wrote the standup brief for the next run."
                : briefingError ?? "Briefing generation did not run.",
            payload: {
              briefingStatus,
              ...(briefingError ? { error: briefingError } : {}),
            } as object,
          },
        });
      } catch (evtErr) {
        console.error(`[tool] complete_run: failed to write briefing_generated event:`, evtErr);
      }

      const briefingLine =
        briefingStatus === "success"
          ? "Briefing: written and verified"
          : briefingStatus === "failed"
            ? `Briefing: failed${briefingError ? ` — ${briefingError}` : ""}`
            : `Briefing: skipped${briefingError ? ` — ${briefingError}` : ""}`;
      return {
        summary: `Run complete. Briefing: ${briefingStatus}.`,
        data: {
          ok: true,
          briefing: briefingStatus,
          briefingError,
          items: [{ kind: "generic" as const, text: briefingLine }],
        },
        sources: [],
      };
    } catch (err) {
      console.error(`[tool] complete_run FAILED:`, err instanceof Error ? err.message : err);
      try {
        await prisma.researchRun.updateMany({
          where: { id: ctx.runId, status: { not: "COMPLETE" } },
          data: { status: "COMPLETE", completedAt: new Date() },
        });
      } catch { /* already tried */ }
      return {
        summary: `complete_run failed: ${err instanceof Error ? err.message : "unknown error"}`,
        data: {
          ok: false,
          briefing: "skipped" as const,
          briefingError: err instanceof Error ? err.message : "complete_run failed",
          error: err instanceof Error ? err.message : "complete_run failed",
        },
        sources: [],
      };
    }
  },
});
