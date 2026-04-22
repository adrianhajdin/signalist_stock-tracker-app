-- ── Drop legacy intelligence models ──────────────────────────────────────────
-- Removes Source, SourcePack, SourcePackSource, IntelligenceQuery,
-- MonitorCheckpoint models that are fully replaced by the Monitor model.
-- Also drops primarySourcePackId FK from AgentConfig.
-- Also converts old PORTFOLIO/WATCHLIST type monitors to SEARCH type,
-- and cleans up per-ticker monitor rows.

-- 1. Drop MonitorCheckpoint (depends on Source)
DROP TABLE IF EXISTS "MonitorCheckpoint" CASCADE;

-- 2. Drop SourcePackSource (join table between SourcePack and Source)
DROP TABLE IF EXISTS "SourcePackSource" CASCADE;

-- 3. Drop SourcePack (depends on AgentConfig)
DROP TABLE IF EXISTS "SourcePack" CASCADE;

-- 4. Drop Artifact.sourceId FK constraint (Source is being dropped)
ALTER TABLE "Artifact" DROP CONSTRAINT IF EXISTS "Artifact_sourceId_fkey";

-- 5. Drop Source
DROP TABLE IF EXISTS "Source" CASCADE;

-- 6. Drop IntelligenceQuery
DROP TABLE IF EXISTS "IntelligenceQuery" CASCADE;

-- 7. Drop primarySourcePackId from AgentConfig
ALTER TABLE "AgentConfig" DROP COLUMN IF EXISTS "primarySourcePackId";

-- 8. Convert old PORTFOLIO/WATCHLIST type monitors to SEARCH type
UPDATE "Monitor" SET "type" = 'SEARCH' WHERE "type" IN ('PORTFOLIO', 'WATCHLIST');

-- 9. Clean up per-ticker monitor rows (ticker-search-*) — replaced by permanent monitors
DELETE FROM "Monitor" WHERE "id" LIKE 'ticker-search-%' AND "builtIn" = true AND "category" = 'TICKER';

-- 10. Upsert the two permanent portfolio/watchlist monitors
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES
  ('monitor_portfolio_searches', 'Portfolio Searches', 'SEARCH', 'perplexity_sonar', '{"track": "positions"}', 'FIRM', true, true, 'SYSTEM', 'TICKER', NOW(), NOW()),
  ('monitor_watchlist_searches', 'Watchlist Searches', 'SEARCH', 'perplexity_sonar', '{"track": "watchlist"}', 'FIRM', true, true, 'SYSTEM', 'TICKER', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "config" = EXCLUDED."config",
  "updatedAt" = NOW();

-- 11. Remove old built-in monitors with legacy types
DELETE FROM "Monitor" WHERE "id" IN ('monitor_portfolio', 'monitor_watchlist') AND "builtIn" = true;
