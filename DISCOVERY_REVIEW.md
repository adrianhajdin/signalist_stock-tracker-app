# Discovery Layer Architecture Review

**Reviewer**: Principal Staff Engineer + Head of Product
**Date**: 2026-03-15
**Scope**: Discovery layer only — from "what should I look at?" to "these are my top candidates"

---

## Executive Summary

Your agents are good analysts chained to a bad telescope. The deep research pipeline (Phase 3–6) is genuinely impressive — 10+ data sources per ticker, structured thesis generation, automatic trading, self-improving briefings. That's the hard part, and you've built it.

The discovery layer (Phase 1–2) is the weak link. Today, `scan_candidates` is a flat aggregation of 6 data sources with static point scoring. It finds **what moved today** and **what reports earnings this week**. That's it. It has no concept of themes, catalysts beyond earnings, anomalous behavior, or strategic opportunity sourcing.

The gap between current and target is significant but not architectural. Your tool system, run lifecycle, and agent orchestration are sound. The fix is additive — new tools that slot into the existing `createResearchTools` factory, a richer scan phase in the system prompt, and a few new data source integrations. You do NOT need to rearchitect anything.

**Bottom line**: 3 new tools get you 80% of the target vision. The remaining 20% is refinement and additional data sources you can add incrementally.

---

## Biggest Architectural Issues

### 1. Discovery is a single undifferentiated tool call
`scan_candidates` mashes together earnings, movers, social trending, and watchlist into one scored list. The agent has no way to ask different discovery questions:
- "What themes are driving the market?" → doesn't exist
- "What catalysts are coming in the next 30 days?" → only 7-day earnings
- "What's behaving anomalously?" → only gainers/losers, no volume/relative strength screening

The agent gets one shot at discovery per run. It calls `scan_candidates`, gets 10-15 tickers, picks 3-5, and researches them. There's no iterative narrowing, no thematic filtering, no "I see AI infrastructure is hot, let me scan specifically for AI plays."

### 2. No macro/regime awareness
`get_market_overview` fetches SPY, VIX, and 11 sector ETFs. That's a snapshot, not context. The agent doesn't know:
- Is the Fed meeting this week?
- Are we in a risk-on or risk-off regime?
- What's the yield curve doing?
- Is this earnings season?
- Are sector rotations happening?

Without regime context, every run starts from zero. The agent can't say "VIX is spiking and we're risk-off, so I should focus on defensive names" — it has to infer this from raw ETF prices alone.

### 3. No forward-looking catalyst pipeline
Earnings calendar is the only forward-looking data. The target vision lists: FDA decisions, investor days, product launches, regulatory actions, insider buying clusters, lockup expirations, M&A rumors, economic calendar. None of these exist. This means the agent is reactive (what happened today) instead of proactive (what could move prices this week).

### 4. Scoring is simplistic and analyst-blind
The point system (watchlist=4, earnings=3, movers=2, social=1) is hardcoded. A momentum analyst and a value analyst get the same scan results. The scoring doesn't consider:
- Whether the ticker fits the analyst's strategy
- Volume relative to average (is this move significant?)
- Market cap filters (the micro-cap/ADR problem you already know about)
- Whether the agent already has a position or recently passed on this ticker

### 5. No theme persistence across runs
The target vision's theme detection is the biggest conceptual gap. Today each run is memoryless about market narratives. The briefing system captures performance learnings, but not "AI infrastructure has been the dominant theme for 3 weeks." Themes should accumulate and decay across runs, giving analysts strategic context they can't get from a daily scan.

---

## Current State vs Target State

| Capability | Current | Target | Gap |
|---|---|---|---|
| **Market regime** | SPY + VIX + sector ETFs (point-in-time) | Regime classification, macro calendar, yield curve, risk-on/off signal | Large |
| **Theme detection** | None | News clustering, earnings call topics, ETF flows, social trend analysis → named themes with strength scores | Missing entirely |
| **Catalyst pipeline** | Earnings calendar (7 days) | Earnings + FDA + investor days + product launches + economic calendar + insider clusters + lockup expirations | Large — only 1 of 8+ catalyst types |
| **Anomaly detection** | Top gainers/losers from FMP | Volume spikes, breakouts, gap moves, relative strength surges, unusual options, social spikes, short interest, block trades | Large — only price-based, no volume/behavioral signals |
| **Social discovery** | Reddit trending + StockTwits trending (count-based) | Sentiment clustering, narrative identification, meme detection, retail vs institutional signal separation | Medium |
| **Tradeability filter** | Exclusion list + sector filter | Market cap floor, average volume floor, spread, options liquidity, exchange filter | Medium |
| **Strategy fit scoring** | Hardcoded points, no analyst personality | Dynamic scoring weighted by analyst config (momentum analyst prioritizes breakouts, value analyst prioritizes insider buying) | Medium |
| **Inter-run memory** | Briefings capture performance only | Theme persistence, "I passed on $X last run and it moved 5%", cross-run opportunity tracking | Medium |

