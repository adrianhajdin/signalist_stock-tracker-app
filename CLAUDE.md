## NEVER add custom classes to ShadCN components. Use them as-is with only variants and sizes. Do not override styling with className overrides.

# CLAUDE.md — Hindsight Trading Platform

## What This App Is
AI-powered paper trading simulator. An autonomous AI agent
researches stocks, generates trade theses, places paper trades
via Alpaca, tracks performance, and learns from results.
Built for one user now, marketed later.

## Stack — DO NOT DEVIATE
- Next.js App Router, TypeScript
- ShadCN + Tailwind CSS only for UI
- Supabase (Postgres + Auth + Realtime)
- Prisma ORM (v7 with adapter-pg)
- Inngest for background jobs and crons
- Vercel (Next.js only — no Railway)
- Vercel AI SDK v6 + AssistantUI (@assistant-ui/react)
- TradingView Lightweight Charts for price charts
- Recharts for performance/analytics charts

## Architecture — Agent + Intelligence Pipeline

### The Agent (what the "Run" button and morning cron both use)
- User clicks "Run" → POST /api/research/agent-run creates ResearchRun
- Redirects to /runs/[id] → renders AgentThread component
- AgentThread uses AI SDK v6 useChat → POST /api/agent/research-run
- GPT-4o (maxSteps 50, temperature 0.2) + 17 tools autonomously
  researches, generates theses, places trades via Alpaca
- Tools render via ToolCallGroup → ToolCallRow dispatching on result.ui
- All research persisted to DB via tool execute functions
- Morning cron (8 AM ET) runs same agent via generateText

## Universe (the analyst's discovery fence)
The "Universe" is the set of fields on AgentConfig that define what the
analyst will look at. Used by signal routing (filter signals into the
inbox) and by the agent (which discovery candidates are in-scope).

Universe fields on AgentConfig:
- `markets` — ["US_EQUITIES", "CRYPTO", "ETFS"]
- `exchanges` — ["NASDAQ", "NYSE"]
- `sectors` — broad GICS-style ["Technology", "Energy", ...]
- `industries` — narrower GICS ["Semiconductors", "Auto Manufacturers", ...]
- `themes` — analyst-defined ["AI infrastructure", "EV transition", "GLP-1", ...]
- `marketCapMin` / `marketCapMax` — BigInt? in dollars; null = no bound
- `exclusionList` — tickers/industries always skipped (hard reject)
- `tickerUniverse` — DIRECTED-mode seed list (separate concept, kept as-is)

Match semantics (signal routing): empty array / null numeric = no filter
on that dimension. AND across dimensions, OR within. exclusionList wins.
See docs/AGENT_OVERHAUL_PLAN.md → Workstream B for the full spec.

Routing output on AnalystSignalRoute (populated by Workstream A):
- `routeReasonCode` — "DISCOVERY" | "WATCHLIST" | "POSITION" | "DIRECT_TICKER"
  | "SECTOR_MATCH" | "INDUSTRY_MATCH" | "THEME_MATCH" | "CROSS_ANALYST"
- `matchedUniverse` Json — { sectors, industries, themes, inWatchlist,
  inPositions, fromAnalystId? }

### V3 Intelligence Pipeline (background, pre-run)
- 5 Inngest jobs run 6:30–7:45 AM ET before analysts wake up
- Firm market sweep: Perplexity Sonar + FMP movers + Finnhub earnings
- Portfolio/watchlist monitor: Sonar per-ticker searches
- Domain monitor: domain-filtered Sonar + Firecrawl extraction
- Signal router: scores and routes signals to analysts
- Morning brief generator: GPT-4o synthesizes per-analyst briefs
- Agent reads pre-gathered intelligence via read_morning_brief,
  read_signals, read_artifact tools instead of rediscovering

### Data Sources
- Finnhub: quotes, candles, earnings calendar, company metrics,
  news, recommendations (PRIMARY for all quote data)
- FMP: market movers (gainers/losers/actives), analyst targets,
  options chain, economic calendar
  NOTE: FMP /quote/ endpoint is DEPRECATED (403 on legacy plans).
- Alpaca: paper trade execution, order fill, position tracking
- Perplexity Sonar: web search for intelligence pipeline + agent
- Firecrawl: full-page extraction for artifacts
- SEC EDGAR: filings (10-K, 10-Q, 8-K, Form 4)

