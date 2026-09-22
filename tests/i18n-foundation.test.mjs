import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const configPath = join(root, 'src/i18n/config.ts');

const source = readFileSync(configPath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
});

const sandbox = { exports: {}, require: () => ({}) };
vm.createContext(sandbox);
vm.runInContext(transpiled.outputText, sandbox);
const config = sandbox.exports;
const providerSource = readFileSync(join(root, 'src/providers/localization-provider.tsx'), 'utf8');

// Structural checks use the real provider source; they do not mount React Native.
test('provider restores each storage preference independently', () => {
  assert.doesNotMatch(providerSource, /Promise\.all\s*\(/);
  assert.match(providerSource, /Promise\.allSettled\(\[/);
  assert.match(providerSource, /LANGUAGE_STORAGE_KEY = 'ortodoxia\.language'/);
  // A stored language is applied only when it is actually present; a missing value
  // must NOT be coerced through resolveLanguageCode(), because that maps null to
  // Romanian and would override device detection on first launch.
  assert.match(providerSource, /if \(savedLanguage\.status === 'fulfilled' && savedLanguage\.value\) \{\s*setLanguageCodeState\(resolveLanguageCode\(savedLanguage\.value\)\);/);
  assert.match(providerSource, /console\.error\([^;]+savedLanguage\.reason\)/);
  assert.match(providerSource, /if \(savedCountry\.status === 'fulfilled'\)/);
  assert.match(providerSource, /console\.error\([^;]+savedCountry\.reason\)/);
  assert.match(providerSource, /if \(savedCalendars\.status === 'rejected'\)/);
  assert.match(providerSource, /console\.error\([^;]+savedCalendars\.reason\)/);
});

test('provider gates children until hydration finishes and seeds from the device', () => {
  // First launch must follow the device language rather than assuming Romanian.
  assert.match(providerSource, /useState<LanguageCode>\(\s*\(\) => detectDeviceLanguage\(\) \?\? 'ro',\s*\)/);
  assert.match(providerSource, /useState<CountryCode>\(DEFAULT_COUNTRY\)/);
  assert.match(providerSource, /useState<CalendarPreferences>\(\{\}\)/);
  // A11Y-001 added a startup mark inside the same callback, so the assertion pins the
  // behaviour (loading ends exactly once, in the settle handler) rather than the exact
  // one-line body.
  assert.match(providerSource, /\.finally\(\(\) => \{\s*if \(active\) \{[\s\S]*?setIsLoading\(false\);[\s\S]*?\}\s*\}\)/);
  assert.equal((providerSource.match(/setIsLoading\(false\)/g) ?? []).length, 1);
  assert.match(providerSource, /if \(isLoading\) return null;\s*return <LocalizationContext\.Provider value=\{value\}>\{children\}<\/LocalizationContext\.Provider>/);
});

test('choosing a country aligns the language only until the user chooses one', () => {
  const countryStart = providerSource.indexOf('setCountryCode: async (nextCountryCode)');
  assert.ok(countryStart >= 0);
  const countryEnd = providerSource.indexOf('setLanguageCode: async', countryStart);
  const block = providerSource.slice(countryStart, countryEnd);
  assert.ok(block.includes('setCountryCodeState(nextCountryCode);'));
  assert.ok(block.includes('AsyncStorage.setItem(COUNTRY_STORAGE_KEY, nextCountryCode)'));
  // The follow behaviour exists and is guarded by "no explicit choice yet".
  assert.ok(block.includes("if (!explicitLanguage)"), 'must not override an explicit language choice');
  assert.ok(block.includes('getRegion(nextCountryCode).languageCode'));
});

test('language writes update state immediately and log storage failures', () => {
  const start = providerSource.indexOf('setLanguageCode: async (nextLanguageCode)');
  assert.ok(start >= 0);
  const block = providerSource.slice(start, start + 500);
  assert.ok(block.includes('setLanguageCodeState(nextLanguageCode);'));
  assert.ok(block.includes('await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguageCode);'));
  assert.ok(block.includes("console.error('Failed to save language preference:', error);"));
});

// ─── REAL device-language detection ──────────────────────────────────────────
// These drive the exported function with a stubbed Intl so the mapping from a
// device locale to a supported language is verified directly, not by grepping.

function detectWithDeviceLocale(locale) {
  const sandboxWithIntl = {
    exports: {},
    require: () => ({}),
    Intl: {
      DateTimeFormat: function DateTimeFormat() {
        return { resolvedOptions: () => ({ locale }) };
      },
    },
  };
  const transpiledConfig = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
  });
  vm.createContext(sandboxWithIntl);
  vm.runInContext(transpiledConfig.outputText, sandboxWithIntl);
  return sandboxWithIntl.exports.detectDeviceLanguage();
}

test('REAL detectDeviceLanguage maps supported device locales to a language', () => {
  assert.equal(detectWithDeviceLocale('el-GR'), 'el');
  assert.equal(detectWithDeviceLocale('el-CY'), 'el');
  assert.equal(detectWithDeviceLocale('sr-RS'), 'sr');
  assert.equal(detectWithDeviceLocale('ru-BY'), 'ru');
  assert.equal(detectWithDeviceLocale('ka-GE'), 'ka');
  assert.equal(detectWithDeviceLocale('ro-MD'), 'ro');
  assert.equal(detectWithDeviceLocale('uk-UA'), 'uk');
  assert.equal(detectWithDeviceLocale('en-US'), 'en');
});

test('REAL detectDeviceLanguage returns null for unsupported device locales', () => {
  // Returning null (not 'ro') keeps the fallback decision with the caller.
  assert.equal(detectWithDeviceLocale('ja-JP'), null);
  assert.equal(detectWithDeviceLocale('de-DE'), null);
  assert.equal(detectWithDeviceLocale(''), null);
});

test('SUPPORTED_LANGUAGES are exact', () => {
  const expected = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];
  assert.ok(JSON.stringify(config.SUPPORTED_LANGUAGES) === JSON.stringify(expected), 'SUPPORTED_LANGUAGES match expected');
});

test('COMPLETE_LANGUAGES includes all supported languages', () => {
  assert.ok(JSON.stringify(config.COMPLETE_LANGUAGES) === JSON.stringify(['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq']), 'COMPLETE_LANGUAGES match expected');
});

test('REAL resolveLanguageCode resolves correctly', () => {
  assert.equal(config.resolveLanguageCode('ro'), 'ro');
  assert.equal(config.resolveLanguageCode('en'), 'en');
  assert.equal(config.resolveLanguageCode('el'), 'el');
  assert.equal(config.resolveLanguageCode('sq'), 'sq');
  assert.equal(config.resolveLanguageCode('invalid'), 'ro');
  assert.equal(config.resolveLanguageCode(''), 'ro');
  assert.equal(config.resolveLanguageCode(null), 'ro');
  assert.equal(config.resolveLanguageCode(undefined), 'ro');
});

test('REAL translate fallback', () => {
  const enValue = config.translate('en', 'nav.home');

  // Verify explicit translation
  assert.equal(enValue, 'Home');

  // Verify Greek, Serbian and Bulgarian translations
  const elValue = config.translate('el', 'nav.home');
  const srValue = config.translate('sr', 'nav.home');
  const bgValue = config.translate('bg', 'nav.home');

  // Verify Bulgarian uses its real dictionary (no Romanian fallback)
  assert.equal(bgValue, 'Начало');



  assert.equal(elValue, 'Αρχική');
  assert.equal(srValue, 'Дом');
});

test('REAL Romanian translation returns Romanian value', () => {
  assert.equal(config.translate('ro', 'nav.home'), 'Acasă');
});

test('REAL Macedonian translation returns Macedonian value', () => {
  assert.equal(config.translate('mk', 'nav.home'), 'Почетна');
});

test('REAL Ukrainian translation returns Ukrainian value', () => {
  assert.equal(config.translate('uk', 'nav.home'), 'Головна');
});

test('REAL Georgian translation returns Georgian value', () => {
  assert.equal(config.translate('ka', 'nav.home'), 'მთავარი');
});

test('REAL Russian translation returns Russian value', () => {
  assert.equal(config.translate('ru', 'nav.home'), 'Главная');
});

test('REAL Albanian translation returns Albanian value', () => {
  assert.equal(config.translate('sq', 'nav.home'), 'Kryefaqja');
});

