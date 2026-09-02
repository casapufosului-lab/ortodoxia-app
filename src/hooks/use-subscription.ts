import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  FREE_DAILY_AI_LIMIT,
  hasPremiumAccess,
  PREMIUM_DAILY_AI_LIMIT,
  subscriptionPlanLabel,
  type SubscriptionRow,
} from '@/lib/subscription';
import { isRevenueCatConfigured } from '@/lib/revenuecat';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useAuth } from '@/providers/auth-provider';

export function useSubscription() {
  const { user } = useAuth();
  const revenueCat = useRevenueCat();
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

  // CustomerInfo din RevenueCat este folosit DOAR pentru afișarea imediată și
  // pentru a declanșa re-verificarea stării server-side; nu acordă acces.
  const revenueCatActive = isRevenueCatConfigured() ? revenueCat.activeRow : null;
  const revenueCatKey = revenueCatActive
    ? `${revenueCatActive.status}|${revenueCatActive.current_period_end ?? ''}|${revenueCatActive.cancel_at_period_end}`
    : '';

  const lastRevenueCatKeyRef = useRef('');
  useEffect(() => {
    if (revenueCatKey && revenueCatKey !== lastRevenueCatKeyRef.current) {
      // Webhook-ul RevenueCat scrie în `subscriptions` în câteva secunde;
      // re-citim starea din baza de date pentru a o afișa corect.
      const timeoutId = setTimeout(() => void refresh(), 1500);
      lastRevenueCatKeyRef.current = revenueCatKey;
      return () => clearTimeout(timeoutId);
    }
    lastRevenueCatKeyRef.current = revenueCatKey;
    return undefined;
  }, [revenueCatKey, refresh]);

  // Premium (inclusiv limita AI) se determină exclusiv din tabelul `subscriptions`.
  const isPremium = hasPremiumAccess(subscription);

  return {
    subscription,
    revenueCatActive,
    isPremium,
    isLoading,
    error,
    planLabel: subscriptionPlanLabel(subscription),
    dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT,
    refresh,
  };
}