## Data Model (Prisma)
### Core
- AgentConfig — analyst persona config (name, analystPrompt,
  sectors, signals, confidence threshold, direction bias,
  hold durations, position sizing, watchlist, exclusionList,
  intelligencePolicy)
- ResearchRun — one execution; links to AgentConfig; status
  (RUNNING/COMPLETE/FAILED); parameters JSON snapshot
- RunEvent — SSE event from a run (type, title, message, payload)
- RunMessage — persisted AI SDK messages for run replay
- Thesis — stock analysis (direction, confidence, reasoning,
  bullets, risk flags, signal types, sourcesUsed, entry/target/stop)
- Position — paper position via Alpaca (symbol, direction, avgCost,
  qty, status, closePrice, outcome, agentEvaluation)
- PositionEvent — position lifecycle log (OPENED, PRICE_CHECK,
  NEAR_TARGET, CLOSED, EVALUATED)
- AccuracyReport — weekly per-analyst calibration
### Intelligence (V3)
- Monitor — unified tracked item (SEARCH/DOMAIN/API type, method,
  config JSON, scope, analyst link, lastRunAt)
- Signal — normalized evidence unit (headline, summary, tickers,
  themes, sentiment, urgency, sourceUrls)
- SignalBatch — groups signals by job run for dedup
- AnalystSignalRoute — signal→analyst routing with relevance score
- Artifact — extracted page content (markdown, summary, contentHash)
- MorningBrief — per-analyst daily brief (market context,
  portfolio alerts, watchlist updates, new opportunities, risk flags)

## Pages
- / (Dashboard) — MarketPulseStrip (Finnhub WebSocket), portfolio
  summary, Today's Picks, AgentActivityLog
- /analysts — analyst card grid with enable/disable toggles
- /analysts/new — AI-driven analyst creation (AnalystBuilderChat)
- /analysts/[id] — 2-col: Overview + config | floating editor chat;
  tabs for Runs and Trades
- /runs — research run feed with status dots, analyst names,
  thesis counts, logo stacks
- /runs/[id] — run detail with 2 render modes:
  - AgentThread (live agent, agentMode=true + RUNNING)
  - RunUnifiedChat (completed runs, events→chat)
- /trades — paper trade list with live P&L
- /performance — accuracy reports, win rate charts
- /stocks — stock search
- /stocks/[symbol] — TradingView chart + stock detail
- /intelligence — intelligence dashboard (signals, monitors, briefs,
  activity, manual job triggers)
- /agent-workflow — visual "How Hindsight Works" guide
- /settings — app settings

## API Routes
- /api/agent/[mode] — unified agent route (research-run, builder, editor)
  - research-run: GPT-4o, temperature 0.2, maxSteps 50, all 17 tools
  - builder: GPT-4o, research tools only + suggest_config
  - editor: GPT-4o, research tools only + suggest_config
