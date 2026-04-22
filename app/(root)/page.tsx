import DashboardClient from "@/components/dashboard/DashboardClient";
import { getDashboardData } from "@/lib/actions/portfolio.actions";
import type { DashboardData } from "@/lib/actions/portfolio.actions";
import { createClient } from "@/lib/supabase/server";

const EMPTY_DASHBOARD: DashboardData = {
  openTrades: [], closedTrades: [], activityFeed: [],
  portfolio: { totalValue: 100_000, unrealizedPnl: 0, realizedPnl: 0, winRate: null, openCount: 0 },
  equityCurve: [], realizedCurve: [], agentConfigs: [], recentRuns: [],
  todaysPicks: [], recentPicks: [], hasAlpacaKey: false, analystCount: 0,
  hasCompletedRun: false, hasBrief: false, analysts: [], analystEquityCurves: {},
  spyBenchmark: { '1W': null, '1M': null, '1Y': null },
  spyCandles: [],
};

export default async function Home() {
  const [data, supabase] = await Promise.all([
    getDashboardData().catch(() => EMPTY_DASHBOARD),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <DashboardClient
      data={data}
      userId={user?.id}
    />
  );
}
