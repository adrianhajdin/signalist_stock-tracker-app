import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getAnalystDetail } from "@/lib/actions/analyst.actions";
import { getWatchlistItems } from "@/lib/actions/watchlist.actions";
import { getLatestPrices } from "@/lib/alpaca";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import AnalystDetailClient from "@/components/analysts/AnalystDetailClient";

type Params = { id: string };

export default async function AnalystDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? "";

  // Auto-clean zombie RUNNING runs older than 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (userId) {
    await prisma.researchRun.updateMany({
      where: {
        userId,
        agentConfigId: id,
        status: "RUNNING",
        createdAt: { lt: fifteenMinAgo },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });
  }

  const [detail, runningCount, watchlistItems, alpacaCreds] = await Promise.all([
    getAnalystDetail(id).catch((err) => {
      console.error("[analyst-page] getAnalystDetail failed:", err);
      return null;
    }),
    userId
      ? prisma.researchRun.count({
          where: { userId, agentConfigId: id, status: "RUNNING" },
        }).catch(() => 0)
      : Promise.resolve(0),
    getWatchlistItems(id).catch(() => []),
    userId ? resolveAlpacaCredentials(userId).catch(() => null) : Promise.resolve(null),
  ]);

  if (!detail) notFound();

  // Fetch live prices for open positions using user's Alpaca credentials
  const openSymbols = detail.recentTrades
    .filter((t) => t.status === "OPEN")
    .map((t) => t.symbol);
  const uniqueSymbols = [...new Set(openSymbols)];
  const livePrices: Record<string, number> =
    uniqueSymbols.length > 0
      ? await getLatestPrices(uniqueSymbols, alpacaCreds ?? undefined).catch(() => ({}))
      : {};

  return (
    <AnalystDetailClient
      detail={detail}
      hasRunning={runningCount > 0}
      initialWatchlist={watchlistItems}
      livePrices={livePrices}
    />
  );
}
