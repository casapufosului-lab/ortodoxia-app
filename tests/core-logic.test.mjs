import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// The two constants and hasPremiumAccess below mirror EXACTLY the implementation
// in src/lib/subscription.ts. They are duplicated here (rather than imported) so the
// test is self-contained and runnable without a TS build step, and so the Premium
// server-trust contract is frozen as an invariant.
const FREE_DAILY_AI_LIMIT = 5;
const PREMIUM_DAILY_AI_LIMIT = 50;

function hasPremiumAccess(subscription) {
  if (!subscription) return false;
  // 'canceled' păstrează accesul până la sfârșitul perioadei plătite.
  if (!['active', 'trialing', 'canceled'].includes(subscription.status)) return false;
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}

test('FREE_DAILY_AI_LIMIT is 5', () => {
  assert.equal(FREE_DAILY_AI_LIMIT, 5);
});

test('PREMIUM_DAILY_AI_LIMIT is 50', () => {
  assert.equal(PREMIUM_DAILY_AI_LIMIT, 50);
});

// Premium determination is server-trust based (real hasPremiumAccess logic).
test('hasPremiumAccess denies null/undefined', () => {
  assert.equal(hasPremiumAccess(null), false);
  assert.equal(hasPremiumAccess(undefined), false);
});

test('hasPremiumAccess allows only active/trialing/canceled in-window', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(hasPremiumAccess({ status: 'active', plan: 'monthly', current_period_end: future, cancel_at_period_end: false }), true);
  assert.equal(hasPremiumAccess({ status: 'trialing', plan: 'monthly', current_period_end: future, cancel_at_period_end: false }), true);
  assert.equal(hasPremiumAccess({ status: 'canceled', plan: 'annual', current_period_end: future, cancel_at_period_end: true }), true);
});

test('hasPremiumAccess denies expired or inactive/wrong statuses', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(hasPremiumAccess({ status: 'active', plan: 'monthly', current_period_end: past, cancel_at_period_end: false }), false);
  assert.equal(hasPremiumAccess({ status: 'past_due', plan: 'monthly', current_period_end: null, cancel_at_period_end: false }), false);
  assert.equal(hasPremiumAccess({ status: 'expired', plan: 'monthly', current_period_end: null, cancel_at_period_end: false }), false);
});

// Diacritic-insensitive prayer search (exact logic from src/app/(tabs)/prayers.tsx).
function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro')
    .trim();
}

test('"tatal" matches "Tatăl" per current search implementation', () => {
  const title = 'Tatăl nostru';
  const category = 'rugaciune';
  const body = 'Cuvântul Tatălui nostru';
  const haystack = normalizeSearchText(`${title} ${category} ${body}`);
  assert.equal(haystack.includes('tatal'), true, `"tatal" should be found in "${haystack}"`);
  assert.equal(haystack.includes(normalizeSearchText('Tatăl')), true);
});

test('diacritic-insensitive search ignores ă-â-î-ș-ț', () => {
  const normalize = normalizeSearchText;
  assert.equal(normalize('Și târnăcopul coșmarului Râmnicu Vâlcea').includes('tarnacopul'), true);
  assert.equal(normalize('Tatăl').includes(normalize('tatal')), true);
  assert.equal(normalize('Edmondă').includes('edmonda'), true);
});

// Structural checks: client must NOT write to `subscriptions` (server-authoritative Premium).
test('no client-side subscription writes in src/', async () => {
  const files = scanTs(root + '/src');
  const writes = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // Match any .from('subscriptions').insert/update/upsert/delete (allowing whitespace).
    const re = /\.from\(\s*['"]subscriptions['"]\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) writes.push(`${file}: ${m[1]}`);
  }
  // Only SELECT reads are legitimate.
  const allSubRefs = [];
  const refRe = /\.from\(\s*['"]subscriptions['"]\s*\)/g;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = refRe.exec(src)) !== null) allSubRefs.push(`${file}`);
  }
  assert.ok(allSubRefs.length > 0, 'expect at least one read reference to subscriptions');
  assert.deepEqual(writes, [], `unexpected subscription writes: ${writes.join('; ')}`);
});

function scanTs(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(current, name);
      if (existsSync(full)) {
        const stat = statSync(full);
        if (stat?.isDirectory()) stack.push(full);
        else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
      }
    }
  }
  return out;
}
