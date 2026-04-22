# Discovery Layer v1 — Validation & QA Plan

## Validation Goals

1. **Tool Quality**: Each discovery tool returns accurate, well-structured data under normal and degraded conditions
2. **Funnel Compliance**: The agent follows the 4-phase discovery funnel (regime → themes → catalysts → candidates) before deep research
3. **Selection Quality**: Candidate tickers surfaced by the discovery layer are higher-quality (more liquid, more catalysts, more thematic relevance) than pre-discovery runs
4. **Reasoning Integration**: The agent references regime, themes, and catalysts in its narration and thesis reasoning — not just calling tools and ignoring results
5. **Graceful Degradation**: When data sources fail or return empty, the agent adapts rather than hallucinating or stalling
6. **Step Budget**: The additional discovery tools fit within the 30-step budget without crowding out deep research and trade execution

---

## 1. Tool-Level Tests

### 1.1 get_market_overview

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Regime classification boundaries** | Call during known market conditions. Compare VIX level + SPY position vs SMA-20 against expected regime | VIX < 16 + SPY above SMA-20 → RISK_ON. VIX > 25 OR (SPY below SMA-20 + 5d return < -1%) → RISK_OFF. Otherwise → NEUTRAL |
| **Sector momentum accuracy** | Compare sector `momentum` field ("leading"/"lagging") against actual ETF price vs 10-day SMA | All classified sectors match manual check of price vs SMA-10 |
| **SPY trend calculation** | Verify `spy_trend.sma_20` against manual 20-day average of SPY closes | SMA-20 within $0.50 of manual calculation |
| **Macro events populated** | Call on a day with known economic releases (FOMC, CPI, jobs) | `macro_events_today` contains the expected events with correct impact levels |
| **Earnings density** | Call during earnings season vs off-season | Count reflects actual number of companies reporting in the 5-day window |
| **VIX fallback** | Simulate Finnhub ^VIX failure (or test on weekend when data may be stale) | Falls back to VIXY ETF quote. `api_errors` notes the fallback |
| **Source attribution** | Inspect `_sources` array | Contains Finnhub attribution for quotes, FMP for macro calendar. All have non-empty `provider` and `title` |
| **Weekend/holiday behavior** | Call on Saturday or market holiday | Returns last-known data without errors. Regime still classifiable from cached candle data |

### 1.2 detect_market_themes

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Theme relevance** | Call and verify top theme matches current market narrative (manually check financial news) | Top 1-2 themes align with what Bloomberg/CNBC are covering |
| **Strength normalization** | Inspect all returned theme strengths | Top theme = 1.0, all others 0.0–1.0, monotonically decreasing |
| **Direction classification** | For top 3 themes, verify BULLISH/BEARISH/NEUTRAL against headline sentiment | Direction matches manual reading of representative headlines |
| **Ticker relevance** | For each theme, verify tickers are actually related to that theme | No obviously misclassified tickers (e.g., $KO in "AI Infrastructure") |
| **Reddit overlap** | Compare `reddit_overlap` count against manual check of Reddit trending | Count within ±2 of actual overlap |
| **Empty news day** | Test on a low-news day (holiday weekend) | Returns fewer themes or empty array. Does not hallucinate themes |
| **Keyword false positives** | Check if broad keywords (e.g., "energy", "bank") cause noise themes | Theme scores reflect genuine narrative strength, not keyword spam |
| **Source count** | Inspect `meta.headlines_analyzed` | Matches actual number of Finnhub articles fetched (up to 50) |

### 1.3 scan_catalysts

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Earnings calendar accuracy** | Compare returned earnings catalysts against known earnings dates (e.g., from earningswhispers.com) | All HIGH impact earnings within 14d window are present |
| **Insider clustering** | Verify insider catalysts represent genuine clusters (2+ insiders) or large purchases (>$500K) | No single small purchases slip through |
| **Analyst action direction** | Check that upgrades → BULLISH, downgrades → BEARISH | Direction matches the actual grade change |
| **Economic event filtering** | Verify only US events are returned | No foreign economic data in results |
| **Date sorting** | Inspect catalyst order | Sorted ascending by date |
| **Summary accuracy** | Verify `summary.by_type` counts match actual catalyst array | Counts are exact |
| **next_high_impact** | Check `summary.next_high_impact` | Points to the earliest future HIGH-impact catalyst date |
| **Empty window** | Test with `forwardDays: 1` on a day with no catalysts | Returns empty array, summary totals = 0, no errors |
| **catalystTypes filter** | Pass `catalystTypes: ["EARNINGS"]` only | Only earnings catalysts returned, other sources not called |

