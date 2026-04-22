-- Migration: Add intelligence policy and primary source pack to AgentConfig
-- Part of V3 Intelligence Layer: Analyst Policy System
-- Run manually: psql $DATABASE_URL -f prisma/migrations/manual/add_intelligence_policy.sql

-- 1. Add intelligencePolicy JSON field (nullable, defaults handled in app code)
ALTER TABLE "AgentConfig"
  ADD COLUMN IF NOT EXISTS "intelligencePolicy" JSONB;

-- 2. Add primarySourcePackId FK (nullable, points to analyst's primary source pack)
ALTER TABLE "AgentConfig"
  ADD COLUMN IF NOT EXISTS "primarySourcePackId" TEXT;

-- 3. Add FK constraint (optional — the source pack must exist if set)
ALTER TABLE "AgentConfig"
  ADD CONSTRAINT "AgentConfig_primarySourcePackId_fkey"
  FOREIGN KEY ("primarySourcePackId")
  REFERENCES "SourcePack"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- 4. Index for quick lookup by primary source pack
CREATE INDEX IF NOT EXISTS "AgentConfig_primarySourcePackId_idx"
  ON "AgentConfig" ("primarySourcePackId");

COMMENT ON COLUMN "AgentConfig"."intelligencePolicy" IS 'V3: Per-analyst intelligence policy controlling signal budgets, attention weights, search limits. JSON matching IntelligencePolicy TypeScript interface.';
COMMENT ON COLUMN "AgentConfig"."primarySourcePackId" IS 'V3: FK to the analyst primary source pack proposed by the builder. Used for quick access; analyst may have additional packs via SourcePack.analystId relation.';