---

## Recommended Discovery Architecture

### The Discovery Funnel (3 new tools + 1 enhanced tool)

```
get_market_overview (ENHANCED)
  ↓ adds: regime classification, macro calendar, theme hints

detect_market_themes (NEW)
  ↓ clusters news + social + ETF flows into named themes

scan_catalysts (NEW)
  ↓ forward-looking event calendar across multiple catalyst types

scan_candidates (ENHANCED)
  ↓ adds: volume anomalies, relative strength, market cap filter,
  ↓ accepts theme_filter parameter for thematic scanning

[existing deep research tools unchanged]
```

### Tool 1: `detect_market_themes` (NEW — highest impact)

**What it does**: Clusters recent news, social mentions, and ETF flows into named market themes with strength and direction scores.

**Data sources** (available today, no new APIs needed):
- FMP stock news (bulk, not per-ticker) — cluster by keyword/sector
- Reddit: scan post titles across WSB/stocks/options/investing for recurring topics
- Sector ETF relative performance (already have this data from `get_market_overview`)
- FMP sector performance endpoint
- Finnhub market news (general, not per-ticker)

**Implementation approach**:
```typescript
detect_market_themes: tool({
  description: "Identify dominant market themes and narratives driving capital flows. Returns named themes with strength, direction, and representative tickers.",
  inputSchema: z.object({
    lookback_days: z.number().optional().default(7),
  }),
  execute: async ({ lookback_days }) => {
    // 1. Fetch general market news (Finnhub /news?category=general)
    // 2. Fetch Reddit hot posts across 4 subreddits (already have this)
    // 3. Fetch sector ETF performance (reuse market_overview logic)
    // 4. Fetch FMP sector performance for trend detection
    // 5. Use keyword clustering to identify themes:
    //    - Group news headlines by topic (AI, GLP-1, rate cuts, etc.)
    //    - Count mention frequency across sources
    //    - Map to sectors and representative tickers
    //    - Score by recency-weighted frequency
    // 6. Return top 5-8 themes with strength, direction, key tickers

    // NOTE: This does NOT need an LLM call. Keyword extraction +
    // frequency analysis is sufficient for MVP. The agent (GPT-4.1)
    // interprets the themes — the tool just surfaces the signal.
  }
})
```

**Why this is #1 priority**: Without themes, every scan is random. With themes, the agent can say "AI infrastructure is the strongest theme, let me scan for AI plays" and pass a `theme_filter` to `scan_candidates`. This transforms the agent from reactive to strategic.

**Estimated effort**: Medium. No new APIs. Keyword clustering logic is straightforward. The hard part is tuning the theme extraction to be useful without an LLM in the loop (save the LLM call budget for the agent itself).

### Tool 2: `scan_catalysts` (NEW — second highest impact)

**What it does**: Forward-looking event calendar. Surfaces upcoming events that could move prices.

**Data sources**:
- Finnhub earnings calendar (already have, extend to 30 days)
- FMP economic calendar (`/v3/economic_calendar`)
- Finnhub IPO calendar (`/calendar/ipo`)
- SEC EDGAR recent filings (already have, reframe as catalyst)
- FMP upgrades/downgrades (`/v3/upgrades-downgrades-consensus`)
- Finnhub insider transactions (already fetched in tools but not used for discovery)

**Implementation approach**:
```typescript
scan_catalysts: tool({
  description: "Find upcoming catalysts that could move stock prices: earnings, economic events, insider buying, analyst upgrades, IPOs, and significant SEC filings.",
  inputSchema: z.object({
    lookback_days: z.number().optional().default(3),
    forward_days: z.number().optional().default(14),
    catalyst_types: z.array(z.enum([
      "EARNINGS", "ECONOMIC", "INSIDER", "ANALYST", "IPO", "SEC_FILING"
    ])).optional(),
  }),
  execute: async ({ lookback_days, forward_days, catalyst_types }) => {
    // Fetch all catalyst sources in parallel
    // Normalize into unified catalyst format
    // Score by expected_impact (HIGH/MEDIUM/LOW)
    // Return sorted by date, grouped by type
  }
})
```

