-- cleanup-briefing-agent-monitors.sql
--
-- One-off cleanup: delete SEARCH monitors that were auto-minted by the
-- post-run briefing agent's (now removed) dynamicQueries side effect.
--
-- Context: for months the briefing agent wrote 0-5 ticker-specific SEARCH
-- queries per analyst per run, stamped `origin = 'BRIEFING_AGENT'`, and
-- nothing ever deleted them. A single analyst would accumulate 30-50+
-- stale queries over weeks (e.g. "NVDA Q2 2026 earnings guidance revision",
-- "Semiconductor tariff impact China export controls") that the user had
-- no visibility into and that duplicated what portfolio-watchlist-monitor
-- already covers for held tickers.
--
-- The write path was removed in the same commit as this script. Run this
-- ONCE against the DB to drop the accumulated rows. Safe to run multiple
-- times — just becomes a no-op after the first run.
--
-- Usage (Supabase SQL editor OR `psql $DATABASE_URL`):
--   \i scripts/cleanup-briefing-agent-monitors.sql
--
-- What it does NOT touch:
--   - origin = 'USER'    → manually-added monitors
--   - origin = 'BUILDER' → initial queries from the Builder/Editor
--   - type != 'SEARCH'   → DOMAIN and API monitors are unaffected

BEGIN;

-- Report before + after counts so the operator sees the impact.
DO $$
DECLARE
  before_count INT;
  after_count INT;
BEGIN
  SELECT COUNT(*) INTO before_count
  FROM "Monitor"
  WHERE origin = 'BRIEFING_AGENT' AND type = 'SEARCH';

  RAISE NOTICE 'Found % BRIEFING_AGENT search monitors to delete.', before_count;

  DELETE FROM "Monitor"
  WHERE origin = 'BRIEFING_AGENT' AND type = 'SEARCH';

  SELECT COUNT(*) INTO after_count
  FROM "Monitor"
  WHERE origin = 'BRIEFING_AGENT' AND type = 'SEARCH';

  RAISE NOTICE 'After cleanup: % BRIEFING_AGENT search monitors remain (expected 0).', after_count;
END $$;

COMMIT;
