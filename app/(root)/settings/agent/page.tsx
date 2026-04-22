import { redirect } from "next/navigation";

// /settings/agent removed — analyst config lives inline on each analyst's detail page.
export default function AgentRulesPage() {
  redirect("/analysts");
}
