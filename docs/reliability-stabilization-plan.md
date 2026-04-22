# Reliability Stabilization Plan

> Architecture audit and targeted fixes for run lifecycle reliability.
> Date: 2026-04-02 | Post-PR #132 (briefing simplification)
> Updated: 2026-04-02 — all 4 fixes implemented

---

## Current Architecture (Post-PR #132)

### Briefing Flow (Single Path)
```
Agent calls complete_run tool
  → marks run COMPLETE
  → calls updateAnalystBriefing() directly (GPT-4o, ~15s)
  → writes "briefing_generated" RunEvent
  → returns { briefing: "success" | "failed" | "skipped" }
```

### Safety Net (onFinish)
```
Stream ends → onFinish fires
  → if run still RUNNING: mark COMPLETE (partial work) or FAILED
  → persist messages (atomic transaction)
  → if no briefing exists: generate one
```

### Morning Cron (morning-research.ts)
```
Inngest cron → generateText (not streaming)
  → agent calls complete_run (same path as above)
  → belt-and-suspenders: marks COMPLETE if still RUNNING after agent finishes
  → calls updateAnalystBriefing() inline
  → sweeps stale RUNNING runs
```

---

## Completed Fixes

### 1. Non-Atomic Message Persistence
- **Severity:** CRITICAL — data loss
- **Status:** ✅ FIXED
- **Files:** `app/api/research/agent/route.ts:230-246`, `lib/inngest/functions/morning-research.ts:174-193`
- **Problem:** `deleteMany` then `create` without a transaction. If `create` fails after `deleteMany` succeeds, the run's conversation history is permanently lost. The briefing agent then gets "No conversation data" and produces a degraded brief, breaking the memory loop for subsequent runs.
- **Fix:** Wrap delete + create in `prisma.$transaction()`. On failure, the transaction rolls back — old messages are preserved rather than deleted.
- **Remaining risk:** If the `allMessages` JSON exceeds Postgres max row size (~1GB, unlikely but unbounded), the create still fails. But old messages survive the rollback.

### 2. All Run Status Writes Are Atomic Conditional Updates
- **Severity:** CRITICAL — state corruption
- **Status:** ✅ FIXED (all 8 sites)
- **Problem:** Multiple code paths write to `researchRun.status` using read-then-write patterns. Under concurrent execution (e.g., `complete_run` tool + `onError` + `onFinish` all racing), a COMPLETE run could be overwritten to FAILED.
- **Fix:** Every status write now uses `prisma.researchRun.updateMany()` with the current status in the WHERE clause. This is a single atomic SQL `UPDATE ... WHERE id = ? AND status = ?`. If the status has already changed, the update is a no-op (count = 0).
- **Sites fixed:**

| Site | File | Transition | Pattern |
|------|------|-----------|---------|
| `markRunFailed` | `route.ts:18-47` | RUNNING → FAILED | `updateMany({ where: { id, status: "RUNNING" } })` |
| `onFinish` stuck-run handler | `route.ts:204-220` | RUNNING → COMPLETE/FAILED | `updateMany({ where: { id, status: "RUNNING" } })` |
| `complete_run` happy path | `tools.ts:1564-1571` | not-COMPLETE → COMPLETE | `updateMany({ where: { id, status: { not: "COMPLETE" } } })` |
| `complete_run` catch block | `tools.ts:1690-1694` | not-COMPLETE → COMPLETE | `updateMany({ where: { id, status: { not: "COMPLETE" } } })` |
| morning-research belt-and-suspenders | `morning-research.ts:157-171` | RUNNING → COMPLETE | `updateMany({ where: { id, status: "RUNNING" } })` |
| morning-research timeout | `morning-research.ts:217-230` | RUNNING → COMPLETE/FAILED | `updateMany({ where: { id, status: "RUNNING" } })` |
| Run page stale check | `runs/[id]/page.tsx:57-63` | RUNNING → FAILED | `updateMany({ where: { id, status: "RUNNING" } })` |
| Analyst page zombie cleanup | `analysts/[id]/page.tsx:27-36` | RUNNING → FAILED | Already atomic (unchanged) |
| Stale-run sweep (morning cron) | `morning-research.ts:246-256` | RUNNING → FAILED | Already atomic (unchanged) |

- **Remaining risk:** None for status writes. The parameter enrichment writes (morning-research.ts) still use `update()` but they only touch the `parameters` JSON field, not status.

