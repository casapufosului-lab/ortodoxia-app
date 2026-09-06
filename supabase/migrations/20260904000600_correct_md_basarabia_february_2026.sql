-- CONTENT-B3A-FEB: Correct the Moldova Basarabia February 2026 calendar
--
-- Mitropolia Basarabiei uses the old-style (Julian) calendar. The initial seed
-- (20260904000200) copied the RO-BOR new-style rows verbatim, which put the
-- wrong fixed feasts on the February civil dates. This migration replaces the
-- February rows with the correct old-style content.
--
-- Mapping method (same verified relationship as January, NOT a blanket +13 shift):
--   MD civil date = Julian liturgical date + 13 days
--   RO-BOR new-style civil date = the same Julian liturgical date
--   Therefore MD civil date N  <->  RO-BOR source date (N - 13):
--     RO Jan 19 → MD Feb 1 ; RO Jan 31 → MD Feb 13
--     RO Feb  1 → MD Feb 14 ; RO Feb 15 → MD Feb 28
--
-- Fixed feasts/saints are taken from the RO-BOR new-style factual equivalents
-- (verified against independent old-style 2026 sources for the key dates below).
-- Weekday-dependent content is derived for the TARGET civil dates:
--   * Sundays (Feb 1, 8, 15, 22) carry their Triodion title and 'cruce roșie':
--       Feb 1  Duminica Vameșului și a Fariseului
--       Feb 8  Duminica Întoarcerii Fiului risipitor
--       Feb 15 Duminica Înfricoșătoarei Judecăți (a Lăsatului sec de carne) —
--              coinciding with Întâmpinarea Domnului (Julian Feb 2)
--       Feb 22 Duminica Izgonirii lui Adam din Rai (a Lăsatului sec de brânză) —
--              coinciding with Odovania Întâmpinării (Julian Feb 9)
--   * Non-Sundays carry NO Sunday label (the RO sources' Sunday labels that
--     would land here on a weekday are stripped).
--   * Memorial Saturdays re-derived for the target civil dates:
--       Feb 14 Sâmbăta celor adormiți - Moșii de iarnă (before Meatfare)
--       Feb 21 Sâmbăta Sfinților Cuvioși (before Cheesefare)
--   * Fasting notes re-derived for the target civil weekdays:
--       Feb 1-7  fast-free week (Publican & Pharisee)            → no note
--       Feb 11,13 Wed/Fri fast restored (Prodigal Son week)      → 'Post'
--       Feb 16-21 Meatfare week (meat cut, dairy allowed)        → no note
--       Feb 23-28 first week of Great Lent (Clean Monday +)      → 'Post'
--   * Feast ranks re-derived: 'cruce roșie' only for the four Sundays,
--     Întâmpinarea Domnului (Feb 15) and Sfinții Trei Ierarhi (Feb 12);
--     all other days 'cruce neagră'.
--
-- Scope: MD / ro / md-basarabia, 2026-02-01 .. 2026-02-28 ONLY.
-- Does NOT modify RO rows, any other calendar, January, March-December, or any
-- historical migration. No official Diocese/Church authority verification is
-- claimed by this migration.

BEGIN;

-- 1. Remove the incorrect February entries created by the original seed.
DELETE FROM public.calendar_days
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date >= '2026-02-01'
  AND calendar_date <= '2026-02-28';

