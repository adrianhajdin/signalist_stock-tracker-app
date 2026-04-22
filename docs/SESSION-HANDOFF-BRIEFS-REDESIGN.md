# Session Handoff: Briefs Tab Redesign

## What Exists Today
The Briefs tab on `/intelligence` shows morning briefs generated at 7:45 AM ET per analyst. Each brief is a collapsible accordion that dumps all sections vertically. It looks like a debug view.

### Current data shape (MorningBrief model)
```typescript
{
  id: string;
  analystId: string;
  date: string;                    // ISO date
  marketContext: string;           // 3-4 sentences on macro regime
  portfolioAlerts: [{
    ticker: string;
    alert: string;                 // "Beat EPS by 12%, raised guidance"
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    signalIds: string[];           // IDs of informing signals (in DB, not exposed to UI yet)
  }];
  watchlistUpdates: [{
    ticker: string;
    update: string;                // "What changed since last check"
    recommendation: "INITIATE" | "ADD_TO_WATCHLIST" | "REMOVE" | "HOLD" | "RESEARCH_MORE";
    signalIds: string[];
  }];
  newOpportunities: [{             // Max 3
    headline: string;
    tickers: string[];
    thesisSeed: string;            // "1-2 sentence thesis seed"
    signalIds: string[];
  }];
  attentionPriority: string[];     // Ordered tickers to focus on today (max 5)
  riskFlags: string[];             // "Fed decision 2pm ET", "NVDA earnings after close"
  signalCount: number;
  generatedAt: string;
  analyst: { id: string; name: string };
}
```

### Current component
`components/intelligence/brief-cards.tsx` — collapsible accordion per analyst.

### Current API
`GET /api/intelligence/briefs?date=YYYY-MM-DD` — returns `MorningBrief[]`
`GET /api/intelligence/briefs?dates=true` — returns available dates (last 30 days)

## What to Build

### Briefs tab — card grid
One card per analyst, scannable at a glance. 2 columns on desktop, 1 on mobile.

```
┌──────────────────────────────────────────────────────────────┐
│  Tech Momentum Raider                            Mar 27, 2026│
│                                                               │
│  Markets mixed amid inflation data. Tech under pressure       │
│  from rising yields, defensive rotation into utilities...     │
│                                                               │
│  ⚠ 2 alerts   ✦ 1 opportunity   👁 3 watchlist               │
│                                                               │
│  FOCUS TODAY                                                  │
│  MSFT  ·  NVDA  ·  AMD                                       │
│                                                               │
│  RISKS                                                        │
│  Fed decision 2pm ET  ·  NVDA earnings after close            │
│                                                               │
│  42 signals  ·  7:45 AM                                       │
└──────────────────────────────────────────────────────────────┘
```

Card shows:
- Analyst name + date top row
- Market context (2-line clamp)
- Count badges: alerts (red/amber), opportunities (secondary), watchlist (outline)
- Focus tickers in font-mono
- Risk flags as text
- Signal count + generation time footer

### Click a card → Dialog (not sheet)
Centered dialog with max-w-2xl, scrollable, full structured brief:

**1. Market Context** — full paragraph, the executive summary

**2. Portfolio Alerts** — each alert as a row:
```
MSFT  ▼  Hiring freeze announced, stock down 3.5% pre-market    HIGH
NVDA  ▲  Beat EPS by 15%, raised guidance                       MEDIUM
```
- Ticker in font-mono
- PnlArrow if we can infer direction (CRITICAL/HIGH + bearish words → down)
- Alert text
- Urgency badge: red for HIGH/CRITICAL, amber for MEDIUM, muted for LOW

**3. New Opportunities** — each as a mini-card:
```
┌─────────────────────────────────────────────────────┐
│  Semiconductor Supply Chain Shift                    │
│  QCOM, AVGO                                          │
│  China tariff response creates arbitrage in mature    │
│  node chip suppliers — QCOM undervalued at 14x PE    │
└─────────────────────────────────────────────────────┘
```

**4. Watchlist Updates** — each as a row with recommendation badge:
```
KLAC   New partnership with TSMC announced        RESEARCH MORE
AAPL   iPhone 17 supply chain confirmed           HOLD
```
Recommendation as a small colored badge.

**5. Risk Flags** — red-tinted destructive badges

**6. Focus Today** — attention priority tickers in font-mono with separator dots

## Key Files
| File | What it does |
|------|-------------|
| `components/intelligence/brief-cards.tsx` | Current brief display — REWRITE |
| `components/intelligence/types.ts` | MorningBrief interface (signalIds missing from interface — add them) |
| `app/api/intelligence/briefs/route.ts` | Brief query API — no changes needed |
| `app/(root)/intelligence/page.tsx` | Page with Briefs tab — may need Dialog import |
| `lib/inngest/functions/morning-brief-generator.ts` | Generator — no changes needed |

## What NOT to Touch
- The generator (`morning-brief-generator.ts`) — data shape is already good
- The API route — already returns everything needed
- The date selector on the page — keep Today/Yesterday/This Week

## Design Rules
- Use Dialog (not Sheet) for the full brief view — centered, more room
- Use ShadCN Card for the grid cards
- Tickers in font-mono font-medium (same as trades/findings)
- PnlArrow from components/ui/pnl-arrow.tsx for directional indicators
- Urgency colors: red for HIGH/CRITICAL, amber for MEDIUM, muted for LOW
- No custom classes on ShadCN components
- text-emerald-500 for positive, text-red-500 for negative
