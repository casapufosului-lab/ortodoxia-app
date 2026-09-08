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
  assert.match(providerSource, /if \(savedLanguage\.status === 'fulfilled'\) \{\s*setLanguageCodeState\(resolveLanguageCode\(savedLanguage\.value\)\);\s*\} else \{\s*console\.error\([^;]+savedLanguage\.reason\);/);
  assert.match(providerSource, /if \(savedCountry\.status === 'fulfilled'\)/);
  assert.match(providerSource, /console\.error\([^;]+savedCountry\.reason\)/);
  assert.match(providerSource, /if \(savedCalendars\.status === 'rejected'\)/);
  assert.match(providerSource, /console\.error\([^;]+savedCalendars\.reason\)/);
});

test('provider gates children until hydration finishes and preserves defaults', () => {
  assert.match(providerSource, /useState<LanguageCode>\('ro'\)/);
  assert.match(providerSource, /useState<CountryCode>\(DEFAULT_COUNTRY\)/);
  assert.match(providerSource, /useState<CalendarPreferences>\(\{\}\)/);
  assert.match(providerSource, /\.finally\(\(\) => \{\s*if \(active\) setIsLoading\(false\);\s*\}\)/);
  assert.equal((providerSource.match(/setIsLoading\(false\)/g) ?? []).length, 1);
  assert.match(providerSource, /if \(isLoading\) return null;\s*return <LocalizationContext\.Provider value=\{value\}>\{children\}<\/LocalizationContext\.Provider>/);
});

test('language writes update state immediately and log storage failures', () => {
  assert.match(providerSource, /setLanguageCode: async \(nextLanguageCode\) => \{\s*setLanguageCodeState\(nextLanguageCode\);\s*try \{\s*await AsyncStorage\.setItem\(LANGUAGE_STORAGE_KEY, nextLanguageCode\);\s*\} catch \(error\) \{\s*console\.error\('Failed to save language preference:', error\);\s*\}\s*\}/);
});

test('SUPPORTED_LANGUAGES are exact', () => {
  const expected = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];
  assert.ok(JSON.stringify(config.SUPPORTED_LANGUAGES) === JSON.stringify(expected), 'SUPPORTED_LANGUAGES match expected');
});

test('COMPLETE_LANGUAGES is exactly ro, en, el, sr and bg', () => {
  assert.ok(JSON.stringify(config.COMPLETE_LANGUAGES) === JSON.stringify(['ro', 'en', 'el', 'sr', 'bg']), 'COMPLETE_LANGUAGES match expected');
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
  const roValue = config.translate('ro', 'nav.home');
  const enValue = config.translate('en', 'nav.home');

  // Verify explicit translation
  assert.equal(enValue, 'Home');

  // Verify Greek, Serbian and Bulgarian translations
  const elValue = config.translate('el', 'nav.home');
  const srValue = config.translate('sr', 'nav.home');
  const bgValue = config.translate('bg', 'nav.home');

  // Verify Bulgarian uses its real dictionary (no Romanian fallback)
  assert.equal(bgValue, 'Начало');

  // Verify fallback for incomplete languages (ru, sq)
  const ruValue = config.translate('ru', 'nav.home');
  const sqValue = config.translate('sq', 'nav.home');

  assert.equal(elValue, 'Αρχική');
  assert.equal(srValue, 'Дом');
  assert.equal(ruValue, roValue);
  assert.equal(sqValue, roValue);
});

test('REAL Romanian translation returns Romanian value', () => {
  assert.equal(config.translate('ro', 'nav.home'), 'Acasă');
});

