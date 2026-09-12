begin;

-- Source: Serbian Orthodox Church · Diocese of Austria
-- https://kalendar.eparhija.at/2026
-- Only days classified as "Велики празник / Great feast" receive red-cross rank.

create temporary table rs_great_feasts_2026 (
  calendar_date date primary key
) on commit drop;

insert into rs_great_feasts_2026 (calendar_date)
values
  ('2026-01-07'::date),
  ('2026-01-08'::date),
  ('2026-01-09'::date),
  ('2026-01-14'::date),
  ('2026-01-19'::date),
  ('2026-01-20'::date),
  ('2026-01-27'::date),
  ('2026-02-12'::date),
  ('2026-02-15'::date),
  ('2026-04-05'::date),
  ('2026-04-07'::date),
  ('2026-04-10'::date),
  ('2026-04-12'::date),
  ('2026-04-13'::date),
  ('2026-04-14'::date),
  ('2026-05-06'::date),
  ('2026-05-12'::date),
  ('2026-05-21'::date),
  ('2026-05-24'::date),
  ('2026-05-31'::date),
  ('2026-06-01'::date),
  ('2026-06-02'::date),
  ('2026-06-03'::date),
  ('2026-06-28'::date),
  ('2026-07-07'::date),
  ('2026-07-12'::date),
  ('2026-08-02'::date),
  ('2026-08-19'::date),
  ('2026-08-28'::date),
  ('2026-09-11'::date),
  ('2026-09-21'::date),
  ('2026-09-27'::date),
  ('2026-10-27'::date),
  ('2026-10-31'::date),
  ('2026-11-08'::date),
  ('2026-11-21'::date),
  ('2026-12-04'::date),
  ('2026-12-19'::date)
;

do $$
declare
  matched_count integer;
begin
  select count(*)
    into matched_count
  from public.calendar_days d
  join rs_great_feasts_2026 g on g.calendar_date = d.calendar_date
  where d.country_code = 'RS'
    and d.calendar_code = 'rs-serbian-orthodox-church'
    and d.language_code = 'sr'
    and d.is_published = true;

  if matched_count <> 38 then
    raise exception 'Expected 38 RS great-feast calendar rows; found %', matched_count;
  end if;
end
$$;

update public.calendar_days d
set feast_rank = 'cruce roșie',
    updated_at = timezone('utc', now())
from rs_great_feasts_2026 g
where d.calendar_date = g.calendar_date
  and d.country_code = 'RS'
  and d.calendar_code = 'rs-serbian-orthodox-church'
  and d.language_code = 'sr';

do $$
declare
  red_count integer;
begin
  select count(*)
    into red_count
  from public.calendar_days d
  join rs_great_feasts_2026 g on g.calendar_date = d.calendar_date
  where d.country_code = 'RS'
    and d.calendar_code = 'rs-serbian-orthodox-church'
    and d.language_code = 'sr'
    and d.feast_rank = 'cruce roșie';

  if red_count <> 38 then
    raise exception 'Expected 38 RS red-cross feast ranks; found %', red_count;
  end if;
end
$$;

commit;