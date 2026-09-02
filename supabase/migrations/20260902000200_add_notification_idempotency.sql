-- notification-logic-finalize: add notification_type and atomic reservation
--
-- 1. Adds `notification_type` column to track what kind of notification was
--    sent (daily / sunday / red_cross).  The PK (device_id, content_date)
--    still enforces ONE notification per device per day.
--
-- 2. Creates `reserve_notification_deliveries()` — a PostgreSQL function that
--    atomically inserts delivery records and returns ONLY the device IDs that
--    were newly reserved.  Two concurrent workers calling this function will
--    each receive a disjoint set of device IDs, preventing duplicate pushes.
--
-- LOCAL ONLY — not applied to any live database.

-- ─── 1. notification_type column ────────────────────────────────────────────

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'daily';

COMMENT ON COLUMN public.notification_deliveries.notification_type IS
  'daily | sunday | red_cross — which notification variant was sent on this date.';

-- ─── 2. Atomic reservation function ─────────────────────────────────────────
--
-- Usage from Edge Function:
--   const { data } = await admin.rpc('reserve_notification_deliveries', {
--     p_device_ids: ['uuid1', 'uuid2'],
--     p_content_date: '2026-09-02',
--     p_notification_type: 'red_cross',
--   });
--   // data = [{ device_id: 'uuid1' }]  (only newly inserted)
--
-- Two concurrent invocations for the same date get disjoint device sets
-- because INSERT ... ON CONFLICT DO NOTHING is row-level atomic in PostgreSQL.

CREATE OR REPLACE FUNCTION public.reserve_notification_deliveries(
  p_device_ids uuid[],
  p_content_date date,
  p_notification_type text DEFAULT 'daily'
)
RETURNS TABLE(device_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH inserted AS (
    INSERT INTO public.notification_deliveries (device_id, content_date, notification_type)
    SELECT unnest(p_device_ids), p_content_date, p_notification_type
    ON CONFLICT (device_id, content_date) DO NOTHING
    RETURNING notification_deliveries.device_id
  )
  SELECT inserted.device_id FROM inserted;
$$;

COMMENT ON FUNCTION public.reserve_notification_deliveries IS
  'Atomically reserves notification delivery slots. Returns only device IDs '
  'that were newly inserted (not already delivered). Safe for concurrent use — '
  'ON CONFLICT DO NOTHING ensures two workers cannot both reserve the same device.';

-- ─── 3. Cleanup reservation function (for failed sends) ─────────────────────
--
-- If the Expo Push API call fails after reservation, delete the reservation
-- so the next cron invocation can retry.

CREATE OR REPLACE FUNCTION public.release_notification_reservation(
  p_device_ids uuid[],
  p_content_date date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.notification_deliveries
  WHERE device_id = ANY(p_device_ids)
    AND content_date = p_content_date;
$$;

COMMENT ON FUNCTION public.release_notification_reservation IS
  'Removes delivery reservations for devices whose push send failed, '
  'allowing the next cron invocation to retry.';
