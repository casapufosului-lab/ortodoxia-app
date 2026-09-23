-- LOCAL ONLY — NOT applied to any live database.
-- Repairs two server-side entitlement defects that the client alone cannot close:
--
--   E-09 (fail-open expiry): every entitlement check treated a NULL
--        `subscriptions.current_period_end` as "never expires". A row written
--        without a verifiable expiry therefore granted unlimited Premium, both in
--        the UI (`hasPremiumAccess`, fixed in src/lib/subscription.ts) and in the
--        authoritative quota gate below. A missing expiry now fails closed.
--
--   E-10 (provider provenance): the RevenueCat webhook and
--        `sync_revenuecat_subscription` both hardcoded `provider = 'manual'`, so
--        every real App Store / Google Play purchase was recorded as an operator
--        grant. Store provenance is now supplied by the caller and validated here;
--        `'revenuecat'` is added so a RevenueCat-verified purchase from a store
--        that is not App Store / Play Store is no longer mislabelled as `manual`.
--
-- No data is rewritten: existing rows are left exactly as they are, because the
-- repository has no production data and inventing a provenance value for them
-- would be worse than leaving them untouched.

-- ─── E-10 · provider domain ──────────────────────────────────────────────────

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IN ('apple', 'google', 'revenuecat', 'manual'));

COMMENT ON COLUMN public.subscriptions.provider IS
  'Entitlement provenance: apple/google = store identified, revenuecat = verified via RevenueCat webhook without an App Store/Play Store identity, manual = operator-granted.';

-- ─── E-10 · provider-aware snapshot sync ─────────────────────────────────────

-- The old 8-argument signature is dropped first: adding a parameter with a default
-- would otherwise leave both overloads callable and the old one would keep writing
-- provider = 'manual'.
DROP FUNCTION IF EXISTS public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint
);

CREATE FUNCTION public.sync_revenuecat_subscription(
  p_user_id uuid,
  p_status text,
  p_plan text,
  p_product_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_snapshot_at_ms bigint,
  p_provider text DEFAULT 'revenuecat'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_applied boolean;
BEGIN
  IF p_snapshot_at_ms IS NULL OR p_snapshot_at_ms <= 0 THEN
    RAISE EXCEPTION 'invalid RevenueCat snapshot timestamp';
  END IF;

  IF p_provider IS NULL
     OR p_provider NOT IN ('apple', 'google', 'revenuecat', 'manual') THEN
    RAISE EXCEPTION 'invalid subscription provider';
  END IF;

  -- E-09: an entitlement whose end date is unknown must not be written as an
  -- open-ended active/canceled subscription.
  IF p_status IN ('active', 'trialing', 'canceled')
     AND p_current_period_end IS NULL THEN
    p_status := 'expired';
    p_cancel_at_period_end := true;
  END IF;

  INSERT INTO public.subscriptions (
    user_id,
    status,
    plan,
    provider,
    product_id,
    provider_subscription_id,
    current_period_end,
    cancel_at_period_end,
    revenuecat_snapshot_at_ms
  )
  VALUES (
    p_user_id,
    p_status,
    p_plan,
    p_provider,
    p_product_id,
    p_provider_subscription_id,
    p_current_period_end,
    p_cancel_at_period_end,
    p_snapshot_at_ms
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    plan = EXCLUDED.plan,
    provider = EXCLUDED.provider,
    product_id = EXCLUDED.product_id,
    provider_subscription_id = EXCLUDED.provider_subscription_id,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    revenuecat_snapshot_at_ms = EXCLUDED.revenuecat_snapshot_at_ms
  WHERE
    public.subscriptions.revenuecat_snapshot_at_ms IS NULL
    OR EXCLUDED.revenuecat_snapshot_at_ms >
       public.subscriptions.revenuecat_snapshot_at_ms
  RETURNING true INTO v_applied;

  RETURN COALESCE(v_applied, false);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text
) TO service_role;

COMMENT ON FUNCTION public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint, text
) IS
'Applies a RevenueCat Customer Info snapshot when it is strictly newer than the stored one, records store provenance, and fails closed when an active entitlement has no expiry.';