### 1.4 scan_candidates

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Quality filter effectiveness** | Compare pre-filter vs post-filter candidate list | Micro-caps (<$1B) and illiquid names (<500K avg volume) removed. `filters_applied.dropped_count` > 0 |
| **Theme filter boost** | Pass `theme_filter: "AI Infrastructure"` and check scores | AI-related tickers (NVDA, SMCI, etc.) score higher than non-AI tickers |
| **Volume spike detection** | Check `volume_spikes` array against actual volume data | Flagged tickers have current volume > 2x their 10-day average |
| **Exclusion list** | Pass excluded tickers and verify they don't appear | Zero excluded tickers in results |
| **Watchlist priority** | Pass watchlist tickers and verify they score highest (4 points) | Watchlist tickers appear in results even if not trending |
| **Deduplication** | Check for duplicate tickers across earnings + movers | Each ticker appears once with combined source attribution |
| **Fallback on over-filtering** | Pass very high `min_market_cap` ($500B) to trigger fallback | Returns top 5 unfiltered candidates rather than empty results |
| **Source diversity** | Inspect `sources_queried` array | Lists all attempted sources: Finnhub, FMP, StockTwits, Reddit, Watchlist |
| **Sector filter + quality filter interaction** | Pass narrow sector + quality filters | Sector filter applied before quality filter. If all removed, falls back to top 5 |

---

## 2. End-to-End Run Tests

### 2.1 Funnel Compliance

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Phase ordering** | Review tool call sequence in a completed run | Order is: get_market_overview → detect_market_themes → scan_catalysts → scan_candidates → (deep research tools) → show_thesis → place_trade → summarize_run |
| **No skipped phases** | Check that all 4 discovery tools are called | All 4 present in tool call history. No runs that skip directly to get_stock_data |
| **Theme informs candidates** | Check if agent passes `theme_filter` to scan_candidates when a strong theme exists | When detect_market_themes returns a theme with strength > 0.6, agent uses theme_filter |
| **Regime informs behavior** | In RISK_OFF regime, check if agent raises confidence threshold or mentions defensive bias | Agent narration references regime. In RISK_OFF: mentions caution, defensive sectors, or raised threshold |
| **Catalysts inform priority** | Check if agent researches tickers with near-term catalysts first | Tickers with earnings < 3d appear earlier in research sequence than tickers with no catalysts |

### 2.2 Candidate Selection Quality

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Market cap floor** | Check all researched tickers against market cap | Zero tickers below $1B market cap (or configured minimum) |
| **Liquidity floor** | Check average daily volume for researched tickers | Zero tickers below 500K avg daily volume (or configured minimum) |
| **Thematic coherence** | For theme-focused analysts, check if researched tickers match the theme | ≥60% of researched tickers relate to the analyst's focus area |
| **Source diversity** | Check if researched tickers came from multiple scan sources | Not all tickers from a single source (e.g., not all from StockTwits) |

### 2.3 Reasoning Quality

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Regime reference in narration** | Search agent text for regime-related language | Agent mentions regime classification, VIX interpretation, or sector leadership in Phase 1 narration |
| **Theme reference in thesis** | Check show_thesis reasoning bullets for theme mentions | When a theme was detected, ≥1 thesis bullet references it |
| **Catalyst reference in thesis** | Check show_thesis reasoning for upcoming catalyst mentions | When a catalyst exists for the ticker, thesis mentions it (e.g., "earnings in 2 days") |
| **Volume spike reference** | Check if agent mentions volume spikes when present | When scan_candidates flags volume_spikes, agent notes it in research narration |
| **Pass justification quality** | Review PASS theses | PASS reasoning references discovery context (e.g., "no near-term catalyst", "counter to current theme", "illiquid") |

