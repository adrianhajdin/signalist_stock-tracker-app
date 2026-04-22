# Hindsight V3 Comprehensive Audit

**Date:** March 27, 2026
**Purpose:** Full architecture audit after V3 Intelligence migration. What works, what's dead, what needs cleanup.

---

## Executive Summary

Hindsight evolved through 3 major phases:

1. **V1 (Python Pipeline):** Railway-hosted FastAPI service did everything — data gathering, analysis (3-step CoT), thesis generation, trade evaluation. The Next.js app was a thin UI that proxied requests to Railway.

2. **V2 (Agent Migration):** GPT-4.1 agent with 14 native tools replaced the Python pipeline for all research and trading. Tools call Finnhub/FMP/SEC/Alpaca directly from Vercel. Morning cron migrated from "call Python" to "run the agent." Railway became optional.

3. **V3 (Intelligence Layer):** Background Inngest jobs (Perplexity Sonar + Firecrawl + FMP + Finnhub) gather intelligence overnight and route it to analysts. Agents read pre-gathered signals instead of rediscovering the world. New Monitor model replaces the old Source/SourcePack/IntelligenceQuery models.

**Current state:** V3 is live and working. But the codebase still has V1 Python service code, V2 intermediate artifacts, dead Prisma models, orphaned docs, and a Tools sheet UI that's missing `web_search`. Railway can be fully decommissioned after one small migration (trade evaluator).

---

## Part 1: How It All Works Now (Current Architecture)

### The Intelligence Pipeline (Background — 6:30–8:00 AM ET)

```
6:30 AM  Firm Market Sweep
         ├── SEARCH monitors → Perplexity Sonar (web search)
         ├── FMP market movers (gainers/losers/actives)
         └── Finnhub earnings calendar (next 7 days)
         → Creates Signal rows, deduplicates
             ↓
7:00 AM  Portfolio & Watchlist Monitor
         └── Per-ticker Sonar search for every open position + watchlist item
         → Creates ticker-specific Signal rows
             ↓
7:15 AM  Domain Monitor
         ├── Domain-filtered Sonar searches (e.g., reuters.com only)
         └── Firecrawl extraction for priority-1 sources → Artifact rows
         → Creates domain-sourced Signal rows
             ↓
7:30 AM  Signal Router
         └── Scores every Signal × Analyst pair by:
             ticker overlap (+40), sector overlap (+20),
             theme/keyword match (+15), urgency bonus (+10-15)
         → Creates AnalystSignalRoute rows (analyst's inbox)
             ↓
7:45 AM  Morning Brief Generator
         └── GPT-4o reads top 50 routed signals + portfolio + watchlist
         → Creates MorningBrief per analyst (market context,
           portfolio alerts, watchlist updates, new opportunities,
           attention priority, risk flags)
             ↓
8:00 AM  Morning Research Cron (or manual "Run" button)
         └── Agent reads brief + signals → researches → trades
```

### The Agent Runtime (14 Tools)

When an analyst runs (manually or via cron), GPT-4.1 gets these tools:

**Intelligence (read pre-gathered data from DB):**
| Tool | Source | What It Returns |
|------|--------|----------------|
| `read_morning_brief` | Internal DB | Market context, portfolio alerts, watchlist updates, new opportunities, risk flags |
| `read_signals` | Internal DB | Filtered signals routed by background jobs, respects IntelligencePolicy budgets |
| `read_artifact` | Internal DB | Full extracted article content (populated by Firecrawl in background) |

**Research (live API calls for validation):**
| Tool | APIs Called | What It Returns |
|------|-----------|----------------|
| `get_stock_data` | Finnhub (quote, profile, metrics, news, recommendations, candles) + FMP (price targets) | Live price, company profile, key financials, recent headlines, Wall Street consensus, technicals (RSI/SMA), price targets |
| `get_market_context` | Finnhub (SPY/VIX/11 sector ETF quotes, SPY candles, earnings calendar) + FMP (economic calendar) | Market regime, sector performance, macro events, earnings density |
| `get_options_flow` | FMP (options chain) + Finnhub fallback | Put/call ratio, unusual contracts, premium analysis |
| `get_earnings_data` | Finnhub (earnings calendar + earnings history) | Next report date, EPS/revenue estimates, 8-quarter beat/miss history |
| `get_sec_filings` | SEC EDGAR (public API) | Recent 10-K, 10-Q, 8-K, Form 4 filings |
| `web_search` | Perplexity Sonar | Real-time web search when pre-gathered intelligence is insufficient. Respects policy budget (default 5/run) |

