// ── Portfolio & Watchlist Monitor ────────────────────────────────────────────
// Runs daily at 7:00 AM ET after the market sweep.
// Searches for news/developments on every open position and watchlist item
// across all analysts (deduplicated). Writes ticker-tagged signals.
//
// Uses TWO permanent built-in SEARCH monitors:
//   - "Portfolio Searches" (monitor_portfolio_searches) — reads open positions at runtime
//   - "Watchlist Searches" (monitor_watchlist_searches) — reads watchlist items at runtime
// The monitor rows are permanent; tickers are determined dynamically each run.

import { inngest } from "@/lib/inngest/client"
import { prisma } from "@/lib/prisma"
import { searchTicker } from "@/lib/intelligence/sonar"
import {
  createSignalBatch,
  createSignalsFromSonar,
  completeSignalBatch,
  deduplicateSignals,
} from "@/lib/intelligence/signals"

const PORTFOLIO_MONITOR_ID = "monitor_portfolio_searches"
const WATCHLIST_MONITOR_ID = "monitor_watchlist_searches"

/** Ensure the two permanent monitor rows exist (idempotent).
 *  Also cleans up old per-ticker monitor rows from the previous architecture. */
async function ensurePermanentMonitors() {
  // Clean up old per-ticker rows (ticker-search-aapl, etc.)
  await prisma.monitor.deleteMany({
    where: {
      id: { startsWith: "ticker-search-" },
      builtIn: true,
      category: "TICKER",
    },
  })

  await Promise.all([
    prisma.monitor.upsert({
      where: { id: PORTFOLIO_MONITOR_ID },
      create: {
        id: PORTFOLIO_MONITOR_ID,
        name: "Portfolio Searches",
        type: "SEARCH",
        method: "perplexity_sonar",
        config: { track: "positions" },
        scope: "FIRM",
        enabled: true,
        builtIn: true,
        origin: "SYSTEM",
        category: "TICKER",
      },
      update: {
        name: "Portfolio Searches",
        type: "SEARCH",
        enabled: true,
      },
    }),
    prisma.monitor.upsert({
      where: { id: WATCHLIST_MONITOR_ID },
      create: {
        id: WATCHLIST_MONITOR_ID,
        name: "Watchlist Searches",
        type: "SEARCH",
        method: "perplexity_sonar",
        config: { track: "watchlist" },
        scope: "FIRM",
        enabled: true,
        builtIn: true,
        origin: "SYSTEM",
        category: "TICKER",
      },
      update: {
        name: "Watchlist Searches",
        type: "SEARCH",
        enabled: true,
      },
    }),
  ])
}

export const portfolioWatchlistMonitor = inngest.createFunction(
  {
    id: "portfolio-watchlist-monitor",
    name: "Portfolio & Watchlist Monitor",
    concurrency: { limit: 1 },
    retries: 1,
  },
  [
    { cron: "TZ=America/New_York 0 7 * * 1-5" },
    { event: "intelligence/portfolio-monitor" },
  ],
  async ({ step }) => {
    // ── Step 1: Ensure permanent monitors + collect tickers ────────────

    const { portfolioTickers, watchlistTickers } = await step.run(
      "collect-tickers",
      async () => {
        await ensurePermanentMonitors()

        const [positions, watchlistItems] = await Promise.all([
          prisma.position.findMany({
            where: { status: "OPEN" },
            select: { symbol: true },
          }),
          prisma.analystWatchlistItem.findMany({
            where: { status: "ACTIVE" },
            select: { symbol: true },
          }),
        ])

        return {
          portfolioTickers: [...new Set(positions.map((p) => p.symbol))].sort(),
          watchlistTickers: [...new Set(watchlistItems.map((w) => w.symbol))].sort(),
        }
      }
    )

    const allTickers = [...new Set([...portfolioTickers, ...watchlistTickers])].sort()

    if (allTickers.length === 0) {
      return { ran: 0, reason: "no-tickers-to-monitor" }
    }

    // ── Step 2: Create signal batch ────────────────────────────────────────

    const batchId = await step.run("create-batch", async () => {
      return createSignalBatch("PORTFOLIO_MONITOR")
    })

    // ── Step 3: Search each ticker (sequential to respect rate limits) ────

    let totalSignals = 0
    let tickersSearched = 0
    let tickersFailed = 0

    for (const ticker of allTickers) {
      const isPortfolio = portfolioTickers.includes(ticker)
      const monitorId = isPortfolio ? PORTFOLIO_MONITOR_ID : WATCHLIST_MONITOR_ID

      const result = await step.run(`search-${ticker}`, async () => {
        try {
          const sonarResponse = await searchTicker(ticker)
          const query = `${ticker} stock news developments catalysts today`

          const signalIds = await createSignalsFromSonar(
            batchId,
            sonarResponse,
            "NEWS",
            3,
            {
              searchTool: "PERPLEXITY_SONAR",
              searchQuery: query,
              searchContext: `ticker:${ticker}`,
              monitorId,
            }
          )

          return { success: true, signalCount: signalIds.length }
        } catch (error) {
          console.error(
            `[portfolio-monitor] Ticker "${ticker}" search failed:`,
            error instanceof Error ? error.message : error
          )
          return { success: false, signalCount: 0 }
        }
      })

      if (result.success) {
        totalSignals += result.signalCount
        tickersSearched++
      } else {
        tickersFailed++
      }
    }

    // ── Step 4: Update lastRunAt on both monitors ──────────────────────────

    await step.run("update-monitors", async () => {
      const now = new Date()
      await Promise.all([
        portfolioTickers.length > 0
          ? prisma.monitor.update({
              where: { id: PORTFOLIO_MONITOR_ID },
              data: { lastRunAt: now },
            })
          : Promise.resolve(),
        watchlistTickers.length > 0
          ? prisma.monitor.update({
              where: { id: WATCHLIST_MONITOR_ID },
              data: { lastRunAt: now },
            })
          : Promise.resolve(),
      ])
    })

    // ── Step 5: Deduplicate ────────────────────────────────────────────────

    const dupsRemoved = await step.run("deduplicate", async () => {
      return deduplicateSignals(batchId)
    })

    // ── Step 6: Complete batch ─────────────────────────────────────────────

    await step.run("complete-batch", async () => {
      await completeSignalBatch(batchId)
    })

    return {
      batchId,
      portfolioTickers: portfolioTickers.length,
      watchlistTickers: watchlistTickers.length,
      tickersTotal: allTickers.length,
      tickersSearched,
      tickersFailed,
      signalsCreated: totalSignals,
      duplicatesRemoved: dupsRemoved,
    }
  }
)
