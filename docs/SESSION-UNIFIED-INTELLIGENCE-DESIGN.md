# Session: Unified Intelligence Design System

## Your Mission
Standardize all intelligence surfaces across the app into one cohesive design language. Right now briefs, findings, theses, and run sources all look completely different — different padding, different card patterns, different typography, different modal layouts. They need to feel like they belong to the same product. Study the Perplexity Finance screenshots provided for inspiration — clean prose, inline ticker badges with price changes, favicon sources, readable paragraphs. Not a grid of random badges and labels.

## Context
This is a paper trading platform where AI analysts research stocks and place trades. The intelligence pipeline works like this:
1. **Monitors** run daily — search queries via Perplexity Sonar, domain monitoring, API calls to FMP/Finnhub
2. **Findings** (signals) come back — headline, summary, tickers, sentiment, sources
3. **Findings get routed** to matching analysts based on coverage
4. **Morning briefs** are generated per analyst from their routed findings — market context, portfolio alerts, watchlist updates, new opportunities, risk flags
5. **Agent runs** happen — the analyst reads their brief + findings, researches live, generates **theses** (Strong Buy / Sell with price targets), and places paper trades

The 4 content types that need unified design:
- **Finding** — a piece of intelligence from the outside world (news, data)
- **Brief** — a daily analyst summary synthesized from findings
- **Thesis** — an analyst's trade recommendation with price targets
- **Run source** — an article/filing/social post the agent found during live research

## What Exists Today (read these files)

### Findings
- `components/intelligence/signal-feed.tsx` — signal cards + detail sheet
- `components/intelligence/types.ts` — Signal interface

### Briefs
- `components/intelligence/brief-cards.tsx` — card grid + detail dialog
- Morning brief data: marketContext (paragraph), portfolioAlerts [{ticker, alert, urgency}], watchlistUpdates [{ticker, update, recommendation}], newOpportunities [{headline, tickers[], thesisSeed}], attentionPriority (string[]), riskFlags (string[])

### Theses
- `components/domain/thesis-card.tsx` — the newer thesis card + sheet with tabs
- `components/ThesisCard.tsx` — the older thesis card (used in ResearchFeed/dashboard)
- Thesis data: ticker, direction (LONG/SHORT/PASS), confidenceScore, reasoningSummary, thesisBullets[], riskFlags[], entryPrice, targetPrice, stopLoss, holdDuration, signalTypes[], sourcesUsed[]

### Run Sources
- `components/research/run-sources-panel.tsx` — Perplexity-style source list grouped by category (News, Filings, Social, etc.) with favicons
- `components/research/AgentThread.tsx` — has Chat + Sources tabs

### Shared Components Already Available
- `components/ui/pnl-arrow.tsx` — PnlArrow for up/down sentiment (green/red rounded square arrows, used in trades table)
- `components/intelligence/icons.tsx` — Perplexity, Firecrawl, Finnhub, FMP logos
- Google favicon service: `https://www.google.com/s2/favicons?sz=16&domain=reuters.com`
- StockLogo component exists for company logos

### Pages Where These Surface
- `/` (Dashboard) — has Open/Closed trade tabs in sidebar, Recent Picks
- `/intelligence` — Findings tab, Monitors tab, Briefs tab
- `/analysts/[id]` — Briefings tab, Morning Briefs tab, Overview tab, sidebar with equity curve + trades + watchlist
- `/stocks/[symbol]` — Overview, Financials, News, Theses tabs
- `/trades` — trade table with filters
- `/runs` — run list; `/runs/[id]` — AgentThread with Chat + Sources tabs

## The Design System to Build

### 1. Unified Detail View Pattern
Every content type (finding, brief, thesis) when clicked should open in the SAME modal structure. Use ShadCN Dialog with `sm:max-w-4xl`. The inner layout:

```
┌─────────────────────────────────────────────────────────────┐
│ [padding: p-6, enough to clear the X button]                │
│                                                             │
│ PROSE CONTENT — readable paragraphs, not badge soup.        │
│ Think Perplexity's watchlist view: flowing text with        │
│ **bold ticker names** and inline `↘ 3.95%` price badges.   │
│                                                             │
│ ─────────────────────────── (separator)                     │
│                                                             │
│ TICKER SECTIONS — one section per relevant stock:           │
│ Logo + Name + Ticker mono + Price + Change                  │
│ Why it matters: paragraph explaining the relevance          │
│                                                             │
│ ─────────────────────────── (separator)                     │
│                                                             │
│ SOURCES — favicon + name + domain, clickable                │
│                                                             │
│ ─────────────────────────── (separator)                     │
│                                                             │
│ META — timestamp, signal count, analyst name, monitor info  │
└─────────────────────────────────────────────────────────────┘
```

Key rules:
- **Prose first, not badges.** The market context, alert text, thesis reasoning — these are PARAGRAPHS. They should read like a Perplexity answer. Bold key terms. Inline price changes as small colored badges within the text (like Perplexity does: `Amazon ↘ 3.95%`).
- **Ticker sections use the stock logo** + company name + mono ticker + live price if available. Not a Badge component — a proper row with the company identity.
- **No random uppercase labels** like "PORTFOLIO ALERTS" or "WATCHLIST UPDATES" as section titles. Use readable headers: "Portfolio", "Watchlist", "Opportunities". Or better yet, just flow it as prose sections with separators.
- **Sources are favicon + name rows**, clickable, with external link on hover. Already built in signal-feed.tsx — reuse that pattern.
- **p-6 padding minimum** on the dialog inner wrapper. The current brief dialog has content colliding with the X button — fix this everywhere.

