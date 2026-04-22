# Discovery Layer v1 — Build Plan

**Status**: Ready for execution
**Estimated sessions**: 5 parallel tracks + 1 integration session
**Branch strategy**: Each track gets its own branch, merged sequentially into `main`

---

## 1. Discovery Layer v1 Scope

### IN SCOPE

- **Enhanced `get_market_overview`**: regime classification (RISK_ON/RISK_OFF/NEUTRAL), SPY SMA-20 trend, macro events from FMP economic calendar, earnings density count
- **New `detect_market_themes` tool**: keyword-clustered themes from Finnhub general news + Reddit trending + sector ETF momentum. No LLM call. Returns named themes with strength, direction, sectors, representative tickers.
- **New `scan_catalysts` tool**: unified forward-looking catalyst pipeline — earnings (30 days), economic calendar events, insider transactions, analyst upgrades/downgrades
- **Enhanced `scan_candidates`**: market cap floor, avg volume floor, volume spike detection, `theme_filter` parameter for thematic scanning
- **Updated system prompt**: 4-phase discovery flow (regime → themes → catalysts → filtered scan)
- **2 new UI cards**: `MarketThemesCard`, `CatalystTimelineCard` with tool UI registration
- **Existing domain barrel + tool-uis.tsx updates**: register new tools following existing patterns

### NOT IN SCOPE (v2+)

- Theme persistence across runs (no `MarketTheme` DB table yet)
- Cross-run opportunity tracking ("you passed on $X and it moved Y%")
- FDA calendar, conference/investor day calendar, lockup expirations
- Options expiration (OPEX) awareness
- Analyst-config-aware scoring weights
- Any changes to Phase 3–6 (deep research, thesis, trade, summary)
- Any changes to the Python service
- Any new Prisma models or schema migrations

---

## 2. Parallelization Strategy

```
TRACK A: get_market_overview enhancement
  Files: lib/agent/tools.ts (get_market_overview only)
  Depends on: nothing
  Can run: PARALLEL

TRACK B: detect_market_themes tool + UI
  Files: lib/discovery/themes.ts (NEW), lib/agent/tools.ts (add tool),
         components/domain/market-themes-card.tsx (NEW)
  Depends on: nothing
  Can run: PARALLEL

TRACK C: scan_catalysts tool + UI
  Files: lib/discovery/catalysts.ts (NEW), lib/agent/tools.ts (add tool),
         components/domain/catalyst-timeline-card.tsx (NEW)
  Depends on: nothing
  Can run: PARALLEL

TRACK D: scan_candidates enhancement
  Files: lib/agent/tools.ts (scan_candidates only)
  Depends on: nothing (theme_filter structure can be defined independently)
  Can run: PARALLEL

TRACK E: Integration — system prompt + tool-uis + barrel exports
  Files: lib/agent/system-prompt.ts, components/assistant-ui/tool-uis.tsx,
         components/domain/index.ts
  Depends on: ALL of A, B, C, D
  Must run: LAST
```

### Merge order

```
A → main (no conflicts possible)
B → main (no conflicts — new files + additive to tools.ts)
C → main (no conflicts — new files + additive to tools.ts)
D → main (touches scan_candidates — potential minor conflict with B/C additions to tools.ts)
E → main (touches system-prompt.ts + tool-uis.tsx — clean merge since only E changes these)
```

### Conflict risk assessment

| Track | Touches `tools.ts` | Section | Conflict Risk |
|-------|-------------------|---------|---------------|
| A | Lines 318–418 (get_market_overview) | Low — isolated function |
| B | End of file (new tool addition) | None — append only |
| C | End of file (new tool addition) | None — append only |
| D | Lines 421–638 (scan_candidates) | Low — isolated function |
| E | Does NOT touch tools.ts | None |

**Key insight**: Tracks B and C create new helper modules (`lib/discovery/themes.ts`, `lib/discovery/catalysts.ts`) and only add a tool definition at the end of `tools.ts`. This avoids conflicts with A and D which modify existing tools in the middle of the file.

---

## 3. Task Breakdown

### TRACK A — `get_market_overview` Enhancement

**Title**: DAV-200: Add regime classification and macro context to `get_market_overview`

**Goal**: Make `get_market_overview` return a structured regime signal, today's macro events, and earnings density so the agent can calibrate aggressiveness.

**Why it matters**: Today the agent sees SPY price + VIX + sector ETFs but has to infer regime from raw numbers. Explicit regime classification + macro events = smarter discovery decisions immediately.

**Dependencies**: None

**Parallel**: Yes — touches only lines 318–418 of `tools.ts`

**Acceptance criteria**:
1. Tool returns new `regime` field: `"RISK_ON"` | `"RISK_OFF"` | `"NEUTRAL"`
   - RISK_ON: VIX < 16 AND SPY above 20-day SMA
   - RISK_OFF: VIX > 25 OR SPY below 20-day SMA with negative 5-day momentum
   - NEUTRAL: everything else
2. Tool returns `spy_trend` field with SPY's position relative to 20-day SMA (above/below + %)
3. Tool returns `macro_events_today` array from FMP economic calendar (`/v3/economic_calendar?from=TODAY&to=TODAY`)
4. Tool returns `earnings_density` count of companies reporting in next 5 days
5. Tool returns `sector_momentum` for each sector ETF — above/below 10-day SMA
6. All new data included in `_sources` array
7. Existing return shape is preserved (spy, vix, sectors fields unchanged)
8. MarketContextCard in tool-uis.tsx still renders correctly (no UI changes needed yet — new fields are informational for the agent)

**Risk level**: Low — additive fields, no breaking changes

---

### TRACK B — `detect_market_themes` Tool + UI

**Title**: DAV-201: Build `detect_market_themes` tool and `MarketThemesCard` UI

**Goal**: Give the agent a tool to identify dominant market narratives before scanning for candidates.

**Why it matters**: This is the single highest-impact discovery improvement. Without themes, every scan is random. With themes, the agent can scan thematically.

**Dependencies**: None

**Parallel**: Yes

