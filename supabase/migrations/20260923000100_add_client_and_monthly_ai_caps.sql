-- LOCAL ONLY — NOT applied to any live database.
--
-- Closes the two spending gaps that the per-identity daily limit cannot close:
--
--   A. PER-DEVICE / PER-IP BRAKE. An account is free to create: an anonymous session
--      takes one call, so "5 messages per day" bounds one account and not one person.
--      The Edge Function now derives two SHA-256 hashes per request — (device header,
--      client IP) and (client IP) alone — with a secret salt, and both counters are
--      enforced here. A rotated device identifier therefore does not escape the IP
--      counter. Only the hashes reach SQL: no raw IP or device value is ever stored.
--
--   B. GLOBAL MONTHLY CAP. One row counts every AI message of every identity for the
--      current Bucharest month (usage_daily + guest_usage_daily combined). When the cap
--      is reached every identity is refused with `monthly_cap`, paid ones included: the
--      cap exists to bound the provider bill, which no single account can do.
--
-- WHERE THE BRAKES APPLY: A is a free-tier brake and is skipped for an identity with a
-- verified paid entitlement (the entitlement already pays for 50 messages/day); B applies
-- to everyone. Both counters are still incremented for paid identities, so the numbers
-- stay truthful.
--
-- FAIL-CLOSED: a reservation without a valid 64-hex client hash raises, and a database
-- with no monthly budget row raises instead of spending. Neither case silently serves a
-- free message.
--
-- WHAT THIS MIGRATION DOES NOT DO: it does not rewrite existing rows, does not refund a
-- reservation when the upstream AI call later fails (the existing policy: an accepted
-- reservation consumes one attempt), and does not delete the 2-argument RPC's execution
-- grants — the function itself is dropped below, so the grants disappear with it.

-- ─── A · per-device / per-IP counters ────────────────────────────────────────

CREATE TABLE public.ai_client_usage_daily (
  scope text NOT NULL CHECK (scope IN ('device', 'ip')),
  client_hash text NOT NULL CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  usage_date date NOT NULL,
  ai_messages integer NOT NULL DEFAULT 0 CHECK (ai_messages >= 0),
  last_request_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (scope, client_hash, usage_date)
);

COMMENT ON TABLE public.ai_client_usage_daily IS
  'Daily AI message counters keyed by a salted SHA-256 of (device header + client IP) and of the client IP alone. Only hashes are stored: the raw values never reach the database.';

ALTER TABLE public.ai_client_usage_daily ENABLE ROW LEVEL SECURITY;

-- ─── B · global monthly budget ───────────────────────────────────────────────

