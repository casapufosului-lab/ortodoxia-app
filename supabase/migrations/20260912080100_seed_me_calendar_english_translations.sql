begin;

do $$
declare
  native_count integer;
begin
  select count(*)
    into native_count
  from public.calendar_days
  where country_code = 'ME'
    and calendar_code = 'me-metropolitanate-montenegro-littoral'
    and language_code = 'sr'
    and calendar_date between date '2026-01-01' and date '2026-12-31';

  if native_count <> 365 then
    raise exception 'Expected 365 native ME rows; found %', native_count;
  end if;
end
$$;

insert into public.calendar_day_translations (
  calendar_day_id,
  language_code,
  title,
  saints,
  details,
  fasting_note
)
select
  me.id,
  'en',
  t.title,
  t.saints,
  t.details,
  t.fasting_note
from public.calendar_days me
join public.calendar_days rs
  on rs.country_code = 'RS'
 and rs.calendar_code = 'rs-serbian-orthodox-church'
 and rs.language_code = 'sr'
 and rs.calendar_date = me.calendar_date
join public.calendar_day_translations t
  on t.calendar_day_id = rs.id
 and t.language_code = 'en'
where me.country_code = 'ME'
  and me.calendar_code = 'me-metropolitanate-montenegro-littoral'
  and me.language_code = 'sr'
  and me.calendar_date between date '2026-01-01' and date '2026-12-31'
on conflict (calendar_day_id, language_code) do update set
  title = excluded.title,
  saints = excluded.saints,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  updated_at = timezone('utc', now());

do $$
declare
  translation_count integer;
begin
  select count(*)
    into translation_count
  from public.calendar_days d
  join public.calendar_day_translations t on t.calendar_day_id = d.id
  where d.country_code = 'ME'
    and d.calendar_code = 'me-metropolitanate-montenegro-littoral'
    and d.language_code = 'sr'
    and d.calendar_date between date '2026-01-01' and date '2026-12-31'
    and t.language_code = 'en';

  if translation_count <> 365 then
    raise exception 'Expected 365 ME English translations; found %', translation_count;
  end if;
end
$$;

commit;
