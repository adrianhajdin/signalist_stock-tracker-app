/**
 * Tool registry — single export point for all agent tools.
 *
 * All 16 tools live in individual defineTool() files in this directory.
 * createResearchTools() assembles them for the unified route and crons.
 */

import type { AlpacaCredentials } from "@/lib/alpaca";
import type { IntelligencePolicy } from "@/lib/intelligence/types";

import { getMarketContext } from "./get-market-context";
import { getStockData } from "./get-stock-data";
import { getEarningsData } from "./get-earnings-data";
import { getOptionsFlow } from "./get-options-flow";
import { getSecFilings } from "./get-sec-filings";
import { readMorningBrief } from "./read-morning-brief";
import { readSignals } from "./read-signals";
import { readArtifact } from "./read-artifact";
import { webSearch } from "./web-search";
import { recordThesis } from "./record-thesis";
import { placeTrade } from "./place-trade";
import { closePosition } from "./close-position";
import { managePosition } from "./manage-position";
import { recordRunSummary } from "./record-run-summary";
import { completeRun } from "./complete-run";
import { manageWatchlist } from "./manage-watchlist";
import { getPortfolioContext } from "./get-portfolio-context";
import { readKnowledgeLibrary } from "./read-knowledge-library";
import { askQuestion } from "./ask-question";
import { discoverSignalsForFence } from "./discover-signals-for-fence";
import { readAnalystInboxStats } from "./read-analyst-inbox-stats";

interface ToolCtx {
  runId: string;
  userId: string;
  analystId?: string;
  watchlist?: string[];
  /** Open-position tickers (status=OPEN) for the analyst — fence bypass. */
  positionTickers?: string[];
  exclusionList?: string[];
  sectors?: string[];
  // ── Universe (B1) ──────────────────────────────────────────────────
  industries?: string[];
  themes?: string[];
  marketCapMin?: number | null;
  marketCapMax?: number | null;
  maxPositionSize?: number;
  maxOpenPositions?: number;
  /** Min thesis confidence (0-100) required for place_trade — enforced. */
  minConfidence?: number;
  alpacaCreds?: AlpacaCredentials;
  intelligencePolicy?: IntelligencePolicy;
}

export function createResearchTools(ctx: ToolCtx) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newCtx: any = { ...ctx, groupId: (phase: string) => phase };

  const toolsBase = {
    get_market_context: getMarketContext(newCtx),
    get_stock_data: getStockData(newCtx),
    get_earnings_data: getEarningsData(newCtx),
    get_options_flow: getOptionsFlow(newCtx),
    get_sec_filings: getSecFilings(newCtx),
    read_morning_brief: readMorningBrief(newCtx),
    read_signals: readSignals(newCtx),
    read_artifact: readArtifact(newCtx),
    web_search: webSearch(newCtx),
    record_thesis: recordThesis(newCtx),
    place_trade: placeTrade(newCtx),
    close_position: closePosition(newCtx),
    manage_position: managePosition(newCtx),
    get_portfolio_context: getPortfolioContext(newCtx),
    record_run_summary: recordRunSummary(newCtx),
    complete_run: completeRun(newCtx),
    manage_watchlist: manageWatchlist(newCtx),
    read_knowledge_library: readKnowledgeLibrary(newCtx),
    ask_question: askQuestion(newCtx),
    discover_signals_for_fence: discoverSignalsForFence(newCtx),
    read_analyst_inbox_stats: readAnalystInboxStats(newCtx),
  };

  // Backward-compat aliases for old persisted RunMessages
  const tools = toolsBase as Record<string, unknown>;
  tools.show_thesis = toolsBase.record_thesis;
  tools.summarize_run = toolsBase.complete_run;

  return toolsBase as typeof toolsBase & {
    show_thesis: typeof toolsBase.record_thesis;
    summarize_run: typeof toolsBase.complete_run;
  };
}

// ── Individual tool exports ────────────────────────────────────────────────────
export { getMarketContext } from "./get-market-context";
export { getStockData } from "./get-stock-data";
export { getEarningsData } from "./get-earnings-data";
export { getOptionsFlow } from "./get-options-flow";
export { getSecFilings } from "./get-sec-filings";
export { readMorningBrief } from "./read-morning-brief";
export { readSignals } from "./read-signals";
export { readArtifact } from "./read-artifact";
export { webSearch } from "./web-search";
export { recordThesis } from "./record-thesis";
export { placeTrade } from "./place-trade";
export { closePosition } from "./close-position";
export { managePosition } from "./manage-position";
export { getPortfolioContext } from "./get-portfolio-context";
export { recordRunSummary } from "./record-run-summary";
export { completeRun } from "./complete-run";
export { manageWatchlist } from "./manage-watchlist";
export { readKnowledgeLibrary } from "./read-knowledge-library";
export { askQuestion } from "./ask-question";
export { discoverSignalsForFence } from "./discover-signals-for-fence";
export { readAnalystInboxStats } from "./read-analyst-inbox-stats";
