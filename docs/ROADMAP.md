# V3 Next Sessions — Implementation Specs

## Session A: Email & Newsletter Ingestion

### What the Agent Needs
An Inngest job that checks an inbox, extracts content from emails/newsletters,
creates Artifacts + Signals, and routes them to analysts.

### Architecture
```
Gmail API (or forwarding address)
  → email-ingestion Inngest job (daily, 6:00 AM ET)
    → for each unread email:
      1. Parse sender, subject, body (HTML → markdown)
      2. Classify: newsletter vs personal vs noise
      3. If newsletter: extract article links → Firecrawl each → Artifact rows
      4. Run Sonar on extracted content to generate structured Signals
      5. Tag signals with tickers, themes, sectors
      6. Mark email as processed
    → signal-router picks them up in next run
```

### New Schema
```prisma
model EmailSource {
  id            String   @id @default(cuid())
  address       String   // sender email or domain
  name          String   // "Matt Levine" or "Morning Brew"
  type          String   // NEWSLETTER | RESEARCH | ALERT
  analystId     String?  // route to specific analyst, or null for firm
  enabled       Boolean  @default(true)
  lastProcessed DateTime?
  createdAt     DateTime @default(now())
}

model ProcessedEmail {
  id           String   @id @default(cuid())
  emailId      String   @unique // Gmail message ID
  sourceId     String?
  subject      String
  sender       String
  receivedAt   DateTime
  bodyMarkdown String?  @db.Text
  classification String // NEWSLETTER | RESEARCH | ALERT | NOISE
  artifactIds  String[] // linked Artifacts created from this email
  signalIds    String[] // linked Signals created
  processedAt  DateTime @default(now())
}
```

### Gmail API Setup
1. Create Google Cloud project
2. Enable Gmail API
3. Create OAuth2 credentials (or service account for a dedicated inbox)
4. Store refresh token in env: `GMAIL_REFRESH_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
5. Alternative: use a forwarding address that pipes to a webhook → simpler but less control

### Config UI Addition
Add an "Email Sources" tab to /intelligence:
- List registered email senders/newsletters
- Add new: sender address + name + type + optional analyst assignment
- Toggle enabled/disabled
- Show last processed date

### Key Decisions
- **Gmail vs forwarding?** Gmail API gives read/label/archive control. Forwarding is simpler but you can't mark as read. Recommend Gmail API.
- **Classification model?** Use GPT-4o-mini to classify email type. Cost: ~$0.001/email.
- **Article extraction?** For newsletters with multiple article links, extract top 3-5 via Firecrawl. Cap at 5 to control costs.
- **What NOT to ingest:** spam, promotional, transactional. Classify and skip.

### Estimated Cost
- Gmail API: free (within quota)
- Classification: ~$0.01/day (10 emails × $0.001)
- Extraction: ~$0.05/day (5 articles × Firecrawl free tier)
- Signal generation: ~$0.03/day (5 Sonar calls)
- **Total: ~$0.10/day, ~$3/month**

---

## Session B: Analyst Policy System + Dynamic Queries

### What It Does
1. Each analyst's AgentConfig gets an `intelligencePolicy` JSON field
2. The policy controls: which source packs it reads, search budget, tool permissions per phase, attention weighting
3. The post-run briefing agent can write temporary IntelligenceQuery rows that expire

### Schema Changes
```prisma
// Add to AgentConfig:
model AgentConfig {
  // ... existing fields ...
  intelligencePolicy Json? // IntelligencePolicy type
  sourcePackId       String? // link to analyst-specific source pack
  sourcePack         SourcePack? @relation(fields: [sourcePackId], references: [id])
}
```

### IntelligencePolicy Type
```typescript
interface IntelligencePolicy {
  // Discovery budget
  maxSignalsPerRun: number        // default 30, how many signals to read
  maxArtifactReads: number        // default 5, full article reads per run

  // Source preferences
  preferredSourceCategories: string[]  // ["SECTOR", "COMPANY"] — prioritize these
  excludedSourceCategories: string[]   // ["SOCIAL"] — never show these

  // Attention weighting
  holdingsAttention: number       // 0-1, weight for portfolio alert signals
  watchlistAttention: number      // 0-1, weight for watchlist signals
  discoveryAttention: number      // 0-1, weight for new opportunity signals

  // Phase permissions (which phases can use live search)
  allowLiveSearch: boolean        // default true
  liveSearchBudget: number        // max live searches per run, default 5

  // Signal filtering
  minUrgency: SignalUrgency       // minimum urgency to surface, default "LOW"
  minSourceQuality: number        // minimum source quality score, default 2
}
```

### Dynamic Queries from Briefing Agent
The post-run briefing agent already writes a standup brief. Add this to its prompt:

```
After writing the brief, if you identified specific things to monitor
that aren't covered by existing queries, output a "dynamic_queries" array:

