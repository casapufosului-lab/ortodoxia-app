/**
 * PAYWALL: butonul de cumpărare urmează starea REALĂ a magazinului (OBIECTIV 1).
 *
 * Ce apără testul, măsurat pe 08.10.2026: pe un build instalat cu `adb`, la apăsarea „Activează
 * planul" Google Play răspundea „The item you were attempting to purchase could not be found.",
 * dar ecranul Premium ținea butonul activ și afișa prețurile 18,99 / 159,99 RON — luate din
 * catalogul RevenueCat, nu din produsul magazinului. Adică omul apăsa un buton care nu putea
 * duce nicăieri, cu un preț care nu venea de la cine vinde.
 *
 * Ce verifică:
 *  1. LOGICA (importă codul real `src/lib/subscription.ts`): starea de cumpărare pentru fiecare
 *     situație — fără oferte, fără pachetul planului, pachet fără preț, dispozitiv care nu poate
 *     cumpăra, necunoscut (`null`), cumpărabil — și mesajul DISTINCT al fiecăreia.
 *  2. CABLAJUL: ecranul Premium își ia starea din hook (`availabilityFor`) și dezactivează butonul
 *     când planul nu e cumpărabil; prețul afișat vine din `priceString`-ul magazinului.
 *  3. TRADUCERILE: textele noi există în toate cele 10 limbi, ne-goale și distincte.
 *
 * Ce NU dovedește: randarea reală a componentei (proiectul nu are renderer de React Native) și
 * fluxul real de cumpărare. Fără credențiale, fără apeluri către magazine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import {
  isPurchasable,
  purchaseAvailability,
  purchaseAvailabilityMessageKey,
} from '../src/lib/subscription.ts';

const PREMIUM_SCREEN = readFileSync('src/app/premium.tsx', 'utf8');
const RC_HOOK = readFileSync('src/hooks/use-revenuecat.ts', 'utf8');
const RC_LIB = readFileSync('src/lib/revenuecat.ts', 'utf8');
const CHAT_SCREEN = readFileSync('src/app/(tabs)/chat.tsx', 'utf8');
const I18N_CONFIG = readFileSync('src/i18n/config.ts', 'utf8');

const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

/**
 * Situația în care magazinul poate vinde: configurat, dispozitiv care poate plăti, oferte citite,
 * pachetul planului cu preț primit de la magazin. Fiecare test schimbă un singur câmp, ca să se
 * vadă exact ce anume blochează butonul.
 */
const CAN_SELL = {
  storeConfigured: true,
  canMakePayments: true,
  offeringsLoad: 'loaded',
  packageCount: 2,
  hasPackageForPlan: true,
  storePrice: '18,99 RON',
};

const availability = (overrides = {}) => purchaseAvailability({ ...CAN_SELL, ...overrides });

