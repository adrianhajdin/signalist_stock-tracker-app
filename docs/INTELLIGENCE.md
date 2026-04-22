# Hindsight V3 — Persistent Intelligence Architecture

**Date:** March 22, 2026
**Status:** SHIPPED (Core Pipeline) — March 23, 2026

---

## What Was Built

V3 replaced Hindsight's fake discovery system (StockTwits trending + earnings calendar + FMP movers) with a real persistent intelligence pipeline. Analysts no longer rediscover the world from scratch every run. Background jobs gather, score, and route intelligence before analysts wake up.

### The Core Shift

**Before V3:** Every analyst run spent 8-12 tool calls scanning for candidates and reading news. Discovery was a ticker shuffler masquerading as research.

**After V3:** Background jobs search the web, monitor sources, extract articles, score signals, and write a per-analyst morning brief. The analyst starts with `read_morning_brief` + `read_signals` and jumps straight to research and decisions.

---

## Architecture

```
Builder creates analyst → sets up sources + queries + policy
    ↓
Morning sweep runs queries + monitors sources → generates Signals
    ↓
Agent reads morning brief + signals (policy-filtered) → researches → trades
    ↓
Briefing agent reviews session → writes memory + proposes new queries
    ↓
New queries feed back into morning sweep → loop continues
```

---

## Daily Intelligence Timeline

```
6:30 AM  ┌─ Firm Market Intelligence Sweep ──────┐
         │  Sonar: macro, sectors, themes, events │
         └──────────────┬────────────────────────-┘
                        ▼
7:00 AM  ┌─ Portfolio & Watchlist Monitor ────────┐
         │  Sonar + Finnhub: every holding +      │
         │  watchlist name across all analysts     │
         └──────────────┬─────────────────────────┘
                        ▼
7:15 AM  ┌─ Source Pack Monitor ──────────────────┐
         │  Sonar (domain-filtered) + Firecrawl:  │
         │  firm sources + analyst-specific packs  │
         └──────────────┬─────────────────────────┘
                        ▼
7:30 AM  ┌─ Signal Router ───────────────────────-┐
         │  Score, deduplicate, tag, route signals │
         │  to analysts by mandate/sectors/watchlist│
         └──────────────┬─────────────────────────┘
                        ▼
7:45 AM  ┌─ Morning Brief Generator ─────────────-┐
         │  Per-analyst: GPT-4o reads routed       │
         │  signals + portfolio + prior brief →    │
         │  writes structured morning brief        │
         └──────────────┬─────────────────────────┘
                        ▼
8:00 AM  ┌─ Analyst Runs (existing cron) ────────-┐
         │  Agent reads morning brief + signals    │
         │  Live search ONLY for verification      │
         └────────────────────────────────────────-┘
```

---

## What Each Job Does (Concrete)

### 1. Firm Market Intelligence Sweep (6:30 AM)

**File:** `lib/inngest/functions/firm-market-sweep.ts`
**Trigger:** Cron `TZ=America/New_York 30 6 * * 1-5` or `intelligence/market-sweep` event

Loads all enabled `IntelligenceQuery` rows with scope=FIRM. For each query, calls Perplexity Sonar API with structured JSON output. Sonar searches the web (like perplexity.ai) and returns structured signals:

```json
{
  "signals": [{
    "headline": "NVIDIA reports record Q1 data center revenue of $26.3B",
    "summary": "Beat expectations with data center revenue up 73% YoY...",
    "tickers": ["NVDA", "AMD", "AVGO"],
    "themes": ["AI_CAPEX", "EARNINGS_BEAT"],
    "sentiment": "BULLISH",
    "urgency": "HIGH",
    "sourceUrls": ["https://reuters.com/..."],
    "sourceNames": ["Reuters"]
  }]
}
```

Each signal becomes a `Signal` row. Deduplicates against signals from the last 24 hours. Expires old temporary queries. Typically produces 30-80 signals from 12 queries.

### 2. Portfolio & Watchlist Monitor (7:00 AM)

**File:** `lib/inngest/functions/portfolio-watchlist-monitor.ts`
**Trigger:** Cron `TZ=America/New_York 0 7 * * 1-5` or `intelligence/portfolio-monitor` event

Collects every unique ticker from open positions + active watchlist items across ALL analysts. For each ticker, calls Sonar: `"NVDA NVIDIA stock news developments analyst ratings today"`. Catches ticker-specific news the broad sweep might miss (analyst downgrades, product launches, SEC filings).

### 3. Source Pack Monitor (7:15 AM)

