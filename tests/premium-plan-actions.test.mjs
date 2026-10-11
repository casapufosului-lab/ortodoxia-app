/**
 * PREMIUM — ACȚIUNEA FIECĂRUI PLAN (T3, build 21, 11.10.2026).
 *
 * BUGUL CARE A ARS 20 DE BUILD-URI: un cont nou a apăsat „Lunar", apoi „Anual" — și căsuța a
 * dispărut. Cauza NU era pe server: `src/app/premium.tsx` randa butoanele doar dacă NU exista
 * abonament activ, deci prima cumpărare ascundea AMBELE butoane și un abonat lunar nu putea niciodată
 * să treacă pe anual din aplicație.
 *
 * REGULA NOUĂ, într-un singur loc: `premiumPlanActions(...)` din `src/lib/subscription.ts` întoarce,
 * pentru fiecare plan, una din cele patru acțiuni:
 *   'subscribe' — se poate cumpăra (nu există abonament, planul e vandabil, fereastra „necunoscut" e închisă);
 *   'current'   — ACESTA este planul activ („Planul tău actual", fără buton);
 *   'switch'    — celălalt plan al unui abonat: buton de schimbare, apăsat ⇒ fereastra magazinului
 *                 (magazinul decide dacă se aplică imediat sau la reînnoire);
 *   'pending'   — fără buton: fereastra „magazinul nu a răspuns încă", plan nevandabil, sau nu știm ce
 *                 produs este activ (nu vindem niciodată un plan pe care omul îl poate avea deja).
 *
 * Testul este comportamental: cheamă funcția reală, cu intrările reale. Ecranul este pin-uit structural
 * în `premium-single-source.test.mjs` (zero `{showPurchaseButtons ? (`, exact două `planCardBody(planActions.`).
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { premiumPlanActions } from '../src/lib/subscription.ts';

const MONTHLY_ID = 'ro.orthodoxia.premium.monthly';
const ANNUAL_ID = 'ro.orthodoxia.premium.annual';

/** Intrările care descriu un cont fără abonament, cu magazinul citit și ambele planuri vandabile. */
const FREE_AND_KNOWN = {
  premiumActive: false,
  activeProductId: null,
  monthlyProductId: MONTHLY_ID,
  annualProductId: ANNUAL_ID,
  monthlyPurchasable: true,
  annualPurchasable: true,
  storeStateUnknown: false,
};

const actionsFor = (overrides) => premiumPlanActions({ ...FREE_AND_KNOWN, ...overrides });

describe('T3: acțiunea fiecărui plan (o singură regulă, patru rezultate)', () => {
  test('fără abonament, magazinul răspuns: ambele planuri se pot cumpăra', () => {
    assert.deepEqual(actionsFor({}), { monthly: 'subscribe', annual: 'subscribe' });
  });

  test('fără abonament, plan nevandabil: planul acela NU primește buton (nu promitem ce nu se poate vinde)', () => {
    assert.deepEqual(
      actionsFor({ monthlyPurchasable: false }),
      { monthly: 'pending', annual: 'subscribe' },
    );
    assert.deepEqual(
      actionsFor({ annualPurchasable: false }),
      { monthly: 'subscribe', annual: 'pending' },
    );
    assert.deepEqual(
      actionsFor({ monthlyPurchasable: false, annualPurchasable: false }),
      { monthly: 'pending', annual: 'pending' },
    );
  });

  test('fereastra „magazinul nu a răspuns încă" e deschisă: NICIUN buton (regula ownerului)', () => {
    assert.deepEqual(
      actionsFor({ storeStateUnknown: true }),
      { monthly: 'pending', annual: 'pending' },
    );
    // Chiar dacă planurile arată vandabile: cât timp nu știm starea magazinului, nu oferim nimic.
    assert.deepEqual(
      actionsFor({ storeStateUnknown: true, monthlyPurchasable: true, annualPurchasable: true }),
      { monthly: 'pending', annual: 'pending' },
    );
  });

  test('abonat LUNAR: lunarul e „Planul tău actual", anualul primește butonul de schimbare', () => {
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: MONTHLY_ID }),
      { monthly: 'current', annual: 'switch' },
    );
  });

  test('abonat ANUAL: invers (simetria, exact cazul care lipsea în buildurile 1-20)', () => {
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: ANNUAL_ID }),
      { monthly: 'switch', annual: 'current' },
    );
  });

  test('abonat, dar produsul activ nu e în catalogul citit: niciun buton (nu ghicim planul)', () => {
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: 'ro.orthodoxia.premium.weekly' }),
      { monthly: 'pending', annual: 'pending' },
    );
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: null }),
      { monthly: 'pending', annual: 'pending' },
    );
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: MONTHLY_ID, monthlyProductId: null, annualProductId: null }),
      { monthly: 'pending', annual: 'pending' },
    );
  });

  test('abonat, dar planul celălalt nu e vandabil: „pending" în loc de „switch"', () => {
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: MONTHLY_ID, annualPurchasable: false }),
      { monthly: 'current', annual: 'pending' },
    );
  });

  test('abonat + fereastra „necunoscut": regula produsului activ are prioritate (combinație inaccesibilă din ecran)', () => {
    // De ce e inaccesibilă: `premiumActive` și `premiumKnown` ies din ACELAȘI `customerInfo`
    // (`use-revenuecat.ts:259` — `premiumActive = premium?.isActive === true`; `:265` —
    // `premiumKnown = currentCustomerInfo !== null || ...`), iar ecranul calculează
    // `storeStateUnresolved = !premiumKnown && ...`. Deci `premiumActive: true` ⇒ `premiumKnown: true`
    // ⇒ fereastra e închisă. Pin-ul de față apără ORDINEA regulilor: dacă cineva ar pune garda de
    // „necunoscut" înaintea regulii produsului activ, un abonat și-ar pierde butonul de schimbare.
    assert.deepEqual(
      actionsFor({ premiumActive: true, activeProductId: MONTHLY_ID, storeStateUnknown: true }),
      { monthly: 'current', annual: 'switch' },
    );
  });

  test('intrări lipsă/`undefined` nu deschid o cale de cumpărare: se citesc strict', () => {
    // `monthlyPurchasable` necunoscut nu înseamnă „vandabil" (se compară cu `=== true`).
    assert.deepEqual(
      actionsFor({ monthlyPurchasable: undefined }),
      { monthly: 'pending', annual: 'subscribe' },
    );
    // Starea de abonament necunoscută nu înseamnă „abonat": se tratează ca fără abonament.
    assert.deepEqual(
      actionsFor({ premiumActive: undefined, activeProductId: MONTHLY_ID }),
      { monthly: 'subscribe', annual: 'subscribe' },
    );
  });
});
