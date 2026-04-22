# Self-Improvement Agent — Handoff Doc

This doc is the starting point for the session that builds the
self-improvement loop. Read it end-to-end before writing any code.

## TL;DR

We had a **hidden half-baked self-improvement feature** inside the
post-run briefing agent. It silently wrote ticker-specific SEARCH
queries to the Monitor table after every run with no UI, no cap, and
no delete logic. We ripped it out (see commits on PR #151).

Your job: re-introduce the same intent — *the system learns from a
run and proposes changes to the analyst* — but as an **explicit,
proposal-based, user-approved** workflow.

## What was killed (and why)

**File:** `lib/agent/update-analyst-briefing.ts`

**Removed:**
- `dynamicQueries` field from the briefing schema (was 0–5 per run)
- "Dynamic Monitors" section in the briefing prompt
- The persistence loop that wrote `origin: "BRIEFING_AGENT"` rows into `Monitor`
- Import of `DynamicQueryOutput`

**Cleanup:** `scripts/cleanup-briefing-agent-monitors.sql` deletes existing rows.

**Why:**
- Accumulated 30–50+ stale ticker queries per analyst over weeks
- No user visibility — queries appeared in the Analyst detail "Search Queries" list with no provenance
- Duplicated `portfolio-watchlist-monitor.ts` which already runs per-ticker Sonar for every held + watchlist ticker
- Cleanup logic (`firm-market-sweep.ts`) only *disabled* expired rows, never deleted them
- The underlying intent (learn from the run, update the analyst) is real — it just needed the right architecture

**What we KEPT** of the briefing agent:
- The narrative summary (`AnalystBriefing.narrative`) — this is the analyst's memory between runs
- `strategyNotes`, `marketPosture`, `watchTomorrow`, `unresolvedItems`, `selfCorrections` — all still generated per run
- These fields are the **input material for self-improvement**. Read them, don't regenerate them.

## What the self-improvement loop should actually do

Reads (per analyst):
- Last N `AnalystBriefing` rows (narrative + strategyNotes + selfCorrections)
- Last N `ResearchRun`s with their `RunEvent`s (tool stats: what got called, what got skipped)
- Last N closed `Position`s (realized P&L, outcome WIN/LOSS, closeReason)
- Current `AnalystConfig` (prompt, universe, watchlist, intelligenceQueries)
- Last N `TradeDecision`s joined to theses (was the agent proven right/wrong?)

Proposes (all as pending `Suggestion` rows — user approves in UI):
- **analystPrompt edits** — add a paragraph, tweak an entry rule, tighten a stop
- **universe edits** — add/remove a sector/industry/theme
- **watchlist edits** — add a repeatedly-missed ticker; remove a perpetually-ignored one
- **intelligenceQueries edits** — add a thematic query that would have caught a missed catalyst; remove a stale one
- **exclusionList edits** — block a ticker with a loss streak
- **brief meta-commentary** — "you flagged this the last 3 runs without acting — is it really actionable?"

## Key design principles (learned the hard way)

1. **Proposal, not execution.** Every edit proposed, user approves in UI. No silent writes to AgentConfig or Monitor tables. Full audit trail.

2. **Visibility is a first-class feature.** Every proposal shows:
   - What signal in the data triggered it ("3 losses in a row on $XYZ")
   - What it proposes to change ("add $XYZ to exclusionList")
   - Why the system thinks this is right
   - Approve / Dismiss / Snooze buttons

3. **Cap and expire.** Whatever goes into Monitor or intelligenceQueries has a hard cap (~8 queries per analyst total) and a TTL that actually *deletes* rows, not disables them. Write the cleanup job AT THE SAME TIME as the write path. Do not leave it for later.

4. **Never duplicate what an existing system does.**
   - `portfolio-watchlist-monitor.ts` already runs per-ticker Sonar — do not mint per-ticker queries
   - `firm-market-sweep.ts` already runs macro sweeps — do not mint market-level queries
   - The analyst's Builder/Editor-set `intelligenceQueries` are for *thematic* queries the above don't catch (e.g. "Fed rate decision reaction", "biotech FDA calendar", "Taiwan supply chain disruption")

5. **One run ≠ enough signal.** A proposal should require a pattern across ≥3 runs or ≥3 closed trades. Single-run reactions produce noise.

## Schema additions needed

```prisma
model Suggestion {
  id           String   @id @default(cuid())
  analystId    String
  analyst      AgentConfig @relation(fields: [analystId], references: [id])
  kind         String   // "PROMPT_EDIT" | "UNIVERSE_ADD_SECTOR" | "WATCHLIST_ADD" | ...
  evidence     Json     // { runs: [...], trades: [...], reason: "..." }
  proposedDiff Json     // what to change
  status       String   // "PENDING" | "APPROVED" | "DISMISSED" | "EXPIRED"
  sourceRunId  String?
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?
  resolvedBy   String?  // userId

  @@index([analystId, status])
}
```

## UI surface

- New Intelligence tab row or dedicated `/analysts/[id]/suggestions` page
- Each suggestion card: title + evidence + proposed diff + Approve/Dismiss
- Approve → applies the diff via `updateAnalystField` / Monitor CRUD, records who approved
- Dismiss → marks resolved with user feedback ("not relevant", "already know", "wrong")
- Feedback trains the next pass (suggestions that always get dismissed get suppressed)

## Inngest job shape

```
self-improvement-weekly — Sundays 11 AM ET
  1. For each enabled analyst:
     a. Load last 30 days of briefings, runs, trades
     b. Generate-object pass with GPT-4o against a suggestion schema
     c. Deduplicate against existing PENDING suggestions (same kind + same target)
     d. Write new Suggestion rows
     e. Expire any PENDING older than 14 days
  2. Surface count in the dashboard
```

## What NOT to build in the first pass

- Auto-apply (no suggestion gets applied without user approval — not even "obvious" ones)
- Cross-analyst suggestions (one analyst's learnings shouldn't bleed into another)
- Realtime suggestions (weekly cadence, not per-run — single-run reactions are noisy)

## The 3-item rebuild path after this ships

Per the user's plan:
1. Ship self-improvement loop (this session)
2. User rebuilds every analyst via the new Editor (using playbook archetypes + the cleaned-up Universe combobox)
3. Monitors naturally reset to 3–5 Builder-set queries per analyst, no accumulated cruft

## Relevant files to read before coding

- `lib/agent/update-analyst-briefing.ts` — the briefing agent; you'll read its output, not rewrite it
- `lib/inngest/functions/portfolio-watchlist-monitor.ts` — the per-ticker monitor you must not duplicate
- `lib/inngest/functions/firm-market-sweep.ts` — the macro monitor you also must not duplicate
- `lib/actions/analyst.actions.ts` — `updateAnalystField` is your edit surface
- `prisma/schema.prisma` Monitor + AnalystBriefing + TradeDecision models
- `scripts/cleanup-briefing-agent-monitors.sql` — the cleanup that ran once

## Context the user specifically wants preserved

> "Thats like an attempted version of the self-improvement, but without any visibility into it. We need to kill that and document it for the self improvment agent."

> "It needs to consider how this self improvement runs, reviews briefs and reviews the runs and the tool calls and portfolio activity and portfolio, and summary of tools called, etc. It needs to make suggestions and document them and i need some form of visibility into the edits it makes. But needs to be able to add signals and monitors and edit config and the brief and watchlist."
