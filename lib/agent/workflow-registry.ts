// ── Workflow Registry ──────────────────────────────────────────────────────
// Single source of truth for Hindsight's operational flow.
// 5 teams, each with sub-steps and tools. Powers both the /agent-workflow
// page (full flow) and each page's HowItWorksSheet (single team).

import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  Radar,
  Search,
  BarChart3,
  RotateCcw,
  Bot,
  Newspaper,
  Globe,
  Target,
  ShoppingCart,
  Eye,
  CheckCircle2,
  Brain,
  FileText,
  Clock,
  Wrench,
  LineChart,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export type ResourceType = "api" | "website" | "db" | "internal";

export interface Resource {
  /** Provider key for icon */
  source: string;
  title: string;
  description: string;
  type: ResourceType;
  /** Endpoint path, function name, or URL */
  endpointOrPath: string;
  /** Human-readable example output */
  exampleOutput?: string;
  notes?: string[];
}

export interface ToolEntry {
  /** Machine name (e.g. "get_stock_data") or display name (e.g. "Perplexity Sonar") */
  name: string;
  /** Provider key for icon badge */
  provider: string;
  /** One sentence */
  summary: string;
  /** Optional detailed resources — powers the tool detail dialog */
  resources?: Resource[];
}

export interface SubStep {
  title: string;
  /** One sentence */
  summary: string;
  /** Optional time label (e.g. "6:30 AM") */
  time?: string;
}

export type TeamId =
  | "builder"
  | "intelligence"
  | "agent"
  | "briefing"
  | "evaluation";

export interface Team {
  id: TeamId;
  title: string;
  /** 1-2 sentences — shown on workflow page rows */
  summary: string;
  /** 3-5 sentences — shown in the sheet */
  description: string;
  icon: LucideIcon;
  /** Model used, if any */
  model?: string;
  /** When this team runs */
  schedule: string;
  substeps: SubStep[];
  tools: ToolEntry[];
  /** If this team has a system prompt, lazy-load it */
  getPrompt?: () => Promise<string>;
  /** Source file for the prompt (shown as reference if getPrompt is not available) */
  promptSource?: string;
}

// ── Shared tools (referenced by multiple teams) ──────────────────────────

const TOOL_GET_MARKET_CONTEXT: ToolEntry = {
  name: "get_market_context", provider: "finnhub", summary: "SPY, VIX, sector ETFs, macro events, regime classification.",
  resources: [
    { source: "finnhub", title: "Index & sector quotes", description: "SPY, VIX, and 11 sector ETFs in a single batch.", type: "api", endpointOrPath: "/quote?symbol=SPY,^VIX,XLK,...", exampleOutput: "SPY $542.31 +0.8% · VIX 14.2 · XLK +1.2% (leading)" },
    { source: "finnhub", title: "Broad market trend", description: "30 days of SPY candles to determine uptrend/downtrend.", type: "api", endpointOrPath: "/stock/candle?symbol=SPY&resolution=D", exampleOutput: "SPY above SMA-20 ($538.50) → uptrend" },
    { source: "finnhub", title: "Earnings density", description: "How many companies report this week.", type: "api", endpointOrPath: "/calendar/earnings", exampleOutput: "47 companies reporting — elevated density" },
    { source: "fmp", title: "Economic calendar", description: "Major macro events today — Fed, CPI, jobs.", type: "api", endpointOrPath: "/economic_calendar", exampleOutput: "CPI release 8:30 AM (high impact)" },
  ],
};

