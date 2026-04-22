# Signal Pipeline Discovery Failure — Session Findings & TODO

**Created:** 2026-04-21
**Status:** Active investigation. Nothing in this doc is shipped. See PR for what landed.

This doc captures findings from the session that diagnosed why "discovery is fucked" 3 weeks after the AGENT_OVERHAUL_PLAN work. The PR linked below ships the *quick fixes* (discovery dim gate, watchlist floor, thesis quality, UI sheet). The real structural problems are here.

---

## The Diagnosis — What's Actually Broken

### 1. Monitors don't discover — they drill down on known tickers

Audit of the 43 enabled `BRIEFING_AGENT` search monitors as of 2026-04-21:

```
NVIDIA AI accelerator announcements
NVIDIA Q2 2026 earnings guidance revision
NVIDIA supply chain impacts 2026 Q2
NVIDIA insider selling April 2026
NVIDIA partnership updates with Marvell Q2 2026
NVDA technological advances in AI chips
Marvell financial impact from Nvidia partnership
Micron AI memory demand outlook Q2 2026
Akamai strategic moves
Semiconductor tariff impact China export controls  (duplicated)
```

**Every single one is a deep-dive on a ticker the analyst already holds or watches.** Zero monitors in the system query for NEW tickers. The monitor population is structurally incapable of producing discovery candidates.

Consequence: top 10 signal tickers over 7 days are NVDA (416), AVGO (115), AMD (112), TSLA (107), INTC (81), TSM (78), MSFT (76), MRVL (74), MU (74), NIO (70). **Same 20-40 tickers every day, forever.**

### 2. NULL routeReasonCode — NOT a bypass bug (correction)

Initial audit in this session incorrectly claimed a second code path was writing routes without `routeReasonCode`. **Verified: the router is writing 100% of new routes with a code.** All NULL rows in the database are from **before 2026-04-16** (migration date when the column was added). Every route from Apr 16 onward has a code. `signal-router.ts:585` is the only write path.

No action needed on this. Moving the diagnosis energy back to monitor quality.

### 3. Catalyst Event Raider specifically has insane monitors

This is the analyst user forgot to rewrite — all the NVIDIA drill-down monitors live under it. Needs to be rebuilt with the current Universe + a discovery-aware monitor seed.

---

## TODO — Ordered by impact

### A. Find and fix the NULL-route-code bypass (30-60 min)

Grep for every `AnalystSignalRoute.create` call in:
- `lib/inngest/functions/signal-router.ts` (known — writes with code)
- `lib/inngest/functions/morning-brief-generator.ts` (SUSPECT — likely writes routes without going through decideRouteCode)
- `lib/inngest/functions/firm-market-sweep.ts`
- `lib/inngest/functions/portfolio-watchlist-monitor.ts`
- `lib/inngest/functions/domain-monitor.ts`
- Any helper in `lib/intelligence/signals.ts`

Expected culprit: a helper that persists routes without running them through the new Universe/tier logic. Fix: route them through `decideRouteCode()` too, or deprecate the bypass.

### B. Rebuild Catalyst Event Raider + seed discovery monitors (2-3 hours)

1. User wipes the 43 briefing-created ticker-drill-down monitors for Catalyst Event Raider.
2. Ship a one-time script or admin action: for each analyst, seed 3-5 discovery-flavored monitors based on `config.universe`:

   Tech Momentum Trader (sectors=[Tech], industries=[Semis, Software, Hardware], themes=[]):
   - "breakout tech stocks this week small cap"
   - "under the radar AI infrastructure plays 2026"
   - "semiconductor equipment makers gaining share"
   - "new software IPOs 2026 momentum"

   EV Catalyst Event Trader (themes=[EV_INFRASTRUCTURE, EV_ADOPTION, BATTERY_TECH]):
   - "emerging EV companies public markets 2026"
   - "battery tech startups IPO 2026"
   - "EV charging infrastructure stocks growth"
   - "lithium miners sector rotation"

   Each monitor query MUST:
   - Not name a specific ticker
   - Include a time qualifier ("this week" / "2026" / "recent")
   - Match at least one analyst Universe dimension (sector, industry, or theme)

### C. Fix builder + editor so they propose GOOD monitors (2-3 hours)

Current state: builder/editor propose monitors, but they default to ticker-drill-downs (e.g., "NVDA supply chain news"). User quote:

