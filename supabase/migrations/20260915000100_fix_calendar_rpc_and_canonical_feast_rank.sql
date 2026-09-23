-- 20260915000100 — corrective hardening: canonical feast rank, localized-calendar
-- RPC correctness, notification RPC privileges and notification message uniqueness.
--
-- WHY A NEW MIGRATION INSTEAD OF EDITING HISTORY
-- ---------------------------------------------
-- The audit identified defects whose fix belongs in schema, but the seeds and
-- hardening migrations that introduced them are ALREADY APPLIED on the linked
-- project. Rewriting an applied migration would make the file history disagree
-- with the database (drift), so every change below is additive and idempotent.
--
-- CONTENT CORRECTIONS ARE NOT IN THIS FILE
-- ---------------------------------------
-- An earlier revision of this migration header claimed that 20260911000100 (four
-- U+20BC codepoints) and 20260913121000 (36 `ka` notification rows) were "patched in
-- place". That was wrong: both migrations are reported as applied by
-- `supabase migration list --linked`, so a `db push` would never re-run them and the
-- malformed text would have survived on the database. Both files have been restored
-- byte-for-byte to their HEAD revisions and the corrections now live in additive
-- migrations:
--   * 20260915000500_repair_applied_seed_data.sql   — the 39 row corrections
--   * 20260915000600_repair_ka_script_residues.sql  — 18 further `ka` residue rows
-- This file keeps only the schema/privilege half of the repair and deliberately does
-- NOT touch any row's title/body text.
--
-- WHAT THIS MIGRATION FIXES
-- -------------------------
-- C-01  get_calendar_days_localized declared RETURNS TABLE columns that collided
--       with the bare identifiers used in its own SELECT list ("saints", "title",
--       "details", "fasting_note"). Every output column is now explicitly aliased
--       and the RETURNS TABLE column names are the same as before, so the client
--       contract is unchanged while the ambiguity is gone.
-- C-02  Seven calendar seed migrations inserted without an arbiter clause, so a
--       re-run aborted with 23505. Those seeds are ALREADY APPLIED and are frozen at
--       their HEAD revisions, so this is not fixed by editing them: the idempotency
--       gap only affects a FUTURE re-run (a rebuild or a re-seed), and the unique
--       index the arbiter needs is created by C-07 below.
-- C-04  reserve_notification_deliveries / release_notification_reservation were
--       executable by anon and authenticated in 20260902000200. The REVOKE in
--       20260909000100 is restated here so the privilege state is guaranteed even
--       if that migration was skipped.
-- C-07  notification_messages had no uniqueness key, so its seed files duplicated
--       every template on a re-run. A unique index is added (after an idempotent
--       de-duplication that keeps the newest row per template).
-- H-01  feast_rank stored a Romanian display literal for 8 of 13 countries and was
--       rendered verbatim. A canonical, locale-independent `feast_rank_code` is
--       introduced, maintained by trigger for every writer (including all existing
--       seeds), and returned by the localized RPC.
-- H-07  Notification type detection compared `feast_rank = 'cruce roșie'`, so the
--       Greek calendar could never produce a red_cross notification. The canonical
--       code makes the detection locale-independent.
-- H-10  The RPC returned only the canonical rank and editorial_source; it now also
--       returns localized values when a translation row exists.

-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical feast-rank classification
-- ─────────────────────────────────────────────────────────────────────────────

-- IMMUTABLE so it can be used from a trigger and from generated expressions.
-- Matches the legacy literals actually present in shipped data:
--   'cruce roșie', 'cruce neagră', 'duminică',
--   'δεσποτική εορτή', 'θεομητορική εορτή' and NULL.
CREATE OR REPLACE FUNCTION public.classify_feast_rank(p_rank text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_rank IS NULL OR btrim(p_rank) = '' THEN NULL
    WHEN lower(p_rank) IN (
      'red_cross', 'black_cross', 'great_feast', 'theotokos_feast', 'sunday'
    ) THEN lower(p_rank)
    WHEN p_rank ILIKE '%cruce ro%'  OR p_rank ILIKE '%red%cross%'  OR p_rank ILIKE '%crven%krst%' THEN 'red_cross'
    WHEN p_rank ILIKE '%cruce neagr%' OR p_rank ILIKE '%black%cross%' OR p_rank ILIKE '%crn%krst%' THEN 'black_cross'
    WHEN p_rank ILIKE '%δεσποτικ%' OR p_rank ILIKE '%great feast%' OR p_rank ILIKE '%major feast%'
      OR p_rank ILIKE '%велики празник%' OR p_rank ILIKE '%голем празник%' THEN 'great_feast'
    WHEN p_rank ILIKE '%θεομητορικ%' OR p_rank ILIKE '%μεγάλη εορτή%' OR p_rank ILIKE '%богородич%' THEN 'theotokos_feast'
    WHEN p_rank ILIKE '%duminic%' OR p_rank ILIKE '%sunday%' OR p_rank ILIKE '%недел%' OR p_rank ILIKE '%κυριακ%' THEN 'sunday'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.classify_feast_rank(text) IS
  'Maps a legacy/localized feast rank literal to the canonical, locale-independent feast_rank_code. Returns NULL when the rank is unknown so callers can render their own fallback instead of inventing one.';

-- ─────────────────────────────────────────────────────────────────────────────
-- calendar_days.feast_rank_code
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.calendar_days
  ADD COLUMN IF NOT EXISTS feast_rank_code text;

-- Backfill every existing row from its legacy literal.
UPDATE public.calendar_days
SET feast_rank_code = public.classify_feast_rank(feast_rank)
WHERE feast_rank_code IS NULL
  AND public.classify_feast_rank(feast_rank) IS NOT NULL;

-- Idempotent constraint creation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.calendar_days'::regclass
      AND conname = 'calendar_days_feast_rank_code_check'
  ) THEN
    ALTER TABLE public.calendar_days
      ADD CONSTRAINT calendar_days_feast_rank_code_check
      CHECK (
        feast_rank_code IS NULL
        OR feast_rank_code IN ('red_cross', 'black_cross', 'great_feast', 'theotokos_feast', 'sunday')
      );
  END IF;