const TOOL_GET_STOCK_DATA: ToolEntry = {
  name: "get_stock_data", provider: "finnhub", summary: "Price, profile, financials, technicals, consensus, news for one ticker.",
  resources: [
    { source: "finnhub", title: "Live price", description: "Current price, change, and day range.", type: "api", endpointOrPath: "/quote?symbol={ticker}", exampleOutput: "NVDA $134.23 +2.1%" },
    { source: "finnhub", title: "Company profile", description: "Name, sector, market cap, exchange.", type: "api", endpointOrPath: "/stock/profile2?symbol={ticker}", exampleOutput: "NVIDIA Corp · Technology · $3.3T" },
    { source: "finnhub", title: "Key financials", description: "P/E, P/B, beta, 52W range, EPS.", type: "api", endpointOrPath: "/stock/metric?symbol={ticker}&metric=all", exampleOutput: "P/E 65.2 · Beta 1.68 · 52W $75–$153" },
    { source: "finnhub", title: "Recent headlines", description: "5 most recent news articles.", type: "api", endpointOrPath: "/company-news?symbol={ticker}", exampleOutput: "\"NVIDIA Announces Blackwell GPUs\" — Reuters" },
    { source: "finnhub", title: "Wall Street consensus", description: "Buy/Hold/Sell analyst ratings.", type: "api", endpointOrPath: "/stock/recommendation?symbol={ticker}", exampleOutput: "Strong Buy: 38 · Buy: 6 · Hold: 3" },
    { source: "finnhub", title: "Technical setup", description: "RSI, SMAs, volume, 52W position, trend.", type: "api", endpointOrPath: "/stock/candle?symbol={ticker}&resolution=D", exampleOutput: "RSI 58 · Above SMA-20 · Volume 1.3x avg", notes: ["60 days of daily data", "Falls back to FMP/Alpaca"] },
    { source: "fmp", title: "Price targets", description: "Wall Street average/high/low targets.", type: "api", endpointOrPath: "/v4/price-target-consensus?symbol={ticker}", exampleOutput: "Avg $158 · High $200 · Low $120 · 44 analysts" },
  ],
};

const TOOL_GET_EARNINGS_DATA: ToolEntry = {
  name: "get_earnings_data", provider: "finnhub", summary: "Next report date, EPS estimates, beat rate track record.",
  resources: [
    { source: "finnhub", title: "Next report date", description: "When, before/after market, EPS/rev estimates.", type: "api", endpointOrPath: "/calendar/earnings?symbol={ticker}", exampleOutput: "Reports Mar 26 AMC · EPS est $0.84" },
    { source: "finnhub", title: "Track record", description: "Last 8 quarters actual vs expected.", type: "api", endpointOrPath: "/stock/earnings?symbol={ticker}&limit=8", exampleOutput: "Beat rate 87.5% (7/8) · Last Q +5.9%" },
  ],
};

const TOOL_GET_SEC_FILINGS: ToolEntry = {
  name: "get_sec_filings", provider: "sec", summary: "Recent SEC filings — 10-K, 10-Q, 8-K, Form 4.",
  resources: [
    { source: "sec", title: "Company lookup", description: "Finds SEC CIK identifier.", type: "api", endpointOrPath: "sec.gov/files/company_tickers.json", exampleOutput: "NVDA → CIK 0001045810" },
    { source: "sec", title: "Recent filings", description: "Last 8 filings — annuals, quarterlies, material events, insider trades.", type: "api", endpointOrPath: "data.sec.gov/submissions/CIK{cik}.json", exampleOutput: "8-K Mar 15 · Form 4 — insider sale 50K shares" },
  ],
};

// ── Teams ──────────────────────────────────────────────────────────────────