**Action (write to DB + execute trades):**
| Tool | What It Does |
|------|-------------|
| `record_thesis` | Persist LONG/SHORT/PASS verdict with confidence, targets, reasoning |
| `place_trade` | Alpaca paper market order → confirm fill → create Position |
| `close_position` | Alpaca sell → update Position with outcome |
| `manage_watchlist` | Add/remove/update watchlist items with priority and catalysts |
| `complete_run` | Mark run COMPLETE, record HOLD decisions, trigger briefing agent |

**Key point:** ALL of these tools run on Vercel. They call external APIs (Finnhub, FMP, SEC EDGAR, Alpaca, Perplexity) directly. **None of them call Railway.**

### Other Background Jobs (Non-Intelligence)

| Job | Schedule | What It Does | Depends On |
|-----|----------|-------------|-----------|
| `price-monitor` | Hourly 9-5 ET | Checks exit conditions for open positions | Alpaca |
| `eod-evaluation` | 5 PM ET | Writes EOD price snapshots, fires `trade/closed` events | Alpaca |
| `trade-evaluator` | On `trade/closed` event | GPT-4o post-trade reflection | **Railway Python service** |
| `weekly-digest` | Sunday 9 AM | Email with weekly performance summary | Alpaca, GPT-4o, Resend |
| `accuracy-scorer` | Sunday 10 AM | Win rate / calibration report per analyst | GPT-4o |

### External Service Dependencies

| Service | Used By | Purpose | Can Remove? |
|---------|---------|---------|------------|
| **Finnhub** | Agent tools + firm sweep | Quotes, news, earnings, technicals, recommendations | No — primary data |
| **FMP** | Agent tools + firm sweep | Market movers, price targets, economic calendar, options | No — secondary data |
| **SEC EDGAR** | Agent tool | Filings lookup | No — free public API |
| **Alpaca** | Agent tools + price monitor + EOD | Paper trading + live prices | No — core trading |
| **Perplexity Sonar** | Intelligence jobs + web_search tool | Web search for signals | No — intelligence backbone |
| **Firecrawl** | Domain monitor | Full-page extraction for artifacts | No — article content |
| **OpenAI** | Agent (GPT-4.1), briefs (GPT-4o), summaries (GPT-4o-mini) | LLM inference | No — brain |
| **Resend** | Weekly digest | Email delivery | No — notifications |
| **Railway Python** | trade-evaluator only | Post-trade GPT-4o evaluation | **YES — migrate away** |

---

## Part 2: What's Dead and Should Be Deleted

### Dead Code Files

| File | What It Was | Why It's Dead | Action |
|------|------------|--------------|--------|
| `lib/actions/research.actions.ts` | `triggerResearchRun()` — called Python `/research/run` | Zero imports anywhere in codebase. Morning cron uses agent now. | **DELETE** |
| `lib/chat/tools/research-tools.ts` | Chat tools that called Python `/research/run` | Exported but never imported by any active route. Old DAV-127 feature. | **DELETE** |
| `components/intelligence/pipeline-log.tsx` | Old intelligence pipeline UI component | Orphaned per DEFERRED_DELETIONS.md | **DELETE** (if exists) |

### Dead Prisma Models (Schema Cleanup)

The V3 intelligence system migrated from Source/SourcePack/IntelligenceQuery to the unified **Monitor** model. These old models are still in the schema but have zero active reads/writes:

| Model | Status | Blocker | Action |
|-------|--------|---------|--------|
| `SourcePackSource` | Dead — orphaned join table | None | **DROP immediately** |
| `IntelligenceQuery` | Dead — replaced by Monitor (type=SEARCH) | Referenced only in backfill script | **DROP** (after confirming monitors work) |
| `SourcePack` | Dead — replaced by Monitor with analystId | FK from AgentConfig.primarySourcePackId | **DROP** after removing FK |
| `Source` | Dead — replaced by Monitor (type=DOMAIN) | FK from Artifact.sourceId | **DROP** after nullifying Artifact.sourceId |
| `MonitorCheckpoint` | Dead — tracked change detection for Source | FK to Source | **DROP** after Source removal |

| Field | Status | Action |
|-------|--------|--------|
| `AgentConfig.primarySourcePackId` | Dead — zero reads/writes in codebase | **DROP column** |

