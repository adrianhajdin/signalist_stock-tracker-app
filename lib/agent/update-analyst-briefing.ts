/**
 * Post-run briefing agent.
 *
 * A SEPARATE agent from the research analyst. After each run completes,
 * this reads the full research conversation + portfolio state and writes
 * a standup brief that feeds into the next run's system prompt.
 *
 * Why separate? The research agent should research. Asking it to also
 * self-reflect wastes tool budget and produces self-serving assessments.
 * An external reviewer reading the full conversation produces better
 * watch-tomorrow items, more honest self-corrections, and a more useful
 * narrative for the next run.
 */

import { generateObject, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ── Schema for the briefing agent's output ──────────────────────────────────
// IMPORTANT: All fields are REQUIRED (no .optional() or .catch()) because
// OpenAI structured outputs strict mode requires every property to be in the
// `required` array. Optional fields cause silent generateObject failures.
// The model is told to use empty strings/arrays when content doesn't apply.

const briefingSchema = z.object({
  narrative: z
    .string()
    .describe(
      "400-600 word portfolio briefing in markdown with $TICKER format. Covers: what the analyst did this session, key findings, decisions made with rationale, and current portfolio state."
    ),
  strategyNotes: z
    .string()
    .describe(
      "100-200 word data-driven strategy assessment. What patterns are emerging in wins vs losses? What should change? Be specific and honest."
    ),
  marketPosture: z
    .string()
    .describe(
      "2-3 word market stance summary, e.g. 'cautiously bullish', 'defensive', 'risk-on'."
    ),
  watchTomorrow: z
    .array(
      z.object({
        symbol: z.string(),
        trigger: z.string().describe("Specific condition, e.g. 'price < $145'"),
        suggestedAction: z.string().describe("What to do if triggered"),
        priority: z.enum(["HIGH", "NORMAL"]).describe("HIGH if urgent, NORMAL otherwise"),
      })
    )
    .describe("2-5 things to check next session. Empty array if nothing notable."),
  unresolvedItems: z
    .array(
      z.object({
        item: z.string().describe("What couldn't be resolved"),
        impact: z.string().describe("Why it matters"),
        affectedPositions: z.array(z.string()).describe("Tickers affected, empty array if none"),
      })
    )
    .describe("Data gaps, pending catalysts, unfinished research. Empty array if none."),
  selfCorrections: z
    .array(
      z.object({
        observation: z.string().describe("Pattern noticed in analyst behavior"),
        adjustment: z.string().describe("Concrete adjustment for next session"),
      })
    )
    .describe("Behavioral patterns to correct. Empty array if none."),
  // NOTE: dynamicQueries was removed. It was an uncontrolled side-effect
  // that quietly wrote 0-5 ticker-specific SEARCH monitors per run and
  // never deleted them, so analysts accumulated 30+ stale queries the
  // user had no visibility into. Per-ticker monitoring is already
  // handled by portfolio-watchlist-monitor.ts; broader thematic queries
  // belong on AgentConfig's initial intelligenceQueries (capped at 3-5
  // by suggest_config schema).
  //
  // The feature will return as a proposal-based self-improvement loop
  // in a later workstream — see docs/SELF_IMPROVEMENT_HANDOFF.md.
});

interface BriefingContext {
  analystId: string;
  runId: string;
  userId: string;
}

/**
 * Generate and persist an analyst briefing after a run completes.
 * Reads the full research conversation from RunMessage, loads portfolio
 * state, and uses GPT-4o as a briefing agent to produce the standup.
 *
 * Non-fatal — errors are logged but don't break the run flow.
 */
export async function updateAnalystBriefing({
  analystId,
  runId,
  userId,
}: BriefingContext): Promise<void> {
  try {
    const t0 = Date.now();

    // Hard-fail on bad inputs — these would silently corrupt the upsert
    if (!runId || runId.length === 0) {
      throw new Error(`updateAnalystBriefing called with empty runId (analystId=${analystId})`);
    }
    if (!analystId || analystId.length === 0) {
      throw new Error(`updateAnalystBriefing called with empty analystId (runId=${runId})`);
    }
    if (!userId || userId.length === 0) {
      throw new Error(`updateAnalystBriefing called with empty userId (runId=${runId})`);
    }

    // Load everything in parallel — allSettled so one failure doesn't kill the rest
    const results = await Promise.allSettled([
      // 0: analyst config — look up by id only, NOT userId.
      // If the run was created with a stale userId mismatch, the briefing
      // would silently skip. Run lifecycle already enforces ownership upstream.
      prisma.agentConfig.findUnique({
        where: { id: analystId },
      }),
      // 1: the full research conversation
      prisma.runMessage.findFirst({
        where: { runId },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      }),
      // 2: open positions
      prisma.position.findMany({
        where: { userId, status: "OPEN", analystId },
        include: {
          decisions: {
            take: 1,
            include: {
              thesis: {
                select: {
                  confidenceScore: true,
                  reasoningSummary: true,
                  direction: true,
                  signalTypes: true,
                },
              },
            },
          },
        },
        orderBy: { openedAt: "desc" },
      }),
      // 3: recent closed trades
      prisma.position.findMany({
        where: { userId, status: "CLOSED", analystId },
        orderBy: { closedAt: "desc" },
        take: 30,
        select: {
          symbol: true, direction: true, avgCost: true, closePrice: true,
          quantity: true, realizedPnl: true, outcome: true,
          openedAt: true, closedAt: true, closeReason: true,
        },
      }),
      // 4: theses from this run
      prisma.thesis.findMany({
        where: { researchRunId: runId, userId },
        select: {
          ticker: true, direction: true, confidenceScore: true,
          reasoningSummary: true, thesisBullets: true, riskFlags: true,
          entryPrice: true, targetPrice: true, stopLoss: true,
          holdDuration: true, signalTypes: true, sector: true,
        },
      }),
      // 5: positions from this run
      prisma.position.findMany({
        where: {
          userId,
          decisions: { some: { thesis: { researchRunId: runId } } },
        },
        select: {
          symbol: true, direction: true, avgCost: true, quantity: true,
          status: true, targetPrice: true, stopLoss: true,
        },
      }),
      // 6: run summary event
      prisma.runEvent.findFirst({
        where: { runId, type: "run_summary" },
        select: { payload: true },
      }),
      // 7: total completed runs
      prisma.researchRun.count({
        where: { agentConfigId: analystId, userId, status: "COMPLETE" },
      }),
      // 8: previous briefing (for continuity)
      prisma.analystBriefing.findFirst({
        where: { analystId },
        orderBy: { createdAt: "desc" },
        select: {
          narrative: true, strategyNotes: true, marketPosture: true,
          watchTomorrow: true, selfCorrections: true, createdAt: true,
        },
      }),
      // 9: recent PASS decisions
      prisma.tradeDecision.findMany({
        where: { userId, analystId, decision: "PASS" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          symbol: true, reasoning: true, createdAt: true,
          thesis: {
            select: { entryPrice: true, confidenceScore: true },
          },
        },
      }),
    ]);

    // Extract values with safe fallbacks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (i: number, fallback: any) => {
      const r = results[i];
      if (r.status === "fulfilled") return r.value;
      console.warn(`[briefing] Query ${i} failed:`, r.reason);
      return fallback;
    };

    const config = val(0, null);
    const conversationRow = val(1, null);
    const openTrades = val(2, []);
    const recentClosedTrades = val(3, []);
    const runTheses = val(4, []);
    const runTrades = val(5, []);
    const runSummaryEvent = val(6, null);
    const allRunsCount = val(7, 0);
    const previousBriefing = val(8, null);
    const recentPassDecisions = val(9, []);

    if (!config) {
      throw new Error(`Analyst ${analystId} not found in DB. Cannot write briefing without analyst FK.`);
    }

    // ── Extract conversation transcript ──────────────────────────────────────
    let conversationTranscript = "No conversation data available for this run.";
    if (conversationRow?.content) {
      try {
        const messages = JSON.parse(conversationRow.content);
        // Build a readable transcript from the AI SDK message format
        const lines: string[] = [];
        for (const msg of messages) {
          if (msg.role === "assistant" && typeof msg.content === "string") {
            lines.push(`[ANALYST]: ${msg.content}`);
          } else if (msg.role === "assistant" && Array.isArray(msg.content)) {
            // AI SDK v6: parts array
            for (const part of msg.content) {
              if (part.type === "text" && part.text) {
                lines.push(`[ANALYST]: ${part.text}`);
              } else if (part.type === "tool-call" || part.type === "tool_call") {
                const name = part.toolName || part.tool_name || "unknown_tool";
                lines.push(`[TOOL CALL]: ${name}(${JSON.stringify(part.args || part.input || {}).slice(0, 200)})`);
              } else if (part.type === "tool-result" || part.type === "tool_result") {
                const name = part.toolName || part.tool_name || "tool";
                const result = JSON.stringify(part.result || part.output || {}).slice(0, 500);
                lines.push(`[TOOL RESULT ${name}]: ${result}`);
              }
            }
          } else if (msg.role === "tool") {
            // Tool response messages
            const content = Array.isArray(msg.content) ? msg.content : [msg.content];
            for (const part of content) {
              if (part?.type === "tool-result" || typeof part === "object") {
                const result = JSON.stringify(part?.result || part || {}).slice(0, 500);
                lines.push(`[TOOL RESULT]: ${result}`);
              }
            }
          }
        }
        if (lines.length > 0) {
          // Cap at ~12k chars to fit in prompt without blowing up tokens
          conversationTranscript = lines.join("\n").slice(0, 12000);
          if (lines.join("\n").length > 12000) {
            conversationTranscript += "\n[...transcript truncated]";
          }
        }
      } catch (parseErr) {
        console.warn("[briefing] Failed to parse conversation:", parseErr);
      }
    }

    // ── Compute portfolio stats ──────────────────────────────────────────────
    const totalInvested = openTrades.reduce(
      (sum: number, t: { avgCost: number; quantity: number }) => sum + t.avgCost * t.quantity, 0
    );
    const closedPnl = recentClosedTrades.reduce(
      (sum: number, t: { realizedPnl: number | null }) => sum + (t.realizedPnl ?? 0), 0
    );
    const wins = recentClosedTrades.filter(
      (t: { outcome: string | null }) => t.outcome === "WIN"
    ).length;
    const losses = recentClosedTrades.filter(
      (t: { outcome: string | null }) => t.outcome === "LOSS"
    ).length;
    const winRate = wins + losses > 0 ? wins / (wins + losses) : null;

    // ── Build structured data for the briefing row ───────────────────────────
    const runSummaryPayload = runSummaryEvent?.payload as Record<string, unknown> | null;
    const marketContext = runSummaryPayload
      ? {
          summary: runSummaryPayload.summary as string | undefined,
          rankedPicks: runSummaryPayload.ranked_picks,
          riskNotes: runSummaryPayload.risk_notes,
          overallAssessment: runSummaryPayload.overall_assessment,
        }
      : null;

    const thesesData = runTheses.map((t: {
      ticker: string; direction: string; confidenceScore: number;
      reasoningSummary: string; thesisBullets: string[]; riskFlags: string[];
      entryPrice: number | null; targetPrice: number | null; stopLoss: number | null;
      holdDuration: string; signalTypes: string[];
    }) => ({
      ticker: t.ticker,
      direction: t.direction,
      confidence_score: t.confidenceScore,
      reasoning_summary: t.reasoningSummary,
      thesis_bullets: t.thesisBullets,
      risk_flags: t.riskFlags,
      entry_price: t.entryPrice,
      target_price: t.targetPrice,
      stop_loss: t.stopLoss,
      hold_duration: t.holdDuration,
      signal_types: t.signalTypes,
    }));

    const tradesData = runTrades.map((t: {
      symbol: string; direction: string; avgCost: number;
      quantity: number; status: string; targetPrice: number | null; stopLoss: number | null;
    }) => ({
      ticker: t.symbol,
      direction: t.direction,
      entryPrice: t.avgCost,
      shares: t.quantity,
      status: t.status,
      targetPrice: t.targetPrice,
      stopLoss: t.stopLoss,
    }));

    const portfolioSnapshot = {
      openPositions: openTrades.length,
      totalInvested,
      closedPnl,
      winRate,
      wins,
      losses,
      totalTrades: recentClosedTrades.length,
      totalRuns: allRunsCount,
    };

    // ── Build briefing agent prompt ──────────────────────────────────────────

    const openPositionsText = openTrades.length > 0
      ? openTrades.map((t: { symbol: string; direction: string; quantity: number; avgCost: number; decisions: Array<{ thesis: { confidenceScore: number; reasoningSummary: string } | null }> }) => {
          const thesis = t.decisions[0]?.thesis;
          return `- $${t.symbol}: ${t.direction} ${t.quantity} shares @ $${t.avgCost.toFixed(2)} (confidence: ${thesis?.confidenceScore ?? "?"}%, thesis: "${thesis?.reasoningSummary?.slice(0, 100) ?? "—"}")`;
        }).join("\n")
      : "No open positions.";

    const recentTradesText = recentClosedTrades.length > 0
      ? recentClosedTrades.slice(0, 15).map((t: {
          outcome: string | null; symbol: string; direction: string;
          avgCost: number; closePrice: number | null; realizedPnl: number | null;
          closeReason: string | null;
        }) => {
          const pnl = t.realizedPnl ?? 0;
          const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
          return `- ${t.outcome ?? "?"} $${t.symbol}: ${t.direction} entry $${t.avgCost.toFixed(2)} → exit $${(t.closePrice ?? 0).toFixed(2)} (${pnlStr}, closed: ${t.closeReason ?? "?"})`;
        }).join("\n")
      : "No closed trades yet.";

    const winRateStr = winRate != null ? `${(winRate * 100).toFixed(0)}%` : "N/A";

    // Previous briefing for continuity
    const previousBriefingText = previousBriefing
      ? `\n## Previous Briefing (${previousBriefing.createdAt.toISOString().slice(0, 10)})
Market Posture: ${previousBriefing.marketPosture ?? "not set"}
Narrative: ${previousBriefing.narrative.slice(0, 400)}
Strategy Notes: ${previousBriefing.strategyNotes?.slice(0, 200) ?? "none"}
${previousBriefing.watchTomorrow ? `Watch Tomorrow: ${JSON.stringify(previousBriefing.watchTomorrow).slice(0, 300)}` : ""}
${previousBriefing.selfCorrections ? `Self-Corrections: ${JSON.stringify(previousBriefing.selfCorrections).slice(0, 300)}` : ""}`
      : "";

    const passDecisionsText = recentPassDecisions.length > 0
      ? recentPassDecisions.map((d: {
          symbol: string; createdAt: Date; reasoning: string | null;
          thesis: { entryPrice: number | null; confidenceScore: number | null } | null;
        }) => {
          const dateStr = d.createdAt.toISOString().slice(0, 10);
          return `- PASS: $${d.symbol} on ${dateStr} (confidence: ${d.thesis?.confidenceScore ?? "?"}%) — ${d.reasoning?.slice(0, 100) ?? "no reason"}`;
        }).join("\n")
      : "No pass decisions recorded yet.";

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    });

    const briefingPrompt = `You are a portfolio desk editor reviewing the research session of an AI analyst named "${config.name}". Your job is to write the standup brief that this analyst will see at the START of its next session. This brief is the analyst's memory — it's the most important document for run-to-run continuity.

Today's date is ${today}. All dates in your output must be relative to today.

You have access to the FULL research conversation transcript below. Read it carefully — the analyst's actual reasoning, tool calls, and decisions are all here. Do not rely solely on the summary stats; the conversation reveals nuances the numbers miss.

## Analyst Strategy
${config.analystPrompt || "General market research analyst."}

## Research Session Transcript
${conversationTranscript}

## Portfolio State

### Open Positions (${openTrades.length} active)
Total invested: $${totalInvested.toFixed(2)}
${openPositionsText}

### Recent Trade History (${recentClosedTrades.length} closed trades)
Win Rate: ${winRateStr} (${wins}W / ${losses}L)
Total P&L from closed trades: ${closedPnl >= 0 ? "+" : ""}$${closedPnl.toFixed(2)}
${recentTradesText}

### This Session
Theses generated: ${runTheses.length}
Trades executed: ${runTrades.length}
Total completed sessions: ${allRunsCount}

### Recent Pass Decisions
${passDecisionsText}
${previousBriefingText}

## Your Task

Write a standup brief for this analyst's NEXT session. The analyst will see this brief in its system prompt and must reference it in its Phase 0 check-in. Focus on what's ACTIONABLE.

Rules:
- Use $TICKER format for all stock symbols
- Be data-driven — cite actual prices, P&L numbers, confidence scores from the conversation
- Be honest about the analyst's mistakes — you're the editor, not the cheerleader
- watchTomorrow: derive from positions near targets/stops, catalysts mentioned in conversation, unfinished research
- selfCorrections: look for REAL patterns — did the analyst over-concentrate? Chase momentum? Ignore risk flags? Skip watchlist items? If the previous briefing had selfCorrections, check if the analyst actually followed through
- Build on the previous briefing — show progression of thinking, don't repeat the same observations
- The narrative is the analyst's memory. Be specific enough that it can quote this brief next session.`;

    // ── Generate briefing with fallback chain ──────────────────────────────
    // Layer 1: generateObject with strict schema (best output)
    // Layer 2: generateText + manual JSON parse (more permissive)
    // Layer 3: minimal data-only briefing (no LLM, always works)

    type BriefingObject = z.infer<typeof briefingSchema>;
    let object: BriefingObject | null = null;
    let generationMethod = "generateObject";

    // Layer 1
    try {
      const result = await generateObject({
        model: openai("gpt-4o"),
        schema: briefingSchema,
        prompt: briefingPrompt,
      });
      object = result.object;
      console.log(`[briefing] Layer 1 (generateObject) succeeded for run=${runId}`);
    } catch (l1Err) {
      console.warn(
        `[briefing] Layer 1 (generateObject) failed for run=${runId}:`,
        l1Err instanceof Error ? l1Err.message : l1Err
      );
    }

    // Layer 2: generateText with JSON request
    if (!object) {
      try {
        const textResult = await generateText({
          model: openai("gpt-4o"),
          prompt: `${briefingPrompt}\n\n## Output Format\nRespond with ONLY a valid JSON object matching this exact shape (no markdown, no prose, no code fences):\n{\n  "narrative": "<400-600 word markdown briefing>",\n  "strategyNotes": "<100-200 word strategy assessment>",\n  "marketPosture": "<2-3 word stance>",\n  "watchTomorrow": [{"symbol":"TICKER","trigger":"...","suggestedAction":"...","priority":"NORMAL"}],\n  "unresolvedItems": [{"item":"...","impact":"...","affectedPositions":[]}],\n  "selfCorrections": [{"observation":"...","adjustment":"..."}]\n}\n\nUse empty arrays [] for any sections that don't apply. All fields are required.`,
        });
        // Strip code fences if present
        const cleanText = textResult.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
        const parsed = JSON.parse(cleanText);
        // Lenient parse — fill in missing fields with defaults
        object = {
          narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
          strategyNotes: typeof parsed.strategyNotes === "string" ? parsed.strategyNotes : "",
          marketPosture: typeof parsed.marketPosture === "string" ? parsed.marketPosture : "neutral",
          watchTomorrow: Array.isArray(parsed.watchTomorrow) ? parsed.watchTomorrow : [],
          unresolvedItems: Array.isArray(parsed.unresolvedItems) ? parsed.unresolvedItems : [],
          selfCorrections: Array.isArray(parsed.selfCorrections) ? parsed.selfCorrections : [],
        };
        generationMethod = "generateText+parse";
        console.log(`[briefing] Layer 2 (generateText) succeeded for run=${runId}`);
      } catch (l2Err) {
        console.warn(
          `[briefing] Layer 2 (generateText) failed for run=${runId}:`,
          l2Err instanceof Error ? l2Err.message : l2Err
        );
      }
    }

    // Layer 3: minimal data-only briefing — no LLM, always works
    if (!object) {
      console.warn(`[briefing] Using Layer 3 (minimal stub) for run=${runId}`);
      const tradedTickers = runTrades.map((t: { symbol: string }) => `$${t.symbol}`).join(", ") || "no new positions";
      const openTickers = openTrades.map((t: { symbol: string }) => `$${t.symbol}`).join(", ") || "no open positions";
      object = {
        narrative: `## Session ${new Date().toISOString().slice(0, 10)}\n\nThis briefing was generated as a fallback because GPT-4o briefing generation failed. Raw session data:\n\n- **Open positions:** ${openTickers}\n- **Trades this session:** ${tradedTickers}\n- **Theses generated:** ${runTheses.length}\n- **Win rate (recent):** ${winRateStr}\n- **Total closed P&L:** ${closedPnl >= 0 ? "+" : ""}$${closedPnl.toFixed(2)}\n\nReview Vercel runtime logs for the underlying briefing generation error.`,
        strategyNotes: `Fallback briefing — full GPT-4o analysis unavailable. Win rate ${winRateStr}, ${wins}W / ${losses}L over ${recentClosedTrades.length} closed trades.`,
        marketPosture: openTrades.length > 0 ? "active" : "cash",
        watchTomorrow: [],
        unresolvedItems: [
          {
            item: "GPT-4o briefing generation failed",
            impact: "Next session will not have rich strategic context. Check Vercel logs for [briefing] errors.",
            affectedPositions: openTrades.map((t: { symbol: string }) => t.symbol),
          },
        ],
        selfCorrections: [],
      };
      generationMethod = "minimal-stub";
    }

    // ── Persist the briefing row ─────────────────────────────────────────────
    // Single attempt with all V2 fields. The V2 columns have existed in the
    // schema for months — the fallback was dead code based on stale assumptions.

    const briefingData = {
      analystId,
      runId,
      userId,
      narrative: object.narrative || "(empty)",
      marketContext: marketContext as object | undefined,
      theses: thesesData as object[],
      trades: tradesData as object[],
      portfolioSnapshot: portfolioSnapshot as object,
      strategyNotes: object.strategyNotes || "(empty)",
      marketPosture: object.marketPosture || "neutral",
      watchTomorrow: object.watchTomorrow as object[],
      unresolvedItems: object.unresolvedItems as object[],
      selfCorrections: object.selfCorrections as object[],
    };

    await prisma.analystBriefing.upsert({
      where: { runId },
      create: briefingData,
      update: briefingData,
    });
    console.log(`[briefing] Persisted briefing row for run=${runId} (method=${generationMethod})`);

    // NOTE: The dynamic-monitor write loop that used to live here was
    // removed. It silently created 0-5 BRIEFING_AGENT SEARCH monitors
    // per run with no delete logic, so analysts accumulated 20-50+ stale
    // ticker-specific queries the user had zero visibility into. The
    // self-improvement workstream will re-introduce this as a proposal-
    // based flow with user approval. See docs/SELF_IMPROVEMENT_HANDOFF.md.

    const elapsed = Date.now() - t0;
    console.log(
      `[briefing] Created briefing for ${config.name} (${analystId}) runId=${runId} in ${elapsed}ms (briefing agent via GPT-4o)`
    );
  } catch (err) {
    // RETHROW: callers MUST be able to detect failures.
    // Previous design swallowed errors and lied about success — caused weeks
    // of "successful" briefings that never wrote rows. Never again.
    console.error(
      `[briefing] Failed to create briefing for analyst ${analystId} runId=${runId}:`,
      err
    );
    throw err instanceof Error
      ? err
      : new Error(`Briefing generation failed: ${String(err)}`);
  }
}
