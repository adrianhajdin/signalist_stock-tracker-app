# Hindsight Agent Overhaul — Consolidated Plan

**Branch:** `claude/review-supabase-plan-Yt1NR`
**Status:** Living document. Update after every session.
**Last updated:** 2026-04-15 (scaffold)

---

## How To Use This Doc

This is the single source of truth consolidating **three rounds** of analysis:
- **Round 1** — First audit of 15 recent runs (10 prioritized issues across intelligence layer + agent ops)
- **Round 2** — Architectural reframe (5 layers: identity, signals, run flow, self-improvement, monitors)
- **Round 3** — User directives (GPT-4 only, builder knowledge library, Universe concept, Manager agent)

Each session below is **small enough to complete in one Claude Code session without context crashes**. After each session:

1. Check off items in the session's checklist
2. Add a short "Session N — Completed" block at the bottom with commit SHAs + notes
3. Move any scope that didn't fit into a follow-up section rather than cramming

**Critical rule:** don't batch sessions. Prior sessions crashed because of over-scoping. One session = one layer of change + a working commit.

---

## Table of Contents

1. [Verified Ground Truth](#verified-ground-truth) — facts checked against live code
2. [Round 1 Audit Summary](#round-1-audit-summary) — 10 prioritized issues
3. [Round 2 Architectural Reframe](#round-2-architectural-reframe) — 5 layers
4. [Round 3 Directives](#round-3-directives) — user corrections & new concepts
5. [Session Plan](#session-plan) — execution sequence
   - Session 0 — Verification & Instrumentation
   - Session 1 — Prompt Obedience on GPT-4o
   - Session 2 — Signal Pipeline Foundation
   - Session 3 — Discovery & Universe Model
   - Session 4 — Builder Rebuild + Knowledge Library
   - Session 5 — Analyst Manager Agent (self-improvement)
   - Session 6 — Signal→Outcome Feedback Loop
   - Session 7 — UX & Observability
6. [Master Checklist](#master-checklist) — flat list for tracking
7. [Session Completion Log](#session-completion-log) — append as sessions finish

---

<!-- Sections below will be appended one at a time. -->

## Verified Ground Truth

These are facts verified against live code in this session. They correct false claims from prior audits.

### ✅ `manage_position` tool EXISTS and IS REGISTERED
- File: `lib/agent/tools/manage-position.ts` (740+ lines, fully implemented)
- Exported: `lib/agent/tools/index.ts:90`
- Registered in `createResearchTools()`: `lib/agent/tools/index.ts:59` as `manage_position`
- Research-run mode has **no** tool allowlist (`toolAllowlist: undefined` in `modes.ts:56`), so the tool is available
- **Both `close_position` and `manage_position` are registered simultaneously**
- **Implication:** The agent NOT calling it is a **prompt obedience / system prompt problem**, not a plumbing problem. Fix is in Session 1, not a tool rebuild.

### ✅ modes.ts uses GPT-4o for ALL modes
- research-run: `gpt-4o`, `maxSteps: 30`, no thinking budget (OpenAI model)
- builder: `gpt-4o`, `maxSteps: 15`, restricted allowlist (4 research tools)
- editor: `gpt-4o`, `maxSteps: 10`, restricted allowlist (3 research tools)
- **Directive locked in:** stay on GPT-4o everywhere. Claude has never worked (30k limit crashes). Round 2's "switch to Claude Sonnet 4.6" recommendation is **DEAD**.
- **Real shallowness fix:** prompt enforcement + possibly raising maxSteps, NOT a model swap.

### ✅ Domain monitor DOES use Firecrawl
- `lib/inngest/functions/domain-monitor.ts:179` — `extractPage(url)` creates Artifact records
- Gated to `priority === 1` monitors only (line 147)
- **The real problem** is the upstream Sonar query that feeds URL discovery: line 95 hardcodes `"latest news analysis developments today from financial markets investing"` — a generic garbage string used for every analyst, every domain. So Firecrawl extracts junk.
- Fix: per-monitor `config.searchQuery` → Session 2.

### ✅ "Universe" concept is a STUB, not a real primitive
- `AgentConfig.tickerUniverse: String[]` exists in `prisma/schema.prisma:146`
- Used ONLY for `strategyType: "DIRECTED"` — "always analyze these tickers"
- Merged into analyst's ticker match set in `signal-router.ts:117`
- **Missing:** sector universe, industry universe, theme universe, market-cap bands, discovery criteria
- **Missing:** no universe concept at all for `strategyType: "DISCOVERY"` analysts (which is most of them)
- Fix: expand Universe into a real model → Session 3.

### ✅ `noveltyScore` is structurally hardcoded to 50
- `createSignal()` defaults `noveltyScore ?? 50`
- `createSignalsFromSonar()` never passes a value
- Every signal in the DB is exactly 50
- No code path computes it
- Fix: compute at ROUTING time against 7d history → Session 2.

### ✅ Builder tool use is partially gated but the prompt is narrative-first
- Builder allowlist: `get_market_context`, `get_stock_data`, `get_earnings_data`, `get_sec_filings`
- System prompt says "MANDATORY: call 2-3 tools before suggest_config" (good)
- But the prompt asks for a 3-5 paragraph "strategy document" — produces narrative, not operational playbook
- No knowledge library: no strategy archetypes, no source catalog, no signal type examples, no watchlist heuristics
- Example: user says "EV stocks for long plays" → builder has zero reference material on what makes a good EV watchlist, which sources cover EV, what signals matter for long-hold vs swing
- Fix: Session 4 adds a knowledge library + rewrites the builder prompt to produce operational playbooks.

### ✅ CLAUDE.md has stale paths
- CLAUDE.md references `lib/agent/tools.ts` — does not exist
- Actual path: `lib/agent/tools/index.ts` (the directory became the wrapper)
- Also: CLAUDE.md says "Claude Sonnet 4.6 + extended thinking" — code says GPT-4o everywhere
- Fix: Session 0 updates CLAUDE.md to match reality (cheap, non-code change)

---

## Round 1 Audit Summary

Source: 15-run Supabase analysis of Tech Momentum Raider (April 14, 2026).
**TL;DR:** Agent isn't broken. It's paralyzed by design gaps. 15 runs, **zero in-run trades**. Discovery dead. Signals are noise. Briefs are descriptive not prescriptive.

### The 10 Issues

| # | Issue | Evidence | Layer |
|---|-------|----------|-------|
| 1 | Runs are 47–241s (mostly <90s) — too shallow for 8 phases × 16 tools | Run durations across 15 runs | Run flow |
| 2 | Discovery is dead — agent only analyzed tickers it already knew | 0 new tickers across 15 runs despite 50 signals/day | Signal routing |
| 3 | `noveltyScore` hardcoded at 50 across 2,261 signals | No differentiation, 6-month-old MU data routed as fresh | Signal scoring |
| 4 | Agent at max capacity (3/3 positions) — can't act, doesn't know how | No `scale_position`, no stop-trail calls | Tools/prompt |
| 5 | 88-hour avg hold on a DAY-configured analyst | Positions held across weekends | Run flow |
| 6 | AKAM contradiction never analyzed | Lost $396 shorting, then ignored bullish insider buying signals | Self-improvement |
| 7 | Signal pipeline produces 50 signals/day with ~4-5 distinct facts | NVDA/MRVL $2B deal appears in 7 separate signals same day | Signal dedup |
| 8 | Post-run brief is summary, not strategy | `selfCorrections`: "implement automated alerts" (generic platitude) | Briefing |
| 9 | No concentration risk check | All 3 positions AI semis (NVDA/MU/MRVL), never flagged | Run flow |
| 10 | Thesis/position target conflicts never reconciled | MU position target $440, new thesis target $460, neither updated | Run flow |

### Round 1 Priority Ranking

| Priority | Issue | Primary Fix |
|----------|-------|-------------|
| P0 | #2 Discovery dead | Discovery bucket in signal router |
| P0 | #3 noveltyScore hardcoded | Compute at routing time, 7d lookback |
| P1 | #4 No position scaling | Use existing `manage_position` tool (already built!) + prompt enforcement |
| P1 | #1 Runs too shallow | Enforce min tool calls per phase |
| P1 | #2 Only known tickers | Require N new-ticker searches per run |
| P2 | #5 DAY hold violations | Inject time-in-position into Phase 2 context |
| P2 | #9 Concentration blind | Phase 2 must compute correlation |
| P2 | #8 Brief is backward-looking | Prescriptive brief prompt rewrite |
| P3 | #7 Stale signals | Filter: don't re-route >48h unless EVERGREEN |
| P3 | Signal content gaps | Add breakout/volume/options/earnings monitors |

---

## Round 2 Architectural Reframe

Round 1 was *what's broken*. Round 2 is *why the architecture produces those breaks*. Five layers, each with its own failure mode.

### Layer 0 — The immediate model bug (SUPERSEDED)
Round 2 originally flagged `modes.ts` using GPT-4o instead of Claude Sonnet 4.6.
**SUPERSEDED by Round 3 directive:** stay on GPT-4o. Claude 30k limit crashes make it unusable. The shallowness fix is prompt enforcement, not a model swap.

### Layer 1 — Analyst Identity Problem
**Symptom:** Every analyst prompt is a 5-paragraph marketing narrative. The builder produces a "strategy document" when what the agent needs is an **operating manual**.

**What's missing from every analyst prompt:**
1. **Specific discovery criteria** — not "momentum stocks in tech" but `volume ≥ 2× 5-day avg AND crossed 52w high in past 3 days AND market cap $500M–$50B AND sector ∈ {semis, AI hardware}`
2. **Entry rules** — "only enter if VIX < 25 and SPY above 20dMA, else halve size"; "never enter within 2 weeks of earnings unless the catalyst IS earnings"
3. **Position management rules** — "at +5%, move stop to breakeven; at +8%, take 25% off; hold rest to target"
4. **Intelligence priorities** — ranked signal types with examples of what to ignore
5. **Discovery search queries** — the literal Google queries the analyst would run each morning

**Builder flow needs to change:**
- From narrative questions ("what excites you about trading?") → operational questions ("what setup triggers interest?", "what makes you exit early?", "what would you search every morning?")
- Builder must validate its output by running real tools on candidate stocks before finalizing
- Builder needs a **knowledge library** (strategy archetypes, source catalog, signal type catalog) — see Round 3 expansion

### Layer 2 — Signal Architecture Problem
**Wrong mental model:** search → store → route → read
**Right mental model:** **intent → search → filter → enrich → route → act**
Missing: **intent** (what are we trying to learn?) and **enrichment** (is this actually new?).

**5 sub-problems:**
1. **Domain monitors use a generic query** — `domain-monitor.ts:95` hardcodes `"latest news analysis developments today from financial markets investing"` for every analyst, every domain. Bloomberg/Motley Fool/SeekingAlpha all get the same meaningless query.
2. **Dedup window is 24h** — NVDA/MRVL $2B deal from March 31 still gets "fresh" signals 2 weeks later because each daily batch has no overlap with last week's batch.
3. **`noveltyScore` hardcoded 50** — never computed.
4. **No discovery bucket in routing** — scoring math (ticker match +40, sector match +20) structurally prevents new tickers from winning the brief's top-3 slots.
5. **Dynamic monitors accumulate without pruning** — 218 monitors across ~5 analysts. Briefing agents keep creating overlapping monitors on the same topic.

### Layer 3 — Run Flow Problems
**System prompt gets right:** portfolio table, priority reviews, active theses, prior brief, calibration, 6-stage flow.

**What it gets wrong:**
1. Stage instructions are suggestions, not enforcement ("2-4 new opportunities" → interpreted as max, not min)
2. ~~`manage_position` doesn't exist~~ — **CORRECTION:** it exists, it's registered, it's available. Agent just isn't using it because the prompt doesn't force it.
3. No time-in-position enforcement for DAY positions
4. "Near max positions" escape hatch — agent interprets as "skip discovery entirely" when at 3/3
5. `analystPrompt` injected raw without operating-manual framing header

### Layer 4 — Self-Improvement Loop (doesn't exist)
**Current flow:** briefing agent produces `selfCorrections` → read back in next run's system prompt → agent ignores them because there's no mechanism to act.

**What's missing:**
- `selfCorrections` about strategy → **no way to edit** `analystPrompt`
- `selfCorrections` about signal quality → **no way to update** `intelligencePolicy`
- `selfCorrections` about risk → **no way to update** `minConfidence` / `maxPositionSize`
- `selfCorrections` about missing monitors → can only create temporary monitors, not standing ones
- No signal→outcome trace: MU closes +$504, nothing records which signals led to it

### Layer 5 — Monitor Design Philosophy
**Right taxonomy (5 tiers, hybrid ownership):**

| Tier | Name | Owner | Signal Pool | Routing |
|------|------|-------|-------------|---------|
| T1 | Market Pulse (movers, earnings, insider flow, options flow) | FIRM | Shared | All analysts via sector/ticker |
| T2 | Analyst Strategy Searches | ANALYST | Owned | Owning analyst only |
| T3 | Domain Crawls (per-domain specific query) | ANALYST | Owned | Owning analyst only |
| T4 | Portfolio/Watchlist per-ticker | FIRM | Shared | Routed to position owner only |
| T5 | Temporary briefing-agent monitors | ANALYST | Owned | Owning analyst, expires, deduped |

**Routing rule:** analyst-owned signals fast-path to their analyst (skip re-scoring). Cross-analyst discovery routes at lower relevance when another analyst's search surfaces a ticker owned elsewhere.

---

## Round 3 Directives

User corrections and expansions on top of Round 2.

### D1 — Never Claude, Always GPT-4
Claude has never worked in this project. 30k limit crashes every time.
**Implication:**
- Round 2's "fix modes.ts → Claude Sonnet 4.6" is REMOVED from the plan
- Shallowness fix = prompt enforcement (Session 1), possibly raising `maxSteps` from 30
- Consider adding a `reasoning_effort` or equivalent parameter if GPT-4o / GPT-5 variants support it
- Consider moving to a newer OpenAI model (e.g., `gpt-5`, `o3`) if available — research in Session 0

### D2 — Builder Needs a Real Knowledge Library
Current builder has **nothing to reference**. It can't answer "what makes good EV stocks for long plays?" because it has no library of:
- **Strategy archetypes** (momentum breakout, mean reversion, earnings catalyst, insider buying, technical breakout, sector rotation, event-driven, options flow, short interest squeeze, etc.)
- **Source catalog** (which domains are high-signal for which sectors/strategies — e.g., semianalysis.com for semis, theinformation.com for AI/enterprise SaaS, stocktitan.net for small caps)
- **Signal type catalog** (which signal types matter for which strategies — insider clusters for value, unusual volume for breakouts, analyst revisions for earnings plays)
- **Watchlist heuristics** (how to seed a watchlist from a description — "EV stocks" → start with leading EV OEMs, battery suppliers, charging infra, lithium miners, etc.)

**And it doesn't use tools nearly enough.** For "EV stocks for long plays" it should:
- Run `get_market_context` for sector performance
- Run a Perplexity search for "top EV stocks 2026 momentum fundamentals"
- Call `get_stock_data` on 3-5 candidates to validate the watchlist
- Pull earnings calendars for catalyst identification

**Fix:** Session 4 builds the knowledge library + tool-heavy builder flow.

### D3 — Universe Is the Missing Primitive
Current `tickerUniverse` is a raw string array for DIRECTED mode only. The user's instinct: **discovery should route based on universe and industry, not just analyst specifics**.

**Proposed Universe model (expand AgentConfig):**
```
universe: {
  sectors: string[]              // ["Technology", "Consumer Cyclical"]
  industries: string[]           // ["Semiconductors", "Auto Manufacturers"]
  themes: string[]               // ["AI infrastructure", "EV transition"]
  marketCapMin?: number
  marketCapMax?: number
  priceMin?: number              // filter penny stocks / expensive names
  priceMax?: number
  exchanges: string[]            // ["NASDAQ", "NYSE"]
  exclusions: string[]           // tickers/industries to always skip
  seedTickers: string[]          // starter watchlist (replaces tickerUniverse)
}
```

This gives signal routing a real fence for discovery — "surface tickers *outside* watchlist but *inside* universe."

**Fix:** Session 3 introduces the Universe model + routes discovery through it.

### D4 — The Manager Agent (the crown jewel)
User quote: *"it's like this conversation I am having with you right now, but within my own app's agent."*

The biggest unlock. A scheduled agent that reviews an analyst's own performance and **edits itself**.

**Proposal:**
- New weekly cron: `analyst-manager` (e.g., Sunday evening)
- Per analyst, the Manager reads:
  - Last 7 days of runs + theses
  - Trades opened/closed + outcomes (P&L, vs-thesis delta)
  - Signals consumed (which led to which theses which led to which trades)
  - Signals ignored (patterns of what the analyst should have acted on)
  - Accuracy report for the week
- Manager agent has **edit tools**:
  - `edit_analyst_prompt` — rewrite sections of `analystPrompt` (diff-based, logged)
  - `update_intelligence_policy` — change attention weights, source quality filters
  - `update_risk_params` — minConfidence, maxPositionSize, maxOpenPositions
  - `add_standing_monitor` — create a persistent Monitor with specific `searchQuery`
  - `archive_monitor` — disable monitors that produced no winning signals
  - `update_watchlist` — promote/demote tickers based on historical performance
  - `update_universe` — add/remove sectors, industries, themes
- Every edit creates an **`AnalystConfigRevision`** record with `reason`, `beforeJson`, `afterJson`, `createdByRunId`
- UI shows revision history per analyst — the "diary" of how the analyst evolved

**Fix:** Session 5 builds the Manager agent + revision model + edit tools.

### D5 — Layer 5 Is My Call
User: *"cool. figure it out."*
**Decision:** Implement the 5-tier taxonomy from Round 2 Layer 5 as-specified. Tier-aware routing lands in Session 3 (along with Universe). Dynamic monitor dedup + archival lands in Session 5 (Manager's responsibility).

---

## Session Plan

**Sequencing principle:** every session ends with a working commit. No cross-session stubs. If a session's scope doesn't fit, cut the last item, don't rush it.

Each session lists:
- **Goal** — one sentence
- **Files** — the files you'll touch
- **Checklist** — the exact steps
- **Exit criteria** — what "done" means
- **Out of scope** — what NOT to touch

---

### Session 0 — Verification & Instrumentation

**Goal:** Establish ground-truth observability so future sessions can measure impact.

**Why first:** Every other session's success criteria depend on "did the agent behave differently?" Without per-run tool-call metrics, we can't tell. This session is pure instrumentation — no behavior change.

**Files:**
- `CLAUDE.md` — fix stale paths (lib/agent/tools.ts → lib/agent/tools/index.ts) and model references (Claude → GPT-4o)
- `lib/agent/define-tool.ts` — confirm tool-call timing logs exist; add phase-aware log field if missing
- `lib/inngest/functions/morning-research.ts` — add per-run tool-call summary persisted to `ResearchRun.parameters.toolStats`
- `app/(root)/runs/[id]/page.tsx` — surface tool stats in run detail UI (small block, not a full redesign)
- `app/(root)/intelligence/page.tsx` — add a "Monitor ROI" stub card (populated in Session 6)

**Checklist:**
- [ ] Update CLAUDE.md: fix `lib/agent/tools.ts` → `lib/agent/tools/index.ts` in the Key Files section
- [ ] Update CLAUDE.md: replace "Claude Sonnet 4.6 with extended thinking" with "GPT-4o, maxSteps 30" in Architecture and Key Technical Notes
- [ ] Update CLAUDE.md: note `manage_position` is tool 17 (it's missing from the 16-tool list)
- [ ] Update CLAUDE.md: note Universe is a stub, pending Session 3
- [ ] Add `toolStats` aggregator to `app/api/agent/[mode]/route.ts` onFinish hook — count calls by tool name, by groupId
- [ ] Persist `toolStats` into `ResearchRun.parameters` JSON at run completion
- [ ] Log warning if a research-run completes with <5 tool calls or <60 seconds duration
- [ ] Add a `<ToolStatsBlock>` component on `/runs/[id]` showing: total tool calls, calls per phase, duration, was `manage_position` called when positions held? (yes/no)
- [ ] Research: is GPT-5 / o3 / o4 available via the OpenAI SDK in this project? Document model options in a `// MODEL_OPTIONS` comment in `modes.ts`
- [ ] Commit: `chore: session-0 instrumentation and doc corrections`

**Exit criteria:**
- New runs write `toolStats` to DB
- `/runs/[id]` shows a stats block
- CLAUDE.md reflects reality
- No behavior change in agent decisions

**Out of scope:**
- System prompt edits (Session 1)
- Signal pipeline (Session 2)
- Any new tools or models

---

### Session 1 — Prompt Obedience on GPT-4o

**Goal:** Force the agent to actually use the tools it already has. No new tools, no new infrastructure — just fix the instructions.

**Why second:** This is the single highest-leverage change. `manage_position` exists. `web_search` exists. The agent just doesn't call them when it should. A system prompt rewrite is cheap, reversible, and measurable via Session 0's toolStats.

**Files:**
- `lib/agent/system-prompt.ts` — major rewrite
- `lib/agent/modes.ts` — raise `research-run.maxSteps` from 30 → 50 (tool calls are cheap if correct)
- `lib/agent/modes.ts` — optional: add `temperature: 0.2` for research-run consistency
- No Prisma changes, no new tools, no new routes

**Checklist (system prompt rewrites):**
- [ ] Add **Operating Manual Framing** header above injected `analystPrompt`:
  > "The strategy below is your operating manual, not background reading. Before every tool call, check it."
- [ ] **Stage 2 (holdings review) MUST call `get_stock_data` for every open position.** Non-negotiable. Prompt language: "You MUST call get_stock_data for each of these N open positions. No exceptions."
- [ ] **Stage 2 MUST compute concentration risk** across open positions. Prompt: "Before moving to Stage 3, narrate: are all positions in correlated sectors? If yes, flag it explicitly in your reasoning."
- [ ] **Stage 2 MUST inject time-in-position for every DAY-configured holding.** Prompt injects: "NVDA: open 47h — configured hold duration DAY. You MUST either (a) close with explicit reasoning or (b) justify the extension in writing before Stage 3."
- [ ] **Stage 3 (discovery) MUST research ≥ 2 new tickers** regardless of position capacity. Prompt: "Being at max positions does NOT skip discovery. Research ≥ 2 new names and add merit-worthy ones to the watchlist via `manage_watchlist`."
- [ ] **Stage 4 (action) MUST consider `manage_position`** before any other action. Prompt enumerates: "For each open position you reviewed, you MUST consider a `manage_position` call — scale in, trail stop, adjust target, or take partial. Explicit choice required, 'hold unchanged' is valid but must be stated."
- [ ] Eliminate "near max positions" escape hatch language entirely
- [ ] Add **minimum tool call floor** per stage in the prompt (Stage 1: 1 brief read, Stage 2: 1 stock-data per position, Stage 3: ≥ 2 new-ticker searches, Stage 4: ≥ 1 action-or-explicit-hold)
- [ ] Remove any references to tools that don't exist; match the real registry
- [ ] Add signal-quality feedback narration requirement: "In your final summary, flag any signal that was duplicative, stale, or low-quality."

**Checklist (modes.ts):**
- [ ] Raise `research-run.maxSteps: 30` → `50`
- [ ] Add `temperature: 0.2` to research-run request config in `app/api/agent/[mode]/route.ts` if not already set

**Exit criteria:**
- Run a test agent run on an analyst with ≥ 1 open position
- Verify via Session 0's toolStats block:
  - `get_stock_data` called ≥ once per open position
  - `manage_position` call OR explicit narrated "hold unchanged" for each position
  - ≥ 2 new-ticker searches (via `web_search` or `get_stock_data` on non-portfolio tickers)
  - Run duration > 90 seconds
- Commit: `feat: session-1 system prompt enforcement`

**Out of scope:**
- Actually adding discovery bucket to signal routing (Session 3)
- Fixing the generic domain query (Session 2)
- Building the Manager agent (Session 5)

---

### Session 2 — Signal Pipeline Foundation

**Goal:** Kill the generic Sonar query, extend dedup, and make `noveltyScore` actually compute. Three tight changes to the intelligence pipeline.

**Why third:** Session 1 makes the agent USE signals better. Session 2 makes the signals themselves less noisy. Doing this before discovery routing (Session 3) means when we add the discovery bucket, it's drawing from a cleaner pool.

**Files:**
- `lib/inngest/functions/domain-monitor.ts` — use per-monitor `config.searchQuery`
- `lib/intelligence/signals.ts` — `deduplicateSignals` window expansion + semantic fingerprint
- `lib/inngest/functions/signal-router.ts` — compute `noveltyScore` at routing time
- `prisma/schema.prisma` — add `signalFingerprint String?` and `@@index([signalFingerprint, createdAt])` to `Signal`
- Migration: `add_signal_fingerprint`

**Checklist (domain-monitor.ts):**
- [ ] Replace hardcoded line-95 query with: `const query = (config?.searchQuery as string) ?? defaultQueryFor(monitor)`
- [ ] Add `defaultQueryFor(monitor)` fallback that uses analyst sector + strategy keywords if searchQuery missing
- [ ] Log warning when falling back so we can find monitors to update
- [ ] Update `searchContext` to include the actual query used (not just the domain list)

**Checklist (deduplication):**
- [ ] Add `signalFingerprint` column to Signal model (hash of normalized headline + primary ticker + week-bucket)
- [ ] Write `computeSignalFingerprint(signal)` helper in `lib/intelligence/signals.ts`
- [ ] Backfill existing signals with fingerprint (one-shot SQL or Inngest function — guard against re-running)
- [ ] Rewrite `deduplicateSignals()` to use tiered windows:
  - BREAKING urgency: 1-day window
  - News/earnings signals: 3-day window
  - Informational/evergreen signals: 7-day window
- [ ] Use fingerprint for the dedup comparison, not just URL matching

**Checklist (noveltyScore):**
- [ ] Move scoring from creation time to routing time (`signal-router.ts`)
- [ ] For each signal × analyst pair, query past 7 days of `AnalystSignalRoute` for matching tickers/themes
- [ ] Score: `80` if ticker never seen by this analyst in 7d, `50` if seen 1-2×, `20` if seen 3-5×, `5` if seen 6+×
- [ ] Apply `noveltyScore` as a **multiplier** on relevance score, not an additive bonus (so stale signals DROP below threshold)
- [ ] Signals with `noveltyScore < 20` don't route to the analyst unless BREAKING
- [ ] Preserve raw score + novelty-adjusted score in route record for debugging

**Exit criteria:**
- Pick 2 existing domain monitors (e.g., bloomberg.com, seekingalpha.com), set `config.searchQuery` to analyst-specific strings, trigger domain-monitor job, verify signals created reflect the query
- Run signal-router on a fresh batch and verify `noveltyScore` varies across signals (no longer all 50)
- Inspect `AnalystSignalRoute` rows: stale signal (same ticker 5× this week) should drop below threshold
- Commit: `feat: session-2 signal dedup, novelty scoring, per-monitor queries`

**Out of scope:**
- Adding a discovery bucket to routing (Session 3)
- Creating new monitor types (Session 4/5)
- Builder changes (Session 4)
- Monitor archival / dedup at creation (Session 5 — Manager's job)

---

### Session 3 — Discovery & Universe Model

**Goal:** Introduce the Universe primitive, add a discovery bucket to signal routing, and implement Round 2 Layer 5 tiered monitor ownership.

**Why fourth:** With clean signals from Session 2, we can now structurally force discovery into the agent's field of view. Without the Universe, discovery has no fence and becomes random.

**Files:**
- `prisma/schema.prisma` — expand AgentConfig with Universe fields
- Migration: `add_universe_to_agent_config`
- `lib/inngest/functions/signal-router.ts` — tiered routing + discovery bucket
- `lib/inngest/functions/morning-brief-generator.ts` — forced discovery slot
- `lib/agent/tools/read-signals.ts` — separate `knownSignals` vs `discoverySignals` in output
- `app/(root)/analysts/[id]/*` — UI for Universe config (add to existing config editor)

**Checklist (schema):**
- [ ] Add to AgentConfig:
  ```
  universeSectors      String[]  @default([])
  universeIndustries   String[]  @default([])
  universeThemes       String[]  @default([])
  universeMarketCapMin BigInt?
  universeMarketCapMax BigInt?
  universePriceMin     Float?
  universePriceMax     Float?
  universeExchanges    String[]  @default([])
  universeExclusions   String[]  @default([])
  ```
- [ ] Keep `tickerUniverse` as-is for DIRECTED mode back-compat (rename UI label to "Directed Ticker List")
- [ ] Migration + backfill: existing analysts get empty Universe (will be populated by Session 5 Manager or manual editor)

**Checklist (signal-router):**
- [ ] Load analyst Universe in `AnalystProfile`
- [ ] Implement **tier-aware routing**:
  - T1 firm signals (movers, earnings, insider) → score against all analysts, use universe for match
  - T4 firm-per-ticker signals → route only to position/watchlist owner
  - T2/T3/T5 analyst-owned signals → **fast-path** to owning analyst, skip re-scoring
- [ ] Implement **discovery bucket**:
  - Before routing top-N by score, reserve ≥ 20% of slots for signals where ticker is NOT in analyst's watchlist/positions but IS in Universe
  - Tag route record with `routeReason: "DISCOVERY" | "WATCHLIST" | "POSITION" | "SECTOR_MATCH"`
- [ ] Add **cross-analyst routing** with relevance penalty: if Analyst A's owned search surfaces a ticker held by Analyst B, route to B with `crossAnalystSource: analystAId` and lower relevance

**Checklist (morning-brief-generator):**
- [ ] When building per-analyst brief, segment routed signals into 3 buckets: `portfolioAlerts`, `watchlistUpdates`, `newOpportunities`
- [ ] **Force ≥ 1 (ideally 2) item in `newOpportunities` to be a DISCOVERY-tagged signal** (ticker not in watchlist/positions)
- [ ] If zero discovery-tagged signals exist, explicitly state "No discovery candidates this session" so agent doesn't invent

**Checklist (read_signals tool):**
- [ ] Return `{ portfolioSignals, watchlistSignals, discoverySignals }` instead of flat array
- [ ] Agent system prompt (no change needed if Session 1 enforces "research ≥ 2 new names" — discoverySignals now has material to work with)

**Checklist (UI):**
- [ ] Add Universe section to analyst detail page (sectors, industries, themes, market cap range, exclusions)
- [ ] Editor chat can propose Universe updates via existing `suggest_config` tool
- [ ] Minimal UI — ShadCN form fields only, no custom styling

**Exit criteria:**
- Pick an existing analyst, populate their Universe (e.g., Tech Momentum Raider → sectors: ["Technology"], industries: ["Semiconductors", "Software"], themes: ["AI infrastructure"])
- Trigger a full pipeline run
- Morning brief contains ≥ 1 new-ticker discovery signal
- `/runs/[id]` shows the agent researching that new ticker via `get_stock_data`
- Commit: `feat: session-3 universe model and discovery routing`

**Out of scope:**
- Creating new strategy searches / monitors (Session 4 builder, Session 5 manager)
- Analyst manager self-editing (Session 5)
- Signal→outcome trace (Session 6)

---

### Session 4 — Builder Rebuild + Knowledge Library

**Goal:** Turn the builder from narrative producer into operational-playbook producer. Give it a real knowledge library to reference and force it to use tools heavily.

**Why fifth:** Universe exists now (Session 3). The builder can populate it sensibly. Signal pipeline is cleaner (Session 2). The builder can reference high-signal sources for each strategy archetype.

**Files:**
- `lib/knowledge/strategy-archetypes.ts` — NEW: 10-15 strategy templates
- `lib/knowledge/source-catalog.ts` — NEW: domain recommendations per sector/strategy
- `lib/knowledge/signal-type-catalog.ts` — NEW: which signal types matter for which strategies
- `lib/knowledge/watchlist-seeds.ts` — NEW: starter tickers by theme (EV, AI, biotech, fintech, semis, etc.)
- `lib/agent/modes.ts` — rewrite `BUILDER_SYSTEM_PROMPT`
- `lib/agent/modes.ts` — expand builder `toolAllowlist` to include `web_search`
- `lib/agent/tools/suggest-config.ts` — expand schema to include full Universe fields + domain monitor configs with `searchQuery` per domain

**Checklist (knowledge library):**
- [ ] `strategy-archetypes.ts` — for each archetype (momentum breakout, mean reversion, earnings catalyst, insider buying, sector rotation, event-driven, options-flow, short-squeeze, value-mean-reversion, dividend-income):
  - typical entry criteria
  - typical hold duration
  - typical position sizing heuristic
  - signal types that matter most
  - signal types to ignore
  - example analyst prompts (operating-manual style, not narrative)
- [ ] `source-catalog.ts` — `{ sector, strategy, domain, signalQuality, whatToExtract }` entries. Examples:
  - `{ sector: "Semiconductors", strategy: "momentum", domain: "semianalysis.com", quality: 5, whatToExtract: "chip roadmap, supply announcements, capacity reports" }`
  - `{ sector: "EV/Auto", strategy: "long-term", domain: "insideevs.com", quality: 4, whatToExtract: "delivery numbers, battery tech, production ramps" }`
- [ ] `signal-type-catalog.ts` — mapping from SignalType enum values to strategy archetypes with relevance weights
- [ ] `watchlist-seeds.ts` — themed ticker lists:
  - EV Long: TSLA, RIVN, LCID, NIO, LI, XPEV, PSNY, ALB, LTHM
  - AI Infrastructure: NVDA, AMD, AVGO, MRVL, MU, COHR
  - Small-cap biotech momentum: curated list
  - Each with notes on why included
- [ ] Knowledge library is **data-only** (no UI), imported by builder route as read-only reference

**Checklist (builder prompt rewrite):**
- [ ] New operational questioning flow:
  1. "What specific setup triggers your interest — price action, news event, earnings, insider buying, options flow?" → entry criteria
  2. "How do you know you're wrong — what makes you exit early?" → stop rules
  3. "What sources do you trust most for this strategy?" → monitor seeds (pull from source-catalog)
  4. "What would you Google every morning if you were doing this manually?" → standing query design
  5. "Show me 3 example trades you'd want to take" → validation candidates
- [ ] Builder **MUST** consult knowledge library for the user's described strategy/sector, propose specific sources + seed tickers
- [ ] Builder **MUST** call `get_stock_data` on ≥ 3 candidate tickers before calling `suggest_config` (validate the strategy works on real data)
- [ ] Builder **MUST** output:
  - Operating-manual-style `analystPrompt` (sections: Strategy, Entry Rules, Position Management, Stop/Exit, Intelligence Priorities, Daily Search Queries)
  - Populated `universe` object
  - Domain monitors with `searchQuery` FILLED IN per domain
  - Standing intelligence queries (not generic)

**Checklist (tool/allowlist):**
- [ ] Add `web_search` to builder allowlist in `modes.ts`
- [ ] Add `get_options_flow`, `get_sec_filings` if not already there (confirm against current allowlist)
- [ ] `suggest-config.ts` schema expansion to accept Universe + per-domain searchQuery

**Exit criteria:**
- Test run: "Build me an analyst for EV stocks for long plays"
- Builder output must include:
  - Universe with EV-relevant sectors/industries/themes
  - 5-7 domain monitors with specific queries (e.g., insideevs.com + "EV delivery numbers production ramps")
  - 4-6 standing intelligence queries that are specific not generic
  - Operating-manual analystPrompt with entry rules, position management, exit criteria
  - Validated on 3+ EV tickers via `get_stock_data`
- Commit: `feat: session-4 builder rebuild and knowledge library`

**Out of scope:**
- The editor experience (light refresh OK, but full parity with builder comes later if needed)
- Manager self-improvement (Session 5)
- Monitor archival (Session 5)

---

### Session 5 — Analyst Manager Agent (Self-Improvement)

**Goal:** Build the weekly Manager agent that reviews each analyst's performance and edits the analyst's config, prompt, monitors, and watchlist via tool calls. Every change is versioned and auditable.

**Why sixth:** All the primitives must exist first — Universe (Session 3), clean signals (Session 2), operational playbook builder (Session 4), instrumentation (Session 0). The Manager reads all of these to make decisions.

**Files:**

- `prisma/schema.prisma` — add `AnalystConfigRevision` model
- Migration: `add_analyst_config_revision`
- `lib/agent/modes.ts` — add `"manager"` mode config
- `app/api/agent/[mode]/route.ts` — add manager mode handling
- `lib/agent/manager-system-prompt.ts` — NEW
- `lib/agent/tools/edit-analyst-prompt.ts` — NEW
- `lib/agent/tools/update-intelligence-policy.ts` — NEW
- `lib/agent/tools/update-risk-params.ts` — NEW
- `lib/agent/tools/add-standing-monitor.ts` — NEW
- `lib/agent/tools/archive-monitor.ts` — NEW
- `lib/agent/tools/update-watchlist-managed.ts` — NEW (distinct from run-time `manage_watchlist`)
- `lib/agent/tools/update-universe.ts` — NEW
- `lib/inngest/functions/analyst-manager.ts` — NEW (weekly cron)
- `app/(root)/analysts/[id]/revisions/page.tsx` — NEW (revision history UI)

**Checklist (schema):**
- [ ] Add `AnalystConfigRevision`:
  ```
  id             String   @id @default(cuid())
  analystId      String
  createdAt      DateTime @default(now())
  triggeredBy    String   // "MANAGER_AGENT" | "USER" | "BUILDER"
  runId          String?  // if from a manager run
  field          String   // "analystPrompt" | "intelligencePolicy" | "universe" | "watchlist" | "monitors" | ...
  beforeJson     Json
  afterJson      Json
  reason         String
  trigger        String?  // summary of what prompted the edit (e.g., "3 consecutive AKAM losses")
  @@index([analystId, createdAt])
  ```

**Checklist (edit tools):**
- [ ] Each edit tool:
  - Takes a `reason` parameter (required) explaining why
  - Creates the `AnalystConfigRevision` row before/atomic with the edit
  - Returns a `ToolResult` showing the diff
- [ ] `edit_analyst_prompt`: accepts a list of `{ section, newContent }` edits (structured, not freeform replacement) to avoid prompt drift
- [ ] `update_intelligence_policy`: attention weights, source quality filter, excludedSourceCategories
- [ ] `update_risk_params`: minConfidence, maxPositionSize, maxOpenPositions, directionBias, holdDurations
- [ ] `add_standing_monitor`: creates a permanent Monitor (not expiring), with `origin: "MANAGER_AGENT"`
- [ ] `archive_monitor`: sets `enabled: false` (soft-archive, preserve history)
- [ ] `update_watchlist_managed`: add/remove/re-rank watchlist items
- [ ] `update_universe`: add/remove from sectors/industries/themes/exclusions/exchanges

**Checklist (manager cron):**
- [ ] Weekly cron: `TZ=America/New_York 0 18 * * 0` (Sunday 6 PM ET)
- [ ] Per enabled analyst, gather context:
  - Last 7 days of runs (+ toolStats from Session 0)
  - All theses (direction, confidence, sourcesUsed)
  - All positions opened/closed with outcome + evaluation
  - Signals consumed per thesis (if Session 6 trace is in place; otherwise skip this)
  - Monitors + last-N-days signal output per monitor
  - AccuracyReport for the week
- [ ] Invoke manager agent (GPT-4o, maxSteps 30) with full context + manager system prompt
- [ ] Persist the run as a `ResearchRun` with `agentMode: "manager"` so it renders in the run feed

**Checklist (manager system prompt — high-level structure):**
- [ ] Frame the Manager as a PM reviewing an analyst's weekly performance
- [ ] 6-stage flow:
  1. **Review** — read trades, theses, accuracy
  2. **Diagnose** — what worked, what didn't, pattern identification (AKAM-style contradictions)
  3. **Signal audit** — which monitors produced winning signals, which produced noise
  4. **Watchlist audit** — which items have been dormant, which should be promoted
  5. **Strategy audit** — is the analystPrompt matching actual behavior? Drift detected?
  6. **Act** — make specific edits via tools, each with a `reason`
- [ ] Manager MUST propose ≥ 1 edit per week (even if small) or explicitly state "no changes recommended" with justification

**Checklist (UI):**
- [ ] `/analysts/[id]/revisions` — list of revisions with before/after diff view
- [ ] Revision detail shows `reason` prominently
- [ ] Link from each run of the Manager to its resulting revisions
- [ ] Minimal ShadCN — no custom styling

**Checklist (dynamic monitor dedup):**
- [ ] In `add-standing-monitor` and briefing-agent monitor creation paths, check for existing active monitor with similar searchQuery (fuzzy match on normalized query string) and either reuse or refuse
- [ ] Auto-archive monitors whose `expiresAt` has passed AND which produced no signals in their lifetime

**Exit criteria:**
- Manually trigger `analyst-manager` Inngest function for one analyst
- Manager run completes, creates ≥ 1 `AnalystConfigRevision`
- `/analysts/[id]/revisions` shows the change with reason
- Next research run picks up the edited config
- Commit: `feat: session-5 analyst manager agent and revision model`

**Out of scope:**
- Signal→thesis trace (Session 6) — Manager uses heuristics until trace lands
- Source quality feedback from trade outcomes (Session 6)
- Manager-initiated cross-analyst recommendations

---

### Session 6 — Signal → Outcome Feedback Loop

**Goal:** Close the learning loop. When a position closes, trace back through Thesis → Signals → Monitors → Sources and update quality scores based on the outcome.

**Why seventh:** Requires Manager (Session 5) to exist so quality updates feed into weekly config edits. Requires clean routing (Session 3) so the trace is accurate.

**Files:**
- `prisma/schema.prisma` — add `sourceSignalIds String[]` to Thesis, add `contributedMonitorIds String[]` via join or array
- Migration: `add_thesis_signal_trace`
- `lib/agent/tools/record-thesis.ts` — persist consumed signal IDs
- `lib/agent/tools/read-signals.ts` — mark signals as "seen" by run, return IDs for later trace
- `lib/inngest/functions/trade-evaluator.ts` — on position close, update monitor/source quality
- `lib/inngest/functions/accuracy-scorer.ts` — surface per-monitor ROI into weekly report
- `app/(root)/intelligence/page.tsx` — populate "Monitor ROI" card stubbed in Session 0

**Checklist (trace):**
- [ ] `read_signals` tool adds `seenByRun: runId` to `AnalystSignalRoute` rows it returns
- [ ] `record_thesis` tool accepts an optional `sourceSignalIds: string[]` and persists it
- [ ] Agent system prompt (Session 1 base): add "When recording a thesis, include the signal IDs that informed it"
- [ ] Migration backfill: existing theses get empty `sourceSignalIds` (historical, can't reconstruct)

**Checklist (feedback):**
- [ ] On position close in `trade-evaluator.ts`:
  - Look up the Thesis → its `sourceSignalIds`
  - For each signal: fetch its `monitorId` and `sourceUrls` (derive domains)
  - Compute outcome value: win (+1), loss (-1), breakeven (0), weighted by P&L magnitude
  - Update `Monitor.successScore` (new column) — rolling average of outcomes for signals that led to trades
  - Update per-domain `sourceQuality` table (new model or Monitor config JSON field) — rolling average
- [ ] New model or existing-Monitor-field:
  ```
  Monitor.successScore    Float?   // rolling avg (-1 to +1)
  Monitor.tradesSourced   Int      @default(0)
  Monitor.winsSourced     Int      @default(0)
  Monitor.lossesSourced   Int      @default(0)
  ```
- [ ] `accuracy-scorer` includes per-monitor performance in weekly AccuracyReport
- [ ] Manager agent (Session 5) reads these scores and decides to archive low-success monitors

**Checklist (UI):**
- [ ] Run detail: each Thesis card shows "Informed by N signals" with expansion to list them
- [ ] Intelligence dashboard: "Monitor ROI" table — monitor name, signals last 30d, trades sourced, wins, losses, success score
- [ ] Analyst revision history (Session 5) now includes entries like "Archived monitor 'X' — 0 winning trades in 6 weeks" with justification pulled from success score

**Exit criteria:**
- Close a test position, verify:
  - Thesis.sourceSignalIds is populated
  - Linked Monitors' success scores updated
  - Intelligence dashboard shows the ROI delta
- Manager run references success scores in its weekly edits
- Commit: `feat: session-6 signal to outcome feedback loop`

**Out of scope:**
- Full UX polish of the intelligence dashboard (Session 7)
- Per-source (domain-level) quality separate from per-monitor quality (nice-to-have, not blocker)

---

### Session 7 — UX & Observability Polish

**Goal:** Make everything built in Sessions 0-6 visible and navigable. Close the loop between what the system does and what the user sees.

**Why last:** UX should reflect a stable system. Polishing dashboards before the underlying data model stabilizes = rework.

**Files:**
- `app/(root)/intelligence/page.tsx` — full monitor ROI dashboard + signal dedup metrics
- `app/(root)/runs/[id]/page.tsx` — expand toolStats block, add discovery bucket indicator, signal-trace view
- `app/(root)/analysts/[id]/revisions/page.tsx` — polish from Session 5
- `app/(root)/performance/page.tsx` — add "signal quality" dimension
- `components/analysts/AnalystDiaryTimeline.tsx` — NEW: chronological view of analyst evolution

**Checklist:**
- [ ] Intelligence dashboard:
  - Monitor ROI table (from Session 6)
  - Signal dedup rate (how many signals were collapsed by fingerprint)
  - Novelty distribution histogram (visualize Session 2 scoring)
  - Discovery bucket fill rate (% of briefs with discovery signals)
- [ ] Run detail:
  - Discovery bucket indicator — "Researched N new tickers this run"
  - Per-thesis signal trace — clickable chain signal → thesis → position
  - Time-in-position warnings displayed prominently
  - Concentration risk narration surfaced
- [ ] Analyst detail:
  - "Diary" timeline — merge revisions + runs + trades into one chronological feed
  - "Current operating manual" view — parsed analystPrompt sections (Strategy / Entry / Position Mgmt / Exit / Intelligence)
- [ ] Performance:
  - Win rate by signal type
  - Win rate by monitor
  - Win rate by discovery vs watchlist vs position origin
- [ ] All visuals Recharts or ShadCN primitives only; no custom chart lib

**Exit criteria:**
- Every piece of data produced by Sessions 1-6 has at least one UI surface
- Commit: `feat: session-7 ux and observability polish`

**Out of scope:**
- New agent capabilities
- New models or tools
- Mobile app / responsive polish beyond what ShadCN provides

---

## Master Checklist

Flat list, session-tagged. Tick off as you go. `~` = partial / in a different shape than originally specified but functionally covered.

### Session 0 — Verification & Instrumentation
- [x] Fix CLAUDE.md tool path (tools.ts → tools/index.ts)
- [x] Fix CLAUDE.md model references (Claude → GPT-4o)
- [x] Add `manage_position` as tool #17 in CLAUDE.md
- [x] Note Universe stub in CLAUDE.md (completed in Session 3, CLAUDE.md now has full Universe section)
- [ ] Add `toolStats` aggregator in agent route _(user-owned, separate session)_
- [ ] Persist `toolStats` to `ResearchRun.parameters` _(user-owned)_
- [ ] Warning log for runs < 60s or < 5 tool calls _(user-owned)_
- [ ] `<ToolStatsBlock>` on `/runs/[id]` _(user-owned)_
- [ ] Research alternate OpenAI models (GPT-5, o3, o4) _(deferred — GPT-4o stable)_

### Session 1 — Prompt Obedience
- [x] Operating Manual Framing header above analystPrompt
- [x] Stage 2: mandatory `get_stock_data` per open position
- [x] Stage 2: concentration risk narration required
- [x] Stage 2: time-in-position injection for DAY holds
- [x] Stage 3: ≥ 2 new-ticker research regardless of capacity
- [x] Stage 4: `manage_position` consideration per position
- [x] Remove "near max positions" escape hatch
- [x] Minimum tool call floors per stage
- [x] Strip references to nonexistent tools
- [x] Signal quality narration in summary
- [x] Raise maxSteps 30 → 50 _(done earlier, verified in `lib/agent/modes.ts`)_
- [x] Set temperature 0.2 _(done earlier, verified in route)_

### Session 2 — Signal Pipeline Foundation _(delivered by signals session)_
- [x] Per-monitor `config.searchQuery` in domain-monitor
- [x] Fallback `defaultQueryFor(monitor)` helper
- [x] Signal `signalFingerprint` column + index
- [x] `computeSignalFingerprint()` helper
- [x] Backfill existing signals _(script + in-line fingerprint on new signals; old rows fill opportunistically)_
- [x] Tiered dedup windows (1d/3d/7d by urgency)
- [x] `noveltyScore` computed at routing time
- [x] Novelty as multiplier, not additive
- [x] Novelty-gated threshold routing

### Session 3 — Discovery & Universe
- [x] AgentConfig Universe fields (sectors, industries, themes, caps, exclusions) _(prices + exchanges deferred; not blocking)_
- [x] Migration `add_universe_to_agent_config`
- [x] Universe loaded into `AnalystProfile`
- [x] Tier-aware routing (T1/T2/T3/T4/T5) _(delivered by signals session)_
- [x] Analyst-owned signal fast-path _(signals session)_
- [x] Discovery bucket (≥ 20% reserved slots) _(signals session, via `intelligencePolicy.discoveryAttention`)_
- [x] `routeReason` tagged on routes _(now `routeReasonCode` + `matchedUniverse` JSON)_
- [x] Cross-analyst routing with penalty _(signals session)_
- [x] Morning brief forced discovery slot _(signals session)_
- [~] `read_signals` returns 3 buckets _(signals session: returns routed signals + ordered by score; explicit bucket labels deferred to Session 7 UX)_
- [x] Universe UI on analyst detail _(B6: `AnalystConfigSheet` ChipListEditor + MarketCapInput for all 4 Universe dims + exclusion list)_

### Session 4 — Builder + Knowledge Library
- [x] `strategy-archetypes.ts` (10+ archetypes)
- [x] `source-catalog.ts` (sector × strategy × domain)
- [x] `signal-type-catalog.ts`
- [x] `watchlist-seeds.ts` (themed starter lists) _(basic version; cold-start seed logic is a "nice to have", see Outstanding Work)_
- [x] Builder operational questioning flow _(ask_question tool + Tool-UI Question Flow library)_
- [x] Builder mandates knowledge library consultation _(hard rule in `BUILDER_SYSTEM_PROMPT`)_
- [~] Builder mandates validation _(shifted to: mandatory `get_market_context` + `discover_signals_for_fence` before `suggest_config`; `get_stock_data` optional spot-check. More grounded than a fixed count.)_
- [x] Builder outputs operating-manual analystPrompt _(prompt spec enforces 5-paragraph structure)_
- [x] Builder outputs populated Universe _(all 4 fields required in `suggest_config`)_
- [x] Builder outputs per-domain `searchQuery` _(via `domainMonitorProposal` / `intelligenceQueries`)_
- [x] `web_search` added to builder allowlist
- [x] `suggest-config` schema expansion _(Universe fields + intelligence proposals)_

### Session 5 — Analyst Manager _(user-owned; not started this round)_
- [ ] `AnalystConfigRevision` model + migration
- [ ] Manager mode in `modes.ts`
- [ ] Manager system prompt
- [ ] `edit_analyst_prompt` tool
- [ ] `update_intelligence_policy` tool
- [ ] `update_risk_params` tool
- [ ] `add_standing_monitor` tool
- [ ] `archive_monitor` tool
- [ ] `update_watchlist_managed` tool
- [ ] `update_universe` tool
- [ ] Weekly `analyst-manager` Inngest cron
- [ ] Manager run persists as ResearchRun
- [ ] `/analysts/[id]/revisions` UI
- [ ] Dynamic monitor dedup at creation
- [ ] Auto-archive expired zero-signal monitors

### Session 6 — Feedback Loop
- [ ] `Thesis.sourceSignalIds` column + migration
- [ ] `Monitor.successScore`, `tradesSourced`, `winsSourced`, `lossesSourced`
- [ ] `read_signals` marks seen
- [ ] `record_thesis` persists signal IDs
- [ ] `trade-evaluator` updates monitor scores on close
- [ ] `accuracy-scorer` surfaces per-monitor ROI
- [ ] Manager reads success scores
- [ ] Intelligence dashboard Monitor ROI table

### Session 7 — UX Polish
- [ ] Intelligence dashboard (ROI, dedup rate, novelty histogram, discovery fill rate)
- [ ] Run detail (discovery indicator, signal trace, concentration, time-in-position)
- [ ] Analyst detail Diary timeline
- [ ] Analyst detail parsed operating manual view
- [ ] Performance page signal quality dimensions

---

## How To Not Lose Context Between Sessions

The crashes you've hit are caused by loading too much live code + analysis into a single Claude Code session. Mitigations baked into this plan:

1. **This doc IS the persistence layer.** Every session opens by reading this file. The summaries in Rounds 1/2/3 contain the analysis; no session ever needs to reconstruct it from scratch.
2. **One session = one layer.** Do not combine Sessions 2 + 3 in one go. The dependency chain is real but each is independently deployable.
3. **Exit with a commit.** Every session's exit criteria end in a commit. If you crash mid-session, you restart from the last commit + this doc — not from reading 40 files.
4. **Verify, don't re-explore.** If a session needs to know "is X wired up?", it's in the Verified Ground Truth section. Add to that section as facts accumulate.
5. **Session N+1 starts with:** "Read AGENT_OVERHAUL_PLAN.md, verify Session N completion log, then execute Session N+1 checklist."
6. **If a session hits its context limit:** finish the current file in progress, commit, update the completion log with "partial — resumed next session", and stop. DO NOT try to cram.

---

## Session Completion Log

Append entries as sessions complete. Format:

```
### Session N — <title>
- **Completed:** YYYY-MM-DD
- **Commit:** <SHA>
- **Scope delivered:** bullet list
- **Scope deferred:** bullet list (with target session)
- **Notes:** surprises, deviations, follow-ups
```

### Session 0 — Verification & Instrumentation
- **Completed:** 2026-04-14 _(CLAUDE.md fixes only; `toolStats` deferred)_
- **Commit:** rolled into `7ca080a` (Session 1 commit)
- **Scope delivered:** CLAUDE.md tool path + model references + `manage_position` documented; Universe section added post-Session 3.
- **Scope deferred:** `toolStats` aggregator + `<ToolStatsBlock>` + run-length warning — user-owned, tracked in Outstanding Work below.
- **Notes:** GPT-5 / o3 / o4 exploration deferred; GPT-4o stable with `temperature: 0.2` + `maxSteps: 50`.

### Session 1 — Prompt Obedience
- **Completed:** 2026-04-14
- **Commit:** `7ca080a` — "feat: session-1 system prompt enforcement"
- **Scope delivered:** Operating Manual framing; Stage 2 per-position `get_stock_data` + concentration + time-in-position; Stage 3 ≥ 2 new-ticker research; Stage 4 `manage_position` consideration; removed capacity escape hatch; per-stage tool floors; nonexistent-tool references stripped; signal quality narration; temperature 0.2; maxSteps 50.
- **Scope deferred:** None.
- **Notes:** Foundation for all later gates — every downstream session assumes this prompt shape.

### Session 2 — Signal Pipeline Foundation
- **Completed:** 2026-04-15 _(by parallel signals session, merged into main as PR #149)_
- **Merge commit:** `cef3e49` — "Sessions 2+3: Signal pipeline + universe discovery routing (#149)"
- **Scope delivered:**
  - `domain-monitor.ts` rewritten to run **one Sonar search per monitor** using
    `config.searchQuery`. Removed the hardcoded generic query at line 95.
  - Added `defaultQueryFor(monitor)` fallback that pulls analyst sectors +
    top strategy keywords; logs a warning when used so we can find monitors to
    populate.
  - `searchContext` now records whether the configured or fallback query was
    used (`:configured_query` vs `:fallback_query`).
  - New `Signal.signalFingerprint` column + `(signalFingerprint, createdAt)`
    index. Migration `20260415000000_add_signal_fingerprint`.
  - `computeSignalFingerprint(headline, primary ticker, ISO week bucket)` helper
    in `lib/intelligence/signals.ts`. Populated on every new signal in
    `createSignal()`.
  - One-shot `backfillSignalFingerprint` Inngest function, event
    `intelligence/backfill-signal-fingerprint`. Idempotent — only touches
    rows where `signalFingerprint IS NULL`. Registered in `app/api/inngest/route.ts`.
  - `deduplicateSignals()` rewritten with **tiered windows**:
    BREAKING urgency → 1 day; NEWS / EARNINGS → 3 days; everything else →
    7 days. Comparison key is `signalFingerprint`, with on-the-fly recompute
    for pre-backfill rows that still have `null`.
  - `signal-router.ts` now computes `noveltyScore` **per (analyst, signal) at
    routing time** against the analyst's last 7 days of routes.
    Tiered: never seen → 80, 1–2× → 50, 3–5× → 20, 6+× → 5.
  - Novelty applied as a **multiplier** on raw relevance, not additive. Stale
    signals collapse below threshold instead of crowding the top-N.
  - Signals with `noveltyScore < 20` drop entirely **unless urgency is
    BREAKING**.
  - `AnalystSignalRoute` schema gained `rawRelevanceScore` and `noveltyScore`
    columns so the routing decision is debuggable; `relevanceScore` now stores
    the novelty-adjusted final value.
- **Scope deferred:** none — full Session 2 checklist complete.
- **Notes:**
  - Migration also adds the two new `AnalystSignalRoute` columns (raw + per-route
    novelty). Bundled into the same `add_signal_fingerprint` migration to keep
    the schema/route changes atomic on deploy.
  - Existing routes have `rawRelevanceScore = NULL` and `noveltyScore = NULL` —
    historical, can't reconstruct. New routes populate both.
  - The grouped `analystId+scope` Sonar fan-out in `domain-monitor.ts` is gone:
    each monitor now does its own search. This costs more API calls but each
    one is targeted; the per-monitor `lastRunAt` is now accurate too.
  - `searchDomain` is still called with a single-domain array per monitor, so
    domain-filtered search semantics are preserved.
  - Recent route history for novelty math is loaded once per routing run (one
    query per analyst, not per signal).
  - To run the backfill in production: trigger event
    `intelligence/backfill-signal-fingerprint` from the Inngest dashboard. Safe
    to re-run; it stops when no `null` rows remain.
  - Workstream B's `discover_signals_for_fence` tool reads `Signal` + `sourceQuality` — dependent on this Session 2 schema; now compatible post-merge.

### Session 3 — Discovery & Universe Model
- **Completed:** 2026-04-14 (Workstream B1: schema/profile) + 2026-04-15 (signals session: router) + 2026-04-14 (B6: UI)
- **Commits:**
  - `3db6413` — "feat: workstream-b1 universe primitive on AgentConfig" — schema migration, `industries` / `themes` / `marketCapMin` / `marketCapMax` fields, `AnalystProfile` type, `checkUniverse()` helper, context threading.
  - `53d77a1` — "feat(agent): thread Universe fence through prompts, context, and tool guardrails" — prompt contract; `get_stock_data` + scan tools see the fence.
  - `1e4d383` — "B6: Settings UI — 4 Universe fields editable + markdown prompt render" — `AnalystConfigSheet` ChipListEditor + MarketCapInput; `analyst.actions` BigInt coercion for marketCap; `Markdown` render of analystPrompt.
  - Signals session: tier-aware routing, cross-analyst penalty, discovery bucket, `routeReasonCode` + `matchedUniverse` JSON on `AnalystSignalRoute`.
- **Scope delivered:** Universe fields on `AgentConfig`; migration shipped; profile wiring; router honors fence + discovery bucket; UI CRUD for all 4 Universe dims + exclusion list.
- **Scope deferred:**
  - Prices (minPrice/maxPrice) + exchanges — not needed for first cut; analysts use `marketCapMin` as proxy.
  - Explicit 3-bucket return shape for `read_signals` — router returns scored signals today; bucket labels deferred to Session 7 UX.
  - Findings page UI for `routeReasonCode` / `matchedUniverse` — deferred to Session 7.
- **Notes:** This is the most cross-session feature. The overlap with the signals session was managed via a handoff doc (`docs/universe-handoff-for-signals-session.md`, committed `31d93f5`). Schema conflict resolution on rebase: keep `3db6413` columns, drop any duplicate column definitions in the signals session's migration.

### Session 4 — Builder Rebuild + Knowledge Library
- **Completed:** 2026-04-14
- **Commits:**
  - `27431eb` — "feat(agent): knowledge library — archetypes, sources, signal types + reader tool" — `lib/agent/knowledge/strategy-archetypes.ts`, `source-catalog.ts`, `signal-type-catalog.ts`, `watchlist-seeds.ts`; `read_knowledge_library` tool.
  - `7a6337a` — "B4a: ask_question tool backed by Tool-UI Question Flow library" — structured interview tool + Tool-UI Question Flow shadcn components at `components/tool-ui/question-flow/`; `AskQuestionRenderer`.
  - `ea295d3` — "B4: builder interview flow + discover_signals_for_fence + prompt gates" — `discover_signals_for_fence` tool; `BUILDER_SYSTEM_PROMPT` rewrite (5-step pipeline + hard gates); builder allowlist tightened.
  - `4a57973` — "B5: editor parity — inbox-grounded edits + same interview gates" — `read_analyst_inbox_stats` tool; `buildEditorSystemPrompt` rewrite; editor allowlist.
  - `1e4d383` — web_search added to builder allowlist (see B6 commit).
- **Scope delivered:** Knowledge library (3 catalogs + seeds); `read_knowledge_library` reader; `ask_question` tool with Tool-UI Question Flow UI; `discover_signals_for_fence` real-signal grounding; `read_analyst_inbox_stats` editor tool; builder + editor system prompts rewritten with hard interview gates; `suggest_config` still serves both.
- **Scope deferred:**
  - Cold-start watchlist seeding: the current builder path leans on `discover_signals_for_fence.tickerFrequency` for watchlist seeds. `watchlist-seeds.ts` exists as a catalog but isn't actively queried — fine for now, revisit if discovery returns empty often.
  - "≥ 3 `get_stock_data` validations" as originally spec'd — shifted to "mandatory `get_market_context` + `discover_signals_for_fence` + optional spot-checks" which is a better fit for the real-data signals approach.
- **Notes:** Builder + Editor share 90% of the scaffolding — unified route at `app/api/agent/[mode]/route.ts` means the only per-mode differences are (a) system prompt, (b) tool allowlist, (c) `hasSuggestConfig` flag, (d) maxSteps/maxDuration. Both land through the same pipeline.

### Session 5 — Analyst Manager Agent
- **Completed:** _(not started — user-owned, future session)_
- **See:** "Outstanding Work / Future Sessions" below.

### Session 6 — Signal → Outcome Feedback Loop
- **Completed:** _(not started — future session)_
- **See:** "Outstanding Work / Future Sessions" below.

### Session 7 — UX & Observability Polish
- **Completed:** _(not started — future session)_
- **See:** "Outstanding Work / Future Sessions" below.

---

## Outstanding Work / Future Sessions

Maintained as a single source of truth so next session doesn't have to diff 10 commits to figure out what's left.

### A. toolStats instrumentation (Session 0 leftover)
_User-owned._ Still valuable for detecting runs that degenerate ("ran 30s, 2 tools, 0 trades"). Surface area:
- `app/api/agent/[mode]/route.ts` onStepFinish — aggregate `{ tool → count, avgLatencyMs, errors }`.
- Persist to `ResearchRun.parameters.toolStats` on completion.
- Warning log when run < 60s or < 5 tool calls.
- `<ToolStatsBlock>` on `/runs/[id]` next to the existing RunSummaryCard.

### B. Manager agent (Session 5)
_User-owned._ Fourth mode (after research-run / builder / editor). Reads last 30d of AnalystSignalRoute + trade outcomes, proposes prompt/Universe/monitor changes, persists as `AnalystConfigRevision`. Surface area is mostly new code; the shared route and modes system is ready for a 4th entry.

Out-of-the-box reuses:
- `[mode]/route.ts` — add "manager" case with its own system prompt + allowlist.
- `ask_question` + `read_knowledge_library` + `read_analyst_inbox_stats` + `discover_signals_for_fence` all already usable.
- New tools needed: `edit_analyst_prompt`, `update_intelligence_policy`, `update_risk_params`, `add_standing_monitor`, `archive_monitor`, `update_watchlist_managed`, `update_universe`.
- New model: `AnalystConfigRevision` { id, analystId, beforeJson, afterJson, rationale, createdAt }.
- New cron: `analyst-manager` Inngest function, weekly, per-analyst.
- New page: `/analysts/[id]/revisions`.
- Dedup + auto-archive of zero-signal Monitors belongs here.

### C. Feedback loop (Session 6)
_Not started._ Close the loop so monitor quality compounds. Concrete:
- Schema: `Thesis.sourceSignalIds String[]`, `Monitor { successScore Decimal, tradesSourced Int, winsSourced Int, lossesSourced Int }`.
- `read_signals` marks signals seen (analyst exposure ≠ read).
- `record_thesis` persists `sourceSignalIds` from the signals in context at thesis-time.
- `trade-evaluator` (Inngest) on close: for each closed Position, find the sourcing Thesis → find the sourceSignalIds → find the Monitors behind them → bump `winsSourced` / `lossesSourced` and recompute `successScore`.
- `accuracy-scorer` weekly: aggregate monitor ROI.
- Manager agent (Session 5) reads `Monitor.successScore` to decide which monitors to archive vs. scale.
- Dashboard: "Monitor ROI" table on `/intelligence`.

### D. UX & Observability (Session 7)
_Not started._ Every piece of data produced above needs a UI surface.
- `/intelligence` — ROI table, dedup rate, novelty histogram, discovery fill-rate panel.
- `/runs/[id]` — discovery-indicator badge per thesis, signal-trace (which signal → which thesis), concentration warning, time-in-position for DAY holds.
- `/analysts/[id]` — Diary timeline (revisions + notable runs), parsed operating-manual view of analystPrompt.
- `/performance` — signal-quality dimension breakdown.

### E. Signals-session flagged gaps (merge-time attention)
Things the signals session noted but that live outside their scope. If you're picking these up, they're small:
- **Monitor firm-scoping (207 → 40).** Many auto-created monitors on the firm level are redundant. Dedup by `(type, config.domain)` for DOMAIN and `(type, config.query)` for SEARCH.
- **Email ingestion handler.** `SignalSource.EMAIL_INGEST` enum value exists; no handler route yet. Needs `/api/intelligence/email-ingest` that parses Postmark / SES webhooks into Signals.
- **Findings page `routeReasonCode` + `matchedUniverse` UI.** Router now tags every route with reason code + JSON of what matched; intelligence dashboard should show this per-signal so analyst operators can debug routing.
- **Monitor table layout fixes.** ShadCN Table pass — long `query` strings overflow; add `truncate` + tooltip.
- **Monitor creation dedup.** When the builder's `suggest_config` proposes monitors, de-duplicate against the user's existing monitors before creating (exact match on domain or normalized query).

### F. Small residuals from B-workstream
- **`watchlist-seeds.ts` cold-start fallback.** Catalog exists, nothing queries it. When `discover_signals_for_fence` returns empty and the user hasn't named tickers, optionally pull from seeds. Not urgent.
- **`get_stock_data` universe warning is informational only.** By design — agent still sees the result and decides. If we want a hard reject instead, flip to `ok: false, retryable: false` inside the tool.
- **Tool-UI Question Flow library lock-in.** Pinned at install. If the library publishes breaking changes, we're stable; just don't blindly re-run `shadcn add @manifest/question-flow`.

### G. Rebase / deploy checklist (for this branch)
1. Signals branch merges to main.
2. On this branch: `git fetch origin && git rebase origin/main`.
3. Expected conflicts (3 files):
   - `prisma/schema.prisma` — keep both Universe columns (ours) and signal-pipeline columns (theirs). Do NOT accept "both sides" blindly; read each column.
   - `lib/actions/analyst.actions.ts` — our Universe field changes vs. their signal-side additions, if any.
   - `components/analysts/AnalystConfigSheet.tsx` — our Universe UI vs. any settings changes they made.
4. Drop any duplicate migration files creating the same columns. Keep the single source migration per column.
5. `pnpm prisma migrate dev --name consolidated_universe_and_signals` if needed; otherwise `prisma generate`.
6. `pnpm tsc --noEmit` clean.
7. User runs the migration against prod.
8. Deploy.

---

_This doc is the persistence layer. Next session opens by reading it; every future session appends to the Completion Log._
