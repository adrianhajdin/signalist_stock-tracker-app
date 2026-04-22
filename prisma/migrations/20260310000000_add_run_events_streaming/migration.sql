-- CreateTable: RunEvent (SSE event log per research run)
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RunMessage (chat messages scoped to a run)
CREATE TABLE "RunMessage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunEvent_runId_idx" ON "RunEvent"("runId");
CREATE INDEX "RunEvent_runId_createdAt_idx" ON "RunEvent"("runId", "createdAt");
CREATE INDEX "RunMessage_runId_idx" ON "RunMessage"("runId");

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RunMessage" ADD CONSTRAINT "RunMessage_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Thesis — add thoughtTrace for streaming replay
ALTER TABLE "Thesis" ADD COLUMN "thoughtTrace" JSONB;

-- AlterTable: AgentConfig — analyst identity + strategy config fields
ALTER TABLE "AgentConfig"
    ADD COLUMN "analystPrompt"        TEXT,
    ADD COLUMN "analystVoice"         TEXT,
    ADD COLUMN "description"          TEXT,
    ADD COLUMN "strategyType"         TEXT NOT NULL DEFAULT 'DISCOVERY',
    ADD COLUMN "strategyInstructions" TEXT,
    ADD COLUMN "tickerUniverse"       TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN "tradePolicyAutoTrade" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "conceptPromptExtra"   TEXT,
    ADD COLUMN "thesisPromptExtra"    TEXT;