**Acceptance criteria**:
1. New file `lib/discovery/themes.ts` exports a `detectThemes()` function
2. `detectThemes()` aggregates 3 data sources in parallel:
   - Finnhub general news (`/news?category=general&minId=0`) — last 50 articles
   - Reddit trending tickers (existing `discoverTrendingTickers()` from `lib/reddit.ts`)
   - Sector ETF performance (Finnhub quotes for 11 SPDR ETFs — same as market overview)
3. Theme extraction uses keyword clustering:
   - Predefined theme keywords map (AI/semiconductor/GLP-1/rate cuts/oil/EV/crypto/bank stress/meme/defense/etc.)
   - Count headline matches per theme across news + Reddit
   - Score by frequency × recency weight
   - Map themes to sectors and representative tickers
4. Returns `{ themes: Theme[], _sources: Source[] }` where:
   ```ts
   type Theme = {
     name: string;           // "AI Infrastructure", "GLP-1 Momentum"
     strength: number;       // 0-1, normalized
     direction: "BULLISH" | "BEARISH" | "NEUTRAL";
     key_sectors: string[];
     representative_tickers: string[];
     headline_count: number; // how many headlines matched
     top_headlines: string[]; // 3 representative headlines
   }
   ```
5. New tool `detect_market_themes` added to `createResearchTools()` in `tools.ts`
   - inputSchema: `{ lookback_days?: number }` (default 3)
   - Calls `detectThemes()` from the helper module
6. New file `components/domain/market-themes-card.tsx` renders themes:
   - Card with theme rows: name, strength bar, direction badge, ticker chips
   - Follows existing Card pattern (p-0, border-b header, p-4 body)
7. No LLM calls inside the tool or helper
8. Handles API failures gracefully — returns empty themes array with error note

**Risk level**: Medium — new data aggregation logic, keyword extraction quality is uncertain. But it's additive and can be tuned independently.

---

### TRACK C — `scan_catalysts` Tool + UI

**Title**: DAV-202: Build `scan_catalysts` tool and `CatalystTimelineCard` UI

**Goal**: Give the agent forward-looking catalyst awareness — what events could move prices in the next 2-4 weeks.

**Why it matters**: Today the agent only sees 7-day earnings. Extending to 30 days + adding economic calendar + insider buying + analyst actions makes the agent proactive instead of reactive.

**Dependencies**: None

**Parallel**: Yes

**Acceptance criteria**:
1. New file `lib/discovery/catalysts.ts` exports a `scanCatalysts()` function
2. `scanCatalysts()` aggregates 4 data sources in parallel:
   - Finnhub earnings calendar — 30 days forward, 3 days back
   - FMP economic calendar (`/v3/economic_calendar?from=X&to=Y`) — 14 days forward
   - Finnhub insider transactions (`/stock/insider-transactions?symbol=&from=X&to=Y`) — bulk recent insider buying
   - FMP analyst upgrades/downgrades (`/v3/upgrades-downgrades-consensus?symbol=`) — recent grade changes
3. Returns unified catalyst objects:
   ```ts
   type Catalyst = {
     ticker: string | null;  // null for macro events like "FOMC Meeting"
     catalyst_type: "EARNINGS" | "ECONOMIC" | "INSIDER" | "ANALYST_ACTION";
     date: string;           // ISO date
     expected_impact: "HIGH" | "MEDIUM" | "LOW";
     direction_bias: "BULLISH" | "BEARISH" | "UNKNOWN";
     details: string;        // "Q1 2026 earnings, EPS est $2.35"
   }
   ```
4. Catalysts sorted by date, grouped by type
5. Earnings catalysts include EPS estimates when available
6. Economic events include impact level (FMP provides this)
7. Insider transactions summarized as "3 insiders bought $2.1M in last 5 days"
8. New tool `scan_catalysts` added to `createResearchTools()` in `tools.ts`
   - inputSchema: `{ forward_days?: number, catalyst_types?: string[] }`
   - Calls `scanCatalysts()` from the helper module
9. New file `components/domain/catalyst-timeline-card.tsx`:
   - Timeline-style layout: date column | type icon + badge | ticker | details
   - Groups by date, shows "Today", "Tomorrow", "This Week", "Next Week" headers
   - Follows existing Card pattern
10. Handles missing/empty data gracefully

**Risk level**: Medium — FMP economic calendar endpoint needs testing. Insider transaction aggregation is new territory. But all data sources have known APIs.

---

### TRACK D — `scan_candidates` Enhancement

**Title**: DAV-203: Add quality filters and theme support to `scan_candidates`

**Goal**: Filter out junk/illiquid tickers and enable thematic scanning.

**Why it matters**: Agents waste research cycles on micro-caps with no candle data. Market cap + volume filters fix this immediately. Theme support connects the theme detection tool to candidate selection.

**Dependencies**: None for core filters. The `theme_filter` parameter can be defined independently — it just needs to match the theme name format from Track B.

**Parallel**: Yes

**Acceptance criteria**:
1. New parameters added to `scan_candidates` inputSchema:
   - `theme_filter`: optional string — boosts candidates matching a theme name
   - `min_market_cap`: optional number (default 1,000,000,000 = $1B)
   - `min_avg_volume`: optional number (default 500,000)
2. After scoring and deduplication, before returning results:
   - Batch-fetch Finnhub profiles for top 15 candidates (reuse existing `batchFetchProfiles`)
   - Filter out tickers below `min_market_cap` (from profile `marketCapitalization * 1M`)
   - Filter out tickers with 10-day avg volume below `min_avg_volume` (from Finnhub metrics `10DayAverageTradingVolume`)
3. Volume spike detection:
   - For candidates that pass filters, check if current volume > 2x 10-day average
   - Add `volume_spike: true` flag to those candidates
4. Theme filter support:
   - When `theme_filter` is provided, define a mapping of theme names → keywords/sectors
   - Boost matching tickers by +3 score points
   - Accept the theme's `representative_tickers` list and boost those by +3
5. Extend earnings calendar from 7 days to 30 days (`30 * 86400_000`)
6. Return shape adds:
   - `filters_applied` object showing what was filtered and how many dropped
   - `volume_spikes` array of tickers with elevated volume
