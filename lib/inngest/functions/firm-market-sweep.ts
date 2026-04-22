// ── Firm Market Intelligence Sweep ──────────────────────────────────────────
// Runs daily at 6:30 AM ET before analyst runs.
// Loads enabled SEARCH monitors and executes them via Perplexity Sonar.
// Creates aggregate signals for FMP market movers and Finnhub earnings.
// Writes signals to the Signal table for downstream routing.

import { inngest } from "@/lib/inngest/client"
import { prisma } from "@/lib/prisma"
import { searchSignals } from "@/lib/intelligence/sonar"
import {
  createSignalBatch,
  createSignal,
  createSignalsFromSonar,
  completeSignalBatch,
  deduplicateSignals,
} from "@/lib/intelligence/signals"
import type { SignalType, SignalSentiment, SignalUrgency } from "@/lib/intelligence/types"

const FMP_KEY = process.env.FMP_API_KEY!
const FINNHUB_KEY = process.env.FINNHUB_API_KEY!

// Map monitor categories to signal types
const CATEGORY_TO_SIGNAL_TYPE: Record<string, SignalType> = {
  MARKET: "MACRO",
  SECTOR: "SECTOR",
  TICKER: "NEWS",
  THEMATIC: "NEWS",
  EVENT: "EARNINGS",
}

// FMP's /api/v3/stock_market/{gainers,losers,actives} endpoints were retired
// on Aug 31, 2025 ("Legacy Endpoint" 403 for any non-legacy subscriber). The
// same functionality lives on the new /stable/ namespace — free plan still
// gets access per FMP's "How to Retrieve Market Movers Using a Free API" doc.
const MOVER_CONFIG: Array<{
  path: string
  label: string
  sentiment: SignalSentiment
  aggregateType: string
  monitorId: string
}> = [
  { path: "/stable/biggest-gainers", label: "top gainers", sentiment: "BULLISH", aggregateType: "MARKET_MOVERS_GAINERS", monitorId: "monitor_fmp_gainers" },
  { path: "/stable/biggest-losers",  label: "top losers",  sentiment: "BEARISH", aggregateType: "MARKET_MOVERS_LOSERS",  monitorId: "monitor_fmp_losers"  },
  { path: "/stable/most-actives",    label: "most active", sentiment: "NEUTRAL", aggregateType: "MARKET_MOVERS_ACTIVES", monitorId: "monitor_fmp_actives" },
]

