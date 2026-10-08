/**
 * Verificare PROGRAMATICĂ a ștergerii contului (poziția C12 din audit).
 *
 * Problema pe care o rezolvă: testele vechi căutau textul funcției (`fn.includes('verse_favorites')`),
 * deci ar fi trecut și dacă ștergerea ar fi existat doar într-un comentariu, și NU puteau prinde o
 * linie de cod ștearsă. Aici:
 *
 *   1. lista tabelelor deținute de utilizator se extrage din MIGRAȚII (`references auth.users`) — sursă
 *      independentă de codul funcției; a doua listă (`scanUserAuditTables`) acoperă tabelele care țin
 *      UUID de utilizator fără cheie externă (jurnale de audit — poziția B3 din registru);
 *   2. comportamentul se obține prin EXECUTAREA `deleteOwnedData` cu un client fals care înregistrează
 *      fiecare apel (`from(table).delete().eq(...)`, `.in(...)`, `select().eq(...)`);
 *   3. fiecare tabelă din (1) trebuie să fie ștearsă explicit în (2) sau să fie declarată
 *      „cascade only" cu motiv, în `CASCADE_ONLY_TABLES` din modulul funcției.
 *
 * Consecința: ștergerea unei linii de cod din `core.ts` face verificarea să pice (dovada cu mutație:
 * `scripts/prove-account-deletion-test-fails.mjs`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CORE_RELATIVE = 'supabase/functions/delete-account/core.ts';

/** Toate fișierele .sql dintr-un director (recursiv, tolerant la lipsuri). */
function listSqlFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Tabelele definite în migrații cu cel puțin o coloană `references auth.users`.
 * @returns {Map<string, { references: string[]; withoutCascade: string[] }>}
 */
