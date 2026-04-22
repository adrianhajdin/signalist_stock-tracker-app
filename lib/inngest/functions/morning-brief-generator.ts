// ── Morning Brief Generator ─────────────────────────────────────────────────
// Runs at 7:45 AM ET after signal routing.
// For each enabled analyst, reads their routed signals + portfolio state
// and generates a structured MorningBrief via GPT-4o.
// This brief becomes the analyst's pre-run intelligence when they start.

import { inngest } from "@/lib/inngest/client"
import { prisma } from "@/lib/prisma"
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import { etTradingDayDate } from "@/lib/market-hours"

// ── Brief schema ────────────────────────────────────────────────────────────

const morningBriefSchema = z.object({
  marketContext: z
    .string()
    .describe(
      "3-4 sentences on today's market regime, key themes, and macro backdrop relevant to this analyst's mandate. Reference specific data points from signals."
    ),
  portfolioAlerts: z
    .array(
      z.object({
        ticker: z.string(),
        alert: z.string().describe("What happened — be specific. e.g. 'Beat EPS by 12%, raised guidance'"),
        urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        signalIds: z.array(z.string()).describe("IDs of the signals that informed this alert"),
      })
    )
    .describe("Alerts for the analyst's current positions and active watchlist items. Only include if there are real developments — do not invent alerts."),
  watchlistUpdates: z
    .array(
      z.object({
        ticker: z.string(),
        update: z.string().describe("What changed since the last check"),
        recommendation: z.enum(["INITIATE", "ADD_TO_WATCHLIST", "REMOVE", "HOLD", "RESEARCH_MORE"]),
        signalIds: z.array(z.string()),
      })
    )
    .describe("Updates for watchlist items based on today's signals."),
  newOpportunities: z
    .array(
      z.object({
        headline: z.string(),
        tickers: z.array(z.string()),
        thesisSeed: z.string().describe("A 1-2 sentence thesis seed the analyst could develop"),
        signalIds: z.array(z.string()),
      })
    )
    .describe("New opportunities outside current positions/watchlist that match this analyst's mandate. Max 3."),
  attentionPriority: z
    .array(z.string())
    .describe("Ordered list of tickers the analyst should focus on today, most urgent first. Max 5."),
  riskFlags: z
    .array(z.string())
    .describe("Specific risk warnings — earnings today, ex-div dates, sector rotation signals, macro events. Only include real, concrete flags."),
})

// ── Build prompt context ────────────────────────────────────────────────────

type BriefSignal = {
  id: string
  type: string
  headline: string
  summary: string | null
  tickers: string[]
  sentiment: string | null
  urgency: string | null
  freshness: string | null
  relevanceScore: number
  routeReason: string | null
  // Session 3 / Workstream B contract — canonical enum + match payload.
  // One of: POSITION | WATCHLIST | DIRECT_TICKER | DISCOVERY |
  //         INDUSTRY_MATCH | SECTOR_MATCH | THEME_MATCH | CROSS_ANALYST
  routeReasonCode: string | null
  // JSON payload from signal-router explaining which universe dims matched.
  // Shape: { sectors?, industries?, themes?, inWatchlist?, inPositions?,
  //          fromAnalystId?, marketCap? }
  matchedUniverse: unknown
  sources: string[]
}

