# Universe + Rebuild — The Real Plan

PR #151 is a dumping ground. 22 commits of spot-fixes papering over
an architectural hole. Stopping here to plan properly instead of
shipping another patch.

## What's actually broken (honest inventory)

### 1. No canonical universe type system

There's no single source of truth for sector / industry / theme
values. The same field name refers to different vocabularies in
different code paths:

- **UI combobox:** GICS Title Case — "Information Technology", "Health Care"
- **Legacy analyst configs in DB:** SCREAMING_SNAKE_CASE — "TECHNOLOGY", "HEALTHCARE"
- **Sonar signal ingestion:** whatever Perplexity returned, trimmed only — "Technology", "technology", "Information Technology", "Tech"
- **Signal router matching:** `.toUpperCase()` both sides at compare time — coincidentally works for same-string-different-case, fails on different strings
- **`discover_signals_for_fence` (pre-fix):** Prisma `hasSome` exact match — failed on everything but coincidental exact matches
- **`discover_signals_for_fence` (after my last patch):** in-memory `upper()` matching — also coincidentally works but doesn't solve the real problem

An analyst can currently have `["HEALTHCARE"]` as its stored sectors
AND the dropdown lets them ADD `"Health Care"` as a second chip.
Two different values for semantically the same sector. Nothing
prevents duplicates because there's no canonical form.

### 2. No visibility into signal routing

The user has no way to see:
- What sectors/industries/themes each signal in the DB is tagged with
- Which analysts a signal was routed to, and WHY (which dimension matched)
- How many signals are currently "orphaned" (no sector tag at all)
- What the distribution of sector values in the DB looks like (is it all TECHNOLOGY? A mix?)

The `AnalystSignalRoute.matchedUniverse` field exists and has routing
reason codes (DISCOVERY / SECTOR_MATCH / THEME_MATCH / etc) but there's
no UI surface showing them.

### 3. Rebuild flow doesn't actually reset

"Rebuild this analyst via Editor" currently:
- ✅ Deletes old BUILDER-origin monitors
- ✅ Deletes old BRIEFING_AGENT-origin monitors (just shipped)
- ✅ Creates new monitors from Editor's proposal
- ❌ Does NOT normalize the analyst's legacy sector values to canonical form
- ❌ Does NOT show a diff of "before / after" including universe field changes
- ❌ Does NOT re-run signal routing against the new fence

So an analyst rebuilt through the Editor can still carry `"HEALTHCARE"`
from its old config if the agent doesn't explicitly replace it. And
even if it does, no backfill happens on the signals side.

### 4. No migration strategy for existing data

- Existing signals have heterogeneous sector tags
- Existing analysts have heterogeneous sector values
- No script converts them to a canonical form
- Every bug fix in a query layer is a band-aid over this

## The real plan — 3 sessions

### Session A: Canonical universe enums (this is the foundation)

**Goal:** one definition of what sector/industry/theme values are
legal. Applied everywhere at write time. Read paths trust it.

**Scope:**

1. **`lib/universe/canonical.ts`** — NEW module replaces `lib/universe/gics.ts`:
   ```ts
   export const SECTORS = [...] as const;        // 11 GICS, Title Case
   export const INDUSTRIES = [...] as const;     // ~65 GICS, Title Case
   export type Sector = typeof SECTORS[number];
   export type Industry = typeof INDUSTRIES[number];
   export function normalizeSector(raw: string): Sector | null;
   export function normalizeIndustry(raw: string): Industry | null;
   export function normalizeTheme(raw: string): string;  // uppercase + snake_case
   ```

