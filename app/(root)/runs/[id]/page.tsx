import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ScanSearch } from "lucide-react";
import { AgentChat } from "@/components/agent/AgentChat";
import { HowItWorksSheet } from "@/components/domain/how-it-works-sheet";
import { convertPersistedToUIMessages } from "@/lib/agent/convert-messages";
import { getRunSourcesData } from "@/lib/actions/run-sources.actions";
import type { UIMessage } from "ai";

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const run = await prisma.researchRun.findFirst({
    where: { id, userId },
    include: {
      agentConfig: { select: { id: true, name: true } },
      messages: {
        where: { role: "thread" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!run) notFound();

  const analystName =
    run.agentConfig?.name ??
    (run.source === "MANUAL" ? "Manual Research" : "Agent");

  // Extract config snapshot from the run parameters
  const config =
    run.parameters && typeof run.parameters === "object"
      ? (run.parameters as Record<string, unknown>)
      : {};

  // Detect stale RUNNING runs (likely crashed cron or timed-out agent).
  // If RUNNING for over 10 minutes, treat as stale — don't auto-start a new agent.
  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const isStale =
    run.status === "RUNNING" &&
    Date.now() - new Date(run.startedAt).getTime() > STALE_THRESHOLD_MS;

  // Mark stale runs as FAILED — atomic, only if still RUNNING
  if (isStale) {
    const staleResult = await prisma.researchRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: { status: "FAILED", completedAt: new Date() },
    });
    if (staleResult.count > 0) {
      run.status = "FAILED";
    }
  }

  // Parse persisted messages for completed/failed runs
  let persistedMessages: UIMessage[] | null = null;
  if ((run.status === "COMPLETE" || run.status === "FAILED") && run.messages.length > 0) {
    try {
      const raw = JSON.parse(run.messages[0].content);
      if (Array.isArray(raw) && raw.length > 0) {
        persistedMessages = convertPersistedToUIMessages(raw);
      }
    } catch {
      // Malformed JSON — will show empty state
    }
  }

  const isLive = run.status === "RUNNING";
  const hasReplay = persistedMessages !== null;

  // Load Sources + Theses tab data from the DB.
  // Wrapped in try/catch so a DB error (e.g. pending migration) never
  // crashes the whole page — tabs just render empty.
  const { brief, sources, theses } = await getRunSourcesData({
    runId: run.id,
    analystId: run.agentConfig?.id ?? null,
    startedAt: run.startedAt,
  }).catch(() => ({ brief: null, sources: [], theses: [] }));

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] overflow-hidden">
      <div className="flex-1 min-h-0">
        {isLive || hasReplay ? (
          <AgentChat
            mode="research-run"
            runId={id}
            analystId={run.agentConfig?.id}
            analystName={analystName}
            autoStart={isLive}
            messages={persistedMessages ?? undefined}
            brief={brief}
            sources={sources}
            theses={theses}
            headerAction={
              <HowItWorksSheet flow="agent">
                <ScanSearch className="h-4 w-4" />
              </HowItWorksSheet>
            }
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2 px-6">
            <div className="h-2.5 w-2.5 rounded-full bg-negative" />
            <p className="text-sm font-medium text-foreground">
              {run.status === "FAILED" ? "Run failed" : "No replay data available"}
            </p>
            <p className="text-xs max-w-xs">
              {run.status === "FAILED"
                ? "This run stopped before completing. It may have timed out or encountered an error."
                : "This run completed before message persistence was enabled."}
            </p>
            {run.status === "FAILED" && typeof config.error === "string" && (
              <p className="text-xs max-w-md font-mono text-negative mt-2 bg-negative/5 rounded-md px-3 py-2 border border-negative/10">
                {config.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
