import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const client = readFileSync(join(root, 'src/live/live-status-client.ts'), 'utf8');
const backend = readFileSync(join(root, 'supabase/functions/live-services-status/index.ts'), 'utf8');

test('LIVE client uses GET with an explicit timeout to match backend contract', () => {
  // The client now routes the call through a try/catch and captures its result, so
  // assert the contract (invoke target, method, bounded request) rather than the
  // exact single-expression shape.
  assert.ok(client.includes("supabase.functions.invoke<LiveStatusResponse>('live-services-status'"));

  const invokeStart = client.indexOf('supabase.functions.invoke<LiveStatusResponse>');
  const invokeEnd = client.indexOf('});', invokeStart);
  assert.ok(invokeStart >= 0 && invokeEnd > invokeStart);
  const invokeBlock = client.slice(invokeStart, invokeEnd);
  assert.ok(invokeBlock.includes("method: 'GET'"));
  assert.ok(
    invokeBlock.includes('timeout: LIVE_STATUS_TIMEOUT_MS'),
    'the request must be bounded so the LIVE screen cannot spin forever',
  );

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