### 2.4 Step Budget

| Test | Method | Pass Criteria |
|------|--------|---------------|
| **Discovery phase step cost** | Count steps consumed by the 4 discovery tools | Discovery phase uses ≤5 steps (4 tool calls + 1 narration step) |
| **Total run completion** | Check if agent reaches summarize_run | Run completes with summarize_run called. Status = COMPLETE |
| **Research depth preserved** | Count deep research tools called per ticker | ≥3 research tools per ticker (get_stock_data + get_technical_analysis + at least 1 more) |
| **Ticker coverage** | Count tickers researched in a full run | ≥3 tickers receive deep research (not just scanned) |
| **Trade execution** | Count place_trade calls vs eligible theses | Every thesis with confidence ≥ minConfidence gets a place_trade call |

---

## 3. Failure Mode Tests

### 3.1 Noisy Themes

**Setup**: Run during a period with no dominant narrative (flat market, low news volume).

| Check | Pass Criteria |
|-------|---------------|
| Themes returned are low-strength (all < 0.4) | Agent does NOT use theme_filter in scan_candidates |
| Agent narration acknowledges no strong themes | Text says something like "no dominant theme" or "mixed signals" |
| Agent still produces quality candidates | Falls back to score-based ranking without theme boost |

### 3.2 Empty Catalyst Sets

**Setup**: Run scan_catalysts with `forwardDays: 1` on a non-earnings day, or mock empty API responses.

| Check | Pass Criteria |
|-------|---------------|
| scan_catalysts returns empty array | summary.total = 0, no errors |
| Agent narration acknowledges thin catalyst calendar | Mentions "light catalyst calendar" or "no near-term catalysts" |
| Agent still selects candidates | Falls back to movers + trending + watchlist |
| No false urgency | Agent doesn't fabricate upcoming events |

### 3.3 Poor Candidate Pool

**Setup**: Narrow-sector analyst (e.g., UTILITIES only) + quality filters on a flat day.

| Check | Pass Criteria |
|-------|---------------|
| scan_candidates fallback triggers | When filters remove all candidates, top 5 unfiltered returned |
| Agent acknowledges thin pool | Narration notes limited candidates in the sector |
| Agent doesn't force trades | If no high-conviction setups, agent produces PASS theses |
| Run still completes | summarize_run called with honest assessment |

### 3.4 Illiquid Fallback Names

**Setup**: Watchlist includes illiquid tickers (e.g., micro-cap ADRs).

| Check | Pass Criteria |
|-------|---------------|
| Watchlist tickers bypass quality filter | Watchlist names appear in results (score 4 = highest priority) |
| get_technical_analysis handles missing candle data | Tool returns partial data or error, agent notes it |
| Agent adjusts position sizing | Mentions liquidity concern in thesis or reduces confidence |
| No phantom trades | place_trade uses actual available price, not stale data |

### 3.5 Step Budget Exhaustion

**Setup**: Analyst with large watchlist (10+ tickers) + all discovery tools.

| Check | Pass Criteria |
|-------|---------------|
| Agent prioritizes effectively | Researches top 3-5 candidates deeply rather than 10 superficially |
| summarize_run still called | Even if deep research is truncated, summary is produced |
| Discovery phase doesn't bloat | 4 discovery tools complete in ≤5 steps |
| No silent truncation | If agent runs out of steps, the last action is summarize_run, not a dangling research call |

### 3.6 Contradictory Signals

**Setup**: RISK_OFF regime + BULLISH theme (e.g., AI stocks rallying while broad market sells off).

| Check | Pass Criteria |
|-------|---------------|
| Agent acknowledges contradiction | Narration notes the divergence between regime and theme |
| Confidence adjusted appropriately | Thesis confidence reflects the mixed picture (not blindly high) |
| Direction bias considered | If analyst is LONG-only in RISK_OFF, agent is more selective |
| Risk flags populated | show_thesis includes risk flags about regime/theme conflict |

### 3.7 API Degradation (Partial Failure)

