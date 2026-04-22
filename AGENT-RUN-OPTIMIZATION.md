# Agent Run — Optimization Guide

How a research run works end-to-end, what the current bottlenecks are, and where to look if something goes wrong or you want to make it faster.

---

## Unified agent architecture

All three chat modes — `research-run`, `builder`, and `editor` — share one route (`app/api/agent/[mode]/route.ts`) and one component (`AgentChat`). The mode key controls model, step limit, and which tools are available:

| Mode | Model | Max steps | Tools |
|------|-------|-----------|-------|
| `research-run` | GPT-4o (switchable via UI) | 20 | All 15 research tools |
| `builder` | GPT-4o | 10 | 4 research tools + `suggest_config` |
| `editor` | GPT-4o | 10 | 4 research tools + `suggest_config` |

Tool definitions live in `lib/agent/tools/` (one file per tool). `createResearchTools()` in `lib/agent/tools/index.ts` assembles them all with shared context (`runId`, `userId`, `analystId`, `alpacaCreds`, etc.). The route then filters by `modeConfig.toolAllowlist` — builder/editor get a restricted subset; research-run gets everything.

`TOOL_REGISTRY` in `lib/agent/workflow-registry.ts` is the canonical metadata list (summary, category, providers, which agents use it). It powers the `/agent-workflow` tools registry view and the per-tool dialog "Active in" badges. Updating a tool's metadata means editing that one place.

**What builder/editor can and can't do:**
- Builder/editor CAN call `get_market_context`, `get_stock_data`, `get_earnings_data`, `get_sec_filings` — they research live data before proposing a config.
- Builder/editor CANNOT place trades, record theses, or manage watchlists — those tools are not in their allowlist.
- They can only output via `suggest_config`, which renders a config preview card in the side panel.

**What the completed-run chat can do:**
- The `/runs/[id]` page renders `AgentChat` in `mode="research-run"` for both live and replayed runs. After a run completes, a user can still send messages and the agent responds in `research-run` mode with all 15 tools available — including `place_trade` and `close_position`. There is no separate restricted "followup" mode.

---

## What happens when you click "Run"

1. **POST `/api/research/agent-run`** — creates a `ResearchRun` row in DB (`status: RUNNING`), returns `runId`.
2. **Redirect to `/runs/[id]`** — page renders `AgentChat` with `mode="research-run"` and `autoStart=true`.
3. **`AgentChat`** sends "Run" to `POST /api/agent/[mode]` via the AI SDK chat transport (`DefaultChatTransport`).
4. **Route (`app/api/agent/[mode]/route.ts`)** does three things before streaming:
   - Loads analyst config from `AgentConfig` table
   - Calls `buildRunInput()` — hydrates portfolio (Alpaca positions + live Finnhub prices), watchlist, active theses, prior brief, performance stats, recent closed trades
   - Builds the system prompt via `buildV2SystemPrompt()`
5. **`streamText()`** streams GPT-4o (or selected override) with 15 tools, max 20 steps, `onStepFinish` / `onFinish` hooks.
6. **`onFinish`** marks the run `COMPLETE` (or `FAILED` if no theses/trades), persists messages, triggers `updateAnalystBriefing`.

---

## The seven-stage run flow

The system prompt (`lib/agent/system-prompt.ts`) enforces this order:

| Stage | What happens | Tools used |
|-------|-------------|------------|
| 0 — Portfolio check-in | Plain text acknowledgment, no tools | — |
| 1 — Orient | Read pre-gathered intelligence | `read_morning_brief`, `read_signals`, `read_artifact`, `web_search`, `get_market_context` |
| 2 — Research | Pull live data, **batch multiple tickers per step** | `get_stock_data`, `get_earnings_data`*, `get_options_flow`*, `get_sec_filings`* |
| 3 — Theses | Record a verdict for every researched ticker | `record_thesis` (back to back) |
| 4 — Decide | Plain text synthesis paragraph — **no tool call** | — |
| 5 — Act | Execute decisions | `close_position`, `place_trade`, `manage_watchlist` |
| 6 — Recap | Structured per-ticker summary | `record_run_summary` |
| 7 — Complete | Mark done, trigger briefing | `complete_run` |

\* = conditional only (not called by default on every ticker)

---

## Key files

### Core route
- **`app/api/agent/[mode]/route.ts`** — auth, body parsing, config load, stream setup, `onFinish` lifecycle
- **`lib/agent/modes.ts`** — model, provider, step limit, tool allowlist per mode
- **`lib/agent/system-prompt.ts`** — full 7-stage instructions, rules, tool reference
- **`lib/agent/run-input.ts`** — `buildRunInput()`: hydrates portfolio from Alpaca + Finnhub, loads watchlist, theses, briefs, performance
- **`lib/agent/tools/index.ts`** — `createResearchTools()`: assembles all 15 tools with shared context

