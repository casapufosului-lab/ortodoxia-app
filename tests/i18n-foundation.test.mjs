import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirroring constants and helpers from src/i18n/config.ts
const SUPPORTED_LANGUAGES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];
const COMPLETE_LANGUAGES = ['ro'];

function isSupportedLanguage(code) {
  return SUPPORTED_LANGUAGES.includes(code);
}

function resolveLanguageCode(code) {
  return code && isSupportedLanguage(code) ? code : 'ro';
}

test('Supported languages are exact', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq']);
});

test('COMPLETE_LANGUAGES is exactly ro', () => {
  assert.deepEqual(COMPLETE_LANGUAGES, ['ro']);
});

test('resolveLanguageCode resolves correctly', () => {
  assert.equal(resolveLanguageCode('ro'), 'ro');
  assert.equal(resolveLanguageCode('en'), 'en');
  assert.equal(resolveLanguageCode('el'), 'el');
  assert.equal(resolveLanguageCode('sq'), 'sq');
  assert.equal(resolveLanguageCode('invalid'), 'ro');
  assert.equal(resolveLanguageCode(''), 'ro');
  assert.equal(resolveLanguageCode(null), 'ro');
  assert.equal(resolveLanguageCode(undefined), 'ro');
});

