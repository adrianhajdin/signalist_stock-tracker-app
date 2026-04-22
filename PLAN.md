# Agent Research Experience Rebuild Plan

## Reference Components Fetched

1. **blocks.so `ai-03`** — Compact chat composer: textarea + plus-button dropdown + auto-mode toggle + model/agent/performance dropdowns
2. **blocks.so `stats-10`** — Minimal stock cards with sparkline area charts, ticker, price, change %, color-coded
3. **vercel/ai-elements `inline-citation`** — HoverCard inline citations with badge trigger showing domain + count
4. **vercel/ai-elements `reasoning`** — Collapsible "Thought for N seconds" with shimmer, auto-open/close
5. **vercel/ai-elements `sources`** — Collapsible "Used N sources" with links
6. **vercel/ai-elements `chain-of-thought`** — Step-by-step with icons, labels, search result badges
7. **tool-ui `citation`** — Full citation card with favicon/domain/author/date OR inline chip with hover popover
8. **tool-ui `x-post`** — Full X post card with avatar, verified badge, post body, media, actions
9. **tool-ui `order-summary`** — Order receipt with item rows, pricing breakdown, receipt badge
10. **tool-ui `item-carousel`** — Horizontal scroll carousel with snap, nav buttons, item cards

## Steps

### 1. Adapt AI Elements to our project
- `components/ai-elements/inline-citation.tsx`
- `components/ai-elements/reasoning.tsx`
- `components/ai-elements/sources.tsx`
- `components/ai-elements/chain-of-thought.tsx`

### 2. Adapt Tool-UI Citation
- `components/tool-ui/citation.tsx` (inline chip + full card variants)

### 3. Rebuild Chat Composer (ai-03 pattern)
- Textarea + plus dropdown (ticker search, web search, attach)
- Mode dropdowns: analyst, research mode
- Keep ComposerPrimitive integration

### 4. Rebuild Stock Cards (stats-10 pattern)
- Tight card: ticker + price + change + sparkline
- Click → Sheet with full details

### 5. Rebuild Reddit as Social Card
- Posts with scores, subreddit, sentiment badge, mention count
- x-post style rendering

### 6. Rebuild Trade Card (order-summary pattern)
- Item rows: ticker, direction, shares, entry
- Pricing: position cost, risk, target P&L

### 7. Inline Citations in Agent Text
- Parse [N] markers with inline-citation component
- Sources below tool results

### 8. Reasoning/Chain-of-Thought for Research
- Wrap research narration in reasoning blocks
- Chain-of-thought steps

### 9. Thesis as Slim Pill + Sheet
- Minimal pill: ticker, direction, confidence
- Sheet: full thesis with citations

### 10. Item Carousel for Scan Results
- Horizontal scroll ticker cards
- Replaces chip grid

### 11. Fix Data Quality
- VIX, Reddit, Options fixes

### 12. Deploy