async function buildBriefContext(analystId: string) {
  const [analyst, signals, positions, watchlistItems] = await Promise.all([
    prisma.agentConfig.findUniqueOrThrow({
      where: { id: analystId },
    }),
    // Get today's routed signals for this analyst
    prisma.analystSignalRoute.findMany({
      where: {
        analystId,
        status: "PENDING",
      },
      include: {
        signal: true,
      },
      orderBy: { relevanceScore: "desc" },
      take: 50, // cap to control token usage
    }),
    prisma.position.findMany({
      where: { analystId, status: "OPEN" },
      select: { symbol: true, direction: true, quantity: true, avgCost: true },
    }),
    prisma.analystWatchlistItem.findMany({
      where: { analystId, status: "ACTIVE" },
      select: { symbol: true, reason: true, priority: true },
    }),
  ])

  const positionTickers = positions.map((p) => p.symbol)
  const watchlistTickers = watchlistItems.map((w) => w.symbol)

  // Format signals for the prompt
  const signalSummaries: BriefSignal[] = signals.map((route) => {
    const s = route.signal
    return {
      id: s.id,
      type: s.type,
      headline: s.headline,
      summary: s.summary,
      tickers: s.tickers,
      sentiment: s.sentiment,
      urgency: s.urgency,
      freshness: s.freshness,
      relevanceScore: route.relevanceScore,
      routeReason: route.routeReason,
      routeReasonCode: route.routeReasonCode,
      matchedUniverse: route.matchedUniverse,
      sources: s.sourceNames,
    }
  })

  // Session 3: split signals into 3 buckets by routeReasonCode so the model
  // sees discovery candidates as a distinct first-class category (not buried at
  // the bottom of a flat 50-item list). The discovery bucket absorbs any
  // non-portfolio/non-watchlist code: DISCOVERY, SECTOR_MATCH, INDUSTRY_MATCH,
  // THEME_MATCH, DIRECT_TICKER, CROSS_ANALYST.
  const portfolioBucket = signalSummaries.filter((s) => s.routeReasonCode === "POSITION")
  const watchlistBucket = signalSummaries.filter((s) => s.routeReasonCode === "WATCHLIST")
  const discoveryBucket = signalSummaries.filter(
    (s) =>
      s.routeReasonCode !== "POSITION" &&
      s.routeReasonCode !== "WATCHLIST"
  )

  return {
    analystName: analyst.name,
    analystPrompt: analyst.analystPrompt ?? "",
    sectors: analyst.sectors,
    // Universe fields live directly on AgentConfig per B contract.
    universe: {
      sectors: analyst.sectors,
      industries: analyst.industries,
      themes: analyst.themes,
      exclusions: analyst.exclusionList,
      marketCapMin: analyst.marketCapMin ? Number(analyst.marketCapMin) : null,
      marketCapMax: analyst.marketCapMax ? Number(analyst.marketCapMax) : null,
    },
    positions: positions.map((p) => `${p.symbol} (${p.direction}, ${p.quantity} shares @ $${p.avgCost})`),
    watchlist: watchlistItems.map((w) => `${w.symbol} [${w.priority}] — ${w.reason}`),
    positionTickers,
    watchlistTickers,
    signalCount: signals.length,
    signals: signalSummaries,
    portfolioSignals: portfolioBucket,
    watchlistSignals: watchlistBucket,
    discoverySignals: discoveryBucket,
  }
}

// ── Inngest function ────────────────────────────────────────────────────────

