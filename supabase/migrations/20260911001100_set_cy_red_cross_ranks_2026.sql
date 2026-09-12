begin;

-- The Cyprus source calendar marks red-letter days with a leading dagger (†)
-- in the original Greek title. English translations do not carry that marker,
-- so persist it in feast_rank for the app UI and notifications.
update public.calendar_days
set feast_rank = 'cruce roșie',
    updated_at = timezone('utc', now())
where country_code = 'CY'
  and calendar_code = 'cy-church-of-cyprus'
  and language_code = 'el'
  and calendar_date between '2026-01-01'::date and '2026-12-31'::date
  and title like '†%';

do $$
declare
  red_count integer;
begin
  select count(*)
    into red_count
  from public.calendar_days
  where country_code = 'CY'
    and calendar_code = 'cy-church-of-cyprus'
    and language_code = 'el'
    and calendar_date between '2026-01-01'::date and '2026-12-31'::date
    and title like '†%'
    and feast_rank = 'cruce roșie';

  if red_count <> 130 then
    raise exception 'Expected 130 CY red-cross feast ranks; found %', red_count;
  end if;
end
$$;

commit;
