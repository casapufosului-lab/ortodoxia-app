create table public.guest_usage_daily (
  guest_id text not null check (guest_id ~ '^guest-[A-Za-z0-9-]{16,80}$'),
  usage_date date not null,
  ai_messages integer not null default 0 check (ai_messages >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (guest_id, usage_date)
);

alter table public.guest_usage_daily enable row level security;
