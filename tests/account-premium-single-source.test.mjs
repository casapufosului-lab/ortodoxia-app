/**
 * CONT + PREMIUM — ACEEAȘI SURSĂ PENTRU ABONAMENT (bug raportat de owner, poze 18:14, build 18).
 *
 * Regresia prinsă de owner: pe același telefon, în aceeași secundă, ecranul Premium scria
 * „Premium activ — abonamentul este confirmat de magazin.", iar cardul „Abonament" din tab-ul Cont
 * scria „Plan Gratuit" + „Ai 5 mesaje AI pe zi". Cauza: DOUĂ surse de adevăr —
 *   - `src/app/premium.tsx` citea entitlement-ul „premium" din RevenueCat
 *     (`customerInfo.entitlements.active['premium'].isActive`, prin hook, ca `premiumActive`);
 *   - `src/app/(tabs)/account.tsx` citea `useSubscription().isPremium`, adică rândul din tabelul
 *     `subscriptions`, iar rândul acela este scris de webhook-ul RevenueCat (întârziere de secunde
 *     sau webhook oprit ⇒ „Plan Gratuit" la nesfârșit, deși omul plătește).
 *
 * Ce apără testul de acum înainte:
 *  1. Cardul din Cont iese, în întregime (etichetă + text despre limita AI + buton), din
 *     `planSummary(...)` — adică din `premiumActive`, aceeași valoare ca ecranul Premium.
 *  2. Cu entitlement activ ⇒ plan plătit + limita Premium + „Vezi abonamentul"; fără ⇒
 *     „Plan Gratuit" + 5 mesaje + „Vezi Premium".
 *  3. Cele două ecrane NU pot ajunge în dezacord: pentru aceeași intrare, amândouă sunt „plătit"
 *     sau amândouă sunt „gratuit".
 *  4. Textul citit de om e chiar cel din `src/i18n/config.ts` și cheile există în toate cele 10 limbi.
 *
 * Ce NU dovedește: randarea reală a componentei (proiectul nu are renderer de React Native) și
 * fluxul real de cumpărare / răspunsul real al magazinului. Structural + logic, fără credențiale.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import {
  FREE_DAILY_AI_LIMIT,
  PREMIUM_DAILY_AI_LIMIT,
  planSummary,
  premiumUiState,
} from '../src/lib/subscription.ts';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const ACCOUNT_SCREEN = read('src/app/(tabs)/account.tsx');
const PREMIUM_SCREEN = read('src/app/premium.tsx');
const SUBSCRIPTION_HOOK = read('src/hooks/use-subscription.ts');
const I18N_CONFIG = read('src/i18n/config.ts');

const STORE_KNOWN = true;

/**
 * Sursa fără comentarii: numele vechilor surse (`isPremium`, `planLabel`, `dailyAiLimit`) apar în
 * comentariul care explică DE CE au fost scoase, iar prezența lor acolo e intenționată. Verificăm
 * codul, nu comentariile.
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

const ACCOUNT_CODE = stripComments(ACCOUNT_SCREEN);
const PREMIUM_CODE = stripComments(PREMIUM_SCREEN);

/** Valorile unei chei de traducere, în ordinea din fișier (prima este româna). */
function translationValues(key) {
  const re = new RegExp(`'${key}': '((?:[^'\\\\]|\\\\.)*)'`, 'g');
  return [...I18N_CONFIG.matchAll(re)].map((match) => match[1]);
}

/** „Plătit" = orice etichetă care nu este „Plan Gratuit". */
const isPaidLabel = (labelKey) => labelKey !== 'premium.planFree';

describe('CONT (cardul „Abonament") — toate cele trei texte ies din entitlement', () => {
  test('entitlement ACTIV (lunar) ⇒ plan plătit + limita Premium + „Vezi abonamentul"', () => {
    const summary = planSummary({ premiumActive: true, entitlementPlan: 'monthly' });

    assert.equal(summary.labelKey, 'premium.statusMonthly');
    assert.equal(isPaidLabel(summary.labelKey), true, 'eticheta nu mai poate fi „Plan Gratuit"');
    assert.equal(summary.bodyKey, 'account.aiMessagesPerDay');
    assert.equal(summary.bodyCount, PREMIUM_DAILY_AI_LIMIT, 'textul arată limita Premium, nu cea gratuită');
    assert.equal(summary.buttonKey, 'account.viewSubscriptionButton');
  });

  test('entitlement ACTIV (anual) ⇒ „Premium Anual"', () => {
    const summary = planSummary({ premiumActive: true, entitlementPlan: 'annual' });
    assert.equal(summary.labelKey, 'premium.statusAnnual');
  });

  test('FĂRĂ entitlement ⇒ „Plan Gratuit" + 5 mesaje + „Vezi Premium"', () => {
    const summary = planSummary({ premiumActive: false, entitlementPlan: 'monthly' });

    assert.equal(summary.labelKey, 'premium.planFree');
    assert.equal(isPaidLabel(summary.labelKey), false);
    assert.equal(summary.bodyKey, 'account.freeMessagesPerDay');
    assert.equal(summary.bodyCount, null, 'textul gratuit nu are `{count}`');
    assert.equal(summary.buttonKey, 'account.viewPremiumButton');
  });

  test('stare necunoscută (`undefined`) ⇒ tratată ca FĂRĂ entitlement (fail-closed)', () => {
    const summary = planSummary({ premiumActive: undefined, entitlementPlan: 'annual' });
    assert.equal(summary.labelKey, 'premium.planFree');
    assert.equal(summary.bodyCount, null);
    assert.equal(summary.buttonKey, 'account.viewPremiumButton');
  });
});

