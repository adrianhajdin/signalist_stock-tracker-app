-- CreateTable: Monitor — unified intelligence monitor
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "config" JSONB,
    "scope" TEXT NOT NULL DEFAULT 'FIRM',
    "analystId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "origin" TEXT NOT NULL DEFAULT 'USER',
    "category" TEXT NOT NULL DEFAULT 'MARKET',
    "expiresAt" TIMESTAMP(3),
    "sourceRunId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "legacyQueryId" TEXT,
    "legacySourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Monitor_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX "Monitor_type_idx" ON "Monitor"("type");
CREATE INDEX "Monitor_scope_enabled_idx" ON "Monitor"("scope", "enabled");
CREATE INDEX "Monitor_analystId_idx" ON "Monitor"("analystId");
CREATE INDEX "Monitor_expiresAt_idx" ON "Monitor"("expiresAt");

-- Add foreign key
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_analystId_fkey"
    FOREIGN KEY ("analystId") REFERENCES "AgentConfig"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add aggregate fields to Signal
ALTER TABLE "Signal" ADD COLUMN "monitorId" TEXT;
ALTER TABLE "Signal" ADD COLUMN "aggregateType" TEXT;
ALTER TABLE "Signal" ADD COLUMN "dataPayload" JSONB;
ALTER TABLE "Signal" ADD COLUMN "itemCount" INTEGER;

-- Add index for monitorId on Signal
CREATE INDEX "Signal_monitorId_idx" ON "Signal"("monitorId");

-- Add foreign key for Signal.monitorId
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_monitorId_fkey"
    FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Seed built-in monitors (non-deletable system monitors)
-- ═══════════════════════════════════════════════════════════════════

-- FMP Market Gainers
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES (
    'monitor_fmp_gainers',
    'Top Gainers',
    'API',
    'fmp',
    '{"endpoint": "/stock_market/gainers", "limit": 10, "description": "Top 10 stocks by daily percentage gain"}',
    'FIRM', true, true, 'SYSTEM', 'MARKET',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- FMP Market Losers
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES (
    'monitor_fmp_losers',
    'Top Losers',
    'API',
    'fmp',
    '{"endpoint": "/stock_market/losers", "limit": 10, "description": "Top 10 stocks by daily percentage loss"}',
    'FIRM', true, true, 'SYSTEM', 'MARKET',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- FMP Most Active
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES (
    'monitor_fmp_actives',
    'Most Active',
    'API',
    'fmp',
    '{"endpoint": "/stock_market/actives", "limit": 10, "description": "Top 10 most traded stocks by volume"}',
    'FIRM', true, true, 'SYSTEM', 'MARKET',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Finnhub Earnings Calendar
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES (
    'monitor_finnhub_earnings',
    'Earnings Calendar',
    'API',
    'finnhub',
    '{"endpoint": "/calendar/earnings", "lookAheadDays": 7, "description": "Companies reporting earnings in the next 7 days"}',
    'FIRM', true, true, 'SYSTEM', 'EVENT',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Portfolio Tickers (auto-monitors all open positions)
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES (
    'monitor_portfolio',
    'Portfolio Positions',
    'PORTFOLIO',
    'perplexity_sonar',
    '{"description": "Monitors all open positions across analysts for news, catalysts, and price-moving events", "queryTemplate": "{ticker} {companyName} stock news developments catalysts today"}',
    'FIRM', true, true, 'SYSTEM', 'TICKER',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Watchlist Tickers (auto-monitors all watchlist items)
INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "createdAt", "updatedAt")
VALUES (
    'monitor_watchlist',
    'Watchlist Items',
    'WATCHLIST',
    'perplexity_sonar',
    '{"description": "Monitors all active watchlist items across analysts for news and developments", "queryTemplate": "{ticker} {companyName} stock news developments analyst ratings today"}',
    'FIRM', true, true, 'SYSTEM', 'TICKER',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════
-- Migrate existing IntelligenceQuery rows → Monitor (type=SEARCH)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "analystId", "enabled", "builtIn", "origin", "category", "expiresAt", "sourceRunId", "legacyQueryId", "createdAt", "updatedAt")
SELECT
    'mon_q_' || "id",
    "query",
    'SEARCH',
    'perplexity_sonar',
    jsonb_build_object('query', "query"),
    "scope",
    "analystId",
    "enabled",
    false,
    CASE
        WHEN "createdBy" = 'ANALYST_BUILDER' THEN 'BUILDER'
        WHEN "createdBy" = 'BRIEFING_AGENT' THEN 'BRIEFING_AGENT'
        ELSE 'USER'
    END,
    "category",
    "expiresAt",
    "sourceRunId",
    "id",
    "createdAt",
    COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "IntelligenceQuery";

-- ═══════════════════════════════════════════════════════════════════
-- Migrate existing Source rows → Monitor (type=DOMAIN)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO "Monitor" ("id", "name", "type", "method", "config", "scope", "enabled", "builtIn", "origin", "category", "legacySourceId", "createdAt", "updatedAt")
SELECT
    'mon_s_' || "id",
    "name",
    'DOMAIN',
    CASE WHEN "type" = 'API' THEN 'api' ELSE 'perplexity_sonar' END,
    jsonb_build_object(
        'domain', "domain",
        'url', "url",
        'qualityScore', "qualityScore",
        'sourceType', "type",
        'checkFrequency', "checkFrequency"
    ),
    'FIRM',
    "enabled",
    false,
    'USER',
    "category",
    "id",
    "createdAt",
    COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "Source";