### 3. No Concurrent Run Prevention
- **Severity:** HIGH — duplicate trades possible
- **Status:** ✅ FIXED
- **Files:** `app/api/research/agent-run/route.ts:35-53`
- **Problem:** The run creation endpoint creates a RUNNING run without checking if one already exists for the same analyst. Two simultaneous runs can race past the duplicate-position check in `place_trade`, opening duplicate positions on the same ticker.
- **Fix:** Before creating a new run, query for existing RUNNING run with the same `agentConfigId`. Return 409 with `{ error, existingRunId }` if found.
- **Remaining risk:** Check-then-create is not atomic — two requests arriving within the same millisecond could both pass the check. This is extremely unlikely for a single-user product with UI-driven runs. A DB unique partial index `(agentConfigId) WHERE status = 'RUNNING'` would be the fully atomic solution but requires a migration.

### 4. closeOpenPosition Non-Transactional
- **Severity:** HIGH — inconsistent position state
- **Status:** ✅ FIXED
- **Files:** `lib/actions/closeTrade.actions.ts:80-124`
- **Problem:** Order create, Position update, and PositionEvent create were three separate DB writes. Crash between writes leaves position in inconsistent state.
- **Fix:** All three writes wrapped in `prisma.$transaction()`. Either all succeed or all roll back.
- **Remaining risk:** The Alpaca close (step 2, before the transaction) is not transactional with DB writes. If Alpaca closes the position but the DB transaction fails, you have a closed Alpaca position with an OPEN DB record. This is the same pre-existing risk as `place_trade` — Alpaca operations can't be rolled back. The Inngest event fire (step 8) and email (step 9) remain outside the transaction intentionally — they're side effects, not state.

---

## Open Issues (Next Priority)

### Next 1: Stale run sweep for manual runs
- **Severity:** MEDIUM
- **Files:** Would need new Inngest cron function or extend `morning-research.ts` sweep
- **Problem:** The stale-run sweep in `morning-research.ts:250-268` only sweeps runs from the current cron batch (filters by `agentConfigId: { in: configs.map(c => c.id) }`). Manual UI runs that get stuck (e.g., Vercel hard timeout kills the function before `onFinish` fires) are never automatically cleaned up. The only detection is the run page's server-render stale check, which requires a user to navigate to the specific run.
- **Fix approach:** Create a dedicated `sweep-stale-runs` Inngest cron that runs every 15 minutes and marks ALL runs with `status: "RUNNING"` and `startedAt < now - 10 minutes` as FAILED, regardless of source. This is safe because no legitimate run takes 10+ minutes.

### Next 2: place_trade duplicate position race (DB constraint)
- **Severity:** MEDIUM (reduced by fix #3, but not eliminated for cron runs)
- **Files:** `prisma/schema.prisma`, new migration
- **Problem:** The duplicate-position check in `place_trade` (tools.ts:1136-1153) is a read-then-write pattern. Fix #3 prevents concurrent manual runs, but the morning cron runs analysts sequentially in the same Inngest step, and `price-monitor` can auto-close positions concurrently with an agent run. A DB-level constraint would be the definitive fix.
- **Fix approach:** Add a partial unique index: `CREATE UNIQUE INDEX position_open_unique ON "Position" (userId, symbol) WHERE status = 'OPEN'`. This makes duplicate OPEN positions impossible at the DB level. The `place_trade` tool's existing check becomes a fast-path optimization; the constraint is the safety net.

### Next 3: Retry logic for Finnhub/FMP API calls
- **Severity:** MEDIUM
- **Files:** `lib/agent/tools.ts` (fmp function), `lib/agent/research-helpers.ts` (finnhub function)
- **Problem:** Every external API call gets one attempt with a 10s timeout. Transient failures (rate limits, network blips) cause permanent data gaps in tool results. The agent adapts but makes decisions on incomplete data.
- **Fix approach:** Add a single retry with 2s backoff for 429/5xx responses in the `finnhub()` and `fmp()` helpers. Keep the 10s per-attempt timeout. Total worst case per call goes from 10s to 22s, which is acceptable within the 300s function budget.

---

## Issues Deferred (Not Near-Term)

| Issue | Why Deferred |
|---|---|
| Intelligence pipeline cron-based ordering | Architectural change, needs Inngest step dependencies or fan-out, higher risk |
| Signal dedup on write | Intelligence layer redesign, lower priority than run lifecycle |
| System prompt token scaling | Optimization, not a reliability issue |
| Structured logging / tracing | Operational improvement, not causing failures directly |
| Briefing blocks complete_run (timeout risk) | Tradeoff accepted in PR #132; would need async architecture to fix |
