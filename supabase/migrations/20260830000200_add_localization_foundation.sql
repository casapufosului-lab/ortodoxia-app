alter table public.profiles
  add column country_code text not null default 'RO'
    check (country_code ~ '^[A-Z]{2}$'),
  add column language_code text not null default 'ro'
    check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  add column calendar_code text
    check (calendar_code is null or calendar_code ~ '^[a-z0-9-]{3,40}$');

alter table public.daily_content
  add column country_code text not null default 'RO'
    check (country_code ~ '^[A-Z]{2}$'),
  add column language_code text not null default 'ro'
    check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

alter table public.daily_content
  drop constraint if exists daily_content_content_date_key;

create unique index daily_content_region_date_idx
  on public.daily_content(country_code, language_code, content_date);

alter table public.calendar_days
  add column country_code text not null default 'RO'
    check (country_code ~ '^[A-Z]{2}$'),
  add column language_code text not null default 'ro'
    check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  add column calendar_code text not null default 'ro-bor'
    check (calendar_code ~ '^[a-z0-9-]{3,40}$');

alter table public.calendar_days
  drop constraint if exists calendar_days_calendar_date_key;

create unique index calendar_days_region_date_idx
  on public.calendar_days(country_code, language_code, calendar_code, calendar_date);

alter table public.prayers
  add column country_code text
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column language_code text not null default 'ro'
    check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

alter table public.prayers
  drop constraint if exists prayers_slug_key;

create unique index prayers_language_country_slug_idx
  on public.prayers(language_code, coalesce(country_code, ''), slug);

alter table public.chat_threads
  add column country_code text not null default 'RO'
    check (country_code ~ '^[A-Z]{2}$'),
  add column language_code text not null default 'ro'
    check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

create index daily_content_region_published_idx
  on public.daily_content(country_code, language_code, content_date)
  where is_published = true;

create index calendar_days_region_published_idx
  on public.calendar_days(country_code, language_code, calendar_code, calendar_date)
  where is_published = true;

create index prayers_language_published_idx
  on public.prayers(language_code, country_code, sort_order)
  where is_published = true;