2. **Alias table** built into `normalizeSector` / `normalizeIndustry`:
   ```ts
   const SECTOR_ALIASES: Record<string, Sector> = {
     "technology": "Information Technology",
     "tech": "Information Technology",
     "healthcare": "Health Care",
     "health care": "Health Care",
     "information technology": "Information Technology",
     // ... built from running a DISTINCT query on the Signal table + seed data
   };
   ```
   Case-insensitive lookup. Returns `null` for unknowns (we don't hallucinate).

3. **Schema tightening (Prisma):**
   - `AgentConfig.sectors` stays `String[]` but we enforce canonical at
     the server action layer via `normalizeSector()` on every write.
   - `Signal.sectors` same treatment via Sonar ingestion.
   - Optionally add a runtime `zod` validator at both write boundaries.

4. **Write-path hooks:**
   - `lib/intelligence/sonar.ts:204` — `normalizeSector` + `normalizeIndustry` on every Sonar signal.
   - `lib/actions/analyst.actions.ts` — `updateAnalystField("sectors", …)` normalizes before write. Rejects invalid.
   - `lib/agent/tools/suggest-config.ts` — the Builder/Editor schema for sectors becomes `z.enum(SECTORS)`. Agent literally cannot propose an unknown value.

5. **Read-path simplification:**
   - `signal-router.ts` — drop the `upper()` calls. Plain equality works once both sides are canonical.
   - `discover-signals-for-fence.ts` — restore the Prisma `hasSome` filter. It works again because values are canonical.

6. **Migration script** (`scripts/migrate-universe-canonical.sql` + `.ts`):
   - For every row in Signal: apply `normalizeSector` to each sector value, replace array.
   - For every row in AgentConfig: same.
   - Log unmatched values for manual review (they'll become new alias entries).
   - Idempotent — safe to run multiple times.

**Ship:** Separate PR. Narrow scope. Tests.

---

### Session B: Observability + rebuild UX

**Goal:** the user can SEE how the system is routing signals and can
confidently rebuild an analyst.

**Scope:**

1. **Intelligence dashboard addition:**
   - "Signals in the last 7 days": count, with breakdown by sector/industry/theme
   - "Orphaned signals": count of signals with no sector tag
   - "Sector value distribution": bar chart of raw DB values, flagged red if not canonical

2. **Analyst page addition — "Signal Routing" panel:**
   - Last 30 days: "N signals routed to this analyst"
   - Broken down by match reason (DISCOVERY / SECTOR_MATCH / WATCHLIST / THEME_MATCH / POSITION)
   - Click a row → shows the signal + which of the analyst's dimensions matched
   - This is the "proof" the user currently has no way to see

3. **Rebuild flow redesign:**
   - Before Editor writes the new config, show a diff: old config → new config (including Universe field changes)
   - After write: run `discover_signals_for_fence` with the new fence and show "your new fence would have routed N signals in the last 7 days" as confirmation
   - Button: "Reset all auto-generated state" — wipes BUILDER + BRIEFING_AGENT monitors, re-normalizes sector/industry values, re-runs router against recent signals. This is the "true reset."

4. **Inline Editor proposal UI** (replace the current bad "Proposed Changes" card):
   - Tabs: Trading Rules / Universe / Monitors / Prompt
   - Each tab shows its diff inline
   - Can approve individual tabs instead of all-or-nothing

**Ship:** Separate PR after Session A merges.

---

### Session C: Self-improvement loop (deferred — already has
`docs/SELF_IMPROVEMENT_HANDOFF.md`)

Now we have:
- Canonical types (Session A)
- Visibility (Session B)
- Clean rebuild (Session B)

The self-improvement agent can finally work WITH the system instead
of around it. This was always pending — it's pending for the right
reasons now.

---

## What to do with PR #151

**Close it as "UI cleanup + kill dead features"** — that's what it
actually is. Land the current state to main so the frustration piece
(custom cards, fake citations, dead fields, BRIEFING_AGENT monitors)
is permanently removed. Note in the PR description:

- ✅ Killed custom cards (PlaybookRenderer, etc.)
- ✅ Killed fake citation chips
- ✅ Killed `signalTypes`, `scheduleTime`, `maxRiskPct` from UI + suggest_config
- ✅ Killed BRIEFING_AGENT monitor auto-writes
- ✅ Config sheet tab split (Strategy / Config) + tooltips
- ✅ Run card truthful summaries
- ⚠️ Universe canonicalization DEFERRED to Session A — see UNIVERSE_REBUILD_PLAN.md

**Do not** keep piling onto #151. It's done what it can do without
the type system foundation.

---

## What I should have done differently

1. When the 0-signals problem surfaced, I should have STOPPED and laid out this plan instead of patching `discover_signals_for_fence` in-memory.
2. When the doubled tool row appeared, I should have caught that `groupId: "Knowledge"` + single-call + rich content = double wrap in ONE pass, not three.
3. When the user said "I haven't been able to edit a single analyst in 6 days," that was the signal to write this plan, not commit another fix.

## Honest recommendation

1. **Merge PR #151 as UI cleanup.** Don't block on more fixes here.
2. **Start Session A in a fresh branch** with this doc as the kickoff spec. Narrow scope: canonical enums + normalization + migration. Ship it.
3. **Then Session B** for the rebuild UX + observability.
4. **Only then** try to rebuild an analyst. The existing data needs the migration to run first.

I'll hold on code until you pick a direction.
