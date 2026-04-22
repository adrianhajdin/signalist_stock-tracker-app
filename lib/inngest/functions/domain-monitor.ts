// ── Domain Monitors ─────────────────────────────────────────────────────────
// Runs daily at 7:15 AM ET after ticker monitors.
// For each enabled DOMAIN monitor, checks tracked domains for new content
// via domain-filtered Sonar searches.
// High-value pages get full extraction via Firecrawl.

import { inngest } from "@/lib/inngest/client"
import { prisma } from "@/lib/prisma"
import { searchDomain } from "@/lib/intelligence/sonar"
import { extractPage } from "@/lib/intelligence/firecrawl"
import {
  createSignalBatch,
  createSignalsFromSonar,
  completeSignalBatch,
  deduplicateSignals,
  computeContentHash,
} from "@/lib/intelligence/signals"

// ── Per-monitor query resolution ─────────────────────────────────────────────

type MonitorWithAnalyst = {
  id: string
  name: string
  analyst: { sectors: string[]; strategyInstructions: string | null } | null
}

/**
 * Build a fallback Sonar query when a domain monitor doesn't have its own
 * `config.searchQuery`. Prefers analyst sectors + strategy keywords; falls
 * back to a sector-aware generic if no analyst is attached.
 *
 * Session 2 note: this is the bridge until per-monitor `searchQuery` is
 * populated by Session 4 (builder rebuild) and Session 5 (manager edits).
 */
export function defaultQueryFor(monitor: MonitorWithAnalyst): string {
  const analyst = monitor.analyst
  const sectors = analyst?.sectors ?? []
  const strategy = analyst?.strategyInstructions ?? ""

  // Pull a few salient words from the strategy prompt — same heuristic as
  // signal-router's keyword extractor so the query reflects the analyst's
  // actual focus, not a generic financial-news bag of words.
  const strategyWords = extractTopKeywords(strategy, 4)
  const sectorWords = sectors.slice(0, 3).map((s) => s.toLowerCase())
  const focusWords = [...sectorWords, ...strategyWords].filter(Boolean)

  if (focusWords.length === 0) {
    // Last-resort default — still better than the old hardcoded line because
    // it points the warning log at "this monitor has no analyst context yet".
    return "actionable market-moving news today: earnings, M&A, guidance, supply chain, regulatory"
  }

  return `actionable news today on ${focusWords.join(
    ", "
  )}: catalysts, earnings, guidance, supply chain, regulatory developments`
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "are", "was", "will",
  "can", "has", "have", "been", "not", "but", "all", "any", "more", "when",
  "than", "its", "also", "into", "just", "should", "would", "could", "about",
  "each", "which", "their", "other", "stock", "stocks", "trade", "trades",
  "trading", "market", "markets", "position", "positions", "analyst",
  "research", "look", "find", "your",
])

function extractTopKeywords(text: string, n: number): string[] {
  if (!text) return []
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  // Frequency rank, take top n.
  const counts = new Map<string, number>()
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w)
}

