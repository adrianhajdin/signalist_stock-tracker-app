# Unified Intelligence Design System

## Context
All intelligence surfaces (findings, briefs, theses) look like they're from different apps. Different padding, text sizes, section headers, ticker treatments, card patterns, detail modals. The user designed `ThesisCard.tsx` (homepage) and likes it — everything else should match that visual language: `p-3` sections with `border-b`, `text-sm font-light` body text, `font-mono text-[11px]` tickers, StockLogo for stocks, no badge soup, readable section headers.

## Reference Pattern (ThesisCard.tsx — DO NOT MODIFY)
- Card: `div.rounded-lg border bg-background hover:border-foreground/25 transition-colors`
- Sections: `p-3 border-b` each
- Name: `text-lg font-brand font-bold`
- Body: `text-sm font-light text-muted-foreground leading-relaxed`
- Ticker: `font-mono text-[11px] text-muted-foreground`
- Meta: `text-[11px]` or `text-xs`
- Numbers: `tabular-nums`
- Section headers in details: sentence case `text-sm font-medium` (NOT uppercase tracking-wide)

---

## Step 1: `components/intelligence/signal-feed.tsx`
Other steps depend on exports from this file.
- **Export `Favicon`** — change `function Favicon` to `export function Favicon`
- **Export `SignalRow`** — add `export` to the memo declaration
- **Signal detail: Sheet → Dialog** — replace Sheet with `Dialog sm:max-w-4xl p-0`, inner `max-h-[85vh] overflow-y-auto`
- **Signal detail layout**: `p-3 border-b` sections — headline `text-lg font-semibold` + summary prose, StockLogo ticker rows, source favicon rows (keep existing pattern), discovery meta
- Remove unused Sheet imports, add Dialog imports, add StockLogo import

## Step 2: `components/intelligence/brief-cards.tsx`
The worst offender. Rewrite BriefDetail; keep BriefCard grid but align styling.

**BriefCard** — keep `Card p-4`, just remove badge soup:
- Remove destructive/secondary/outline badge row for counts
- Replace with plain text: "3 alerts · 2 opp." in `text-xs text-muted-foreground`
- Keep analyst name, market context 2-line clamp, focus tickers as mono, timestamp

**BriefDetail** — rewrite as `p-3 border-b` sections:
- Header: analyst name `text-lg font-semibold` left, date right
- Market context: `text-sm leading-relaxed` (foreground, not muted — readable prose)
- Portfolio: header "Portfolio" `text-sm font-medium`. Each alert: `StockLogo sm` + `font-mono text-[11px]` ticker + PnlArrow + alert text `text-sm text-muted-foreground`. Drop urgency Badge
- Opportunities: header "Opportunities" `text-sm font-medium`. Headline `text-sm font-medium` + inline tickers + thesisSeed prose. No card-in-card
- Watchlist: header "Watchlist" `text-sm font-medium`. `StockLogo sm` + ticker + update text + recommendation as `text-xs text-muted-foreground` (not Badge)
- Risks: header "Risks" `text-sm font-medium`. Flag icon + text `text-sm text-muted-foreground`. No red bullets
- Focus: StockLogo + mono ticker row
- Footer: signal count + generated time

Add imports: `StockLogo`, `PnlArrow`. Remove: `AlertTriangle`, `Sparkles`, `Eye`, `Badge`, `Tooltip*`.

## Step 3: `components/analysts/MorningBriefFeed.tsx`
Align to same visual language as fixed BriefDetail.
- Replace `Card p-6` with card matching the pattern
- Date + signal count header (remove Radar icon)
- Market context as `text-sm text-muted-foreground leading-relaxed`
- Portfolio alerts: `StockLogo sm` + mono ticker + alert text (remove `Badge $TICKER`)
- Watchlist: same (remove `Badge $TICKER`)
- Opportunities: headline + inline ticker text (remove Zap icon header)
- Risk flags: prose text (remove `text-red-500` bullets, remove AlertTriangle icon header)
- Focus tickers: StockLogo row (remove `Badge variant="secondary" $TICKER`)
- Section headers: "Portfolio", "Watchlist", "Opportunities", "Risks" in `text-sm font-medium`

Add: `StockLogo`, `PnlArrow`. Remove: `Radar`, `Zap`, `Eye`, `Briefcase`, `AlertTriangle`, `Badge`.

