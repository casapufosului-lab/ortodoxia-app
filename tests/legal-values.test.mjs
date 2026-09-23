/**
 * Legal value substitution (audit findings P-01 / P-03 / P-08).
 *
 * The privacy policy and terms used to render bracketed completion tokens such as
 * `[OPERATOR/ENTITATE LEGALĂ DE COMPLETAT]` directly to users in all 10 languages,
 * and the support row was plain non-tappable text because no contact existed.
 *
 * The values are now configuration with a single substitution path. These tests
 * check the substitution itself, including the case that matters most: a missing
 * value must produce the caller's localized notice and never leak a raw `{token}`
 * or an empty string.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fillLegalPlaceholders,
  isLegalIdentityConfigured,
  isPlausibleEmail,
  LEGAL_FIELD_ENV_VARS,
  missingLegalFields,
  safeExternalUrl,
  supportMailtoUrl,
} from '../src/lib/legal-values.ts';

// `import type` is not valid syntax in a `.mjs` file, and type stripping does not
// remove it, so the value shape is documented with a JSDoc typedef instead.
/**
 * @typedef {object} SupportContactValues
 * @property {string|null} legalEntity
 * @property {string|null} supportEmail
 * @property {string|null} postalAddress
 * @property {string|null} jurisdiction
 * @property {string|null} locality
 * @property {string|null} privacyPolicyUrl
 * @property {string|null} termsUrl
 * @property {string|null} effectiveDate
 */

/** @type {SupportContactValues} */
const EMPTY_VALUES = {
  legalEntity: null,
  supportEmail: null,
  postalAddress: null,
  jurisdiction: null,
  locality: null,
  privacyPolicyUrl: null,
  termsUrl: null,
  effectiveDate: null,
};

/** @type {SupportContactValues} */
const FILLED_VALUES = {
  legalEntity: 'Quidem Exemplum SRL',
  supportEmail: 'support@example.test',
  postalAddress: 'Str. Exemplu 1',
  jurisdiction: 'România',
  locality: 'București',
  privacyPolicyUrl: 'https://example.test/privacy',
  termsUrl: 'https://example.test/terms',
  effectiveDate: '2026-01-01',
};

test('every declared field has a distinct environment variable', () => {
  const names = Object.values(LEGAL_FIELD_ENV_VARS);
  assert.equal(names.length, 8);
  assert.equal(new Set(names).size, names.length, 'environment variable names must be unique');
  for (const name of names) {
    assert.match(name, /^EXPO_PUBLIC_[A-Z_]+$/, `${name} must be a client-visible variable`);
  }
});

test('configured values replace their placeholders', () => {
  const text = 'Operator: {legalEntity} · {supportAddress} · {jurisdiction} · {effectiveDate}';
  assert.equal(
    fillLegalPlaceholders(text, '[missing]', FILLED_VALUES),
    'Operator: Quidem Exemplum SRL · support@example.test · România · 2026-01-01',
  );
});

test('missing values render the localized notice, never a raw token', () => {
  const text = 'Operator: {legalEntity} · {supportAddress}';
  const result = fillLegalPlaceholders(text, '[de completat]', EMPTY_VALUES);
  assert.equal(result, 'Operator: [de completat] · [de completat]');
  assert.ok(!result.includes('{'), 'no interpolation artefact may reach the user');
  assert.ok(!result.includes('[OPERATOR'), 'no bracketed completion token may remain');
});

test('unknown placeholders are left untouched so typos are visible in review', () => {
  // A typo in a translation must not be silently blanked.
  assert.equal(
    fillLegalPlaceholders('Hello {notALegalField}', '[missing]', FILLED_VALUES),
    'Hello {notALegalField}',
  );
});

test('completeness reporting names the exact missing variables', () => {
  assert.deepEqual(missingLegalFields(FILLED_VALUES), []);
  assert.equal(isLegalIdentityConfigured(FILLED_VALUES), true);

  const missing = missingLegalFields({ ...FILLED_VALUES, supportEmail: null });
  assert.deepEqual(missing, ['EXPO_PUBLIC_SUPPORT_EMAIL']);
  assert.equal(isLegalIdentityConfigured({ ...FILLED_VALUES, supportEmail: null }), false);
  assert.equal(missingLegalFields(EMPTY_VALUES).length, 8);
});

test('a mailto link only exists when an address is configured', () => {
  assert.equal(supportMailtoUrl(FILLED_VALUES), 'mailto:support@example.test');
  assert.equal(supportMailtoUrl(EMPTY_VALUES), null);
});

test('an invalid support address never becomes a mailto link', () => {
  // A misconfigured value must be treated as "not configured" rather than shipped as
  // a dead or unintended link. The comma/semicolon cases matter most: a `mailto:`
  // recipient list would silently add addresses the operator never listed.
  for (const bad of [
    'not-an-address',
    'support@',
    '@example.test',
    'support@example',
    'support @example.test',
    'support@example.test,attacker@example.test',
    'support@example.test;attacker@example.test',
    'support@example.test?bcc=attacker@example.test',
    'a@b.c@d.e',
    'support@example.test\nBcc: attacker@example.test',
  ]) {
    assert.equal(supportMailtoUrl({ ...FILLED_VALUES, supportEmail: bad }), null, `${bad} must be rejected`);
    assert.equal(isPlausibleEmail(bad), false, `${bad} must not be considered plausible`);
  }

  for (const good of ['support@example.test', 'contact.prayer+app@sub.example.co.uk']) {
    assert.equal(isPlausibleEmail(good), true, `${good} must be accepted`);
  }
});

test('only absolute http(s) URLs are accepted for external navigation', () => {
  assert.equal(safeExternalUrl('https://example.test/privacy'), 'https://example.test/privacy');
  assert.equal(safeExternalUrl('http://example.test/privacy'), 'http://example.test/privacy');
  // A misconfigured value must not become a script or custom-scheme navigation.
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('ortodoxia://auth'), null);
  assert.equal(safeExternalUrl('not a url'), null);
  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl(null), null);
});
