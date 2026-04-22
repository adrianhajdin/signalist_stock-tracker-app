-- CreateTable
CREATE TABLE "AccuracyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "tradesAnalyzed" INTEGER NOT NULL,
    "winRate" DOUBLE PRECISION,
    "calibrationData" JSONB NOT NULL,
    "signalAccuracy" JSONB NOT NULL,
    "directionStats" JSONB NOT NULL,
    "narrativeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccuracyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccuracyReport_userId_idx" ON "AccuracyReport"("userId");

-- CreateIndex
CREATE INDEX "AccuracyReport_weekStartDate_idx" ON "AccuracyReport"("weekStartDate");
