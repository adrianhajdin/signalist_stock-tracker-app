-- Session 2: Signal Pipeline Foundation
-- 1) Add signalFingerprint column + index to Signal for tiered/cross-batch dedup
-- 2) Add raw/novelty score columns to AnalystSignalRoute for routing-time novelty

-- Signal: stable fingerprint (hash of normalized headline + primary ticker + ISO week)
ALTER TABLE "Signal" ADD COLUMN "signalFingerprint" TEXT;
CREATE INDEX "Signal_signalFingerprint_createdAt_idx"
    ON "Signal" ("signalFingerprint", "createdAt");

-- AnalystSignalRoute: preserve raw score + per-route novelty for debugging.
-- relevanceScore now stores the novelty-adjusted final score.
ALTER TABLE "AnalystSignalRoute"
    ADD COLUMN "rawRelevanceScore" INTEGER,
    ADD COLUMN "noveltyScore"      INTEGER;
