-- DropColumn: remove old single-value briefing fields from AgentConfig
ALTER TABLE "AgentConfig" DROP COLUMN IF EXISTS "analystBriefing";
ALTER TABLE "AgentConfig" DROP COLUMN IF EXISTS "briefingUpdatedAt";

-- CreateTable
CREATE TABLE "AnalystBriefing" (
    "id" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "runId" TEXT,
    "userId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "marketContext" JSONB,
    "theses" JSONB,
    "trades" JSONB,
    "portfolioSnapshot" JSONB,
    "strategyNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalystBriefing_runId_key" ON "AnalystBriefing"("runId");

-- CreateIndex
CREATE INDEX "AnalystBriefing_analystId_createdAt_idx" ON "AnalystBriefing"("analystId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalystBriefing_runId_idx" ON "AnalystBriefing"("runId");

-- AddForeignKey
ALTER TABLE "AnalystBriefing" ADD CONSTRAINT "AnalystBriefing_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "AgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystBriefing" ADD CONSTRAINT "AnalystBriefing_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
