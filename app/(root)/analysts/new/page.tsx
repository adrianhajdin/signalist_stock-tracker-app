import { getApiKeyStatus } from "@/lib/actions/api-keys.actions";
import { NewAnalystClient } from "./client";

export default async function NewAnalystPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [alpacaStatus, params] = await Promise.all([
    getApiKeyStatus("ALPACA"),
    searchParams,
  ]);

  return (
    <NewAnalystClient
      hasAlpacaKey={alpacaStatus.hasKey}
      initialPrompt={params.prompt}
    />
  );
}