- /api/research/agent-run — creates ResearchRun row, returns runId
- /api/research/trigger — Inngest manual trigger
- /api/chat/run-followup — post-run discussion with trade tools
- /api/agent-activity — dashboard activity stream
- /api/intelligence/* — signals, monitors, briefs, activity CRUD
- /api/quotes — Finnhub quote fallback
- /api/stocks/search — Finnhub symbol search
- /api/inngest — Inngest webhook handler

## Agent Tools — 17 tools (lib/agent/tools/)
Each tool is defined in its own file using `defineTool()` from
`lib/agent/define-tool.ts`. The factory wraps execute() in timing/
logging/try-catch and returns a `ToolResult<T>` envelope with a `ui`
discriminator that drives rendering in ToolCallRow.

### Intelligence Tools (read pre-gathered data)
1. read_morning_brief — today's pre-generated intelligence brief
2. read_signals — signals routed by background discovery jobs
3. read_artifact — full extracted article/document behind a signal
4. web_search — live Perplexity Sonar search (budget-limited)

### Research Tools (live data validation)
5. get_market_context — SPY/VIX/sector ETFs, macro events, regime
6. get_stock_data — quote + company profile + financials + technicals + news
7. get_earnings_data — earnings calendar, EPS, beat rate
8. get_options_flow — put/call ratio, unusual contracts
9. get_sec_filings — SEC EDGAR filings

### Action Tools
10. record_thesis — persist thesis to DB (LONG/SHORT/PASS)
11. place_trade — Alpaca market order, create Position
12. close_position — close an existing open position
    12b. manage_position — scale in/out, move stop, trail stop, adjust target (tool #17)
13. record_decision_plan — persist synthesis + planned actions
14. record_run_summary — persist HOLD decisions + run summary event
15. manage_watchlist — add/remove/update watchlist items
16. complete_run — mark run COMPLETE with ranked picks

## How to Add a New Agent Tool

1. **Create `lib/agent/tools/my-tool.ts`**
   ```ts
   import { z } from "zod";
   import { defineTool } from "@/lib/agent/define-tool";

   export const myTool = defineTool({
     description: "...",
     schema: z.object({ ticker: z.string() }),
     ui: "ticker",         // one of: generic | ticker | source | stock-card |
                           //   trade-card | thesis-card | portfolio |
                           //   decision-summary | config-preview
     groupId: "research",  // optional — groups tool calls visually in chat

     execute: async (args, ctx) => {
       // ctx: { runId, userId, analystId?, watchlist?, alpacaCreds?, ... }
       const data = await fetchSomething(args.ticker);
       return {
         summary: `Fetched ${args.ticker}`,   // shown in compact row
         data,                                  // drives the renderer
         sources: [],                           // optional ToolSource[]
       };
     },
   });
   ```

2. **Export from `lib/agent/tools/index.ts`**
   ```ts
   export { myTool } from "./my-tool";
   ```

3. **Register in `lib/agent/tools/index.ts`** (the `createResearchTools()` wrapper)
   ```ts
   import { myTool } from "@/lib/agent/tools/my-tool";
   // inside createResearchTools():
   my_tool: myTool(newCtx),
   ```

4. **Add to mode allowlist if needed** in `lib/agent/modes.ts`
   (builder/editor have restricted allowlists; research-run allows all)

5. **Wire a renderer if `ui` is new** in `components/agent/ToolCallRow.tsx`
   or pick an existing renderer from `components/agent/renderers/`

**ToolResult shape** (what the route streams, what renderers receive):
```ts
{ ok: true, ui, groupId?, summary, data, sources }  // success
{ ok: false, error, retryable, sources }             // failure
```

## Domain Components (components/domain/)
- ThesisCard / ThesisArtifactSheet — thesis display + detail sheet
- TradeCard / TradeConfirmation — trade display + pre-trade summary
- MarketContextCard — SPY/VIX/sector performance
- StockCard — quote + company profile
- ScanResultsCard — candidate ticker chip grid
- TechnicalCard — RSI/SMA/volume analysis
- EarningsCard — earnings calendar + EPS beats
- OptionsFlowCard — options flow summary
- NewsCard — news headlines + press releases
- SecFilingsCard — SEC filings list
- AnalystTargetsCard — analyst consensus targets
- PeersCard — peer company comparison
- RunSummaryCard — portfolio synthesis
- AgentConfigCard — analyst config summary

## Inngest Crons (lib/inngest/functions/)
### Intelligence Pipeline (6:30–7:45 AM ET Mon-Fri)
- firm-market-sweep.ts — 6:30 AM, Sonar + FMP movers + earnings
- portfolio-watchlist-monitor.ts — 7:00 AM, per-ticker Sonar
- domain-monitor.ts — 7:15 AM, domain Sonar + Firecrawl
- signal-router.ts — 7:30 AM, route signals to analysts
- morning-brief-generator.ts — 7:45 AM, GPT-4o per-analyst brief
### Agent + Trading
- morning-research.ts — 8 AM ET Mon-Fri, per-analyst agent run
- price-monitor.ts — hourly price check, exit evaluation
- trade-evaluator.ts — GPT-4o post-trade evaluation (on close)
- eod-evaluation.ts — end-of-day price snapshots
- weekly-digest.ts — Sunday 9 AM ET digest email
- accuracy-scorer.ts — Sunday 10 AM, weekly AccuracyReport

## Manifest UI Components (components/manifest-ui/)
External component library installed via `npx shadcn@latest add @manifest/<name>`.
All use semantic prop structure: data, actions, appearance, control.
- **XPost** — read-only social post card (Reddit/Twitter sentiment).
  Props: data.{author, username, avatar, content, time, likes, retweets, replies}.
  Avatar renders as letter circle. Stats are read-only spans (not buttons).
- **PostCard** — blog/news card with variants: default, compact, horizontal, covered.
  Props: data.post (Post type), appearance.variant, actions.onReadMore.
- **PostList** — wraps PostCard[] with layout variants: list, grid, carousel, fullwidth.
  Props: data.posts, appearance.{variant, columns, showAuthor, showCategory}.
  **Carousel** variant is the default for article lists in agent tool UIs.
- **ProductList** — product grid with variants: list, grid, carousel, picker.
- **OrderConfirm** — order confirmation card with product info + confirm button.
  Used for trade pending state in agent UI.
- **QuickReply** — pill-shaped quick reply buttons for chat follow-ups.
- **Types** in components/manifest-ui/types.ts: Post, Product, Option, OrderItem.

## AI Elements Components (components/ai-elements/)
Custom chain-of-thought and source display components:
- **Reasoning** — collapsible reasoning block (ReasoningTrigger + ReasoningContent)
- **Sources** — collapsible source list (SourcesTrigger + SourcesContent + Source)
- **ChainOfThought** — multi-step progress display with icons and status
  (ChainOfThoughtHeader, ChainOfThoughtStep, ChainOfThoughtContent,
  ChainOfThoughtSearchResults, ChainOfThoughtSearchResult)
- **Citation** — inline/chip source citation with favicon + domain

## Agent Run Flow (AgentThread)
The agent run page (`/runs/[id]`) renders via:
1. **page.tsx** checks `agentMode` + `RUNNING` → renders `<AgentThread>`
2. **AgentThread** connects to `/api/agent/research-run` via ChatRuntime
3. **ToolCallGroup** (registered as the ToolGroup slot in Thread) reads all
   tool-call parts from `useMessage`, groups by `result.groupId`, and renders
   each via **ToolCallRow** dispatching on `result.ui`. **Only 5 renderers exist**
   (see "Tool UI architecture" below):
   - `tool-ui` → **ToolUIRenderer** — the ONE generic renderer. ~90% of tools
     route here. Reads `data.items[]` where each item is either ticker-kind
     (logo + chip + text) or generic-kind (dot + text). No per-tool wrappers.
   - `thesis-card` → ThesisCardRenderer → full ThesisCard with sheet
   - `run-summary` → RunSummaryRenderer → ranked-picks DecisionSummaryCard
   - `config-preview` → ConfigPreviewRenderer (builder/editor diff view)
   - `ask-question` → AskQuestionRenderer (interactive QuickReply flow)
4. Extended thinking blocks render via **Reasoning** component (collapsible)
5. Quick replies appear after run completes via **FollowupQuickReplies**.
6. For COMPLETE runs, **RunUnifiedChat** renders synthesized events.

## Tool UI architecture
The primitive is `components/ai-elements/tool-progress.tsx` (`ToolProgress` +
`ToolProgressHeader` + `ToolProgressContent` + two item components:
`ToolProgressTickerItem` for ticker rows, `ToolProgressItem` for generic prose
rows). That's the "fake chain of thought" every tool row renders into.

**Tools return items[], the renderer just iterates.** Simple tools set
`ui: "tool-ui"` and return `data.items: ToolUIItem[]` where each item is
either `{ kind: "ticker", ticker, tag?, text, actionIcon? }` or
`{ kind: "generic", text }`. `ToolUIRenderer` wraps the items in a
`ToolProgress` and maps each to the right component — no per-tool logic.

**Never invent a new renderer** for a list-shaped tool (header + items +
maybe sources). If you're tempted: add a generic row or a ticker row to
`data.items` instead. The 5 renderers listed above are the full surface —
4 specialty (thesis card, run summary table, config diff, interactive
question) and 1 generic (`ToolUIRenderer`). Adding a sixth is almost
always the wrong choice.

**Never shove non-ticker content into a ticker row.** Narrative prose
(market context, run wrap-up, a briefing status line) is a generic-kind
item. A fake `$MARKET` ticker is a bug, not a fix — the UI will render
it with a ticker chip as if it were a traded security.

## Design Rules — READ BEFORE ANY UI WORK
- ONLY use ShadCN components from /components/ui
- NEVER create a new component if an existing one can be extended
- ALL cards: use Card from shadcn, padding p-6, same border
- ALL numbers: use tabular-nums class always
- Positive P&L: text-emerald-500 ONLY
- Negative P&L: text-red-500 ONLY
- Never hardcode hex colors, use CSS variables only
- Page titles: text-2xl font-semibold
- Section headers: text-lg font-medium
- Body text: text-sm text-muted-foreground
- Labels: text-xs font-medium uppercase tracking-wide
- Empty/loading/error states on every page and data fetch

## Key Technical Notes
- AI SDK v6: useChat sends UIMessage[] (parts array), streamText
  needs ModelMessage[] — ALWAYS convert with convertToModelMessages()
- Tool parts in v6: part.type === "tool-{toolName}", part.input
  for args, part.state === "output-available" when done
- DefaultChatTransport({ api, body }) is the transport for useChat
- ToolCallGroup reads tool parts directly from useMessage — it does NOT
  use useAssistantToolUI hooks. All rendering is data-driven via result.ui.
- Prisma Json fields (sourcesUsed, parameters) typed as unknown —
  always cast with type guard
- async params in Next.js App Router: params: Promise<{ id: string }>
- FMP /quote/ endpoint DEPRECATED — use Finnhub for all quotes
- Model strategy: GPT-4o EVERYWHERE (research-run, builder, editor).
  research-run uses temperature 0.2 and maxSteps 50 for stage contract adherence.
  GPT-4o-mini for lightweight summaries. Do NOT swap to Claude —
  the 30k context limit crashes the run.
- Agent thinking config lives in lib/agent/modes.ts (thinkingBudget field)
- gh auth switch --user dave-sucks before pushing

## Run Flow (Button Click → Completion)
1. Click "Run" → POST /api/research/agent-run → creates ResearchRun
2. Redirect to /runs/[id] → AgentThread renders with autoStart
3. AgentThread → ChatRuntime → POST /api/agent/research-run
4. Route loads config + historical context (portfolio, watchlist,
   briefs, trades, accuracy, intelligence policy)
5. GPT-4o (temperature 0.2) follows 8-phase workflow:
   Phase 0: Portfolio check-in (injected context, no tools)
   Phase 1: Read intelligence (morning brief + signals + web_search)
   Phase 2: Review holdings (get_stock_data per ticker)
   Phase 3: Review watchlist
   Phase 4: Discover (from signals, web_search for verification)
   Phase 5: Synthesize (pure reasoning, decision table)
   Phase 6: Execute (place_trade, close_position, manage_watchlist)
   Phase 7: Wrap up (complete_run with ranked picks)
6. Each tool result streams with a ToolResult envelope (ok, ui, data, sources)
7. ToolCallGroup groups results by groupId; ToolCallRow dispatches on ui
8. record_thesis persists Thesis to DB + ThesisCardRenderer shows full card
9. place_trade calls Alpaca + creates Position + renders TradeCard
10. complete_run marks run COMPLETE, triggers briefing agent

## Known Issues / Tech Debt

### RECURRING BUGS — READ BEFORE TOUCHING THESE FILES

**Stage structure in the agent system prompt** (`lib/agent/system-prompt.ts`, `components/assistant-ui/cited-markdown-text.tsx`)
- The Run Flow section MUST use `### Stage N — NAME` markdown headers for each of the 6 stages. GPT-4o relies on that structural cue to treat the stage boundary as a mandatory tool-call emission point.
- Replacing the `###` headers with inline bold (e.g. `**Record theses —**`) has been tried and **destroys the run**: the model narrates the transition as prose ("I'll proceed to thesis drafting…"), generateText terminates on that text-only step, and the run ends with 0 theses, 0 trades, 0 summary. Every analyst fails identically. Do not do this — it was attempted in commit 364b63a (Apr 20 2026) and broke the entire 8 AM cron the next morning.
- GPT-4o occasionally leaks `### Stage N — NAME` verbatim into its narration output. That cosmetic issue is handled at the renderer — the h3 filter in `cited-markdown-text.tsx` (around line 342) strips any heading matching `/^(Stage|Phase)\s+\d+\s*[—–\-]/`. That renderer filter is the durable defense; it's safe to keep the headers in the prompt.
- The `FORBIDDEN OUTPUT PATTERNS` list in Section 8 of the prompt is belt-and-suspenders. Keep it. Do not rely on it alone.

**manage_watchlist tool call not showing** (`lib/agent/system-prompt.ts`)
- GPT-4o narrates "I'll add $X to the watchlist" as prose instead of calling manage_watchlist.
- FIXED BY: explicit prohibition in Stage 4 — "narrated watchlist updates that skip the tool call are a run failure."
- If the prohibition language is softened or removed, the regression returns immediately.

**Never invent per-tool renderers** (`components/agent/renderers/`, `components/agent/ToolCallRow.tsx`)
- The renderer surface is exactly 5 files: `ToolUIRenderer` (the generic one) + 4 specialty (`ThesisCardRenderer`, `RunSummaryRenderer`, `ConfigPreviewRenderer`, `AskQuestionRenderer`). Every prior attempt to add a sixth (`TickerRenderer`, `TickerListRenderer`, `SourceRenderer`, `GenericRenderer`, `DecisionSummaryRenderer`, `MorningBriefRenderer`) was a thin wrapper that should have been a row shape inside `ToolUIRenderer`. All six have been deleted.
- The fix for "my tool's content doesn't show up" is never a new renderer. It is `data.items` with the right row kinds. See "Tool UI architecture" above.
- The fix for "my narrative paragraph doesn't have a ticker" is never to invent a fake ticker. It is `{ kind: "generic", text }`. The `$MARKET` fake-ticker bug lived for weeks because a prior session did this exact thing.

- FMP historical-price-full may 403 on legacy plan (affects
  technical analysis for small-cap/ADR tickers)
- Old analysts created before V3 may need V3 infra backfill
  (source packs, intelligence queries, intelligence policy)
- read_signals returns 0 for analysts without routed signals
  (fallback queries by sector/watchlist exist but not verified)
- Morning brief tool UI shows counts but not full briefing content
- python-service/ directory still in repo (archived, not deployed)

## Key Files
### Agent System
- lib/agent/tools/ — 17 individual tool files, each using defineTool()
- lib/agent/tools/index.ts — single export + createResearchTools() wrapper
- lib/agent/define-tool.ts — defineTool() factory with timing/logging
- lib/agent/tool-result.ts — ToolResult<T> discriminated union + normalizer
- lib/agent/tool-context.ts — ToolContext interface + createToolContext()
- lib/agent/modes.ts — model, provider, thinking budget, tool allowlists
- lib/agent/system-prompt.ts — agent persona + instructions
- components/research/AgentThread.tsx — live agent UI
- components/agent/ToolCallGroup.tsx — groups tool calls by groupId
- components/agent/ToolCallRow.tsx — dispatches on result.ui to renderers
- components/agent/renderers/ — one renderer per ui discriminator
- components/agent/sheets/ThesisSheet.tsx — ThesisSheetBody + ThesisSheet
- app/api/agent/[mode]/route.ts — unified route (research-run/builder/editor)
- app/api/research/agent-run/route.ts — creates ResearchRun row

### Run Pages
- app/(root)/runs/[id]/page.tsx — run detail (AgentThread vs
  RunUnifiedChat based on mode/status)
- components/research/RunUnifiedChat.tsx — events→chat renderer
- components/research/RunFollowupChat.tsx — post-run chat

### Analyst System
- components/analysts/AnalystBuilderChat.tsx — AI creation chat
- components/analysts/AnalystEditorChat.tsx — AI editing chat
- components/analysts/AnalystChatProvider.tsx — routes to /api/agent/builder
  or /api/agent/editor
- components/analysts/AnalystDetailClient.tsx — analyst detail 2-col

### Intelligence Pipeline
- lib/intelligence/sonar.ts — Perplexity Sonar API client
- lib/intelligence/firecrawl.ts — Firecrawl extraction client
- lib/intelligence/signals.ts — signal creation + dedup utilities
- lib/intelligence/types.ts — intelligence type definitions
- lib/inngest/functions/firm-market-sweep.ts — daily sweep
- lib/inngest/functions/portfolio-watchlist-monitor.ts — ticker monitor
- lib/inngest/functions/domain-monitor.ts — domain monitor
- lib/inngest/functions/signal-router.ts — signal routing
- lib/inngest/functions/morning-brief-generator.ts — brief generation

### Inngest Crons
- lib/inngest/functions/morning-research.ts — daily agent run
- lib/inngest/functions/price-monitor.ts — hourly price check
- lib/inngest/functions/trade-evaluator.ts — post-trade GPT-4o eval
- lib/inngest/functions/eod-evaluation.ts — end-of-day snapshots
- lib/inngest/functions/accuracy-scorer.ts — weekly accuracy

### Core Lib
- lib/alpaca.ts — Alpaca paper trading client
- lib/trade-exit.ts — exit strategy evaluation
- lib/market-hours.ts — isMarketOpen() with ET + holidays
- lib/prisma.ts — Prisma client (adapter-pg)

## Repo
https://github.com/dave-sucks/hindsight