### 2. Unified Card Pattern (for lists/grids)
When findings, briefs, or theses appear in a LIST (on a page, in a tab, in a sidebar), they should all be the same Card structure:

```
┌────────────────────────────────────────────────────────┐
│ Headline text                          TICKER  ↘ arrow │
│                                                        │
│ Summary paragraph — text-sm, 2-line clamp              │
│                                                        │
│ 🌐 Source Name                              timestamp  │
└────────────────────────────────────────────────────────┘
```

This is what findings already look like after this session's work. Theses and briefs should use the SAME card shape:
- **Finding card**: headline + summary + source favicon + timestamp. Ticker + sentiment arrow top-right.
- **Thesis card**: "Strong Buy MSFT" as headline + reasoning summary + analyst name + timestamp. Confidence as a subtle indicator.
- **Brief card**: analyst name as title + market context as summary + count badges + timestamp.

Same padding (p-4), same font sizes (text-sm for title, text-sm text-muted-foreground for body), same hover state.

### 3. Inline Price Change Badges
Perplexity shows `Meta Platforms ↘ 3.99%` inline in prose. Build a small reusable component:
```tsx
<InlineTicker name="Amazon" change={-3.95} />
// renders: Amazon ↘ 3.95% (with red arrow and text)
```
Use this INSIDE paragraphs — in brief market context, in thesis reasoning, in finding summaries. Not as standalone badges in a grid.

### 4. Where Everything Surfaces

#### Homepage (`/`) — Add "Intel" tab in sidebar
Next to Open/Closed trade tabs, add an "Intel" tab showing:
- Today's top 5 findings (compact cards)
- Brief summary per analyst (one-liner + "View brief" link)
- Any theses generated today

#### Analyst Page (`/analysts/[id]`) — Integrate findings + briefs
- **Morning Briefs tab**: use the new brief cards + unified dialog
- **Add Findings tab**: findings routed to this analyst, using the unified finding cards
- **Sidebar**: "Today's Brief" summary card — just the market context + focus tickers

#### Stock Page (`/stocks/[symbol]`) — Add intelligence section
- On Overview tab or as new "Intel" tab: findings where ticker matches this symbol
- Show any brief alerts mentioning this ticker
- Theses tab already exists — align its card design to the unified pattern

#### Run Page (`/runs/[id]`) — Evolve Sources tab
The Sources tab already exists with a Perplexity-style layout. Expand it into 3 sections:
1. **Intelligence In** — the brief + findings the agent read via `read_morning_brief` and `read_signals` tools at the start of the run. Render as compact cards. Extract this data from the tool call results in the chat messages.
2. **Research Sources** — what exists today. Articles, filings, social posts found during live research.
3. **Outputs** — theses generated during the run. Extract from `record_thesis` tool results. Render as compact thesis cards.

This tells the story: what the analyst knew → what they researched → what they decided.

#### Trades Page — Thesis link
Each trade row already links to a thesis. When expanded, show the thesis card inline + the findings that informed it.

### 5. Brief Dialog Specifically
The current brief dialog is the worst offender. Rewrite it using the unified pattern:

**Instead of:**
- "PORTFOLIO ALERTS" header → ticker badge → text → urgency badge
- "NEW OPPORTUNITIES" header → card-in-a-card → ticker badges
- "WATCHLIST UPDATES" header → ticker → text → recommendation badge
- "RISK FLAGS" header → red badges with truncated text

**Do this:**
- Opening paragraph: the market context, flowing prose
- "Portfolio" section: for each ticker, render as a proper stock row (logo + name + mono ticker + change arrow), followed by the alert text as a paragraph underneath. Urgency indicated by a subtle left border color or icon, not a screaming badge.
- "Opportunities" section: each opportunity as a paragraph with inline ticker mentions (using InlineTicker), not a card-in-a-card
- "Watchlist" section: same as portfolio — stock row + explanation paragraph + subtle recommendation text
- Risk flags: paragraph text with a small flag icon, not destructive badges
- Focus tickers: stock logo row at the bottom

### 6. What NOT to Change
- Monitor list + popovers on `/intelligence` Monitors tab — just redesigned, leave alone
- Agent chat message rendering — tool UIs in the chat are their own thing
- The pipeline trigger dropdown
- Backend / API routes / data model — no changes needed

## Technical Notes
- Read CLAUDE.md for design rules (ShadCN only, no custom classes on ShadCN components, color rules, typography scale)
- Use existing ShadCN components: Card, Badge, Dialog, Separator, Tooltip, Sheet
- PnlArrow from `components/ui/pnl-arrow.tsx` for directional indicators
- Google favicon service for source logos: `https://www.google.com/s2/favicons?sz=16&domain=example.com`
- StockLogo component for company logos in ticker rows
- All numbers use `tabular-nums` class
- Positive: `text-emerald-500`, Negative: `text-red-500`

## Execution Order
1. Build the unified detail dialog pattern as a shared layout component
2. Build the InlineTicker component
3. Rewrite brief-cards.tsx dialog using the unified pattern
4. Align signal-feed.tsx detail sheet to the unified pattern
5. Align thesis card sheet to the unified pattern
6. Add Intel tab to homepage sidebar
7. Add Findings tab to analyst page
8. Evolve run Sources tab with Intelligence In / Research / Outputs sections
9. Add intel section to stock page

Each step should be independently shippable. Don't try to do all 9 at once.
