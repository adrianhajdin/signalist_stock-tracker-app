-- AlterTable: AnalystWatchlistItem — add missing metadata columns
-- These were defined in schema.prisma but never had a migration.
-- Uses IF NOT EXISTS for idempotency (columns may already exist from manual SQL).
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN IF NOT EXISTS "thesisDirection" TEXT;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN IF NOT EXISTS "targetPrice" DOUBLE PRECISION;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN IF NOT EXISTS "stopPrice" DOUBLE PRECISION;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN IF NOT EXISTS "conviction" INTEGER;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN IF NOT EXISTS "catalyst" TEXT;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN IF NOT EXISTS "promotedToPositionId" TEXT;