## Step 4: `components/analysts/BriefingCard.tsx`
Post-run briefs — align to consistent visual language.
- Wrap each card in `rounded-lg border bg-background` instead of `py-6 border-b`
- `p-3 border-b` sections
- Date + relative time (remove Calendar/Clock icons)
- Stats in `text-[11px] text-muted-foreground`
- Narrative: keep TickerMarkdown, `text-sm leading-relaxed` in `p-3 border-b`
- Watch Tomorrow: `StockLogo sm` + mono ticker rows. Header "Watch Tomorrow" `text-sm font-medium` (remove Eye icon prefix)
- Unresolved: header "Unresolved" `text-sm font-medium` (remove amber, remove AlertCircle icon prefix)
- Self-Corrections: header "Self-Corrections" `text-sm font-medium` (remove RefreshCw icon prefix)

## Step 5: `components/domain/thesis-card.tsx`
Fix the sheet detail only. Do NOT touch the card itself or the SheetTrigger pattern.
- Remove Tabs/TabsList/TabsTrigger/TabsContent — flow content sequentially
- Rewrite sheet content as `p-6 space-y-5` with Separators between sections:
  - Header: StockLogo lg + name + ticker/exchange + verdict badge + confidence circle (keep existing)
  - PriceGauge + price levels (keep)
  - Reasoning: `text-sm leading-relaxed` prose (remove uppercase "Summary" label)
  - Bull case: header "Bull Case" `text-sm font-medium` (remove uppercase). Keep CheckCircle2 icons
  - Risks: header "Risks" `text-sm font-medium` (remove uppercase). Keep AlertCircle icons
  - Signal types: badge row (keep)
  - Fundamentals: inline below (remove tab wrapper). Keep grid + consensus bar
- Add `Separator` import. Remove `Tabs` imports.

## Step 6: `components/dashboard/DashboardClient.tsx`
Add "Intel" tab in right sidebar.
- Add `TabsTrigger value="intel"` after "Closed"
- Add `TabsContent value="intel"` rendering inline `IntelSidebar` component
- `IntelSidebar`: `useEffect` fetches `/api/intelligence/signals?limit=5` + `/api/intelligence/briefs`
- Renders: brief one-liners (analyst name + context snippet, linked to `/analysts/[id]`), top finding headlines with ticker + PnlArrow, "View all intelligence" link
- Add imports: `Signal`, `MorningBrief` types, `relativeTime`, `PnlArrow`, `StockLogo`, `ArrowRight`

## Step 7: `components/analysts/AnalystDetailClient.tsx`
Add "Findings" tab.
- Add `TabsTrigger value={2}` for "Findings" (shift Overview to value={3})
- Add `TabsContent value={2}` that fetches `/api/intelligence/signals?analystId=${config.id}` and renders using imported `SignalRow` from signal-feed.tsx
- Each signal row opens the same Dialog detail (can reuse signal-feed's pattern or keep simple)

## Step 8: `app/api/intelligence/signals/route.ts`
Add `analystId` query param support.
- Parse `analystId` from searchParams
- Add WHERE: `routes: { some: { analystId } }` when present

## Step 9: `app/(root)/stocks/[symbol]/page.tsx`
Add "Intel" tab.
- Add `TabsTrigger value="intel"` after "Theses"
- Client component `StockIntelTab` fetches `/api/intelligence/signals?ticker=${symbol}`
- Renders signal rows with same card pattern, omitting ticker display since you're already on that stock's page
- Wrap in `Suspense`
- Create as `components/stocks/StockIntelTab.tsx` (small client component)

## Step 10: `components/research/run-sources-panel.tsx`
Add Intelligence In + Outputs sections.
- Extend extraction to pull from `read_morning_brief` and `read_signals` tool results → "Intelligence In" section
- Extend extraction to pull from `record_thesis` tool results → "Outputs" section
- Rename existing sources to "Research Sources"
- Three section headers with `text-sm font-medium` + icon + count
- Intelligence In: compact cards with brief summary + signal headlines + StockLogo tickers
- Outputs: compact thesis rows with StockLogo + direction arrow + confidence + reasoning snippet

---

## Verification
After each step:
1. `preview_logs` — check for compilation errors
2. `preview_snapshot` — check page renders
3. `preview_console_logs` — check for runtime errors
4. Navigate to the specific page that uses the modified component

Key pages to verify:
- `/intelligence` (steps 1-2)
- `/analysts/[id]` (steps 3-4, 7)
- `/runs/[id]` (step 5, 10)
- `/` dashboard (step 6)
- `/stocks/[symbol]` (step 9)