-- ─── E-09 · fail-closed quota gate ───────────────────────────────────────────

DROP FUNCTION IF EXISTS public.reserve_ai_request(uuid, text);

CREATE FUNCTION public.reserve_ai_request(
  p_user_id uuid DEFAULT NULL,
  p_guest_id text DEFAULT NULL
)
RETURNS TABLE (
  remaining_limit integer,
  daily_limit integer,
  success boolean,
  denial_reason text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_date date := pg_catalog.timezone('Europe/Bucharest', pg_catalog.statement_timestamp())::date;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_limit integer := 5;
  v_used integer;
  v_last_request_at timestamptz;
  v_retry_after integer;
  v_lock_key text;
BEGIN
  IF (p_user_id IS NULL) = (p_guest_id IS NULL) THEN
    RAISE EXCEPTION 'Exactly one identity is required';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id !~ '^guest-[A-Za-z0-9-]{16,80}$' THEN
    RAISE EXCEPTION 'Invalid guest identity';
  END IF;

  IF p_user_id IS NOT NULL THEN
    -- E-09: the previous predicate also accepted a NULL period end, granting the
    -- 50-message Premium allowance to a row with no verifiable expiry. Only a
    -- period end strictly in the future now grants Premium.
    IF EXISTS (
      SELECT 1
      FROM public.subscriptions AS s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trialing', 'canceled')
        AND s.current_period_end > v_now
    ) THEN
      v_limit := 50;
    END IF;

    v_lock_key := 'user:' || p_user_id::text || ':' || v_date::text;
  ELSE
    v_lock_key := 'guest:' || p_guest_id || ':' || v_date::text;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_lock_key, 0)
  );

  IF p_user_id IS NOT NULL THEN
    SELECT u.ai_messages, u.last_request_at
    INTO v_used, v_last_request_at
    FROM public.usage_daily AS u
    WHERE u.user_id = p_user_id
      AND u.usage_date = v_date
    FOR UPDATE;
  ELSE
    SELECT u.ai_messages, u.last_request_at
    INTO v_used, v_last_request_at
    FROM public.guest_usage_daily AS u
    WHERE u.guest_id = p_guest_id
      AND u.usage_date = v_date
    FOR UPDATE;
  END IF;

  v_used := COALESCE(v_used, 0);

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT 0, v_limit, false, 'daily_limit'::text, 0;
    RETURN;
  END IF;

  IF v_last_request_at IS NOT NULL
     AND v_last_request_at > v_now - interval '5 seconds' THEN
    v_retry_after := pg_catalog.ceil(
      EXTRACT(EPOCH FROM ((v_last_request_at + interval '5 seconds') - v_now))
    )::integer;

    IF v_retry_after < 1 THEN
      v_retry_after := 1;
    END IF;

    RETURN QUERY SELECT v_limit - v_used, v_limit, false, 'cooldown'::text, v_retry_after;
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.usage_daily AS u (
      user_id,
      usage_date,
      ai_messages,
      last_request_at,
      updated_at
    )
    VALUES (p_user_id, v_date, 1, v_now, v_now)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET ai_messages = u.ai_messages + 1,
          last_request_at = v_now,
          updated_at = v_now
    RETURNING ai_messages INTO v_used;
  ELSE
    INSERT INTO public.guest_usage_daily AS u (
      guest_id,
      usage_date,
      ai_messages,
      last_request_at,
      updated_at
    )
    VALUES (p_guest_id, v_date, 1, v_now, v_now)
    ON CONFLICT (guest_id, usage_date) DO UPDATE
      SET ai_messages = u.ai_messages + 1,
          last_request_at = v_now,
          updated_at = v_now
    RETURNING ai_messages INTO v_used;
  END IF;

  RETURN QUERY SELECT v_limit - v_used, v_limit, true, NULL::text, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_request(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_ai_request(uuid, text)
TO service_role;

COMMENT ON FUNCTION public.reserve_ai_request(uuid, text) IS
'Atomically reserves one AI request, distinguishes cooldown from exhausted daily quota, and grants the Premium allowance only for an entitlement with a future period end.';
