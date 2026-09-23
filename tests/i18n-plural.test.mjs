/**
 * Plural agreement for count-bearing strings (audit finding G-11).
 *
 * The app rendered a single wording per count-bearing key, so a remaining count of 1
 * produced "1 din 5 mesaje rămase azi" in Romanian (needs "mesaj rămas") and the
 * equivalent mismatch in Russian, Serbian and Ukrainian. The count decrements through
 * 1 on every use, so the case is reachable, not theoretical.
 *
 * The module under test is the pure selection core: `Intl.PluralRules` provides the
 * CLDR category and the core picks the variant. The dictionary is deliberately NOT
 * imported here (it pulls in the whole i18n config through extensionless imports that
 * only a bundler can resolve), so the test injects an explicit lookup. The stored
 * wording is quoted verbatim in the assertions below, which is what makes a change to a
 * shipped string fail loudly; the corpus validator separately proves every locale
 * defines each base key.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { pluralCategory, pluralSuffixFor, selectPluralForm } from '../src/lib/i18n-plural.ts';

/**
 * Minimal resolver mirroring how `src/i18n/config.ts` looks a key up for one locale:
 * a variant when present, otherwise the base wording, otherwise null (absent).
 *
 * @param {Record<string, string>} dictionary
 */
function lookupFor(dictionary) {
  return (key) => (
    Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : null
  );
}

test('CLDR categories match the shipped locales', () => {
  // Romanian: 1 -> one, 2..19 -> few, 20+ -> other.
  assert.equal(pluralCategory('ro', 1), 'one');
  assert.equal(pluralCategory('ro', 2), 'few');
  assert.equal(pluralCategory('ro', 5), 'few');
  assert.equal(pluralCategory('ro', 20), 'other');

  // Slavic locales additionally have "many" for 5 and above.
  assert.equal(pluralCategory('ru', 1), 'one');
  assert.equal(pluralCategory('ru', 5), 'many');
  assert.equal(pluralCategory('uk', 5), 'many');
  assert.equal(pluralCategory('sr', 5), 'other');

  // Greek / Bulgarian / Macedonian / Georgian / Albanian / English split 1 vs rest.
  for (const locale of ['el', 'bg', 'mk', 'ka', 'sq', 'en']) {
    assert.equal(pluralCategory(locale, 1), 'one', `${locale} must treat 1 as "one"`);
    assert.equal(pluralCategory(locale, 2), 'other', `${locale} must treat 2 as "other"`);
  }
});

test('only the categories that need a distinct sentence get a suffix', () => {
  assert.equal(pluralSuffixFor('ro', 1), 'one');
  assert.equal(pluralSuffixFor('ro', 5), 'few');
  assert.equal(pluralSuffixFor('ru', 5), null, '"many" shares the default wording');
  assert.equal(pluralSuffixFor('en', 1), 'one');
  assert.equal(pluralSuffixFor('en', 2), null);
});

test('Romanian singular wording is used for a remaining count of 1', () => {
  // The exact strings stored in src/i18n/config.ts for Romanian.
  const lookup = lookupFor({
    'chat.freeLimitLabel': '{count} din {limit} întrebări gratuite rămase azi',
    'chat.freeLimitLabel#one': 'o întrebare gratuită rămasă azi din {limit}',
  });

  const singular = selectPluralForm('ro', 'chat.freeLimitLabel', 1, lookup, { count: 1, limit: 5 });
  const plural = selectPluralForm('ro', 'chat.freeLimitLabel', 5, lookup, { count: 5, limit: 5 });

  assert.match(singular, /o întrebare gratuită rămasă/, `unexpected singular: ${singular}`);
  assert.ok(!singular.includes('întrebări gratuite rămase'), 'must not use the plural noun for 1');
  assert.ok(!singular.includes('{'), 'no placeholder may survive');
  assert.match(plural, /întrebări gratuite rămase/, `unexpected plural: ${plural}`);
});

test('Russian, Serbian and Ukrainian singular wording is used for 1', () => {
  const ru = selectPluralForm('ru', 'chat.freeLimitLabel', 1, lookupFor({
    'chat.freeLimitLabel': 'Сегодня осталось {count} из {limit} бесплатных вопросов',
    'chat.freeLimitLabel#one': 'осталось {count} из {limit} бесплатный вопрос',
  }), { count: 1, limit: 5 });
  assert.ok(!ru.includes('бесплатных вопросов'), `Russian must not use the plural for 1: ${ru}`);
  assert.match(ru, /бесплатный вопрос/);

  const sr = selectPluralForm('sr', 'chat.freeLimitLabel', 1, lookupFor({
    'chat.freeLimitLabel': '{count} од {limit} бесплатних питања остало данас',
    'chat.freeLimitLabel#one': 'преостало је {count} од {limit} бесплатно питање',
  }), { count: 1, limit: 5 });
  assert.ok(!sr.includes('бесплатних питања'), `Serbian must not use the plural for 1: ${sr}`);

  const uk = selectPluralForm('uk', 'chat.freeLimitLabel', 1, lookupFor({
    'chat.freeLimitLabel': '{count} із {limit} безкоштовних питань залишилось сьогодні',
    'chat.freeLimitLabel#one': 'залишилося {count} з {limit} безкоштовне питання',
  }), { count: 1, limit: 5 });
  assert.ok(!uk.includes('безкоштовних питань'), `Ukrainian must not use the plural for 1: ${uk}`);
});

test('a locale without a variant falls back to the default wording', () => {
  const lookup = lookupFor({
    'chat.freeLimitLabel': '{count} of {limit} free questions left today',
  });
  const value = selectPluralForm('en', 'chat.freeLimitLabel', 1, lookup, { count: 1, limit: 5 });
  assert.equal(value, '1 of 5 free questions left today');
  assert.ok(!value.startsWith('chat.'), `a raw key must never be rendered: ${value}`);
});

test('a completely missing base key is visible rather than blank', () => {
  const value = selectPluralForm('en', 'chat.notAKey', 1, () => null, {});
  assert.equal(value, 'chat.notAKey');
});

test('unknown placeholders are left untouched so typos stay visible', () => {
  const value = selectPluralForm('en', 'k', 2, lookupFor({ k: 'a {known} and {unknown}' }), { known: 'X' });
  assert.equal(value, 'a X and {unknown}');
});

test('the plan placeholder is substituted alongside the count', () => {
  const value = selectPluralForm('ro', 'chat.premiumLimitLabel', 1, lookupFor({
    'chat.premiumLimitLabel': '{plan}: {count} din {limit} mesaje rămase azi',
    'chat.premiumLimitLabel#one': '{plan}: un mesaj rămas azi din {limit}',
  }), { plan: 'Premium', count: 1, limit: 50 });

  assert.ok(value.includes('Premium'), `plan must be interpolated: ${value}`);
  assert.ok(!value.includes('{'), `no placeholder may survive: ${value}`);
  assert.match(value, /un mesaj rămas/);
});

test('few and other counts select the expected wording', () => {
  const lookup = lookupFor({
    k: 'base {count}',
    'k#one': 'one {count}',
    'k#few': 'few {count}',
  });
  assert.equal(selectPluralForm('ro', 'k', 1, lookup, { count: 1 }), 'one 1');
  assert.equal(selectPluralForm('ro', 'k', 3, lookup, { count: 3 }), 'few 3');
  assert.equal(selectPluralForm('ro', 'k', 25, lookup, { count: 25 }), 'base 25');
});
