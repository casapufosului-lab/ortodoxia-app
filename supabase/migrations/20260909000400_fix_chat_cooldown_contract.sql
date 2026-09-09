-- MEDIUM #11: distinguish temporary chat cooldown from exhausted daily quota.
-- LOCAL ONLY - not applied to any live database.

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
    IF EXISTS (
      SELECT 1
      FROM public.subscriptions AS s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trialing', 'canceled')
        AND (s.current_period_end IS NULL OR s.current_period_end > v_now)
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
'Atomically reserves one AI request and distinguishes cooldown from exhausted daily quota.';
