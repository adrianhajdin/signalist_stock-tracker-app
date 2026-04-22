-- ============================================================================
-- Test migration on a SINGLE run — dry-run friendly
-- ============================================================================
--
-- 1. Replace the runId below with a real run ID from your DB
-- 2. Run this in Supabase SQL editor
-- 3. It will show you: messages found, tool results found, and what got migrated
-- 4. Run migrate-tool-schemas.sql (full migration) after verifying this worked
--
-- To rollback a single run if something looks wrong:
--   Just re-run the original agent or restore from Supabase backup
--
-- Safe to run multiple times — skips results that already have a "summary" key.
-- ============================================================================

DO $$
DECLARE
  target_run_id text := 'REPLACE_WITH_YOUR_RUN_ID';  -- ← CHANGE THIS

  msg RECORD;
  content_arr jsonb;
  updated_arr jsonb;
  msg_obj jsonb;
  part jsonb;
  tool_name text;
  result_val jsonb;
  enriched jsonb;
  new_parts jsonb;
  changed boolean;
  msgs_processed int := 0;
  tool_results_found int := 0;
  tool_results_migrated int := 0;
  tool_results_skipped int := 0;
BEGIN

-- Check the run exists
IF NOT EXISTS (SELECT 1 FROM "ResearchRun" WHERE id = target_run_id) THEN
  RAISE EXCEPTION 'Run % not found', target_run_id;
END IF;

RAISE NOTICE '=== Migrating run: % ===', target_run_id;

