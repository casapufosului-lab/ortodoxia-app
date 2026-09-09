-- MEDIUM #10: allow an authenticated account to claim the current device push token safely.
-- LOCAL ONLY — not applied to any live database.

CREATE OR REPLACE FUNCTION public.claim_notification_device(
  p_expo_push_token text,
  p_platform text,
  p_timezone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_device_id uuid;
  v_previous_user_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_expo_push_token IS NULL OR pg_catalog.btrim(p_expo_push_token) = '' THEN
    RAISE EXCEPTION 'push token is required' USING ERRCODE = '22023';
  END IF;

  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid push platform' USING ERRCODE = '22023';
  END IF;

  IF p_timezone IS NULL OR pg_catalog.btrim(p_timezone) = '' THEN
    RAISE EXCEPTION 'timezone is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize claims for the same token, including the first insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_expo_push_token, 0)
  );

  SELECT d.id, d.user_id
  INTO v_device_id, v_previous_user_id
  FROM public.notification_devices AS d
  WHERE d.expo_push_token = p_expo_push_token
  FOR UPDATE;

  IF v_device_id IS NULL THEN
    INSERT INTO public.notification_devices (
      user_id,
      expo_push_token,
      platform,
      timezone,
      is_active,
      last_seen_at
    )
    VALUES (
      v_user_id,
      p_expo_push_token,
      p_platform,
      p_timezone,
      true,
      pg_catalog.timezone('utc', pg_catalog.now())
    )
    RETURNING id INTO v_device_id;

    RETURN v_device_id;
  END IF;

  IF v_previous_user_id IS DISTINCT FROM v_user_id THEN
    DELETE FROM public.notification_deliveries
    WHERE device_id = v_device_id;
  END IF;

  UPDATE public.notification_devices
  SET
    user_id = v_user_id,
    platform = p_platform,
    timezone = p_timezone,
    is_active = true,
    last_seen_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE id = v_device_id;

  RETURN v_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_device(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_notification_device(text, text, text)
TO authenticated;

COMMENT ON FUNCTION public.claim_notification_device(text, text, text) IS
'Claims an Expo push token for auth.uid(). On ownership change, clears prior delivery rows before reassigning the device.';
