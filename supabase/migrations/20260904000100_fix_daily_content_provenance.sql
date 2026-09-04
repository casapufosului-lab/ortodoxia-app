-- CONTENT-B1C: Fix daily_content provenance for 2026-08-30
--
-- Targets: public.daily_content WHERE country_code = 'RO' AND language_code = 'ro' AND content_date = '2026-08-30'
--
-- Updated fields ONLY:
--   verse_text     — standardised to Biblia Liberă (ronbl) wording
--   verse_source   — standardised to include translation attribution
--   parable_text   — replaced with project editorial wording
--   editorial_source — explicit upstream + editorial provenance
--
-- NOT updated: content_date, parable_title, country_code, language_code,
--              is_published, created_at, updated_at (trigger-handled)
--
UPDATE public.daily_content
SET
  verse_text     = 'Piatra pe care au respins-o zidarii a fost numit șef de colț. Aceasta a fost de la Domnul. Este minunat în ochii noștri.',
  verse_source   = 'Matei 21, 42 · Biblia Liberă (ronbl)',
  parable_text   = 'Pilda arată că omul răspunde pentru felul în care folosește ceea ce i-a fost încredințat și pentru roadele vieții sale.',
  editorial_source = 'Biblia Liberă (ronbl, eBible.org, Public Domain) · reflecție editorială proprie Ortodoxia, 2026'
WHERE
  country_code  = 'RO'
  AND language_code = 'ro'
  AND content_date  = '2026-08-30';