-- 2. Insert the corrected February entries.
-- Columns: (country_code, language_code, calendar_code, calendar_date,
--           feast_rank, saints, title, details, fasting_note, editorial_source, is_published)
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
VALUES
  ('MD', 'ro', 'md-basarabia', '2026-02-01', 'cruce roșie', array[]::text[], 'Sf. Cuv. Macarie cel Mare și Macarie Alexandrinul; Sf. Ier. Marcu, mitropolitul Efesului; Sf. Mc. Eufrasia; Duminica Vameșului și a Fariseului', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-02', 'cruce neagră', array[]::text[], 'Sf. Cuv. Eftimie cel Mare; Sf. Mc. In, Pin și Rim; Sf. Mc. Eusebiu', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-03', 'cruce neagră', array[]::text[], 'Sf. Cuv. Maxim Mărturisitorul; Sf. Mc. Neofit; Sf. Mc. Agnia din Roma', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-04', 'cruce neagră', array[]::text[], 'Sf. Ap. Timotei; Sf. Cuv. Mc. Anastasie Persul', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-05', 'cruce neagră', array[]::text[], 'Sf. Sfințit Mc. Clement, episcopul Ancirei; Sf. Mc. Agatanghel; Sf. Părinți de la Sinodul al VI-lea Ecumenic', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-06', 'cruce neagră', array[]::text[], 'Sf. Cuv. Xenia din Roma; Sf. Xenia din Petersburg (Tedeum)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-07', 'cruce neagră', array[]::text[], 'Sf. Ier. Grigorie Teologul, arhiepiscopul Constantinopolului; †) Sf. Ier. Bretanion, episcopul Tomisului', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-08', 'cruce roșie', array[]::text[], 'Sf. Ier. Iosif cel Milostiv, mitropolitul Moldovei; Sf. Cuv. Xenofont, Maria, Arcadie și Ioan; Duminica Întoarcerii Fiului risipitor', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-09', 'cruce neagră', array[]::text[], 'Aducerea moaștelor Sf. Ier. Ioan Gură de Aur', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-10', 'cruce neagră', array[]::text[], 'Sf. Cuv. Efrem Sirul, Isaac Sirul, Paladie și Iacob Sihastrul', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-11', 'cruce neagră', array[]::text[], 'Aducerea moaștelor Sf. Sfințit Mc. Ignatie Teoforul; Sf. Mc. Filotei', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-12', 'cruce roșie', array[]::text[], 'Sfinții Trei Ierarhi: Vasile cel Mare, Grigorie Teologul și Ioan Gură de Aur; Sf. Sfințit Mc. Ipolit, episcopul Romei', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-13', 'cruce neagră', array[]::text[], 'Sf. Mc. doctori fără de arginți Chir și Ioan', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-14', 'cruce neagră', array[]::text[], 'Înainte-prăznuirea Întâmpinării Domnului; Sf. Mc. Trifon; Sf. Mc. Perpetua şi Felicitas (Sâmbăta celor adormiți - Moșii de iarnă)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
('MD', 'ro', 'md-basarabia', '2026-02-15', 'cruce roșie', array[]::text[], 'Întâmpinarea Domnului; Duminica Înfricoșătoarei Judecăți (a Lăsatului sec de carne)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-16', 'cruce neagră', array[]::text[], 'Sf. și Dreptul Simeon, primitorul de Dumnezeu; Sf. Prorociță Ana', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-17', 'cruce neagră', array[]::text[], 'Sf. Cuv. Isidor Pelusiotul; Sf. Sfinţit Mc. Avramie (Harți)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-18', 'cruce neagră', array[]::text[], 'Sf. Mc. Agata și Teodula', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-19', 'cruce neagră', array[]::text[], 'Sf. Ier. Vucol, episcopul Smirnei, şi Fotie, patriarhul Constantinopolului; Sf. Cuv. Varsanufie cel Mare și Ioan din Gaza (Harți)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-20', 'cruce neagră', array[]::text[], 'Sf. Ier. Partenie, episcopul Lampsacului; Sf. Cuv. Luca din Elada', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-21', 'cruce neagră', array[]::text[], 'Sf. Mare Mc. Teodor Stratilat; Sf. Proroc Zaharia (Sâmbăta Sfinților Cuvioși)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-22', 'cruce roșie', array[]::text[], 'Odovania praznicului Întâmpinării Domnului; Sf. Mc. Nichifor; Duminica Izgonirii lui Adam din Rai (a Lăsatului sec de brânză)', NULL, NULL, 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-23', 'cruce neagră', array[]::text[], 'Sf. Sfințit Mc. Haralambie; Sf. Mc. Valentina (Începutul Postului Sfintelor Paști. Zi aliturgică)', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-24', 'cruce neagră', array[]::text[], 'Sf. Sfințit Mc. Vlasie, episcopul Sevastiei; Sf. Teodora împărăteasa', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-25', 'cruce neagră', array[]::text[], 'Sf. Ier. Meletie, arhiepiscopul Antiohiei; Sf. Mc. Hristea', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-26', 'cruce neagră', array[]::text[], 'Sf. Cuv. Martinian; Sf. Ap. Acvila și soția sa, Priscila; Sf. Ier. Evloghie, patriarhul Alexandriei', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-27', 'cruce neagră', array[]::text[], 'Sf. Cuv. Auxentie, Maron şi Avraam', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true),
  ('MD', 'ro', 'md-basarabia', '2026-02-28', 'cruce neagră', array[]::text[], 'Sf. Ap. Onisim; Sf. Mc. Maior', NULL, 'Post', 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice', true)
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

COMMIT;