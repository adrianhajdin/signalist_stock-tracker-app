-- CreateTable: AnalystWatchlistItem
-- Per-analyst watchlist with metadata, thesis history, and lifecycle tracking.
-- Replaces the flat watchlist String[] on AgentConfig.

CREATE TABLE "AnalystWatchlistItem" (
    "id" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "addedBy" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastReviewedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystWatchlistItem_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "AnalystWatchlistItem_analystId_status_idx" ON "AnalystWatchlistItem"("analystId", "status");
CREATE INDEX "AnalystWatchlistItem_userId_idx" ON "AnalystWatchlistItem"("userId");

-- Unique constraint: one active item per analyst per symbol
CREATE UNIQUE INDEX "AnalystWatchlistItem_analystId_symbol_status_key" ON "AnalystWatchlistItem"("analystId", "symbol", "status");

-- Foreign key
ALTER TABLE "AnalystWatchlistItem" ADD CONSTRAINT "AnalystWatchlistItem_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "AgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing watchlist data from AgentConfig.watchlist String[] into the new table.
-- Each existing ticker becomes an ACTIVE item with addedBy='USER'.
INSERT INTO "AnalystWatchlistItem" ("id", "analystId", "userId", "symbol", "reason", "addedBy", "status", "updatedAt")
SELECT
    gen_random_uuid()::text,
    ac."id",
    ac."userId",
    unnest(ac."watchlist"),
    'Migrated from analyst config',
    'USER',
    'ACTIVE',
    NOW()
FROM "AgentConfig" ac
WHERE array_length(ac."watchlist", 1) > 0;
