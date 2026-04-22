-- AlterTable: AnalystBriefing — add structured brief fields (all nullable)
ALTER TABLE "AnalystBriefing" ADD COLUMN "marketPosture" TEXT;
ALTER TABLE "AnalystBriefing" ADD COLUMN "watchTomorrow" JSONB;
ALTER TABLE "AnalystBriefing" ADD COLUMN "unresolvedItems" JSONB;
ALTER TABLE "AnalystBriefing" ADD COLUMN "selfCorrections" JSONB;

-- AlterTable: AnalystWatchlistItem — add enhanced watchlist metadata (all nullable)
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN "triggerCondition" TEXT;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN "reviewFrequency" TEXT;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN "addedRunId" TEXT;
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN "lastThesisId" TEXT;