**Recommended deletion order:**
1. Drop `SourcePackSource` + `AgentConfig.primarySourcePackId` (no dependencies)
2. Drop `IntelligenceQuery` (no active code)
3. Nullify `Artifact.sourceId` FK, then drop `Source` + `MonitorCheckpoint`
4. Drop `SourcePack`

### Dead Docs

| Doc | What It Was | Action |
|-----|------------|--------|
| `docs/PHASE-2-PLAN.md` | Duplicate of ANALYST_WORKFLOW_PLAN.md | **DELETE** |
| `docs/DEFERRED_DELETIONS.md` | Cleanup checklist — execute it, then delete the doc | **EXECUTE then DELETE** |
| `docs/SESSION-HANDOFF-INTELLIGENCE-FIX.md` | Session handoff notes — issues either fixed or tracked elsewhere | **DELETE** after reviewing |
| `docs/v2-phase-1.md` | V2 implementation plan — Phase 1 was shipped | **ARCHIVE or DELETE** |
| `docs/v2-phase-2.md` | V2 implementation plan — Phase 2 was shipped | **ARCHIVE or DELETE** |
| `docs/v2-phase-3.md` | V2 implementation plan — Phase 3 was shipped | **ARCHIVE or DELETE** |
| `docs/ANALYST_WORKFLOW_PLAN.md` | Pre-V2 workflow gaps — all addressed by V2/V3 | **DELETE** |
| `docs/TOOL_REFACTOR_PROPOSAL.md` | Tool consolidation proposal — partially executed (scan_candidates etc. killed) | **DELETE** (superseded by V3) |

**Keep:**
| Doc | Why |
|-----|-----|
| `docs/v2-architecture.md` | Canonical V2 design doc — still the best reference for the run model |
| `docs/Hindsight_V3_planning.md` | V3 architecture doc — accurate, well-written, covers shipped system |
| `docs/V3_next_sessions.md` | Roadmap for unfinished V3 work (email ingestion, policy system, tool rationalization) |

After cleanup: 3 docs + this audit = 4 total. Clean.

### Python Service (Railway)

| Endpoint | Used By | Status |
|----------|---------|--------|
| `POST /research/run` | Nothing (was used by `research.actions.ts` + chat tools) | **DEAD** |
| `POST /research/run-stream` | Nothing (old SSE routes deleted) | **DEAD** |
| `POST /research/chat` | Nothing (old chat proxy deleted) | **DEAD** |
| `POST /research/evaluate` | `trade-evaluator.ts` Inngest function | **ONLY LIVE ENDPOINT** |
| `GET /health` | Health check | N/A |

**Verdict:** The entire Railway Python service exists to serve ONE endpoint (`/research/evaluate`) that does a simple GPT-4o call. This should be migrated to a Vercel function (20 lines of code), then Railway can be fully decommissioned.

---

## Part 3: What Needs Fixing

### 1. Tools Sheet UI — Missing `web_search`

The `web_search` tool exists in `tools.ts` and the agent actively uses it, but it's **not registered** in `lib/agent/tool-registry.ts`. The Tools sheet in the HowItWorksSheet shows 13 tools but should show 14.

**Fix:** Add `web_search` entry to `tool-registry.ts` in the Discovery stage with source "perplexity".

### 2. Trade Evaluator — Migrate Off Railway

`lib/inngest/functions/trade-evaluator.ts` calls `${PYTHON_SERVICE_URL}/research/evaluate`. The Python endpoint is a thin wrapper around GPT-4o. Replace with a direct OpenAI call in the Inngest function.

**What the Python endpoint does** (from `python-service/routers/research.py`):
- Takes: ticker, direction, entry_price, close_price, outcome, thesis_summary, signal_types, hold_days
- Calls GPT-4o with a prompt asking for honest self-assessment
- Returns: `{ evaluation_text: string }`

This is ~20 lines of TypeScript to replace.

### 3. CLAUDE.md — Outdated Sections

