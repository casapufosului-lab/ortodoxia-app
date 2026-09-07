-- Local only. Apply before deploying the repaired orthodox-chat function.
-- Disable the old client-callable function with an incompatible UUID guest ID.
DROP FUNCTION IF EXISTS public.increment_ai_usage(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.reserve_ai_request(
  p_user_id uuid DEFAULT NULL,
  p_guest_id text DEFAULT NULL
)
RETURNS TABLE (remaining_limit integer, daily_limit integer, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_date date := timezone('Europe/Bucharest', statement_timestamp())::date;
  v_now timestamptz := statement_timestamp();
  v_limit integer := 5;
  v_used integer;
BEGIN
  IF (p_user_id IS NULL) = (p_guest_id IS NULL) THEN
    RAISE EXCEPTION 'Exactly one identity is required';
  END IF;
  IF p_guest_id IS NOT NULL AND p_guest_id !~ '^guest-[A-Za-z0-9-]{16,80}$' THEN
    RAISE EXCEPTION 'Invalid guest identity';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.subscriptions AS s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trialing', 'canceled')
        AND (s.current_period_end IS NULL OR s.current_period_end > v_now)
    ) THEN
      v_limit := 50;
    END IF;

    INSERT INTO public.usage_daily AS u (user_id, usage_date, ai_messages, last_request_at)
    VALUES (p_user_id, v_date, 1, v_now)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET ai_messages = u.ai_messages + 1, last_request_at = v_now
      WHERE u.ai_messages < v_limit
        AND (u.last_request_at IS NULL OR u.last_request_at <= v_now - interval '5 seconds')
    RETURNING ai_messages INTO v_used;
  ELSE
    INSERT INTO public.guest_usage_daily AS u (guest_id, usage_date, ai_messages, last_request_at)
    VALUES (p_guest_id, v_date, 1, v_now)
    ON CONFLICT (guest_id, usage_date) DO UPDATE
      SET ai_messages = u.ai_messages + 1, last_request_at = v_now
      WHERE u.ai_messages < v_limit
        AND (u.last_request_at IS NULL OR u.last_request_at <= v_now - interval '5 seconds')
    RETURNING ai_messages INTO v_used;
  END IF;

  -- Accepted attempts consume quota even if the external AI subsequently fails.
  -- Never refund blindly: retries must not bypass the spending limit.
  RETURN QUERY SELECT CASE WHEN v_used IS NULL THEN 0 ELSE v_limit - v_used END,
    v_limit, v_used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request(uuid, text) TO service_role;
