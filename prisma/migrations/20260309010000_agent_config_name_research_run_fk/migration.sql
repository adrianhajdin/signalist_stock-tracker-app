-- ─── DAV-86: AgentConfig name + ResearchRun agentConfigId FK ─────────────────

-- 1. Drop the unique constraint on AgentConfig.userId
--    (users can now have multiple Analysts / AgentConfig rows)
ALTER TABLE "AgentConfig" DROP CONSTRAINT IF EXISTS "AgentConfig_userId_key";

-- 2. Add display name to AgentConfig
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'My Analyst';

-- 3. Add agentConfigId FK column to ResearchRun
ALTER TABLE "ResearchRun" ADD COLUMN IF NOT EXISTS "agentConfigId" TEXT;

-- 4. Add foreign key constraint (SET NULL on delete so runs survive analyst deletion)
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_agentConfigId_fkey"
  FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "ResearchRun_agentConfigId_idx" ON "ResearchRun"("agentConfigId");
CREATE INDEX IF NOT EXISTS "ResearchRun_userId_idx" ON "ResearchRun"("userId");
