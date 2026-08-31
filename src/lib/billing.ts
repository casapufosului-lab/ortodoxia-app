import { Platform } from 'react-native';

/**
 * Identificatorii produselor care vor fi creați în App Store Connect și
 * Google Play Console. Nu conțin date de card și pot fi schimbați înainte de lansare.
 */
export const BILLING_PRODUCTS = {
  monthly: {
    apple: 'ro.ortodoxia.premium.monthly',
    google: 'ro.ortodoxia.premium.monthly',
  },
  annual: {
    apple: 'ro.ortodoxia.premium.annual',
    google: 'ro.ortodoxia.premium.annual',
  },
} as const;

export type BillingPlan = keyof typeof BILLING_PRODUCTS;

export function productIdFor(plan: BillingPlan) {
  return BILLING_PRODUCTS[plan][Platform.OS === 'ios' ? 'apple' : 'google'];
}

/** Integrarea magazinelor se activează după configurarea conturilor de dezvoltator. */
export const billingProvider = 'revenuecat' as const;
export const billingReady = false;