**File:** `lib/inngest/functions/source-pack-monitor.ts`
**Trigger:** Cron `TZ=America/New_York 15 7 * * 1-5` or `intelligence/source-pack-monitor` event

Loads all SourcePacks with their sources. Searches Sonar with domain filtering (e.g. search only reuters.com + bloomberg.com + wsj.com). For priority-1 sources, also extracts full page content via Firecrawl into `Artifact` rows. Updates `lastCheckedAt` on each source.

### 4. Signal Router (7:30 AM)

**File:** `lib/inngest/functions/signal-router.ts`
**Trigger:** Cron `TZ=America/New_York 30 7 * * 1-5` or `intelligence/route-signals` event

Loads all signals from today's batches + all analysts with their configs. For each signal × analyst pair, scores relevance based on: ticker overlap with holdings/watchlist (high weight), sector overlap with mandate, theme overlap. Creates `AnalystSignalRoute` rows with relevance scores and routing reasons.

### 5. Morning Brief Generator (7:45 AM)

**File:** `lib/inngest/functions/morning-brief-generator.ts`
**Trigger:** Cron `TZ=America/New_York 45 7 * * 1-5` or `intelligence/generate-briefs` event

For each analyst: loads routed signals (top 30 by relevance), portfolio state, watchlist. Calls GPT-4o-mini to synthesize a structured brief with: marketContext, portfolioAlerts, watchlistUpdates, newOpportunities, attentionPriority, riskFlags. Writes `MorningBrief` row.

---

## Provider Architecture

| Layer | Provider | Role |
|-------|----------|------|
| **Bulk search** (background) | Perplexity Sonar | Search substrate — structured JSON output, domain/recency filters |
| **Page extraction** (background) | Firecrawl | Full-page markdown for high-value URLs |
| **Runtime search** (analyst escalation) | Claude web search/fetch | Targeted verification during runs |
| **Financial data** | Finnhub + FMP | Quotes, earnings, filings, movers |
| **Signal processing** | GPT-4o-mini | Signal routing, scoring, brief generation |
| **Brief generation** | GPT-4o-mini | Per-analyst morning briefs |
| **Trade execution** | Alpaca | Paper trading |

---

## Configuration Model (Three Layers)

### Layer 1: Firm-Wide (managed in /intelligence UI)
- Fixed queries (12 seeded, add/remove/toggle via UI)
- Firm source pack (22 seeded sources)
- Global budgets (configurable)

### Layer 2: Analyst-Level (set during creation, editable)
- Analyst source packs with priority sources
- Analyst-specific standing queries
- Intelligence policy (attention weights, signal budgets, quality floors)
- Linked via `primarySourcePackId` on AgentConfig

### Layer 3: Dynamic (from agents)
- Post-run briefing agent proposes temporary queries with expiration dates
- Persisted as `IntelligenceQuery` rows with `createdBy="BRIEFING_AGENT"`
- Morning sweep picks them up automatically
- Analyst builder proposes source packs + queries at analyst creation

---

## Data Model

All new entities in `prisma/schema.prisma`:

- **Source** — tracked domain/RSS/API with quality score and category
- **SourcePack** — grouping of sources (firm-wide or analyst-specific)
- **SourcePackSource** — join table with priority (1=critical, 2=standard, 3=supplementary)
- **IntelligenceQuery** — search query with scope, category, optional expiry, created-by tracking
- **Artifact** — extracted page content (markdown + summary + content hash for dedup)
- **Signal** — normalized evidence unit (headline, summary, tickers, themes, sentiment, urgency, sources)
- **SignalBatch** — groups signals by job run (MARKET_SWEEP, PORTFOLIO_MONITOR, SOURCE_PACK)
- **AnalystSignalRoute** — signal → analyst routing with relevance score and status (PENDING/READ/ACTED_ON)
- **MonitorCheckpoint** — tracks last-checked state for sources and queries
- **MorningBrief** — per-analyst structured daily brief (unique on analystId + date)

---

## Runtime Tools (New)

### Intelligence Consumption
- `read_morning_brief` — returns today's MorningBrief for the analyst
- `read_signals` — returns routed signals filtered by policy (tickers, themes, urgency, budget caps)
- `read_artifact` — returns full extracted content for a specific artifact

