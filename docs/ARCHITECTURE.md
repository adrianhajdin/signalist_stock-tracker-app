# V2 Architecture Spec: Analyst → Run → Decisions → Actions → Brief

> This is the source-of-truth design document for the V2 run architecture.
> Each phase implementation guide (`v2-phase-1.md`, `v2-phase-2.md`, `v2-phase-3.md`) references this spec.

## Problem Statement

The current run flow has become muddled:
- Inputs (portfolio, watchlist, theses, memory) are inconsistently provided
- Runs behave like per-stock mini agents instead of a portfolio manager
- Portfolio-level decision synthesis is unclear
- `get_portfolio_state` / review responsibilities are confused
- Watchlist usage is unclear
- Brief generation is opaque
- UI artifacts are not clearly defined

## Product Concept

This is an **agent-based portfolio manager**.

Each Analyst agent has a strategy, portfolio, watchlist, theses, and memory.
Each day an Analyst performs a Run. During a run the analyst:
1. Understands the market
2. Reviews current holdings
3. Reviews relevant watchlist items
4. Discovers new opportunities
5. Forms or updates theses
6. Decides portfolio actions (holistically, not per-ticker)
7. Executes trades or watchlist edits
8. Produces a Brief for the next day

The Brief makes the next run smarter — it's the memory system.

---

## 1) INPUT MODEL — How Analyst State Enters a Run

### Injected Automatically (system prompt context, NOT tools)

```typescript
interface RunInput {
  // === IDENTITY (persistent, from AgentConfig) ===
  analyst: {
    name: string
    mandate: string           // analystPrompt
    voice?: string
    directionBias: "LONG" | "SHORT" | "BOTH"
    holdDurations: string[]
    sectors: string[]         // empty = all
    exclusionList: string[]
    minConfidence: number
    maxPositionSize: number
    maxOpenPositions: number
  }

  // === PORTFOLIO (live snapshot, queried at run start) ===
  portfolio: {
    cash: number
    buyingPower: number
    portfolioValue: number
    positions: Array<{
      symbol: string
      direction: "LONG" | "SHORT"
      quantity: number
      avgCost: number
      currentPrice: number        // from Alpaca
      unrealizedPnl: number
      unrealizedPnlPct: number
      targetPrice: number | null
      stopLoss: number | null
      exitStrategy: string
      daysHeld: number
      activeThesisId: string | null
      activeThesisSummary: string | null
    }>
    exposure: {
      long: number
      short: number
      net: number
      utilizationPct: number
    }
  }

  // === WATCHLIST (persistent, from AnalystWatchlistItem) ===
  watchlist: Array<{
    symbol: string
    reason: string
    priority: "HIGH" | "NORMAL" | "LOW"
    thesisDirection: "LONG" | "SHORT" | null
    targetPrice: number | null
    stopPrice: number | null
    conviction: number | null
    catalyst: string | null
    daysOnList: number
    lastReviewedDaysAgo: number
  }>

  // === ACTIVE THESES (most recent per ticker with open position/watchlist) ===
  activeTheses: Array<{
    id: string
    ticker: string
    direction: "LONG" | "SHORT"
    confidence: number
    reasoningSummary: string
    entryPrice: number
    targetPrice: number | null
    stopLoss: number | null
    createdAt: string
    runId: string
  }>

  // === PRIOR BRIEF (most recent AnalystBriefing) ===
  priorBrief: {
    date: string
    narrative: string
    strategyNotes: string
    watchTomorrow: Array<{
      symbol: string
      trigger: string
      action: string
    }>
    unresolvedItems: string[]
    marketPosture: string
  } | null

  // === PERFORMANCE (from AccuracyReport) ===
  performance: {
    winRate: number | null
    totalTrades: number
    recentStreak: string | null
    calibrationNote: string | null
  } | null

  // === RECENT CLOSED TRADES (last 10) ===
  recentClosedTrades: Array<{
    symbol: string
    direction: string
    outcome: "WIN" | "LOSS" | "BREAKEVEN"
    pnlPct: number
    closeReason: string
    daysHeld: number
    lesson: string | null
  }>
}
```

### What Is NOT Injected
- Raw candle data (use tools)
- News headlines (use tools)
- Full thesis text (only summaries)
- Other analysts' portfolios (isolation)
- Multiple prior briefings (one brief is enough — it self-compresses)

### Key Change
**Current:** Loads 3 briefings + positions + watchlist + 20 closed trades + accuracy + passes as flat markdown.
**V2:** Single `RunInput` object → structured system prompt. One brief. Portfolio includes live prices. Active theses are first-class.

---

## 2) TOOL MODEL

### Sensors (Read External World) — 8 tools

| Tool | Purpose | Status |
|------|---------|--------|
| `get_market_context` | SPY/VIX/sectors/regime/themes | Keep |
| `scan_candidates` | Multi-source discovery | Keep (remove watchlist scoring — watchlist is injected) |
| `get_stock_data` | Quote + profile + financials + technicals + news | Keep |
| `get_social_sentiment` | Reddit + StockTwits | Keep |
| `get_options_flow` | Unusual options activity | Keep |
| `get_sec_filings` | SEC EDGAR filings | Keep |
| `search_reddit` | Topic search | Keep |

