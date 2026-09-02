-- Cache persistent pentru starea LIVE a surselor „Slujbe LIVE".
-- Această tabelă este menținută EXCLUSIV de Edge Function (service role).
-- Utilizatorii normali (anon/authenticated) NU pot scrie în ea.
-- Datele tranzitorii (videoId curent, status) NU se scriu niciodată
-- înapoi în configurația permanentă a surselor.

create table public.live_service_status_cache (
  source_id           text primary key,
  status              text not null check (status in ('live', 'not_live', 'unknown')),
  current_video_id    text,
  current_title       text,
  current_channel_id  text,
  embeddable          boolean,
  checked_at          timestamptz not null default timezone('utc', now()),
  live_started_at     timestamptz,
  next_refresh_at     timestamptz not null default timezone('utc', now()),
  refresh_lease_until timestamptz,
  updated_at          timestamptz not null default timezone('utc', now())
);

alter table public.live_service_status_cache enable row level security;

-- Block all client-side write access (anon + authenticated).
-- service_role bypasses RLS and writes exclusively via Edge Function.

drop policy if exists "live_cache_block_select_anon" on public.live_service_status_cache;
create policy "live_cache_block_select_anon"
  on public.live_service_status_cache
  for select
  to anon
  using (false);

drop policy if exists "live_cache_block_select_authenticated" on public.live_service_status_cache;
create policy "live_cache_block_select_authenticated"
  on public.live_service_status_cache
  for select
  to authenticated
  using (false);

drop policy if exists "live_cache_block_insert_anon" on public.live_service_status_cache;
create policy "live_cache_block_insert_anon"
  on public.live_service_status_cache
  for insert
  to anon
  with check (false);

drop policy if exists "live_cache_block_insert_authenticated" on public.live_service_status_cache;
create policy "live_cache_block_insert_authenticated"
  on public.live_service_status_cache
  for insert
  to authenticated
  with check (false);

drop policy if exists "live_cache_block_update_anon" on public.live_service_status_cache;
create policy "live_cache_block_update_anon"
  on public.live_service_status_cache
  for update
  to anon
  using (false)
  with check (false);

drop policy if exists "live_cache_block_update_authenticated" on public.live_service_status_cache;
create policy "live_cache_block_update_authenticated"
  on public.live_service_status_cache
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "live_cache_block_delete_anon" on public.live_service_status_cache;
create policy "live_cache_block_delete_anon"
  on public.live_service_status_cache
  for delete
  to anon
  using (false);

drop policy if exists "live_cache_block_delete_authenticated" on public.live_service_status_cache;
create policy "live_cache_block_delete_authenticated"
  on public.live_service_status_cache
  for delete
  to authenticated
  using (false);
