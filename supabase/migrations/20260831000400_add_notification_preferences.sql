create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  daily_time time not null default time '10:00',
  timezone text not null default 'Europe/Bucharest',
  country_code text not null default 'RO' check (country_code ~ '^[A-Z]{2}$'),
  language_code text not null default 'ro' check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  calendar_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')), 
  timezone text not null default 'Europe/Bucharest',
  last_seen_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_devices_user_active_idx
  on public.notification_devices(user_id, is_active);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute procedure public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notification_devices enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "notification_devices_select_own" on public.notification_devices;
create policy "notification_devices_select_own"
on public.notification_devices for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notification_devices_insert_own" on public.notification_devices;
create policy "notification_devices_insert_own"
on public.notification_devices for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "notification_devices_update_own" on public.notification_devices;
create policy "notification_devices_update_own"
on public.notification_devices for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "notification_devices_delete_own" on public.notification_devices;
create policy "notification_devices_delete_own"
on public.notification_devices for delete
to authenticated
using ((select auth.uid()) = user_id);