The CLAUDE.md still references:
- "Legacy Python Pipeline (CRON ONLY — needs migration)" — the cron IS migrated now
- `scan_candidates`, `get_social_sentiment`, `search_reddit` as existing tools — they're deprecated
- `/api/research/run-stream`, `/api/research/chat`, `/api/research/events` as API routes — they're deleted
- `ResearchChatFull`, `RunDetailClient`, `RunLiveStream` as components — they're deleted
- "morning-research cron still uses Python pipeline" in Known Issues — it doesn't
- Lists 14 tools in Agent Tools section but the real count with web_search is 14 (so the count is right, but web_search isn't listed)
- References `python-service/services/scanner.py` and other Python files that are about to be irrelevant

### 4. Workflow Page `/agent-workflow` — Accurate but Incomplete

The page correctly describes the V3 flow (intelligence pipeline → agent run → learning loop). The HowItWorksSheet's Intelligence tab shows the 5-step pipeline accurately. The Tools tab renders from the registry (so it's missing `web_search`).

No major fixes needed beyond the registry update.

### 5. Discovery Layer — Zombie Code

`lib/discovery/themes.ts` and `lib/discovery/catalysts.ts` still exist and are technically importable, but:
- `themes.ts` calls Reddit APIs and Finnhub news for theme detection
- `catalysts.ts` calls FMP/Finnhub for earnings, economic events, insider trading

These were the old "discovery" system that V3 intelligence replaced. However, **they may still be imported somewhere** (the firm market sweep does its own FMP movers + Finnhub earnings calls independently). Need to verify if anything actually imports from `lib/discovery/`.

**If nothing imports them:** Delete the directory.
**If something does:** Evaluate whether the caller should use the intelligence pipeline instead.

---

## Part 4: Railway Verdict

**Don't pay for Railway. Migrate the trade evaluator and shut it down.**

The math:
- Railway runs a FastAPI service with 5 endpoints
- 4 of 5 endpoints are dead (nothing calls them)
- The 1 live endpoint (`/research/evaluate`) is a GPT-4o wrapper
- Migrating it = ~20 lines of TypeScript in the existing Inngest function
- After migration, Railway serves zero purpose

The entire `python-service/` directory (1300+ lines of Python) can be archived. It was the V1 brain; the V2/V3 agent replaced it entirely.

---

## Part 5: Complete Cleanup Task List

### Immediate (Safe, No Risk)

- [ ] Add `web_search` to `lib/agent/tool-registry.ts`
- [ ] Delete `lib/actions/research.actions.ts` (zero imports)
- [ ] Delete `lib/chat/tools/research-tools.ts` (orphaned)
- [ ] Delete `components/intelligence/pipeline-log.tsx` (if exists)
- [ ] Delete docs: `PHASE-2-PLAN.md`, `ANALYST_WORKFLOW_PLAN.md`, `TOOL_REFACTOR_PROPOSAL.md`

### Short Term (Needs a Migration)

- [ ] Migrate `trade-evaluator.ts` to use direct OpenAI call instead of Railway
- [ ] Drop Prisma models: `SourcePackSource`, remove `AgentConfig.primarySourcePackId`
- [ ] Drop Prisma model: `IntelligenceQuery`
- [ ] Update CLAUDE.md to reflect current state (remove legacy references)
- [ ] Delete/archive docs: `DEFERRED_DELETIONS.md`, `SESSION-HANDOFF-INTELLIGENCE-FIX.md`, `v2-phase-1.md`, `v2-phase-2.md`, `v2-phase-3.md`

### Medium Term (Requires Careful Refactor)

- [ ] Nullify `Artifact.sourceId` FK, drop `Source`, `MonitorCheckpoint`, `SourcePack` models
- [ ] Audit `lib/discovery/` — delete if unused, migrate callers if used
- [ ] Archive `python-service/` directory (or remove from repo)
- [ ] Remove `PYTHON_SERVICE_URL` and `PYTHON_SERVICE_SECRET` from env configs
- [ ] Cancel Railway subscription

---

## Part 6: How Docs Should Look After Cleanup

**Keep 3 docs:**

1. **`v2-architecture.md`** → Rename to `ARCHITECTURE.md` — the canonical design doc for the run model, thesis lifecycle, watchlist management, and decision synthesis. Still accurate.

2. **`Hindsight_V3_planning.md`** → Rename to `INTELLIGENCE.md` — the canonical doc for the intelligence pipeline (monitors, signals, routing, briefs). Update the "What's Next" section to reflect current state.

3. **`V3_next_sessions.md`** → Rename to `ROADMAP.md` — the remaining work (email ingestion, analyst policy enforcement, tool rationalization). Update to remove completed items.

4. **This file** (`V3_REVIEW_AUDIT.md`) → Keep as historical record of the cleanup.

**Result:** `docs/` goes from 11 files to 4, each with a clear purpose.