{
  "dynamic_queries": [
    {
      "query": "Tesla China manufacturing partnership developments",
      "category": "TICKER",
      "reason": "Analyst flagged potential JV but couldn't confirm",
      "expires_days": 7
    }
  ]
}
```

The `updateAnalystBriefing` function already runs after every session. Add logic:
1. Parse `dynamic_queries` from briefing output
2. Create IntelligenceQuery rows with `createdBy: "BRIEFING_AGENT"` and `expiresAt` set
3. These get picked up by the morning sweep like any other query
4. The /intelligence UI already shows them with "from briefing" badge and expiry date

### How Policy Affects Runtime
In the agent route (`/api/research/agent/route.ts`):
1. Load `intelligencePolicy` from AgentConfig
2. Pass policy values into `read_signals` tool (e.g. limit, min urgency)
3. Inject policy summary into system prompt: "Your discovery budget is 30 signals, 5 article reads. You prefer SECTOR and COMPANY sources. Live search budget: 5 queries."

### What the Analyst Builder Should Do
When creating a new analyst, the builder should:
1. Propose a source pack based on the analyst's strategy (e.g. an EV analyst gets Electrek, InsideEVs, CleanTechnica)
2. Set initial policy values based on the strategy (aggressive analysts get higher discovery attention, conservative get higher holdings attention)
3. Create 3-5 analyst-specific IntelligenceQuery rows (e.g. "electric vehicle sales data and market share" for an EV analyst)

---

## Session C: Tool Rationalization — What to Kill, Merge, Move

### The Core Principle
If background intelligence jobs already gather it daily, the analyst shouldn't
waste runtime tool calls re-gathering it. Move gathering to background,
keep runtime tools for deep validation only.

### Kill List

| Tool | Why Kill | Replacement |
|------|----------|-------------|
| `scan_candidates` | Fake discovery. StockTwits trending + earnings calendar + FMP movers. The intelligence pipeline replaces this entirely. | Morning brief `newOpportunities` + `read_signals` |
| `get_social_sentiment` | Reddit scraping is unreliable and slow. If social matters, add subreddits to source packs and let Sonar domain-filter. | Signals with source category SOCIAL |
| `search_reddit` | Same as above. Slow, rate-limited, low quality. | Source pack with reddit.com domain |

### Move to Background (run once/day, not per-analyst-session)

| Tool | Current | Should Become |
|------|---------|---------------|
| Earnings calendar lookup | `get_earnings_data` calls Finnhub every run | **Portfolio monitor** already checks earnings for holdings/watchlist. Add an "earnings this week" query to firm sweep. Runtime tool stays for deep EPS/beat data on a specific ticker. |
| Market overview | `get_market_context` calls Finnhub for SPY/VIX/sectors every run | **Morning brief** `marketContext` covers this. Tool stays for live prices but the narrative/regime analysis comes from the brief. |
| News aggregation | `get_stock_data` fetches Finnhub news per ticker | **Source pack monitor** already gathers news from tracked domains. Portfolio monitor gathers ticker-specific news. Runtime reads signals. |
| SEC filings check | `get_sec_filings` calls SEC EDGAR per ticker | Add SEC EDGAR domain to firm source pack. Source pack monitor catches new filings daily. Runtime tool stays for reading specific filing content. |

### Keep (runtime tools that still make sense)

| Tool | Why Keep |
|------|----------|
| `get_stock_data` | Live quote + profile + financials. Can't background this — prices change. |
| `get_earnings_data` | Deep EPS/beat data for a specific ticker pre-trade. Keep for validation. |
| `get_options_flow` | Real-time options data. Can't background effectively. |
| `get_sec_filings` | Reading specific filing content on demand. Background catches the filing exists; runtime reads it. |
| `record_thesis` | Core action tool. |
| `place_trade` | Core action tool. |
| `close_position` | Core action tool. |
| `manage_watchlist` | Core action tool. |
| `complete_run` | Core action tool. |

### Merge/Simplify

| Current | Proposed |
|---------|----------|
| `get_market_context` (big compound tool) | Keep but slim down. Remove the theme detection logic (brief handles it). Just return live prices + regime. |
| `get_stock_data` (fetches news, profile, quote, technicals) | Keep as-is — it's the workhorse for validation. |

### Implementation Order
1. **First:** Add the 3 killed tools' data to background jobs (earnings query to firm sweep, social to source packs)
2. **Second:** Update system prompt Phase 5 to not reference scan_candidates
3. **Third:** Remove scan_candidates, get_social_sentiment, search_reddit from tools.ts
4. **Fourth:** Slim down get_market_context (remove theme detection, just live prices)
5. **Fifth:** Update tool-uis.tsx to remove dead CoT registrations

### Net Result
- **Before:** 13 runtime tools, ~8-12 tool calls just to orient + discover
- **After:** 10 runtime tools, 2 tool calls to read intelligence, rest goes to actual research + decisions
- Agent is faster, cheaper, and better informed