export const domainMonitor = inngest.createFunction(
  {
    id: "domain-monitor",
    name: "Domain Monitors",
    concurrency: { limit: 1 },
    retries: 1,
  },
  [
    { cron: "TZ=America/New_York 15 7 * * 1-5" },
    { event: "intelligence/domain-monitor" },
  ],
  async ({ step }) => {
    // ── Step 1: Load enabled DOMAIN monitors ─────────────────────────────

    const monitors = await step.run("load-domain-monitors", async () => {
      const now = new Date()
      return prisma.monitor.findMany({
        where: {
          type: "DOMAIN",
          enabled: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        include: { analyst: true },
        orderBy: { createdAt: "asc" },
      })
    })

    if (monitors.length === 0) {
      return { ran: 0, reason: "no-domain-monitors" }
    }

    // ── Step 2: Create signal batch ────────────────────────────────────────

    const batchId = await step.run("create-batch", async () => {
      return createSignalBatch("DOMAIN_MONITOR")
    })

    // ── Step 3: Process each monitor with its OWN searchQuery + domain ─────
    //
    // Session 2 change: dropped the "group all monitors and run one generic
    // search" flow. Each Monitor row now drives its own Sonar call with its
    // own per-monitor query. Falls back to defaultQueryFor() when the monitor
    // hasn't been migrated yet (logged so we can find them).

    let totalSignals = 0
    let monitorsProcessed = 0
    let artifactsCreated = 0
    let monitorsUsingFallbackQuery = 0

    for (const monitor of monitors) {
      const config = monitor.config as Record<string, unknown> | null
      const domain = (config?.domain as string) ?? ""
      const qualityScore = (config?.qualityScore as number) ?? 3
      const configuredQuery =
        typeof config?.searchQuery === "string"
          ? (config.searchQuery as string).trim()
          : ""

      if (!domain) continue

      const isFallback = configuredQuery.length === 0
      const query = isFallback ? defaultQueryFor(monitor) : configuredQuery
      if (isFallback) {
        monitorsUsingFallbackQuery++
        console.warn(
          `[domain-monitors] Monitor ${monitor.id} (${monitor.name}, domain=${domain}) ` +
            `has no config.searchQuery — using fallback query. Populate it via the ` +
            `analyst editor or wait for Session 4/5 to backfill.`
        )
      }

      const stepKey = `search-${monitor.id}`

      const result = await step.run(stepKey, async () => {
        try {
          const sonarResponse = await searchDomain(query, [domain], "day")

          const signalIds = await createSignalsFromSonar(
            batchId,
            sonarResponse,
            "NEWS",
            qualityScore,
            {
              searchTool: "PERPLEXITY_SONAR",
              searchQuery: query,
              searchContext:
                `domain_monitor:${monitor.id}:${domain}` +
                (isFallback ? ":fallback_query" : ":configured_query"),
              monitorId: monitor.id,
            }
          )

          await prisma.monitor.update({
            where: { id: monitor.id },
            data: { lastRunAt: new Date() },
          })

          return {
            success: true,
            signalCount: signalIds.length,
          }
        } catch (error) {
          console.error(
            `[domain-monitors] Monitor ${monitor.id} (${monitor.name}, domain=${domain}) search failed:`,
            error instanceof Error ? error.message : error
          )
          return { success: false, signalCount: 0 }
        }
      })

      totalSignals += result.signalCount
      if (result.success) monitorsProcessed++

      // Extract full page content via Firecrawl for every domain monitor — the
      // 5-URL cap below (urlsToExtract.length < 5) already bounds cost per
      // monitor per run. The old `priority === 1` gate silently disabled
      // Firecrawl for every monitor because there was no UI to set priority.
      {
        const extractResult = await step.run(`extract-${monitor.id}`, async () => {
          try {
            const recentSignals = await prisma.signal.findMany({
              where: { batchId, monitorId: monitor.id },
              select: { sourceUrls: true },
            })

            // Collect URLs from this monitor's domain
            const urlsToExtract: string[] = []
            for (const signal of recentSignals) {
              for (const url of signal.sourceUrls) {
                try {
                  const urlDomain = new URL(url).hostname.replace(/^www\./, "")
                  if (urlDomain === domain && urlsToExtract.length < 5) {
                    urlsToExtract.push(url)
                  }
                } catch {
                  // Invalid URL, skip
                }
              }
            }

            let created = 0
            for (const url of urlsToExtract) {
              try {
                const page = await extractPage(url)
                const contentHash = computeContentHash(page.title, page.markdown.slice(0, 500))

                const existing = await prisma.artifact.findFirst({
                  where: { contentHash },
                })
                if (existing) continue

                await prisma.artifact.create({
                  data: {
                    url: page.url,
                    title: page.title,
                    contentMarkdown: page.markdown,
                    contentSummary: page.markdown.slice(0, 300),
                    contentHash,
                    publishedAt: page.publishedAt ? new Date(page.publishedAt) : null,
                  },
                })
                created++
              } catch (error) {
                console.warn(
                  `[domain-monitors] Extract failed for ${url}:`,
                  error instanceof Error ? error.message : error
                )
              }
            }

            return { artifactsCreated: created }
          } catch {
            return { artifactsCreated: 0 }
          }
        })

        artifactsCreated += extractResult.artifactsCreated
      }
    }

    // ── Step 4: Deduplicate ────────────────────────────────────────────────

    const dupsRemoved = await step.run("deduplicate", async () => {
      return deduplicateSignals(batchId)
    })

    // ── Step 5: Complete batch ─────────────────────────────────────────────

    await step.run("complete-batch", async () => {
      await completeSignalBatch(batchId)
    })

    return {
      batchId,
      monitorsTotal: monitors.length,
      monitorsProcessed,
      monitorsUsingFallbackQuery,
      signalsCreated: totalSignals,
      artifactsCreated,
      duplicatesRemoved: dupsRemoved,
    }
  }
)