describe('CONT și PREMIUM nu pot ajunge în dezacord', () => {
  test('aceeași intrare (`premiumActive`) ⇒ amândouă „plătit" sau amândouă „gratuit"', () => {
    for (const premiumActive of [true, false]) {
      const account = planSummary({ premiumActive, entitlementPlan: 'monthly' });
      const premium = premiumUiState({
        premiumActive,
        premiumExpirationDate: null,
        storeStateKnown: STORE_KNOWN,
      });

      assert.equal(isPaidLabel(account.labelKey), premiumActive, 'cardul din Cont urmează entitlement-ul');
      assert.equal(isPaidLabel(premium.labelKey), premiumActive, 'ecranul Premium urmează entitlement-ul');
    }
  });

  test('STRUCTURAL: ecranul Cont citește `premiumActive`, nu rândul din baza de date', () => {
    assert.ok(
      ACCOUNT_CODE.includes(
        'const { entitlement, error: planError, isLoading: isPlanLoading, premiumActive } = useSubscription();',
      ),
      'cardul ia entitlement-ul din hook, nu `isPremium`',
    );
    assert.ok(
      ACCOUNT_CODE.includes('const plan = planSummary({ premiumActive, entitlementPlan: entitlement.plan });'),
      'eticheta, limita și butonul ies dintr-o singură valoare',
    );
    assert.equal(/\bisPremium\b/.test(ACCOUNT_CODE), false, 'a doua sursă a fost scoasă din ecran');
    assert.equal(/\bplanLabel\b/.test(ACCOUNT_CODE), false, 'eticheta nu mai vine din rândul din baza de date');
    assert.equal(/\bdailyAiLimit\b/.test(ACCOUNT_CODE), false, 'limita AI nu mai vine din `isPremium`');
  });

  test('STRUCTURAL: cardul afișează exact cele trei valori calculate', () => {
    assert.ok(ACCOUNT_CODE.includes('<Text style={styles.plan}>{planLabelText}</Text>'));
    assert.ok(ACCOUNT_CODE.includes('<Text style={styles.body}>{planBodyText}</Text>'));
    assert.ok(ACCOUNT_CODE.includes('<SecondaryButton label={t(plan.buttonKey)}'));
  });

  test('STRUCTURAL: ecranul Premium citește aceeași valoare', () => {
    assert.match(PREMIUM_CODE, /premiumScreenState\(subscription, premiumActive\)/);
    assert.equal(/\bplanLabel\b/.test(PREMIUM_CODE), false);
  });

  test('HOOK: `premiumActive` chiar este entitlement-ul din RevenueCat, ajuns la ecrane', () => {
    assert.ok(SUBSCRIPTION_HOOK.includes('premiumActive: revenueCat.premiumActive,'));
  });
});

describe('Textele citite de om (RO, prima limbă din fișier)', () => {
  test('cheile folosite de card există în toate cele 10 limbi', () => {
    const keys = [
      'premium.planFree',
      'premium.statusAnnual',
      'premium.statusMonthly',
      'account.aiMessagesPerDay',
      'account.freeMessagesPerDay',
      'account.viewSubscriptionButton',
      'account.viewPremiumButton',
    ];

    for (const key of keys) {
      assert.equal(translationValues(key).length, 10, `cheia ${key} trebuie să existe în 10 limbi`);
    }
  });

  test('textul românesc este cel din pozele ownerului', () => {
    assert.equal(translationValues('premium.planFree')[0], 'Plan Gratuit');
    assert.equal(translationValues('premium.statusMonthly')[0], 'Premium Lunar');
    assert.equal(translationValues('premium.statusAnnual')[0], 'Premium Anual');
    assert.equal(translationValues('account.viewSubscriptionButton')[0], 'Vezi abonamentul');
    assert.equal(translationValues('account.viewPremiumButton')[0], 'Vezi Premium');
    assert.match(translationValues('account.aiMessagesPerDay')[0], /\{count\}/);
    assert.equal(translationValues('account.freeMessagesPerDay')[0].startsWith('Ai 5 mesaje AI pe zi'), true);
  });

  test('limita afișată la abonat este cea Premium, nu cea gratuită', () => {
    assert.equal(FREE_DAILY_AI_LIMIT, 5);
    assert.equal(PREMIUM_DAILY_AI_LIMIT, 50);

    const activeText = translationValues('account.aiMessagesPerDay')[0].replace(
      '{count}',
      String(planSummary({ premiumActive: true }).bodyCount),
    );
    assert.equal(activeText, 'Ai 50 de mesaje AI pe zi.');
  });
});