describe('OBIECTIV 1: starea butonului de cumpărare = starea reală a magazinului', () => {
  test('toate condițiile îndeplinite: singura stare cumpărabilă', () => {
    assert.equal(availability(), 'purchasable');
    assert.equal(isPurchasable('purchasable'), true);
  });

  test('magazinul nu întoarce nicio ofertă: buton blocat, mesaj propriu', () => {
    const state = availability({ packageCount: 0, hasPackageForPlan: false, storePrice: null });
    assert.equal(state, 'no-offerings');
    assert.equal(isPurchasable(state), false);
    assert.equal(purchaseAvailabilityMessageKey(state), 'premium.storeNoOfferings');
  });

  test('pachet lipsă pentru planul cerut: mesaj DISTINCT de „fără oferte"', () => {
    const state = availability({ hasPackageForPlan: false, storePrice: null });
    assert.equal(state, 'no-package');
    assert.equal(isPurchasable(state), false);
    assert.equal(purchaseAvailabilityMessageKey(state), 'premium.planUnavailable');
    assert.notEqual(
      purchaseAvailabilityMessageKey('no-package'),
      purchaseAvailabilityMessageKey('no-offerings'),
      '„nu există abonament" și „nu există acest plan" trebuie explicate diferit',
    );
    assert.notEqual(state, 'no-offerings', 'un pachet lipsă nu e același lucru cu zero oferte');
  });

  test('pachet fără preț de la magazin: buton blocat, niciun preț inventat', () => {
    for (const storePrice of [null, '', '   ']) {
      const state = availability({ storePrice });
      assert.equal(state, 'no-price', `preț ${JSON.stringify(storePrice)} nu are voie să pară cumpărabil`);
      assert.equal(isPurchasable(state), false);
      assert.equal(purchaseAvailabilityMessageKey(state), 'premium.priceUnavailable');
    }
  });

  test('dispozitiv care nu poate cumpăra: mesaj distinct, care nu sună a defect al aplicației', () => {
    const state = availability({ canMakePayments: false });
    assert.equal(state, 'device-cannot-pay');
    assert.equal(isPurchasable(state), false);
    assert.equal(purchaseAvailabilityMessageKey(state), 'premium.deviceCannotPurchase');
  });

  test('necunoscutul NU blochează: `canMakePayments: null` (citire eșuată) rămâne cumpărabil', () => {
    assert.equal(availability({ canMakePayments: null }), 'purchasable');
  });

  test('cheia magazinului lipsă/placeholder: mesajul existent, nu unul nou', () => {
    assert.equal(availability({ storeConfigured: false }), 'store-unavailable');
    assert.equal(purchaseAvailabilityMessageKey('store-unavailable'), 'premium.storeUnavailable');
  });

  test('citirea ofertelor: `loading` este „nu știm încă", `error` este eroare', () => {
    assert.equal(availability({ offeringsLoad: 'loading' }), 'checking');
    assert.equal(purchaseAvailabilityMessageKey('checking'), null, 'stare trecătoare: fără text');
    assert.equal(availability({ offeringsLoad: 'error' }), 'offerings-error');
    assert.equal(purchaseAvailabilityMessageKey('offerings-error'), 'premium.offeringsError');
  });

  test('ordinea verificărilor: cauza cea mai de sus câștigă', () => {
    assert.equal(availability({ storeConfigured: false, packageCount: 0 }), 'store-unavailable');
    assert.equal(availability({ canMakePayments: false, packageCount: 0 }), 'device-cannot-pay');
    assert.equal(availability({ offeringsLoad: 'loading', packageCount: 0 }), 'checking');
  });

  test('fiecare cauză are textul ei: mesajele nu se repetă între stări', () => {
    const keys = [
      'store-unavailable',
      'device-cannot-pay',
      'offerings-error',
      'no-offerings',
      'no-package',
      'no-price',
    ].map((state) => purchaseAvailabilityMessageKey(state));
    assert.ok(keys.every((key) => typeof key === 'string' && key.length > 0));
    assert.equal(new Set(keys).size, keys.length, 'două cauze diferite nu au voie să aibă același text');
    assert.equal(purchaseAvailabilityMessageKey('purchasable'), null, 'când se poate cumpăra, nu explicăm nimic');
  });
});