export function scanUserOwnedTables(migrationsDir) {
  const tables = new Map();
  for (const file of listSqlFiles(migrationsDir)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let current = null;
    lines.forEach((line, index) => {
      const create = /create table(?: if not exists)?\s+([a-z0-9_."]+)/i.exec(line);
      if (create) current = create[1].replace(/^public\./, '').replace(/"/g, '');
      if (!/references\s+auth\.users/i.test(line) || !current) return;
      const entry = tables.get(current) ?? { references: [], withoutCascade: [] };
      entry.references.push(`${path.basename(file)}:${index + 1}`);
      if (!/on delete cascade/i.test(line)) entry.withoutCascade.push(`${path.basename(file)}:${index + 1}`);
      tables.set(current, entry);
    });
  }
  return tables;
}

/**
 * Tabele care țin UUID de utilizator FĂRĂ cheie externă (`user_id` / `*_user_id` declarate simplu uuid).
 *
 * De ce e nevoie de a doua sursă de adevăr (poziția B3 din registru): `scanUserOwnedTables` se uită doar
 * după `references auth.users`, deci o tabelă-jurnal ca `notification_device_claims` (care leagă
 * utilizatorul prin `previous_user_id` / `new_user_id`, fără FK) era INVIZIBILĂ pentru poartă și putea
 * păstra urme la infinit fără ca vreun test să observe. Aici tabela e descoperită din MIGRAȚII, independent
 * de codul funcției, iar `checkDeletionCoverage` cere ca fiecare astfel de tabelă să fie ștearsă explicit
 * sau declarată exceptată cu motiv.
 *
 * Nu se cere `on delete cascade`: fără cheie externă nu există cascadă posibilă, deci exigența ar fi falsă.
 *
 * @returns {Map<string, { columns: string[]; evidence: string[] }>}
 */
export function scanUserAuditTables(migrationsDir) {
  const tables = new Map();
  const flush = (state) => {
    if (state.current && !state.hasForeignKey && state.columns.length > 0) {
      const entry = tables.get(state.current) ?? { columns: [], evidence: [] };
      for (const column of state.columns) if (!entry.columns.includes(column)) entry.columns.push(column);
      entry.evidence.push(...state.evidence);
      tables.set(state.current, entry);
    }
    state.current = null;
    state.hasForeignKey = false;
    state.columns = [];
    state.evidence = [];
  };

  for (const file of listSqlFiles(migrationsDir)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const state = { current: null, hasForeignKey: false, columns: [], evidence: [] };
    lines.forEach((line, index) => {
      const create = /create table(?: if not exists)?\s+([a-z0-9_."]+)/i.exec(line);
      if (create) {
        flush(state);
        state.current = create[1].replace(/^public\./, '').replace(/"/g, '');
        return;
      }
      if (!state.current) return;
      // Sfârșitul blocului `create table (...)`: doar o linie care începe cu paranteză închisă.
      if (/^\s*\)/.test(line)) {
        flush(state);
        return;
      }
      if (/references\s+auth\.users/i.test(line)) state.hasForeignKey = true;
      const column = /^\s*"?([a-z0-9_]*user_id)"?\s+uuid\b/i.exec(line);
      if (column) {
        state.columns.push(column[1]);
        state.evidence.push(`${path.basename(file)}:${index + 1}`);
      }
    });
    flush(state);
  }
  return tables;
}

/**
 * Client Supabase fals, care înregistrează apelurile.
 *
 * @param {{ failOn?: string[]; missingTables?: string[]; threads?: Array<{id: string}> | null }} options
 *   `failOn`: chei `table.op` (ex. `chat_threads.select`, `profiles.delete`) care răspund cu o eroare reală.
 *   `missingTables`: tabele care răspund cu PGRST205 („tabela nu există").
 */
export function makeFakeAdmin({ failOn = [], missingTables = [], threads = [{ id: 'thread-1' }] } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const respond = (op, result) => {
        calls.push({ table, op, ...(result.extra ?? {}) });
        if (missingTables.includes(table)) {
          return { error: { message: `Could not find the table '${table}' in the schema cache`, code: 'PGRST205' } };
        }
        if (failOn.includes(`${table}.${op}`) || failOn.includes(table)) {
          return { error: { message: `${table} ${op} failed (test)`, code: '42501' } };
        }
        return result.value;
      };
      return {
        select(columns) {
          return {
            eq: async (column, value) =>
              respond('select', { extra: { column, value, columns }, value: { data: threads, error: null } }),
          };
        },
        delete() {
          return {
            eq: async (column, value) => respond('delete', { extra: { column, value }, value: { error: null } }),
            in: async (column, values) =>
              respond('delete', { extra: { column, values }, value: { error: null } }),
          };
        },
      };
    },
  };
  return { admin, calls };
}

/** Rulează `deleteOwnedData` din `corePath` cu un client fals. */
export async function runDeletion(corePath, options = {}) {
  const module = await import(pathToFileURL(corePath).href);
  const { admin, calls } = makeFakeAdmin(options);
  const outcome = await module.deleteOwnedData(admin, 'user-0000-1111');
  return { module, calls, outcome };
}

/**
 * Verificarea completă: fiecare tabelă cu `references auth.users` e ștearsă explicit sau declarată
 * cascade-only; fiecare tabelă cu UUID de utilizator fără cheie externă (jurnale de audit, poziția B3) e
 * ștearsă explicit sau exceptată cu motiv; ordinea `chat_messages` înainte de `chat_threads`; nicio
 * ștergere din tabele care nu aparțin utilizatorului.
 */
export async function checkDeletionCoverage({ root, corePath, migrationsDir }) {
  const absoluteCore = corePath ?? path.join(root, DEFAULT_CORE_RELATIVE);
  const resolvedMigrations = migrationsDir ?? path.join(root, 'supabase/migrations');
  const userOwnedTables = scanUserOwnedTables(resolvedMigrations);
  const auditTables = scanUserAuditTables(resolvedMigrations);
  const { module, calls, outcome } = await runDeletion(absoluteCore);

  const deletedTables = calls.filter((call) => call.op === 'delete').map((call) => call.table);
  const cascadeOnly = (module.CASCADE_ONLY_TABLES ?? []).map((entry) => entry.table);
  /** Tabele-jurnal pe care funcția le exclude deliberat, fiecare cu motiv scris în cod. */
  const auditExempt = (module.AUDIT_EXEMPT_TABLES ?? []).map((entry) => entry.table);

  const missing = [];
  for (const [table, info] of userOwnedTables) {
    if (deletedTables.includes(table) || cascadeOnly.includes(table)) continue;
    missing.push(`${table} (${info.references.join(', ')})`);
  }

  const auditMissing = [];
  for (const [table, info] of auditTables) {
    if (deletedTables.includes(table) || auditExempt.includes(table)) continue;
    auditMissing.push(`${table} (${info.evidence.join(', ')})`);
  }

  const wronglyExempt = (module.AUDIT_EXEMPT_TABLES ?? [])
    .filter((entry) => !auditTables.has(entry.table) || !entry.reason || entry.reason.length < 20)
    .map((entry) => entry.table);

  const unknownExplicit = deletedTables.filter(
    (table) => !userOwnedTables.has(table) && !auditTables.has(table) && !auditExempt.includes(table),
  );

  const deleteOrder = calls.filter((call) => call.op === 'delete').map((call) => call.table);
  const messagesAt = deleteOrder.indexOf('chat_messages');
  const threadsAt = deleteOrder.lastIndexOf('chat_threads');
  const orderViolation =
    messagesAt !== -1 && threadsAt !== -1 && messagesAt > threadsAt
      ? 'chat_messages trebuie șters înainte de chat_threads'
      : null;

  return {
    userOwnedTables: [...userOwnedTables.keys()],
    auditTables: [...auditTables.keys()],
    cascadesWithoutClause: [...userOwnedTables.entries()]
      .filter(([, info]) => info.withoutCascade.length > 0)
      .map(([table, info]) => `${table} (${info.withoutCascade.join(', ')})`),
    deletedTables,
    cascadeOnly,
    auditExempt,
    missing,
    auditMissing,
    wronglyExempt,
    unknownExplicit,
    orderViolation,
    errors: outcome.errors,
    skipped: outcome.skipped,
  };
}