7. Existing return shape (earnings, movers, total_found, sources_queried) preserved
8. If filtering removes ALL candidates, keep top 5 unfiltered (same fallback as sector filtering)

**Risk level**: Low — additive filters on existing logic. The batch profile fetch already exists.

---

### TRACK E — Integration Session

**Title**: DAV-204: Integration — system prompt, tool UIs, barrel exports, validation

**Goal**: Wire everything together: update system prompt for 4-phase discovery, register new tool UIs, add barrel exports, verify end-to-end flow.

**Dependencies**: Tracks A, B, C, D must all be merged

**Parallel**: No — must run last

**Acceptance criteria**:
1. **System prompt** (`lib/agent/system-prompt.ts`):
   - Phase 1 updated: "Call `get_market_overview`. Note the regime classification..."
   - Phase 1.5 added: "Call `detect_market_themes`. Identify which themes align with your strategy..."
   - Phase 1.75 added: "Call `scan_catalysts`. Check for upcoming earnings, economic events, insider buying..."
   - Phase 2 updated: "Call `scan_candidates` with filters. Pass `theme_filter` if a strong theme was detected. Set `min_market_cap` to filter illiquid names..."
   - Phase 2 adds regime-aware guidance: "In RISK_OFF regime, raise your effective confidence threshold by 10 points..."
2. **Tool UIs** (`components/assistant-ui/tool-uis.tsx`):
   - `detect_market_themes` registered with `MarketThemesCard` + ChainOfThought loading + SourceChips
   - `scan_catalysts` registered with `CatalystTimelineCard` + ChainOfThought loading + SourceChips
   - `get_market_overview` UI updated to display regime badge from tool result (if regime field present)
   - `scan_candidates` UI updated to show volume spike badges and filter summary
3. **Barrel exports** (`components/domain/index.ts`):
   - Export `MarketThemesCard` + types
   - Export `CatalystTimelineCard` + types
4. **Import in tool-uis.tsx** — import new cards from domain barrel
5. **Builder/editor routes**: new discovery tools added to builder's available tool set (read-only, no show_thesis/place_trade/summarize_run)
6. **Cron compatibility**: `morning-research.ts` automatically gets new tools via `createResearchTools()` — verify it still works with updated system prompt

**Risk level**: Medium — this is the integration point. If tool output shapes don't match what the UI cards expect, things break visually. Test with a real run.

---

## 4. Recommended Execution Order

### Fastest path to usable value
```
1. Track D (scan_candidates filters) — immediate junk filtering, 1 session
2. Track A (market overview regime) — adds regime context, 1 session
3. Track B (themes) — biggest discovery upgrade, 1-2 sessions
4. Track C (catalysts) — forward-looking events, 1-2 sessions
5. Track E (integration) — wire everything together, 1 session
```
Rationale: D gives you clean candidates TODAY with zero risk. A adds context fast. B and C are the heavy lifts but can overlap.

### Safest path (minimal merge conflict risk)
```
1. Track A (market overview) — isolated tool modification
2. Track D (scan_candidates) — isolated tool modification
   [merge A and D]
3. Track B (themes) — new files + append to tools.ts
4. Track C (catalysts) — new files + append to tools.ts
   [merge B and C]
5. Track E (integration) — touches different files entirely
   [merge E]
```
Rationale: Merge the tools.ts modifications first, then the new tool additions.

### Recommended path (parallel execution)
```
Session 1 (parallel):
  - Track A (1 agent)
  - Track D (1 agent)
  - Track B (1 agent — may need 2 sessions)

Session 2 (parallel):
  - Track C (1 agent)
  - Track B continued (if needed)

Session 3:
  - Merge A → main
  - Merge D → main
  - Merge B → main
  - Merge C → main
  - Track E (integration)
```

---

## 5. File/Module Plan

### New files to create

| File | Track | Purpose |
|------|-------|---------|
| `lib/discovery/themes.ts` | B | Theme detection logic — keyword extraction, clustering, scoring. Exports `detectThemes()`. ~150-200 lines. |
| `lib/discovery/catalysts.ts` | C | Catalyst aggregation — earnings, economic cal, insider txns, analyst actions. Exports `scanCatalysts()`. ~150-200 lines. |
| `components/domain/market-themes-card.tsx` | B | Theme display card — theme rows with strength bars, direction badges, ticker chips. ~80-120 lines. |
| `components/domain/catalyst-timeline-card.tsx` | C | Catalyst timeline — date-grouped events with type icons and impact badges. ~100-140 lines. |

### Existing files to modify

| File | Track | Change |
|------|-------|--------|
| `lib/agent/tools.ts` | A | Modify `get_market_overview` execute function (~40 lines added) |
| `lib/agent/tools.ts` | B | Add `detect_market_themes` tool definition after `search_reddit` (~20 lines — delegates to helper) |
| `lib/agent/tools.ts` | C | Add `scan_catalysts` tool definition after `detect_market_themes` (~20 lines — delegates to helper) |
| `lib/agent/tools.ts` | D | Modify `scan_candidates` execute function + inputSchema (~60 lines changed) |
| `lib/agent/system-prompt.ts` | E | Rewrite Phase 1-2 instructions (~50 lines changed) |
| `components/assistant-ui/tool-uis.tsx` | E | Add 2 new `useAssistantToolUI` registrations, update market overview UI (~80 lines added) |
| `components/domain/index.ts` | E | Add 2 barrel exports (~10 lines added) |

### Why `lib/discovery/` instead of inline in `tools.ts`

`tools.ts` is already 1748 lines. Theme detection needs ~150 lines of keyword maps + clustering logic. Catalyst aggregation needs ~150 lines of multi-source normalization. Inlining these would push `tools.ts` past 2100 lines and make the file harder to navigate.

The pattern: tool definitions in `tools.ts` stay thin (schema + description + 5-line execute that delegates). Business logic lives in `lib/discovery/`. This is the same pattern used for `lib/reddit.ts` — the `get_reddit_sentiment` tool delegates to `getRedditSentiment()` from the helper module.

