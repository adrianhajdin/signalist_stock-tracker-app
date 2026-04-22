// ── Signal Creation & Dedup Utilities ─────────────────────────────────────────
// Used by intelligence jobs to create signals, batch them, and deduplicate.

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type {
  BatchJobType,
  BatchStatus,
  CreateSignalInput,
  SignalFreshness,
  SignalType,
  SonarSignalResponse,
} from "@/lib/intelligence/types";
import {
  normalizeSectors,
  normalizeIndustries,
  normalizeThemes,
} from "@/lib/universe/canonical";

// ── Batch Management ─────────────────────────────────────────────────────────

/**
 * Create a new SignalBatch in RUNNING status.
 * Returns the batch ID.
 */
export async function createSignalBatch(
  jobType: BatchJobType
): Promise<string> {
  const batch = await prisma.signalBatch.create({
    data: {
      jobType,
      status: "RUNNING",
      signalCount: 0,
    },
  });
  return batch.id;
}

/**
 * Mark a SignalBatch as complete (or failed).
 * Updates signalCount from the actual number of signals in the batch.
 */
export async function completeSignalBatch(
  batchId: string,
  status: BatchStatus = "COMPLETE"
): Promise<void> {
  const signalCount = await prisma.signal.count({
    where: { batchId },
  });

  await prisma.signalBatch.update({
    where: { id: batchId },
    data: {
      status,
      signalCount,
      completedAt: new Date(),
    },
  });
}

// ── Signal Creation ──────────────────────────────────────────────────────────

/**
 * Create a single Signal row from structured input.
 * Computes signalFingerprint (normalized headline + primary ticker + ISO-week
 * bucket) for cross-batch dedup. Returns the signal ID.
 */
export async function createSignal(input: CreateSignalInput): Promise<string> {
  // Canonicalize universe fields at the write boundary (Session A).
  // Sonar's cleanSonarSignal already normalizes, but producers like
  // firm-market-sweep call createSignal directly — so we normalize here too
  // as a backstop to keep the Signal table free of vocabulary skew.
  const canonSectors = normalizeSectors(input.sectors);
  const canonIndustries = normalizeIndustries(input.industries ?? []);
  const canonThemes = normalizeThemes(input.themes);
  const signal = await prisma.signal.create({
    data: {
      batchId: input.batchId,
      artifactId: input.artifactId,
      monitorId: input.monitorId,
      type: input.type,
      headline: input.headline,
      summary: input.summary,
      evidence: input.evidence,
      tickers: input.tickers,
      themes: canonThemes,
      sectors: canonSectors,
      industries: canonIndustries,
      sentiment: input.sentiment,
      // noveltyScore at creation is a placeholder. The real value is computed
      // per-(analyst, signal) at routing time and stored on AnalystSignalRoute.
      // See lib/inngest/functions/signal-router.ts:computeNoveltyScore.
      noveltyScore: input.noveltyScore ?? 50,
      urgency: input.urgency,
      sourceQuality: input.sourceQuality ?? 3,
      freshness: input.freshness,
      sourceUrls: input.sourceUrls,
      sourceNames: input.sourceNames,
      searchTool: input.searchTool,
      searchQuery: input.searchQuery,
      searchContext: input.searchContext,
      aggregateType: input.aggregateType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dataPayload: (input.dataPayload ?? undefined) as any,
      itemCount: input.itemCount,
      expiresAt: input.expiresAt,
      emailMessageId: input.emailMessageId,
      signalFingerprint: computeSignalFingerprint({
        headline: input.headline,
        tickers: input.tickers,
        createdAt: new Date(),
      }),
    },
  });

  return signal.id;
}

/**
 * Create Signal rows from a raw Sonar structured response.
 * Maps SonarSignalOutput fields to CreateSignalInput.
 * Returns array of created signal IDs.
 */
