"use server";

import { prisma } from "@/lib/prisma";

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ?? "";
const PYTHON_SERVICE_SECRET = process.env.PYTHON_SERVICE_SECRET ?? "";

type ThesisOutput = {
  ticker: string;
  direction: "LONG" | "SHORT" | "PASS";
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  hold_duration: "DAY" | "SWING" | "POSITION";
  confidence_score: number;
  reasoning_summary: string;
  thesis_bullets: string[];
  risk_flags: string[];
  signal_types: string[];
  sector: string | null;
  sources_used: {
    type: string;
    provider: string;
    title: string;
    url?: string | null;
    published_at?: string | null;
  }[];
  model_used: string;
};

type RunResponse = {
  run_id: string;
  theses: ThesisOutput[];
  tickers_researched: number;
  tickers_passed: number;
  total_tokens: number;
  duration_seconds: number;
  source: "AGENT" | "MANUAL";
};

export async function triggerResearchRun(
  userId: string,
  tickers: string[],
  source: "AGENT" | "MANUAL" = "AGENT"
): Promise<{ thesisIds: string[]; tradeIds: string[]; error?: string }> {
  if (!PYTHON_SERVICE_URL) {
    return { thesisIds: [], tradeIds: [], error: "PYTHON_SERVICE_URL not configured" };
  }

  // Load agent config for this user (fall back to defaults if none)
  const agentConfig = await prisma.agentConfig
    .findUnique({ where: { userId } })
    .catch(() => null);

  const agentConfigPayload = agentConfig ?? {
    minConfidence: 70,
    directionBias: "BOTH",
    holdDurations: ["SWING"],
    maxOpenPositions: 5,
    maxPositionSize: 500,
  };

  // Call Python service
  let data: RunResponse;
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/research/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Secret": PYTHON_SERVICE_SECRET,
      },
      body: JSON.stringify({ tickers, source, agent_config: agentConfigPayload }),
      signal: AbortSignal.timeout(120_000), // 2 min total budget
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        thesisIds: [],
        tradeIds: [],
        error: `Python service error ${res.status}: ${text}`,
      };
    }
    data = (await res.json()) as RunResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { thesisIds: [], tradeIds: [], error: `Network error: ${message}` };
  }

  // Persist results
  const thesisIds: string[] = [];
  const tradeIds: string[] = [];
  const minConfidence = (agentConfig?.minConfidence ?? 70) as number;

  // Create one ResearchRun for the whole batch
  const researchRun = await prisma.researchRun.create({
    data: {
      userId,
      source,
      status: "COMPLETE",
      parameters: agentConfigPayload as object,
      completedAt: new Date(),
    },
  });

  for (const thesis of data.theses) {
    const row = await prisma.thesis.create({
      data: {
        researchRunId: researchRun.id,
        userId,
        ticker: thesis.ticker,
        source,
        direction: thesis.direction,
        entryPrice: thesis.entry_price,
        targetPrice: thesis.target_price,
        stopLoss: thesis.stop_loss,
        holdDuration: thesis.hold_duration,
        confidenceScore: thesis.confidence_score,
        reasoningSummary: thesis.reasoning_summary,
        thesisBullets: thesis.thesis_bullets,
        riskFlags: thesis.risk_flags,
        signalTypes: thesis.signal_types,
        sector: thesis.sector,
        sourcesUsed: thesis.sources_used as object,
        modelUsed: thesis.model_used,
      },
    });
    thesisIds.push(row.id);

    // Create a Trade for non-PASS theses above the confidence threshold
    if (thesis.direction !== "PASS" && thesis.confidence_score >= minConfidence) {
      if (thesis.entry_price != null) {
        const trade = await prisma.trade.create({
          data: {
            thesisId: row.id,
            userId,
            ticker: thesis.ticker,
            direction: thesis.direction as "LONG" | "SHORT",
            status: "OPEN",
            entryPrice: thesis.entry_price,
            shares: Math.floor(
              ((agentConfig?.maxPositionSize ?? 500) as number) / thesis.entry_price
            ),
            targetPrice: thesis.target_price,
            stopLoss: thesis.stop_loss,
            exitStrategy: "PRICE_TARGET",
          },
        });
        tradeIds.push(trade.id);

        await prisma.tradeEvent.create({
          data: {
            tradeId: trade.id,
            eventType: "PLACED",
            description: `Trade placed via ${source.toLowerCase()} research run`,
            priceAt: thesis.entry_price,
          },
        });
      }
    }
  }

  return { thesisIds, tradeIds };
}