### Files that should NOT be touched
- `prisma/schema.prisma` — no new models
- `lib/alpaca.ts` — trading is separate
- `lib/trade-exit.ts` — portfolio management is separate
- `python-service/*` — legacy, don't invest
- `app/api/research/agent/route.ts` — no changes needed, uses `createResearchTools` which auto-includes new tools
- `lib/inngest/functions/morning-research.ts` — auto-gets new tools, but verify after integration

---

## 6. Parallel Coding Prompts

### TRACK A Prompt — Market Overview Enhancement

```
I need you to enhance the `get_market_overview` tool in `lib/agent/tools.ts`.

CONTEXT:
- This tool currently returns SPY quote, VIX level, and 11 sector ETF quotes
- It lives inside `createResearchTools()` factory function (starts around line 318)
- The tool uses `finnhub()` and `fmp()` helper functions already defined in the same file
- The existing return shape (spy, vix, sectors, _sources) MUST be preserved

CHANGES NEEDED:

1. Add REGIME CLASSIFICATION to the return object:
   - Fetch SPY 30-day candles from Finnhub: `/stock/candle?symbol=SPY&resolution=D&from=${from}&to=${now}`
   - Calculate SPY 20-day SMA from closing prices
   - Classify regime:
     - RISK_ON: VIX < 16 AND SPY price > SMA-20
     - RISK_OFF: VIX > 25 OR (SPY price < SMA-20 AND SPY 5-day return < -1%)
     - NEUTRAL: everything else
   - Add to return: `regime: "RISK_ON" | "RISK_OFF" | "NEUTRAL"`
   - Add to return: `spy_trend: { sma_20: number, position: "above" | "below", pct_from_sma: number }`

2. Add MACRO EVENTS TODAY:
   - Fetch FMP economic calendar: `/v3/economic_calendar?from=${today}&to=${today}`
   - FMP returns: [{ event, date, country, actual, estimate, previous, impact }]
   - Filter to US events only (country === "US")
   - Add to return: `macro_events_today: { event: string, actual: number | null, estimate: number | null, impact: string }[]`

3. Add EARNINGS DENSITY:
   - Fetch Finnhub earnings calendar for next 5 days (you already fetch 7 days for scan_candidates — just reuse the pattern)
   - Count total number of companies reporting
   - Add to return: `earnings_density: { count: number, period: string }`

4. Add SECTOR MOMENTUM:
   - For each of the 11 sector ETFs, determine if price is above or below a simple 10-day SMA
   - You can batch this by fetching 10-day candles for each ETF (or approximate from the 5-day return)
   - Add to existing sectors array: `momentum: "leading" | "lagging"` field per sector
   - Note: if this is too many API calls, skip it and just add a comment saying "TODO: sector momentum requires candle data"

5. Update _sources array to include new data sources

CONSTRAINTS:
- Use existing `finnhub()` and `fmp()` helpers
- Use existing `calcSMA()` function for SMA calculations
- Do NOT change the existing return shape — only ADD new fields
- Do NOT modify any other tool in the file
- Handle API failures gracefully — if FMP economic calendar fails, return empty array with note
- Add new fetches to the existing Promise.all where possible to minimize latency

FILES TO READ FIRST:
- lib/agent/tools.ts (lines 1-420 — the tool + helpers)

FILES TO EDIT:
- lib/agent/tools.ts (get_market_overview execute function only)
```

---

### TRACK B Prompt — Theme Detection

```
I need you to build the `detect_market_themes` tool for my trading agent.

CONTEXT:
- My agent runs daily research sessions with 15+ tools defined in `lib/agent/tools.ts`
- Tools are created by `createResearchTools(ctx: ToolContext)` factory
- Each tool returns structured data with a `_sources` array for attribution
- I have existing helpers: `finnhub(path)` and `fmp(path)` in tools.ts, `discoverTrendingTickers()` in lib/reddit.ts
- The UI renders each tool result as a domain card via `useAssistantToolUI` in `components/assistant-ui/tool-uis.tsx`

TASK — 3 deliverables:

### 1. Create `lib/discovery/themes.ts`

This module should export a `detectThemes(lookbackDays?: number)` function that:

a) Fetches 3 data sources IN PARALLEL:
   - Finnhub general news: GET `https://finnhub.io/api/v1/news?category=general&minId=0&token=${FINNHUB_KEY}` → returns array of { headline, summary, source, url, datetime }. Take last 50 articles.
   - Reddit trending: call `discoverTrendingTickers()` from `@/lib/reddit` (already returns { ticker, mentions }[])
   - Sector ETF performance: Finnhub quotes for ["XLK","XLF","XLV","XLY","XLP","XLE","XLI","XLB","XLRE","XLU","XLC"] (same pattern as get_market_overview)

b) Extracts themes using a KEYWORD MAP (no LLM):
   Define a map like:
   ```ts
   const THEME_KEYWORDS: Record<string, { keywords: string[], sectors: string[], tickers: string[] }> = {
     "AI Infrastructure": {
       keywords: ["artificial intelligence", "AI", "GPU", "data center", "machine learning", "LLM", "nvidia", "cloud computing"],
       sectors: ["Technology"],
       tickers: ["NVDA", "MSFT", "GOOGL", "AMD", "AVGO", "SMCI"],
     },
     "GLP-1 / Weight Loss": {
       keywords: ["GLP-1", "Ozempic", "Wegovy", "weight loss", "obesity", "semaglutide", "tirzepatide"],
       sectors: ["Healthcare"],
       tickers: ["LLY", "NVO", "AMGN", "VKTX"],
     },
     // ... add 8-12 more themes: rate cuts/Fed, oil/energy, EV/autonomous,
     //     crypto/bitcoin, China/trade, defense/aerospace, banking stress,
     //     meme stocks, semiconductor cycle, real estate, consumer spending
   };
   ```

c) Scores each theme:
   - Count headline matches (case-insensitive keyword match in headline + summary)
   - Count Reddit ticker mentions that overlap with theme's representative tickers
   - Check if theme's sectors are top-performing (sector ETF > +0.5%) → bonus points
   - Normalize scores to 0-1 range
   - Determine direction: if most headlines are positive → BULLISH, negative → BEARISH, else NEUTRAL
     (simple: check for bearish keywords like "crash", "decline", "selloff", "warning" vs bullish like "surge", "rally", "beat", "upgrade")

