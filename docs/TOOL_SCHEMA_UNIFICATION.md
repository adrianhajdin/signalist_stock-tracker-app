# Tool Schema Unification — Handoff Brief

## The Problem

Every tool returns a different shape. The UI has to know field names per tool (`alert` vs `update` vs `headline` vs `thesisSeed`), parse nested objects differently, and build display strings with custom logic per tool. The agent also receives these inconsistent shapes in its context, making it harder to reason about what it learned.

## Current Tool Return Shapes

### Intelligence Layer (3 tools, 3 different shapes)

**`read_morning_brief`** returns:
```ts
{
  available: boolean,
  marketContext: string,           // free text paragraph
  portfolioAlerts: [{              // field: "alert"
    ticker: string, alert: string, urgency: string, signalIds: string[]
  }],
  watchlistUpdates: [{             // field: "update"
    ticker: string, update: string, recommendation: string, signalIds: string[]
  }],
  newOpportunities: [{             // field: "headline" or "thesisSeed", tickers is array
    headline: string, tickers: string[], thesisSeed: string, signalIds: string[]
  }],
  attentionPriority: string[],
  riskFlags: string[],
  signalCount: number,
  _sources: SourceData[]
}
```
**Problems**: Three different array shapes for the same concept (a finding about a stock). `portfolioAlerts` uses `ticker` (singular), `newOpportunities` uses `tickers` (array). The text field is `alert` in one, `update` in another, `thesisSeed` in the third. The UI has to check all three names.

**`read_signals`** returns:
```ts
{
  count: number,
  signals: [{
    headline: string, summary: string, tickers: string[],
    sentiment: string, urgency: string,
    sourceNames: string[], sourceUrls: string[]
  }],
  _sources: SourceData[]
}
```
**Problems**: `sourceNames` and `sourceUrls` are parallel arrays (index-matched), not objects. Tickers is always an array even for single-ticker signals.

**`read_artifact`** returns:
```ts
{
  title: string, url: string, contentMarkdown: string,
  _sources: SourceData[]
}
```
**This one is fine** — it's a document, not a stock finding.

### Research Tools (5 tools, deeply nested)

**`get_stock_data`** returns:
```ts
{
  quote: { price, change_pct, ... },
  company: { name, sector, market_cap, exchange, ... },
  financials: { pe_ratio, pb_ratio, beta, high_52w, low_52w, avg_volume_10d },
  technicals: { rsi_14, sma_20, sma_50, trend, position_in_52w_range, volume_ratio },
  analyst_consensus: { strong_buy, buy, hold, sell, strong_sell },
  news: [{ headline, source, datetime, url }],
  _sources: SourceData[]
}
```
**Problem**: The UI currently digs into `result.company.sector`, `result.financials.pe_ratio`, `result.analyst_consensus.buy` to build a summary line. The agent gets this raw nested object and has to know the schema. A pre-built summary would serve both better.

**`get_earnings_data`** returns:
```ts
{
  next_earnings: { date, eps_estimate },
  recent_quarters: [{ period, actual_eps, estimated_eps, surprise, surprise_pct }],
  beat_rate: string,
  _sources: SourceData[]
}
```

**`get_options_flow`** returns:
```ts
{
  available: boolean,
  put_call_ratio: number,
  signal: string,
  total_call_volume: number, total_put_volume: number,
  contracts_available: number,
  unusual_contracts: [{ type, strike, expiration, volume }],
  _sources: SourceData[]
}
```

**`get_sec_filings`** returns:
```ts
{
  filings: [{ type, date, description, url }],
  _sources: SourceData[]
}
```

**`get_market_context`** returns:
```ts
{
  spy: { price, change_pct }, vix: { level, change_pct },
  regime: string, spy_trend: { sma_20, position, pct_from_sma },
  sectors: [{ symbol, change_pct, momentum }],
  macro_events_today: [{ event, impact }],
  earnings_density: { count, period },
  _sources: SourceData[]
}
```

## Proposed Unified Return Shape

Every tool result should include a **standard envelope** that both the agent and the UI can rely on:

```ts
interface ToolResult {
  // Summary the agent can read without parsing nested objects
  summary: string;

  // Per-ticker findings (if applicable)
  tickers?: TickerFinding[];

  // Source attribution
  _sources?: SourceData[];

  // Tool-specific raw data (agent can dig into if needed)
  data?: Record<string, unknown>;
}

interface TickerFinding {
  ticker: string;
  tag?: string;           // "Holding" | "Watching" | "Opportunity" | "Research" | etc.
  summary: string;        // One-sentence finding about this ticker
}
```

### What this looks like per tool

