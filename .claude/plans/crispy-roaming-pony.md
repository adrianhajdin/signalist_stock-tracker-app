# Fix Agent Data Quality — 9 Issues

## Context
Runs feel empty because data is silently lost at multiple points: sources aren't tracked, sectors aren't filtered, trades aren't linked to theses, technical analysis fails with no fallback, and news is truncated. These 9 fixes address every identified data quality gap.

## Files to Modify
1. **`lib/agent/tools.ts`** — 8 changes (issues 1-2, 4, 6-8, plus schema updates for 3)
2. **`lib/agent/system-prompt.ts`** — 2 additions (issues 1, 3)
3. **`app/api/research/agent/route.ts`** — pass sectors to ToolContext (issue 5)
4. **`lib/alpaca.ts`** — add `getBars()` function (issue 4)

---

## Step 1: Extend ToolContext with `sectors` (Issue 5)

**`lib/agent/tools.ts`** line 280 — add `sectors?: string[]` to `ToolContext`

**`app/api/research/agent/route.ts`** line 181-186 — pass `sectors: (agentConfig.sectors as string[]) ?? []`

## Step 2: Sector filtering in `scan_candidates` (Issue 2)

**`lib/agent/tools.ts`** — after line 512 (ranked list built):

- Add `batchFetchProfiles()` helper near top of file: fetches Finnhub `/stock/profile2` for up to 15 tickers in batches of 5 (stays under 60 req/min)
- After ranking, if `ctx.sectors` is non-empty: batch-fetch profiles, filter candidates whose `finnhubIndustry` doesn't match any configured sector
- Keep unknowns (no profile data) — don't filter what we can't classify
- If filtering removes everything, keep top 5 unfiltered as fallback
- Replace `ranked` with `filteredRanked` in movers/earnings builders (lines 514-535)
- Update note field (line 547) to reflect actual filtering

## Step 3: Add Alpaca bars fallback for technical analysis (Issue 4)

**`lib/alpaca.ts`** — add after line 182:
```typescript
export async function getBars(symbol, options: { start, end, timeframe? }): Promise<{ close, volume }[]>
```
Uses SDK's `getBarsV2()` async generator. Returns array of `{ close, volume }`.

**`lib/agent/tools.ts`** line 750 — insert Alpaca fallback before the "unavailable" return:
- Import `getBars` from alpaca
- Try `getBars(ticker, { start: 90daysAgo, end: today })`
- If >= 14 bars returned, convert to candles format and continue
- If fails, fall through to existing "unavailable" return

Fallback chain becomes: Finnhub → FMP → Alpaca → "unavailable"

## Step 4: Populate `sourcesUsed` in `show_thesis` (Issue 1)

**`lib/agent/tools.ts`** — `thesisParams` schema (line 257): add optional `sources_used` array of `{ provider, title, url?, excerpt? }`

**`lib/agent/tools.ts`** line 1153: change `sourcesUsed: []` → `sourcesUsed: args.sources_used ?? []`

**`lib/agent/system-prompt.ts`** Phase 4 (after line 96): add instruction telling agent to collect `_sources` from all prior tool calls for that ticker and pass as `sources_used`

## Step 5: Make `thesis_id` required in `place_trade` (Issue 3)

**`lib/agent/tools.ts`** line 266-269: remove `.optional()` from `thesis_id`, update description to say "REQUIRED"

Note: Prisma schema already requires `thesisId` (non-nullable `@unique`), so this just moves validation earlier to zod. Currently trades fail silently at DB level when thesis_id is null.

**`lib/agent/system-prompt.ts`** Phase 5 (after line 102): add instruction: "ALWAYS pass the thesis_id returned by show_thesis to place_trade"

## Step 6: Increase news summary length (Issue 6)

**`lib/agent/tools.ts`** lines 1550, 1560: change `.slice(0, 200)` → `.slice(0, 500)`

## Step 7: Add earnings beat rate time range (Issue 7)

**`lib/agent/tools.ts`** lines 1092-1095: include period dates from history array in beat_rate string, e.g. `"88% (7/8 quarters, 2024-Q1 to 2025-Q4)"`

## Step 8: Reddit sentiment error granularity (Issue 8)

**`lib/agent/tools.ts`** lines 880-890: add `error_type` field to failure returns:
- `"rate_limited"` — 403/429 from Reddit
- `"service_unavailable"` — Python PRAW service down
- `"no_mentions"` — no Reddit mentions found

Track which failure occurred before the return.

---

## Backward Compatibility
- All new tool params are optional (won't break existing calls)
- Exception: `thesis_id` becomes required in `place_trade` — but DB already requires it, so this fixes silent failures
- No return shape changes — only new optional fields added
- No Prisma migrations needed

## Verification
1. `npx tsc --noEmit` — type check passes
2. Run an agent session via "Run Research Now" with a sector-focused analyst
3. Check DB: `SELECT sourcesUsed FROM "Thesis" ORDER BY "createdAt" DESC LIMIT 5` — should have non-empty arrays
4. Check DB: `SELECT t."thesisId" FROM "Trade" t ORDER BY "createdAt" DESC LIMIT 5` — should all be non-null
5. Check agent output for sector-filtered candidates and Alpaca fallback logs