d) Returns top 5-8 themes sorted by strength:
   ```ts
   type Theme = {
     name: string;
     strength: number; // 0-1
     direction: "BULLISH" | "BEARISH" | "NEUTRAL";
     key_sectors: string[];
     representative_tickers: string[];
     headline_count: number;
     top_headlines: string[]; // up to 3
   }
   ```

e) Also returns `_sources` array following the existing pattern:
   ```ts
   _sources: [
     { provider: "Finnhub", title: "General Market News", url: "...", excerpt: "50 articles analyzed" },
     { provider: "Reddit", title: "Trending Tickers", ... },
     { provider: "Finnhub", title: "Sector ETF Performance", ... },
   ]
   ```

Use the FINNHUB_KEY and FMP_KEY from process.env (same as tools.ts).

### 2. Add tool to `lib/agent/tools.ts`

Add `detect_market_themes` to the object returned by `createResearchTools()`, AFTER the `search_reddit` tool (end of the tools object, before the closing `};`):

```ts
detect_market_themes: tool({
  description: "Identify dominant market themes and narratives driving capital flows. Returns named themes with strength, direction, and representative tickers. Call this after get_market_overview to understand what stories are moving the market.",
  inputSchema: z.object({
    lookback_days: z.number().optional().describe("Days to look back for news (default 3)"),
  }),
  execute: async ({ lookback_days }) => {
    console.log(`[tool] detect_market_themes lookback=${lookback_days ?? 3} runId=${ctx.runId}`);
    const { detectThemes } = await import("@/lib/discovery/themes");
    return detectThemes(lookback_days);
  },
}),
```

### 3. Create `components/domain/market-themes-card.tsx`

A card component following the EXACT same patterns as existing domain cards. Look at:
- `components/domain/scan-results-card.tsx` for structure reference
- `components/domain/market-context-card.tsx` for Badge usage

The card should show:
- Header row: "Themes" label + count badge
- Theme rows, each with:
  - Theme name (text-sm font-medium)
  - Strength bar (thin horizontal bar, width = strength * 100%)
  - Direction badge (BULLISH = green, BEARISH = red, NEUTRAL = amber) — use Badge variant="secondary" with appropriate bg/text colors
  - Ticker chips (Badge variant="outline", font-mono, text-[10px])
  - Headline count (text-xs text-muted-foreground)

Export types: `MarketThemesData`, `MarketThemesCardProps`

CONSTRAINTS:
- NEVER add custom classes to ShadCN components — use only variants and sizes
- Card uses p-0 with internal padding sections (matching existing cards)
- Use `cn()` from `@/lib/utils` for conditional classes
- Import Card, Badge from @/components/ui/
- Positive = text-emerald-500, Negative = text-red-500 — wait, check the existing code. It uses `text-positive` and `text-negative` CSS variables. Use those.
- Use tabular-nums for any numbers

FILES TO READ FIRST:
- lib/agent/tools.ts (lines 1-70 for finnhub/fmp helpers, lines 1697-1748 for end of file where to add)
- lib/reddit.ts (for discoverTrendingTickers signature)
- components/domain/scan-results-card.tsx (card pattern reference)
- components/domain/market-context-card.tsx (badge pattern reference)
- components/domain/index.ts (barrel export pattern)

FILES TO CREATE:
- lib/discovery/themes.ts
- components/domain/market-themes-card.tsx

FILES TO EDIT:
- lib/agent/tools.ts (add tool definition at end of createResearchTools return object, before closing `};` on line 1719)

DO NOT EDIT:
- components/domain/index.ts (that's the integration session)
- components/assistant-ui/tool-uis.tsx (that's the integration session)
- lib/agent/system-prompt.ts (that's the integration session)
```

---

### TRACK C Prompt — Catalyst Scanning

```
I need you to build the `scan_catalysts` tool for my trading agent.

CONTEXT:
- My agent runs daily research sessions with 15+ tools defined in `lib/agent/tools.ts`
- Tools are created by `createResearchTools(ctx: ToolContext)` factory
- Each tool returns structured data with a `_sources` array for attribution
- I have existing helpers: `finnhub(path)` and `fmp(path)` in tools.ts
- The UI renders each tool result as a domain card via `useAssistantToolUI`

TASK — 3 deliverables:

### 1. Create `lib/discovery/catalysts.ts`

This module should export a `scanCatalysts(options)` function:

```ts
interface CatalystOptions {
  forwardDays?: number;    // default 14
  lookbackDays?: number;   // default 3
  catalystTypes?: ("EARNINGS" | "ECONOMIC" | "INSIDER" | "ANALYST_ACTION")[];
}
```

It should:

a) Fetch 4 data sources IN PARALLEL (only those in catalystTypes, or all if not specified):

   EARNINGS:
   - Finnhub earnings calendar: `/calendar/earnings?from=${threeDaysAgo}&to=${fourteenDaysForward}`
   - Returns { earningsCalendar: [{ symbol, date, epsEstimate, epsActual, revenueEstimate, revenueActual, hour }] }
   - Mark as HIGH impact

   ECONOMIC:
   - FMP economic calendar: `/v3/economic_calendar?from=${today}&to=${fourteenDaysForward}`
   - Returns [{ event, date, country, actual, estimate, previous, impact, currency }]
   - Filter to country === "US" only
   - Map FMP impact ("High"/"Medium"/"Low") to our enum

   INSIDER:
   - Finnhub insider transactions: `/stock/insider-transactions?symbol=&from=${thirtyDaysAgo}&to=${today}`
   - Note: empty symbol returns all recent insider transactions
   - If that doesn't work (Finnhub may require a symbol), try FMP: `/v4/insider-trading?page=0&transactionType=P-Purchase`
   - Group by ticker: "NVDA: 3 insiders bought $4.2M in 7 days"
   - Mark clusters (>= 2 insiders buying same stock in 7 days) as HIGH impact

   ANALYST_ACTION:
   - FMP upgrades/downgrades: `/v3/upgrades-downgrades-grading-search?date=${today}`
   - Or broader: `/v3/upgrades-downgrades?page=0` for recent
   - Filter to last `lookbackDays` days
   - Mark upgrades to "Buy" or "Strong Buy" from major firms as MEDIUM impact

b) Normalize all into unified Catalyst type:
   ```ts
   type Catalyst = {
     ticker: string | null;  // null for macro events
     catalyst_type: "EARNINGS" | "ECONOMIC" | "INSIDER" | "ANALYST_ACTION";
     date: string;           // ISO date YYYY-MM-DD
     expected_impact: "HIGH" | "MEDIUM" | "LOW";
     direction_bias: "BULLISH" | "BEARISH" | "UNKNOWN";
     details: string;
   }
   ```

c) Sort by date, return with _sources array

