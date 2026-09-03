-- Add last_request_at to track rate limits
ALTER TABLE public.usage_daily ADD COLUMN last_request_at timestamptz;
ALTER TABLE public.guest_usage_daily ADD COLUMN last_request_at timestamptz;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id uuid DEFAULT NULL,
  p_guest_id uuid DEFAULT NULL,
  p_max_messages int DEFAULT 5,
  p_cooldown_seconds int DEFAULT 5
)
RETURNS TABLE (
  new_usage int,
  remaining_limit int,
  success boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usage_date date := timezone('utc', now())::date;
  v_last_request_at timestamptz;
  v_current_usage int;
BEGIN
  -- 1. Check rate limit (cooldown)
  IF p_user_id IS NOT NULL THEN
    SELECT last_request_at, ai_messages INTO v_last_request_at, v_current_usage
    FROM public.usage_daily
    WHERE user_id = p_user_id AND usage_date = v_usage_date;
  ELSE
    SELECT last_request_at, ai_messages INTO v_last_request_at, v_current_usage
    FROM public.guest_usage_daily
    WHERE guest_id = p_guest_id AND usage_date = v_usage_date;
  END IF;

  IF v_last_request_at IS NOT NULL AND (extract(epoch from (now() - v_last_request_at)) < p_cooldown_seconds) THEN
    RETURN QUERY SELECT COALESCE(v_current_usage, 0), 0, FALSE;
    RETURN;
  END IF;

  -- 2. Check usage limit
  IF COALESCE(v_current_usage, 0) >= p_max_messages THEN
    RETURN QUERY SELECT COALESCE(v_current_usage, 0), 0, FALSE;
    RETURN;
  END IF;

  -- 3. Atomic increment
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.usage_daily (user_id, usage_date, ai_messages, last_request_at)
    VALUES (p_user_id, v_usage_date, 1, now())
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET ai_messages = usage_daily.ai_messages + 1, last_request_at = now()
    RETURNING ai_messages INTO v_current_usage;
  ELSE
    INSERT INTO public.guest_usage_daily (guest_id, usage_date, ai_messages, last_request_at)
    VALUES (p_guest_id, v_usage_date, 1, now())
    ON CONFLICT (guest_id, usage_date)
    DO UPDATE SET ai_messages = guest_usage_daily.ai_messages + 1, last_request_at = now()
    RETURNING ai_messages INTO v_current_usage;
  END IF;

  RETURN QUERY SELECT v_current_usage, p_max_messages - v_current_usage, TRUE;
END;
$$;
