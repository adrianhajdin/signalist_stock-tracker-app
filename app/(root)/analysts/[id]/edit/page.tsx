import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { AnalystEditClient } from "@/components/analysts/AnalystEditClient";

type Params = { id: string };

export default async function AnalystEditPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { id } = await params;
  const { message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return notFound();

  const config = await prisma.agentConfig.findFirst({
    where: { id, userId: user.id },
  });

  if (!config) return notFound();

  // Load existing monitors for this analyst
  const monitors = await prisma.monitor.findMany({
    where: { analystId: id },
    orderBy: { createdAt: "asc" },
  });

  const domainMonitors = monitors.filter((m) => m.type === "DOMAIN");
  const searchMonitors = monitors.filter((m) => m.type === "SEARCH");

  // Build config object matching AgentConfigData shape (including intelligence)
  const currentConfig: Record<string, unknown> = {
    name: config.name,
    description: config.description,
    analystPrompt: config.analystPrompt,
    directionBias: config.directionBias,
    holdDurations: config.holdDurations,
    sectors: config.sectors,
    // ── Universe (B1) — narrower discovery fence ─────────────────
    industries: config.industries,
    themes: config.themes,
    marketCapMin: config.marketCapMin != null ? Number(config.marketCapMin) : null,
    marketCapMax: config.marketCapMax != null ? Number(config.marketCapMax) : null,
    signalTypes: config.signalTypes,
    minConfidence: config.minConfidence,
    maxPositionSize: config.maxPositionSize ? Number(config.maxPositionSize) : undefined,
    maxOpenPositions: config.maxOpenPositions,
    minMarketCapTier: config.minMarketCapTier,
    watchlist: config.watchlist,
    exclusionList: config.exclusionList,
    // Map existing monitors into the shape the panel expects
    domainMonitorProposal: domainMonitors.length > 0
      ? {
          name: `${config.name} Monitors`,
          sources: domainMonitors.map((m) => ({
            name: m.name,
            domain: (m.config as Record<string, string>)?.domain ?? "",
            category: m.category,
            qualityScore: (m.config as Record<string, number>)?.qualityScore ?? 3,
            reason: "",
          })),
        }
      : undefined,
    intelligenceQueries: searchMonitors.length > 0
      ? searchMonitors.map((m) => ({
          query: (m.config as Record<string, string>)?.query ?? m.name,
          category: m.category,
          reason: "",
        }))
      : undefined,
    intelligencePolicy: config.intelligencePolicy
      ? (config.intelligencePolicy as Record<string, unknown>)
      : undefined,
  };

  return (
    <AnalystEditClient
      analystId={id}
      currentConfig={currentConfig}
      initialMessage={message}
    />
  );
}
