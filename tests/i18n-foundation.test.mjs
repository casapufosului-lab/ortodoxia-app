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

test('SUPPORTED_LANGUAGES are exact', () => {
  const expected = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];
  assert.ok(JSON.stringify(config.SUPPORTED_LANGUAGES) === JSON.stringify(expected), 'SUPPORTED_LANGUAGES match expected');
});

test('COMPLETE_LANGUAGES is exactly ro', () => {
  assert.ok(JSON.stringify(config.COMPLETE_LANGUAGES) === JSON.stringify(['ro']), 'COMPLETE_LANGUAGES match expected');
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
  // en is incomplete, should fallback to ro
  const roValue = config.translate('ro', 'nav.home');
  const enValue = config.translate('en', 'nav.home');
  const elValue = config.translate('el', 'nav.home');
  const ruValue = config.translate('ru', 'nav.home');
  const sqValue = config.translate('sq', 'nav.home');

  assert.equal(enValue, roValue);
  assert.equal(elValue, roValue);
  assert.equal(ruValue, roValue);
  assert.equal(sqValue, roValue);
});

test('REAL Romanian translation returns Romanian value', () => {
  assert.equal(config.translate('ro', 'nav.home'), 'Acasă');
});

