import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  FREE_DAILY_AI_LIMIT,
  hasPremiumAccess,
  planSummary,
  PREMIUM_DAILY_AI_LIMIT,
  type SubscriptionRow,
} from '@/lib/subscription';
import { needsServerSync, requestPremiumSync, throttleAllowsRequest } from '@/lib/premium-sync';
import { isRevenueCatConfigured } from '@/lib/revenuecat';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

export function useSubscription() {
  const { user } = useAuth();
  const { t } = useLocalization();
  const revenueCat = useRevenueCat();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshRequestRef = useRef(0);
  // T4 (10.10.2026) — FARA CLIPEALA: `isLoading` acopera DOAR prima determinare pentru utilizatorul
  // curent. Re-citirile (webhook-ul care scrie randul dupa cateva secunde, revenirea in ecran,
  // revizuirea `CustomerInfo`) nu mai pornesc indicatorul, deci textul planului nu mai alterna
  // „Se verifica…” / „Plan Gratuit” la fiecare re-citire (clipeala raportata de owner pe build 18).
  const determinedForUserRef = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    const currentUserId = user?.id ?? null;
    setError('');

    if (!user) {
      setSubscription(null);
      determinedForUserRef.current = null;
      setIsLoading(false);
      return;
    }

    // `isLoading` doar pana la prima determinare PENTRU ACEST utilizator: la login (identitate noua)
    // pornim o singura data indicatorul, iar re-citirile ulterioare nu-l mai ating (T4, 10.10.2026).
    if (determinedForUserRef.current !== currentUserId) setIsLoading(true);
    const { data, error: queryError } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    if (refreshRequestRef.current !== requestId) return;

    if (queryError) {
      setSubscription(null);
      setError(t('account.planError'));
    } else {
      setSubscription(data as SubscriptionRow | null);
    }

    determinedForUserRef.current = currentUserId;
    setIsLoading(false);
  }, [user, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(timeoutId);
      refreshRequestRef.current += 1;
    };
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

  // T3 (10.10.2026) — RECONCILIEREA (gaura „Premium activ + 5/zi”).
  //
  // Magazinul confirmă abonamentul, dar rândul din `subscriptions` — poarta de acces citită de
  // `reserve_ai_request` (50/zi cu rând activ, 5/zi fără) — nu îl confirmă: lipsește sau e expirat.
  // Atunci cerem O SINGURĂ DATĂ serverului să scrie rândul din chiar starea pe care o vede magazinul
  // (`revenuecat-sync-user`), apoi re-citim rândul. Fără bucle și fără alte temporizatoare: a doua
  // cerere în aceeași fereastră de 10 minute NU se face (`throttleAllowsRequest`), iar în timpul unui
  // apel nu se pornește altul (`syncInFlightRef`).
  //
  // Fără utilizator autentificat nu se cheamă nimic: funcția își ia identitatea exclusiv din tokenul de
  // sesiune (`verify_jwt = true`), deci un apel fără sesiune ar primi 401 și ar consuma o cerere degeaba.
  // Dacă entitlement-ul e inactiv, condiția de mai jos e falsă și nu se cheamă nimic.
  const lastSyncRequestAtRef = useRef(0);
  const syncInFlightRef = useRef(false);
  useEffect(() => {
    if (!user) return undefined;
    if (!needsServerSync(revenueCat.premiumActive, subscription)) return undefined;
    if (syncInFlightRef.current) return undefined;
    if (!throttleAllowsRequest(lastSyncRequestAtRef.current, Date.now())) return undefined;

    syncInFlightRef.current = true;
    lastSyncRequestAtRef.current = Date.now();
    let cancelled = false;
    void (async () => {
      await requestPremiumSync();
      syncInFlightRef.current = false;
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [user, revenueCat.premiumActive, subscription, refresh]);

  // Premium (inclusiv limita AI) se determină exclusiv din tabelul `subscriptions`.
  // T2 (10.10.2026) — O SINGURA SURSA DE ADEVAR: accesul Premium (deci si limita AI si eticheta
  // planului) se determina EXCLUSIV din entitlement-ul RevenueCat
  // (`customerInfo.entitlements.active['premium']`), calculat o singura data in `use-revenuecat.ts`.
  const isPremium = revenueCat.premiumActive;
  // Randul din `subscriptions` (scris de webhook-ul RevenueCat) ramane expus DOAR INFORMATIV: nu mai
  // acorda si nu mai retrage acces. Cand contrazice magazinul, divergenta se AFISEAZA (avertismentul
  // „INFORMATIV" din `premium.tsx`), nu se ascunde.
  const subscriptionRowActive = hasPremiumAccess(subscription);

  return {
    subscription,
    revenueCatActive,
    entitlement: revenueCat.entitlement,
    entitlementDiagnostics: revenueCat.entitlementDiagnostics,
    // Cerinta 1 (build 18, 10.10.2026): valoarea unica din care se deriva TOATA interfata ecranului
    // Premium (eticheta planului, data de expirare, vizibilitatea butoanelor de cumparare). Vine
    // calculata o singura data in `use-revenuecat`; aici NU se re-calculeaza din altceva.
    premium: revenueCat.premium,
    premiumActive: revenueCat.premiumActive,
    premiumKnown: revenueCat.premiumKnown,
    customerInfoError: revenueCat.customerInfoError,
    // T4 (10.10.2026): fereastra „starea magazinului e necunoscuta” are un capat — fie citirea
    // `CustomerInfo` a eșuat (`storeStateUnknownError`), fie au trecut 10 secunde
    // (`storeStateUnknownExpired`). Ambele ies din `use-revenuecat.ts`; ecranul le paseaza mai departe
    // lui `premiumUiState`, care asa poate arata butoanele in loc sa le tina ascunse la nesfarsit.
    storeStateUnknownError: revenueCat.storeStateUnknownError,
    storeStateUnknownExpired: revenueCat.storeStateUnknownExpired,
    // Cerinta 3 (build 14, 10.10.2026): dovada ultimei sincronizari cu magazinul + actiunea care o
    // declanseaza. Se afiseaza permanent, mic, pe ecranul Premium: „RevenueCat nu vede abonamentul”
    // trebuie sa se poata citi negru pe alb de pe telefon.
    // R1 (build 19, 10.10.2026): sincronizarea NU mai ruleaza automat — `restorePurchases()` se cheama
    // EXCLUSIV din butonul „Restaureaza cumparaturile”; aici ramane raportul ultimei rulari manuale.
    storeSync: revenueCat.storeSync,
    syncWithStore: revenueCat.syncWithStore,
    // Cerinta 2 (build 13, 10.10.2026): la fiecare revenire in ecranul Premium, starea reala de
    // abonament se re-citeste de la magazin (`Purchases.getCustomerInfo()`), nu din memoria
    // aplicatiei. R1 (build 19): re-citirea NU mai este insotita de `restorePurchases()`.
    refreshRevenueCat: revenueCat.refresh,
    isPremium,
    isLoading,
    error,
    // Eticheta planului iese din ACEEASI valoare ca accesul (`planSummary` citeste `premiumActive` si
    // `entitlement.plan`), nu din randul din baza de date (T2, 10.10.2026).
    planLabel: t(planSummary({ premiumActive: revenueCat.premiumActive, entitlementPlan: revenueCat.entitlement.plan }).labelKey),
    dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT,
    // Randul din baza de date, DOAR ca informatie (dovada divergentei fata de magazin).
    subscriptionRowActive,
    refresh,
  };
}


