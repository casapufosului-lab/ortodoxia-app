import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fn = readFileSync('supabase/functions/delete-account/index.ts', 'utf8');

test('LOW #23 delete-account does not expose raw database cleanup details', () => {
  assert.match(fn, /if \(errors\.length > 0\)/);
  assert.doesNotMatch(fn, /details:\s*errors/);
  assert.match(fn, /return json\(\{ error: 'Ștergerea datelor nu a reușit\. Încearcă din nou\.' \}, 500\);/);
});
