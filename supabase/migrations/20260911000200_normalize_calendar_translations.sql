begin;

do $$
begin
  if exists (
    select 1 from public.calendar_days
    group by country_code, calendar_code, calendar_date
    having count(*) > 1
  ) then
    raise exception 'calendar_days contains duplicate canonical country/calendar/date rows';
  end if;
end
$$;

create unique index if not exists calendar_days_country_calendar_date_idx
  on public.calendar_days(country_code, calendar_code, calendar_date);

create table public.calendar_day_translations (
  calendar_day_id uuid not null references public.calendar_days(id) on delete cascade,
  language_code text not null check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  title text not null,
  saints text[] not null default '{}',
  details text,
  fasting_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (calendar_day_id, language_code)
);

create trigger calendar_day_translations_set_updated_at
  before update on public.calendar_day_translations
  for each row execute procedure public.set_updated_at();

alter table public.calendar_day_translations enable row level security;

create policy "calendar_translations_read_published"
on public.calendar_day_translations for select
to anon, authenticated
using (exists (
  select 1 from public.calendar_days d
  where d.id = calendar_day_id and d.is_published = true
));

insert into public.calendar_day_translations
  (calendar_day_id, language_code, title, saints, details, fasting_note)
select id, language_code, title, saints, details, fasting_note
from public.calendar_days
on conflict (calendar_day_id, language_code) do update set
  title = excluded.title,
  saints = excluded.saints,
  details = excluded.details,
  fasting_note = excluded.fasting_note;

comment on column public.calendar_days.language_code is
  'Deprecated for display-language selection; retained temporarily for backwards compatibility.';

commit;
