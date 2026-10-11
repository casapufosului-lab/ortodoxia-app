/**
 * PREMIUM — O SINGURĂ SURSĂ DE ADEVĂR PENTRU ECRAN (build 18, 10.10.2026).
 *
 * Regresia prinsă de owner pe build 16: ecranul Premium scria „Plan Gratuit" ȘI butoanele
 * „Activează planul lunar/anual" dispăruseră. Cauza: eticheta planului și vizibilitatea butoanelor
 * erau decise de DOUĂ expresii diferite — eticheta din rândul din `subscriptions` (baza de date),
 * butoanele din entitlement-ul RevenueCat (care ERA activ). Două surse ⇒ două răspunsuri pe același
 * ecran.
 *
 * Ce apără testul de acum înainte (cerințele 1–4 din task):
 *  1. `premium` (= `customerInfo.entitlements.active['premium']`, după `lookup_key`) se calculează
 *     O SINGURĂ DATĂ, în `src/hooks/use-revenuecat.ts`, și ajunge la ecran prin `use-subscription.ts`.
 *  2. Eticheta, data de expirare și butoanele ies TOATE din `premiumUiState(...)` și nu mai pot fi în
 *     dezacord: entitlement activ ⇒ „Premium activ" + expirare + butoane ASCUNSE; absent ⇒
 *     „Plan Gratuit" + butoane VIZIBILE.
 *  3. În `src/app/premium.tsx` nu mai există a doua expresie (interzis explicit de cerința 4).
 *  4. Textul citit de om e chiar cel din `src/i18n/config.ts` (RO, prima limbă din fișier) și cheile
 *     există în toate cele 10 limbi.
 *
 * Ce NU dovedește: randarea reală a componentei (proiectul nu are renderer de React Native) și fluxul
 * real de cumpărare. Structural + logic, fără credențiale și fără apeluri către magazine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import { premiumUiState } from '../src/lib/subscription.ts';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const PREMIUM_SCREEN = read('src/app/premium.tsx');
const RC_HOOK = read('src/hooks/use-revenuecat.ts');
const SUBSCRIPTION_HOOK = read('src/hooks/use-subscription.ts');
const REVENUECAT_LIB = read('src/lib/revenuecat.ts');
const SUBSCRIPTION_LIB = read('src/lib/subscription.ts');
const I18N_CONFIG = read('src/i18n/config.ts');

const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
const STORE_KNOWN = true;
const STORE_UNKNOWN = false;

/** Valorile unei chei de traducere, în ordinea din fișier (prima este româna). */
function translationValues(key) {
  const re = new RegExp(`'${key}': '((?:[^'\\\\]|\\\\.)*)'`, 'g');
  return [...I18N_CONFIG.matchAll(re)].map((match) => match[1]);
}

