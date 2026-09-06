-- CONTENT-B3A-JAN-FIX: Correct Moldova Basarabia January 2026 movable observances
--
-- Follows up 20260904000200 (seed) and 20260904000300 (date-shift correction).
-- The January mapping is confirmed factually correct for fixed feasts, but the
-- date-shift carried over weekday-dependent content from the RO-BOR source:
--   * "Duminica" (Sunday) titles landed on civil weekdays;
--   * fasting annotations were copied without re-deriving the target weekday.
--
-- Corrections below are based on independent old-style (Julian) 2026 evidence
-- (orthocal.info Julian API) and the calendar's own convention that every
-- Sunday carries 'cruce roșie'. No official Mitropolia Basarabiei verification
-- is claimed. Fixed saints are left unchanged.
--
-- Scope: MD / ro / md-basarabia, January 2026 ONLY.
-- Does NOT modify RO rows, md-chisinau, or any February-December day.

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Muceniță Evloghia de la Samurcășești; Sf. Mc. Bonifatie; Sf. Aglaia; Sf. Ier. Grichentie, episcopul Etiopiei',
  feast_rank = 'cruce neagră',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-01';

UPDATE public.calendar_days
SET
  title = 'Înainte-prăznuirea Naşterii Domnului; Sf. Sfinţit Mc. Ignatie Teoforul, episcopul Antiohiei; †) Sf. Cuv. Serafim cel Răbdător de la Sâmbăta de Sus',
  feast_rank = 'cruce neagră',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-02';

UPDATE public.calendar_days
SET
  title = 'Sf. Ier. Petru Movilă, mitropolitul Kievului; Sf. Mare Mc. Anastasia; Duminica dinaintea Naşterii Domnului (a Sf. Părinţi după trup ai Domnului)',
  feast_rank = 'cruce roșie',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-04';

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Antonina de la Tismana; Sfinţii 10 Mucenici din Creta; Sf. Ier. Pavel, arhiepiscopul Neocezareei',
  feast_rank = 'cruce neagră',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-05';

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Mc. Eugenia (Ajunul Crăciunului. Post)',
  feast_rank = 'cruce neagră',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-06';

UPDATE public.calendar_days
SET
  title = 'Sf. Ap., întâiul Mc. şi Arhidiacon Ştefan; Sf. Cuv. Teodor Mărturisitorul',
  feast_rank = 'cruce neagră',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-09';

UPDATE public.calendar_days
SET
  title = 'Sfinții 14.000 de prunci uciși din porunca lui Irod; Sf. Cuv. Marcel și Tadeu; Duminica după Nașterea Domnului (a Sfinților Iosif Logodnicul, David Prorocul și Iacob, rudenia Domnului)',
  feast_rank = 'cruce roșie',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-11';

UPDATE public.calendar_days
SET
  title = 'Soborul Sf. 70 de Apostoli; Sf. Cuv. Teoctist din Sicilia, Nichifor cel Lepros și Apolinaria',
  feast_rank = 'cruce neagră',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-17';

UPDATE public.calendar_days
SET
  title = 'Sf. Mc. Teopempt și Teonas; Sf. Cuv. Sinclitichia (Ajunul Botezului Domnului. Post); Duminica dinaintea Botezului Domnului',
  feast_rank = 'cruce roșie',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-18';

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Gheorghe Hozevitul; Sf. Cuv. Domnica',
  feast_rank = 'cruce neagră',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-21';

UPDATE public.calendar_days
SET
  title = 'Sf. Ier. Grigorie, episcopul Nyssei; †) Sf. Cuv. Antipa de la Calapodești; Sf. Ier. Dometian, episcopul Melitinei',
  feast_rank = 'cruce neagră',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-23';

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Teodosie, începătorul vieţii călugăreşti de obşte din Palestina; Sf. Cuv. Vitalie',
  feast_rank = 'cruce neagră',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-24';

UPDATE public.calendar_days
SET
  title = 'Sf. Mc. Tatiana diaconița și Eutasia; Duminica după Botezul Domnului',
  feast_rank = 'cruce roșie',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-25';

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Pavel Tebeul și Ioan Colibașul',
  feast_rank = 'cruce neagră',
  fasting_note = 'Post'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-28';

UPDATE public.calendar_days
SET
  title = 'Sf. Cuv. Antonie cel Mare; Sf. Cuv. Antonie cel Nou din Veria',
  feast_rank = 'cruce neagră',
  fasting_note = 'Dezlegare la pește'
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-30';

UPDATE public.calendar_days
SET
  title = 'Sf. Ier. Atanasie şi Chiril, arhiepiscopii Alexandriei',
  feast_rank = 'cruce neagră',
  fasting_note = NULL
WHERE country_code = 'MD'
  AND language_code = 'ro'
  AND calendar_code = 'md-basarabia'
  AND calendar_date = '2026-01-31';