**Setup**: One or more data sources fail (Finnhub rate limit, FMP 403, Reddit timeout).

| Check | Pass Criteria |
|-------|---------------|
| get_market_overview `api_errors` populated | Lists which sources failed |
| detect_market_themes works with partial data | Returns themes from available sources (headlines-only if Reddit fails) |
| scan_candidates works with partial sources | Returns candidates from available sources, notes missing ones |
| Agent doesn't crash or stall | Run continues through all phases |
| Source attribution accurate | `_sources` only includes providers that actually returned data |

### 3.8 Weekend/After-Hours

**Setup**: Trigger manual run on Saturday or after 4 PM ET.

| Check | Pass Criteria |
|-------|---------------|
| Quotes return last-close data | SPY/VIX show Friday's close, not null |
| Regime classifiable | Uses last-known candle data for SMA calculation |
| Earnings calendar correct | Shows upcoming week's earnings, not stale past data |
| Agent notes market closed | Narration acknowledges after-hours context |

---

## 4. Comparison Methodology

### 4.1 Data Collection

**Pre-discovery baseline**: Select 5-10 completed runs from before Tracks A-E merged. Record:
- Tickers researched (from show_thesis calls)
- Market cap of each ticker (lookup at time of run)
- Average daily volume of each ticker
- Whether ticker had an upcoming catalyst
- Thesis confidence scores
- Trade outcomes (WIN/LOSS/PENDING)
- Total tool calls and steps used
- Whether agent mentioned regime, themes, or catalysts (search narration text)

**Post-discovery runs**: Run the same analyst configs and record identical metrics.

### 4.2 Comparison Metrics

| Metric | How to Measure | Improvement Signal |
|--------|---------------|-------------------|
| **Candidate quality** | Median market cap of researched tickers | Higher median = better filtering |
| **Liquidity** | Median avg daily volume of researched tickers | Higher median = more tradeable names |
| **Catalyst alignment** | % of researched tickers with catalyst in next 7 days | Higher % = better timing |
| **Theme coherence** | % of researched tickers matching detected theme | Higher % = more focused research |
| **Funnel compliance** | % of runs that call all 4 discovery tools in order | 100% target |
| **Reasoning depth** | Count of regime/theme/catalyst references in narration | More references = better integration |
| **Step efficiency** | Steps used for discovery vs deep research | Discovery ≤5 steps, deep research ≥15 steps |
| **Thesis quality** | Average confidence of LONG/SHORT theses | Should not inflate (same or slightly higher = good) |
| **Trade outcomes** | Win rate on trades from discovery-informed runs | Higher or equal win rate (requires 20+ trades to be meaningful) |
| **Pass accuracy** | % of PASS theses where the stock moved against the passed direction | Higher = better pass decisions |

### 4.3 Statistical Considerations

