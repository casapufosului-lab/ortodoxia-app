/**
 * Dovada că verificarea de acoperire a ștergerii contului (C12) CHIAR verifică codul.
 *
 * Criticile din audit la adresa testelor vechi:
 *   - `fn.includes('verse_favorites')` trece și dacă ștergerea e doar într-un comentariu;
 *   - testul nu putea prinde o linie de cod ȘTEARSĂ.
 *
 * Acest script demonstrează contrariul pentru noile teste: copiază `core.ts` într-un fișier temporar,
 * ȘTERGE o linie de cod (ștergerea pentru `verse_favorites`), rulează exact aceeași verificare folosită
 * de `tests/account-deletion.test.mjs` și cere ca aceasta SĂ PICE. Dacă mutația trece, scriptul iese 1.
 *
 *   node scripts/prove-account-deletion-test-fails.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { checkDeletionCoverage, runDeletion } = await import(
  pathToFileURL(path.join(root, 'scripts/lib/deletion-coverage.mjs')).href
);

const corePath = path.join(root, 'supabase/functions/delete-account/core.ts');
const source = readFileSync(corePath, 'utf8');

let failures = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
};

// 0. Bază: codul real trece verificarea.
const baseline = await checkDeletionCoverage({ root });
check(
  'codul real: nicio tabelă deținută de utilizator neacoperită',
  baseline.missing.length === 0,
  JSON.stringify(baseline.missing),
);
check('codul real: nicio eroare la rularea secvenței', baseline.errors.length === 0, JSON.stringify(baseline.errors));

// 1. Mutație: scoatem LINIA DE COD care șterge verse_favorites (nu comentariul — un test care caută
//    doar textul ar trece aici, exact critica din audit).
const lines = source.split('\n');
const verseFavLine = lines.find((line) => /record\('verse_favorites'/.test(line));
if (!verseFavLine) {
  console.error('FAIL nu am găsit linia de ștergere pentru verse_favorites în core.ts');
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), 'del-proof-'));
const mutatedPath = path.join(dir, 'core.ts');
writeFileSync(mutatedPath, source.replace(`${verseFavLine}\n`, ''), 'utf8');

const mutated = await checkDeletionCoverage({ root, corePath: mutatedPath });
check(
  'mutație (linia verse_favorites ștearsă): verificarea PICĂ',
  mutated.missing.some((entry) => entry.startsWith('verse_favorites')),
  JSON.stringify(mutated.missing),
);
check(
  'mutație: restul tabelelor rămân acoperite (mutația e țintită, nu globală)',
  mutated.missing.every((entry) => entry.startsWith('verse_favorites')),
  JSON.stringify(mutated.missing),
);

// 2. Ordinea copiilor înaintea părinților: mutăm ștergerea mesajelor DUPĂ thread-uri (rescrisă
//    autonom, ca fișierul mutat să fie tot valid).
const messagesDeleteLine = lines.find((line) => line.includes("from('chat_messages')"));
const threadsDeleteLine = lines.find((line) => line.includes("from('chat_threads').delete()"));
if (messagesDeleteLine && threadsDeleteLine) {
  const movedLine =
    "  record('chat_messages', '', (await admin.from('chat_messages').delete().in('thread_id', ['mutant'])).error);";
  const reordered = source
    .replace(`${messagesDeleteLine}\n`, '')
    .replace(threadsDeleteLine, `${threadsDeleteLine}\n${movedLine}`);
  const orderPath = path.join(dir, 'core-order.ts');
  writeFileSync(orderPath, reordered, 'utf8');
  const ordered = await checkDeletionCoverage({ root, corePath: orderPath });
  check(
    'mutație (mesaje șterse după thread-uri): verificarea de ordine PICĂ',
    ordered.orderViolation !== null,
    String(ordered.orderViolation),
  );
} else {
  check('mutația de ordine a putut fi construită', false, 'blocurile chat_messages/chat_threads nu au fost găsite');
}

// 3. Eroarea de listare (C11) trebuie RAPORTATĂ, nu înghițită.
const reported = await runDeletion(corePath, { failOn: ['chat_threads.select'] });
check(
  'SELECT eșuat pe chat_threads produce o eroare raportată (C11)',
  reported.outcome.errors.some((entry) => entry.startsWith('chat_threads(list)')),
  JSON.stringify(reported.outcome.errors),
);

// 4. Tabelă inexistentă (PGRST205) — raportată, dar nu blocantă.
const missingTable = await runDeletion(corePath, { missingTables: ['verse_favorites'] });
check(
  'tabelă inexistentă: raportată în `skipped`, fără să blocheze ștergerea',
  missingTable.outcome.skipped.some((entry) => entry.startsWith('verse_favorites')) &&
    missingTable.outcome.errors.length === 0,
  JSON.stringify(missingTable.outcome),
);

// 5. O eroare reală pe orice tabelă oprește fluxul (handlerul răspunde 500).
const hardFailure = await runDeletion(corePath, { failOn: ['profiles.delete'] });
check(
  'eroare reală pe profiles: flux oprit înainte de ștergerea contului',
  hardFailure.outcome.errors.some((entry) => entry.startsWith('profiles')),
  JSON.stringify(hardFailure.outcome.errors),
);

rmSync(dir, { recursive: true, force: true });

console.log(failures === 0 ? '\nPROOF PASS: testele chiar verifică ștergerea contului.' : `\nPROOF FAIL: ${failures} verificări au picat.`);
process.exit(failures === 0 ? 0 : 1);