export const firmMarketSweep = inngest.createFunction(
  {
    id: "firm-market-sweep",
    name: "Firm Market Intelligence Sweep",
    concurrency: { limit: 1 },
    retries: 1,
  },
  [
    { cron: "TZ=America/New_York 30 6 * * 1-5" },
    { event: "intelligence/market-sweep" },
  ],
  async ({ step }) => {
    // ── Step 1: Load enabled SEARCH monitors ───────────────────────────────

    const monitors = await step.run("load-search-monitors", async () => {
      const now = new Date()
      return prisma.monitor.findMany({
        where: {
          type: "SEARCH",
          enabled: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
      })
    })

    if (monitors.length === 0) {
      return { ran: 0, reason: "no-search-monitors" }
    }

    // ── Step 2: Create signal batch ────────────────────────────────────────

    const batchId = await step.run("create-batch", async () => {
      return createSignalBatch("MARKET_SWEEP")
    })

    // ── Step 3: Execute search monitors via Sonar (sequential to respect rate limits)

    let totalSignals = 0
    let monitorsRun = 0
    let monitorsFailed = 0

    for (const monitor of monitors) {
      const config = monitor.config as Record<string, unknown> | null
      const query = (config?.query as string) ?? ""
      if (!query) continue

      const result = await step.run(`search-${monitor.id}`, async () => {
        try {
          const sonarResponse = await searchSignals(query, {
            recency: "day",
            model: "sonar",
          })

          const signalType = CATEGORY_TO_SIGNAL_TYPE[monitor.category] ?? "NEWS"
          const signalIds = await createSignalsFromSonar(
            batchId,
            sonarResponse,
            signalType,
            3,
            {
              searchTool: "PERPLEXITY_SONAR",
              searchQuery: query,
              searchContext: `monitor:${monitor.category.toLowerCase()}:${monitor.id}`,
              monitorId: monitor.id,
            }
          )

          // Update lastRunAt on the monitor
          await prisma.monitor.update({
            where: { id: monitor.id },
            data: { lastRunAt: new Date() },
          })

          return { success: true, signalCount: signalIds.length }
        } catch (error) {
          console.error(
            `[firm-sweep] Monitor "${monitor.name}" (query: "${query}") failed:`,
            error instanceof Error ? error.message : error
          )
          return { success: false, signalCount: 0 }
        }
      })

      if (result.success) {
        totalSignals += result.signalCount
        monitorsRun++
      } else {
        monitorsFailed++
      }
    }

    // ── Step 4: Market movers (FMP gainers/losers/actives) — 1 aggregate signal per category

    const moversResult = await step.run("market-movers", async () => {
      let created = 0
      let failed = 0
      const errors: string[] = []

      for (const { path, label, sentiment, aggregateType, monitorId } of MOVER_CONFIG) {
        try {
          // `path` already includes the namespace prefix (/stable/... or /api/v3/...).
          const url = `https://financialmodelingprep.com${path}?apikey=${FMP_KEY}`
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
          if (!res.ok) {
            const body = await res.text().catch(() => "")
            const msg = `FMP ${path} → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
            console.warn(`[firm-sweep] ${msg}`)
            errors.push(msg)
            failed++
            continue
          }

          // FMP renamed `changesPercentage` to `percentChange` in the /stable
          // namespace. Accept either so we're robust to further renames.
          const data = (await res.json()) as Array<{
            symbol: string
            name?: string
            change?: number
            price?: number
            changesPercentage?: number
            percentChange?: number
            volume?: number
          }>

          if (!Array.isArray(data) || data.length === 0) continue

          const top10 = data.slice(0, 10)
          const pctOf = (item: (typeof top10)[number]): number =>
            item.percentChange ?? item.changesPercentage ?? 0

          // Build aggregate payload
          const dataPayload = top10.map((item) => ({
            ticker: item.symbol,
            change: pctOf(item),
            price: item.price ?? 0,
            volume: item.volume ?? 0,
          }))

          // Build a summary from the top 3
          const top3Summary = top10
            .slice(0, 3)
            .map((item) => {
              const pct = pctOf(item)
              const sign = pct >= 0 ? "+" : ""
              return `${item.symbol} ${sign}${pct.toFixed(1)}%`
            })
            .join(", ")

          const allTickers = top10.map((item) => item.symbol)
          const maxChangePct = Math.max(...top10.map((item) => Math.abs(pctOf(item))))
          const urgency: SignalUrgency =
            maxChangePct > 5 ? "HIGH" : maxChangePct > 2 ? "MEDIUM" : "LOW"

          await createSignal({
            batchId,
            monitorId,
            type: "MACRO",
            headline: `Market ${label}: ${top3Summary} and ${Math.max(0, top10.length - 3)} more`,
            summary: `Today's ${label} include ${allTickers.join(", ")}. Largest move: ${maxChangePct.toFixed(1)}%.`,
            tickers: allTickers,
            themes: ["MARKET_MOVERS"],
            sectors: [],
            sentiment,
            urgency,
            sourceQuality: 3,
            freshness: "TODAY",
            sourceUrls: [],
            sourceNames: ["FMP"],
            searchTool: "FMP",
            searchQuery: path,
            searchContext: `market_movers:${label}`,
            aggregateType,
            dataPayload,
            itemCount: top10.length,
          })
          created++

          // Update lastRunAt on the built-in monitor
          await prisma.monitor.update({
            where: { id: monitorId },
            data: { lastRunAt: new Date() },
          }).catch(() => {
            // Monitor row may not exist yet during migration
            console.warn(`[firm-sweep] Could not update lastRunAt for monitor ${monitorId}`)
          })
        } catch (error) {
          const msg = `FMP ${path} threw: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[firm-sweep] ${msg}`)
          errors.push(msg)
          failed++
        }
      }

      return { created, failed, errors }
    })

    totalSignals += moversResult.created

    // ── Step 5: Earnings calendar (Finnhub next 7 days) — 1 aggregate signal

    const earningsResult = await step.run("earnings-calendar", async () => {
      const monitorId = "monitor_finnhub_earnings"
      try {
        const today = new Date()
        const weekOut = new Date(Date.now() + 7 * 86400_000)
        const from = today.toISOString().slice(0, 10)
        const to = weekOut.toISOString().slice(0, 10)

        const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          const msg = `Finnhub /calendar/earnings → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
          console.warn(`[firm-sweep] ${msg}`)
          return { created: 0, failed: 1, error: msg }
        }

        const data = (await res.json()) as {
          earningsCalendar?: Array<{
            symbol: string
            date: string
            epsEstimate: number | null
            revenueEstimate: number | null
          }>
        }

        const calendar = (data.earningsCalendar ?? []).filter(
          (item) => item.symbol && item.date
        )

        if (calendar.length === 0) {
          return { created: 0, failed: 0 }
        }

        // Build aggregate payload
        const dataPayload = calendar.map((item) => ({
          ticker: item.symbol,
          date: item.date,
          epsEstimate: item.epsEstimate,
          revenueEstimate: item.revenueEstimate,
        }))

        const allTickers = [...new Set(calendar.map((item) => item.symbol))]

        // Find nearest reporting date for urgency
        const nearestDaysOut = Math.min(
          ...calendar.map((item) => {
            const reportDate = new Date(item.date + "T00:00:00")
            return Math.ceil((reportDate.getTime() - today.getTime()) / 86400_000)
          })
        )
        const urgency: SignalUrgency =
          nearestDaysOut <= 2 ? "HIGH" : nearestDaysOut <= 5 ? "MEDIUM" : "LOW"

        // Build headline from the first few tickers reporting soonest
        const soonest = calendar
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5)
          .map((item) => item.symbol)
        const headlineTickers = soonest.join(", ")
        const remaining = calendar.length - soonest.length

        await createSignal({
          batchId,
          monitorId,
          type: "EARNINGS",
          headline: `Earnings calendar: ${headlineTickers}${remaining > 0 ? ` and ${remaining} more` : ""} reporting this week`,
          summary: `${calendar.length} companies reporting earnings ${from} to ${to}. Nearest reports in ${nearestDaysOut} day(s).`,
          tickers: allTickers,
          themes: ["EARNINGS_CALENDAR"],
          sectors: [],
          sentiment: "NEUTRAL",
          urgency,
          sourceQuality: 4,
          freshness: "TODAY",
          sourceUrls: [],
          sourceNames: ["Finnhub"],
          searchTool: "FINNHUB",
          searchQuery: `/calendar/earnings?from=${from}&to=${to}`,
          searchContext: "earnings_calendar",
          aggregateType: "EARNINGS_CALENDAR",
          dataPayload,
          itemCount: calendar.length,
        })

        // Update lastRunAt on the built-in monitor
        await prisma.monitor.update({
          where: { id: monitorId },
          data: { lastRunAt: new Date() },
        }).catch(() => {
          console.warn(`[firm-sweep] Could not update lastRunAt for monitor ${monitorId}`)
        })

        return { created: 1, failed: 0 }
      } catch (error) {
        const msg = `Finnhub earnings threw: ${error instanceof Error ? error.message : String(error)}`
        console.error(`[firm-sweep] ${msg}`)
        return { created: 0, failed: 1, error: msg }
      }
    })

    totalSignals += earningsResult.created

    // ── Step 6: Deduplicate signals ────────────────────────────────────────

    const dupsRemoved = await step.run("deduplicate", async () => {
      return deduplicateSignals(batchId)
    })

    // ── Step 7: Complete batch ─────────────────────────────────────────────

    await step.run("complete-batch", async () => {
      await completeSignalBatch(batchId)
    })

    // ── Step 8: Expire old temporary monitors ─────────────────────────────

    await step.run("expire-temp-monitors", async () => {
      const now = new Date()
      const expired = await prisma.monitor.updateMany({
        where: {
          expiresAt: { lte: now },
          enabled: true,
        },
        data: { enabled: false },
      })
      return expired.count
    })

    return {
      batchId,
      monitorsTotal: monitors.length,
      monitorsRun,
      monitorsFailed,
      signalsCreated: totalSignals,
      moversCreated: moversResult.created,
      earningsCreated: earningsResult.created,
      duplicatesRemoved: dupsRemoved,
    }
  }
)