> "We need to make sure that the analyst building smartly proposes monitors to help with discovery and news, and understands that tickers already get searched as their own portfolio."

Changes needed in `lib/agent/modes.ts` → `BUILDER_SYSTEM_PROMPT` and the editor prompt:
- Add explicit "DO NOT propose per-ticker monitors — portfolio-watchlist-monitor handles those automatically for every ticker in positions/watchlist"
- Force at least 2 of proposed monitors to be "discovery queries" (no ticker name, Universe-aligned)
- Show examples of good vs bad monitor queries in the builder knowledge library

### D. Briefing agent's monitor creation (already removed — legacy cleanup needed)

**Update:** The briefing agent's dynamic-monitor write loop was **already removed** in a prior pass (see `lib/agent/update-analyst-briefing.ts:69-78`). No new BRIEFING_AGENT monitors are being created. The 43 existing enabled ones + 29 disabled ones are **orphans from a prior bug**.

One-shot cleanup SQL (run in Supabase when ready):

```sql
-- Disable all legacy BRIEFING_AGENT search monitors.
-- They're all ticker-drill-downs that duplicate portfolio-watchlist-monitor coverage.
-- Run this once, then user re-enables anything actually useful via /intelligence.
UPDATE "Monitor"
SET enabled = false
WHERE origin = 'BRIEFING_AGENT' AND type = 'SEARCH' AND enabled = true;

-- If you want hard delete instead:
-- DELETE FROM "Monitor" WHERE origin = 'BRIEFING_AGENT' AND type = 'SEARCH';
```

Also Catalyst Event Raider specifically needs a rebuild (user's direction) — scoping in the editor will replace the monitors cleanly.

### E. New intelligence page tab: Pipeline Health (3-4 hours)

Full tab on `/intelligence` (NOT the sheet tab — a dedicated page section). Graphs user wants:

1. **Discovery volume over time** — signals tagged `DISCOVERY` / `SECTOR_MATCH` / `INDUSTRY_MATCH` / `THEME_MATCH` vs. portfolio/watchlist, per day
2. **Zombie monitors** — list of enabled monitors with 0 signals produced in last 14 days
3. **Ticker concentration** — top 20 tickers by signal count, with percentage of total (expected: heavy concentration → unhealthy)
4. **Signals by source** — Perplexity Sonar vs Firecrawl vs FMP vs Finnhub, stacked bar
5. **Signals by urgency category** — BREAKING / HIGH / MEDIUM / LOW, stacked bar
6. **Routes with NULL routeReasonCode** — per day, per analyst — surfaces bypass bugs
7. **Brief depth** — distinct tickers mentioned per morning brief, per analyst, time series
8. **Monitor ROI stub** — placeholder until Session 6 lands; shows "tradesSourced" column as N/A

Chart library: Recharts (already in stack).
API: new `/api/intelligence/pipeline-health` endpoint with date-range param.

### F. Verify firm + domain monitors actually run

From the data, `lastRunAt` is recent on all the enabled monitors — they ARE running. But user should spot-check in Inngest dashboard:
- `firm-market-sweep` fires daily at 6:30 AM ET
- `domain-monitor` fires daily at 7:15 AM ET
- `portfolio-watchlist-monitor` fires daily at 7:00 AM ET

Confirm via Inngest logs. If any are silently failing, that explains signal gaps.

---

## What's NOT needed (user's direction)

- **No model changes** — stay on GPT-4o everywhere, per CLAUDE.md and user's hard stance. No Claude, no model experiments.
- **No Session 5 deploy** — the suggestions system is built but deferred until Session 6 provides real outcome data.
- **No Session 6 priority** — user is already working on it separately.
- **No toolStats priority** — "diagnosis without action" is what the user is tired of.

The missing leverage is **discovery monitor quality**, not model or prompt enforcement.

---

## Questions / Unknowns

- Is there a way to detect ticker-symbol patterns in a free-text query at insert time (Zod refine) so bad monitor queries are rejected before save?
- Should firm-level monitors (movers, earnings calendar, top gainers) create `DISCOVERY`-tagged routes automatically when a new-to-analyst ticker matches Universe? (Probably yes.)
- Is Perplexity Sonar API costing more than expected given the 43 drill-down monitors × 7 days × repeated NVDA queries? Spend audit worth doing.
