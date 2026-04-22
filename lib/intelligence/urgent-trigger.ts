// ── Urgent Run Trigger ─────────────────────────────────────────────────────
// BREAKING email signals on held tickers fire an immediate agent run per
// affected analyst. 30-minute cooldown + RUNNING guard prevents storms.
//
// Fires the same `app/research.run.manual` event that morningResearch
// listens for — no new Inngest function needed.

import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

const COOLDOWN_MS = 30 * 60 * 1000;

export async function triggerUrgentRuns(tickers: string[]): Promise<void> {
  if (tickers.length === 0) return;

  const positions = await prisma.position.findMany({
    where: {
      symbol: { in: tickers },
      status: "OPEN",
    },
    select: { analystId: true, symbol: true },
  });

  const analystIds = [...new Set(positions.map((p) => p.analystId))];
  if (analystIds.length === 0) return;

  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const recentRuns = await prisma.researchRun.findMany({
    where: {
      agentConfigId: { in: analystIds },
      OR: [{ status: "RUNNING" }, { createdAt: { gt: cutoff } }],
    },
    select: { agentConfigId: true },
  });
  const suppressed = new Set(
    recentRuns.map((r) => r.agentConfigId).filter((id): id is string => !!id)
  );

  const toTrigger = analystIds.filter((id) => !suppressed.has(id));
  if (toTrigger.length === 0) {
    console.log(
      `[urgent-trigger] All ${analystIds.length} affected analysts within cooldown — skipping.`
    );
    return;
  }

  for (const analystId of toTrigger) {
    const affectedTickers = [
      ...new Set(
        positions.filter((p) => p.analystId === analystId).map((p) => p.symbol)
      ),
    ];
    console.log(
      `[urgent-trigger] Firing run for analyst ${analystId} on BREAKING signals: ${affectedTickers.join(", ")}`
    );
    await inngest.send({
      name: "app/research.run.manual",
      data: { agentConfigId: analystId },
    });
  }
}