**Why this is #2**: Catalysts are the primary edge for a daily-running agent. "NVDA reports earnings in 3 days" is actionable in a way "NVDA was a top gainer today" is not. Extending the earnings window from 7 to 30 days alone is a significant improvement. Adding economic calendar, insider buying, and analyst actions makes the agent forward-looking.

### Tool 3: Enhanced `scan_candidates`

**What changes**:
1. Add `theme_filter` parameter — agent can say "scan for AI infrastructure plays"
2. Add `min_avg_volume` parameter — filter out illiquid micro-caps
3. Add `min_market_cap` parameter — kill the ADR/micro-cap problem
4. Add volume anomaly detection — flag tickers trading >2x average volume
5. Accept output from `detect_market_themes` to bias scoring toward thematic tickers
6. Make scoring weights configurable per-call (or derive from analyst config)

**What stays the same**: The 6-source aggregation pattern, deduplication, the overall structure. This is additive, not a rewrite.

### Tool 4: Enhanced `get_market_overview`

**What changes**:
1. Add a `regime` field: classify as RISK_ON / RISK_OFF / NEUTRAL based on VIX level + SPY trend + sector dispersion
2. Add `macro_events_today` from FMP economic calendar (just today's events)
3. Add `earnings_season` flag (are we in peak earnings week?)
4. Add `theme_hints` — top 2-3 sector ETFs with momentum for the agent to explore

**Why**: The agent needs macro context to make regime-appropriate decisions. A momentum analyst in a risk-off regime should be more selective. This is cheap to add (2 more API calls) and immediately useful.

---

## MVP Implementation Plan

### Phase 1: Quick Wins (1-2 sessions, highest impact)

**1. Enhance `get_market_overview` with regime classification**
- File: `lib/agent/tools.ts` (modify existing tool)
- Add VIX-based regime (VIX < 15 = RISK_ON, 15-25 = NEUTRAL, >25 = RISK_OFF)
- Add SPY trend (above/below 20-day SMA from existing candle logic)
- Add `earnings_density` flag (count of earnings in next 5 days from calendar)
- No new APIs needed — derived from existing data
- **Impact**: Agent immediately gets regime-aware decision making

**2. Add market cap + volume filters to `scan_candidates`**
- File: `lib/agent/tools.ts` (modify existing tool)
- Add `min_market_cap` param (default 1B) — use Finnhub profile `marketCapitalization`
- Add `min_avg_volume` param (default 500K) — from Finnhub quote
- Filter AFTER scoring, BEFORE returning — micro-caps drop out
- **Impact**: Kills the micro-cap/ADR problem. Agents stop wasting research cycles on untradeable tickers.

**3. Extend earnings calendar to 30 days in `scan_candidates`**
- One-line change: `7 * 86400_000` → `30 * 86400_000`
- **Impact**: Agent sees earnings 4 weeks out instead of 1. Can position ahead of catalysts.

**4. Update system prompt for multi-phase discovery**
- File: `lib/agent/system-prompt.ts`
- Change Phase 2 from "call scan_candidates" to a decision tree:
  - "First, call get_market_overview. Based on regime and sector leadership..."
  - "Then call scan_candidates. Consider filtering by your strongest sectors..."
  - "Review candidates: prioritize tickers appearing in multiple sources..."
- **Impact**: Better agent behavior without any tool changes.

### Phase 2: Core Discovery Tools (2-3 sessions)

**5. Build `detect_market_themes`**
- New tool in `lib/agent/tools.ts`
- Data: Finnhub general news + Reddit trending + sector ETF momentum
- Keyword extraction → frequency scoring → theme objects
- No LLM needed in the tool — GPT-4.1 interprets the raw themes
- Add to system prompt Phase 2: "Call detect_market_themes before scan_candidates"

**6. Build `scan_catalysts`**
- New tool in `lib/agent/tools.ts`
- Data: Finnhub earnings (30d) + FMP economic calendar + Finnhub insider transactions
- Returns unified catalyst objects sorted by date
- Agent uses catalysts to prioritize research: "NVDA earnings in 2 days → research NVDA"

**7. Add `theme_filter` to `scan_candidates`**
- After detecting themes, agent passes theme name to scan_candidates
- Tool maps theme to sector + ticker list, boosts matching candidates
- Enables: detect_market_themes → "AI is hot" → scan_candidates({ theme_filter: "AI Infrastructure" })

### Phase 3: Refinement (later sessions)

**8. Analyst-aware scoring**
- Derive scoring weights from AgentConfig: momentum analysts boost mover scores, catalyst analysts boost earnings scores
- Pass analyst config subset into tool context

**9. Theme persistence across runs**
- Store detected themes in a `MarketTheme` table
- Load last run's themes → compare → identify emerging vs fading themes
- Inject into system prompt like briefings

**10. Cross-run opportunity tracking**
- When agent PASSes on a ticker, track it as shadow trade (already partially exists)
- In next run's context, include: "You passed on $TSLA at $180 — it's now $195 (+8.3%)"
- Feeds into briefing system for self-correction

**11. Additional catalyst sources**
- FDA calendar (scrape FDA PDUFA dates or use BioPharmCatalyst API)
- Conference/investor day calendar
- Options expiration (OPEX) dates
- Index rebalancing dates

---

## Long-Term Architecture

### What the discovery funnel looks like at maturity:

```
┌─────────────────────────────────────────────────┐
│ get_market_overview (enhanced)                   │
│   → Regime: RISK_ON / RISK_OFF / NEUTRAL        │
│   → Macro events today                          │
│   → Earnings season flag                        │
│   → Sector leadership + rotation signals        │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ detect_market_themes                             │
│   → 5-8 named themes with strength + direction  │
│   → Representative tickers per theme            │
│   → Theme persistence (new / strengthening /    │
│     fading vs prior run)                        │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ scan_catalysts                                   │
│   → Earnings (30d forward)                      │
│   → Economic calendar                           │
│   → FDA / regulatory                            │
│   → Insider buying clusters                     │
│   → Analyst upgrades                            │
│   → IPOs / lockup expirations                   │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ scan_candidates (enhanced)                       │
│   → Theme-filtered scanning                     │
│   → Volume anomaly detection                    │
│   → Market cap + liquidity floors               │
│   → Relative strength screening                 │
│   → Analyst-config-aware scoring                │
│   → Cross-source deduplication + ranking        │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Agent selects 3-5 tickers for deep research     │
│   (existing Phase 3-6 pipeline, unchanged)      │
└─────────────────────────────────────────────────┘
```

### Run Lifecycle (Discovery → Thesis → Action)

```
1. REGIME ASSESSMENT
   Agent calls get_market_overview
   → Determines: risk regime, sector leadership, macro events
   → Decides: defensive vs aggressive posture for this session

2. THEMATIC SCAN
   Agent calls detect_market_themes
   → Identifies: dominant narratives driving capital
   → Decides: which themes align with its strategy + config

3. CATALYST PIPELINE
   Agent calls scan_catalysts
   → Sees: upcoming events across all catalyst types
   → Decides: any time-sensitive opportunities to prioritize

4. OPPORTUNITY SCAN
   Agent calls scan_candidates with:
   - theme_filter from step 2
   - catalyst awareness from step 3
   - analyst config (sectors, direction bias)
   - market cap + volume floors
   → Gets: 10-15 scored, filtered, tradeable candidates

5. CANDIDATE SELECTION (agent reasoning, no tool)
   Agent narrates why it picks 3-5 tickers:
   - Thematic fit
   - Catalyst timing
   - Source convergence score
   - Strategy alignment
   - Portfolio fit (avoid correlation with open positions)

6. DEEP RESEARCH (existing Phase 3, unchanged)
   Per ticker: stock data, technicals, sentiment, earnings,
   options, filings, peers, news

7. THESIS + TRADE (existing Phase 4-5, unchanged)
   show_thesis → place_trade if confidence ≥ threshold

8. PORTFOLIO REVIEW + SYNTHESIS (existing Phase 5.5-6, unchanged)
   Review exposure → summarize_run

9. POST-RUN BRIEFING (existing, unchanged)
   updateAnalystBriefing captures performance + strategy notes
   → Feeds into next run's system prompt
```

The key change: steps 1-4 replace the current "call get_market_overview then scan_candidates" with a 4-step discovery funnel. Steps 5-9 are unchanged.

---

## File/Module Level Recommendations

### Files to modify:

| File | Change | Risk |
|---|---|---|
| `lib/agent/tools.ts` | Add `detect_market_themes`, `scan_catalysts`. Enhance `get_market_overview` and `scan_candidates`. | Low — additive, existing tools unchanged |
| `lib/agent/system-prompt.ts` | Rewrite Phase 1-2 instructions for multi-phase discovery. Add regime-aware decision framework. | Low — prompt-only change, no code deps |
| `components/research/AgentThread.tsx` | Register tool UIs for new tools: `ThemeCard`, `CatalystCard` | Low — follows existing pattern exactly |
| `components/domain/` | Add `ThemeCard.tsx`, `CatalystCard.tsx` | Low — new files, no modifications to existing |

### Files that likely break or need attention:

| File | Issue | Severity |
|---|---|---|
| `app/api/chat/analyst-builder/route.ts` | Currently destructures tools from `createResearchTools`. Adding new tools won't break it (it cherry-picks), but it should probably get `detect_market_themes` for builder conversations. | Low — works as-is, enhancement opportunity |
| `app/api/chat/analyst-editor/route.ts` | Same as builder — cherry-picks tools, won't break, could benefit from new discovery tools. | Low |
| `lib/inngest/functions/morning-research.ts` | Uses `createResearchTools` directly. New tools are automatically available. System prompt change will affect cron behavior — test carefully. | Medium — behavior change via prompt, not code |
| `components/research/AgentThread.tsx` (`useRegisterAgentToolUIs`) | Must register UI components for new tools or they render as raw JSON. | Medium — forgetting this = ugly UI, not broken functionality |

### Files that should NOT be touched:

| File | Reason |
|---|---|
| `lib/alpaca.ts` | Trading execution is separate from discovery |
| `lib/trade-exit.ts` | Exit strategy is portfolio management, not discovery |
| `lib/prisma.ts` | No schema changes needed for MVP |
| `prisma/schema.prisma` | No new tables needed for MVP (theme persistence is Phase 3) |
| All `components/domain/*Card.tsx` | Existing cards are fine, don't refactor |
| `python-service/*` | Legacy, don't invest here |

### New files to create:

| File | Purpose |
|---|---|
| `components/domain/ThemeCard.tsx` | Renders detected themes (name, strength bar, direction arrow, ticker chips) |
| `components/domain/CatalystCard.tsx` | Renders catalyst timeline (date, type icon, ticker, expected impact) |

---

## What NOT to do

1. **Don't build a separate "discovery service"** — keep tools in `createResearchTools`. The tool system works. Don't fragment it.

2. **Don't add an LLM call inside discovery tools** — the agent IS the LLM. Tools fetch and structure data; the agent interprets. Adding GPT calls inside `detect_market_themes` doubles your token cost and adds latency for no reason.

3. **Don't build a theme database before proving themes work** — start with in-memory keyword clustering in the tool. If the agent produces better research with themes, THEN add persistence.

4. **Don't try to build all catalyst types at once** — start with earnings (30d) + economic calendar + insider transactions. These are 3 API calls you already have or are one endpoint away. FDA, conferences, lockups come later.

5. **Don't rewrite `scan_candidates`** — enhance it. The multi-source aggregation pattern is correct. Add parameters, add filters, improve scoring. Don't start over.

6. **Don't change the model** — GPT-4.1 for the agent is correct. The discovery improvements are data improvements, not reasoning improvements. More signal in → better decisions out.

---

## 5 Follow-Up Prompts

### Prompt 1: Build `detect_market_themes`
```
I need to implement the detect_market_themes tool in lib/agent/tools.ts.

It should:
- Fetch Finnhub general news (/news?category=general&minId=0)
- Fetch Reddit trending from the existing discoverTrendingTickers()
- Use sector ETF performance data (reuse get_market_overview logic)
- Cluster news headlines by keyword/topic extraction
- Return 5-8 named themes with: name, strength (0-1), direction
  (BULLISH/BEARISH/NEUTRAL), key_sectors, representative_tickers
- Include _sources array following existing tool conventions
- No LLM calls inside the tool — pure data aggregation

Also create components/domain/ThemeCard.tsx following the existing
domain card patterns (Card from shadcn, p-6, same border style).
Register it in useRegisterAgentToolUIs in AgentThread.tsx.

Update the system prompt in lib/agent/system-prompt.ts to add a new
Phase 1.5 between market overview and scan_candidates where the agent
calls detect_market_themes and uses the results to guide scanning.
```

### Prompt 2: Build `scan_catalysts`
```
I need to implement scan_catalysts in lib/agent/tools.ts.

Catalyst sources to aggregate:
1. Finnhub earnings calendar — extend to 30 days forward + 3 days back
2. FMP economic calendar (/v3/economic_calendar?from=X&to=Y)
3. Finnhub insider transactions (/stock/insider-transactions) for
   tickers that appeared in scan_candidates results
4. FMP analyst upgrades/downgrades (/v3/upgrades-downgrades-consensus)

Return unified catalyst objects:
{ ticker, catalyst_type, date, expected_impact, direction_bias, details }

Create components/domain/CatalystCard.tsx — timeline-style layout
showing catalysts sorted by date with type icons and impact badges.
Register in AgentThread.tsx.

Update system prompt to add catalyst scanning between theme detection
and candidate scanning. Agent should prioritize time-sensitive catalysts.
```

### Prompt 3: Enhance `scan_candidates` with filters + theme awareness
```
I need to enhance scan_candidates in lib/agent/tools.ts:

1. Add parameters:
   - theme_filter: string (optional) — boost tickers matching a
     detected theme
   - min_market_cap: number (optional, default 1_000_000_000) — filter
     via Finnhub profile marketCapitalization
   - min_avg_volume: number (optional, default 500_000) — filter via
     Finnhub quote volume
   - include_volume_anomalies: boolean (default true) — flag tickers
     with volume > 2x their 20-day average

2. When theme_filter is provided:
   - Map theme to sector keywords and known tickers
   - Add +3 score bonus for matching tickers
   - This lets the agent do thematic scanning

3. Add volume anomaly detection:
   - For top 15 candidates, fetch Finnhub candles (20 days)
   - Compare today's volume to 20-day average
   - Flag >2x as volume_spike: true in results

4. Filter out tickers below market cap and volume floors BEFORE
   returning results.

Keep the existing scoring system intact — these are additive filters
and score boosts, not a rewrite.
```

### Prompt 4: Enhance `get_market_overview` with regime + macro context
```
I need to enhance get_market_overview in lib/agent/tools.ts:

Add to the return object:
1. regime: "RISK_ON" | "RISK_OFF" | "NEUTRAL"
   - VIX < 16 AND SPY above 20d SMA = RISK_ON
   - VIX > 25 OR SPY below 20d SMA with negative momentum = RISK_OFF
   - Otherwise NEUTRAL
   - To get SPY SMA: fetch Finnhub candles for SPY (30 days),
     calculate SMA-20

2. macro_events_today: array from FMP economic calendar for today
   (/v3/economic_calendar?from=TODAY&to=TODAY)
   - Include: event name, actual, estimate, impact level

3. earnings_density: number of companies reporting in next 5 days
   (from Finnhub earnings calendar, count only)

4. sector_momentum: for each sector ETF, is it above or below its
   10-day SMA? Mark as "leading" or "lagging"

Update system prompt to instruct the agent: "Use the regime to
calibrate your aggressiveness. In RISK_OFF, raise your effective
confidence threshold by 10 points and prefer defensive sectors."
```

### Prompt 5: Theme persistence + cross-run opportunity tracking
```
I need to add cross-run intelligence to the discovery layer.

Part 1 — Theme persistence:
- Add a MarketTheme model to prisma/schema.prisma:
  { id, name, strength, direction, sectors, tickers, detectedAt,
    lastSeenAt, runCount, status (EMERGING/ACTIVE/FADING) }
- In detect_market_themes, after computing themes:
  - Load themes from last run
  - Compare: new themes = EMERGING, repeated themes = ACTIVE
    (increment runCount), missing themes = FADING
  - Upsert to MarketTheme table
  - Return persistence metadata to agent

Part 2 — Opportunity tracking:
- When agent creates a PASS thesis, price-monitor.ts already
  tracks shadow trades. Ensure shadow trade results are injected
  into the system prompt for the next run.
- Format: "You passed on $TSLA at $180 on 3/14. It's now $195
  (+8.3%). Your pass was INCORRECT — consider being more aggressive
  on momentum plays."
- Load last 5 shadow trade evaluations into the briefing context.

Part 3 — Update system prompt:
- Add a "## Market Themes" section showing ACTIVE and EMERGING themes
- Add a "## Recent Pass Accuracy" section showing shadow trade results
- Agent should reference these when explaining candidate selection
```
