create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create table public.daily_content (
  id uuid primary key default gen_random_uuid(),
  content_date date not null unique,
  verse_text text not null,
  verse_source text not null,
  parable_title text not null,
  parable_text text not null,
  editorial_source text,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger daily_content_set_updated_at
  before update on public.daily_content
  for each row execute procedure public.set_updated_at();

create table public.calendar_days (
  id uuid primary key default gen_random_uuid(),
  calendar_date date not null unique,
  feast_rank text,
  saints text[] not null default '{}',
  title text not null,
  details text,
  fasting_note text,
  editorial_source text,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger calendar_days_set_updated_at
  before update on public.calendar_days
  for each row execute procedure public.set_updated_at();

create table public.prayers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  category text not null,
  title text not null,
  body text not null,
  editorial_source text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger prayers_set_updated_at
  before update on public.prayers
  for each row execute procedure public.set_updated_at();

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  prayer_id uuid not null references public.prayers(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, prayer_id)
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Conversație nouă' check (char_length(title) <= 120),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index chat_threads_user_updated_idx on public.chat_threads(user_id, updated_at desc);

create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute procedure public.set_updated_at();

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default timezone('utc', now())
);

create index chat_messages_thread_created_idx on public.chat_messages(thread_id, created_at);

create table public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  ai_messages integer not null default 0 check (ai_messages >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, usage_date)
);

alter table public.profiles enable row level security;
alter table public.daily_content enable row level security;
alter table public.calendar_days enable row level security;
alter table public.prayers enable row level security;
alter table public.favorites enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.usage_daily enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "daily_content_read_published"
on public.daily_content for select
to anon, authenticated
using (is_published = true);

create policy "calendar_read_published"
on public.calendar_days for select
to anon, authenticated
using (is_published = true);

create policy "prayers_read_published"
on public.prayers for select
to anon, authenticated
using (is_published = true);

create policy "favorites_select_own"
on public.favorites for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "favorites_insert_own"
on public.favorites for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "favorites_delete_own"
on public.favorites for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "threads_select_own"
on public.chat_threads for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "threads_insert_own"
on public.chat_threads for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "threads_update_own"
on public.chat_threads for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "threads_delete_own"
on public.chat_threads for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "messages_select_own_thread"
on public.chat_messages for select
to authenticated
using (
  exists (
    select 1 from public.chat_threads
    where chat_threads.id = chat_messages.thread_id
      and chat_threads.user_id = (select auth.uid())
  )
);

create policy "messages_insert_user_only"
on public.chat_messages for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'user'
  and exists (
    select 1 from public.chat_threads
    where chat_threads.id = chat_messages.thread_id
      and chat_threads.user_id = (select auth.uid())
  )
);

create policy "usage_select_own"
on public.usage_daily for select
to authenticated
using ((select auth.uid()) = user_id);
