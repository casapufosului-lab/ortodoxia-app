import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  FREE_DAILY_AI_LIMIT,
  hasPremiumAccess,
  PREMIUM_DAILY_AI_LIMIT,
  subscriptionPlanLabel,
  type SubscriptionRow,
} from '@/lib/subscription';
import { useAuth } from '@/providers/auth-provider';

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');

    if (!user) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error: queryError } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    if (queryError) {
      setSubscription(null);
      setError('Starea abonamentului nu a putut fi verificată.');
    } else {
      setSubscription(data as SubscriptionRow | null);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const isPremium = hasPremiumAccess(subscription);

  return {
    subscription,
    isPremium,
    isLoading,
    error,
    planLabel: subscriptionPlanLabel(subscription),
    dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT,
    refresh,
  };
}

