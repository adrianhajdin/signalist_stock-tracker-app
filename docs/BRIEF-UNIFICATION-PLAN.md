# Brief Unification Plan

## What exists today (the mess)
- `BriefCard` in `brief-cards.tsx` — intelligence brief cards on /intelligence
- `MorningBriefCard` in `MorningBriefFeed.tsx` — same data, different card, on analyst page
- `BriefingCard` in `BriefingCard.tsx` — post-run briefs on analyst page, completely different design
- `BriefDetailDialog` in `brief-detail.tsx` — dialog for intelligence briefs only
- `MorningBriefDetail` in `MorningBriefFeed.tsx` — another dialog for same data
- Post-run briefs have NO dialog at all

## The two brief types

### Intelligence Brief ("Daily Intel Scan")
- Generated 7:45 AM before agent runs
- Purpose: overnight signal digest
- Data: marketContext, portfolioAlerts[], watchlistUpdates[], newOpportunities[], riskFlags[], attentionPriority[]
- Character: structured, per-ticker insights with action recommendations

### Post-Run Brief ("Run Summary")
- Generated after each research run
- Purpose: what the agent did and decided
- Data: narrative (markdown), portfolioSnapshot (P&L/record), strategyNotes, watchTomorrow[], unresolvedItems[], selfCorrections[], marketPosture
- Character: prose narrative with portfolio metrics

## What to build

### 1. One card component: `<BriefCard>`
Used on /intelligence briefs tab AND on analyst page for past briefs.
- Props: `type: "intel" | "run"`, common display fields
- Shows: type label ("Daily Intel" / "Run Summary"), 2-line preview text, date, ticker badges
- Same padding, same text sizes, same hover state regardless of type
- Click opens the appropriate dialog

### 2. One dialog shell, two content variants
- `<BriefDialog>` — owns the Dialog/DialogContent/DialogHeader
- Header: analyst name as DialogTitle, date
- Content switches by type:
  - Intel brief: the ticker-item list we just built (TickerBadge + tag + summary per stock, risks at bottom)
  - Run brief: narrative as TickerMarkdown, then structured sections (watchTomorrow with TickerBadge, portfolio snapshot as small metrics row, strategy notes as italic prose)
- Footer: signal count / metrics, timestamp

### 3. Analyst page layout
- **Inline summary**: most recent brief of either type, rendered as prose on the page. No card. Just the text with TickerMarkdown if it's a run brief, or the marketContext if it's an intel brief. Below it, a few TickerBadges for focus stocks.
- **3-col grid**: 3 most recent briefs (any type) as `<BriefCard>`s
- **Tab for history**: "View all" opens full list of past briefs, both types interleaved by date

### 4. Files
- `components/intelligence/brief-card.tsx` — the ONE card (replaces BriefCard in brief-cards.tsx, MorningBriefCard in MorningBriefFeed.tsx, and BriefingCard.tsx as a card)
- `components/intelligence/brief-detail.tsx` — the ONE dialog (replaces BriefDetailDialog and the nonexistent post-run dialog)
- Delete `components/analysts/MorningBriefFeed.tsx` — replaced by brief-card.tsx
- Delete `components/analysts/BriefingCard.tsx` — replaced by brief-card.tsx
- Update `components/intelligence/brief-cards.tsx` — just the grid, imports BriefCard
- Update `components/analysts/AnalystDetailClient.tsx` — inline summary + 3-col grid + tab

### 5. Data normalization
Both brief types need to be normalized into a common shape for the card:
```ts
type UnifiedBrief = {
  id: string;
  type: "intel" | "run";
  analystName: string;
  date: string;
  preview: string; // marketContext for intel, first ~200 chars of narrative for run
  tickers: string[]; // attentionPriority for intel, watchTomorrow symbols for run
  // Original data for the dialog
  intelBrief?: MorningBrief;
  runBrief?: AnalystBriefingItem;
}
```
