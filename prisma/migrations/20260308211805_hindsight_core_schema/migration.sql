-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION,
    "targetPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "holdDuration" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "reasoningSummary" TEXT NOT NULL,
    "thesisBullets" TEXT[],
    "riskFlags" TEXT[],
    "signalTypes" TEXT[],
    "sector" TEXT,
    "sourcesUsed" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "fullResearch" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "exitStrategy" TEXT NOT NULL,
    "exitDate" TIMESTAMP(3),
    "trailingStopPct" DOUBLE PRECISION,
    "closePrice" DOUBLE PRECISION,
    "closeReason" TEXT,
    "realizedPnl" DOUBLE PRECISION,
    "outcome" TEXT,
    "agentEvaluation" TEXT,
    "alpacaOrderId" TEXT,
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEvent" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceAt" DOUBLE PRECISION,
    "pnlAt" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "markets" TEXT[],
    "exchanges" TEXT[],
    "sectors" TEXT[],
    "watchlist" TEXT[],
    "exclusionList" TEXT[],
    "maxPositionSize" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "minConfidence" INTEGER NOT NULL DEFAULT 70,
    "maxRiskPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "dailyLossLimit" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "holdDurations" TEXT[],
    "directionBias" TEXT NOT NULL DEFAULT 'BOTH',
    "signalTypes" TEXT[],
    "minMarketCapTier" TEXT NOT NULL DEFAULT 'LARGE',
    "scheduleTime" TEXT NOT NULL DEFAULT '07:30',
    "priceCheckFreq" TEXT NOT NULL DEFAULT 'HOURLY',
    "weekendMode" BOOLEAN NOT NULL DEFAULT false,
    "graduationWinRate" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "graduationMinTrades" INTEGER NOT NULL DEFAULT 50,
    "graduationProfitFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "realTradingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "realMaxPosition" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_thesisId_key" ON "Trade"("thesisId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_userId_key" ON "AgentConfig"("userId");

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "Thesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
