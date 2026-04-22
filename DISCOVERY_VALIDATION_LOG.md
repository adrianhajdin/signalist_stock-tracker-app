# Discovery Layer v1 — Validation Log

> Track results here as you run tests. Reference [DISCOVERY_VALIDATION_PLAN.md](./DISCOVERY_VALIDATION_PLAN.md) for full criteria.

---

## Tool-Level Results

### get_market_overview

| Test | Date | Result | Notes |
|------|------|--------|-------|
| Regime classification boundaries | | | |
| Sector momentum accuracy | | | |
| SPY trend calculation | | | |
| Macro events populated | | | |
| Earnings density | | | |
| VIX fallback | | | |
| Source attribution | | | |
| Weekend/holiday behavior | | | |

### detect_market_themes

| Test | Date | Result | Notes |
|------|------|--------|-------|
| Theme relevance | | | |
| Strength normalization | | | |
| Direction classification | | | |
| Ticker relevance | | | |
| Reddit overlap | | | |
| Empty news day | | | |
| Keyword false positives | | | |
| Source count | | | |

### scan_catalysts

| Test | Date | Result | Notes |
|------|------|--------|-------|
| Earnings calendar accuracy | | | |
| Insider clustering | | | |
| Analyst action direction | | | |
| Economic event filtering | | | |
| Date sorting | | | |
| Summary accuracy | | | |
| next_high_impact | | | |
| Empty window | | | |
| catalystTypes filter | | | |

### scan_candidates

| Test | Date | Result | Notes |
|------|------|--------|-------|
| Quality filter effectiveness | | | |
| Theme filter boost | | | |
| Volume spike detection | | | |
| Exclusion list | | | |
| Watchlist priority | | | |
| Deduplication | | | |
| Fallback on over-filtering | | | |
| Source diversity | | | |
| Sector + quality filter interaction | | | |

---

## End-to-End Scenarios

| # | Scenario | Date | Run ID | Funnel Compliant | Tickers Researched | Trades Placed | Notes |
|---|----------|------|--------|------------------|--------------------|---------------|-------|
| 1 | Risk-off macro day | | | | | | |
| 2 | AI theme day | | | | | | |
| 3 | Earnings-heavy week | | | | | | |
| 4 | Weak candidate pool | | | | | | |
| 5 | Noisy social sentiment | | | | | | |
| 6 | Conflicting sector leadership | | | | | | |
| 7 | Thin catalyst calendar | | | | | | |
| 8 | Narrow sector focus | | | | | | |
| 9 | Multiple strong themes | | | | | | |
| 10 | Full API degradation | | | | | | |

---

## Failure Mode Checks

| Failure Mode | Date | Triggered? | Handled Correctly? | Notes |
|-------------|------|------------|-------------------|-------|
| Noisy themes | | | | |
| Empty catalyst sets | | | | |
| Poor candidate pool | | | | |
| Illiquid fallback names | | | | |
| Step budget exhaustion | | | | |
| Contradictory signals | | | | |
| API degradation | | | | |
| Weekend/after-hours | | | | |

---

## Hard Fail Checklist

> Any single hard fail = discovery layer needs fixing.

- [ ] Agent skips discovery tools → straight to get_stock_data
- [ ] Micro-cap (<$500M) researched without being watchlisted
- [ ] Regime classified incorrectly (RISK_ON when VIX > 30)
- [ ] Agent hallucinates catalysts not in tool results
- [ ] Step budget exhausted before summarize_run
- [ ] Tool returns data that crashes UI card
- [ ] _sources missing or contains uncalled providers

---

## Comparison: Pre vs Post Discovery

> Fill in after 20+ post-discovery runs. Pull pre-discovery data from runs before Tracks A-E merged.

| Metric | Pre-Discovery (baseline) | Post-Discovery | Delta |
|--------|-------------------------|----------------|-------|
| Median market cap of researched tickers | | | |
| Median avg daily volume | | | |
| % tickers with catalyst in 7 days | | | |
| % tickers matching detected theme | | | |
| Funnel compliance rate | N/A | | |
| Regime referenced in narration | | | |
| Avg steps per run | | | |
| Win rate (after 20+ trades) | | | |
| Pass accuracy | | | |

---

## Weekly Summary

### Week 1
**Focus**: Tool-level validation
**Runs completed**:
**Key findings**:

### Week 2
**Focus**: Scenarios 1-5
**Runs completed**:
**Key findings**:

### Week 3
**Focus**: Scenarios 6-10 + failure modes
**Runs completed**:
**Key findings**:

### Week 4
**Focus**: Comparison analysis
**Runs completed**:
**Ship decision**:
