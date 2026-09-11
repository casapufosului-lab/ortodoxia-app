grant select on public.calendar_day_translations to anon, authenticated;

create or replace function public.get_calendar_days_localized(
  p_country_code text,
  p_calendar_code text,
  p_language_code text,
  p_start_date date,
  p_end_date date
)
returns table (
  calendar_date date,
  feast_rank text,
  saints text[],
  title text,
  details text,
  fasting_note text,
  editorial_source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.calendar_date,
    d.feast_rank,
    case when requested.calendar_day_id is not null then requested.saints else coalesce(source_text.saints, d.saints) end,
    case when requested.calendar_day_id is not null then requested.title else coalesce(source_text.title, d.title) end,
    case when requested.calendar_day_id is not null then requested.details else coalesce(source_text.details, d.details) end,
    case when requested.calendar_day_id is not null then requested.fasting_note else coalesce(source_text.fasting_note, d.fasting_note) end,
    d.editorial_source
  from public.calendar_days d
  left join public.calendar_day_translations requested
    on requested.calendar_day_id = d.id and requested.language_code = p_language_code
  left join public.calendar_day_translations source_text
    on source_text.calendar_day_id = d.id and source_text.language_code = d.language_code
  where d.country_code = p_country_code
    and d.calendar_code = p_calendar_code
    and d.calendar_date between p_start_date and p_end_date
    and d.is_published = true
  order by d.calendar_date;
$$;

grant execute on function public.get_calendar_days_localized(text,text,text,date,date) to anon, authenticated;
