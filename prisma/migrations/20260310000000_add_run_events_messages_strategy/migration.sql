-- AlterTable: Add strategy fields to AgentConfig
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "strategyInstructions" TEXT;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "strategyType" TEXT NOT NULL DEFAULT 'DISCOVERY';
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "tickerUniverse" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "tradePolicyAutoTrade" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Add title and inputText to ResearchRun
ALTER TABLE "ResearchRun" ADD COLUMN IF NOT EXISTS "inputText" TEXT;
ALTER TABLE "ResearchRun" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- CreateTable: RunEvent
CREATE TABLE IF NOT EXISTS "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RunMessage
CREATE TABLE IF NOT EXISTS "RunMessage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RunEvent_runId_idx" ON "RunEvent"("runId");
CREATE INDEX IF NOT EXISTS "RunEvent_runId_createdAt_idx" ON "RunEvent"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "RunMessage_runId_idx" ON "RunMessage"("runId");

-- AddForeignKey (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RunEvent_runId_fkey'
  ) THEN
    ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RunMessage_runId_fkey'
  ) THEN
    ALTER TABLE "RunMessage" ADD CONSTRAINT "RunMessage_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