- **Sample size**: Need ≥20 post-discovery runs for meaningful comparison (roughly 4 weeks of daily runs across 5 analysts)
- **Market regime control**: Compare runs in similar regimes (don't compare RISK_ON discovery runs against RISK_OFF baseline runs)
- **Analyst config control**: Same analyst config for pre vs post comparison
- **Survivorship bias**: Include failed runs in analysis (FAILED status)
- **Metric priority**: Candidate quality and funnel compliance are leading indicators. Trade outcomes are lagging and need larger samples.

### 4.4 Judgment Framework

Discovery is an improvement if:
1. **Must have**: 100% funnel compliance (all 4 tools called in order)
2. **Must have**: Zero micro-cap/illiquid tickers researched (unless watchlisted)
3. **Should have**: ≥50% of researched tickers have a catalyst within 7 days
4. **Should have**: Agent references regime in ≥80% of runs
5. **Should have**: Step budget not exceeded (summarize_run always called)
6. **Nice to have**: Win rate ≥ baseline (needs 20+ trades)
7. **Nice to have**: Average thesis confidence not inflated (within ±5% of baseline)

---

## 5. Recommended Test Scenarios

### Scenario 1: Risk-Off Macro Day
**Conditions**: VIX > 25, SPY down >1%, broad sector weakness
**What to validate**:
- Regime classified as RISK_OFF
- Agent raises effective confidence threshold in narration
- Fewer trades placed (higher bar)
- Defensive sectors (XLU, XLP, XLV) noted as relative leaders
- PASS theses reference regime risk
- If LONG-only analyst, produces mostly PASS theses with honest reasoning
**Pass criteria**: Agent mentions RISK_OFF regime, places ≤2 trades, no aggressive momentum longs

### Scenario 2: AI Theme Day
**Conditions**: NVDA, SMCI, AVGO rallying. AI-related headlines dominating news. Reddit buzzing about semiconductors.
**What to validate**:
- detect_market_themes returns AI/semiconductor theme with strength > 0.7
- Agent passes `theme_filter` to scan_candidates
- Researched tickers are AI-adjacent
- Theme referenced in thesis bullets
- Volume spikes on AI names detected and noted
**Pass criteria**: Top theme is AI-related. ≥3 of 5 researched tickers are in AI/semiconductor space.

### Scenario 3: Earnings-Heavy Week
**Conditions**: Major earnings week (FAANG + banks, or post-quarter reporting surge). 50+ companies reporting.
**What to validate**:
- scan_catalysts returns HIGH-impact earnings catalysts
- Earnings density noted in get_market_overview
- Agent prioritizes tickers reporting in next 1-3 days
- Thesis reasoning references upcoming earnings as catalyst
- Position sizing accounts for earnings volatility risk
**Pass criteria**: ≥2 researched tickers have earnings within 3 days. Earnings mentioned in thesis.

### Scenario 4: Weak Candidate Pool
**Conditions**: Flat market day. Low volume. No major movers. Narrow-sector analyst (e.g., REAL_ESTATE only).
**What to validate**:
- scan_candidates quality filter may drop most candidates
- Fallback to top 5 triggers
- Agent acknowledges thin opportunity set
- Agent doesn't force low-conviction trades
- PASS theses dominate with honest "nothing compelling" reasoning
- Run still completes with summarize_run
**Pass criteria**: Agent produces ≥2 PASS theses. Does not fabricate catalysts. summarize_run called.

### Scenario 5: Noisy Social Sentiment
**Conditions**: Meme stock spike (GME, AMC trending). Reddit dominated by squeeze talk. StockTwits trending full of micro-caps.
**What to validate**:
- detect_market_themes may surface "meme_retail_squeeze" theme
- scan_candidates quality filter removes micro-cap meme names
- Agent doesn't chase meme momentum unless strategy specifically targets it
- Thesis for meme names (if researched) has appropriate risk flags
- Agent distinguishes signal from noise in narration
**Pass criteria**: No micro-cap meme stocks researched (unless watchlisted). Quality filter drops ≥5 candidates.

### Scenario 6: Conflicting Sector Leadership
**Conditions**: Tech rallying (+1.5%), Energy crashing (-2%). Mixed signals across sectors. VIX moderate (18-22).
**What to validate**:
- Regime classified as NEUTRAL (not RISK_ON despite tech strength)
- Sector momentum correctly identifies leaders and laggers
- detect_market_themes surfaces both bullish (tech) and bearish (energy) themes
- Agent narrates the divergence
- Thesis accounts for sector-specific dynamics, not just broad market
**Pass criteria**: Agent mentions sector divergence. Does not treat as uniformly bullish or bearish.

### Scenario 7: Thin Catalyst Calendar
**Conditions**: Mid-quarter lull. No major earnings for 2+ weeks. No FOMC/CPI. Few analyst actions.
**What to validate**:
- scan_catalysts returns few or no catalysts
- summary.total ≤ 5
- Agent acknowledges light calendar
- Candidate selection relies more on technical + theme signals than catalyst timing
- Agent doesn't fabricate upcoming events
- Run quality maintained despite no catalyst urgency
**Pass criteria**: Agent notes "light catalyst calendar" or equivalent. Still produces quality research.

### Scenario 8: Narrow Sector Focus Analyst
**Conditions**: Analyst configured with sectors: ["HEALTHCARE"] only. Biotech/pharma-focused strategy prompt.
**What to validate**:
- scan_candidates sector filter keeps only healthcare names
- detect_market_themes evaluates biotech_pharma theme
- Catalysts include FDA dates, biotech earnings
- If no healthcare movers today, agent acknowledges and may widen scan
- Quality filter + sector filter interaction doesn't eliminate all candidates
- Fallback works (top 5 unfiltered if healthcare filter too aggressive)
**Pass criteria**: ≥80% of researched tickers are healthcare. Sector noted in thesis bullets.

### Scenario 9: Multiple Strong Themes Competing
**Conditions**: Two or more themes with strength > 0.6 (e.g., AI Infrastructure + Rates & Fed both strong).
**What to validate**:
- Agent picks one theme for `theme_filter` (or acknowledges both)
- Narration explains theme selection rationale
- Doesn't blindly use the top theme — considers alignment with analyst strategy
- Researched tickers may span both themes
- No confusion in thesis about which theme supports the position
**Pass criteria**: Agent narrates theme choice. theme_filter matches analyst's sector focus when relevant.

### Scenario 10: Full API Degradation
**Conditions**: Simulate by running during API maintenance or rate-limit window. Alternatively, test with invalid API key for one provider.
**What to validate**:
- get_market_overview returns partial data with `api_errors` populated
- detect_market_themes works with fewer headlines
- scan_catalysts gracefully returns what's available
- scan_candidates uses available sources only
- Agent narration notes data limitations
- Run completes despite degraded data
**Pass criteria**: Run reaches COMPLETE status. Agent mentions data issues. No hallucinated data.

---

## 6. Pass/Fail Criteria Summary

### Hard Fails (any one = discovery layer needs fixing)
- [ ] Agent skips discovery tools and goes straight to get_stock_data
- [ ] Micro-cap ticker (<$500M market cap) researched without being on watchlist
- [ ] Regime classified incorrectly (RISK_ON when VIX > 30)
- [ ] Agent hallucinates earnings dates or catalysts not in tool results
- [ ] Step budget exhausted before summarize_run (run stuck at RUNNING)
- [ ] Tool returns malformed data that crashes the UI card
- [ ] _sources array missing or contains providers that weren't actually called

### Soft Fails (acceptable individually, concerning in aggregate)
- [ ] Agent calls discovery tools but ignores results in reasoning
- [ ] Theme filter not used despite strong theme detected
- [ ] Catalyst timing not reflected in research priority order
- [ ] Agent trades against its own regime assessment without explanation
- [ ] Volume spikes detected but not mentioned
- [ ] Same candidate quality as pre-discovery runs (no improvement)
- [ ] Discovery phase uses >6 steps

### Success Indicators
- [ ] 100% funnel compliance across 20+ runs
- [ ] Median market cap of researched tickers > $5B
- [ ] ≥50% of researched tickers have catalyst within 7 days
- [ ] Regime referenced in ≥80% of run narrations
- [ ] Theme referenced in ≥50% of thesis bullets (when strong theme exists)
- [ ] Step budget: discovery ≤5 steps, total run ≤28 steps
- [ ] Zero runs where summarize_run is not called
- [ ] Win rate ≥ baseline after 20+ trades (lagging indicator)

---

## Execution Plan

### Week 1: Tool-Level Validation
- Run each discovery tool in isolation via the builder chat or direct API calls
- Verify output shapes, source attribution, edge cases
- Document any contract mismatches or data quality issues

### Week 2: End-to-End Runs (Scenarios 1-5)
- Run 2-3 analysts daily, manually reviewing each run's tool sequence and narration
- Score each run against funnel compliance and reasoning quality checklists
- Log candidate quality metrics (market cap, volume, catalyst presence)

### Week 3: End-to-End Runs (Scenarios 6-10) + Failure Modes
- Target specific failure scenarios with narrow-focus analysts
- Test weekend/after-hours behavior
- Test API degradation (if safely testable)

### Week 4: Comparison Analysis
- Pull pre-discovery run data from DB
- Compare against Week 2-3 post-discovery runs
- Score against judgment framework
- Decide: ship as-is, tune prompts, or fix tool issues
