-- CreateEnum
CREATE TYPE "ThesisStatus" AS ENUM ('ACTIVE', 'INVALIDATED', 'CLOSED', 'SUPERSEDED');

-- AlterTable: Thesis lifecycle fields
ALTER TABLE "Thesis" ADD COLUMN "status" "ThesisStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Thesis" ADD COLUMN "parentThesisId" TEXT;
ALTER TABLE "Thesis" ADD COLUMN "invalidatedAt" TIMESTAMP(3);
ALTER TABLE "Thesis" ADD COLUMN "invalidReason" TEXT;

-- AlterTable: Watchlist graduation tracking
ALTER TABLE "AnalystWatchlistItem" ADD COLUMN "promotedToPositionId" TEXT;

-- AddForeignKey: Thesis self-relation (ThesisChain)
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_parentThesisId_fkey" FOREIGN KEY ("parentThesisId") REFERENCES "Thesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Thesis_researchRunId_idx" ON "Thesis"("researchRunId");
CREATE INDEX "Thesis_userId_idx" ON "Thesis"("userId");
CREATE INDEX "Thesis_ticker_idx" ON "Thesis"("ticker");
CREATE INDEX "Thesis_userId_ticker_status_idx" ON "Thesis"("userId", "ticker", "status");
