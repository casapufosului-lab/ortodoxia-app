import type { TranslationKey } from '@/i18n/config';

export const FREE_DAILY_AI_LIMIT = 5;
export const PREMIUM_DAILY_AI_LIMIT = 50;

export type SubscriptionRow = {
  status: string;
  plan: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export function hasPremiumAccess(subscription: SubscriptionRow | null | undefined) {
  if (!subscription) return false;
  // 'canceled' păstrează accesul până la sfârșitul perioadei plătite.
  if (!['active', 'trialing', 'canceled'].includes(subscription.status)) return false;
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}

export function subscriptionPlanLabel(subscription: SubscriptionRow | null | undefined): TranslationKey {
  if (!hasPremiumAccess(subscription)) return 'premium.planFree';
  return subscription?.plan === 'annual' ? 'premium.statusAnnual' : 'premium.statusMonthly';
}

