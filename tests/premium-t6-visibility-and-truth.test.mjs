/**
 * PREMIUM - T6 (1)(2)(3)(5) din taskul de reparare (10.10.2026).
 *
 * Ce apara testul, punct cu punct din cerinta:
 *   (1) entitlement activ => Premium, Cont si limita din chat arata plan PLATIT (nu "Plan Gratuit"),
 *       toate trei din ACEEASI valoare (`entitlements.active['premium'].isActive`);
 *   (2) entitlement inactiv DUPA prima citire => butoanele de cumparare sunt VIZIBILE, iar fara
 *       login butonul cere autentificare (nu cumpara);
 *   (3) o citire `CustomerInfo` esuata sau o fereastra "necunoscut" expirata => butoanele TOT se vad,
 *       iar textul planului nu minte (nu scrie "se activeaza" cand nu exista nicio dovada);
 *   (5) linkul "Gestioneaza abonamentul" este vizibil in TOATE starile, pe ecranul Premium si in Cont,
 *       fara sa depinda de starea abonamentului.
 *
 * Ce NU dovedeste: randarea reala a componentelor (proiectul nu are renderer React Native) si fluxul
 * real de cumparare. Structural + logic, fara credentiate si fara apeluri catre magazine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import {
  FREE_DAILY_AI_LIMIT,
  PREMIUM_DAILY_AI_LIMIT,
  STORE_STATE_UNKNOWN_TIMEOUT_MS,
  planSummary,
  premiumUiState,
  shouldShowPurchaseButtons,
} from '../src/lib/subscription.ts';
import { manageSubscriptionUrl } from '../src/lib/store-links.ts';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
/** Codul fara comentarii: comentariile nu trebuie sa conteze ca "folosire" a unei reguli vechi. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PREMIUM = read('src/app/premium.tsx');
const ACCOUNT = read('src/app/(tabs)/account.tsx');
const CHAT = read('src/app/(tabs)/chat.tsx');
const RC_HOOK = read('src/hooks/use-revenuecat.ts');
const SUB_HOOK = read('src/hooks/use-subscription.ts');

const PREMIUM_CODE = stripComments(PREMIUM);
const ACCOUNT_CODE = stripComments(ACCOUNT);
const CHAT_CODE = stripComments(CHAT);
const SUB_HOOK_CODE = stripComments(SUB_HOOK);

const FUTURE = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
const KNOWN = true;
const UNKNOWN = false;

describe('T6(1) entitlement activ => plan platit in Premium, in Cont si in chat', () => {
  test('ECRAN PREMIUM: "Premium activ" + expirare + fara butoane de cumparare', () => {
    const state = premiumUiState({
      premiumActive: true,
      premiumExpirationDate: FUTURE,
      storeStateKnown: KNOWN,
    });

    assert.equal(state.labelKey, 'premium.entitlementActive');
    assert.equal(state.expirationDate, FUTURE);
    assert.equal(state.showPurchaseButtons, false);
  });

  test('CARDUL DIN CONT: eticheta, limita AI si butonul ies din aceeasi valoare', () => {
    const monthly = planSummary({ premiumActive: true, entitlementPlan: 'monthly' });
    assert.equal(monthly.labelKey, 'premium.statusMonthly');
    assert.equal(monthly.bodyKey, 'account.aiMessagesPerDay');
    assert.equal(monthly.bodyCount, PREMIUM_DAILY_AI_LIMIT);
    assert.equal(monthly.buttonKey, 'account.viewSubscriptionButton');

    const annual = planSummary({ premiumActive: true, entitlementPlan: 'annual' });
    assert.equal(annual.labelKey, 'premium.statusAnnual');
    assert.equal(annual.bodyCount, PREMIUM_DAILY_AI_LIMIT);

    const free = planSummary({ premiumActive: false, entitlementPlan: null });
    assert.equal(free.labelKey, 'premium.planFree');
    assert.equal(free.bodyCount, null, 'planul gratuit nu are {count} in text');
    assert.equal(free.buttonKey, 'account.viewPremiumButton');
  });

  test('LIMITELE: 50/zi pentru Premium, 5/zi pentru gratuit', () => {
    assert.equal(PREMIUM_DAILY_AI_LIMIT, 50);
    assert.equal(FREE_DAILY_AI_LIMIT, 5);
  });

  test('CABLAJ: ecranul Premium, Contul si chatul citesc ENTITLEMENT-ul, nu randul din baza', () => {
    // Ecranul Cont: planul vine din `premiumActive` (entitlement), nu din randul `subscriptions`.
    assert.ok(
      ACCOUNT_CODE.includes('const plan = planSummary({ premiumActive, entitlementPlan: entitlement.plan });'),
      'cardul din Cont trebuie sa isi ia planul din entitlement',
    );
    assert.ok(
      !ACCOUNT_CODE.includes('hasPremiumAccess'),
      'Contul nu are voie sa mai deduca accesul din randul din baza de date',
    );

    // Chatul: limita afisata vine din aceeasi valoare ca ecranul Premium.
    assert.ok(
      CHAT_CODE.includes(
        'const { dailyAiLimit: entitlementDailyLimit, isPremium: storeConfirmsPremium, subscriptionRowActive } = useSubscription();',
      ),
      'chatul trebuie sa ia limita din hook-ul derivat din entitlement',
    );
    assert.ok(CHAT_CODE.includes('const nextLimit = entitlementDailyLimit;'));
    assert.ok(
      !CHAT_CODE.includes('hasPremiumAccess'),
      'limita din chat nu are voie sa vina din randul din `subscriptions`',
    );
    assert.ok(
      CHAT_CODE.includes("dailyLimit === PREMIUM_DAILY_AI_LIMIT ? t('chat.planPremium')"),
      'textul din chat trebuie sa numeasca planul platit cand limita este cea de Premium',
    );

    // Hook-ul: o singura expresie decide accesul, iar randul ramane informativ.
    assert.ok(SUB_HOOK_CODE.includes('const isPremium = revenueCat.premiumActive;'));
    assert.ok(
      SUB_HOOK_CODE.includes('dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT,'),
    );
    assert.ok(
      !/isPremium\s*=\s*[^;]*hasPremiumAccess/.test(SUB_HOOK_CODE),
      'accesul nu se mai deduce din `hasPremiumAccess(randul din subscriptions)`',
    );
  });
});

describe('T6(2) inactiv dupa prima citire => butoane VIZIBILE; fara login => cere autentificare', () => {
  test('LIB: inactiv dupa prima citire => eticheta "Plan Gratuit" + butoane VIZIBILE', () => {
    const state = premiumUiState({
      premiumActive: false,
      premiumExpirationDate: null,
      storeStateKnown: KNOWN,
    });

    assert.equal(state.labelKey, 'premium.planFree');
    assert.equal(state.expirationDate, null);
    assert.equal(state.showPurchaseButtons, true);
  });

  test('LIB: butoanele se ascund DOAR cand entitlement-ul e activ', () => {
    assert.equal(shouldShowPurchaseButtons('free'), true);
    assert.equal(shouldShowPurchaseButtons('activation-pending'), false);
    assert.equal(shouldShowPurchaseButtons('active'), false);
  });

  test('ECRAN: fara login, butonul de cumparare ramane ACTIV si duce la autentificare', () => {
    // Butonul nu se blocheaza pentru un vizitator: blocarea se aplica doar unui utilizator logat,
    // iar vizitatorul este trimis la ecranul de autentificare.
    assert.ok(
      PREMIUM_CODE.includes('const monthlyBlocked = Boolean(user) && !isPurchasable(monthlyAvailability);'),
    );
    assert.ok(
      PREMIUM_CODE.includes('const annualBlocked = Boolean(user) && !isPurchasable(annualAvailability);'),
    );
    assert.ok(PREMIUM_CODE.includes('const requireUser = () => {'));
    assert.ok(
      PREMIUM_CODE.includes("router.push('/auth?returnTo=/premium'); return true;"),
      'fara login, actiunea duce la autentificare, nu la cumparare',
    );
    // Ambele actiuni care vorbesc cu magazinul (cumparare si restaurare) trec prin `requireUser()`.
    assert.equal(
      (PREMIUM_CODE.match(/if \(requireUser\(\) \|\| busyRef\.current\) return;/g) ?? []).length,
      2,
      'cumpararea si restaurarea trec amandoua prin `requireUser()`',
    );
  });

  test('HOOK: fereastra "necunoscut" se inchide (10 s sau citire esuata) si ecranul primeste ambele', () => {
    assert.equal(STORE_STATE_UNKNOWN_TIMEOUT_MS, 10_000);
    assert.ok(RC_HOOK.includes('STORE_STATE_UNKNOWN_TIMEOUT_MS'));
    assert.ok(RC_HOOK.includes('const storeStateUnknownExpired = !premiumKnown && unknownWindow.userId === userId && unknownWindow.elapsed;'));
    assert.ok(RC_HOOK.includes("const storeStateUnknownError = !premiumKnown && customerInfoError !== '';"));
    assert.ok(
      /storeStateUnknownError,\s*\n\s*storeStateUnknownExpired,\s*\n\s*\}\);/.test(PREMIUM_CODE),
      'ecranul paseaza fereastra mai departe lui `premiumUiState`',
    );
  });
});

describe('T6(3) citire CustomerInfo esuata => butoanele TOT se vad si textul nu minte', () => {
  test('citire esuata => butoanele apar (nu raman ascunse la nesfarsit)', () => {
    const state = premiumUiState({
      premiumActive: false,
      premiumExpirationDate: null,
      storeStateKnown: UNKNOWN,
      storeStateUnknownError: true,
    });

    assert.equal(state.showPurchaseButtons, true);
    assert.equal(state.labelKey, 'premium.planFree');
  });

  test('fereastra expirata (10 s) => butoanele apar', () => {
    const state = premiumUiState({
      premiumActive: false,
      premiumExpirationDate: null,
      storeStateKnown: UNKNOWN,
      storeStateUnknownExpired: true,
    });

    assert.equal(state.showPurchaseButtons, true);
  });

  test('textul planului NU spune niciodata "se activeaza" si nu promite un abonament', () => {
    const allowed = new Set(['premium.entitlementActive', 'premium.planFree']);
    for (const premiumActive of [true, false]) {
      for (const storeStateKnown of [true, false]) {
        for (const flag of [undefined, true]) {
          const state = premiumUiState({
            premiumActive,
            premiumExpirationDate: premiumActive ? FUTURE : null,
            storeStateKnown,
            storeStateUnknownError: flag,
            storeStateUnknownExpired: flag,
          });
          assert.ok(
            allowed.has(state.labelKey),
            `eticheta de plan neasteptata: ${state.labelKey} (premiumActive=${premiumActive})`,
          );
          // Regula T4, exact: butoanele se ascund cand entitlement-ul e activ SAU cat timp fereastra
          // "necunoscut" e deschisa (prima citire inca nu s-a terminat). In rest, se VAD.
          const unknownWindowOpen = storeStateKnown === false && flag !== true;
          assert.equal(
            state.showPurchaseButtons,
            !premiumActive && !unknownWindowOpen,
            `butoane gresite (premiumActive=${premiumActive}, known=${storeStateKnown}, flag=${flag})`,
          );
        }
      }
    }
  });

  test('ECRAN: "se verifica" apare doar cat timp starea nu s-a determinat', () => {
    assert.ok(
      PREMIUM_CODE.includes("{isLoading || storeStateUnresolved ? t('premium.statusChecking') : premiumLabel}"),
      'textul de verificare trebuie sa fie conditionat de starea nerezolvata',
    );
    assert.ok(PREMIUM_CODE.includes('const storeStateUnresolved'));
  });
});

describe('T6(5) linkul de gestionare este vizibil in TOATE starile', () => {
  test('LIB: adresa magazinului depinde doar de platforma', () => {
    assert.equal(manageSubscriptionUrl('ios'), 'https://apps.apple.com/account/subscriptions');
    assert.equal(manageSubscriptionUrl('android'), 'https://play.google.com/store/account/subscriptions');
    assert.equal(manageSubscriptionUrl('web'), null, 'fara magazin nu se randeaza un link mort');
  });

  test('ECRAN PREMIUM: linkul nu e conditionat de starea abonamentului', () => {
    // Doua aparitii: declaratia si singurul loc in care se randeaza (conditia este pe existenta
    // adresei, nu pe starea abonamentului). A treia aparitie ar insemna o a doua copie, ascunsa
    // dupa o conditie de stare.
    assert.equal((PREMIUM.match(/manageSubscriptionHref/g) ?? []).length, 3);
    assert.equal((PREMIUM.match(/\{manageSubscriptionHref \? \(/g) ?? []).length, 1);
    assert.ok(PREMIUM_CODE.includes("import { manageSubscriptionUrl } from '@/lib/store-links';"));

    const linkIndex = PREMIUM.indexOf('{manageSubscriptionHref ? (');
    const cardStart = PREMIUM.lastIndexOf('<Card style={styles.disclosure}>', linkIndex);
    assert.ok(cardStart > 0 && cardStart < linkIndex, 'linkul trebuie sa fie in cardul de informatii');
    const between = PREMIUM.slice(cardStart, linkIndex);
    for (const guard of ['premiumActive', 'showPurchaseButtons', 'storeStateKnown', 'user']) {
      assert.ok(
        !between.includes(guard),
        `linkul nu are voie sa fie conditionat de "${guard}" (trebuie vizibil in toate starile)`,
      );
    }
    assert.ok(PREMIUM_CODE.includes("t('premium.manageSubscription')"));
  });

  test('CONT: linkul apare si pe cardul Abonament, si in dialogul de stergere a contului', () => {
    // Acelasi link, in ambele locuri: pe cardul "Abonament" si in dialogul de stergere (5.1.1(v)).
    assert.equal((ACCOUNT.match(/\{manageSubscriptionHref \? \(/g) ?? []).length, 1);
    assert.ok(ACCOUNT_CODE.includes("import { manageSubscriptionUrl } from '@/lib/store-links';"));
    assert.ok(
      (ACCOUNT.match(/t\('premium\.manageSubscription'\)/g) ?? []).length === 2,
      'textul de gestionare trebuie sa apara in card si in dialogul de stergere',
    );
    assert.ok(ACCOUNT_CODE.includes("onPress: () => void Linking.openURL(manageSubscriptionHref)"));
  });
});
