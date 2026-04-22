-- ============================================================================
-- Migrate persisted RunMessage tool results to unified envelope schema
-- Run once in Supabase SQL Editor after deploying the tool schema refactor
-- ============================================================================
--
-- This function iterates every RunMessage, parses the JSON content,
-- finds tool-result parts, and adds summary/tickers/_sources fields
-- to each tool result based on the existing data.
--
-- Safe to run multiple times — skips results that already have a "summary" key.
-- ============================================================================

DO $$
DECLARE
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
  total_migrated int := 0;
  total_skipped int := 0;
BEGIN

FOR msg IN SELECT id, content FROM "RunMessage" WHERE role = 'thread'
LOOP
  BEGIN
    content_arr := msg.content::jsonb;
  EXCEPTION WHEN OTHERS THEN
    CONTINUE;
  END;

  IF jsonb_typeof(content_arr) != 'array' THEN
    CONTINUE;
  END IF;

  changed := false;
  updated_arr := '[]'::jsonb;

  -- Iterate each message in the array
  FOR i IN 0..jsonb_array_length(content_arr) - 1
  LOOP
    msg_obj := content_arr->i;

    -- Only process tool role messages
    IF msg_obj->>'role' != 'tool' THEN
      updated_arr := updated_arr || jsonb_build_array(msg_obj);
      CONTINUE;
    END IF;

    -- Process parts in tool message content
    IF jsonb_typeof(msg_obj->'content') != 'array' THEN
      updated_arr := updated_arr || jsonb_build_array(msg_obj);
      CONTINUE;
    END IF;

    new_parts := '[]'::jsonb;

    FOR j IN 0..jsonb_array_length(msg_obj->'content') - 1
    LOOP
      part := msg_obj->'content'->j;

      -- Only process tool-result parts
      IF part->>'type' != 'tool-result' THEN
        new_parts := new_parts || jsonb_build_array(part);
        CONTINUE;
      END IF;

      tool_name := part->>'toolName';

      -- Get the actual result value
      IF part->'output'->'value' IS NOT NULL THEN
        result_val := part->'output'->'value';
      ELSIF part->'output' IS NOT NULL AND part->'output'->>'type' IS NULL THEN
        result_val := part->'output';
      ELSE
        new_parts := new_parts || jsonb_build_array(part);
        CONTINUE;
      END IF;

      -- Skip if already migrated
      IF result_val ? 'summary' THEN
        new_parts := new_parts || jsonb_build_array(part);
        CONTINUE;
      END IF;

      -- ── Build envelope per tool ──────────────────────────────────

      enriched := NULL;

      CASE tool_name

      -- get_market_context
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

      -- get_stock_data
      WHEN 'get_stock_data' THEN
        DECLARE
          co jsonb := result_val->'company';
          qu jsonb := result_val->'quote';
          fi jsonb := result_val->'financials';
          ac jsonb := result_val->'analyst_consensus';
          te jsonb := result_val->'technicals';
          s_parts text := '';
          t_parts text := '';
          buy_pct int;
          total_analysts int;
          ticker_val text;
        BEGIN
          -- Extract ticker from _sources or company
          ticker_val := COALESCE(
            split_part(COALESCE(result_val->'_sources'->0->>'title', ''), ' ', 1),
            'UNKNOWN'
          );

          -- Build summary
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

          -- Metadata parts
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

      -- get_earnings_data
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

      -- get_options_flow
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

      -- get_sec_filings
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

      -- read_morning_brief
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
            -- Build tickers from alerts
            FOR k IN 0..jsonb_array_length(alerts) - 1 LOOP
              tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
                'ticker', alerts->k->>'ticker',
                'tag', 'Holding',
                'summary', COALESCE(alerts->k->>'alert', '')
              ));
            END LOOP;
            -- Build tickers from watchlist updates
            FOR k IN 0..jsonb_array_length(watches) - 1 LOOP
              tickers_arr := tickers_arr || jsonb_build_array(jsonb_build_object(
                'ticker', watches->k->>'ticker',
                'tag', 'Watching',
                'summary', COALESCE(watches->k->>'update', '')
              ));
            END LOOP;
            -- Build tickers from opportunities
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

      -- read_signals
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

      -- read_artifact
      WHEN 'read_artifact' THEN
        DECLARE
          title text := COALESCE(result_val->>'title', 'Untitled');
          url text := COALESCE(result_val->>'url', '');
          content_md text := COALESCE(result_val->>'contentMarkdown', '');
          wc int := array_length(regexp_split_to_array(content_md, '\s+'), 1);
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

      -- web_search
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
        -- Unknown tool — skip
        NULL;
      END CASE;

      -- Write enriched result back
      IF enriched IS NOT NULL THEN
        IF part->'output'->'value' IS NOT NULL THEN
          part := jsonb_set(part, '{output,value}', enriched);
        ELSE
          part := jsonb_set(part, '{output}', enriched);
        END IF;
        changed := true;
      END IF;

      new_parts := new_parts || jsonb_build_array(part);
    END LOOP;

    -- Rebuild message with updated parts
    msg_obj := jsonb_set(msg_obj, '{content}', new_parts);
    updated_arr := updated_arr || jsonb_build_array(msg_obj);
  END LOOP;

  -- Write back if anything changed
  IF changed THEN
    UPDATE "RunMessage" SET content = updated_arr::text WHERE id = msg.id;
    total_migrated := total_migrated + 1;
  ELSE
    total_skipped := total_skipped + 1;
  END IF;

END LOOP;

RAISE NOTICE 'Migration complete: % messages migrated, % skipped', total_migrated, total_skipped;

END $$;