describe('PREMIUM: eticheta și butoanele ies din ACEEAȘI valoare (`premium`)', () => {
  test('entitlement ACTIV ⇒ „Premium activ" + data de expirare + butoane ASCUNSE', () => {
    const state = premiumUiState({
      premiumActive: true,
      premiumExpirationDate: FUTURE,
      storeStateKnown: STORE_KNOWN,
    });
    assert.equal(state.labelKey, 'premium.entitlementActive');
    assert.equal(state.expirationDate, FUTURE, 'data de expirare vine din entitlement-ul activ');
    assert.equal(state.showPurchaseButtons, false);
  });

  test('entitlement ABSENT ⇒ „Plan Gratuit" + butoane VIZIBILE', () => {
    const state = premiumUiState({
      premiumActive: false,
      premiumExpirationDate: null,
      storeStateKnown: STORE_KNOWN,
    });
    assert.equal(state.labelKey, 'premium.planFree');
    assert.equal(state.expirationDate, null);
    assert.equal(state.showPurchaseButtons, true);
  });

  test('cele două nu pot ajunge în dezacord: un singur `premiumActive` le decide pe amândouă', () => {
    for (const premiumActive of [true, false]) {
      for (const premiumExpirationDate of [FUTURE, null, undefined]) {
        const state = premiumUiState({ premiumActive, premiumExpirationDate, storeStateKnown: STORE_KNOWN });
        assert.equal(state.showPurchaseButtons, !premiumActive, 'butoanele urmează entitlement-ul');
        assert.equal(
          state.labelKey,
          premiumActive ? 'premium.entitlementActive' : 'premium.planFree',
          'eticheta urmează EXACT aceeași valoare ca butoanele',
        );
      }
    }
  });

  test('BUG-ul din build 16 (entitlement activ + rând din baza de date lipsă) nu mai poate reapărea', () => {
    // Magazinul a confirmat, dar webhook-ul n-a scris încă rândul în `subscriptions`: aici contează
    // doar entitlement-ul, deci fără butoane și cu eticheta „Premium activ" — nu „Plan Gratuit" cu
    // butoanele ascunse, cum arăta build 16.
    const state = premiumUiState({
      premiumActive: true,
      premiumExpirationDate: FUTURE,
      storeStateKnown: STORE_UNKNOWN,
    });
    assert.equal(state.showPurchaseButtons, false);
    assert.equal(state.labelKey, 'premium.entitlementActive');
  });

  test('fail-closed: când starea magazinului e NECUNOSCUTĂ nu se oferă din nou cumpărarea', () => {
    const state = premiumUiState({
      premiumActive: false,
      premiumExpirationDate: null,
      storeStateKnown: STORE_UNKNOWN,
    });
    assert.equal(state.showPurchaseButtons, false, 'un posibil abonat nu e împins să cumpere a doua oară');
    assert.equal(state.labelKey, 'premium.planFree');
  });

  test('TEXTUL citit de om, în română: „Premium activ" și „Plan Gratuit"', () => {
    const active = translationValues('premium.entitlementActive');
    const free = translationValues('premium.planFree');
    assert.equal(active.length, 10, 'cheia „Premium activ" trebuie să existe în 10 limbi');
    assert.equal(free.length, 10, 'cheia „Plan Gratuit" trebuie să existe în 10 limbi');
    assert.ok(active[0].startsWith('Premium activ'), `româna trebuie să spună „Premium activ", nu „${active[0]}"`);
    assert.equal(free[0], 'Plan Gratuit', `româna trebuie să spună „Plan Gratuit", nu „${free[0]}"`);
  });
});