describe('OBIECTIV 1: ecranul Premium folosește starea magazinului', () => {
  test('STRUCTURAL: butoanele sunt dezactivate când planul nu e cumpărabil', () => {
    assert.ok(
      PREMIUM_SCREEN.includes('const monthlyBlocked = Boolean(user) && !isPurchasable(monthlyAvailability);'),
      'planul lunar trebuie blocat când nu e cumpărabil',
    );
    assert.ok(
      PREMIUM_SCREEN.includes('const annualBlocked = Boolean(user) && !isPurchasable(annualAvailability);'),
      'planul anual trebuie blocat când nu e cumpărabil',
    );
    // T3 (build 21, 11.10.2026): cele două valori rămân calculate ca înainte, dar ecranul are UN SINGUR
    // buton per card (în `planCardBody`), deci blocarea se alege după planul cardului. Regula testului
    // rămâne: butonul de cumpărare e dezactivat când planul nu e cumpărabil.
    assert.ok(PREMIUM_SCREEN.includes("const blocked = plan === 'monthly' ? monthlyBlocked : annualBlocked;"));
    assert.ok(PREMIUM_SCREEN.includes('disabled={busyPlan !== null || blocked}'));
  });

  test('STRUCTURAL: fiecare plan are mesajul stării lui, randat sub buton', () => {
    // T3 (build 21, 11.10.2026): mesajul nu se mai scrie de două ori în JSX — se alege o dată, după
    // planul cardului (`noticeKey`), și se randează o dată. Fiecare plan își păstrează mesajul lui,
    // plus mesajul butonului mort (`blockedNotice`), care înainte nu era pin-uit aici.
    assert.ok(
      PREMIUM_SCREEN.includes("const noticeKey = plan === 'monthly' ? monthlyNoticeKey : annualNoticeKey;"),
      'mesajul trebuie ales după planul cardului',
    );
    assert.ok(
      PREMIUM_SCREEN.includes('{noticeKey ? <Text accessibilityLiveRegion="polite" style={styles.storeNotice}>{t(noticeKey)}</Text> : null}'),
      'mesajul stării planului trebuie randat sub buton',
    );
    for (const plan of ['monthly', 'annual']) {
      assert.ok(
        PREMIUM_SCREEN.includes(
          `const ${plan}NoticeKey = ${plan}Availability === 'store-unavailable' ? null : purchaseAvailabilityMessageKey(${plan}Availability);`,
        ),
        `lipsește mesajul pentru planul ${plan}`,
      );
      assert.ok(
        PREMIUM_SCREEN.includes(`const ${plan}BlockedNotice = ${plan}Blocked && !${plan}NoticeKey`),
        `lipsește mesajul butonului mort pentru planul ${plan}`,
      );
    }
    assert.ok(PREMIUM_SCREEN.includes('storeNotice: { color: palette.muted'), 'stilul mesajului lipsește');
    assert.ok(
      PREMIUM_SCREEN.includes("monthlyAvailability === 'store-unavailable' ? null"),
      'mesajul „magazin indisponibil" e deja în cardul de stare; nu se repetă sub plan',
    );
  });

  test('STRUCTURAL: starea vine din hook, nu din catalogul RevenueCat', () => {
    assert.ok(PREMIUM_SCREEN.includes("const monthlyAvailability = availabilityFor('monthly');"));
    assert.ok(PREMIUM_SCREEN.includes("const annualAvailability = availabilityFor('annual');"));
    assert.ok(
      PREMIUM_SCREEN.includes('const { availabilityFor, buy, loading, offeringsError, packages, priceFor, restore } = useRevenueCat();'),
      'ecranul trebuie să ceară starea magazinului de la hook',
    );
    assert.ok(RC_HOOK.includes('storePrice: pkg ? packagePriceText(pkg) : null'), 'prețul cerut vine din pachet');
    assert.ok(RC_HOOK.includes('hasPackageForPlan: pkg !== null'));
    assert.ok(RC_HOOK.includes("const [offeringsLoad, setOfferingsLoad] = useState<StoreOfferingsLoad>('loading');"));
    assert.ok(RC_HOOK.includes("setOfferingsLoad('loaded');"), 'citirea reușită a ofertelor trebuie marcată');
    assert.ok(RC_HOOK.includes("setOfferingsLoad('error');"), 'citirea eșuată a ofertelor trebuie marcată');
    assert.ok(RC_HOOK.includes('Purchases.canMakePayments()'), 'capacitatea dispozitivului trebuie citită');
  });

  test('STRUCTURAL: prețul afișat vine din `priceString`, fără număr inventat', () => {
    assert.ok(
      RC_LIB.includes('const priceString = pkg.product?.priceString?.trim();'),
      'prețul trebuie citit din `priceString`-ul primit de la magazin',
    );
    assert.ok(
      !/product\?\.price\b/.test(RC_LIB),
      'fără fallback pe `price` (număr fără monedă): arată ca un preț de magazin fără să fie unul',
    );
    assert.ok(PREMIUM_SCREEN.includes("const monthlyPrice = priceFor('monthly');"));
    assert.ok(PREMIUM_SCREEN.includes("const annualPrice = priceFor('annual');"));
  });

  test('STRUCTURAL: ecranul Premium și mențiunea că răspunsurile AI sunt informative rămân pe loc', () => {
    assert.ok(PREMIUM_SCREEN.includes('premium.disclosureTitle'), 'ecranul Premium nu se ascunde');
    assert.ok(PREMIUM_SCREEN.includes('premium.paymentNote'));
    assert.ok(CHAT_SCREEN.includes("t('chat.eyebrow')"), 'mențiunea „ghid informativ" din chat rămâne');
    assert.ok(I18N_CONFIG.includes("'chat.eyebrow': 'Ghid informativ'"));
  });
});

describe('OBIECTIV 1: textele noi, în toate cele 10 limbi', () => {
  const NEW_KEYS = ['premium.deviceCannotPurchase', 'premium.storeNoOfferings', 'premium.priceUnavailable'];

  test('fiecare cheie nouă apare exact o dată per limbă (10 apariții)', () => {
    for (const key of NEW_KEYS) {
      const count = (I18N_CONFIG.match(new RegExp(`'${key}':`, 'g')) ?? []).length;
      assert.equal(count, LOCALES.length, `${key} apare de ${count} ori`);
    }
  });

  test('valorile sunt pline, distincte între limbi și fără ghilimele escapate', () => {
    for (const key of NEW_KEYS) {
      const values = [...I18N_CONFIG.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))].map((m) => m[1]);
      assert.equal(values.length, LOCALES.length, key);
      for (const value of values) {
        assert.ok(!value.includes("\\'"), `${key}: ghilimele escapate în „${value}"`);
        assert.ok(value.trim().length > 30, `${key}: text suspect de scurt: „${value}"`);
        assert.ok(!value.includes('{'), `${key}: acest text nu are placeholders: „${value}"`);
      }
      assert.equal(new Set(values).size, LOCALES.length, `${key}: două limbi au primit același text`);
    }
  });

  test('mesajul „planul lipsește" refolosește cheia existentă, prezentă în toate limbile', () => {
    const count = (I18N_CONFIG.match(/'premium\.planUnavailable':/g) ?? []).length;
    assert.equal(count, LOCALES.length);
  });
});
