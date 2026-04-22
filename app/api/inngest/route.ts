import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { priceMonitor } from "@/lib/inngest/functions/price-monitor";
import { reconcileOrders } from "@/lib/inngest/functions/reconcile-orders";
import { evaluateTrade } from "@/lib/inngest/functions/trade-evaluator";
import { morningResearch } from "@/lib/inngest/functions/morning-research";
import { eodEvaluation } from "@/lib/inngest/functions/eod-evaluation";
import { weeklyDigest } from "@/lib/inngest/functions/weekly-digest";
import { accuracyScorer } from "@/lib/inngest/functions/accuracy-scorer";
// V3 Intelligence Layer
import { firmMarketSweep } from "@/lib/inngest/functions/firm-market-sweep";
import { portfolioWatchlistMonitor } from "@/lib/inngest/functions/portfolio-watchlist-monitor";
import { domainMonitor } from "@/lib/inngest/functions/domain-monitor";
import { signalRouter } from "@/lib/inngest/functions/signal-router";
import { morningBriefGenerator } from "@/lib/inngest/functions/morning-brief-generator";
import { backfillSignalFingerprint } from "@/lib/inngest/functions/backfill-signal-fingerprint";

// morning-research runs a full agent (generateText with 30 tool steps)
// inside a single step.run — needs extended timeout to avoid Vercel killing it
export const maxDuration = 300; // 5 min — covers multi-step agent runs

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Existing
    priceMonitor,
    reconcileOrders,
    evaluateTrade,
    morningResearch,
    eodEvaluation,
    weeklyDigest,
    accuracyScorer,
    // V3 Intelligence (run in order: 6:30 → 7:00 → 7:15 → 7:30 → 7:45 → 8:00 analyst runs)
    firmMarketSweep,
    portfolioWatchlistMonitor,
    domainMonitor,
    signalRouter,
    morningBriefGenerator,
    // One-shot Session 2 backfill (event-triggered, idempotent)
    backfillSignalFingerprint,
  ],
});
