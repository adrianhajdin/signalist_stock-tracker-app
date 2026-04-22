import TradesPage from "@/components/trades/TradesPage";
import { getDashboardData } from "@/lib/actions/portfolio.actions";

export default async function Trades() {
  const { openTrades, closedTrades } = await getDashboardData();
  return <TradesPage initialOpenTrades={openTrades} initialClosedTrades={closedTrades} />;
}