d) Handle API failures gracefully — if one source fails, return what you have with error notes

Use FINNHUB_KEY and FMP_KEY from process.env.

### 2. Add tool to `lib/agent/tools.ts`

Add `scan_catalysts` to the object returned by `createResearchTools()`, after the tool you see at the end of the file (probably `search_reddit` or `detect_market_themes`):

```ts
scan_catalysts: tool({
  description: "Find upcoming catalysts that could move stock prices: earnings reports, economic events (FOMC, CPI, jobs), insider buying clusters, and analyst upgrades/downgrades. Use this after detect_market_themes to find time-sensitive opportunities.",
  inputSchema: z.object({
    forward_days: z.number().optional().describe("Days to look forward (default 14)"),
    catalyst_types: z.array(z.enum(["EARNINGS", "ECONOMIC", "INSIDER", "ANALYST_ACTION"])).optional().describe("Types of catalysts to scan for (default: all)"),
  }),
  execute: async ({ forward_days, catalyst_types }) => {
    console.log(`[tool] scan_catalysts forward=${forward_days ?? 14} types=${catalyst_types?.join(",") ?? "all"} runId=${ctx.runId}`);
    const { scanCatalysts } = await import("@/lib/discovery/catalysts");
    return scanCatalysts({ forwardDays: forward_days, catalystTypes: catalyst_types });
  },
}),
```

### 3. Create `components/domain/catalyst-timeline-card.tsx`

A timeline-style card showing catalysts grouped by timeframe. Look at existing cards for pattern:
- `components/domain/scan-results-card.tsx` for structure
- `components/domain/earnings-card.tsx` for date display patterns

The card should show:
- Header row: "Catalysts" label + total count
- Group catalysts by timeframe: "Today", "This Week", "Next Week", "Later"
- Each catalyst row:
  - Date (text-xs text-muted-foreground tabular-nums, e.g. "Mar 18")
  - Type icon: Calendar for EARNINGS, TrendingUp for ECONOMIC, Users for INSIDER, Target for ANALYST_ACTION (use lucide-react icons)
  - Type badge (Badge variant="outline", text-[10px])
  - Ticker if present (Badge variant="secondary", font-mono)
  - Impact badge: HIGH = red/orange bg, MEDIUM = amber, LOW = muted
  - Details (text-xs, truncated to 1 line)
- If no catalysts, show empty state text

Export types: `CatalystTimelineData`, `CatalystTimelineCardProps`

CONSTRAINTS:
- NEVER add custom classes to ShadCN components — use only variants and sizes
- Card uses p-0 with internal padding sections
- Use `cn()` from `@/lib/utils`
- Import Card, Badge from @/components/ui/
- Use tabular-nums for numbers/dates

FILES TO READ FIRST:
- lib/agent/tools.ts (lines 1-70 for helpers, end of file for where to add)
- components/domain/scan-results-card.tsx (card pattern)
- components/domain/earnings-card.tsx (date display pattern)
- components/domain/index.ts (barrel pattern)

FILES TO CREATE:
- lib/discovery/catalysts.ts
- components/domain/catalyst-timeline-card.tsx

FILES TO EDIT:
- lib/agent/tools.ts (add tool definition at end of createResearchTools)

DO NOT EDIT:
- components/domain/index.ts (integration session)
- components/assistant-ui/tool-uis.tsx (integration session)
- lib/agent/system-prompt.ts (integration session)
```

---

### TRACK D Prompt — scan_candidates Enhancement

```
I need you to enhance the `scan_candidates` tool in `lib/agent/tools.ts`.

CONTEXT:
- scan_candidates currently aggregates: watchlist (4pts), earnings 7-day (3pts), FMP gainers (2pts), FMP losers (2pts), StockTwits trending (1pt), Reddit trending (2pts)
- It deduplicates, scores, optionally filters by sector, and returns top 15
- The tool lives in `createResearchTools()` starting around line 421
- Known problem: returns micro-cap/ADR tickers that have no candle data, wasting research cycles
- `batchFetchProfiles()` helper already exists (line 222) for batch Finnhub profile fetches

CHANGES NEEDED:

### 1. Extend earnings calendar to 30 days
- Change `7 * 86400_000` to `30 * 86400_000` on the `nextWeek` variable (rename to `nextMonth`)
- This is a one-line change

### 2. Add new parameters to inputSchema
Update `scanParams` to:
```ts
const scanParams = z.object({
  sectors: z.array(z.string()).optional()
    .describe("Sectors to focus on"),
  theme_filter: z.string().optional()
    .describe("Theme name from detect_market_themes to boost matching tickers (e.g. 'AI Infrastructure')"),
  min_market_cap: z.number().optional()
    .describe("Minimum market cap in dollars (default $1B). Filters out micro-caps."),
  min_avg_volume: z.number().optional()
    .describe("Minimum 10-day average volume (default 500K). Filters out illiquid stocks."),
});
```

### 3. Add quality filtering AFTER the existing sector filtering logic
After the sector filter block (around line 572), add:

a) Batch-fetch financial metrics for remaining candidates:
   - For each ticker in `filtered`, fetch Finnhub `/stock/metric?symbol=${ticker}&metric=all`
   - Extract `marketCapitalization` (in millions — multiply by 1M) and `10DayAverageTradingVolume`
   - Do this in batches of 5 (same pattern as batchFetchProfiles) to stay under rate limits

