-- Session 3 / Workstream B contract: Universe fields on AgentConfig.
-- Universe = fence for discovery routing. Dimensions: existing sectors +
-- industries + themes + marketCapMin/Max (+ existing exchanges, exclusionList).
-- Match semantics enforced in lib/inngest/functions/signal-router.ts:
--   empty array / null numeric = no filter on that dimension,
--   AND across dimensions, OR within a dimension,
--   exclusionList hard-rejects,
--   watchlist + open positions bypass the fence.

ALTER TABLE "AgentConfig"
    ADD COLUMN IF NOT EXISTS "industries"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "themes"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "marketCapMin" BIGINT,
    ADD COLUMN IF NOT EXISTS "marketCapMax" BIGINT;

-- AnalystSignalRoute: canonical routing code + match-explanation JSON.
-- Legacy `routeReason` stays populated for read-path back-compat.
ALTER TABLE "AnalystSignalRoute"
    ADD COLUMN IF NOT EXISTS "routeReasonCode" TEXT,
    ADD COLUMN IF NOT EXISTS "matchedUniverse" JSONB;

CREATE INDEX IF NOT EXISTS "AnalystSignalRoute_analystId_routeReasonCode_routedAt_idx"
    ON "AnalystSignalRoute" ("analystId", "routeReasonCode", "routedAt" DESC);

-- Signal: industry classification so INDUSTRY_MATCH can fire at routing time.
ALTER TABLE "Signal"
    ADD COLUMN IF NOT EXISTS "industries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
