/**
 * Poziția PREMIUM (c) din planul de lansare: link real „Gestionează abonamentul".
 *
 * Ce apără testul:
 *  1. LOGICA (importă codul real `src/lib/store-links.ts`): pe Android adresa duce în pagina de
 *     abonamente a Google Play, pe iOS în cea a App Store, iar pe orice altă platformă NU se inventează
 *     un link (întoarce `null`).
 *  2. CABLAJUL din `src/app/premium.tsx`: ecranul folosește chiar ajutorul de mai sus și deschide
 *     adresa cu `Linking.openURL(...)`, pe un element cu rol de link; fără asta, textul rămânea doar o
 *     descriere („Setări → Abonamente, în contul App Store sau Google Play") și omul trebuia să caute.
 *  3. TRADUCERILE: cheia `premium.manageSubscription` există exact o dată per limbă (10), valorile sunt
 *     traduse (fără cuvinte latine rămase în limbile cu alt alfabet) și nu au introdus ghilimele
 *     escapate în `config.ts`.
 *
 * Ce NU dovedește: randarea reală a componentei (proiectul nu are renderer React Native) și
 * deschiderea efectivă a magazinului pe telefon.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import {
  APP_STORE_SUBSCRIPTIONS_URL,
  GOOGLE_PLAY_SUBSCRIPTIONS_URL,
  manageSubscriptionUrl,
} from '../src/lib/store-links.ts';

const PREMIUM_SCREEN = readFileSync('src/app/premium.tsx', 'utf8');
const I18N_CONFIG = readFileSync('src/i18n/config.ts', 'utf8');
const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

describe('PREMIUM (c): adresa de gestionare a abonamentului, pe platformă', () => {
  test('Android → pagina de abonamente Google Play', () => {
    assert.equal(manageSubscriptionUrl('android'), GOOGLE_PLAY_SUBSCRIPTIONS_URL);
    assert.equal(manageSubscriptionUrl('android'), 'https://play.google.com/store/account/subscriptions');
  });

  test('iOS → pagina de abonamente App Store', () => {
    assert.equal(manageSubscriptionUrl('ios'), APP_STORE_SUBSCRIPTIONS_URL);
  });

  test('platformă necunoscută → null, nu un link greșit', () => {
    for (const platform of ['web', 'windows', 'macos', '', 'ANDROID']) {
      assert.equal(manageSubscriptionUrl(platform), null, `platformă tratată greșit: ${platform}`);
    }
  });
});

describe('PREMIUM (c): ecranul Premium chiar deschide linkul', () => {
  test('STRUCTURAL: importă ajutorul, calculează adresa și o deschide cu Linking', () => {
    assert.match(PREMIUM_SCREEN, /import \{[\s\S]*?manageSubscriptionUrl[\s\S]*?\} from '@\/lib\/store-links'/);
    assert.match(PREMIUM_SCREEN, /Linking\.openURL\(manageSubscriptionHref\)/, 'adresa trebuie deschisă chiar cu Linking.openURL');
    assert.match(PREMIUM_SCREEN, /manageSubscriptionUrl\(Platform\.OS\)/, 'adresa trebuie aleasă după platformă');
    assert.match(PREMIUM_SCREEN, /accessibilityRole="link"/, 'elementul trebuie anunțat ca link pentru cititoarele de ecran');
  });

  test('STRUCTURAL: linkul apare doar când există adresă pentru platformă', () => {
    assert.match(PREMIUM_SCREEN, /\{manageSubscriptionHref \?/, 'fără adresă nu se randează un link mort');
  });

  test('STRUCTURAL: eticheta vine din traduceri, nu e scrisă direct în cod', () => {
    assert.match(PREMIUM_SCREEN, /t\('premium\.manageSubscription'\)/);
  });
});

describe('PREMIUM (c): eticheta linkului, în toate limbile', () => {
  test('cheia există exact o dată per limbă (10 apariții)', () => {
    const count = (I18N_CONFIG.match(/'premium\.manageSubscription':/g) ?? []).length;
    assert.equal(count, LOCALES.length);
  });

  test('valorile sunt traduse și curate (fără escape-uri, fără caractere pierdute)', () => {
    const values = [...I18N_CONFIG.matchAll(/'premium\.manageSubscription': '([^']*)'/g)].map((m) => m[1]);
    assert.equal(values.length, LOCALES.length);
    values.forEach((value, index) => {
      assert.ok(value.trim().length > 5, `valoare suspect de scurtă: ${value}`);
      assert.ok(!value.includes("\\'"), `valoare cu ghilimele escapate: ${value}`);
      assert.ok(!value.includes('\uFFFD'), `caracter pierdut în traducere: ${value}`);
      // Limbile cu alt alfabet (el, sr, bg, mk, uk, ka, ru — indicii 2..8) nu au voie să conțină
      // cuvinte latine rămase netraduse. `sq` (indicele 9) folosește alfabetul latin, deci e exclus.
      if (index >= 2 && index <= 8) {
        assert.ok(!/[A-Za-z]{3,}/.test(value), `text latin neașteptat în limba non-latină: ${value}`);
      }
    });
  });
});
