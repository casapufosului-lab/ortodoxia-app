-- 20260915000200 — harden cross-account push-device claiming (C-05).
--
-- PROBLEM
-- -------
-- `public.claim_notification_device(text, text, text)` (20260909000300) is granted
-- to `authenticated` and looked the device up by `expo_push_token` alone. The only
-- authorisation was a non-null `auth.uid()`, so any authenticated account that
-- learned another account's Expo push token could call the RPC and take ownership:
-- `user_id` was overwritten (the victim silently stops receiving notifications) and
-- the victim's `notification_deliveries` rows were deleted.
--
-- Tokens are not guessable, so this was rated MEDIUM rather than HIGH, but a device
-- hand-over is a normal event (a user signing into a second account on the same
-- phone) and the legitimate case must keep working. This migration therefore does
-- not forbid the transfer; it makes it bounded, auditable and rate-limited.
--
-- DESIGN
-- ------
-- The public contract of the RPC is unchanged (same name, parameters and return
-- behaviour) so the client needs no change; the device ownership check, the audit
-- trail and the rate limit are added by trigger and helper function instead. That
-- keeps the change additive and reversible.

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit trail for device hand-overs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notification_device_claims (
  id bigserial primary key,
  device_id uuid not null,
  previous_user_id uuid,
  new_user_id uuid not null,
  claimed_at timestamptz not null default timezone('utc', now())
);

comment on table public.notification_device_claims is
  'Append-only audit trail of push-device ownership changes. A cross-account claim is legitimate (same phone, second account) but must be traceable, so every hand-over is recorded here.';

create index if not exists notification_device_claims_device_idx
  on public.notification_device_claims (device_id, claimed_at desc);

create index if not exists notification_device_claims_new_user_idx
  on public.notification_device_claims (new_user_id, claimed_at desc);

alter table public.notification_device_claims enable row level security;

-- No client policy is created: the table is readable only through the service role.
-- Without a policy, anon/authenticated see nothing, which is the intended default.

-- ─────────────────────────────────────────────────────────────────────────────
-- Bounded cross-account claiming
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Guard invoked before a push device changes owner.
 *
 * 1. Records the hand-over in the audit table.
 * 2. Refuses when the requesting account has already taken over more than
 *    `p_max_per_day` devices belonging to other accounts in the last 24 hours,
 *    which bounds token-stuffing without affecting normal use.
 *
 * SECURITY DEFINER is required so the audit insert succeeds regardless of the
 * caller's row-level policies, but the function is not granted to any client role:
 * it only ever runs from the trigger below.
 */
create or replace function public.guard_notification_device_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_claims_per_day constant integer := 5;
  v_recent_claims integer;
begin
  -- Only a real owner change needs auditing or limiting.
  if new.user_id is not distinct from old.user_id then
    return new;
  end if;

  select count(*)
    into v_recent_claims
  from public.notification_device_claims
  where new_user_id = new.user_id
    and previous_user_id is not null
    and previous_user_id is distinct from new.user_id
    and claimed_at > statement_timestamp() - interval '24 hours';

  if v_recent_claims >= v_max_claims_per_day then
    raise exception
      'Prea multe revendicări de dispozitive într-o zi. Contactează suportul.'
      using errcode = 'check_violation';
  end if;

  insert into public.notification_device_claims (device_id, previous_user_id, new_user_id)
  values (new.id, old.user_id, new.user_id);

  return new;
end;
$$;

revoke all on function public.guard_notification_device_claim() from public, anon, authenticated;

drop trigger if exists notification_devices_guard_claim on public.notification_devices;
create trigger notification_devices_guard_claim
  before update of user_id on public.notification_devices
  for each row
  execute function public.guard_notification_device_claim();

-- ─────────────────────────────────────────────────────────────────────────────
-- Keep the notification RPC surface minimal
-- ─────────────────────────────────────────────────────────────────────────────

-- `claim_notification_device` remains the only client-callable write path for a
-- device; it is restricted to authenticated users (not anon) and must not be
-- executable by the anonymous role.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'claim_notification_device'
      and pronamespace = 'public'::regnamespace
  ) then
    execute 'revoke all on function public.claim_notification_device(text, text, text) from public, anon';
    execute 'grant execute on function public.claim_notification_device(text, text, text) to authenticated';
  end if;
end
$$;