### Revised Agent Flow
- **Phase 0:** Portfolio check-in (unchanged)
- **Phase 1:** READ INTELLIGENCE — `read_morning_brief` + `read_signals` (replaces blind scanning)
- **Phase 2:** Orient with live market data only if brief didn't cover it
- **Phase 3-4:** Review holdings + watchlist (informed by portfolio alerts from brief)
- **Phase 5:** Investigate (picks from brief's `newOpportunities`, uses `web_search` for escalation)
- **Phase 6-8:** Synthesize → Execute → Wrap up

---

## Intelligence UI

**Page:** `/intelligence`
**Sidebar:** Radar icon, "Intelligence"

### Stats Strip
Today's Signals count, Jobs Run, Breaking/High urgency, Bullish/Bearish split, Tickers Covered

### Tabs
- **Signals** — all signals with sentiment badges, ticker chips, urgency dots, source attribution. Click for detail sheet with themes, sectors, metadata, source URLs.
- **Activity** — job run history showing job name, signal count, duration, status
- **Queries (12)** — firm-wide and analyst search queries with toggle, add, delete
- **Sources (22)** — tracked domains with quality stars, category badges, last checked dates
- **Packs (3)** — source pack cards showing grouped sources with priority indicators

### Job Trigger Buttons
Manual triggers for each of the 5 intelligence jobs. Fire Inngest events on click.

---

## Files Added/Modified

### New: Intelligence Infrastructure
- `lib/intelligence/types.ts` — all TypeScript types (Signal, Artifact, MorningBrief, Sonar schemas, etc.)
- `lib/intelligence/sonar.ts` — Perplexity Sonar API client (OpenAI-compatible)
- `lib/intelligence/firecrawl.ts` — Firecrawl extraction client
- `lib/intelligence/signals.ts` — signal creation, dedup, batch management utilities

### New: Inngest Jobs
- `lib/inngest/functions/firm-market-sweep.ts`
- `lib/inngest/functions/portfolio-watchlist-monitor.ts`
- `lib/inngest/functions/source-pack-monitor.ts`
- `lib/inngest/functions/signal-router.ts`
- `lib/inngest/functions/morning-brief-generator.ts`

### New: API Routes
- `app/api/intelligence/queries/route.ts` — CRUD for IntelligenceQuery
- `app/api/intelligence/sources/route.ts` — CRUD for Source
- `app/api/intelligence/source-packs/route.ts` — CRUD for SourcePack
- `app/api/intelligence/trigger/route.ts` — manual job triggers
- `app/api/intelligence/signals/route.ts` — signal listing with filters
- `app/api/intelligence/activity/route.ts` — job run history

### New: UI
- `app/(root)/intelligence/page.tsx` — full intelligence dashboard

### Modified
- `app/api/inngest/route.ts` — registered 5 new functions
- `prisma/schema.prisma` — 10 new models
- `components/layout/sidebar.tsx` — added Intelligence nav item

### Environment Variables Required
- `PERPLEXITY_API_KEY` — Perplexity API (for Sonar)
- `FIRECRAWL_API_KEY` — Firecrawl API (for extraction)

---

## Seed Data

22 sources (Reuters, Bloomberg, CNBC, WSJ, FT, Federal Reserve, etc.), 3 source packs (Firm Market, Earnings Play, Trend Chaser), 12 firm-wide intelligence queries.

Run the seed SQL in Supabase SQL Editor. See `scripts/seed-intelligence.ts` for the full list.

---

## Cost (Observed)

Market sweep of 12 queries: ~100 seconds, ~50-80 signals per run. At $0.005/Sonar query, the full daily pipeline (sweep + portfolio + sources) costs roughly $0.50-1.00/day. Monthly estimate: **~$15-25/month** for 3 analysts on 22 trading days.

---

## What's Next (Not Yet Built)

### Analyst Policy System (Epic 4) — PR pending
- `intelligencePolicy` JSON field on AgentConfig
- Policy enforcement in `read_signals` (budget caps, quality floors, urgency filters)
- Builder proposes source packs + queries at analyst creation
- Dynamic queries from post-run briefing agent

### Tool Rationalization (Epic 6) — PR pending
- Kill `scan_candidates`, `get_social_sentiment`, `search_reddit`
- Slim down `get_market_context` (keep live prices, remove theme detection)
- Clean up dead CoT registrations

### Email/Newsletter Ingestion (Epic 2) — Not started
- Gmail API integration
- Newsletter parsing → Artifact creation
- Signal extraction from emails
- Routing to analysts

### Future Enhancements
- Source quality scoring over time (auto-promote/demote sources based on signal accuracy)
- Analyst-to-analyst signal sharing
- Real-time intraday monitoring (not just morning sweep)
- RSS feed ingestion
- Twitter/X account monitoring
