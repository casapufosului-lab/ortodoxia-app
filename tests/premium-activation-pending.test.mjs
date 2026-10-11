/**
 * Poziția B1 din audit: „Premium depinde doar de webhook, fără plasă de siguranță".
 *
 * Ce apără testul:
 *  1. LOGICA (importă codul real `src/lib/subscription.ts`): când magazinul confirmă abonamentul, dar
 *     rândul din `subscriptions` nu a ajuns încă (webhook întârziat SAU webhook oprit), ecranul intră în
 *     starea `activation-pending` — plata e recunoscută, dar NU se acordă acces Premium din magazine și
 *     NU se mai afișează butoanele de cumpărare (utilizatorul ar fi împins să plătească a doua oară).
 *  2. CABLAJUL din `src/app/premium.tsx`: mesajul de activare în curs e randat și trece prin
 *     `fillLegal` (deci adresa de suport e chiar înlocuită, nu rămâne `{supportAddress}` pe ecran),
 *     iar eroarea de citire a abonamentului nu mai e înghițită.
 *  3. TRADUCERILE: cheia `premium.activationPending` există în toate cele 10 limbi, conține
 *     `{supportAddress}` și nu a introdus ghilimele escapate în `config.ts`.
 *
 * Ce NU dovedește: randarea reală a componentei (proiectul nu are renderer de React Native) și fluxul
 * real de cumpărare. Structural + logic, fără credențiale și fără apeluri către magazine.
 *
 * BUILD 18 (10.10.2026): al doilea argument al `premiumScreenState` este CHIAR `premiumActive` —
 * valoarea unica a ecranului, derivata in `use-revenuecat.ts` din
 * `customerInfo.entitlements.active['premium']`. Inainte, ecranul isi calcula separat starea
 * magazinului (`Boolean(revenueCatActive && isRevenueCatConfigured())`), iar butoanele de cumparare
 * aveau o a treia expresie (`shouldShowPurchaseButtons(screenState) && !entitlementActive`): pe
 * build 16 asta a produs „Plan Gratuit" cu butoanele ascunse deja. Vezi
 * `tests/premium-single-source.test.mjs` pentru paza noua.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import {
  hasPremiumAccess,
  PENDING_ACTIVATION_POLL_INTERVAL_MS,
  PENDING_ACTIVATION_POLL_MAX_ATTEMPTS,
  premiumScreenState,
  shouldPollPendingActivation,
  shouldShowPurchaseButtons,
} from '../src/lib/subscription.ts';
import { fillLegalPlaceholders } from '../src/lib/legal-values.ts';

const PREMIUM_SCREEN = readFileSync('src/app/premium.tsx', 'utf8');
const I18N_CONFIG = readFileSync('src/i18n/config.ts', 'utf8');

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

const activeRow = { status: 'active', plan: 'monthly', current_period_end: FUTURE, cancel_at_period_end: false };
const expiredRow = { status: 'active', plan: 'monthly', current_period_end: PAST, cancel_at_period_end: false };

describe('B1: plasa de siguranță pentru Premium (webhook oprit/întârziat)', () => {
  test('webhook oprit: magazinul confirmă abonamentul, baza de date nu are rândul', () => {
    assert.equal(hasPremiumAccess(null), false, 'fără rând în subscriptions nu se acordă acces Premium');
    assert.equal(premiumScreenState(null, true), 'activation-pending');
    assert.equal(shouldShowPurchaseButtons('activation-pending'), false, 'nu i se oferă din nou cumpărarea');
  });

  test('webhook întârziat: rând vechi/expirat, dar magazinul confirmă încă abonamentul', () => {
    assert.equal(premiumScreenState(expiredRow, true), 'activation-pending');
    assert.equal(shouldShowPurchaseButtons('activation-pending'), false);
  });

  test('abonament real activ: rândul din baza de date confirmă (are prioritate)', () => {
    assert.equal(premiumScreenState(activeRow, true), 'active');
    assert.equal(premiumScreenState(activeRow, false), 'active');
    assert.equal(shouldShowPurchaseButtons('active'), false, 'un abonat nu are ce să mai cumpere');
  });

  test('fără abonament nicăieri: stare liberă, butoanele de cumpărare se afișează', () => {
    for (const storeEntitled of [false, null, undefined]) {
      assert.equal(premiumScreenState(null, storeEntitled), 'free');
      assert.equal(premiumScreenState(expiredRow, storeEntitled), 'free');
      assert.equal(shouldShowPurchaseButtons('free'), true);
    }
  });

  test('anulare cu perioadă plătită rămasă: magazinul nu mai raportează entitlement, rândul da', () => {
    const canceledUntilEnd = { ...activeRow, status: 'canceled', cancel_at_period_end: true };
    assert.equal(premiumScreenState(canceledUntilEnd, false), 'active');
  });

  test('starea de așteptare NU acordă acces Premium', () => {
    // Fail closed: plasa de siguranță este strict informativă (mesaj + contact), nu o a doua sursă de
    // adevăr pentru entitlement. Accesul rămâne exclusiv pe rândul verificabil din baza de date.
    const state = premiumScreenState(null, true);
    assert.equal(state, 'activation-pending');
    assert.notEqual(state, 'active');
    assert.equal(hasPremiumAccess(null), false);
  });

  test('re-verificarea cât timp webhook-ul întârzie este mărginită (~1 minut), nu infinită', () => {
    assert.equal(PENDING_ACTIVATION_POLL_INTERVAL_MS, 5_000);
    assert.equal(PENDING_ACTIVATION_POLL_MAX_ATTEMPTS, 12);
    assert.ok(
      (PENDING_ACTIVATION_POLL_INTERVAL_MS * PENDING_ACTIVATION_POLL_MAX_ATTEMPTS) / 1000 <= 60,
      'fereastra de re-verificare trebuie să rămână sub un minut',
    );
    for (let attempt = 1; attempt < PENDING_ACTIVATION_POLL_MAX_ATTEMPTS; attempt += 1) {
      assert.equal(shouldPollPendingActivation('activation-pending', attempt), true, `tentativa ${attempt}`);
    }
    // La limită și după ea, polling-ul se oprește: rămâne mesajul vizibil cu adresa de suport.
    assert.equal(shouldPollPendingActivation('activation-pending', PENDING_ACTIVATION_POLL_MAX_ATTEMPTS), false);
    assert.equal(shouldPollPendingActivation('activation-pending', PENDING_ACTIVATION_POLL_MAX_ATTEMPTS + 5), false);
    // Nu se interoghează baza de date în stările în care nu are rost.
    assert.equal(shouldPollPendingActivation('active', 0), false);
    assert.equal(shouldPollPendingActivation('free', 0), false);
  });
});

describe('B1: cablajul ecranului Premium (STRUCTURAL)', () => {
  test('STRUCTURAL: starea ecranului derivă din rândul din baza de date + entitlement-ul magazinului', () => {
    assert.match(PREMIUM_SCREEN, /import \{[^}]*premiumScreenState[^}]*\} from '@\/lib\/subscription'/);
    assert.match(PREMIUM_SCREEN, /premiumScreenState\(subscription, premiumActive\)/);
  });

  test('STRUCTURAL: butoanele de cumpărare sunt condiționate de shouldShowPurchaseButtons', () => {
    // Build 18: butoanele NU mai au o expresie separata — ies din aceeasi valoare ca eticheta.
    assert.match(PREMIUM_SCREEN, /showPurchaseButtons \} = premiumUiState\(\{/);
    assert.ok(
      !/shouldShowPurchaseButtons\(screenState\)/.test(PREMIUM_SCREEN),
      'interzis: a doua expresie care decide butoanele',
    );
    const occurrences = (PREMIUM_SCREEN.match(/\{showPurchaseButtons \?/g) ?? []).length;
    assert.equal(occurrences, 2, 'ambele planuri (lunar + anual) trebuie condiționate');
  });

  test('STRUCTURAL: mesajul de activare în curs este randat prin fillLegal (adresa de suport reală)', () => {
    assert.match(PREMIUM_SCREEN, /screenState === 'activation-pending' \?/);
    assert.match(PREMIUM_SCREEN, /fillLegal\(t\('premium\.activationPending'\)\)/);
    assert.match(PREMIUM_SCREEN, /const fillLegal = useLegalFill\(\)/);
  });

  test('STRUCTURAL: eroarea de citire a abonamentului este afișată, nu înghițită', () => {
    assert.match(PREMIUM_SCREEN, /const \{ dailyAiLimit, error,[^}]*\} = useSubscription\(\)/);
    assert.match(PREMIUM_SCREEN, /\{error \? <Text[^>]*>\{error\}<\/Text> : null\}/);
  });

  test('STRUCTURAL: re-verificarea periodică folosește politica mărginită și se curăță la demontare', () => {
    assert.match(PREMIUM_SCREEN, /import \{[\s\S]*?shouldPollPendingActivation,[\s\S]*?\} from '@\/lib\/subscription'/);
    assert.match(PREMIUM_SCREEN, /useEffect\(\(\) => \{\r?\n\s*if \(screenState !== 'activation-pending'\) return undefined;/);
    assert.match(PREMIUM_SCREEN, /shouldPollPendingActivation\(screenState, attempts\)/);
    assert.match(PREMIUM_SCREEN, /PENDING_ACTIVATION_POLL_INTERVAL_MS/);
    assert.match(PREMIUM_SCREEN, /return \(\) => clearInterval\(timer\);/);
    assert.match(PREMIUM_SCREEN, /const \{ dailyAiLimit, error,[^}]*refresh,[^}]*\} = useSubscription\(\);/);
  });
});

describe('B1: textul de activare în curs, în toate limbile', () => {
  const locales = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

  test('cheia există exact o dată per limbă (10 apariții)', () => {
    const count = (I18N_CONFIG.match(/'premium\.activationPending':/g) ?? []).length;
    assert.equal(count, locales.length);
  });

  test('fiecare valoare conține {supportAddress} și nu conține escape-uri periculoase', () => {
    const values = [...I18N_CONFIG.matchAll(/'premium\.activationPending': '([^']*)'/g)].map((m) => m[1]);
    assert.equal(values.length, locales.length);
    values.forEach((value, index) => {
      assert.match(value, /\{supportAddress\}/, `valoare fără placeholder: ${value}`);
      assert.ok(!value.includes("\\'"), `valoare cu ghilimele escapate: ${value}`);
      assert.ok(value.trim().length > 30, `valoare suspect de scurtă: ${value}`);
      // Limbile cu alt alfabet (el, sr, bg, mk, uk, ka, ru — indicii 2..8) nu au voie să conțină
      // cuvinte latine rămase netraduse. `sq` (indicele 9) folosește alfabetul latin, deci e exclus.
      if (index >= 2 && index <= 8) {
        const withoutPlaceholder = value.replace('{supportAddress}', '');
        assert.ok(!/[A-Za-z]{4,}/.test(withoutPlaceholder), `text latin neașteptat în limba non-latină: ${value}`);
      }
    });
  });

  test('placeholderul este chiar înlocuit de fillLegalPlaceholders, nu afișat brut', () => {
    const rendered = fillLegalPlaceholders(
      'Plata a fost înregistrată. Scrie-ne la {supportAddress} și îl activăm noi.',
      'NECONFIGURAT',
      {
        legalEntity: 'Entitate SRL',
        supportEmail: 'suport@exemplu.test',
        postalAddress: 'Adresa 1',
        jurisdiction: 'România',
        locality: 'București',
        privacyPolicyUrl: 'https://exemplu.test/privacy',
        termsUrl: 'https://exemplu.test/terms',
        effectiveDate: '2026-10-08',
      },
    );
    assert.match(rendered, /suport@exemplu\.test/);
    assert.ok(!rendered.includes('{supportAddress}'));
  });
});
