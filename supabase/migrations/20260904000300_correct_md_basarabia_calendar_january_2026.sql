-- CONTENT-B3A: Correct Moldova Basarabia January 2026 calendar
--
-- The initial seed (20260904000200) copied RO-BOR calendar dates directly
-- into md-basarabia without shifting for the old-style (Julian) calendar
-- used by Mitropolia Basarabiei.
--
-- For January, fixed feasts must be mapped from the new-style Romanian
-- calendar to the old-style (Julian) calendar. A blanket +13 days does NOT
-- work because RO Dec 25 + 13d = 2027-01-07 (wrong year).
--
-- The correct manual mapping uses two source date ranges from the RO
-- calendar, each with a different year-safe formula:
--   RO 2026 Dec 19-31 → MD 2026 Jan 1-13   (day_of_month − 18)
--   RO 2026 Jan 1-18  → MD 2026 Jan 14-31  (day_of_month + 13)
--
-- Key dates verified:
--   RO Dec 25 → MD Jan 7   (Nașterea Domnului / Christmas)
--   RO Jan 1  → MD Jan 14  (Tăierea-împrejur / Circumcision + Sf. Vasile)
--   RO Jan 6  → MD Jan 19  (Botezul Domnului / Theophany)
--
-- Does NOT modify, update, or delete any RO row.

-- 1. Remove incorrect January entries (created by the original seed)
DELETE FROM public.calendar_days
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date >= '2026-01-01'
  AND calendar_date <= '2026-01-31';

-- 2. Insert corrected January entries with manual date mapping from RO source
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
  make_date(2026, 1,
    CASE
      WHEN extract(month from calendar_date) = 12
        THEN extract(day from calendar_date)::int - 18
      ELSE
        extract(day from calendar_date)::int + 13
    END
  ),
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
  AND (
    (calendar_date >= '2026-12-19' AND calendar_date <= '2026-12-31')
    OR
    (calendar_date >= '2026-01-01' AND calendar_date <= '2026-01-18')
  )
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
