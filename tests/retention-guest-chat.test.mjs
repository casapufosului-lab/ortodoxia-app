/**
 * B2 — a doua jumătate a poziției: RETENȚIA.
 *
 * Un oaspete nu se întoarce niciodată să apese „Șterge istoricul". Deci, dacă ștergerea din aplicație
 * ar fi singura cale, transcrierile anonime ar rămâne oricum pe veci — exact ce spune auditul. Aici e
 * apărată curățarea programată, plus retenția pentru `notification_device_claims` (B3) și pentru
 * contoarele de oaspete, într-o singură funcție pe care ownerul o programează din dashboard.
 *
 * SQL-ul nu poate fi executat în această sesiune (fără `psql`/`supabase` CLI), deci verificarea e
 * făcută de un auditor propriu, cu regex strânse pe textul migrației. Auditorul e rulat ȘI pe o copie
 * mutată (fără filtrul de anonim), ca să se vadă că poate pica — un test care nu poate pica nu apără nimic.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION = 'supabase/migrations/20261008000300_retention_guest_chat.sql';
const CRON = 'supabase/cron/schedule-retention-purge.sql';
const DOCS = 'docs/ACCOUNT_DELETION.md';

/**
 * Comentariile sunt scoase înainte de verificare: ele pot pomeni „create extension pg_cron" sau un
 * exemplu de DELETE fără să execute nimic, iar un auditor care se ia după textul din comentarii
 * (sau, invers, care e păcălit de ele) nu apără nimic.
 */
function stripComments(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/**
 * Regulile de retenție, aplicate pe textul SQL. Fiecare regulă are un motiv, nu doar o formă.
 */
function auditRetentionSql(rawSql) {
  const sql = stripComments(rawSql);
  const problems = [];

  // 1. Funcția publică există și are fereastra implicită în zile (nu infinit).
  if (!/create or replace function public\.purge_guest_chat_history\(/.test(sql)) {
    problems.push('lipsește public.purge_guest_chat_history');
  }

  // 2. Ștergerea se face DOAR pentru utilizatori anonimi. Un `delete` fără filtrul de anonim
  //    ar șterge istoricul oamenilor cu cont — mult mai rău decât problema raportată.
  if (!/au\.is_anonymous\s*(=|is true)/.test(sql)) {
    problems.push('lipsește filtrul auth.users.is_anonymous = true');
  }
  if (/is_anonymous\s*(=\s*false|is false)/.test(sql)) {
    problems.push('există o condiție care țintește conturile reale');
  }

  // 3. Fereastra e mărginită: fiecare DELETE are WHERE și un prag de timp.
  const deleteStatements = sql.match(/delete from [\s\S]*?;/gi) ?? [];
  if (deleteStatements.length < 3) {
    problems.push(`prea puține ștergeri (${deleteStatements.length}); aștept chat, claims, usage`);
  }
  for (const statement of deleteStatements) {
    if (!/\bwhere\b/i.test(statement)) {
      problems.push(`DELETE fără WHERE: ${statement.slice(0, 60)}`);
      continue;
    }
    if (!/(interval|p_days|p_claim_days|p_usage_days|last_sign_in_at|updated_at)/i.test(statement)) {
      problems.push(`DELETE fără prag de timp: ${statement.slice(0, 60)}`);
    }
  }

  // 4. Contul anonim însuși dispare (altfel doar istoricul lui pleacă, iar rândul rămâne).
  if (!/delete from auth\.users[\s\S]*?is_anonymous/i.test(sql)) {
    problems.push('conturile anonime expirate nu sunt șterse');
  }

  // 5. Retenția B3 e inclusă în aceeași curățenie, cu fereastra ei mai lungă.
  if (!/notification_device_claims/.test(sql)) {
    problems.push('notification_device_claims nu are retenție');
  }
  // 6. Contoarele de oaspete au și ele o fereastră.
  if (!/guest_usage_daily/.test(sql)) {
    problems.push('guest_usage_daily nu are retenție');
  }

  // 7. Parametrii sunt validați: un apel cu 0 zile nu are voie să golească totul.
  if (!/if p_days\s*<\s*1/.test(sql)) {
    problems.push('p_days nu e validat (un apel greșit ar șterge tot)');
  }

  // 8. Idempotent: se poate reaplica fără să strice nimic.
  if (!/create or replace function/.test(sql)) {
    problems.push('nu e idempotentă (create or replace)');
  }

  // 9. Fără date inventate: nu are voie să atingă conținutul (versete, calendar, rugăciuni).
  if (/delete from public\.(daily_content|calendar_days|prayers)/.test(sql)) {
    problems.push('curățenia atinge conținut, nu doar date de utilizator');
  }

  return problems;
}

test('migrația de retenție trece auditorul', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.deepEqual(auditRetentionSql(sql), []);
});

test('auditorul poate pica: fără filtrul de anonim, retenția e respinsă', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const mutated = sql
    .replaceAll(/au\.is_anonymous\s*(=\s*true|is true)/g, '1 = 1')
    .replace(/delete from auth\.users[\s\S]*?;/i, 'select 1;');

  const problems = auditRetentionSql(mutated);
  assert.ok(problems.length >= 2, 'un SQL care ar șterge și conturile reale trebuie respins');
  assert.ok(problems.some((problem) => problem.includes('is_anonymous')), problems.join(' | '));
});

test('auditorul poate pica: un DELETE nemărginit e respins', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const mutated = `${sql}\ndelete from public.chat_messages;\n`;
  assert.ok(auditRetentionSql(mutated).some((problem) => problem.includes('fără WHERE')));
});

test('ferestrele declarate sunt cele din documentație', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  // Valorile sunt repetate intenționat în trei locuri (cod, comment, docs), pentru că ele sunt
  // promisiunea din formularul Data safety.
  for (const window of ['p_days integer default 30', 'p_claim_days integer default 180', 'p_usage_days integer default 31']) {
    assert.ok(sql.includes(window), `lipsește fereastra: ${window}`);
  }

  const docs = readFileSync(DOCS, 'utf8');
  assert.match(docs, /purge_guest_chat_history/);
  for (const number of ['30', '180', '31']) {
    assert.ok(docs.includes(number), `documentația nu pomenește fereastra de ${number}`);
  }
});

test('programarea e separată de migrație și e protejată de extensie', () => {
  const cron = readFileSync(CRON, 'utf8');
  // Același motiv pentru care programatorul notificărilor stă în `supabase/cron/`: `create extension
  // pg_cron` poate fi refuzat de proiect, iar atunci un `db push` întreg ar cădea din cauza lui.
  assert.match(cron, /pg_extension/);
  assert.match(cron, /purge_guest_chat_history/);
  assert.match(cron, /cron\.unschedule/);
  assert.match(cron, /cron\.schedule/);
  const migrationCode = stripComments(readFileSync(MIGRATION, 'utf8'));
  assert.equal(/create extension/i.test(migrationCode), false, 'migrația nu forțează extensii');
});