b) Filter:
   - Remove tickers with market cap below `min_market_cap` (default 1_000_000_000)
   - Remove tickers with 10-day avg volume below `min_avg_volume` (default 500_000)
   - FMP volume is in millions (e.g., 2.5 = 2.5M shares), multiply by 1_000_000

c) If filtering removes everything, keep top 5 unfiltered (existing fallback pattern)

### 4. Add volume spike detection
For candidates that pass filters:
- Check if the ticker's current volume from Finnhub quote is > 2x the 10-day average volume
- Mark those with `volume_spike: true`

### 5. Add theme_filter support
When `theme_filter` is provided:
- Define a lightweight theme-to-tickers map (can be hardcoded initially):
  ```ts
  const THEME_TICKERS: Record<string, string[]> = {
    "AI Infrastructure": ["NVDA", "AMD", "AVGO", "SMCI", "MSFT", "GOOGL", "META", "TSM", "MRVL", "ARM"],
    "GLP-1 / Weight Loss": ["LLY", "NVO", "AMGN", "VKTX", "HIMS"],
    // ... same themes as detect_market_themes
  };
  ```
- Boost matching tickers by +3 score points during the scoring phase
- Do this BEFORE deduplication/ranking, not after

### 6. Update return shape
Add to the returned object:
```ts
filters_applied: {
  min_market_cap: minCap,
  min_avg_volume: minVol,
  dropped_count: preFilterCount - filtered.length,
  theme_filter: themeFilter ?? null,
},
volume_spikes: filtered
  .filter(([, v]) => v.data.volume_spike)
  .map(([ticker]) => ticker),
```

### 7. Update the _sources array to mention the filters

CONSTRAINTS:
- Preserve the existing scoring + deduplication logic exactly
- Preserve the existing return shape (earnings, movers, total_found, sources_queried, note, _sources)
- Only ADD new fields/filters
- Keep the sector filtering fallback behavior
- Handle metric fetch failures gracefully (if can't get market cap, keep the ticker)
- Use the existing `finnhub()` helper for all API calls

FILES TO READ:
- lib/agent/tools.ts (lines 220-638 for batchFetchProfiles + scan_candidates)

FILES TO EDIT:
- lib/agent/tools.ts (scan_candidates tool definition only — inputSchema + execute function)

DO NOT EDIT:
- Any other tool in the file
- lib/agent/system-prompt.ts (integration session)
- components/assistant-ui/tool-uis.tsx (integration session)
```

---

## 7. Final Integration Prompt

```
I've completed 4 parallel workstreams for the Discovery Layer v1. I need you
to integrate everything: update the system prompt, register new tool UIs,
add barrel exports, and verify nothing is broken.

THE 4 TRACKS THAT WERE COMPLETED:

Track A: `get_market_overview` now returns: regime, spy_trend,
  macro_events_today, earnings_density (in addition to existing spy, vix,
  sectors fields)

Track B: New `detect_market_themes` tool added to createResearchTools().
  New file: lib/discovery/themes.ts (detectThemes function).
  New file: components/domain/market-themes-card.tsx (MarketThemesCard).

Track C: New `scan_catalysts` tool added to createResearchTools().
  New file: lib/discovery/catalysts.ts (scanCatalysts function).
  New file: components/domain/catalyst-timeline-card.tsx (CatalystTimelineCard).

Track D: `scan_candidates` enhanced with: theme_filter, min_market_cap,
  min_avg_volume params. Volume spike detection added. Earnings extended
  to 30 days.

INTEGRATION TASKS:

### 1. Update system prompt (`lib/agent/system-prompt.ts`)

Rewrite the discovery phases (Phase 1 and Phase 2). Keep the rest unchanged.

Current Phase 1-2:
- Phase 1: "Call get_market_overview..."
- Phase 2: "Call scan_candidates..."

New Phase 1-2 (4-step discovery funnel):

Phase 1: Market Context (keep mostly the same, but add):
"Note the **regime classification** (RISK_ON/RISK_OFF/NEUTRAL). In RISK_OFF,
raise your effective confidence threshold by 10 points and prefer defensive
sectors. Check macro_events_today for market-moving economic events."

Phase 1.5: Theme Detection (NEW):
"Call **detect_market_themes** to identify dominant market narratives. Review
which themes align with your sector focus and strategy. If a strong theme
(strength > 0.6) matches your sectors, you'll use it to filter candidates."

Phase 1.75: Catalyst Pipeline (NEW):
"Call **scan_catalysts** to check for upcoming events. Prioritize:
- Earnings in the next 3 days (time-sensitive positioning)
- Insider buying clusters (strong conviction signal)
- Analyst upgrades from major firms
- Economic events (FOMC, CPI) that affect your sectors
Note any time-sensitive catalysts for priority research."

Phase 2: Find Candidates (UPDATED):
"Call **scan_candidates**. Use these parameters based on your discovery:
- If a strong theme was detected, pass `theme_filter` with the theme name
- Always set `min_market_cap` (default $1B) to filter junk
- Set `min_avg_volume` (default 500K) to ensure tradeable names
- Note any `volume_spikes` — elevated volume confirms institutional interest

When selecting 3-5 tickers for deep research, prioritize:
1. Tickers with upcoming catalysts (especially earnings in < 3 days)
2. Tickers appearing in multiple scan sources (higher score)
3. Tickers matching the strongest detected theme
4. Volume spike tickers (unusual activity = potential opportunity)
5. Watchlist tickers (always research if present)"

Keep Phases 3-6 exactly as they are.

### 2. Register tool UIs (`components/assistant-ui/tool-uis.tsx`)

Add tool UI registrations inside `useRegisterResearchToolUIs()`. Follow the
EXACT same pattern as existing registrations (ChainOfThought loading state
when result is null, domain card when result is available, SourceChips footer).

a) `detect_market_themes`:
   - Loading: ChainOfThought with steps "Analyzing market news", "Scanning social trends", "Identifying themes"
   - Complete: MarketThemesCard with themes data + SourceChips
   - Import MarketThemesCard from @/components/domain

