# Universe Handoff — for the Signals session

**Owner of schema:** Workstream B (analyst building). Universe lives on `AgentConfig`.
**Consumer:** Workstream A (signals/routing). You read it to decide which signals land in which analyst's inbox and tag *why*.

Schema is already in place — committed as `3db6413`, migration at
[prisma/migrations/20260415000000_add_universe_to_agent_config/migration.sql](prisma/migrations/20260415000000_add_universe_to_agent_config/migration.sql).
You don't write the migration; you populate the new tagging columns when routing.

---

## What "Universe" means

The fence that defines what an analyst will look at. Signal routing uses it to decide
inbox membership; the agent uses it at run time to decide which discovery candidates
are in-scope.

## The fields (all on `AgentConfig`)

| Field | Type | Existed before? | Meaning |
|---|---|---|---|
| `markets` | `String[]` | yes | `["US_EQUITIES", "CRYPTO", "ETFS"]` |
| `exchanges` | `String[]` | yes | `["NASDAQ", "NYSE"]` |
| `sectors` | `String[]` | yes | broad GICS-style (`Technology`, `Energy`, …) |
| `industries` | `String[]` | **NEW** | narrower than sector |
| `themes` | `String[]` | **NEW** | analyst-defined free-text vocabulary |
| `marketCapMin` | `BigInt?` | **NEW** | null = no lower bound |
| `marketCapMax` | `BigInt?` | **NEW** | null = no upper bound |
| `watchlist` | `String[]` | yes | explicit tickers analyst tracks |
| `exclusionList` | `String[]` | yes | hard reject |
| `tickerUniverse` | `String[]` | yes | stays separate — used for DIRECTED mode, not part of fence semantics |

## Match semantics — read this carefully

- **Empty array or null numeric = no filter on that dimension.** Back-compat: every
  pre-Universe analyst has empty `industries`/`themes` and null caps and should
  continue receiving signals exactly as before.
- **AND across dimensions.** A signal matches the universe only if it matches every
  non-empty dimension.
- **OR within a dimension.** A signal matching any one of `sectors` passes that
  dimension's check.
- **`exclusionList` wins.** Hard reject — if the ticker is on the exclusion list,
  drop the route regardless of other matches.
- **Watchlist & open positions bypass the fence.** If a signal's ticker is in the
  analyst's `watchlist` or in an open `Position`, route it even if sector/industry/
  theme don't match. (Tag the route accordingly — see below.)

## What you populate on `AnalystSignalRoute`

Two new columns are already on the table; legacy `routeReason` (free-form) stays.

```ts
routeReasonCode: string  // enum below — primary signal for the agent's queries
matchedUniverse: Json    // shape below — explains the match for UI + debugging
```

### `routeReasonCode` enum (string, not Postgres enum — easier to evolve)

| Code | When to use |
|---|---|
| `DISCOVERY` | Ticker is new to this analyst (not in watchlist, not in open positions) and matched the universe via sector/industry/theme/cap |
| `WATCHLIST` | Ticker is in `AgentConfig.watchlist` |
| `POSITION` | Ticker is in an open `Position` for this analyst |
| `DIRECT_TICKER` | Signal explicitly named the ticker via a per-analyst monitor (T2 search) |
| `SECTOR_MATCH` | Sector match was the determining factor (use when you want to be specific instead of `DISCOVERY`) |
| `INDUSTRY_MATCH` | Industry match was the determining factor |
| `THEME_MATCH` | Theme match was the determining factor |
| `CROSS_ANALYST` | Another analyst's signal, surfaced as a cross-pollination hint |

The agent's morning Stage 1 will query `routeReasonCode = 'DISCOVERY'` to fill its
discovery bucket. Builder/editor will query `DISCOVERY` + ticker stats to suggest
watchlist additions from real recent signal flow.

### `matchedUniverse` JSON shape

```ts
{
  sectors?:       string[],   // which of the analyst's sectors matched
  industries?:    string[],
  themes?:        string[],
  inWatchlist?:   boolean,
  inPositions?:   boolean,
  fromAnalystId?: string,     // for CROSS_ANALYST routes
  marketCap?:     string,     // optional — if cap range was a deciding factor, log the value
}
```

Only include keys that contributed to the decision — keeps the UI explanations clean.

## New index (already created)

```
AnalystSignalRoute (analystId, routeReasonCode, routedAt DESC)
```

Optimized for the agent's "give me DISCOVERY routes for this analyst, newest
first" query. Use it.

## The themes problem — flag for design

`themes` is free-text on both `Signal.themes` and `AgentConfig.themes`. Two
analysts might tag the same idea as `"AI-infra"` vs `"AI infrastructure"` vs
`"datacenter buildout"` and miss matches.

Options for the signals session to consider (pick one and document it):
1. Standardize a vocabulary — small enum-ish list, validate writes against it.
2. Semantic match — embedding similarity or LLM normalization at routing time.
3. Punt for now — exact-match only, accept misses, fix when it bites.

Recommendation: option 3 short term. Theme overlap will be small until we have
many analysts; not worth building infra for it yet. Just don't let `themes`
become the sole match dimension without a sector/industry backstop.

## What B owes A (not done yet)

- Builder/editor will need to *query* recent `DISCOVERY`-tagged routes to suggest
  watchlist additions. That's a B5/B6 concern — no schema changes for you.
- Universe-edit UI lives in B6. When an analyst edits their universe, existing
  routed signals are *not* retroactively re-routed. New routes use the new
  universe from the next routing run forward.

## Reference

- Schema: [prisma/schema.prisma](prisma/schema.prisma) `AgentConfig` block
- Migration: [prisma/migrations/20260415000000_add_universe_to_agent_config/migration.sql](prisma/migrations/20260415000000_add_universe_to_agent_config/migration.sql)
- Plan: [docs/AGENT_OVERHAUL_PLAN.md](docs/AGENT_OVERHAUL_PLAN.md) → Workstream B
- Commit: `3db6413`
