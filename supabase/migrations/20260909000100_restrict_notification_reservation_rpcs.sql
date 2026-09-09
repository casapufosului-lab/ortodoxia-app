-- Restrict SECURITY DEFINER notification reservation RPCs to server-side use.
-- LOCAL ONLY — not applied to any live database.

REVOKE EXECUTE ON FUNCTION public.reserve_notification_deliveries(uuid[], date, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_notification_deliveries(uuid[], date, text)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_notification_reservation(uuid[], date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.release_notification_reservation(uuid[], date)
TO service_role;
