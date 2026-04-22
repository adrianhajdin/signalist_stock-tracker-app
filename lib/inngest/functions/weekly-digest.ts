import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { getLatestPrices } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import { Resend } from "resend";
import { buildWeeklyDigestHtml } from "@/lib/emails/weekly-digest";
import type {
  DigestTrade,
  DigestOpenTrade,
} from "@/lib/emails/weekly-digest";
import OpenAI from "openai";
import { etTradingDayDate } from "@/lib/market-hours";

// ─── Clients (lazy — instantiated at runtime, not module load) ────────────────

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "");
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekRange(): { start: Date; label: string } {
  const now = new Date();
  // ET trading-day midnight, minus 7 days — see lib/market-hours.ts
  const todayEt = etTradingDayDate(now);
  const start = new Date(todayEt);
  start.setUTCDate(todayEt.getUTCDate() - 7);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const label = `${fmt(start)} – ${fmt(now)}, ${now.getFullYear()}`;
  return { start, label };
}

function daysBetween(from: Date | string, to: Date | string | null): number {
  const ms = (to ? new Date(to) : new Date()).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function calcPnlPct(direction: string, entry: number, current: number) {
  return direction === "LONG"
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;
}

/** Get the Supabase auth email for a userId via the admin API */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

// ─── Inngest function ─────────────────────────────────────────────────────────

export const weeklyDigest = inngest.createFunction(
  {
    id: "weekly-digest",
    name: "Weekly Digest Email",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: "TZ=America/New_York 0 9 * * 0" }, // Sunday 9:00 AM ET (auto-adjusts for EDT/EST)
  async ({ step }) => {
    // Step 1: Load AgentConfigs with weeklyDigestEnabled
    const configs = await step.run("load-configs", async () => {
      return prisma.agentConfig.findMany({
        where: { weeklyDigestEnabled: true },
      });
    });

    if (configs.length === 0) {
      return { skipped: true, reason: "no-digest-configs" };
    }

    const { start: weekAgo, label: weekOf } = weekRange();
    const sent: string[] = [];

    for (const config of configs) {
      // Step 2: Gather stats for this user
      const stats = await step.run(`stats-${config.userId}`, async () => {
        const [runsRaw, closedRaw, openRaw] = await Promise.all([
          prisma.researchRun.count({
            where: { userId: config.userId, createdAt: { gte: weekAgo } },
          }),
          prisma.position.findMany({
            where: {
              userId: config.userId,
              status: "CLOSED",
              closedAt: { gte: weekAgo },
            },
            select: {
              symbol: true,
              direction: true,
              avgCost: true,
              quantity: true,
              closePrice: true,
              realizedPnl: true,
              outcome: true,
              openedAt: true,
              closedAt: true,
            },
          }),
          prisma.position.findMany({
            where: { userId: config.userId, status: "OPEN" },
            select: {
              symbol: true,
              direction: true,
              avgCost: true,
              quantity: true,
            },
          }),
          prisma.thesis.count({
            where: { userId: config.userId, createdAt: { gte: weekAgo } },
          }),
        ]);

        return {
          runsThisWeek: runsRaw,
          thesesGenerated: await prisma.thesis.count({
            where: { userId: config.userId, createdAt: { gte: weekAgo } },
          }),
          closed: closedRaw,
          open: openRaw,
        };
      });

      // Step 3: Fetch live prices for open positions
      const prices = await step.run(`prices-${config.userId}`, async () => {
        const tickers = [
          ...new Set(
            (stats.open as Array<{ symbol: string }>).map((t) => t.symbol)
          ),
        ];
        if (tickers.length === 0) return {} as Record<string, number>;
        try {
          const creds = await resolveAlpacaCredentials(config.userId) ?? undefined;
          return await getLatestPrices(tickers, creds);
        } catch {
          return {} as Record<string, number>;
        }
      });

      // Step 4: Generate GPT-4o agent insight
      const insight = await step.run(`insight-${config.userId}`, async () => {
        const closed = stats.closed as Array<{
          direction: string;
          realizedPnl: number | null;
          outcome: string | null;
        }>;
        if (closed.length === 0) {
          return "No trades were placed this week. The agent is monitoring the market and will resume research on Monday.";
        }
        const wins = closed.filter((t) => t.outcome === "WIN").length;
        const losses = closed.filter((t) => t.outcome === "LOSS").length;
        const totalPnl = closed.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);

        try {
          const resp = await getOpenAI().chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content:
                  "You are a concise AI trading agent writing a weekly self-assessment. Be honest, specific, and forward-looking. Max 60 words.",
              },
              {
                role: "user",
                content: `This week: ${wins} wins, ${losses} losses, total P&L ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}. In 2-3 sentences, what worked, what didn't, and what should be adjusted next week?`,
              },
            ],
            temperature: 0.4,
            max_tokens: 100,
          });
          return resp.choices[0].message.content?.trim() ?? "";
        } catch {
          return `${wins} win${wins !== 1 ? "s" : ""} and ${losses} loss${losses !== 1 ? "es" : ""} this week. The agent will continue refining its strategy next week.`;
        }
      });

      // Step 5: Build email and send via Resend
      await step.run(`email-${config.userId}`, async () => {
        const toEmail =
          config.digestEmail ??
          (await getUserEmail(config.userId));

        if (!toEmail) return { skipped: true, reason: "no-email" };

        const closed = stats.closed as Array<{
          symbol: string;
          direction: string;
          avgCost: number;
          quantity: number;
          closePrice: number | null;
          realizedPnl: number | null;
          outcome: string | null;
          openedAt: Date | string;
          closedAt: Date | string | null;
        }>;

        const open = stats.open as Array<{
          symbol: string;
          direction: string;
          avgCost: number;
          quantity: number;
        }>;

        const priceMap = prices as Record<string, number>;

        const closedTrades: DigestTrade[] = closed.map((p) => {
          const closePrice = p.closePrice ?? p.avgCost;
          const pnl = p.realizedPnl ?? 0;
          const positionCost = p.avgCost * p.quantity;
          const pnlPct = positionCost > 0 ? (pnl / positionCost) * 100 : 0;
          return {
            ticker: p.symbol,
            direction: p.direction as "LONG" | "SHORT",
            entryPrice: p.avgCost,
            closePrice,
            realizedPnl: pnl,
            pnlPct,
            outcome: p.outcome ?? "BREAKEVEN",
            daysHeld: daysBetween(p.openedAt, p.closedAt),
          };
        });

        const openTrades: DigestOpenTrade[] = open.map((p) => {
          const currentPrice = priceMap[p.symbol] ?? p.avgCost;
          const pnl =
            p.direction === "LONG"
              ? (currentPrice - p.avgCost) * p.quantity
              : (p.avgCost - currentPrice) * p.quantity;
          const pnlPct = calcPnlPct(p.direction, p.avgCost, currentPrice);
          return {
            ticker: p.symbol,
            direction: p.direction as "LONG" | "SHORT",
            entryPrice: p.avgCost,
            currentPrice,
            unrealizedPnl: pnl,
            pnlPct,
          };
        });

        const totalRealizedPnl = closedTrades.reduce(
          (s, t) => s + t.realizedPnl,
          0
        );
        const wins = closedTrades.filter((t) => t.outcome === "WIN").length;
        const winRate =
          closedTrades.length > 0 ? wins / closedTrades.length : null;

        const html = buildWeeklyDigestHtml({
          weekOf,
          runsThisWeek: stats.runsThisWeek as number,
          thesesGenerated: stats.thesesGenerated as number,
          tradesPlaced: closedTrades.length + openTrades.length,
          closedTrades,
          openTrades,
          winRate,
          totalRealizedPnl,
          agentInsight: insight as string,
          noActivity: closedTrades.length === 0 && openTrades.length === 0,
        });

        await getResend().emails.send({
          from: "Hindsight Agent <agent@hindsight-stocks.vercel.app>",
          to: toEmail,
          subject: `Hindsight Weekly Digest — ${weekOf}`,
          html,
        });

        return { sent: true, to: toEmail };
      });

      sent.push(config.userId);
    }

    return { sent: sent.length };
  }
);
