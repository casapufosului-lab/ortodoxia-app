begin;

-- Source: Orthodox Church of Ukraine official calendar 2026 summary.
-- Includes Pascha, the Twelve Great Feasts, and the listed Great Feasts.

create temporary table ua_great_feasts_2026 (
  calendar_date date primary key
) on commit drop;

insert into ua_great_feasts_2026 (calendar_date)
values
  ('2026-01-01'::date),
  ('2026-01-06'::date),
  ('2026-02-02'::date),
  ('2026-03-25'::date),
  ('2026-04-05'::date),
  ('2026-04-12'::date),
  ('2026-05-21'::date),
  ('2026-05-31'::date),
  ('2026-06-24'::date),
  ('2026-06-29'::date),
  ('2026-08-06'::date),
  ('2026-08-15'::date),
  ('2026-08-29'::date),
  ('2026-09-08'::date),
  ('2026-09-14'::date),
  ('2026-10-01'::date),
  ('2026-11-21'::date),
  ('2026-12-25'::date)
;

do $$
declare
  matched_count integer;
begin
  select count(*)
    into matched_count
  from public.calendar_days d
  join ua_great_feasts_2026 g on g.calendar_date = d.calendar_date
  where d.country_code = 'UA'
    and d.calendar_code = 'ua-orthodox-church-of-ukraine'
    and d.language_code = 'uk'
    and d.is_published = true;

  if matched_count <> 18 then
    raise exception 'Expected 18 UA great-feast calendar rows; found %', matched_count;
  end if;
end
$$;

update public.calendar_days d
set feast_rank = 'cruce roșie',
    updated_at = timezone('utc', now())
from ua_great_feasts_2026 g
where d.calendar_date = g.calendar_date
  and d.country_code = 'UA'
  and d.calendar_code = 'ua-orthodox-church-of-ukraine'
  and d.language_code = 'uk';

do $$
declare
  red_count integer;
begin
  select count(*)
    into red_count
  from public.calendar_days d
  join ua_great_feasts_2026 g on g.calendar_date = d.calendar_date
  where d.country_code = 'UA'
    and d.calendar_code = 'ua-orthodox-church-of-ukraine'
    and d.language_code = 'uk'
    and d.feast_rank = 'cruce roșie';

  if red_count <> 18 then
    raise exception 'Expected 18 UA red-cross feast ranks; found %', red_count;
  end if;
end
$$;

commit;
