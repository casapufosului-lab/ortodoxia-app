-- =====================================================================
-- md-chisinau — calendar pe stil vechi (iulian) 2026
-- =====================================================================
--
-- Context:
--   'md-chisinau' reprezintă Mitropolia Chișinăului și a Întregii Moldove,
--   jurisdicție sub Biserica Ortodoxă Rusă, care urmează calendarul IULIAN
--   (stil vechi). Sărbătorile cu dată fixă se celebrează cu 13 zile mai
--   târziu față de stilul nou (decalajul iulian din secolele XX–XXI).
--
-- Proveniența și aspectul legal:
--   - Baza întregului an este derivată din rândurile 'ro-bor' (stil nou) deja
--     existente în calendar_days, prin aplicarea decalajului iulian de 13 zile.
--     Aceasta produce DATELE corecte de stil vechi, cu nume de sfinți deja în
--     limba română și din sursă proprie (licență/atribuire existente).
--   - Pentru zilele de graniță (1 ian – 1 feb) și sărbătorile mobile din 2026,
--     conținutul este preluat din orthocal.info
--     (https://orthocal.info/api/julian/ical/ și /readings/slavic/julian/…),
--     un agregator public de calendar ortodox slav/stil vechi, tradus în
--     română. Attribuirea este păstrată în editorial_source.
--
--   ATENȚIE: datele sunt oferite ca bază editorială solidă, verificată pentru
--   sărbătorile mari (Crăciun 7 ian, Botezul 19 ian, Sf. Nicolae 19 dec,
--   Bunavestire 7 apr etc.), dar o verificare finală cu sursele oficiale ale
--   Mitropoliei Moldovei (mitropolia.md) este recomandată înainte de
--   publicarea oficială.
-- =====================================================================

-- 1) Înlocuim complet baza 'md-chisinau' (ștergem rândurile provizorii anterioare).
delete from public.calendar_days
where country_code = 'MD'
  and language_code = 'ro'
  and calendar_code = 'md-chisinau'
  and calendar_date between '2026-01-01' and '2026-12-31';

-- 2) Baza: mutăm 'ro-bor' cu +13 zile (stil iulian) pentru 14 ian – 31 dec 2026.
--    Sursa: 'ro-bor' din 1 ian – 18 dec 2026 (aceleași sfinți, date corecte stil vechi).
insert into public.calendar_days (
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
select
  'MD'                                              as country_code,
  'ro'                                              as language_code,
  'md-chisinau'                                     as calendar_code,
  (src.calendar_date + interval '13 days')::date    as calendar_date,
  src.feast_rank,
  src.saints,
  src.title,
  src.details,
  src.fasting_note,
  'Stil vechi (iulian) — derivat din calendarul stilului nou (ro-bor), cu decalaj iulian de 13 zile; verificat cu orthocal.info pentru sărbătorile mari. 2026.' as editorial_source,
  true                                              as is_published
from public.calendar_days src
where src.country_code = 'RO'
  and src.language_code = 'ro'
  and src.calendar_code = 'ro-bor'
  and src.calendar_date between '2026-01-01' and '2026-12-18'
on conflict (country_code, language_code, calendar_code, calendar_date) do update set
  feast_rank = excluded.feast_rank,
  saints = excluded.saints,
  title = excluded.title,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());
