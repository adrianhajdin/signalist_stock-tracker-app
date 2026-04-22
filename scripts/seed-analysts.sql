-- ─── Seed: Example Analysts for user 34f5c589-e216-4afe-9ee8-613c13f300e7 ─────
-- Run in Supabase SQL Editor AFTER applying the DAV-86 migration
-- (prisma/migrations/20260309010000_agent_config_name_research_run_fk/migration.sql)

INSERT INTO "AgentConfig" (
  "id", "userId", "name", "enabled",
  "markets", "exchanges", "sectors", "watchlist", "exclusionList",
  "maxPositionSize", "maxOpenPositions", "minConfidence",
  "maxRiskPct", "dailyLossLimit",
  "holdDurations", "directionBias", "signalTypes", "minMarketCapTier",
  "scheduleTime", "priceCheckFreq", "weekendMode",
  "graduationWinRate", "graduationMinTrades", "graduationProfitFactor",
  "realTradingEnabled", "realMaxPosition",
  "emailAlerts", "weeklyDigestEnabled",
  "createdAt", "updatedAt"
) VALUES

-- ── Analyst 1: Trend Chaser ──────────────────────────────────────────────────
-- Scans for technical breakouts and news catalysts in tech + consumer.
-- Swing trades only. Confidence threshold 65 (captures more signals).
(
  concat('c', replace(gen_random_uuid()::text, '-', '')),
  '34f5c589-e216-4afe-9ee8-613c13f300e7',
  'Trend Chaser',
  true,
  ARRAY['NASDAQ', 'NYSE'],
  ARRAY['NASDAQ', 'NYSE'],
  ARRAY['Technology', 'Consumer Cyclical', 'Communication Services'],
  ARRAY[]::text[],   -- empty = auto-discover via scanner
  ARRAY[]::text[],
  1000.0,            -- max $1000 per position
  5,                 -- max 5 open positions
  65,                -- minimum confidence to trade
  2.0, 300.0,
  ARRAY['SWING'],
  'BOTH',
  ARRAY['TECHNICAL_BREAKOUT', 'NEWS_CATALYST', 'MOMENTUM'],
  'LARGE',
  '08:00', 'HOURLY', false,
  0.65, 50, 1.5,
  false, 500.0,
  true, true,
  NOW(), NOW()
),

-- ── Analyst 2: Earnings Play ─────────────────────────────────────────────────
-- Focuses on earnings beats and catalyst events.
-- Higher confidence bar (70). Swing + position hold durations.
(
  concat('c', replace(gen_random_uuid()::text, '-', '')),
  '34f5c589-e216-4afe-9ee8-613c13f300e7',
  'Earnings Play',
  true,
  ARRAY['NASDAQ', 'NYSE'],
  ARRAY['NASDAQ', 'NYSE'],
  ARRAY['Technology', 'Healthcare', 'Financials'],
  ARRAY[]::text[],
  ARRAY[]::text[],
  1000.0,
  5,
  70,                -- higher bar — only high-conviction earnings plays
  2.0, 300.0,
  ARRAY['SWING', 'POSITION'],
  'BOTH',
  ARRAY['EARNINGS_BEAT', 'EARNINGS_CATALYST', 'NEWS_CATALYST'],
  'LARGE',
  '08:00', 'HOURLY', false,
  0.65, 50, 1.5,
  false, 500.0,
  true, true,
  NOW(), NOW()
);

-- Verify:
SELECT id, name, enabled, "minConfidence", "signalTypes" FROM "AgentConfig"
WHERE "userId" = '34f5c589-e216-4afe-9ee8-613c13f300e7';