b) `scan_catalysts`:
   - Loading: ChainOfThought with steps "Checking earnings calendar", "Scanning economic events", "Reviewing insider activity"
   - Complete: CatalystTimelineCard with catalysts data + SourceChips
   - Import CatalystTimelineCard from @/components/domain

c) Update `get_market_overview` UI:
   - If result contains `regime` field, pass it to MarketContextCard
   - The MarketContextCard already accepts a `regime` prop — but currently the
     tool-uis.tsx DERIVES regime from VIX/SPY data. Update it to use the tool's
     `regime` field if present, falling back to the derived value.
   - Map tool regime values to card regime values:
     RISK_ON → "trending_up", RISK_OFF → "volatile", NEUTRAL → "range_bound"
   - If `macro_events_today` is present and non-empty, show it in the
     `todaysApproach` field or `keyLevels` field of MarketContextCard

d) Update `scan_candidates` UI:
   - If result contains `volume_spikes`, show volume spike badges on those tickers
   - If result contains `filters_applied`, show a small "Filtered X" note
   - These are minor enhancements to the existing ScanResultsCard render

### 3. Add barrel exports (`components/domain/index.ts`)

Add:
```ts
export {
  MarketThemesCard,
  type MarketThemesData,
  type MarketThemesCardProps,
} from "./market-themes-card";
export {
  CatalystTimelineCard,
  type CatalystTimelineData,
  type CatalystTimelineCardProps,
} from "./catalyst-timeline-card";
```

### 4. Update builder/editor tool access

In `app/api/chat/analyst-builder/route.ts`:
- Add `detect_market_themes` and `scan_catalysts` to the destructured tools
  the builder gets access to (read-only discovery tools are safe for builder)

In `app/api/chat/analyst-editor/route.ts`:
- Add `detect_market_themes` to available tools (editor can show market context)

### 5. Verify cron compatibility

Read `lib/inngest/functions/morning-research.ts` and verify:
- It uses createResearchTools() which auto-includes new tools ✓
- It uses buildSystemPrompt() which will get the updated prompt ✓
- No manual tool list that needs updating
- The generateText call's maxSteps is high enough for 4 extra tool calls
  (was 25, may need to increase to 30)

FILES TO READ FIRST:
- lib/agent/system-prompt.ts (current prompt)
- components/assistant-ui/tool-uis.tsx (current tool UI registrations)
- components/domain/index.ts (current barrel exports)
- app/api/chat/analyst-builder/route.ts (builder tool access)
- app/api/chat/analyst-editor/route.ts (editor tool access)
- lib/inngest/functions/morning-research.ts (cron config)
- components/domain/market-themes-card.tsx (verify export name)
- components/domain/catalyst-timeline-card.tsx (verify export name)

FILES TO EDIT:
- lib/agent/system-prompt.ts
- components/assistant-ui/tool-uis.tsx
- components/domain/index.ts
- app/api/chat/analyst-builder/route.ts
- app/api/chat/analyst-editor/route.ts
- lib/inngest/functions/morning-research.ts (only if maxSteps needs bumping)
```

---

## 8. Validation Checklist

### Functional validation

- [ ] `get_market_overview` returns `regime`, `spy_trend`, `macro_events_today`, `earnings_density` fields
- [ ] `detect_market_themes` returns 3-8 themes with name, strength, direction, tickers
- [ ] `scan_catalysts` returns catalysts from at least earnings + economic calendar sources
- [ ] `scan_candidates` with `min_market_cap: 1000000000` filters out micro-caps
- [ ] `scan_candidates` with `min_avg_volume: 500000` filters out illiquid tickers
- [ ] `scan_candidates` with `theme_filter: "AI Infrastructure"` boosts AI-related tickers
- [ ] `scan_candidates` earnings window is 30 days (not 7)
- [ ] Volume spike detection flags tickers with >2x average volume
- [ ] All tools return valid `_sources` arrays
- [ ] All tools handle API failures gracefully (no crashes, return partial data + error notes)

### Agent behavior validation

- [ ] Agent calls `get_market_overview` first (regime + context)
- [ ] Agent calls `detect_market_themes` second (identifies narratives)
- [ ] Agent calls `scan_catalysts` third (finds upcoming events)
- [ ] Agent calls `scan_candidates` fourth (with appropriate filters)
- [ ] Agent narrates theme and catalyst findings before selecting research targets
- [ ] Agent uses regime to calibrate aggressiveness (mentions it in narration)
- [ ] Agent uses theme_filter when a strong theme is detected
- [ ] Agent prioritizes tickers with upcoming catalysts
- [ ] Agent mentions volume spikes when selecting candidates
- [ ] Phases 3-6 (deep research → thesis → trade → summary) still work normally

### UI validation

- [ ] `MarketThemesCard` renders themes with strength bars, direction badges, ticker chips
- [ ] `CatalystTimelineCard` renders catalysts in timeline format grouped by date
- [ ] `MarketContextCard` shows regime badge from tool result
- [ ] `ScanResultsCard` shows volume spike indicators
- [ ] ChainOfThought loading states appear for new tools while they're running
- [ ] SourceChips appear after tool completion for new tools
- [ ] All cards follow existing design patterns (p-0, border-b header, etc.)

### System validation

- [ ] Manual run: click Run on analyst page → full discovery flow → thesis → trade
- [ ] Cron run: `morning-research.ts` still works with new tools and updated prompt
- [ ] Builder chat: `analyst-builder` has access to `detect_market_themes` and `scan_catalysts`
- [ ] Editor chat: `analyst-editor` has access to `detect_market_themes`
- [ ] No TypeScript errors in build
- [ ] No console errors in browser during agent run
- [ ] Rate limits respected (not exceeding Finnhub 60 req/min with additional calls)

### Regression checks

- [ ] Existing tools (get_stock_data, get_technical_analysis, etc.) still work
- [ ] Thesis creation still works (show_thesis persists to DB)
- [ ] Trade placement still works (place_trade calls Alpaca)
- [ ] Run summary still works (summarize_run marks COMPLETE)
- [ ] Briefing generation still works (updateAnalystBriefing fires post-run)
- [ ] Completed runs still render in RunUnifiedChat
- [ ] Tool UIs for all 15 existing tools still render correctly