**`read_morning_brief`** would return:
```ts
{
  summary: "Mixed signals in EV sector. NIO surging on deliveries, BYDDY diverging, TSLA missed estimates.",
  tickers: [
    { ticker: "NIO", tag: "Holding", summary: "9% surge driven by record deliveries and first-ever profitability" },
    { ticker: "BYDDY", tag: "Holding", summary: "Dropped 1.84% despite strong sector performance" },
    { ticker: "TSLA", tag: "Watching", summary: "Missed delivery expectations with 13% YoY drop" },
    { ticker: "F", tag: "Opportunity", summary: "LFP battery investments setting up medium-term supply chain upside" },
  ],
  _sources: [...],
  data: { riskFlags: [...], attentionPriority: [...], signalCount: 12 }
}
```

**`get_stock_data`** would return:
```ts
{
  summary: "Amazon.com Inc, $210.57 (+1.10%). Retail · $2.3T · P/E 29.4 · 93% Buy. 5 news articles.",
  tickers: [
    { ticker: "AMZN", tag: "Research", summary: "Retail · $2.3T · NASDAQ. P/E 29.4, Beta 1.37. Analyst consensus: 93% Buy (76 analysts). Trend: bullish, RSI 62.3" }
  ],
  _sources: [...],
  data: { quote: {...}, company: {...}, financials: {...}, technicals: {...}, news: [...] }
}
```

**`read_signals`** would return:
```ts
{
  summary: "10 signals (4 urgent, 3 bullish, 5 bearish)",
  tickers: [
    { ticker: "FIVN", summary: "Hedge Fund EMJ Capital announces short position citing AI mention risks" },
    { ticker: "FIVN", summary: "Analysts set consensus moderate buy rating with 61.22% upside potential" },
    { ticker: "AMZN", summary: "Classified as sell with -1.87 score after 1.97% decline" },
    // ... up to 10
  ],
  _sources: [...]
}
```

### What does NOT change

These tools already return well-shaped domain objects:
- **`record_thesis`** — returns ThesisCardData (ticker, direction, confidence, bullets, risks, prices)
- **`place_trade`** — returns trade execution data (ticker, direction, shares, entry price, fills)
- **`close_position`** — returns close data (ticker, realized P&L, outcome)
- **`manage_watchlist`** — returns watchlist mutation result
- **`complete_run`** — returns ranked picks, exposure, risk notes

These are ACTION tools with specific schemas. The unification applies to RESEARCH/INTELLIGENCE tools that return "here's what I found about stocks."

## UI Rendering Impact

With the unified shape, `ToolProgressTickerItem` can render ANY tool result the same way:

```tsx
// Before: custom per-tool field extraction
const alert = (a.alert as string) ?? (a.headline as string) ?? (a.summary as string);
const ticker = (a.ticker as string) ?? ((a.tickers as string[])?.[0]);

// After: same shape everywhere
{result.tickers?.map((t) => (
  <ToolProgressTickerItem key={t.ticker} ticker={t.ticker} tag={t.tag}>
    {t.summary}
  </ToolProgressTickerItem>
))}
```

The `summary` field renders as `ClampedText` at the top. The `tickers` array renders as `ToolProgressTickerItem` items. The `_sources` renders as `SourceChips`. Same 3 lines of rendering code for every tool.

## Migration Plan

### Phase 1: Add summary + tickers to tool returns
- Modify each tool's `execute` function in `lib/agent/tools.ts` to compute `summary` and `tickers` fields from the data it already has
- Keep the full `data` object for backward compat and for the agent to dig into
- No prompt changes needed — the agent already gets the full object, now it also gets a pre-built summary

### Phase 2: Update the morning brief generator
- Modify `lib/inngest/functions/morning-brief-generator.ts` to produce the unified shape
- The `MorningBrief` Prisma model stays the same — the tool just reshapes on read

### Phase 3: Simplify rendering
- Replace all per-tool field extraction in `tool-ui-research.tsx` with the generic pattern
- The `tickerSummary` functions in `research-tool-group.tsx` become unnecessary — just read `result.tickers`

### Phase 4: Update system prompt
- Tell the agent that research tools return `{ summary, tickers, _sources, data }`
- The agent reads `summary` for quick context, digs into `data` only when it needs specifics

## Files to Modify

- `lib/agent/tools.ts` — 8 tool execute functions (intelligence + research tools)
- `lib/inngest/functions/morning-brief-generator.ts` — brief output shape
- `components/assistant-ui/tool-uis/tool-ui-research.tsx` — generic rendering
- `components/assistant-ui/research-tool-group.tsx` — remove tickerSummary configs
- `lib/agent/system-prompt.ts` — document unified return shape