export async function createSignalsFromSonar(
  batchId: string,
  sonarResponse: SonarSignalResponse,
  signalType: SignalType,
  sourceQuality: number = 3,
  provenance?: { searchTool?: string; searchQuery?: string; searchContext?: string; monitorId?: string }
): Promise<string[]> {
  const ids: string[] = [];

  for (const item of sonarResponse.signals) {
    try {
      const id = await createSignal({
        batchId,
        monitorId: provenance?.monitorId,
        type: signalType,
        headline: item.headline,
        summary: item.summary,
        tickers: item.tickers,
        themes: item.themes,
        sectors: item.sectors,
        industries: item.industries ?? [],
        sentiment: item.sentiment,
        urgency: item.urgency,
        sourceQuality,
        freshness: "TODAY",
        sourceUrls: item.sourceUrls,
        sourceNames: item.sourceNames,
        searchTool: provenance?.searchTool,
        searchQuery: provenance?.searchQuery,
        searchContext: provenance?.searchContext,
      });
      ids.push(id);
    } catch (error) {
      console.warn(
        `[signals] Failed to create signal "${item.headline}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return ids;
}

// ── Deduplication ────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pick a dedup lookback window based on signal type + urgency.
 *  - BREAKING urgency  → 1 day (only collapse same-day repeats; new dev wins)
 *  - NEWS / EARNINGS   → 3 days (same headline within a few days = dup)
 *  - everything else   → 7 days (themes, macro, evergreen — long memory)
 */
function dedupWindowMs(input: { type: string; urgency: string }): number {
  if (input.urgency === "BREAKING") return 1 * ONE_DAY_MS;
  if (input.type === "NEWS" || input.type === "EARNINGS") return 3 * ONE_DAY_MS;
  return 7 * ONE_DAY_MS;
}

/**
 * Remove duplicate signals from a batch.
 *
 * Comparison key: `signalFingerprint` (normalized headline + primary ticker +
 * ISO-week bucket). Window length depends on urgency/type — see `dedupWindowMs`.
 * Falls back to (headline + primary ticker) hash when an older signal has no
 * fingerprint stored yet (pre-backfill rows).
 *
 * Returns the number of deleted duplicates.
 */
export async function deduplicateSignals(batchId: string): Promise<number> {
  // Get all signals in this batch we might want to drop. Pull the fields needed
  // to recompute a fingerprint if it's missing.
  const batchSignals = await prisma.signal.findMany({
    where: { batchId },
    select: {
      id: true,
      type: true,
      urgency: true,
      headline: true,
      tickers: true,
      createdAt: true,
      signalFingerprint: true,
    },
  });

  if (batchSignals.length === 0) return 0;

  // Widest window we need to load — load once, filter per-signal.
  const widestWindowMs = batchSignals.reduce(
    (max, s) => Math.max(max, dedupWindowMs(s)),
    0
  );
  const cutoff = new Date(Date.now() - widestWindowMs);

  // Pull recent signals from OTHER batches with their fingerprints + createdAt.
  const recentSignals = await prisma.signal.findMany({
    where: {
      batchId: { not: batchId },
      createdAt: { gte: cutoff },
    },
    select: {
      headline: true,
      tickers: true,
      createdAt: true,
      signalFingerprint: true,
    },
  });

  // Map fingerprint → most-recent createdAt (so we can window-filter per signal).
  const fingerprintLatest = new Map<string, number>();
  for (const s of recentSignals) {
    const fp =
      s.signalFingerprint ??
      computeSignalFingerprint({
        headline: s.headline,
        tickers: s.tickers,
        createdAt: s.createdAt,
      });
    if (!fp) continue;
    const ts = s.createdAt.getTime();
    const prev = fingerprintLatest.get(fp);
    if (prev === undefined || ts > prev) fingerprintLatest.set(fp, ts);
  }

  const now = Date.now();
  const duplicateIds: string[] = [];
  for (const s of batchSignals) {
    const fp =
      s.signalFingerprint ??
      computeSignalFingerprint({
        headline: s.headline,
        tickers: s.tickers,
        createdAt: s.createdAt,
      });
    if (!fp) continue;
    const matchTs = fingerprintLatest.get(fp);
    if (matchTs === undefined) continue;
    const windowMs = dedupWindowMs(s);
    if (now - matchTs <= windowMs) {
      duplicateIds.push(s.id);
    }
  }

  if (duplicateIds.length === 0) return 0;

  await prisma.signal.deleteMany({
    where: { id: { in: duplicateIds } },
  });

  return duplicateIds.length;
}

// ── Hash & Freshness Utilities ───────────────────────────────────────────────

/**
 * Compute a SHA256 hash of normalized headline + summary for dedup.
 * Normalizes by lowercasing and trimming whitespace.
 */
export function computeContentHash(headline: string, summary: string): string {
  const normalized = `${headline.toLowerCase().trim()}|${summary.toLowerCase().trim()}`;
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Compute a stable fingerprint for cross-batch dedup.
 *
 * Combines:
 *  - normalized headline (lowercased, alphanumerics + spaces only, collapsed)
 *  - primary ticker (first ticker in the array, uppercased — or "_NO_TICKER_")
 *  - ISO-week bucket of the createdAt timestamp (so the same NVDA-deal headline
 *    in week 14 dedups within week 14 but doesn't kill a week-26 reissue)
 *
 * Returns null only for the degenerate empty-headline case.
 */
export function computeSignalFingerprint(input: {
  headline: string;
  tickers: string[];
  createdAt: Date;
}): string | null {
  const normalizedHeadline = input.headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedHeadline) return null;

  const primaryTicker =
    input.tickers && input.tickers.length > 0
      ? input.tickers[0].toUpperCase().trim()
      : "_NO_TICKER_";

  const weekBucket = isoWeekBucket(input.createdAt);

  const key = `${normalizedHeadline}|${primaryTicker}|${weekBucket}`;
  return createHash("sha256").update(key).digest("hex");
}

/**
 * ISO-week bucket as `YYYY-Www`. Used by computeSignalFingerprint so that
 * duplicate detection has a natural rollover point each week.
 */
function isoWeekBucket(d: Date): string {
  // Copy so we don't mutate input.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday in current week decides the year.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Compute signal freshness based on published date.
 * BREAKING: less than 1 hour old
 * TODAY: less than 24 hours old
 * THIS_WEEK: less than 7 days old
 * OLDER: everything else
 */
export function computeFreshness(publishedAt?: Date): SignalFreshness {
  if (!publishedAt) return "TODAY";

  const ageMs = Date.now() - publishedAt.getTime();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;
  const ONE_WEEK = 7 * ONE_DAY;

  if (ageMs < ONE_HOUR) return "BREAKING";
  if (ageMs < ONE_DAY) return "TODAY";
  if (ageMs < ONE_WEEK) return "THIS_WEEK";
  return "OLDER";
}
