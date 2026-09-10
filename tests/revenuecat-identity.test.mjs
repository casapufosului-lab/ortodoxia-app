import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

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

test('RevenueCat unlocked identity helper verifies the current App User ID', () => {
  const block = functionBlock(
    lib,
    'async function ensureRevenueCatUserUnlocked',
    'export async function ensureRevenueCatUser',
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

test('RevenueCat identity operations use the shared global lock', () => {
  const identify = functionBlock(
    lib,
    'export async function identifyRevenueCatUser',
    'async function ensureRevenueCatUserUnlocked',
  );
  const ensure = functionBlock(
    lib,
    'export async function ensureRevenueCatUser',
    'export async function getRevenueCatCustomerInfo',
  );

  assert.ok(identify.includes('runRevenueCatExclusive(() => ensureRevenueCatUserUnlocked(userId))'));
  assert.ok(ensure.includes('runRevenueCatExclusive(() => ensureRevenueCatUserUnlocked(userId))'));
});

test('logout only clears the RevenueCat identity it was asked to clear', () => {
  const block = functionBlock(
    lib,
    'export async function clearRevenueCatUser',
    'export async function getRevenueCatOfferings',
  );

  const lock = block.indexOf('runRevenueCatExclusive(async () => {');
  const read = block.indexOf('await Purchases.getAppUserID()');
  const guard = block.indexOf('if (currentUserId !== userId) return;');
  const logout = block.indexOf('await Purchases.logOut()');

  assert.ok(block.includes('clearRevenueCatUser(userId: string)'));
  assert.ok(lock >= 0);
  assert.ok(read > lock);
  assert.ok(guard > read);
  assert.ok(logout > guard);
});

test('CustomerInfo read is bound to a verified RevenueCat user inside the global lock', () => {
  const block = functionBlock(
    lib,
    'export async function getRevenueCatCustomerInfo',
    'export async function clearRevenueCatUser',
  );

  const lock = block.indexOf('runRevenueCatExclusive(async () => {');
  const ensure = block.indexOf('await ensureRevenueCatUserUnlocked(userId)');
  const read = block.indexOf('return Purchases.getCustomerInfo()');

  assert.ok(lock >= 0);
  assert.ok(ensure > lock);
  assert.ok(read > ensure);
});

test('purchase keeps identity verification and purchasePackage in one global lock', () => {
  const block = functionBlock(
    lib,
    'export async function purchaseRevenueCatPackage',
    'export async function restoreRevenueCatPurchases',
  );

  const lock = block.indexOf('return runRevenueCatExclusive(async () => {');
  const ensure = block.indexOf('await ensureRevenueCatUserUnlocked(userId)');
  const purchase = block.indexOf('await Purchases.purchasePackage(pkg)');

  assert.ok(lock >= 0);
  assert.ok(ensure > lock);
  assert.ok(purchase > ensure);
});

test('restore keeps identity verification and restorePurchases in one global lock', () => {
  const block = functionBlock(
    lib,
    'export async function restoreRevenueCatPurchases',
    'export function isPremiumActive',
  );

  const lock = block.indexOf('return runRevenueCatExclusive(async () => {');
  const ensure = block.indexOf('await ensureRevenueCatUserUnlocked(userId)');
  const restore = block.indexOf('return Purchases.restorePurchases()');

  assert.ok(lock >= 0);
  assert.ok(ensure > lock);
  assert.ok(restore > ensure);
});

test('hook passes authenticated user ID into purchase and restore', () => {
  assert.ok(hook.includes('purchaseRevenueCatPackage(pkg, userId)'));
  assert.ok(hook.includes('restoreRevenueCatPurchases(userId)'));
  assert.ok(hook.includes('[packages, t, userId]'));
  assert.ok(hook.includes('[t, userId]'));
});

test('hook rejects purchase and restore results after an account switch', () => {
  const guard = 'userIdRef.current !== userId';
  const count = hook.split(guard).length - 1;
  assert.ok(count >= 4, `expected stale-user guards for purchase/restore (found ${count})`);
  assert.ok(hook.includes('setCustomerInfoUserId(userId);'));
});

test('hook never exposes CustomerInfo owned by a previous user', () => {
  assert.ok(
    hook.includes('const currentCustomerInfo = customerInfoUserId === userId ? customerInfo : null;'),
  );
  assert.ok(hook.includes('customerInfo: currentCustomerInfo'));
  assert.ok(hook.includes('isPremium: isPremiumActive(currentCustomerInfo)'));
});

test('CustomerInfo listener re-reads verified current-user state instead of trusting event payload', () => {
  const listener = functionBlock(
    hook,
    'const listener: CustomerInfoUpdateListener',
    'Purchases.addCustomerInfoUpdateListener(listener)',
  );

  assert.ok(listener.includes('void refresh();'));
  assert.ok(!listener.includes('setCustomerInfo(info)'));
});

test('RevenueCat refresh rejects stale user and stale request results', () => {
  const block = functionBlock(
    hook,
    'const refresh = useCallback',
    '// Leaga utilizatorul autentificat',
  );

  assert.ok(block.includes('const requestId = ++refreshRequestRef.current;'));
  assert.ok(block.includes('const requestUserId = userId;'));
  assert.ok(block.includes('getRevenueCatCustomerInfo(requestUserId)'));
  assert.ok(block.includes('refreshRequestRef.current !== requestId'));
  assert.ok(block.includes('userIdRef.current !== requestUserId'));
});

test('logout passes the previous authenticated user ID to RevenueCat', () => {
  assert.ok(hook.includes('const previousUserId = previousUserIdRef.current;'));
  assert.ok(hook.includes('void clearRevenueCatUser(previousUserId);'));
});

test('buy and restore fail closed when there is no authenticated user ID', () => {
  const buy = functionBlock(hook, 'const buy = useCallback', 'const restore = useCallback');
  const restore = functionBlock(hook, 'const restore = useCallback', 'const priceFor = useCallback');

  assert.ok(buy.includes('if (!userId)'));
  assert.ok(restore.includes('if (!userId)'));
});

test('buy and restore scope loading state to the current account', () => {
  const buy = functionBlock(hook, 'const buy = useCallback', 'const restore = useCallback');
  const restore = functionBlock(hook, 'const restore = useCallback', 'const priceFor = useCallback');

  assert.ok(buy.includes('loadingUserIdRef.current = userId;'));
  assert.ok(buy.includes('setLoadingUserId(userId);'));
  assert.ok(restore.includes('loadingUserIdRef.current = userId;'));
  assert.ok(restore.includes('setLoadingUserId(userId);'));
  assert.ok(hook.includes('loading: loadingUserId === userId ? loading : false,'));
});

test('restore publishes CustomerInfo only for its authenticated user', () => {
  const restore = functionBlock(hook, 'const restore = useCallback', 'const priceFor = useCallback');
  const guard = restore.indexOf('if (!mountedRef.current || userIdRef.current !== userId)');
  const owner = restore.indexOf('setCustomerInfoUserId(userId);');
  const publish = restore.indexOf('setCustomerInfo(info);');
  assert.ok(guard >= 0);
  assert.ok(owner > guard);
  assert.ok(publish > owner);
});

test('stale operation clears loading only when it still owns the loading slot', () => {
  const ownerGuard = 'loadingUserIdRef.current === userId';
  assert.ok(hook.split(ownerGuard).length - 1 >= 2);
  assert.ok(!hook.includes('userIdRef.current === userId && loadingUserIdRef.current === userId'));
  assert.ok(hook.includes('loadingUserIdRef.current = null;'));
  assert.ok(hook.includes('setLoadingUserId(null);'));
});

test('userId ref is synchronized outside render', () => {
  assert.ok(hook.includes('useLayoutEffect(() => {'));
  assert.ok(hook.includes('userIdRef.current = userId;'));
  assert.ok(!hook.includes('const refreshRequestRef = useRef(0);'+String.fromCharCode(10)+'  userIdRef.current = userId;'));
});

function loadRealRevenueCatExclusive() {
  const start = lib.indexOf('let revenueCatOperationTail');
  const end = lib.indexOf('export function configureRevenueCat', start);

  assert.ok(start >= 0, 'RevenueCat operation tail not found');
  assert.ok(end > start, 'RevenueCat lock implementation end not found');

  // Execute the real production lock implementation without exporting a
  // test-only API from revenuecat.ts.
  const instrumented = `${lib.slice(start, end)}
globalThis.__runRevenueCatExclusive = runRevenueCatExclusive;
`;

  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;

  const context = vm.createContext({});
  vm.runInContext(javascript, context);

  assert.equal(typeof context.__runRevenueCatExclusive, 'function');
  return context.__runRevenueCatExclusive;
}

function nextEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('TG-01 real RevenueCat lock blocks a competing account operation until the first promise settles', async () => {
  const runExclusive = loadRealRevenueCatExclusive();

  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const events = [];
  let activeAccount = null;

  const first = runExclusive(async () => {
    events.push('A:start');
    activeAccount = 'A';
    await firstGate;
    events.push('A:end');
    return 'A';
  });

  const second = runExclusive(async () => {
    events.push('B:start');
    activeAccount = 'B';
    return 'B';
  });

  // Give the second operation enough time to start if the lock releases early.
  await nextEventLoopTurn();

  assert.deepEqual(events, ['A:start']);
  assert.equal(activeAccount, 'A');

  releaseFirst();

  assert.equal(await first, 'A');
  assert.equal(await second, 'B');
  assert.deepEqual(events, ['A:start', 'A:end', 'B:start']);
  assert.equal(activeAccount, 'B');
});

test('TG-01 real RevenueCat lock releases only after a rejected operation has actually settled', async () => {
  const runExclusive = loadRealRevenueCatExclusive();

  let rejectFirst;
  const firstGate = new Promise((resolve, reject) => {
    void resolve;
    rejectFirst = reject;
  });

  const events = [];
  let activeAccount = null;

  const first = runExclusive(async () => {
    events.push('A:start');
    activeAccount = 'A';
    await firstGate;
    return 'A';
  });

  // Attach the rejection handler immediately so the intentional rejection
  // can never become an unhandled promise rejection.
  const firstResult = first.then(
    () => 'unexpected-success',
    (error) => error instanceof Error ? error.message : String(error),
  );

  const second = runExclusive(async () => {
    events.push('B:start');
    activeAccount = 'B';
    return 'B';
  });

  await nextEventLoopTurn();

  assert.deepEqual(events, ['A:start']);
  assert.equal(activeAccount, 'A');

  rejectFirst(new Error('expected TG-01 rejection'));

  assert.equal(await firstResult, 'expected TG-01 rejection');
  assert.equal(await second, 'B');
  assert.deepEqual(events, ['A:start', 'B:start']);
  assert.equal(activeAccount, 'B');
});
