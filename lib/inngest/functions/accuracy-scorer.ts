/**
 * Weekly accuracy scorer (DAV-76 + DAV-77).
 *
 * Runs every Sunday at the same time as the weekly digest.
 * For each user with ≥ 3 closed trades:
 *   1. Compute calibration / signal accuracy stats
 *   2. Generate a GPT-4o calibration narrative
 *   3. Persist an AccuracyReport row
 */

import OpenAI from "openai";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { getAccuracyStats, type AccuracyStats } from "@/lib/accuracy-stats";
import { etTradingDayDate } from "@/lib/market-hours";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
}

// ─── Narrative generation ─────────────────────────────────────────────────────

async function generateNarrative(stats: AccuracyStats): Promise<string> {
  if (stats.tradesAnalyzed < 3) {
    return "Insufficient trade history for calibration analysis.";
  }

  const bulletsForPrompt = stats.calibration
    .filter((b) => b.count > 0)
    .map(
      (b) =>
        `  • Confidence ${b.label}: expected ${Math.round(b.expectedWinRate * 100)}% win, ` +
        `actual ${b.winRate !== null ? Math.round(b.winRate * 100) : "—"}% (n=${b.count})`
    )
    .join("\n");

  const topSignals = stats.signalAccuracy
    .slice(0, 4)
    .map((s) => `  • ${s.signal}: ${s.winRate !== null ? Math.round(s.winRate * 100) : "—"}% win rate (n=${s.count})`)
    .join("\n");

  const prompt =
    `Overall win rate: ${stats.overallWinRate !== null ? Math.round(stats.overallWinRate * 100) : "—"}% ` +
    `across ${stats.tradesAnalyzed} trades.\n\n` +
    `Confidence calibration:\n${bulletsForPrompt}\n\n` +
    `Top signal accuracy:\n${topSignals}\n\n` +
    `Streaks: best win=${stats.longestWinStreak}, worst loss=${stats.longestLossStreak}\n\n` +
    `In 3-4 sentences: Is the model well-calibrated? Where is it overconfident or underconfident? ` +
    `Which signal types are most/least reliable? What should be adjusted?`;

  try {
    const resp = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a quant analyst reviewing a trading model's calibration. " +
            "Be specific, honest, and actionable. Max 80 words. No filler.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });
    return resp.choices[0].message.content?.trim() ?? "";
  } catch {
    return `Win rate ${stats.overallWinRate !== null ? Math.round(stats.overallWinRate * 100) : "—"}% across ${stats.tradesAnalyzed} trades. Review calibration data for details.`;
  }
}

// ─── Inngest function ─────────────────────────────────────────────────────────

export const accuracyScorer = inngest.createFunction(
  {
    id: "accuracy-scorer",
    name: "Weekly Accuracy Scorer",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: "TZ=America/New_York 0 10 * * 0" }, // Sunday 10:00 AM ET (after weekly digest at 9:00)
  async ({ step }) => {
    // Step 1: Find users with at least 3 closed trades
    const userIds = await step.run("find-eligible-users", async () => {
      const rows = await prisma.position.groupBy({
        by: ["userId"],
        where: { status: "CLOSED", outcome: { in: ["WIN", "LOSS", "BREAKEVEN"] } },
        _count: { id: true },
      });
      return rows
        .filter((r) => r._count.id >= 3)
        .map((r) => r.userId);
    });

    if (userIds.length === 0) {
      return { skipped: true, reason: "no-eligible-users" };
    }

    // Week window starts at ET midnight 7 days ago.
    const todayEt = etTradingDayDate();
    const weekStart = new Date(todayEt);
    weekStart.setUTCDate(todayEt.getUTCDate() - 7);

    const reports: string[] = [];

    for (const userId of userIds) {
      // Step 2: Compute accuracy stats
      const stats = await step.run(`stats-${userId}`, async () => {
        return getAccuracyStats(userId);
      });

      // Step 3: Generate GPT-4o narrative
      const narrative = await step.run(`narrative-${userId}`, async () => {
        return generateNarrative(stats);
      });

      // Step 4: Upsert AccuracyReport
      await step.run(`save-${userId}`, async () => {
        // Check if we already have a report for this week
        const existing = await prisma.accuracyReport.findFirst({
          where: { userId, weekStartDate: { gte: weekStart } },
        });

        if (existing) {
          // Update in-place (re-run of scorer shouldn't create duplicates)
          await prisma.accuracyReport.update({
            where: { id: existing.id },
            data: {
              tradesAnalyzed: stats.tradesAnalyzed,
              winRate: stats.overallWinRate,
              calibrationData: stats.calibration as unknown as object[],
              signalAccuracy: stats.signalAccuracy as unknown as object[],
              directionStats: stats.directionStats as unknown as object[],
              narrativeSummary: narrative,
            },
          });
        } else {
          await prisma.accuracyReport.create({
            data: {
              userId,
              weekStartDate: weekStart,
              weekEndDate: todayEt,
              tradesAnalyzed: stats.tradesAnalyzed,
              winRate: stats.overallWinRate,
              calibrationData: stats.calibration as unknown as object[],
              signalAccuracy: stats.signalAccuracy as unknown as object[],
              directionStats: stats.directionStats as unknown as object[],
              narrativeSummary: narrative,
            },
          });
        }
      });

      reports.push(userId);
    }

    return { scored: reports.length, userIds: reports };
  }
);
