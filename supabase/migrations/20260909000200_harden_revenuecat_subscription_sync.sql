-- HIGH #7: prevent delayed RevenueCat webhook processing from overwriting
-- a newer subscription snapshot.
-- LOCAL ONLY — not applied to any live database.

ALTER TABLE public.subscriptions
ADD COLUMN revenuecat_snapshot_at_ms bigint;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_revenuecat_snapshot_positive
CHECK (
  revenuecat_snapshot_at_ms IS NULL
  OR revenuecat_snapshot_at_ms > 0
);

CREATE OR REPLACE FUNCTION public.sync_revenuecat_subscription(
  p_user_id uuid,
  p_status text,
  p_plan text,
  p_product_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_snapshot_at_ms bigint
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
    'manual',
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
  uuid, text, text, text, text, timestamptz, boolean, bigint
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_revenuecat_subscription(
  uuid, text, text, text, text, timestamptz, boolean, bigint
) TO service_role;