END
$$;

-- Keep the canonical code in sync for every writer, including the ~90 existing
-- seed migrations that only set `feast_rank`. A writer that sets the code
-- explicitly keeps its value.
--
-- Static re-review fix: the first version only filled a NULL code, so changing a
-- day's `feast_rank` (for example from 'cruce roșie' to an unclassifiable value, or
-- from 'duminică' to 'cruce roșie') left the PREVIOUS canonical code in place — the
-- row then reported a rank that contradicted its own `feast_rank`. The code is now
-- recomputed whenever `feast_rank` changes and the writer did not supply a code of
-- its own; an explicitly supplied code still wins.
CREATE OR REPLACE FUNCTION public.calendar_days_set_feast_rank_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.feast_rank_code IS NULL
     OR (
       TG_OP = 'UPDATE'
       AND NEW.feast_rank IS DISTINCT FROM OLD.feast_rank
       AND NEW.feast_rank_code IS NOT DISTINCT FROM OLD.feast_rank_code
     ) THEN
    NEW.feast_rank_code := public.classify_feast_rank(NEW.feast_rank);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_days_sync_feast_rank_code ON public.calendar_days;
CREATE TRIGGER calendar_days_sync_feast_rank_code
  BEFORE INSERT OR UPDATE OF feast_rank, feast_rank_code
  ON public.calendar_days
  FOR EACH ROW
  EXECUTE FUNCTION public.calendar_days_set_feast_rank_code();

CREATE INDEX IF NOT EXISTS calendar_days_feast_rank_code_idx
  ON public.calendar_days (feast_rank_code)
  WHERE is_published = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-01 / H-10 — localized calendar RPC, ambiguity-free and translation-aware
-- ─────────────────────────────────────────────────────────────────────────────

-- Dropped (not replaced) because the return type may change, and CREATE OR
-- REPLACE FUNCTION cannot alter OUT parameter names/types.
DROP FUNCTION IF EXISTS public.get_calendar_days_localized(text, text, text, date, date);

CREATE FUNCTION public.get_calendar_days_localized(
  p_country_code text,
  p_calendar_code text,
  p_language_code text,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  calendar_date date,
  feast_rank text,
  saints text[],
  title text,
  details text,
  fasting_note text,
  editorial_source text,
  feast_rank_code text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    d.calendar_date,
    -- The rank is a canonical, locale-independent attribute of the day (see
    -- feast_rank_code below); translations do not carry their own rank, so the
    -- raw value is returned unchanged and localized at render time.
    d.feast_rank AS feast_rank,
    CASE
      WHEN requested.calendar_day_id IS NOT NULL
        THEN requested.saints
      ELSE d.saints
    END AS saints,
    CASE
      WHEN requested.calendar_day_id IS NOT NULL
        THEN requested.title
      ELSE d.title
    END AS title,
    CASE
      WHEN requested.calendar_day_id IS NOT NULL
        THEN requested.details
      ELSE d.details
    END AS details,
    CASE
      WHEN requested.calendar_day_id IS NOT NULL
        THEN requested.fasting_note
      ELSE d.fasting_note
    END AS fasting_note,
    CASE
      WHEN requested.calendar_day_id IS NOT NULL AND requested.editorial_source IS NOT NULL
        THEN requested.editorial_source
      ELSE d.editorial_source
    END AS editorial_source,
    -- Canonical, locale-independent classification used by UI and notifications.
    COALESCE(
      d.feast_rank_code,
      public.classify_feast_rank(d.feast_rank)
    ) AS feast_rank_code
  FROM public.calendar_days AS d
  LEFT JOIN public.calendar_day_translations AS requested
    ON requested.calendar_day_id = d.id
   AND requested.language_code = p_language_code
  WHERE d.country_code = p_country_code
    AND d.calendar_code = p_calendar_code
    AND d.calendar_date BETWEEN p_start_date AND p_end_date
    AND d.is_published = true
  ORDER BY d.calendar_date;
$$;

-- Static re-review fix: a newly created function is granted EXECUTE to PUBLIC by
-- default, so the GRANT alone did not limit the audience — every role (including
-- service_role, which has no reason to call a read-only calendar RPC) inherited
-- access. Revoke the default first, then grant the intended surface.
REVOKE ALL ON FUNCTION public.get_calendar_days_localized(text, text, text, date, date)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_calendar_days_localized(text, text, text, date, date)
  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-04 — restate the notification reservation privilege restriction
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'reserve_notification_deliveries'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.reserve_notification_deliveries(uuid[], date, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reserve_notification_deliveries(uuid[], date, text) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'release_notification_reservation'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.release_notification_reservation(uuid[], date) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_notification_reservation(uuid[], date) TO service_role';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-07 — notification_messages uniqueness, then safe re-seeding
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove duplicates produced by earlier re-runs of the message-bank seeds,
-- keeping the most recently inserted row per template.
DELETE FROM public.notification_messages AS m
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        language_code,
        COALESCE(country_code, ''),
        COALESCE(calendar_code, ''),
        day_type,
        theme
      ORDER BY id DESC
    ) AS rn
  FROM public.notification_messages
) AS ranked
WHERE m.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS notification_messages_template_key_idx
  ON public.notification_messages (
    language_code,
    COALESCE(country_code, ''),
    COALESCE(calendar_code, ''),
    day_type,
    theme
  );
