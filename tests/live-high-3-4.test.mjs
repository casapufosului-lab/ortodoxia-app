import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const client = readFileSync(join(root, 'src/live/live-status-client.ts'), 'utf8');
const backend = readFileSync(join(root, 'supabase/functions/live-services-status/index.ts'), 'utf8');

test('LIVE client uses GET to match backend contract', () => {
  assert.ok(client.includes("supabase.functions.invoke('live-services-status', {"));
  assert.ok(client.includes("method: 'GET'"));
  assert.ok(backend.includes("if (req.method !== 'GET')"));
});

test('LIVE cache seed uses duplicate-safe upsert', () => {
  const start = backend.indexOf('const { error: seedError } = await admin');
  const end = backend.indexOf('if (seedError)', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const seed = backend.slice(start, end);
  assert.ok(seed.includes('.upsert('));
  assert.ok(!seed.includes('.insert('));
  assert.ok(seed.includes("{ onConflict: 'source_id', ignoreDuplicates: true }"));
});
