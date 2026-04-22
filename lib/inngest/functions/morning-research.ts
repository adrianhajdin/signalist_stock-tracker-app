import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createResearchTools } from "@/lib/agent/tools";
import { buildV2SystemPrompt } from "@/lib/agent/system-prompt";
import { buildRunInput } from "@/lib/agent/run-input";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import { updateAnalystBriefing } from "@/lib/agent/update-analyst-briefing";

// ─── Inngest function ─────────────────────────────────────────────────────────

export const morningResearch = inngest.createFunction(
  {
    id: "morning-research",
    name: "Morning Research Cron",
    concurrency: { limit: 1 },
    retries: 1,
  },
  [
    { cron: "TZ=America/New_York 0 8 * * 1-5" }, // 8:00 AM ET Mon–Fri (auto-adjusts for EDT/EST)
    { event: "app/research.run.manual" },
  ],
  async ({ event, step }) => {
    // Optional: if triggered manually for a specific analyst, only run that one
    const targetConfigId = (event as { data?: { agentConfigId?: string } })
      ?.data?.agentConfigId ?? null;

    // ── Step 1: Load enabled AgentConfigs (all, or filtered to one) ──────────

    const configs = await step.run("load-agent-configs", async () => {
      return prisma.agentConfig.findMany({
        where: {
          enabled: true,
          ...(targetConfigId ? { id: targetConfigId } : {}),
        },
      });
    });

    if (configs.length === 0) {
      return { ran: 0, reason: "no-enabled-configs" };
    }

    let totalTradesPlaced = 0;

    // ── Step 2: Per-analyst agent run ──────────────────────────────────────

    for (const config of configs) {
      const result = await step.run(`research-${config.id}`, async () => {
        const t0 = Date.now();

        // 2a. Check open positions for THIS analyst (not all analysts combined)
        const openCount = await prisma.position.count({
          where: {
            analystId: config.id,
            status: "OPEN",
          },
        });
        const slotsRemaining = Math.max(0, config.maxOpenPositions - openCount);
        // Never skip the run — the agent should always research.
        // slotsRemaining=0 just means it won't place new trades.

        // 2b. Create ResearchRun record (status: RUNNING)
        const run = await prisma.researchRun.create({
          data: {
            userId: config.userId,
            agentConfigId: config.id,
            source: "AGENT",
            status: "RUNNING",
            parameters: {
              markets: config.markets,
              sectors: config.sectors,
              minConfidence: config.minConfidence,
              signalTypes: config.signalTypes,
              tickers: config.watchlist ?? [],
              triggeredBy: "morning-cron",
              agentMode: true,
              analystName: config.name,
            } as object,
          },
        });

        console.log(`[morning-research] Starting agent run for ${config.name} (config=${config.id}, run=${run.id})`);

        // 2c. Build system prompt with structured run input
        const agentConfig = {
          name: config.name,
          analystPrompt: config.analystPrompt ?? undefined,
          directionBias: config.directionBias,
          holdDurations: config.holdDurations,
          sectors: config.sectors,
          signalTypes: config.signalTypes,
          minConfidence: config.minConfidence,
          maxPositionSize: Number(config.maxPositionSize),
          maxOpenPositions: slotsRemaining, // Use remaining slots, not max
          watchlist: config.watchlist,
          exclusionList: config.exclusionList,
        };

        // Resolve per-user Alpaca credentials for this analyst's owner
        const alpacaCreds = await resolveAlpacaCredentials(config.userId) ?? undefined;

        const runInput = await buildRunInput(config.id, config.userId, alpacaCreds);
        const systemPrompt = buildV2SystemPrompt(agentConfig, runInput);

        // 2d. Create tools with run context
        const tools = createResearchTools({
          runId: run.id,
          userId: config.userId,
          analystId: config.id,
          watchlist: config.watchlist ?? [],
          exclusionList: config.exclusionList ?? [],
          sectors: config.sectors ?? [],
          maxPositionSize: Number(config.maxPositionSize),
          maxOpenPositions: config.maxOpenPositions,
          minConfidence: config.minConfidence,
          alpacaCreds,
        });

        // 2e. Run the agent (generateText, not streamText — no client to stream to)
        // Use AbortSignal to kill the agent before Vercel's 300s timeout kills the process.
        // Without this, a timeout leaves the run stuck in RUNNING status forever.
        console.log(`[morning-research] Starting generateText for ${config.name} run=${run.id} systemPrompt=${systemPrompt.length}chars`);
        try {
          const { text, steps, response } = await generateText({
            model: openai("gpt-4o"),
            system: systemPrompt,
            prompt: "Begin your research session. Follow all phases in order.",
            tools,
            stopWhen: stepCountIs(30),
            abortSignal: AbortSignal.timeout(240_000), // 4 min — leaves 1 min for cleanup before Vercel's 5 min limit
            onStepFinish({ stepNumber, toolCalls: stepTools, text: stepText, finishReason, usage }) {
              const elapsed = Date.now() - t0;
              const ts = new Date().toISOString().slice(11, 23);
              const toolNames = stepTools.map((tc) => tc.toolName).join(", ") || "none";
              const textPreview = stepText?.slice(0, 120)?.replace(/\n/g, " ") || "";
              console.log(
                `[morning-research] ${ts} STEP #${stepNumber} ${config.name} run=${run.id} elapsed=${elapsed}ms tools=[${toolNames}] finish=${finishReason} tokens=${usage?.totalTokens ?? "?"} text="${textPreview}${stepText && stepText.length > 120 ? "..." : ""}"`
              );
            },
          });

          const toolCalls = steps.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0);
          const elapsed = Date.now() - t0;
          console.log(`[morning-research] Agent completed for ${config.name}: ${steps.length} steps, ${toolCalls} tool calls, ${elapsed}ms`);

          // Count positions opened by checking DB (the place_trade tool already created them)
          const tradesPlaced = await prisma.tradeDecision.count({
            where: {
              runId: run.id,
              decision: "BUY",
            },
          });

          // Ensure run is marked terminal. complete_run normally does this,
          // but if the agent stopped mid-workflow without calling it we
          // need to do it here AND honestly report the outcome.
          //
          // hasWork mirrors the agent route's onFinish logic: if the agent
          // produced zero theses and zero trade decisions, it bailed out
          // before reaching Phase 5/6/7 — that's a failed run, not a
          // legitimate "no picks today". Marking it FAILED makes the
          // failure visible in /runs instead of pretending nothing happened.
          const [thesisCount, decisionCount] = await Promise.all([
            prisma.thesis.count({ where: { researchRunId: run.id } }),
            prisma.tradeDecision.count({ where: { runId: run.id } }),
          ]);
          const hasWork = thesisCount > 0 || decisionCount > 0;
          const finalStatus = hasWork ? "COMPLETE" : "FAILED";
          // Atomic: only transition RUNNING → terminal. No-op if complete_run
          // already marked it COMPLETE.
          const beltResult = await prisma.researchRun.updateMany({
            where: { id: run.id, status: "RUNNING" },
            data: { status: finalStatus, completedAt: new Date() },
          });
          if (beltResult.count > 0 && !hasWork) {
            console.warn(
              `[morning-research] ⚠️ ${config.name} run=${run.id} bailed before Phase 5+ — ${steps.length} steps, ${toolCalls} tool calls, 0 theses, 0 decisions. Marked FAILED.`
            );
            // Surface the failure in the run UI
            try {
              await prisma.runEvent.create({
                data: {
                  runId: run.id,
                  type: "run_failed",
                  title: "Run did not complete",
                  message: `Agent stopped after ${steps.length} steps and ${toolCalls} tool calls without calling record_thesis or complete_run. No theses or trade decisions were produced.`,
                  payload: { steps: steps.length, toolCalls, thesisCount, decisionCount } as object,
                },
              });
            } catch { /* event write is best-effort */ }
          }
          // Enrich parameters with run metadata (non-critical, separate write)
          if (beltResult.count > 0) {
            try {
              const freshRun = await prisma.researchRun.findUnique({ where: { id: run.id }, select: { parameters: true } });
              await prisma.researchRun.update({
                where: { id: run.id },
                data: {
                  parameters: {
                    ...((freshRun?.parameters as object) ?? {}),
                    tradesPlaced,
                    agentSteps: steps.length,
                    agentToolCalls: toolCalls,
                    elapsedMs: elapsed,
                  } as object,
                },
              });
            } catch { /* parameter enrichment is non-critical */ }
          }

          // Persist full conversation messages for replay (atomic — old messages preserved on failure)
          try {
            const userMessage = {
              role: "user",
              content: [{ type: "text", text: "Begin your research session. Follow all phases in order." }],
            };
            // Defensive: response.messages may be undefined depending on the
            // AI SDK provider (observed after switching from OpenAI to Anthropic).
            // Fall back to reconstructing from steps if the top-level is missing.
            let responseMessages = response?.messages;
            if (!responseMessages || !Array.isArray(responseMessages) || responseMessages.length === 0) {
              console.warn(
                `[morning-research] response.messages is ${responseMessages === undefined ? "undefined" : "empty"} for run ${run.id}. ` +
                `Reconstructing from ${steps.length} steps.`
              );
              // Each step has its own response.messages — flatten them
              responseMessages = steps.flatMap((s) => {
                const stepMsgs = (s as unknown as { response?: { messages?: unknown[] } }).response?.messages;
                return Array.isArray(stepMsgs) ? stepMsgs : [];
              }) as typeof responseMessages;
            }
            const allMessages = [userMessage, ...responseMessages];
            const json = JSON.stringify(allMessages);
            console.log(
              `[morning-research] Persisting ${allMessages.length} messages (${(json.length / 1024).toFixed(0)}KB) for run ${run.id}`
            );
            await prisma.$transaction(async (tx) => {
              await tx.runMessage.deleteMany({ where: { runId: run.id } });
              await tx.runMessage.create({
                data: {
                  runId: run.id,
                  role: "thread",
                  content: json,
                },
              });
            });
            console.log(`[morning-research] ✅ Messages persisted for run ${run.id}`);
          } catch (msgErr) {
            console.error(
              `[morning-research] ❌ Failed to persist messages for run ${run.id}:`,
              msgErr instanceof Error ? msgErr.message : msgErr,
            );
          }

          // Generate briefing directly (runs inside this Inngest step, guaranteed execution)
          await updateAnalystBriefing({ analystId: config.id, runId: run.id, userId: config.userId });

          return { tradesPlaced, steps: steps.length, toolCalls, elapsedMs: elapsed };
        } catch (err) {
          const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted") || err.message.includes("timed out"));
          const message = isTimeout
            ? `Agent timed out after 4 minutes (${Math.round((Date.now() - t0) / 1000)}s elapsed). Any theses and trades completed before timeout are preserved.`
            : err instanceof Error ? err.message : String(err);
          console.error(`[morning-research] Agent ${isTimeout ? "TIMED OUT" : "FAILED"} for ${config.name}: ${message}`);

          // Check if any theses/trades were placed before the timeout
          const partialTheses = await prisma.thesis.count({ where: { researchRunId: run.id } });
          const partialTrades = await prisma.tradeDecision.count({ where: { runId: run.id, decision: "BUY" } });
          const hasPartialWork = partialTheses > 0 || partialTrades > 0;

          const finalStatus = isTimeout && hasPartialWork ? "COMPLETE" : "FAILED";
          // Atomic: only transition RUNNING → terminal. If complete_run already
          // marked it COMPLETE, this is a no-op and we preserve that status.
          const timeoutResult = await prisma.researchRun.updateMany({
            where: { id: run.id, status: "RUNNING" },
            data: { status: finalStatus, completedAt: new Date() },
          });
          // Enrich parameters with error metadata (non-critical, separate write)
          try {
            const freshRun = await prisma.researchRun.findUnique({ where: { id: run.id }, select: { parameters: true } });
            await prisma.researchRun.update({
              where: { id: run.id },
              data: {
                parameters: {
                  ...((freshRun?.parameters as object) ?? {}),
                  error: message,
                  failedAt: new Date().toISOString(),
                  ...(hasPartialWork ? { partialTheses, partialTrades, timedOut: true } : {}),
                } as object,
              },
            });
          } catch { /* parameter enrichment is non-critical */ }

          // Generate briefing for runs that ended up COMPLETE (either we set it or complete_run did)
          const finalRun = await prisma.researchRun.findUnique({ where: { id: run.id }, select: { status: true } });
          if (finalRun?.status === "COMPLETE") {
            await updateAnalystBriefing({ analystId: config.id, runId: run.id, userId: config.userId });
          }

          return { error: message, partialTheses, partialTrades };
        }
      });

      // Accumulate trades from successful runs
      if (result && typeof result === "object" && "tradesPlaced" in result) {
        totalTradesPlaced += (result as { tradesPlaced: number }).tradesPlaced;
      }
    }

    // ── Step 3: Sweep stale RUNNING runs from this batch ──────────────────
    // If any step.run timed out or was killed, the ResearchRun stays RUNNING.
    // This catch-all ensures they get marked FAILED so they don't appear as live.
    await step.run("sweep-stale-runs", async () => {
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 min
      const staleRuns = await prisma.researchRun.updateMany({
        where: {
          status: "RUNNING",
          source: "AGENT",
          startedAt: { lt: staleThreshold },
          agentConfigId: { in: configs.map((c) => c.id) },
        },
        data: {
          status: "FAILED",
          completedAt: new Date(),
        },
      });
      if (staleRuns.count > 0) {
        console.warn(`[morning-research] Swept ${staleRuns.count} stale RUNNING runs to FAILED`);
      }
    });

    return { ran: configs.length, totalTradesPlaced };
  }
);
