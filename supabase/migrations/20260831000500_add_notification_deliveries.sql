create table if not exists public.notification_deliveries (
  device_id uuid not null references public.notification_devices(id) on delete cascade,
  content_date date not null,
  sent_at timestamptz not null default timezone('utc', now()),
  primary key (device_id, content_date)
);

alter table public.notification_deliveries enable row level security;

drop policy if exists "notification_deliveries_select_own" on public.notification_deliveries;
create policy "notification_deliveries_select_own"
on public.notification_deliveries for select
to authenticated
using (exists (
  select 1 from public.notification_devices
  where notification_devices.id = notification_deliveries.device_id
    and notification_devices.user_id = (select auth.uid())
));
