/**
 * Controlul de derivă a schemei (incidentul `last_request_at`, 23.09.2026).
 *
 * Ce dovedesc testele:
 *   A. o schemă completă trece (fără falsuri pozitive);
 *   B. O COLOANĂ LIPSĂ este raportată — exact cazul care a oprit chatul în producție;
 *   C. un tabel lipsă și un RPC lipsă sunt raportate;
 *   D. lista de coloane cerute acoperă ce citește/scrie endpointul de chat (fără să pretindă schema întreagă);
 *   E. migrația de reparare există, este idempotentă și nu rescrie date.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REQUIRED_COLUMNS, REQUIRED_RPCS, schemaDrift, schemaDriftSummary } from '../scripts/schema-checks.mjs';

const endpoint = readFileSync(resolve('supabase/functions/orthodox-chat/index.ts'), 'utf8');
const repair = readFileSync(resolve('supabase/migrations/20260923000200_restore_ai_usage_cooldown_columns.sql'), 'utf8');

/** O specificație PostgREST minimă, construită din lista cerută (deci „fără derivă"). */
function completeSpec(overrides = {}) {
  const definitions = {};
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    definitions[table] = { properties: Object.fromEntries(columns.map((column) => [column, { type: 'string' }])) };
  }
  const paths = Object.fromEntries(REQUIRED_RPCS.map((name) => [`/rpc/${name}`, { post: {} }]));
  return { definitions: { ...definitions, ...(overrides.definitions ?? {}) }, paths: { ...paths, ...(overrides.paths ?? {}) } };
}

test('A. o schemă completă nu produce derivă', () => {
  const drift = schemaDrift(completeSpec());
  assert.deepEqual(drift, { missingTables: [], missingColumns: [], missingRpcs: [], ok: true });
  assert.equal(schemaDriftSummary(drift), 'schema reală acoperă tot ce cere codul');
});

test('B. o coloană lipsă este raportată — cazul care a oprit chatul', () => {
  const spec = completeSpec();
  delete spec.definitions.usage_daily.properties.last_request_at;
  const drift = schemaDrift(spec);
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.missingColumns, ['usage_daily.last_request_at']);
  assert.equal(drift.missingTables.length, 0);
  assert.match(schemaDriftSummary(drift), /usage_daily\.last_request_at/);
});

test('C. un tabel lipsă și un RPC lipsă sunt raportate', () => {
  const spec = completeSpec();
  delete spec.definitions.guest_usage_daily;
  delete spec.paths['/rpc/ai_monthly_status'];
  const drift = schemaDrift(spec);
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.missingTables, ['guest_usage_daily']);
  assert.deepEqual(drift.missingRpcs, ['ai_monthly_status']);
  // Coloanele tabelului absent nu se raportează de două ori (zgomot inutil).
  assert.equal(drift.missingColumns.some((column) => column.startsWith('guest_usage_daily.')), false);
});

test('D. lista cerută acoperă coloanele pe care le folosește endpointul de chat', () => {
  // Fiecare tabelă atinsă de endpoint trebuie să fie în listă, iar coloanele de cooldown la locul lor.
  for (const table of ['usage_daily', 'guest_usage_daily', 'subscriptions', 'chat_threads', 'chat_messages']) {
    assert.ok(REQUIRED_COLUMNS[table], `${table} trebuie verificat`);
  }
  assert.ok(REQUIRED_COLUMNS.usage_daily.includes('last_request_at'));
  assert.ok(REQUIRED_COLUMNS.guest_usage_daily.includes('last_request_at'));
  for (const column of ['ai_messages', 'last_request_at', 'usage_date']) {
    assert.ok(REQUIRED_COLUMNS.usage_daily.includes(column), `usage_daily.${column} este citită de cod`);
  }
  assert.match(endpoint, /p_client_hash: clientHash/);
  assert.ok(REQUIRED_RPCS.includes('reserve_ai_request'));
});

test('E. migrația de reparare este idempotentă și nu atinge datele', () => {
  for (const table of ['usage_daily', 'guest_usage_daily']) {
    assert.match(repair, new RegExp(`ALTER TABLE public\\.${table}\\s*\\n\\s*ADD COLUMN IF NOT EXISTS last_request_at timestamptz;`));
  }
  assert.equal(/DELETE|TRUNCATE|DROP COLUMN|UPDATE public\./i.test(repair), false);
  assert.match(repair, /42703/);
});
