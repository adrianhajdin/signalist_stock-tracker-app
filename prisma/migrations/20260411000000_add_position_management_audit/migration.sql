-- Phase 1: Position Management Audit Trail
-- Adds PositionManagementAction table + new fields on Position

-- New audit table: every position change gets a row with a reason string
CREATE TABLE "PositionManagementAction" (
    "id"              TEXT NOT NULL,
    "positionId"      TEXT NOT NULL,
    "runId"           TEXT,
    "actionType"      TEXT NOT NULL,
    "source"          TEXT NOT NULL,
    "prevTargetPrice" DOUBLE PRECISION,
    "newTargetPrice"  DOUBLE PRECISION,
    "prevStopLoss"    DOUBLE PRECISION,
    "newStopLoss"     DOUBLE PRECISION,
    "prevTrailPct"    DOUBLE PRECISION,
    "newTrailPct"     DOUBLE PRECISION,
    "prevQty"         DOUBLE PRECISION,
    "newQty"          DOUBLE PRECISION,
    "reason"          TEXT NOT NULL,
    "alpacaOrderId"   TEXT,
    "fillPrice"       DOUBLE PRECISION,
    "fillQty"         DOUBLE PRECISION,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionManagementAction_pkey" PRIMARY KEY ("id")
);

-- New fields on Position
ALTER TABLE "Position"
    ADD COLUMN "closeSource"  TEXT,
    ADD COLUMN "initialQty"   DOUBLE PRECISION,
    ADD COLUMN "peakPrice"    DOUBLE PRECISION,
    ADD COLUMN "troughPrice"  DOUBLE PRECISION,
    ADD COLUMN "peakAt"       TIMESTAMP(3),
    ADD COLUMN "troughAt"     TIMESTAMP(3);

-- FK: PositionManagementAction → Position
ALTER TABLE "PositionManagementAction"
    ADD CONSTRAINT "PositionManagementAction_positionId_fkey"
    FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: PositionManagementAction → ResearchRun (nullable)
ALTER TABLE "PositionManagementAction"
    ADD CONSTRAINT "PositionManagementAction_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "PositionManagementAction_positionId_idx" ON "PositionManagementAction"("positionId");
CREATE INDEX "PositionManagementAction_runId_idx" ON "PositionManagementAction"("runId");

-- Backfill: set initialQty from existing quantity for all positions
UPDATE "Position" SET "initialQty" = "quantity";

-- Backfill: closeSource based on closeReason for closed positions
UPDATE "Position"
SET "closeSource" = CASE
    WHEN "closeReason" IN ('TARGET', 'STOP') THEN 'price_monitor'
    WHEN "closeReason" = 'MANUAL' THEN 'agent'
    ELSE 'unknown'
END
WHERE "status" = 'CLOSED' AND "closeSource" IS NULL;
