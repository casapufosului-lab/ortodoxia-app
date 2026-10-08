/**
 * B3 (registrul de audit, high) — `notification_device_claims` păstrează UUID de utilizator + dispozitiv.
 *
 * Poziția, textual: „notification_device_claims păstrează UUID de utilizator + dispozitiv la infinit […]
 * delete-account/index.ts:87-104 nu îl șterge. Soluție: adaugă delete from public.notification_device_claims
 * where previous_user_id = $1 or new_user_id = $1 înainte de deleteUser".
 *
 * De ce un fișier separat: verificatorul din C12 (`scripts/lib/deletion-coverage.mjs`) își lua lista de
 * tabele doar din `references auth.users`. Tabela asta NU are cheie externă (e un jurnal de audit, cu
 * `previous_user_id` / `new_user_id` ca uuid simplu), deci era invizibilă pentru poartă — exact tiparul
 * „tabelă deținută de utilizator scăpată din verificare".
 *
 * Testele de mai jos pot PICA: dacă cineva scoate cele două ștergeri din `core.ts`, mutația din testul 3
 * dovedește că poarta raportează tabela ca neacoperită.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkDeletionCoverage, runDeletion, scanUserAuditTables } from '../scripts/lib/deletion-coverage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_ID = 'user-0000-1111';
const TABLE = 'notification_device_claims';
const MIGRATION = '20260915000200_harden_notification_device_claim.sql';
const CORE = path.join(root, 'supabase/functions/delete-account/core.ts');

test('B3: sursa de adevăr include tabela de audit (uuid de utilizator fără cheie externă)', () => {
  const audited = scanUserAuditTables(path.join(root, 'supabase/migrations'));
  assert.ok(audited.has(TABLE), `tabelele de audit găsite: ${[...audited.keys()].join(', ')}`);
  const entry = audited.get(TABLE);
  assert.deepEqual(
    [...entry.columns].sort(),
    ['new_user_id', 'previous_user_id'],
    'ambele coloane care identifică utilizatorul trebuie văzute',
  );
  assert.ok(
    entry.evidence.some((item) => item.startsWith(MIGRATION)),
    `dovada trebuie să indice migrația: ${entry.evidence.join(', ')}`,
  );
});

test('B3: migrația declară în continuare coloanele (dovada nu depinde de codul funcției)', () => {
  const sql = readFileSync(path.join(root, 'supabase/migrations', MIGRATION), 'utf8');
  assert.match(sql, /create table if not exists public\.notification_device_claims/i);
  assert.match(sql, /previous_user_id uuid/);
  assert.match(sql, /new_user_id uuid/);
});

test('B3: delete-account șterge ambele urme (new_user_id ȘI previous_user_id)', async () => {
  const { calls } = await runDeletion(CORE);
  const deletes = calls.filter((call) => call.op === 'delete' && call.table === TABLE);
  const columns = deletes.map((call) => call.column).sort();
  assert.deepEqual(columns, ['new_user_id', 'previous_user_id'], `ștergeri găsite: ${JSON.stringify(deletes)}`);
  for (const call of deletes) {
    assert.equal(call.value, USER_ID, 'ștergerea trebuie limitată la utilizatorul autentificat');
  }
});

test('B3: poarta de acoperire e verde pe arborele real', async () => {
  const result = await checkDeletionCoverage({ root });
  assert.deepEqual(result.auditTables, [TABLE], `tabele de audit: ${result.auditTables.join(', ')}`);
  assert.deepEqual(result.auditMissing, [], `tabele de audit neșterse: ${result.auditMissing.join(', ')}`);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unknownExplicit, []);
});

test('B3: mutație — dacă ștergerile dispar din cod, poarta trebuie să spună, nu să tacă', async () => {
  const source = readFileSync(CORE, 'utf8');
  const mutated = source
    .split(/\r?\n/)
    .filter((line) => !line.includes(`from('${TABLE}')`))
    .join('\n');

  assert.notEqual(mutated, source, 'mutația trebuie să scoată cel puțin o linie');
  assert.ok(source.includes(`from('${TABLE}')`), 'codul real trebuie să atingă tabela');

  const dir = mkdtempSync(path.join(tmpdir(), 'ortodoxia-b3-'));
  const mutatedPath = path.join(dir, 'core.ts');
  writeFileSync(mutatedPath, mutated, 'utf8');

  const result = await checkDeletionCoverage({ root, corePath: mutatedPath });
  assert.ok(
    result.auditMissing.some((entry) => entry.startsWith(TABLE)),
    `poarta ar fi trebuit să raporteze ${TABLE} ca neacoperit, dar a raportat: ${JSON.stringify(result.auditMissing)}`,
  );
  assert.ok(result.deletedTables.includes('favorites'), 'restul ștergerilor rămân intacte în mutație');
});

test('B3: documentația de ștergere a contului listează jurnalul de audit', () => {
  const doc = readFileSync(path.join(root, 'docs/ACCOUNT_DELETION.md'), 'utf8');
  assert.ok(doc.includes(TABLE), 'docs/ACCOUNT_DELETION.md trebuie să pomenescă tabela');
  assert.ok(existsSync(path.join(root, 'docs/ACCOUNT_DELETION.md')));
});
