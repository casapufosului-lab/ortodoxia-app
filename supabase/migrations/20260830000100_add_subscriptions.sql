create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'trialing', 'expired', 'canceled')),
  plan text not null check (plan in ('monthly', 'annual')),
  provider text not null check (provider in ('apple', 'google', 'manual')),
  product_id text,
  provider_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
on public.subscriptions for select
to authenticated
using ((select auth.uid()) = user_id);

