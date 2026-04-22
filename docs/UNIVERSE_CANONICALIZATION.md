# Universe Canonicalization — Handoff

Read this before touching anything in `lib/intelligence/`,
`lib/inngest/functions/signal-router.ts`, or `lib/agent/tools/discover-signals-for-fence.ts`.

## The problem in one sentence

There are three different places that store or query universe tags
(sectors, industries, themes) and they use **three different
vocabularies** — so rebuilds with fresh GICS labels return 0 signals
even though the router itself coincidentally matches signals.

## Where each vocabulary lives today

| Place | Vocabulary | File |
|---|---|---|
| Signal ingestion (Sonar) | Whatever Perplexity returned, trimmed only — mix of "Technology", "technology", "Information Technology", etc. | `lib/intelligence/sonar.ts:204` |
| Analyst `AgentConfig.sectors` | Whatever Builder wrote OR whatever GICS combobox inserted (Title Case) | `lib/universe/gics.ts`, written by UI + `suggest_config` |
| Signal router matching | Both sides `.toUpperCase()` at compare time — works because comparison is case-insensitive | `lib/inngest/functions/signal-router.ts:78, 104` |
| `discover_signals_for_fence` | Prisma `hasSome` = exact string match. **Was broken** — fixed with in-memory upper() filter in PR #151. | `lib/agent/tools/discover-signals-for-fence.ts` |

The router's uppercase-on-compare approach accidentally works for any
vocabulary pair because both sides get flattened. But:

- It doesn't help `"Information Technology"` match `"Technology"` —
  those are different strings even after uppercasing.
- `hasSome` doesn't normalize at all.
- Ingestion stores raw values.

Result: any analyst using GICS Title Case sectors will find zero
signals when probing for them directly, even though the router might
route them correctly in the background.

## What "fixed" looks like

**One canonical vocabulary**, applied at:

1. **Ingestion** — `sonar.ts` and any other signal-producing path maps
   raw sector strings to GICS Title Case at write time. This means
   `"Technology"` → `"Information Technology"`, `"Healthcare"` →
   `"Health Care"`, etc.
2. **Config** — Already enforced by the ChipListComboEditor that uses
   `GICS_SECTORS` / `GICS_INDUSTRIES`.
3. **Query tools** — `discover_signals_for_fence` and anything else
   reading from the signal table does a plain equality check (no
   normalization) because both sides are now canonical.
4. **Router** — stops applying `upper()` because canonical Title Case
   makes that redundant. Or keeps it as a defensive belt-and-suspenders.

## The hard part

**Mapping Sonar output to GICS.** Perplexity returns strings like
"Semiconductors", "AI Infrastructure", "Automotive OEMs" that aren't
always a 1:1 match with GICS. We need a resolver:

```ts
// lib/universe/normalize.ts
export function normalizeSector(raw: string): string | null;
export function normalizeIndustry(raw: string): string | null;
export function normalizeTheme(raw: string): string; // themes stay free-form
```

The sector/industry resolvers can:
1. Exact-match against GICS list (case-insensitive)
2. Alias table for common Sonar outputs → GICS canonical
3. Return `null` for unresolvable values — signal still stored,
   just without that sector tag (don't hallucinate)

Themes stay free-form (analyst-coined), so the theme "resolver" is
just a trim + upper normalization for consistency — no GICS list.

## Rollout order (proposed for next session)

1. **Write `lib/universe/normalize.ts`** with exact-match + alias
   table. Seed aliases from the distinct sector values currently in
   the Signal table (one-off query).
2. **Update `sonar.ts` ingestion** to call `normalizeSector` /
   `normalizeIndustry` on every signal.
3. **Migration script** — backfill existing Signal rows: for each,
   run the normalizer on its `sectors` array, replace with canonical
   values or drop unresolvable ones.
4. **Remove the `upper()` hacks** from both signal-router and
   discover_signals_for_fence. Replace with direct equality checks.
5. **Add a test** that verifies a known canonical sector ("Information
   Technology") survives the round trip signal-create → router →
   discover.

## What PR #151 shipped as a stopgap

- `discover_signals_for_fence` now does in-memory `upper()` matching
  so rebuilds don't fail on 0 signals. **This is a band-aid** — it
  papers over the vocabulary mess at query time rather than fixing it
  at ingestion.
- `lib/universe/gics.ts` is the canonical GICS list to target.
- The ConfigSheet combobox enforces canonical input on analyst configs.

## Signals touching this that shouldn't be broken

- `lib/inngest/functions/firm-market-sweep.ts` writes signals too — it
  currently sets `sectors: []` on most paths (lines 198, 303). Not
  broken per se, but those signals have no sector tags at all, so
  they only route via ticker match.
- `lib/inngest/functions/portfolio-watchlist-monitor.ts` — per-ticker
  Sonar searches. Also should run through `normalizeSector`.
- `lib/inngest/functions/domain-monitor.ts` — Firecrawl extraction.
  Same deal.

## Test case to make this concrete

Take one existing analyst like `Tech Momentum Raider`. Query:

```sql
SELECT DISTINCT unnest("sectors") as sec FROM "Signal"
WHERE "createdAt" > now() - interval '30 days'
ORDER BY sec;
```

Whatever values show up — that's the alias map's source of truth.
Every one of those should map to a GICS canonical or explicitly to
`null` (unknown, drop it).

## Explicit non-goal for the first pass

Don't try to canonicalize themes. Themes are user-coined and the
point of having them is to let analysts express novel narratives.
Theme normalization is just `.trim()` — no mapping table.
