import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lib = readFileSync(join(root, 'src/lib/revenuecat.ts'), 'utf8');
const hook = readFileSync(join(root, 'src/hooks/use-revenuecat.ts'), 'utf8');

function functionBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('RevenueCat identity helper verifies the current App User ID', () => {
  const block = functionBlock(
    lib,
    'export async function ensureRevenueCatUser',
    'export async function clearRevenueCatUser',
  );

  const firstRead = block.indexOf('await Purchases.getAppUserID()');
  const login = block.indexOf('await Purchases.logIn(userId)');
  const secondRead = block.indexOf('await Purchases.getAppUserID()', firstRead + 1);
  const mismatch = block.indexOf("throw new Error('RevenueCat user identity mismatch.')");

  assert.ok(firstRead >= 0);
  assert.ok(login > firstRead);
  assert.ok(secondRead > login);
  assert.ok(mismatch > secondRead);
});

test('purchase identifies and verifies RevenueCat user before purchasePackage', () => {
  const block = functionBlock(
    lib,
    'export async function purchaseRevenueCatPackage',
    'export async function restoreRevenueCatPurchases',
  );

  assert.ok(block.includes('userId: string'));
  const ensure = block.indexOf('await ensureRevenueCatUser(userId)');
  const purchase = block.indexOf('await Purchases.purchasePackage(pkg)');
  assert.ok(ensure >= 0);
  assert.ok(purchase > ensure);
});

test('restore identifies and verifies RevenueCat user before restorePurchases', () => {
  const block = functionBlock(
    lib,
    'export async function restoreRevenueCatPurchases',
    'export function isPremiumActive',
  );

  assert.ok(block.includes('userId: string'));
  const ensure = block.indexOf('await ensureRevenueCatUser(userId)');
  const restore = block.indexOf('return Purchases.restorePurchases()');
  assert.ok(ensure >= 0);
  assert.ok(restore > ensure);
});

test('hook passes authenticated user ID into both critical RevenueCat actions', () => {
  assert.ok(hook.includes('purchaseRevenueCatPackage(pkg, userId)'));
  assert.ok(hook.includes('restoreRevenueCatPurchases(userId)'));
  assert.ok(hook.includes('[packages, t, userId]'));
  assert.ok(hook.includes('[t, userId]'));
});

test('buy and restore fail closed when there is no authenticated user ID', () => {
  const buy = functionBlock(hook, 'const buy = useCallback', 'const restore = useCallback');
  const restore = functionBlock(hook, 'const restore = useCallback', 'const priceFor = useCallback');

  assert.ok(buy.includes('if (!userId)'));
  assert.ok(restore.includes('if (!userId)'));
});
