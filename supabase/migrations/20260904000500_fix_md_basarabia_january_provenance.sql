-- CONTENT-B3A-JAN-PROVENANCE-FIX: Correct the January 2026 editorial provenance
--
-- The January MD / ro / md-basarabia rows inherited an editorial_source that
-- implied the regional/national Church authorities directly produced or
-- verified the calendar. The factual audit did NOT obtain an official 2026
-- calendar from those authorities, so that provenance overstated the evidence
-- actually used.
--
-- This migration restores a factual provenance statement for January 2026 ONLY.
-- No calendar content, saints, titles, ranks, dates, or fasting rules change.
-- Scope: MD / ro / md-basarabia, 2026-01-01 .. 2026-01-31. No other calendars,
-- months, or rows are touched.

UPDATE public.calendar_days
SET editorial_source = 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date >= '2026-01-01'
  AND calendar_date <= '2026-01-31';