describe('PREMIUM: cablajul „o singură sursă de adevăr" (STRUCTURAL)', () => {
  test('LIB: `premium` înseamnă `entitlements.active[\'premium\']` (`lookup_key`), nu altceva', () => {
    assert.ok(REVENUECAT_LIB.includes("export const PREMIUM_ENTITLEMENT_ID = 'premium';"));
    assert.ok(REVENUECAT_LIB.includes('info?.entitlements.active[PREMIUM_ENTITLEMENT_ID]'));
  });

  test('HOOK: valoarea `premium` se calculează o singură dată, din customerInfo', () => {
    assert.ok(
      RC_HOOK.includes('const premium = currentCustomerInfo?.entitlements.active[PREMIUM_ENTITLEMENT_ID] ?? null;'),
    );
    assert.ok(RC_HOOK.includes('const premiumActive = premium?.isActive === true;'));
    assert.equal(
      (RC_HOOK.match(/entitlements\.active\[PREMIUM_ENTITLEMENT_ID\]/g) ?? []).length,
      1,
      'valoarea se citește într-un singur loc, ca să nu existe două adevăruri',
    );
  });

  test('HOOK: `premium`, `premiumActive` și `premiumKnown` sunt expuse mai departe', () => {
    assert.match(RC_HOOK, /\n    premium,\n    premiumActive,\n    premiumKnown,\n/);
    assert.ok(SUBSCRIPTION_HOOK.includes('premium: revenueCat.premium,'));
    assert.ok(SUBSCRIPTION_HOOK.includes('premiumActive: revenueCat.premiumActive,'));
    assert.ok(SUBSCRIPTION_HOOK.includes('premiumKnown: revenueCat.premiumKnown,'));
  });

  test('ECRAN: eticheta si expirarea ies din `premiumUiState(...)`, butoanele din `premiumPlanActions(...)`', () => {
    assert.ok(
      PREMIUM_SCREEN.includes(
        // T4 (10.10.2026): apelul primeste acum si fereastra „necunoscut” (storeStateUnknownError /
        // storeStateUnknownExpired), ca butoanele de cumparare sa apara la 10 s sau la o eroare de
        // citire. Regula testului rămâne neschimbată: eticheta, expirarea si butoanele ies toate din
        // acelasi `premiumUiState(...)`.
        'const { labelKey: premiumLabelKey, expirationDate: expiryIso } = premiumUiState({',
      ),
      'ecranul trebuie să derive toată starea de abonament din `premiumUiState(...)`',
    );
    assert.ok(PREMIUM_SCREEN.includes("t('premium.statusChecking') : premiumLabel"));
    assert.ok(PREMIUM_SCREEN.includes("t('premium.expiryLabel').replace('{date}', expiryDate)"));
    assert.ok(PREMIUM_SCREEN.includes('premiumExpirationDate: premium?.expirationDate ?? null'));
    assert.ok(PREMIUM_SCREEN.includes('storeStateKnown: premiumKnown'));
    assert.ok(PREMIUM_SCREEN.includes('storeStateUnknownError'));
    assert.ok(PREMIUM_SCREEN.includes('storeStateUnknownExpired'));
    // T3 (build 21, 11.10.2026): butoanele NU mai au o a doua regulă în ecran - ies din
    // `premiumPlanActions(...)`, o funcție PURĂ din același modul, testată în
    // `premium-plan-actions.test.mjs`. Ecranul o cheamă o dată per plan, prin `planCardBody`.
    assert.ok(PREMIUM_SCREEN.includes('const planActions = premiumPlanActions({'));
    assert.ok(PREMIUM_SCREEN.includes('activeProductId: premium?.productIdentifier ?? null,'));
    assert.ok(PREMIUM_SCREEN.includes('storeStateUnknown: storeStateUnresolved,'));
    assert.equal(
      (PREMIUM_SCREEN.match(/\{planCardBody\(planActions\./g) ?? []).length,
      2,
      'ambele planuri (lunar + anual) isi iau randul din actiunea planului lor',
    );
    // Regula veche rămâne ca interdicție: `showPurchaseButtons` nu mai decide niciun buton în ecran.
    assert.equal((PREMIUM_SCREEN.match(/\{showPurchaseButtons \? \(/g) ?? []).length, 0);
  });

  test('ECRAN: interzis — o a doua expresie care decide eticheta sau butoanele', () => {
    assert.ok(!/entitlementActive/.test(PREMIUM_SCREEN), 'entitlement-ul nu se mai citește separat în ecran');
    assert.ok(!/shouldShowPurchaseButtons/.test(PREMIUM_SCREEN), 'butoanele nu mai au expresia lor separată');
    assert.ok(!/\bplanLabel\b/.test(PREMIUM_SCREEN), 'eticheta nu mai vine din rândul din baza de date');
    assert.ok(!/revenueCatActive/.test(PREMIUM_SCREEN), 'ecranul nu mai ține o a doua stare a magazinului');
  });

  test('LIB: `premiumUiState` nu atinge rândul din `subscriptions` (doar entitlement-ul)', () => {
    const start = SUBSCRIPTION_LIB.indexOf('export function premiumUiState(');
    assert.ok(start > 0, 'funcția lipsește');
    const body = SUBSCRIPTION_LIB.slice(start, SUBSCRIPTION_LIB.indexOf('\n}\n', start));
    assert.ok(body.length > 100, 'nu am găsit corpul funcției');
    assert.ok(!body.includes('subscription'), 'valoarea unică nu are voie să depindă de baza de date');
    assert.ok(!body.includes('hasPremiumAccess'), 'valoarea unică nu se deduce din altă regulă de acces');
  });
});