export const morningBriefGenerator = inngest.createFunction(
  {
    id: "morning-brief-generator",
    name: "Morning Brief Generator",
    concurrency: { limit: 1 },
    retries: 1,
  },
  [
    { cron: "TZ=America/New_York 45 7 * * 1-5" },
    { event: "intelligence/generate-briefs" },
  ],
  async ({ step }) => {
    // ── Step 1: Get enabled analysts ────────────────────────────────────────

    const analysts = await step.run("load-analysts", async () => {
      return prisma.agentConfig.findMany({
        where: { enabled: true },
        select: { id: true, name: true },
      })
    })

    if (analysts.length === 0) {
      return { generated: 0, reason: "no-enabled-analysts" }
    }

    let generated = 0
    let failed = 0

    // ── Step 2: Generate brief per analyst ──────────────────────────────────

    for (const analyst of analysts) {
      const result = await step.run(`brief-${analyst.id}`, async () => {
        try {
          const context = await buildBriefContext(analyst.id)

          if (context.signalCount === 0) {
            return { success: true, skipped: true, reason: "no-signals" }
          }

          // Session 3: force discovery representation when discovery signals
          // exist. If they don't, tell the model explicitly so it doesn't
          // hallucinate new tickers from thin air.
          const hasDiscovery = context.discoverySignals.length > 0
          const discoveryClause = hasDiscovery
            ? `- newOpportunities MUST include at least 1 (ideally 2) items drawn from DISCOVERY_SIGNALS below — these are candidates outside the analyst's watchlist/positions that matched the Universe. Do NOT skip them just because they look unfamiliar.`
            : `- No discovery signals today. Do NOT invent new tickers. If you cannot find a real opportunity in PORTFOLIO_SIGNALS or WATCHLIST_SIGNALS, return an empty newOpportunities array and set marketContext to explicitly note "No discovery candidates this session."`

          const { object: brief } = await generateObject({
            model: openai("gpt-4o"),
            schema: morningBriefSchema,
            prompt: `You are the morning intelligence briefer for "${context.analystName}".

ANALYST MANDATE:
${context.analystPrompt}

SECTORS: ${context.sectors.join(", ") || "All"}

UNIVERSE (discovery fence — AND across dims, OR within; empty = no filter):
  sectors:      ${context.universe.sectors.join(", ") || "—"}
  industries:   ${context.universe.industries.join(", ") || "—"}
  themes:       ${context.universe.themes.join(", ") || "—"}
  exclusions:   ${context.universe.exclusions.join(", ") || "—"}
  marketCapMin: ${context.universe.marketCapMin ?? "—"}
  marketCapMax: ${context.universe.marketCapMax ?? "—"}

CURRENT POSITIONS:
${context.positions.length > 0 ? context.positions.join("\n") : "None"}

ACTIVE WATCHLIST:
${context.watchlist.length > 0 ? context.watchlist.join("\n") : "None"}

PORTFOLIO_SIGNALS (${context.portfolioSignals.length}) — ticker is in an OPEN position:
${JSON.stringify(context.portfolioSignals, null, 2)}

WATCHLIST_SIGNALS (${context.watchlistSignals.length}) — ticker is on watchlist:
${JSON.stringify(context.watchlistSignals, null, 2)}

DISCOVERY_SIGNALS (${context.discoverySignals.length}) — NEW tickers matched via Universe or pure sector/theme:
${JSON.stringify(context.discoverySignals, null, 2)}

INSTRUCTIONS:
- Write a concise, actionable morning brief for this specific analyst.
- portfolioAlerts MUST only cover tickers from PORTFOLIO_SIGNALS.
- watchlistUpdates MUST only cover tickers from WATCHLIST_SIGNALS.
- newOpportunities MUST come from DISCOVERY_SIGNALS (or occasionally WATCHLIST_SIGNALS if a watchlist candidate has truly graduated to a tradeable setup).
${discoveryClause}
- Be specific — reference the actual signals, not generic market commentary.
- Attention priority should reflect what needs action TODAY, not just what's interesting.
- Risk flags must be concrete and time-bound, not vague warnings.
- Include signal IDs in arrays so the analyst can drill into sources.
- If a signal contradicts the analyst's current positioning, flag it prominently.
- Max 3 new opportunities. Quality over quantity.
- If a signal has routeReasonCode "CROSS_ANALYST" (matchedUniverse.fromAnalystId set), another analyst's owned monitor surfaced it because it touches a ticker in this analyst's book — treat it as a credible second opinion, not as noise.`,
          })

          // Upsert today's brief (idempotent if re-run).
          // ET trading-day date — see lib/market-hours.ts for rationale.
          const today = etTradingDayDate()

          await prisma.morningBrief.upsert({
            where: {
              analystId_date: {
                analystId: analyst.id,
                date: today,
              },
            },
            create: {
              analystId: analyst.id,
              date: today,
              marketContext: brief.marketContext,
              portfolioAlerts: brief.portfolioAlerts,
              watchlistUpdates: brief.watchlistUpdates,
              newOpportunities: brief.newOpportunities,
              attentionPriority: brief.attentionPriority,
              riskFlags: brief.riskFlags,
              signalCount: context.signalCount,
            },
            update: {
              marketContext: brief.marketContext,
              portfolioAlerts: brief.portfolioAlerts,
              watchlistUpdates: brief.watchlistUpdates,
              newOpportunities: brief.newOpportunities,
              attentionPriority: brief.attentionPriority,
              riskFlags: brief.riskFlags,
              signalCount: context.signalCount,
              generatedAt: new Date(),
            },
          })

          return { success: true, skipped: false }
        } catch (error) {
          console.error(
            `[morning-brief] Failed for analyst "${analyst.name}":`,
            error instanceof Error ? error.message : error
          )
          return { success: false, skipped: false }
        }
      })

      if (result.success && !result.skipped) generated++
      if (!result.success) failed++
    }

    return {
      analystsTotal: analysts.length,
      briefsGenerated: generated,
      briefsFailed: failed,
    }
  }
)
