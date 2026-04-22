import PerformancePage from "@/components/performance/PerformancePage";
import { getAnalyticsData } from "@/lib/actions/analytics.actions";

export default async function Performance() {
  const data = await getAnalyticsData();
  return <PerformancePage data={data} />;
}