export const TEAMS: Team[] = [
  // ─── 1. Analyst Builder ────────────────────────────────────────────────
  {
    id: "builder",
    title: "Analyst Builder",
    summary:
      "Creates and edits analyst personas through AI conversation. Researches live market data to propose a complete strategy, watchlist, and intelligence setup.",
    description:
      "You describe your trading style in conversation — sectors, risk appetite, patterns that catch your eye. The AI builder (GPT-4o) researches live market data using 4 tools before proposing anything. It creates a complete analyst: strategy document, trading parameters, watchlist, domain monitors, search monitors, and intelligence policy. Everything appears in a side panel for review. The editor uses the same experience for modifying existing analysts.",
    icon: Sparkles,
    model: "GPT-4o",
    schedule: "On demand",
    substeps: [
      { title: "Understand vision", summary: "You describe trading interests, sectors, and risk appetite in conversation." },
      { title: "Research market", summary: "Builder pulls live market data to ground its suggestions in reality." },
      { title: "Craft strategy", summary: "Writes a 3-5 paragraph strategy document — the analyst's playbook." },
      { title: "Configure parameters", summary: "Sets direction bias, hold durations, confidence threshold, position sizing, sectors." },
      { title: "Propose monitors", summary: "Creates 4-6 domain monitors and 3-5 search monitors for the intelligence pipeline." },
      { title: "Review & create", summary: "Full config appears in a side panel. Iterate via chat, then click Create." },
    ],
    tools: [
      TOOL_GET_MARKET_CONTEXT,
      TOOL_GET_STOCK_DATA,
      TOOL_GET_EARNINGS_DATA,
      TOOL_GET_SEC_FILINGS,
      { name: "suggest_config", provider: "internal", summary: "Outputs the complete analyst configuration for review." },
    ],
    getPrompt: () => import("@/lib/agent/builder-prompt-template").then((m) => m.BUILDER_PROMPT_TEMPLATE),
    promptSource: "lib/agent/modes.ts → BUILDER_SYSTEM_PROMPT",
  },

  // ─── 2. Intelligence Pipeline ──────────────────────────────────────────
  {
    id: "intelligence",
    title: "Intelligence Pipeline",
    summary:
      "Five background jobs run every weekday morning. Gathers market news, checks tracked sources, routes findings, and writes morning briefs.",
    description:
      "Before analysts wake up, 5 background jobs gather market intelligence. Search monitors run custom queries via Perplexity Sonar. Ticker monitors check every open position and watchlist item. Domain monitors check tracked websites and extract full articles via Firecrawl. The signal router scores and routes findings to relevant analysts (+40 ticker, +20 sector, +15 theme). Finally, GPT-4o synthesizes each analyst's routed findings into a structured morning brief with market context, portfolio alerts, new opportunities, and risk flags.",
    icon: Radar,
    schedule: "6:30–7:45 AM ET weekdays",
    substeps: [
      { title: "Search monitors", time: "6:30 AM", summary: "Runs all search queries via Perplexity Sonar. Fetches FMP market movers and Finnhub earnings calendar." },
      { title: "Ticker monitors", time: "7:00 AM", summary: "Searches for news on every open position and watchlist ticker. Deduplicates across analysts." },
      { title: "Domain monitors", time: "7:15 AM", summary: "Checks tracked websites via domain-filtered Sonar. Extracts full articles via Firecrawl for high-priority sources." },
      { title: "Signal router", time: "7:30 AM", summary: "Scores findings against each analyst (+40 ticker, +20 sector, +15 theme, +15/+10 urgency). Routes at threshold 15." },
      { title: "Morning brief", time: "7:45 AM", summary: "GPT-4o synthesizes routed findings into a brief: market context, portfolio alerts, watchlist updates, opportunities, risk flags." },
    ],
    tools: [
      {
        name: "Perplexity Sonar", provider: "perplexity", summary: "Real-time web search for news, analysis, and press releases.",
        resources: [
          { source: "perplexity", title: "Web search", description: "Domain-filtered or open web search via Sonar API.", type: "api", endpointOrPath: "searchSignals(query, { recency: 'day' })", exampleOutput: "5 results · sentiment: bullish · urgency: MEDIUM", notes: ["Returns up to 10 structured signals per search"] },
        ],
      },
      {
        name: "Firecrawl", provider: "firecrawl", summary: "Full-page article extraction from URLs found by Sonar.",
        resources: [
          { source: "firecrawl", title: "Page extraction", description: "Extracts full article as clean markdown.", type: "website", endpointOrPath: "extractPage(url)", exampleOutput: "2500 words extracted from Reuters article", notes: ["Stored as Artifact record with content hash dedup"] },
        ],
      },
      {
        name: "FMP Market Movers", provider: "fmp", summary: "Top gainers, losers, and most active stocks.",
        resources: [
          { source: "fmp", title: "Gainers", description: "Top 10 stocks by % gain today.", type: "api", endpointOrPath: "/stock_market/gainers", exampleOutput: "SMCI +12.3%, PLTR +8.1%, ..." },
          { source: "fmp", title: "Losers", description: "Top 10 stocks by % loss today.", type: "api", endpointOrPath: "/stock_market/losers" },
          { source: "fmp", title: "Most active", description: "Top 10 by volume today.", type: "api", endpointOrPath: "/stock_market/actives" },
        ],
      },
      {
        name: "Finnhub Earnings", provider: "finnhub", summary: "Earnings calendar for the next 7 days.",
        resources: [
          { source: "finnhub", title: "Earnings calendar", description: "Companies reporting in the next 7 days.", type: "api", endpointOrPath: "/calendar/earnings?from={today}&to={+7d}", exampleOutput: "NVDA Mar 26, AAPL Mar 28, ..." },
        ],
      },
      { name: "GPT-4o Brief Gen", provider: "internal", summary: "Synthesizes routed findings into structured analyst briefs." },
    ],
  },

  // ─── 3. Research Agent ─────────────────────────────────────────────────
  {
    id: "agent",
    title: "Research Agent",
    summary:
      "Runs structured research sessions in six stages: orient, research, theses, act, recap, complete. Reads intelligence, validates with live data, writes theses, manages positions, and executes paper trades.",
    description:
      "Each analyst runs as a GPT-4o agent with 17 tools and a 30-step budget. Before the first tool call, the system loads full context: strategy rules, portfolio with live P&L, watchlist, prior briefing, trade history, accuracy stats, and self-calibration data (signal win rates, confidence buckets). The agent follows a six-stage flow — Orient (read pre-gathered intelligence), Research (get_portfolio_context for live P&L + get_stock_data on triaged tickers), Theses (record a LONG/SHORT/PASS verdict for every researched ticker), Act (manage existing positions via manage_position, open new ones via place_trade, update watchlist), Recap (record_run_summary), Complete (complete_run). Runs happen weekdays at 8 AM (automated) or on demand (live streaming).",
    icon: Bot,
    model: "GPT-4o",
    schedule: "8:00 AM ET weekdays + on demand",
    substeps: [
      { title: "Portfolio check-in", summary: "Acknowledges open positions and watchlist items, references prior brief's watch-tomorrow triggers. Plain text — no tools." },
      { title: "Stage 1 — Orient", summary: "Reads morning brief, routed signals, and any artifacts that warrant a deep read. Falls back to live market context only if no brief is available." },
      { title: "Stage 2 — Research", summary: "Calls get_portfolio_context first (live P&L, days held, distance from peak, thesis context), then get_stock_data on triaged tickers. Holdings, watchlist items, and 2-4 new opportunities. Batches multiple calls per step." },
      { title: "Stage 3 — Theses", summary: "Writes a thesis (LONG / SHORT / PASS) for every researched ticker, back to back. Prior theses for the same ticker are auto-superseded." },
      { title: "Stage 4 — Act", summary: "Executes decisions: close/manage existing positions first (close_position or manage_position), then place_trade for new entries, then manage_watchlist for adds/removes." },
      { title: "Stage 5 — Recap", summary: "Calls record_run_summary with ranked picks (every researched ticker with the action that actually happened) and exposure breakdown." },
      { title: "Stage 6 — Complete", summary: "Calls complete_run with no arguments. Marks the run complete and triggers the briefing agent which writes tomorrow's standup automatically." },
    ],
    tools: [
      // Intelligence (Stage 1)
      { name: "read_morning_brief", provider: "internal", summary: "Pre-generated intelligence brief with market context, alerts, and opportunities." },
      { name: "read_signals", provider: "internal", summary: "Findings routed by background jobs, filtered by tickers/themes/urgency." },
      { name: "read_artifact", provider: "internal", summary: "Full extracted article content behind a signal (up to 4,000 chars)." },
      { name: "web_search", provider: "perplexity", summary: "Live Perplexity Sonar search for breaking news or niche topics (budget-limited).",
        resources: [{ source: "perplexity", title: "Sonar web search", description: "Real-time web search with recency filtering.", type: "api", endpointOrPath: "searchSignals(query, { recency })", exampleOutput: "5 results · sentiment: bullish · urgency: MEDIUM", notes: ["Budget: max 5 searches per run (configurable)"] }],
      },
      TOOL_GET_MARKET_CONTEXT,
      // Research (Stage 2)
      { name: "get_portfolio_context", provider: "internal", summary: "Live portfolio snapshot: P&L %, days held, distance from peak price, original thesis reasoning. Called at start of every research stage." },
      TOOL_GET_STOCK_DATA,
      {
        name: "get_options_flow", provider: "fmp", summary: "Put/call ratio, unusual contracts, institutional positioning.",
        resources: [{ source: "fmp", title: "Options chain analysis", description: "P/C ratio, unusual volume/OI contracts, premium flags.", type: "api", endpointOrPath: "/options/chain/{ticker}", exampleOutput: "P/C 0.65 (bullish) · 3 unusual contracts", notes: ["Flags vol/OI ≥ 5x or premium ≥ $500K"] }],
      },
      TOOL_GET_EARNINGS_DATA,
      TOOL_GET_SEC_FILINGS,
      // Decision (Stage 3)
      { name: "record_thesis", provider: "internal", summary: "Records LONG/SHORT/PASS verdict with confidence, targets, reasoning. Auto-supersedes any prior active thesis for the same ticker." },
      // Execution (Stage 4)
      {
        name: "place_trade", provider: "alpaca", summary: "Places a paper market order on Alpaca. Waits for fill.",
        resources: [
          { source: "alpaca", title: "Submit order", description: "Market buy/sell at current price.", type: "api", endpointOrPath: "placeMarketOrder({ symbol, qty, side })", exampleOutput: "BUY 74 shares NVDA @ $134.23" },
          { source: "alpaca", title: "Confirm fill", description: "Waits up to 5s for fill confirmation.", type: "api", endpointOrPath: "getOrder(orderId)", exampleOutput: "FILLED · Avg $134.23" },
          { source: "internal", title: "Record position", description: "Saves position, logs trade decision, graduates watchlist items.", type: "db", endpointOrPath: "prisma.position.create()", notes: ["Blocks duplicate positions in same ticker"] },
        ],
      },
      {
        name: "close_position", provider: "alpaca", summary: "Closes a full position with exit reason and realized P&L. Use manage_position for partial exits or target/stop updates.",
        resources: [
          { source: "alpaca", title: "Sell all shares", description: "Closes the full position.", type: "api", endpointOrPath: "closeOpenPosition(symbol)", exampleOutput: "Closed 50 AAPL @ $192.40 · +$710 (+7.9%)" },
          { source: "internal", title: "Record outcome", description: "Marks position closed with P&L and reason.", type: "db", endpointOrPath: "prisma.position.update({ CLOSED })", exampleOutput: "EXIT: TARGET · WIN · +$710" },
        ],
      },
      { name: "manage_position", provider: "alpaca", summary: "Nuanced position management: partial_close, update_targets, move_stop_to_breakeven, set_trailing_stop, add_to_position. Every action is audit-logged with a required reason string." },
      { name: "manage_watchlist", provider: "internal", summary: "Adds/updates/removes watchlist items with priority and catalysts." },
      // Run lifecycle (Stages 5–6)
      { name: "record_run_summary", provider: "internal", summary: "Structured per-ticker recap: ranked picks + exposure breakdown. Pure data." },
      { name: "complete_run", provider: "internal", summary: "No-args. Marks the run complete in the DB and triggers the briefing agent. Always the agent's final tool call." },
    ],
    getPrompt: () => import("@/lib/agent/system-prompt-template").then((m) => m.SYSTEM_PROMPT_TEMPLATE),
    promptSource: "lib/agent/system-prompt-template.ts",
  },

  // ─── 4. Briefing Agent ─────────────────────────────────────────────────
  {
    id: "briefing",
    title: "Briefing Agent",
    summary:
      "When the research agent calls complete_run, a GPT-4o reviewer generates a standup memo inline — the analyst's memory for the next run.",
    description:
      "Called directly by the complete_run tool at the end of every research session. When the research agent finishes its work and calls complete_run, that tool marks the run COMPLETE and then immediately calls the briefing agent inline — no events, no queues. A GPT-4o agent reads the full conversation transcript, portfolio state, and trade outcomes. It writes a structured standup: narrative (400-600 words), strategy notes, market posture, watch-tomorrow items, unresolved items, self-corrections, and 0-5 dynamic search monitors. The standup feeds into the next session's system prompt. The analyst references watch-tomorrow items in their portfolio check-in before Stage 1. Dynamic monitors are picked up by the next morning's intelligence sweep automatically.",
    icon: RotateCcw,
    model: "GPT-4o",
    schedule: "After every run",
    substeps: [
      { title: "Mark complete", summary: "complete_run tool marks the run COMPLETE, then immediately calls the briefing agent inline. No events or queues." },
      { title: "Read transcript", summary: "Reads the full conversation — every message, tool call, and result from the session." },
      { title: "Review portfolio", summary: "Checks current positions with unrealized P&L, trade outcomes, and pass decisions." },
      { title: "Write standup", summary: "Produces narrative, strategy notes, market posture, watch-tomorrow items, and self-corrections." },
      { title: "Create monitors", summary: "Generates 0-5 temporary search monitors with expiration dates for next morning's sweep." },
    ],
    tools: [
      { name: "Conversation transcript", provider: "internal", summary: "Full research session messages, tool calls, and results (~12k chars).",
        resources: [{ source: "internal", title: "Run messages", description: "Complete conversation persisted to RunMessage table.", type: "db", endpointOrPath: "prisma.runMessage.findMany({ runId })", exampleOutput: "47 messages · 12 tool calls · 28k tokens" }],
      },
      { name: "Portfolio state", provider: "internal", summary: "Open positions, unrealized P&L, capital deployed, win rate.",
        resources: [{ source: "internal", title: "Portfolio snapshot", description: "Current positions with live P&L and exposure breakdown.", type: "db", endpointOrPath: "prisma.position.findMany({ status: OPEN })", exampleOutput: "3 positions · $9,870 deployed · 65% win rate" }],
      },
      { name: "GPT-4o Reviewer", provider: "internal", summary: "Writes an external review — not self-reported by the research agent.",
        resources: [{ source: "internal", title: "Standup generation", description: "Structured output: narrative, strategy notes, posture, watch items, corrections, dynamic monitors.", type: "internal", endpointOrPath: "generateObject({ schema: standupSchema })", exampleOutput: "Narrative: 450 words · 3 watch items · 1 dynamic monitor" }],
      },
    ],
    getPrompt: () => import("@/lib/agent/briefing-prompt-template").then((m) => m.BRIEFING_PROMPT_TEMPLATE),
    promptSource: "lib/agent/update-analyst-briefing.ts",
  },

  // ─── 5. Evaluation ─────────────────────────────────────────────────────
  {
    id: "evaluation",
    title: "Evaluation & Tracking",
    summary:
      "Background jobs that monitor positions hourly, evaluate closed trades, snapshot EOD prices, and score accuracy weekly.",
    description:
      "Four background jobs track analyst performance. The price monitor checks all open positions hourly via Alpaca and flags positions near their target (80%) or stop-loss. When a position closes, a GPT-4o evaluator reviews the trade — was the thesis correct? What lesson should the analyst learn? Every trading day at 4 PM, an EOD snapshot captures closing prices for the equity curve. Every Sunday at 10 AM, an accuracy scorer calculates win rate, confidence calibration, and per-sector performance. The analyst sees these stats at the start of every run.",
    icon: BarChart3,
    schedule: "Hourly / EOD / Weekly",
    substeps: [
      { title: "Price monitor", time: "Hourly", summary: "Checks all open positions via Alpaca. Flags positions near target (80%) or stop-loss." },
      { title: "Trade evaluator", time: "On close", summary: "GPT-4o reviews each closed trade — was the thesis correct? What's the lesson?" },
      { title: "EOD snapshot", time: "5 PM ET", summary: "Captures closing prices for all positions. Builds the equity curve." },
      { title: "Accuracy scorer", time: "Sunday 10 AM", summary: "Calculates win rate, confidence calibration, and per-sector performance." },
    ],
    tools: [
      { name: "Alpaca Prices", provider: "alpaca", summary: "Live and closing prices for all open positions.",
        resources: [{ source: "alpaca", title: "Latest prices", description: "Batch price lookup for all open positions.", type: "api", endpointOrPath: "getLatestPrices(symbols)", exampleOutput: "NVDA $134.23 · AAPL $192.40 · AMD $178.50" }],
      },
      { name: "GPT-4o Evaluator", provider: "internal", summary: "Post-trade analysis: thesis accuracy, timing, lessons learned.",
        resources: [{ source: "internal", title: "Trade review", description: "Evaluates thesis correctness, entry/exit timing, and writes lessons.", type: "internal", endpointOrPath: "generateObject({ schema: evaluationSchema })", exampleOutput: "Thesis: CORRECT · Timing: EARLY · Lesson: wait for confirmation" }],
      },
      { name: "GPT-4o Scorer", provider: "internal", summary: "Weekly calibration: does confidence predict actual win rate?",
        resources: [{ source: "internal", title: "Accuracy report", description: "Win rate, calibration analysis, per-sector breakdown.", type: "internal", endpointOrPath: "prisma.accuracyReport.create()", exampleOutput: "Win rate: 62% · Calibration: overconfident at 80%+ · Tech: strong" }],
      },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getTeam(id: TeamId): Team {
  return TEAMS.find((t) => t.id === id)!;
}

/** Which page maps to which team */
export const PAGE_TEAM_MAP: Record<string, TeamId> = {
  "/": "agent", // Dashboard — shows the full daily cycle
  "/analysts": "builder",
  "/analysts/new": "builder",
  "/runs": "agent",
  "/trades": "agent",
  "/performance": "evaluation",
  "/intelligence": "intelligence",
};

// ── Markdown export ────────────────────────────────────────────────────────

export function exportWorkflowAsMarkdown(): string {
  const lines: string[] = [
    "# Hindsight Workflow",
    "",
    "AI-powered paper trading platform. 5 teams work together in a daily loop.",
    "",
  ];

  for (const team of TEAMS) {
    lines.push(`## ${team.title}`);
    lines.push("");
    lines.push(`${team.summary}`);
    if (team.model) lines.push(`Model: ${team.model}`);
    lines.push(`Schedule: ${team.schedule}`);
    lines.push("");

    lines.push("### Steps");
    for (const step of team.substeps) {
      const time = step.time ? ` (${step.time})` : "";
      lines.push(`- **${step.title}**${time}: ${step.summary}`);
    }
    lines.push("");

    lines.push("### Tools");
    for (const tool of team.tools) {
      lines.push(`- **${tool.name}** [${tool.provider}]: ${tool.summary}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Tools Registry ──────────────────────────────────────────────────────────
// Single deduplicated list of all agent tools with categorization and
// per-agent assignments. Powers the /agent-workflow tools registry section.

export type ToolCategory = "intelligence" | "research" | "action" | "system";

export interface RegistryTool {
  name: string;
  category: ToolCategory;
  summary: string;
  providers: string[];
  /** Which team IDs have this tool active */
  agents: TeamId[];
  resources?: Resource[];
}

export const TOOL_REGISTRY: RegistryTool[] = [
  // ── Intelligence (Stage 1 — read pre-gathered data) ──────────────────
  {
    name: "read_morning_brief",
    category: "intelligence",
    summary: "Pre-generated intelligence brief with market context, portfolio alerts, watchlist updates, and new opportunities.",
    providers: ["internal"],
    agents: ["agent"],
  },
  {
    name: "read_signals",
    category: "intelligence",
    summary: "Signals routed by background discovery jobs, scored and filtered by ticker, sector, and theme relevance.",
    providers: ["internal"],
    agents: ["agent"],
  },
  {
    name: "read_artifact",
    category: "intelligence",
    summary: "Full extracted article content behind a signal — up to 4,000 chars of clean markdown from Firecrawl.",
    providers: ["internal"],
    agents: ["agent"],
  },
  {
    name: "web_search",
    category: "intelligence",
    summary: "Live Perplexity Sonar search for breaking news or niche topics. Budget-limited by intelligence policy.",
    providers: ["perplexity"],
    agents: ["agent"],
    resources: [{ source: "perplexity", title: "Sonar web search", description: "Real-time web search with recency filtering.", type: "api", endpointOrPath: "searchSignals(query, { recency })", exampleOutput: "5 results · sentiment: bullish · urgency: MEDIUM", notes: ["Budget: max 5 searches per run (configurable)"] }],
  },
  // ── Research (Stage 2 — live market data) ────────────────────────────
  {
    name: "get_market_context",
    category: "research",
    summary: "SPY, VIX, 11 sector ETFs, macro events, earnings density, and regime classification.",
    providers: ["finnhub", "fmp"],
    agents: ["builder", "agent"],
    resources: TOOL_GET_MARKET_CONTEXT.resources,
  },
  {
    name: "get_stock_data",
    category: "research",
    summary: "Quote, company profile, financials, technicals, analyst consensus, price targets, and news for one ticker.",
    providers: ["finnhub", "fmp"],
    agents: ["builder", "agent"],
    resources: TOOL_GET_STOCK_DATA.resources,
  },
  {
    name: "get_earnings_data",
    category: "research",
    summary: "Next report date, EPS estimates, and beat rate track record. Called only when earnings are within 2 weeks.",
    providers: ["finnhub"],
    agents: ["builder", "agent"],
    resources: TOOL_GET_EARNINGS_DATA.resources,
  },
  {
    name: "get_options_flow",
    category: "research",
    summary: "Put/call ratio, unusual contracts, and institutional positioning. Called only when unusual activity flagged.",
    providers: ["fmp"],
    agents: ["agent"],
    resources: [{ source: "fmp", title: "Options chain analysis", description: "P/C ratio, unusual volume/OI contracts, premium flags.", type: "api", endpointOrPath: "/options/chain/{ticker}", exampleOutput: "P/C 0.65 (bullish) · 3 unusual contracts", notes: ["Flags vol/OI ≥ 5x or premium ≥ $500K"] }],
  },
  {
    name: "get_sec_filings",
    category: "research",
    summary: "Recent SEC filings — 10-K, 10-Q, 8-K, Form 4. Called only when insider filing or material 8-K flagged.",
    providers: ["sec"],
    agents: ["builder", "agent"],
    resources: TOOL_GET_SEC_FILINGS.resources,
  },
  // ── Action (write/execute) ────────────────────────────────────────────
  {
    name: "record_thesis",
    category: "action",
    summary: "Records a LONG/SHORT/PASS verdict with confidence score, entry/target/stop prices, bullets, and reasoning.",
    providers: ["internal"],
    agents: ["agent"],
  },
  {
    name: "place_trade",
    category: "action",
    summary: "Places a paper market order on Alpaca. Waits for fill and records position + trade decision in DB.",
    providers: ["alpaca", "internal"],
    agents: ["agent"],
    resources: [
      { source: "alpaca", title: "Submit order", description: "Market buy/sell at current price.", type: "api", endpointOrPath: "placeMarketOrder({ symbol, qty, side })", exampleOutput: "BUY 74 shares NVDA @ $134.23" },
      { source: "alpaca", title: "Confirm fill", description: "Waits up to 5s for fill confirmation.", type: "api", endpointOrPath: "getOrder(orderId)", exampleOutput: "FILLED · Avg $134.23" },
      { source: "internal", title: "Record position", description: "Saves position, logs trade decision, graduates watchlist items.", type: "db", endpointOrPath: "prisma.position.create()", notes: ["Blocks duplicate positions in same ticker"] },
    ],
  },
  {
    name: "close_position",
    category: "action",
    summary: "Closes an existing open position via Alpaca. Records outcome with exit reason and realized P&L.",
    providers: ["alpaca", "internal"],
    agents: ["agent"],
    resources: [
      { source: "alpaca", title: "Sell all shares", description: "Closes the full position.", type: "api", endpointOrPath: "closeOpenPosition(symbol)", exampleOutput: "Closed 50 AAPL @ $192.40 · +$710 (+7.9%)" },
      { source: "internal", title: "Record outcome", description: "Marks position closed with P&L and reason.", type: "db", endpointOrPath: "prisma.tradeDecision.create({ SELL })", exampleOutput: "EXIT: TARGET · WIN · +$710" },
    ],
  },
  {
    name: "manage_watchlist",
    category: "action",
    summary: "Adds, updates, or removes watchlist items with priority, catalyst notes, and conviction level.",
    providers: ["internal"],
    agents: ["agent"],
  },
  {
    name: "suggest_config",
    category: "action",
    summary: "Outputs the complete analyst configuration for side-panel review. Used by builder and editor only.",
    providers: ["internal"],
    agents: ["builder"],
  },
  // ── System (run lifecycle) ────────────────────────────────────────────
  {
    name: "record_run_summary",
    category: "system",
    summary: "Structured per-ticker recap: ranked picks with actual actions taken, and portfolio exposure breakdown.",
    providers: ["internal"],
    agents: ["agent"],
  },
  {
    name: "complete_run",
    category: "system",
    summary: "No-args. Marks the run COMPLETE in DB and triggers the briefing agent inline. Always the final tool call.",
    providers: ["internal"],
    agents: ["agent"],
  },
];
