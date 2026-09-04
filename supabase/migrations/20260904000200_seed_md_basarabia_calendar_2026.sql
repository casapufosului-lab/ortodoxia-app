-- CONTENT-B3A: Seed Moldova Basarabia calendar 2026
--
-- Source: RO / ro / ro-bor / 2026 (validated local calendar)
-- Target: MD / ro / md-basarabia / 2026
--
-- Uses INSERT … SELECT from the existing validated RO-BOR 2026 calendar rows.
-- Only overrides: country_code, language_code, calendar_code, editorial_source.
-- Does NOT modify, update, or delete any RO row.

INSERT INTO public.calendar_days (
  country_code,
  language_code,
  calendar_code,
  calendar_date,
  feast_rank,
  saints,
  title,
  details,
  fasting_note,
  editorial_source,
  is_published
)
SELECT
  'MD',
  'ro',
  'md-basarabia',
  calendar_date,
  feast_rank,
  saints,
  title,
  details,
  fasting_note,
  'Compilație proprie Ortodoxia, 2026 · Mitropolia Basarabiei / BOR',
  is_published
FROM public.calendar_days
WHERE country_code = 'RO'
  AND language_code = 'ro'
  AND calendar_code = 'ro-bor'
  AND calendar_date >= '2026-01-01'
  AND calendar_date <= '2026-12-31'
ON CONFLICT (country_code, language_code, calendar_code, calendar_date)
DO UPDATE SET
  feast_rank = EXCLUDED.feast_rank,
  saints = EXCLUDED.saints,
  title = EXCLUDED.title,
  details = EXCLUDED.details,
  fasting_note = EXCLUDED.fasting_note,
  editorial_source = EXCLUDED.editorial_source,
  is_published = EXCLUDED.is_published,
  updated_at = timezone('utc', now());