CREATE TABLE public.ai_usage_monthly (
  scope text PRIMARY KEY CHECK (scope = 'global'),
  period_start date NOT NULL,
  ai_messages integer NOT NULL DEFAULT 0 CHECK (ai_messages >= 0),
  message_cap integer NOT NULL CHECK (message_cap > 0),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.ai_usage_monthly IS
  'One row (scope = global) holding the provider-spend brake: every AI message of every identity for the current Bucharest month, against an operator-set cap.';

ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;

-- Starting value: a conservative brake, not a measured optimum. The operator sets the
-- real number with set_ai_monthly_cap() once the provider bill per message is known.
INSERT INTO public.ai_usage_monthly (scope, period_start, ai_messages, message_cap)
VALUES ('global', date_trunc('month', timezone('Europe/Bucharest', now()))::date, 0, 20000)
ON CONFLICT (scope) DO NOTHING;

-- ─── the reservation RPC, now with the two client hashes ─────────────────────

-- The 2-argument signature is dropped, not defaulted: a parameter with a default would
-- leave the old call shape working, and that shape cannot enforce the client brake.
DROP FUNCTION IF EXISTS public.reserve_ai_request(uuid, text);

CREATE FUNCTION public.reserve_ai_request(
  p_user_id uuid,
  p_guest_id text,
  p_client_hash text,
  p_ip_hash text
)
RETURNS TABLE (
  remaining_limit integer,
  daily_limit integer,
  success boolean,
  denial_reason text,
  retry_after_seconds integer,
  client_limit integer,
  monthly_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_local timestamp := pg_catalog.timezone('Europe/Bucharest', pg_catalog.statement_timestamp());
  v_date date := v_local::date;
  v_month date := pg_catalog.date_trunc('month', v_local)::date;
  v_limit integer := 5;
  v_client_limit constant integer := 20;
  v_ip_limit constant integer := 60;
  v_used integer;
  v_client_used integer;
  v_ip_used integer;
  v_month_used integer;
  v_month_cap integer;
  v_month_start date;
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

  -- Fail closed on anything that is not a server-computed hash.
  IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$'
     OR p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid client identity hash';
  END IF;

  IF p_user_id IS NOT NULL THEN
    -- E-09 (kept): only an entitlement with a period end strictly in the future pays.
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

  -- The global row is shared by every identity, so it is locked first, always in the same
  -- order (global, then identity): two reservations cannot deadlock on each other. The
  -- month rollover happens under that same lock, so a request that arrives in a new month
  -- resets the counter exactly once.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-monthly:global', 0));

  SELECT m.ai_messages, m.message_cap, m.period_start
  INTO v_month_used, v_month_cap, v_month_start
  FROM public.ai_usage_monthly AS m
  WHERE m.scope = 'global'
  FOR UPDATE;

  IF v_month_cap IS NULL THEN
    RAISE EXCEPTION 'AI monthly budget is not configured';
  END IF;

  IF v_month_start <> v_month THEN
    UPDATE public.ai_usage_monthly AS m
    SET period_start = v_month, ai_messages = 0, updated_at = v_now
    WHERE m.scope = 'global'
    RETURNING m.ai_messages, m.message_cap INTO v_month_used, v_month_cap;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));

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

  SELECT c.ai_messages
  INTO v_client_used
  FROM public.ai_client_usage_daily AS c
  WHERE c.scope = 'device'
    AND c.client_hash = p_client_hash
    AND c.usage_date = v_date
  FOR UPDATE;

  v_client_used := COALESCE(v_client_used, 0);

  SELECT c.ai_messages
  INTO v_ip_used
  FROM public.ai_client_usage_daily AS c
  WHERE c.scope = 'ip'
    AND c.client_hash = p_ip_hash
    AND c.usage_date = v_date
  FOR UPDATE;

  v_ip_used := COALESCE(v_ip_used, 0);

  -- 1. Global monthly cap: every identity, paid or free.
  IF v_month_used >= v_month_cap THEN
    -- GREATEST/EXTRACT are parser syntax, not schema-qualified functions.
    v_retry_after := GREATEST(
      1,
      pg_catalog.ceil(EXTRACT(EPOCH FROM ((v_month + interval '1 month') - v_now)))::integer
    );

    RETURN QUERY SELECT 0, v_limit, false, 'monthly_cap'::text, v_retry_after, v_client_limit, 0;
    RETURN;
  END IF;

  -- 2. Per-identity daily limit (unchanged contract).
  IF v_used >= v_limit THEN
    RETURN QUERY SELECT 0, v_limit, false, 'daily_limit'::text, 0, v_client_limit, v_month_cap - v_month_used;
    RETURN;
  END IF;

  -- 3./4. Free-tier brakes. A paid entitlement is not blocked by them; the counters still move.
  IF v_limit <= 5 THEN
    IF v_client_used >= v_client_limit THEN
      RETURN QUERY SELECT 0, v_limit, false, 'client_limit'::text, 0, v_client_limit, v_month_cap - v_month_used;
      RETURN;
    END IF;

    IF v_ip_used >= v_ip_limit THEN
      RETURN QUERY SELECT 0, v_limit, false, 'ip_limit'::text, 0, v_client_limit, v_month_cap - v_month_used;
      RETURN;
    END IF;
  END IF;

  -- 5. Cooldown (unchanged contract: 1..5 seconds).
  IF v_last_request_at IS NOT NULL
     AND v_last_request_at > v_now - interval '5 seconds' THEN
    v_retry_after := pg_catalog.ceil(
      EXTRACT(EPOCH FROM ((v_last_request_at + interval '5 seconds') - v_now))
    )::integer;

    IF v_retry_after < 1 THEN
      v_retry_after := 1;
    END IF;

    RETURN QUERY SELECT v_limit - v_used, v_limit, false, 'cooldown'::text, v_retry_after, v_client_limit, v_month_cap - v_month_used;
    RETURN;
  END IF;

  -- The reservation: identity, device, IP and month counters move together or not at all.
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
    RETURNING u.ai_messages INTO v_used;
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
    RETURNING u.ai_messages INTO v_used;
  END IF;

  INSERT INTO public.ai_client_usage_daily AS c (
    scope,
    client_hash,
    usage_date,
    ai_messages,
    last_request_at,
    updated_at
  )
  VALUES ('device', p_client_hash, v_date, 1, v_now, v_now)
  ON CONFLICT (scope, client_hash, usage_date) DO UPDATE
    SET ai_messages = c.ai_messages + 1,
        last_request_at = v_now,
        updated_at = v_now;

  INSERT INTO public.ai_client_usage_daily AS c (
    scope,
    client_hash,
    usage_date,
    ai_messages,
    last_request_at,
    updated_at
  )
  VALUES ('ip', p_ip_hash, v_date, 1, v_now, v_now)
  ON CONFLICT (scope, client_hash, usage_date) DO UPDATE
    SET ai_messages = c.ai_messages + 1,
        last_request_at = v_now,
        updated_at = v_now;

  UPDATE public.ai_usage_monthly AS m
  SET ai_messages = m.ai_messages + 1,
      updated_at = v_now
  WHERE m.scope = 'global'
  RETURNING m.ai_messages, m.message_cap INTO v_month_used, v_month_cap;

  RETURN QUERY SELECT v_limit - v_used, v_limit, true, NULL::text, 0, v_client_limit, v_month_cap - v_month_used;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_request(uuid, text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_ai_request(uuid, text, text, text)
TO service_role;

COMMENT ON FUNCTION public.reserve_ai_request(uuid, text, text, text) IS
  'Atomically reserves one AI request against four counters (identity/day, device+IP/day, IP/day, global month), distinguishes cooldown, identity, client, IP and monthly denials, grants the Premium allowance only for an entitlement with a future period end, and refuses any call without a server-computed client hash.';

-- ─── operator controls for the monthly brake ─────────────────────────────────

CREATE FUNCTION public.set_ai_monthly_cap(p_cap integer)
RETURNS TABLE (period_start date, ai_messages integer, message_cap integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date := pg_catalog.date_trunc(
    'month',
    pg_catalog.timezone('Europe/Bucharest', pg_catalog.statement_timestamp())
  )::date;
BEGIN
  IF p_cap IS NULL OR p_cap < 1 OR p_cap > 100000000 THEN
    RAISE EXCEPTION 'Invalid AI monthly cap';
  END IF;

  INSERT INTO public.ai_usage_monthly AS m (scope, period_start, ai_messages, message_cap)
  VALUES ('global', v_month, 0, p_cap)
  ON CONFLICT (scope) DO UPDATE
    SET message_cap = EXCLUDED.message_cap,
        period_start = EXCLUDED.period_start,
        ai_messages = CASE WHEN m.period_start = EXCLUDED.period_start THEN m.ai_messages ELSE 0 END,
        updated_at = pg_catalog.statement_timestamp();

  RETURN QUERY
  SELECT m.period_start, m.ai_messages, m.message_cap
  FROM public.ai_usage_monthly AS m
  WHERE m.scope = 'global';
END;
$$;

REVOKE ALL ON FUNCTION public.set_ai_monthly_cap(integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_ai_monthly_cap(integer) TO service_role;

COMMENT ON FUNCTION public.set_ai_monthly_cap(integer) IS
  'Sets the provider-spend brake for the current month. Service-role only; the value is validated and never silently accepted from a client.';

CREATE FUNCTION public.ai_monthly_status()
RETURNS TABLE (
  period_start date,
  ai_messages integer,
  message_cap integer,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.period_start, m.ai_messages, m.message_cap, m.updated_at
  FROM public.ai_usage_monthly AS m
  WHERE m.scope = 'global';
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_status()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ai_monthly_status() TO service_role;

COMMENT ON FUNCTION public.ai_monthly_status() IS
  'Read-only view of the current monthly AI budget, for the operator. Service-role only.';
