-- 20261010000100 · R3/U1b — registrul mediului de achiziție (sandbox / production)
--
-- De ce există acest fișier
-- ─────────────────────────
-- Webhook-ul RevenueCat acceptă acum PERMANENT evenimentele `environment = 'sandbox'`
-- (decizia R3 din 10.10.2026): TestFlight / Play internal testing este exact canalul în
-- care se testează aplicația înainte de lansare, iar un receipt de sandbox nu poate fi
-- fabricat de un terț. Până acum, un astfel de eveniment primea `200
-- {success:true, skipped:true, reason:'sandbox_event_ignored'}` și NU scria niciun rând,
-- în timp ce Apple confirmase deja plata testerului.
--
-- Ca un entitlement venit din sandbox să nu fie indistinguibil de unul plătit, fiecare
-- eveniment își scrie acum mediul pe rând, în `public.subscriptions.environment`.
--
-- Ce face (idempotent — poate fi rulat de oricâte ori, pe orice mediu):
--   1. adaugă coloana `environment` (text, NULL admis) + un CHECK idempotent
--      ('sandbox' | 'production' | NULL);
--   2. șterge funcția veche de 9 argumente și recreează
--      `public.sync_revenuecat_subscription` cu al zecelea parametru `p_environment`,
--      pe care îl validează și îl scrie în coloană. Ștergerea explicită este obligatorie:
--      altfel ar rămâne două supraîncărcări, iar un apel cu 9 argumente ar deveni ambiguu;
--   3. re-acordă EXECUTE doar lui `service_role` (`revoke` de la PUBLIC, anon, authenticated
--      în același fișier, conform regulii din 08.10.2026 — `revoke ... from public` singur
--      NU scoate privilegiile lui anon/authenticated).

alter table public.subscriptions
  add column if not exists environment text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_environment_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_environment_check
      check (environment is null or environment in ('sandbox', 'production'));
  end if;
end
$$;

comment on column public.subscriptions.environment is
  'Mediul achiziției raportat de RevenueCat (sandbox / production); NULL pentru rândurile scrise înainte de 20261010000100 sau fără informație.';

-- Semnătura veche (9 argumente) trebuie scoasă explicit: `create or replace` cu o listă de
-- parametri diferită creează o supraîncărcare nouă, nu o înlocuiește.
drop function if exists public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text
);

create or replace function public.sync_revenuecat_subscription(
  p_user_id uuid,
  p_status text,
  p_plan text,
  p_product_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_snapshot_at_ms bigint,
  p_provider text default 'revenuecat',
  p_environment text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applied boolean;
  v_environment text;
begin
  if p_snapshot_at_ms is null or p_snapshot_at_ms <= 0 then
    raise exception 'invalid RevenueCat snapshot timestamp';
  end if;

  if p_provider is null
     or p_provider not in ('apple', 'google', 'revenuecat', 'manual') then
    raise exception 'invalid subscription provider';
  end if;

  -- R3: mediul vine din eveniment. Orice valoare care nu e sandbox/production (și nu e
  -- absentă) este respinsă, ca un eveniment corupt să nu scrie un rând cu provenance fals.
  v_environment := lower(nullif(btrim(coalesce(p_environment, '')), ''));
  if v_environment is not null and v_environment not in ('sandbox', 'production') then
    raise exception 'invalid subscription environment';
  end if;

  -- E-09: an entitlement whose end date is unknown must not be written as an
  -- open-ended active/canceled subscription.
  if p_status in ('active', 'trialing', 'canceled')
     and p_current_period_end is null then
    p_status := 'expired';
    p_cancel_at_period_end := true;
  end if;

  insert into public.subscriptions (
    user_id,
    status,
    plan,
    provider,
    product_id,
    provider_subscription_id,
    current_period_end,
    cancel_at_period_end,
    revenuecat_snapshot_at_ms,
    environment
  )
  values (
    p_user_id,
    p_status,
    p_plan,
    p_provider,
    p_product_id,
    p_provider_subscription_id,
    p_current_period_end,
    p_cancel_at_period_end,
    p_snapshot_at_ms,
    v_environment
  )
  on conflict (user_id)
  do update set
    status = excluded.status,
    plan = excluded.plan,
    provider = excluded.provider,
    product_id = excluded.product_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    revenuecat_snapshot_at_ms = excluded.revenuecat_snapshot_at_ms,
    -- Mediul se scrie doar când evenimentul îl aduce: un eveniment fără `environment` nu
    -- trebuie să șteargă informația deja stocată.
    environment = coalesce(excluded.environment, public.subscriptions.environment)
  where
    public.subscriptions.revenuecat_snapshot_at_ms is null
    or excluded.revenuecat_snapshot_at_ms >
       public.subscriptions.revenuecat_snapshot_at_ms
  returning true into v_applied;

  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text, text
) to service_role;

comment on function public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text, text
) is
'Applies a RevenueCat Customer Info snapshot when it is strictly newer than the stored one, records store provenance and purchase environment (sandbox/production), and fails closed when an active entitlement has no expiry.';