### Actuators (Change State) — 5 tools

| Tool | Purpose | Status |
|------|---------|--------|
| `place_trade` | Open position via Alpaca | Keep |
| `close_position` | Close position via Alpaca | Keep |
| `manage_watchlist` | ADD/REMOVE/UPDATE watchlist | Keep |
| `record_thesis` | Persist thesis (renamed from `show_thesis`) | Rename |
| `complete_run` | Mark done + produce brief (renamed from `summarize_run`) | Rename + restructure |

### Removed
- **`get_portfolio_state`** — Portfolio is injected input. Trade/close tools return updated state.

### Total: 13 tools (down from 14)

---

## 3) RUN WORKFLOW — 7 Phases

```
Phase 1: ORIENT           (1 step)    — get_market_context
Phase 2: REVIEW HOLDINGS   (1-6 steps) — triage positions, research those needing attention
Phase 3: REVIEW WATCHLIST  (1-4 steps) — triage watchlist, research triggered items
Phase 4: DISCOVER          (2-8 steps) — conditional on capacity
Phase 5: SYNTHESIZE        (0 steps)   — decision table (pure reasoning, no tools)
Phase 6: EXECUTE           (1-5 steps) — trades, closes, watchlist changes
Phase 7: BRIEF             (1 step)    — complete_run with structured brief
```

### Phase 2 Triage Logic
- **Must review:** Near target/stop (>80%), earnings this week, watchTomorrow triggers
- **Should review:** Held > expected duration, > 5% loss
- **Can skip:** Healthy positions within thesis, recently reviewed

### Phase 4 Conditions
Skip/minimize discovery when:
- At max positions
- RISK_OFF regime + defensive portfolio
- Prior brief says "no new positions"

### Phase 5 — The Core Innovation
Pure reasoning. No tool calls. Agent produces a decision table considering:
- Current exposure (long/short/net)
- Risk budget (buying power, max positions)
- Conflicting decisions
- Position sizing
- Priority ranking

---

## 4) THESIS MODEL — Persistent, Living Documents

### Lifecycle
```
ACTIVE → { INVALIDATED | CLOSED | SUPERSEDED }
```

### Schema Additions (Phase 3)
```
status: ThesisStatus (ACTIVE | INVALIDATED | CLOSED | SUPERSEDED)
parentThesisId: String? (links to prior thesis on same ticker)
invalidatedAt: DateTime?
invalidReason: String?
```

### How Runs Update Theses
1. Still valid → no new thesis
2. Needs update → `record_thesis` with `parentThesisId` → parent marked SUPERSEDED
3. Invalidated → `record_thesis` PASS with `parentThesisId` → parent marked INVALIDATED

---

## 5) WATCHLIST MODEL

### Additions (Phase 2)
```
triggerCondition: String? ("price < 145", "RSI < 30")
reviewFrequency: String? ("DAILY" | "WEEKLY" | "ON_CATALYST")
addedRunId: String?
lastThesisId: String?
```

### Lifecycle
```
ADDED → ACTIVE → { GRADUATED | REMOVED | EXPIRED }
```

---

## 6) DECISION SYNTHESIS

### Decision Table (Phase 5 output)

```typescript
type DecisionAction =
  | "INITIATE" | "ADD" | "HOLD" | "REDUCE" | "EXIT"
  | "WATCH" | "REMOVE_WATCH" | "PASS"
```

Agent produces as markdown table + portfolio rationale. Not a tool — the core reasoning output.

### Persistence
`TradeDecision.decision` expanded to support all action types.

---

## 7) EXECUTION MODEL

### Rules
1. Execute in priority order from Decision Table
2. Exits before entries (frees capital + slots)
3. Thesis before trade (`thesis_id` required)
4. One position per ticker per analyst (DB constraint)
5. No duplicate trades across analysts (existing check)

### Failure Handling
Log error → skip action → continue → note in brief

---

## 8) BRIEF SYSTEM

### Structure

```typescript
interface Brief {
  // Structured (machine-readable, feeds next run)
  date: string
  marketPosture: string
  portfolioSnapshot: { positionCount, totalInvested, unrealizedPnl, cashRemaining, biggestWinner, biggestLoser }
  watchTomorrow: Array<{ symbol, trigger, suggestedAction, priority }>
  unresolvedItems: Array<{ item, impact, affectedPositions }>
  selfCorrections: Array<{ observation, adjustment }>

  // Narrative (human-readable)
  narrative: string
  strategyNotes: string
}
```

### Key Change
`complete_run` tool accepts structured brief fields from the agent. GPT-4o-mini still generates narrative. But watchTomorrow, unresolvedItems, selfCorrections come from the agent directly.

---

## 9) END-TO-END FLOW

```
Analyst State → buildRunInput() → System Prompt
  → Phase 1: ORIENT (get_market_context)
  → Phase 2: REVIEW HOLDINGS (triage + research)
  → Phase 3: REVIEW WATCHLIST (triage + research)
  → Phase 4: DISCOVER (conditional scan + research)
  → Phase 5: SYNTHESIZE (decision table, no tools)
  → Phase 6: EXECUTE (trades, closes, watchlist)
  → Phase 7: BRIEF (complete_run → AnalystBriefing)
  → Next Run (priorBrief feeds RunInput)
```
