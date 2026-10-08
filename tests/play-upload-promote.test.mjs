/**
 * Teste pentru flagul `--promote <versionCode>` din `scripts/upload-play.mjs`.
 *
 * De ce există: Play refuză un al doilea upload al aceluiași cod de versiune („Version code 3 has
 * already been used"), deci punerea unei versiuni deja urcate pe track-ul de production nu se poate face
 * printr-un re-upload. `--promote` atribuie codul existent altui track, fără să încarce fișiere.
 *
 * Testele ating funcțiile pure exportate și verifică structura ramurii noi în sursă — fără rețea și fără
 * un edit real de Play. Modulul are pază de punct de intrare, deci poate fi importat fără efecte.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const uploadPlay = await import(new URL('../scripts/upload-play.mjs', import.meta.url).href);
const source = readFileSync(join(ROOT, 'scripts', 'upload-play.mjs'), 'utf8');

/** Ramura de promovare: de la `if (promoteCode) {` până la `} else {`. */
function promoteBranch() {
  const start = source.indexOf('if (promoteCode) {');
  assert.notEqual(start, -1, 'lipsește ramura de promovare');
  const end = source.indexOf('} else {', start);
  assert.notEqual(end, -1, 'ramura de promovare trebuie să aibă și varianta cu upload');
  return source.slice(start, end);
}

test('--promote cere un cod de versiune numeric și îl păstrează ca șir (P1.4)', () => {
  assert.equal(uploadPlay.resolvePromoteVersionCode('3'), '3');
  assert.equal(uploadPlay.resolvePromoteVersionCode(3), '3');
  assert.equal(uploadPlay.resolvePromoteVersionCode(' 42 '), '42');
});

test('fără --promote, promovarea nu se activează (P1.4)', () => {
  assert.equal(uploadPlay.resolvePromoteVersionCode(null), null);
  assert.equal(uploadPlay.resolvePromoteVersionCode(undefined), null);
  assert.equal(uploadPlay.resolvePromoteVersionCode(false), null);
});

test('un --promote fără valoare sau cu text se oprește cu mesaj clar (P1.4)', () => {
  assert.throws(() => uploadPlay.resolvePromoteVersionCode(true), /cod de versiune/);
  assert.throws(() => uploadPlay.resolvePromoteVersionCode('abc'), /numeric/);
  assert.throws(() => uploadPlay.resolvePromoteVersionCode('3.1'), /numeric/);
  assert.throws(() => uploadPlay.resolvePromoteVersionCode(''), /numeric/);
});

test('release-ul trimis la Play are codurile ca șiruri și notele doar când există text (P1.4)', () => {
  const withNotes = uploadPlay.buildTrackRelease({
    status: 'draft',
    versionCodes: ['3'],
    notes: 'Reparatii la ecranul Premium.',
    lang: 'ro-RO',
  });
  assert.deepEqual(withNotes, {
    status: 'draft',
    versionCodes: ['3'],
    releaseNotes: [{ language: 'ro-RO', text: 'Reparatii la ecranul Premium.' }],
  });

  const withoutNotes = uploadPlay.buildTrackRelease({ status: 'draft', versionCodes: [3], lang: 'ro-RO' });
  assert.deepEqual(withoutNotes, { status: 'draft', versionCodes: ['3'] });
  assert.equal('releaseNotes' in withoutNotes, false, 'notele goale sunt respinse de API');
});

test('un release fără coduri de versiune este o eroare, nu o cerere către Play (P1.4)', () => {
  assert.throws(() => uploadPlay.buildTrackRelease({ status: 'draft', versionCodes: [] }), /cel puțin un cod/);
});

test('ramura de promovare nu urcă niciun fișier și verifică faptul că versionCode-ul există (P1.4)', () => {
  const branch = promoteBranch();
  assert.equal(branch.includes('uploadBundle'), false, 'promovarea nu are voie să încarce AAB-ul');
  assert.equal(branch.includes('readFileSync'), false, 'promovarea nu are voie să citească AAB-ul');
  assert.match(branch, /\/bundles`/, 'promovarea verifică bundle-urile deja urcate');
  assert.match(branch, /nu e urcat în Play/, 'un versionCode inexistent trebuie oprit cu mesaj clar');
});

test('scriptul își păstrează punctul de intrare și documentează flagul (P1.4)', () => {
  assert.equal(typeof uploadPlay.resolvePromoteVersionCode, 'function', 'modulul se importă fără efecte');
  assert.equal(typeof uploadPlay.buildTrackRelease, 'function');
  assert.match(source, /const isEntryPoint =/, 'main() rulează doar la execuție directă');
  assert.match(source, /node scripts\/upload-play\.mjs --track production --promote 3 --status draft/);
  assert.match(source, /flag\('promote', null\)/);
  assert.match(source, /--promote are nevoie de un cod de versiune/);
});
