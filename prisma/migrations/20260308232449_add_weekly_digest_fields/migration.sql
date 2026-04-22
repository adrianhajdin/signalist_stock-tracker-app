-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN     "digestEmail" TEXT,
ADD COLUMN     "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true;
