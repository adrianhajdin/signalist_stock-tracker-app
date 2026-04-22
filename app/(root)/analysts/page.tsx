import { getAnalystList } from "@/lib/actions/analyst.actions";
import AnalystsPageClient from "@/components/analysts/AnalystsPageClient";

export default async function AnalystsPage() {
  const analysts = await getAnalystList();
  return <AnalystsPageClient analysts={analysts} />;
}
