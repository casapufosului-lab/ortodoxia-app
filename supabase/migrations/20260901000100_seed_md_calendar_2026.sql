-- =====================================================================
-- Seed pentru calendarul Republicii Moldova — variantele md-basarabia și md-chisinau
-- =====================================================================
--
-- Context:
--   Aplicația expune trei calendare bisericești (vezi src/i18n/config.ts):
--     - 'ro-bor'          (RO, stil nou, Patriarhia Română)
--     - 'md-basarabia'    (MD, Mitropolia Basarabiei, sub Patriarhia Română)
--     - 'md-chisinau'     (MD, Mitropolia Chișinăului și a Întregii Moldove, sub Biserica Ortodoxă Rusă)
--
--   Acest fișier creează baza de 365 de zile pentru ambele variante MD,
--   derivând conținutul din rândurile 'ro-bor' deja existente în tabelul
--   calendar_days (acoperire completă: 2026-01-01 … 2026-12-31).
--
--   ATENȚIE privind corectitudinea datelor:
--     - 'md-basarabia' urmează stilul nou (calendarul Patriarhiei Române),
--       deci conținutul de bază este aliniat cu 'ro-bor' (rezonabil din punct
--       de vedere faptic).
--     - 'md-chisinau' urmează stilul vechi (calendarul iulian). Conținutul de
--       bază derivat din 'ro-bor' (stil nou) este DOAR un punct de plecare
--       proiectat structural și este marcat ca provizoriu. Conversia corectă
--       la stilul vechi (decalaj de 13 zile + maparea corectă a sfinților și
--       sărbătorilor pentru fiecare dată iuliană) trebuie făcută pe baza
--       datelor oficiale sau OCMA-API, apoi verificată editorial înainte de
--       publicare.
--
--   Agenția sursei (licența MIT / OCMA-API):
--     Planul de produs prevede importul calendarului din OCMA-API
--     (https://gitlab.com/orthodox-calendar-map-atlas/ocma-api, licență MIT),
--     cu atribuirea sursei în aplicație. Până la importul datelor OCMA reale,
--     baza MD rămasă aici poartă editorial_source care indică proveniența
--     provizorie, astfel încât să poată fi înlocuită/verificată ulterior.
-- =====================================================================

-- 1) Bază pentru 'md-basarabia' (stil nou — aliniat cu Patriarhia Română).
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
  'MD'                       as country_code,
  'ro'                       as language_code,
  'md-basarabia'             as calendar_code,
  src.calendar_date          as calendar_date,
  src.feast_rank,
  src.saints,
  src.title,
  src.details,
  src.fasting_note,
  'Bază provizorie derivată din Calendarul Patriarhiei Române (stil nou), 2026. De verificat/înlocuit cu OCMA-API (licență MIT).' as editorial_source,
  true                       as is_published
from public.calendar_days src
where src.country_code = 'RO'
  and src.language_code = 'ro'
  and src.calendar_code = 'ro-bor'
  and src.calendar_date between '2026-01-01' and '2026-12-31'
on conflict (country_code, language_code, calendar_code, calendar_date) do update set
  feast_rank = excluded.feast_rank,
  saints = excluded.saints,
  title = excluded.title,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());

-- 2) Bază pentru 'md-chisinau' (stil vechi — PROVIZORIU, necesită verificare).
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
  'MD'                       as country_code,
  'ro'                       as language_code,
  'md-chisinau'              as calendar_code,
  src.calendar_date          as calendar_date,
  src.feast_rank,
  src.saints,
  src.title,
  src.details,
  src.fasting_note,
  'PROVIZORIU — bază structurală derivată din calendarul stilului nou; conversia la stilul vechi (iulian) și verificarea cu sursele oficiale sunt în curs (plan OCMA-API, licență MIT).' as editorial_source,
  true                       as is_published
from public.calendar_days src
where src.country_code = 'RO'
  and src.language_code = 'ro'
  and src.calendar_code = 'ro-bor'
  and src.calendar_date between '2026-01-01' and '2026-12-31'
on conflict (country_code, language_code, calendar_code, calendar_date) do update set
  feast_rank = excluded.feast_rank,
  saints = excluded.saints,
  title = excluded.title,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());