FOR msg IN SELECT id, content FROM "RunMessage" WHERE "runId" = target_run_id AND role = 'thread'
LOOP
  msgs_processed := msgs_processed + 1;

  BEGIN
    content_arr := msg.content::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  RunMessage % — failed to parse JSON, skipping', msg.id;
    CONTINUE;
  END;

  IF jsonb_typeof(content_arr) != 'array' THEN
    RAISE NOTICE '  RunMessage % — content is not an array, skipping', msg.id;
    CONTINUE;
  END IF;

  changed := false;
  updated_arr := '[]'::jsonb;

  FOR i IN 0..jsonb_array_length(content_arr) - 1
  LOOP
    msg_obj := content_arr->i;

    IF msg_obj->>'role' != 'tool' THEN
      updated_arr := updated_arr || jsonb_build_array(msg_obj);
      CONTINUE;
    END IF;

    IF jsonb_typeof(msg_obj->'content') != 'array' THEN
      updated_arr := updated_arr || jsonb_build_array(msg_obj);
      CONTINUE;
    END IF;

    new_parts := '[]'::jsonb;

    FOR j IN 0..jsonb_array_length(msg_obj->'content') - 1
    LOOP
      part := msg_obj->'content'->j;

      IF part->>'type' != 'tool-result' THEN
        new_parts := new_parts || jsonb_build_array(part);
        CONTINUE;
      END IF;

      tool_name := part->>'toolName';
      tool_results_found := tool_results_found + 1;

      IF part->'output'->'value' IS NOT NULL THEN
        result_val := part->'output'->'value';
      ELSIF part->'output' IS NOT NULL AND part->'output'->>'type' IS NULL THEN
        result_val := part->'output';
      ELSE
        new_parts := new_parts || jsonb_build_array(part);
        CONTINUE;
      END IF;

      IF result_val ? 'summary' THEN
        tool_results_skipped := tool_results_skipped + 1;
        new_parts := new_parts || jsonb_build_array(part);
        CONTINUE;
      END IF;

      -- ── Build envelope per tool ──────────────────────────────────

      enriched := NULL;

      CASE tool_name

      WHEN 'get_market_context' THEN
        enriched := result_val || jsonb_build_object(
          'summary', COALESCE(
            'SPY $' || (result_val->'spy'->>'price') ||
            ' (' || CASE WHEN (result_val->'spy'->>'change_pct')::numeric >= 0 THEN '+' ELSE '' END ||
            (result_val->'spy'->>'change_pct') || '%), VIX ' ||
            COALESCE(result_val->'vix'->>'level', '?') ||
            '. Regime: ' || COALESCE(result_val->>'regime', 'NEUTRAL') || '.',
            'Market context loaded.'
          ),
          'tickers', CASE
            WHEN result_val->'spy' IS NOT NULL AND result_val->'spy'->>'price' IS NOT NULL
            THEN jsonb_build_array(jsonb_build_object(
              'ticker', 'SPY',
              'summary', '$' || (result_val->'spy'->>'price') ||
                ' (' || CASE WHEN (result_val->'spy'->>'change_pct')::numeric >= 0 THEN '+' ELSE '' END ||
                (result_val->'spy'->>'change_pct') || '%)'
            ))
            ELSE '[]'::jsonb
          END
        );

      WHEN 'get_stock_data' THEN
        DECLARE
          co jsonb := result_val->'company';
          qu jsonb := result_val->'quote';
          fi jsonb := result_val->'financials';
          ac jsonb := result_val->'analyst_consensus';
          s_parts text := '';
          t_parts text := '';
          buy_pct int;
          total_analysts int;
          ticker_val text;
        BEGIN
          ticker_val := COALESCE(
            split_part(COALESCE(result_val->'_sources'->0->>'title', ''), ' ', 1),
            'UNKNOWN'
          );

          IF co->>'name' IS NOT NULL THEN
            s_parts := ticker_val || ' — ' || (co->>'name');
          ELSE
            s_parts := ticker_val;
          END IF;

          IF qu->>'price' IS NOT NULL THEN
            s_parts := s_parts || '. $' || (qu->>'price') ||
              ' (' || CASE WHEN (qu->>'change_pct')::numeric >= 0 THEN '+' ELSE '' END ||
              (qu->>'change_pct') || '%)';
          END IF;

          t_parts := '';
          IF co->>'sector' IS NOT NULL THEN
            t_parts := co->>'sector';
          END IF;
          IF co->>'market_cap' IS NOT NULL THEN
            DECLARE
              mc numeric := (co->>'market_cap')::numeric;
              mc_str text;
            BEGIN
              IF mc >= 1e12 THEN mc_str := '$' || round(mc / 1e12, 1)::text || 'T';
              ELSIF mc >= 1e9 THEN mc_str := '$' || round(mc / 1e9, 1)::text || 'B';
              ELSIF mc >= 1e6 THEN mc_str := '$' || round(mc / 1e6, 0)::text || 'M';
              ELSE mc_str := '$' || mc::text;
              END IF;
              IF t_parts != '' THEN t_parts := t_parts || ' · '; END IF;
              t_parts := t_parts || mc_str;
            END;
          END IF;
          IF fi->>'pe_ratio' IS NOT NULL THEN
            IF t_parts != '' THEN t_parts := t_parts || ' · '; END IF;
            t_parts := t_parts || 'P/E ' || round((fi->>'pe_ratio')::numeric, 1)::text;
          END IF;
          IF ac IS NOT NULL THEN
            total_analysts := COALESCE((ac->>'strong_buy')::int, 0) + COALESCE((ac->>'buy')::int, 0) +
                             COALESCE((ac->>'hold')::int, 0) + COALESCE((ac->>'sell')::int, 0) +
                             COALESCE((ac->>'strong_sell')::int, 0);
            IF total_analysts > 0 THEN
              buy_pct := round(((COALESCE((ac->>'strong_buy')::int, 0) + COALESCE((ac->>'buy')::int, 0))::numeric / total_analysts) * 100);
              IF t_parts != '' THEN t_parts := t_parts || ' · '; END IF;
              t_parts := t_parts || buy_pct::text || '% Buy';
            END IF;
          END IF;

          IF t_parts != '' THEN
            s_parts := s_parts || '. ' || t_parts;
          END IF;

          enriched := result_val || jsonb_build_object(
            'summary', s_parts || '.',
            'tickers', jsonb_build_array(jsonb_build_object(
              'ticker', ticker_val,
              'tag', 'Research',
              'summary', COALESCE(co->>'name', ticker_val) || '. ' || t_parts
            ))
          );
        END;

      WHEN 'get_earnings_data' THEN
        DECLARE
          ne jsonb := result_val->'next_earnings';
          br text := COALESCE(result_val->>'beat_rate', 'no history');
          ticker_val text;
          summ text;
        BEGIN
          ticker_val := COALESCE(
            split_part(COALESCE(result_val->'_sources'->0->>'title', ''), ' ', 1),
            'UNKNOWN'
          );
          summ := ticker_val;
          IF ne->>'date' IS NOT NULL THEN
            summ := summ || ' — next earnings ' || (ne->>'date');
          END IF;
          IF br != 'no history' THEN
            summ := summ || '. Beat rate: ' || br;
          END IF;
          enriched := result_val || jsonb_build_object(
            'summary', summ || '.',
            'tickers', jsonb_build_array(jsonb_build_object(
              'ticker', ticker_val,
              'tag', 'Research',
              'summary', CASE WHEN ne->>'date' IS NOT NULL THEN 'Next earnings ' || (ne->>'date') ELSE 'No upcoming earnings' END || '. Beat rate: ' || br
            ))
          );
        END;

      WHEN 'get_options_flow' THEN
        DECLARE
          avail boolean := COALESCE((result_val->>'available')::boolean, false);
          sig text := COALESCE(result_val->>'signal', 'neutral');
          pcr text := COALESCE(result_val->>'put_call_ratio', 'N/A');
          ticker_val text;
        BEGIN
          ticker_val := COALESCE(
            split_part(COALESCE(result_val->'_sources'->0->>'title', ''), ' ', 1),
            'UNKNOWN'
          );
          IF avail THEN
            enriched := result_val || jsonb_build_object(
              'summary', ticker_val || ' options — P/C ratio ' || pcr || ', ' || split_part(sig, ' ', 1) || '.',
              'tickers', jsonb_build_array(jsonb_build_object(
                'ticker', ticker_val,
                'tag', 'Research',
                'summary', 'P/C ' || pcr || ' ' || split_part(sig, ' ', 1)
              ))
            );
          ELSE
            enriched := result_val || jsonb_build_object(
              'summary', 'No options data available for ' || ticker_val || '.',
              'tickers', jsonb_build_array(jsonb_build_object(
                'ticker', ticker_val,
                'tag', 'Research',
                'summary', 'No options data'
              ))
            );
          END IF;
        END;

      WHEN 'get_sec_filings' THEN
        DECLARE
          cnt int := COALESCE(jsonb_array_length(result_val->'filings'), 0);
          ticker_val text;
        BEGIN
          ticker_val := COALESCE(
            split_part(COALESCE(result_val->'_sources'->0->>'title', ''), ' ', 1),
            'UNKNOWN'
          );
          enriched := result_val || jsonb_build_object(
            'summary', ticker_val || ' — ' || cnt::text || ' SEC filing' || CASE WHEN cnt != 1 THEN 's' ELSE '' END || '.',
            'tickers', jsonb_build_array(jsonb_build_object(
              'ticker', ticker_val,
              'tag', 'Research',
              'summary', cnt::text || ' SEC filing' || CASE WHEN cnt != 1 THEN 's' ELSE '' END
            ))
          );
        END;

      WHEN 'read_morning_brief' THEN
        DECLARE
          alerts jsonb := COALESCE(result_val->'portfolioAlerts', '[]'::jsonb);
          watches jsonb := COALESCE(result_val->'watchlistUpdates', '[]'::jsonb);
          opps jsonb := COALESCE(result_val->'newOpportunities', '[]'::jsonb);
          tickers_arr jsonb := '[]'::jsonb;
          k int;
        BEGIN
          IF (result_val->>'available')::boolean = false THEN
            enriched := result_val || jsonb_build_object(
              'summary', 'No morning brief available for today.',
              'tickers', '[]'::jsonb
            );
          ELSE
            FOR k IN 0..jsonb_array_length(alerts) - 1 LOOP
              tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
                'ticker', alerts->k->>'ticker',
                'tag', 'Holding',
                'summary', COALESCE(alerts->k->>'alert', '')
              ));
            END LOOP;
            FOR k IN 0..jsonb_array_length(watches) - 1 LOOP
              tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
                'ticker', watches->k->>'ticker',
                'tag', 'Watching',
                'summary', COALESCE(watches->k->>'update', '')
              ));
            END LOOP;
            FOR k IN 0..jsonb_array_length(opps) - 1 LOOP
              tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
                'ticker', COALESCE(opps->k->'tickers'->>0, '?'),
                'tag', 'Opportunity',
                'summary', COALESCE(opps->k->>'thesisSeed', opps->k->>'headline', '')
              ));
            END LOOP;

            enriched := result_val || jsonb_build_object(
              'summary', 'Morning brief: ' || jsonb_array_length(alerts)::text || ' portfolio alert' ||
                CASE WHEN jsonb_array_length(alerts) != 1 THEN 's' ELSE '' END || ', ' ||
                jsonb_array_length(watches)::text || ' watchlist update' ||
                CASE WHEN jsonb_array_length(watches) != 1 THEN 's' ELSE '' END || ', ' ||
                jsonb_array_length(opps)::text || ' opportunit' ||
                CASE WHEN jsonb_array_length(opps) != 1 THEN 'ies' ELSE 'y' END || '. ' ||
                COALESCE(result_val->>'signalCount', '0') || ' signals.',
              'tickers', tickers_arr
            );
          END IF;
        END;

      WHEN 'read_signals' THEN
        DECLARE
          sigs jsonb := COALESCE(result_val->'signals', '[]'::jsonb);
          cnt int := COALESCE((result_val->>'count')::int, jsonb_array_length(sigs));
          tickers_arr jsonb := '[]'::jsonb;
          k int;
          urgent int := 0;
          bullish int := 0;
          bearish int := 0;
        BEGIN
          FOR k IN 0..jsonb_array_length(sigs) - 1 LOOP
            IF sigs->k->>'urgency' IN ('HIGH', 'BREAKING') THEN urgent := urgent + 1; END IF;
            IF sigs->k->>'sentiment' = 'BULLISH' THEN bullish := bullish + 1; END IF;
            IF sigs->k->>'sentiment' = 'BEARISH' THEN bearish := bearish + 1; END IF;
            tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
              'ticker', COALESCE(sigs->k->'tickers'->>0, 'MACRO'),
              'tag', COALESCE(sigs->k->>'urgency', 'MEDIUM'),
              'summary', COALESCE(sigs->k->>'headline', '')
            ));
          END LOOP;
          enriched := result_val || jsonb_build_object(
            'summary', cnt::text || ' signal' || CASE WHEN cnt != 1 THEN 's' ELSE '' END ||
              ' (' || urgent::text || ' urgent, ' || bullish::text || ' bullish, ' || bearish::text || ' bearish).',
            'tickers', tickers_arr
          );
        END;

      WHEN 'read_artifact' THEN
        DECLARE
          title text := COALESCE(result_val->>'title', 'Untitled');
          url text := COALESCE(result_val->>'url', '');
          content_md text := COALESCE(result_val->>'contentMarkdown', '');
          wc int := CASE WHEN content_md != '' THEN array_length(regexp_split_to_array(content_md, '\s+'), 1) ELSE 0 END;
          domain text := '';
        BEGIN
          IF url != '' THEN
            BEGIN
              domain := regexp_replace(regexp_replace(url, '^https?://(www\.)?', ''), '/.*$', '');
            EXCEPTION WHEN OTHERS THEN
              domain := '';
            END;
          END IF;
          enriched := result_val || jsonb_build_object(
            'summary', CASE WHEN domain != '' THEN domain || ': ' ELSE '' END || title ||
              CASE WHEN wc > 0 THEN ' (' || wc::text || ' words)' ELSE '' END || '.'
          );
        END;

      WHEN 'web_search' THEN
        DECLARE
          res jsonb := COALESCE(result_val->'results', '[]'::jsonb);
          rc int := COALESCE((result_val->>'resultCount')::int, jsonb_array_length(res));
          q text := COALESCE(result_val->>'query', '');
          bu int := COALESCE((result_val->>'budgetUsed')::int, 0);
          bm int := COALESCE((result_val->>'budgetMax')::int, 5);
          tickers_arr jsonb := '[]'::jsonb;
          k int;
        BEGIN
          FOR k IN 0..LEAST(jsonb_array_length(res) - 1, 9) LOOP
            IF jsonb_array_length(COALESCE(res->k->'tickers', '[]'::jsonb)) > 0 THEN
              tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
                'ticker', res->k->'tickers'->>0,
                'tag', COALESCE(res->k->>'sentiment', 'NEUTRAL'),
                'summary', COALESCE(res->k->>'headline', '')
              ));
            END IF;
          END LOOP;
          enriched := result_val || jsonb_build_object(
            'summary', 'Found ' || rc::text || ' result' || CASE WHEN rc != 1 THEN 's' ELSE '' END ||
              ' for "' || left(q, 60) || '". Budget: ' || bu::text || '/' || bm::text || '.',
            'tickers', tickers_arr
          );
        END;

      ELSE
        NULL;
      END CASE;

      IF enriched IS NOT NULL THEN
        IF part->'output'->'value' IS NOT NULL THEN
          part := jsonb_set(part, '{output,value}', enriched);
        ELSE
          part := jsonb_set(part, '{output}', enriched);
        END IF;
        changed := true;
        tool_results_migrated := tool_results_migrated + 1;
        RAISE NOTICE '  ✓ migrated %: %', tool_name, left(enriched->>'summary', 80);
      ELSE
        RAISE NOTICE '  ⊘ unknown tool: %', tool_name;
      END IF;

      new_parts := new_parts || jsonb_build_array(part);
    END LOOP;

    msg_obj := jsonb_set(msg_obj, '{content}', new_parts);
    updated_arr := updated_arr || jsonb_build_array(msg_obj);
  END LOOP;

  IF changed THEN
    UPDATE "RunMessage" SET content = updated_arr::text WHERE id = msg.id;
    RAISE NOTICE '  → RunMessage % updated', msg.id;
  END IF;

END LOOP;

RAISE NOTICE '=== Summary ===';
RAISE NOTICE '  Messages processed:     %', msgs_processed;
RAISE NOTICE '  Tool results found:     %', tool_results_found;
RAISE NOTICE '  Tool results migrated:  %', tool_results_migrated;
RAISE NOTICE '  Already migrated:       %', tool_results_skipped;

END $$;
