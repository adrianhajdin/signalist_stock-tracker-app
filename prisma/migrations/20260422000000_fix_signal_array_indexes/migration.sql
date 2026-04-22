-- Fix Signal B-tree indexes on array columns → GIN.
--
-- Postgres B-tree indexes on String[] (text[]) columns index the whole array
-- as a single tuple, capped at 2704 bytes per the B-tree page format. Large
-- aggregate signals (earnings calendar with ~500 tickers, etc.) exceeded
-- this cap and every insert was failing with:
--   "index row size 4496 exceeds btree version 4 maximum 2704 for index ..."
--
-- Array columns need GIN, which indexes each element independently. GIN is
-- also what Prisma's `hasSome` / `has` filters actually need to use an index —
-- the B-tree couldn't accelerate those queries anyway, so we were paying the
-- write cost for zero read benefit. Net win.

DROP INDEX IF EXISTS "Signal_tickers_idx";
CREATE INDEX "Signal_tickers_idx" ON "Signal" USING GIN ("tickers");

DROP INDEX IF EXISTS "Signal_themes_idx";
CREATE INDEX "Signal_themes_idx" ON "Signal" USING GIN ("themes");
