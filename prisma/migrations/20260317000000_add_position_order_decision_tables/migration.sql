-- CreateTable: Position (what the analyst currently holds)
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avgCost" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "exitStrategy" TEXT NOT NULL,
    "exitDate" TIMESTAMP(3),
    "trailingStopPct" DOUBLE PRECISION,
    "closePrice" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "realizedPnl" DOUBLE PRECISION,
    "outcome" TEXT,
    "agentEvaluation" TEXT,
    "nearTargetAlertSent" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Order (intent sent to Alpaca)
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'MARKET',
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "filledPrice" DOUBLE PRECISION,
    "filledQty" DOUBLE PRECISION,
    "filledAt" TIMESTAMP(3),
    "alpacaOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PositionEvent (lifecycle events on a position)
CREATE TABLE "PositionEvent" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceAt" DOUBLE PRECISION,
    "pnlAt" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TradeDecision (every decision made during a run)
CREATE TABLE "TradeDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasoning" TEXT,
    "thesisId" TEXT,
    "positionId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_analystId_idx" ON "Position"("analystId");
CREATE INDEX "Position_userId_idx" ON "Position"("userId");
CREATE INDEX "Position_status_idx" ON "Position"("status");
CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

CREATE INDEX "Order_positionId_idx" ON "Order"("positionId");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

CREATE INDEX "PositionEvent_positionId_idx" ON "PositionEvent"("positionId");
CREATE INDEX "PositionEvent_positionId_createdAt_idx" ON "PositionEvent"("positionId", "createdAt");

CREATE UNIQUE INDEX "TradeDecision_orderId_key" ON "TradeDecision"("orderId");
CREATE INDEX "TradeDecision_runId_idx" ON "TradeDecision"("runId");
CREATE INDEX "TradeDecision_analystId_idx" ON "TradeDecision"("analystId");
CREATE INDEX "TradeDecision_symbol_idx" ON "TradeDecision"("symbol");
CREATE INDEX "TradeDecision_userId_symbol_idx" ON "TradeDecision"("userId", "symbol");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "AgentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PositionEvent" ADD CONSTRAINT "PositionEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TradeDecision" ADD CONSTRAINT "TradeDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeDecision" ADD CONSTRAINT "TradeDecision_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "AgentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeDecision" ADD CONSTRAINT "TradeDecision_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TradeDecision" ADD CONSTRAINT "TradeDecision_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TradeDecision" ADD CONSTRAINT "TradeDecision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
