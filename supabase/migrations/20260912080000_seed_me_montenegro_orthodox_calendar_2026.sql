begin;

-- Metropolitanate of Montenegro and the Littoral calendar 2026.
-- The Metropolitanate is an eparchy of the Serbian Orthodox Church, so it follows
-- the Serbian Orthodox Church liturgical calendar already validated for 2026.
-- Official Montenegro source: https://mitropolija.com/
-- Source calendar copied from: rs-serbian-orthodox-church.

delete from public.calendar_day_translations t
using public.calendar_days d
where t.calendar_day_id = d.id
  and d.country_code = 'ME'
  and d.calendar_code = 'me-metropolitanate-montenegro-littoral'
  and d.calendar_date between date '2026-01-01' and date '2026-12-31';

delete from public.calendar_days
where country_code = 'ME'
  and calendar_code = 'me-metropolitanate-montenegro-littoral'
  and calendar_date between date '2026-01-01' and date '2026-12-31';

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
  'ME',
  'sr',
  'me-metropolitanate-montenegro-littoral',
  calendar_date,
  feast_rank,
  saints,
  title,
  details,
  fasting_note,
  'Metropolitanate of Montenegro and the Littoral follows the Serbian Orthodox Church liturgical calendar; seeded from validated rs-serbian-orthodox-church 2026 calendar. Official portal: https://mitropolija.com/',
  is_published
from public.calendar_days
where country_code = 'RS'
  and calendar_code = 'rs-serbian-orthodox-church'
  and language_code = 'sr'
  and calendar_date between date '2026-01-01' and date '2026-12-31'
order by calendar_date;

do $$
declare
  row_count integer;
  unique_count integer;
  first_date date;
  last_date date;
begin
  select count(*), count(distinct calendar_date), min(calendar_date), max(calendar_date)
    into row_count, unique_count, first_date, last_date
  from public.calendar_days
  where country_code = 'ME'
    and calendar_code = 'me-metropolitanate-montenegro-littoral'
    and language_code = 'sr'
    and calendar_date between date '2026-01-01' and date '2026-12-31';

  if row_count <> 365 or unique_count <> 365 or first_date <> date '2026-01-01' or last_date <> date '2026-12-31' then
    raise exception 'Invalid ME calendar coverage: rows %, unique %, first %, last %', row_count, unique_count, first_date, last_date;
  end if;
end
$$;

commit;
