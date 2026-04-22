/**
 * Backfill Signal.signalFingerprint for rows created before Session 2.
 *
 * Re-runnable: only touches rows where signalFingerprint IS NULL, so it can be
 * triggered repeatedly without effect once the column is fully populated.
 *
 * Triggered manually via the Inngest UI by sending the
 * `intelligence/backfill-signal-fingerprint` event. Not on a cron — this is a
 * one-shot migration helper.
 */

import { inngest } from "@/lib/inngest/client"
import { prisma } from "@/lib/prisma"
import { computeSignalFingerprint } from "@/lib/intelligence/signals"

const BATCH_SIZE = 500

export const backfillSignalFingerprint = inngest.createFunction(
  {
    id: "backfill-signal-fingerprint",
    name: "Backfill Signal Fingerprint",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { event: "intelligence/backfill-signal-fingerprint" },
  async ({ step }) => {
    let totalProcessed = 0
    let totalUpdated = 0
    let totalSkipped = 0

    // Loop until no more null rows are found. Each iteration is a separate
    // step.run so Inngest can checkpoint and resume mid-backfill.
    for (let iter = 0; iter < 200; iter++) {
      const result = await step.run(`backfill-batch-${iter}`, async () => {
        const rows = await prisma.signal.findMany({
          where: { signalFingerprint: null },
          select: {
            id: true,
            headline: true,
            tickers: true,
            createdAt: true,
          },
          take: BATCH_SIZE,
        })

        if (rows.length === 0) {
          return { processed: 0, updated: 0, skipped: 0, done: true }
        }

        let updated = 0
        let skipped = 0
        for (const row of rows) {
          const fp = computeSignalFingerprint({
            headline: row.headline,
            tickers: row.tickers,
            createdAt: row.createdAt,
          })
          if (!fp) {
            skipped++
            continue
          }
          await prisma.signal.update({
            where: { id: row.id },
            data: { signalFingerprint: fp },
          })
          updated++
        }

        return {
          processed: rows.length,
          updated,
          skipped,
          done: false,
        }
      })

      totalProcessed += result.processed
      totalUpdated += result.updated
      totalSkipped += result.skipped

      if (result.done) break
    }

    return {
      totalProcessed,
      totalUpdated,
      totalSkipped,
    }
  }
)
