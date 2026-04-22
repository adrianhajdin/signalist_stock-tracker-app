/**
 * record_run_summary — migrated to defineTool().
 *
 * Fires after all execution tools (Stage 5), before complete_run.
 * Writes the run_summary RunEvent that the briefing agent reads.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";

export const recordRunSummary = defineTool({
  description:
    "STAGE 5. Fires after all execution tools, before complete_run. Pass every ticker you researched (ranked by conviction) with the action that ACTUALLY happened. Your IMMEDIATE next step after this is Stage 6 — call complete_run.",
  schema: z.object({
    ranked_picks: z
      .array(
        z.object({
          rank: z.number(),
          ticker: z.string(),
          direction: z.enum(["LONG", "SHORT", "PASS"]),
          confidence: z.number(),
          reasoning: z.string().describe("One-line rationale (<= 80 chars)"),
          action: z.enum(["INITIATE", "ADD", "HOLD", "REDUCE", "EXIT", "WATCH", "REMOVE_WATCH", "PASS", "FAILED"]),
        }),
      )
      .describe(
        "Every ticker you researched in Stage 2, ranked by conviction, with the action that ACTUALLY happened in Stage 5. Use FAILED for tickers where place_trade returned success: false.",
      ),
    exposure_breakdown: z
      .object({
        long_exposure: z.number().describe("Total $ in long positions"),
        short_exposure: z.number().describe("Total $ in short positions"),
        net_exposure: z.number().describe("Net $ exposure (long - short)"),
      })
      .optional(),
  }),
  ui: "run-summary" as const,

  progressLabel: () => "Recording the run summary",

  execute: async (args, ctx) => {
    try {
      const traded = args.ranked_picks.filter((p) => {
        const a = p.action.toUpperCase();
        return a === "INITIATE" || a === "ADD";
      }).length;

      // Compute actual deployed amount from DB — only INITIATE decisions for this run.
      // The model-provided exposure_breakdown reflects total portfolio exposure (including
      // pre-existing positions), not what was deployed this session, so we ignore it.
      let actualDeployedLong = 0;
      let actualDeployedShort = 0;
      if (ctx.runId) {
        try {
          const initiateDecisions = await prisma.tradeDecision.findMany({
            where: { runId: ctx.runId, decision: "INITIATE" },
            include: { position: { select: { quantity: true, avgCost: true, direction: true } } },
          });
          for (const d of initiateDecisions) {
            if (!d.position) continue;
            const notional = d.position.avgCost * d.position.quantity;
            if (d.position.direction === "LONG") actualDeployedLong += notional;
            else actualDeployedShort += notional;
          }
        } catch (dbErr) {
          console.warn("[tool] record_run_summary: deployed capital DB lookup failed:", dbErr instanceof Error ? dbErr.message : dbErr);
        }
      }

      // Write run_summary RunEvent (shape the briefing agent reads)
      if (ctx.runId) {
        try {
          await prisma.runEvent.create({
            data: {
              runId: ctx.runId,
              type: "run_summary",
              title: "Run Summary",
              message: `${args.ranked_picks.length} tickers analyzed, ${traded} traded`,
              payload: {
                ranked_picks: args.ranked_picks,
              } as object,
            },
          });
        } catch (evtErr) {
          console.error(`[tool] record_run_summary RunEvent write failed:`, evtErr instanceof Error ? evtErr.message : evtErr);
        }
      }

      // Record HOLD decisions (non-fatal)
      const holdPicks = args.ranked_picks.filter((p) => p.action.toUpperCase() === "HOLD");
      if (holdPicks.length > 0 && ctx.analystId && ctx.runId) {
        for (const pick of holdPicks) {
          try {
            const position = await prisma.position.findFirst({
              where: { analystId: ctx.analystId, symbol: pick.ticker.toUpperCase(), status: "OPEN" },
              select: { id: true },
            });
            await prisma.tradeDecision.create({
              data: {
                runId: ctx.runId,
                analystId: ctx.analystId,
                userId: ctx.userId,
                symbol: pick.ticker.toUpperCase(),
                decision: "HOLD",
                reasoning: pick.reasoning?.slice(0, 500) ?? null,
                positionId: position?.id ?? null,
              },
            });
          } catch (holdErr) {
            console.warn(`[tool] record_run_summary HOLD decision failed for ${pick.ticker}:`, holdErr instanceof Error ? holdErr.message : holdErr);
          }
        }
      }

      const deployedThisRun = actualDeployedLong + actualDeployedShort;
      return {
        summary: deployedThisRun > 0
          ? `Run summary recorded: ${args.ranked_picks.length} picks, ${traded} traded — $${deployedThisRun.toFixed(0)} deployed.`
          : `Run summary recorded: ${args.ranked_picks.length} picks, ${traded} traded — no new capital deployed.`,
        data: {
          success: true,
          rankedPicks: args.ranked_picks,
          exposureBreakdown: deployedThisRun > 0
            ? { longExposure: actualDeployedLong, shortExposure: actualDeployedShort, netExposure: actualDeployedLong - actualDeployedShort }
            : undefined,
          traded,
          analyzed: args.ranked_picks.length,
        },
        sources: [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Run summary persistence failed";
      console.error(`[tool] record_run_summary FAILED: ${msg}`);
      return {
        summary: `Run summary failed: ${msg}`,
        data: {
          success: false,
          rankedPicks: args.ranked_picks,
          exposureBreakdown: undefined,
          traded: 0,
          analyzed: args.ranked_picks.length,
          error: msg,
        },
        sources: [],
      };
    }
  },
});