### Tools
All tools live in `lib/agent/tools/` as individual `defineTool()` files.
Context (`runId`, `userId`, `analystId`, `alpacaCreds`, `watchlist`, etc.) is passed at tool creation time.

### UI
- **`components/agent/AgentChat.tsx`** — unified chat component, model state, body assembly
- **`components/agent/ToolCallGroup.tsx`** — groups tool calls by `groupId`, renders them
- **`components/agent/ToolCallRow.tsx`** — dispatches on `result.ui` to the right renderer
- **`components/agent/renderers/`** — one renderer per UI type (thesis-card, ticker, source, etc.)

---

## Current bottlenecks and where to tune

### Step count (20 steps)
- Every tool call = 1 step. A run with 6 tickers × 1 `get_stock_data` = 6 steps just in Stage 2.
- **Parallel batching** (added to system prompt) should combine multiple `get_stock_data` into 1 step.
- If the model is ignoring parallel batching, check the Stage 2 instruction in `lib/agent/system-prompt.ts`.
- Knob: `MODES["research-run"].maxSteps` in `lib/agent/modes.ts`. Current: **20**.

### Token count (trimToolResults)
- Tool results can be large (stock data JSON, signal lists). `trimToolResults()` in the route strips every tool result to its `summary` string before converting to model messages.
- This is the main defense against context blowup across steps.
- If the model loses context ("forgot" earlier research), the `summary` strings may be too short — check tool `execute()` return values.

### Model choice
- **GPT-4o** (default): ~60s end-to-end on a typical run, no rate-limit crashes.
- **Claude Sonnet 4.6**: faster per-token but hits the 30k input TPM rate limit when accumulated tool results are large. We disabled extended thinking (it compounds context across steps). Only use Claude if token usage is genuinely low.
- Knob: model switcher in the composer dropdown (stored in `localStorage["hindsight_research_model"]`) or `MODES["research-run"].model` in `lib/agent/modes.ts`.
- The route accepts `body.modelOverride` — validated against `ALLOWED_OVERRIDES` in the route.

### Signal overload (Stage 1)
- `read_signals` defaults to 10 signals. If the model spends too many steps on Stage 1, reduce the default limit in `lib/agent/tools/read-signals.ts`.
- The system prompt explicitly says `read_signals` should filter ruthlessly before Stage 2 triage.

### Thesis slowness (Stage 3)
- Each `record_thesis` call hits Prisma. If Stage 3 is slow, check DB latency (Supabase region) or reduce the number of tickers the agent researches (tighter triage rules in Stage 2 instructions).
- Skeleton loading states were added to `ThesisCardRenderer` so the UI doesn't look frozen.

### Run not completing (stuck RUNNING)
- `onFinish` in the route checks thesis + trade count and marks `COMPLETE` or `FAILED`.
- If a run is stuck: check `RunEvent` table for `run_error` entries, or look at Vercel function logs.
- `markRunFailed()` fires on stream error OR unhandled route error.
- The 5-min Vercel function timeout (`maxDuration: 300`) is the hard outer limit.

---

## Adding / modifying a tool

1. Create `lib/agent/tools/my-tool.ts` using `defineTool()`. Set `ui`, `groupId`, and `execute()`.
2. Export from `lib/agent/tools/index.ts` and add to `createResearchTools()`.
3. If restricting to certain modes, add to `MODES.builder.toolAllowlist` or `MODES.editor.toolAllowlist`.
4. Add a renderer in `components/agent/renderers/` if `ui` is new, and wire it in `ToolCallRow.tsx`.
5. Update `TOOL_REGISTRY` in `lib/agent/workflow-registry.ts` so it appears in `/agent-workflow`.

---

## Cron vs. on-demand

| | Cron (8 AM ET) | On-demand (Run button) |
|--|--|--|
| Entry point | `lib/inngest/functions/morning-research.ts` → `generateText()` | `app/api/agent/[mode]/route.ts` → `streamText()` |
| Timeout | 4 min (Inngest step limit) | 5 min (Vercel `maxDuration: 300`) |
| UI | None (silent background job) | Live streaming in `/runs/[id]` |
| Model | Same model config from `modes.ts` | Same, plus `modelOverride` from body |
| Briefing | Same `updateAnalystBriefing()` called after | Same |

---

## What to do if a run crashes

1. Check **Vercel runtime logs** for `[agent/research-run] ❌` entries — these log the error + elapsed time.
2. Check the `RunEvent` table for `run_error` type events on that `runId`.
3. Common causes:
   - **Rate limit (Anthropic)**: switch to GPT-4o via the model dropdown.
   - **Alpaca 403**: `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` env vars not set or expired.
   - **Finnhub 429**: too many concurrent tool calls — reduce `maxSteps` or add rate limiting in the tool.
   - **Step limit hit**: the agent ran out of steps before `complete_run`. Increase `maxSteps` or tighten Stage 2 triage to reduce research breadth.
   - **DB timeout**: Prisma connection pool exhausted — check Supabase connection limits.
