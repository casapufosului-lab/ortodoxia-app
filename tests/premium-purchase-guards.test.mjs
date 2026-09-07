/**
 * STRUCTURAL TEST ONLY
 *
 * What they prove:
 *   - Source-code patterns that must be present for purchase/restore safety
 *   - Guards, entitlement checks, cleanup, and security invariants
 *
 * What they do NOT prove:
 *   - Runtime behavior of React Native components
 *   - Actual RevenueCat purchase / restore flows
 *   - Real Apple/Google store transactions
 *   - UI rendering or user interaction
 *
 * No external credentials required. No production store calls.
 */

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const PREMIUM_SCREEN = readFileSync('src/app/premium.tsx', 'utf8');
const RC_HOOK = readFileSync('src/hooks/use-revenuecat.ts', 'utf8');
const RC_LIB = readFileSync('src/lib/revenuecat.ts', 'utf8');
const I18N_CONFIG = readFileSync('src/i18n/config.ts', 'utf8');

describe('ERR-B4: Premium purchase/restore safety (STRUCTURAL TEST ONLY)', () => {
  it('STRUCTURAL: purchase handler uses synchronous busyRef guard', () => {
    assert.ok(/busyRef\.current/.test(PREMIUM_SCREEN));
    assert.ok(/busyRef\.current\s*=\s*true/.test(PREMIUM_SCREEN));
  });

  it('STRUCTURAL: purchase handler resets busyRef in finally block', () => {
    const block = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const purchase'),
      PREMIUM_SCREEN.indexOf('const handleRestore'),
    );
    assert.ok(/finally\s*\{[^}]*busyRef\.current\s*=\s*false/.test(block));
  });

  it('STRUCTURAL: restore handler uses the same busyRef guard and finally', () => {
    const restIdx = PREMIUM_SCREEN.indexOf('const handleRestore');
    const block = PREMIUM_SCREEN.slice(restIdx, PREMIUM_SCREEN.indexOf('const styles'));
    assert.ok(/busyRef\.current\s*=\s*true/.test(block));
    assert.ok(/finally\s*\{[^}]*busyRef\.current\s*=\s*false/.test(block));
  });

  it('STRUCTURAL: purchase and restore share the same busyRef (concurrency blocked)', () => {
    const restIdx = PREMIUM_SCREEN.indexOf('const handleRestore');
    assert.ok(/busyRef\.current/.test(PREMIUM_SCREEN.slice(0, restIdx)));
    assert.ok(/busyRef\.current/.test(PREMIUM_SCREEN.slice(restIdx)));
  });

  it('STRUCTURAL: both purchase and handleRestore use try/finally for cleanup', () => {
    const stylesIdx = PREMIUM_SCREEN.indexOf('const styles');
    const pBlock = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const purchase'),
      PREMIUM_SCREEN.indexOf('const handleRestore'),
    );
    assert.ok(/try\s*\{/.test(pBlock) && /finally\s*\{/.test(pBlock));
    const rBlock = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const handleRestore'),
      stylesIdx,
    );
    assert.ok(/try\s*\{/.test(rBlock) && /finally\s*\{/.test(rBlock));
  });

  it('STRUCTURAL: buy() guards missing packages before setLoading', () => {
    const buyBlock = RC_HOOK.slice(
      RC_HOOK.indexOf('const buy'),
      RC_HOOK.indexOf('const restore'),
    );
    assert.ok(/!packages/.test(buyBlock));
    assert.ok(/!pkg\b/.test(buyBlock));
  });

  it('STRUCTURAL: buy() has finally block clearing loading', () => {
    const buyBlock = RC_HOOK.slice(
      RC_HOOK.indexOf('const buy'),
      RC_HOOK.indexOf('const restore'),
    );
    assert.ok(/finally\s*\{/.test(buyBlock));
    assert.ok(/setLoading\(false\)/.test(buyBlock));
  });

  it('STRUCTURAL: buy() catch + finally ensures cleanup on throw', () => {
    const buyBlock = RC_HOOK.slice(
      RC_HOOK.indexOf('const buy'),
      RC_HOOK.indexOf('const restore'),
    );
    assert.ok(/catch/.test(buyBlock));
    assert.ok(/finally/.test(buyBlock));
  });

  it('STRUCTURAL: cancellation detected and returns ok:false with cancelled:true', () => {
    assert.ok(/isPurchaseCancelledError/.test(RC_HOOK));
    assert.ok(/isPurchaseCancelledError\(error\)[^}]*cancelled:\s*true/.test(RC_HOOK));
  });

  it('STRUCTURAL: buy() checks isPremiumActive before claiming success', () => {
    const buyBlock = RC_HOOK.slice(
      RC_HOOK.indexOf('const buy'),
      RC_HOOK.indexOf('const restore'),
    );
    assert.ok(/isPremiumActive\(info\)/.test(buyBlock));
    assert.ok(/premium\.paymentPending/.test(buyBlock));
    assert.ok(/Plata a fost procesată, dar Premium nu este încă activ/.test(I18N_CONFIG));
  });

  it('STRUCTURAL: restore with active Premium returns ok:true and with no entitlement returns ok:false', () => {
    const rBlock = RC_HOOK.slice(
      RC_HOOK.indexOf('const restore'),
      RC_HOOK.indexOf('const priceFor'),
    );
    // The restore branch must distinguish ok:true ONLY for active premium and
    // explicit ok:false for "no purchase found" - never a misleading ok:true.
    assert.ok(/isPremiumActive\(info\)\s*\?\s*\{\s*ok:\s*true/.test(rBlock));
    assert.ok(/isPremiumActive\(info\)\s*\?\s*\{\s*ok:\s*true[^}]*\}\s*:\s*\{\s*ok:\s*false[^}]*\}/.test(rBlock));
  });

  it('STRUCTURAL: PremiumScreen has mountedRef to guard async state updates', () => {
    assert.ok(/mountedRef/.test(PREMIUM_SCREEN));
    assert.ok(/mountedRef\.current\s*=\s*false/.test(PREMIUM_SCREEN));
  });

  it('STRUCTURAL: PremiumScreen guards setBusyPlan(null) in finally after unmount', () => {
    const pBlock = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const purchase'),
      PREMIUM_SCREEN.indexOf('const handleRestore'),
    );
    assert.ok(/if\s*\(\s*mountedRef\.current\s*\)\s*setBusyPlan\(null\)/.test(pBlock));
    const rBlock = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const handleRestore'),
      PREMIUM_SCREEN.indexOf('const styles ='),
    );
    assert.ok(/if\s*\(\s*mountedRef\.current\s*\)\s*setBusyPlan\(null\)/.test(rBlock));
  });

  it('STRUCTURAL: busyRef.current is always released in finally, even after unmount', () => {
  it('STRUCTURAL: busyRef.current is always released in finally, even after unmount', () => {
    const pBlock = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const purchase'),
      PREMIUM_SCREEN.indexOf('const handleRestore'),
    );
    assert.ok(/finally\s*\{[^}]*busyRef\.current\s*=\s*false/.test(pBlock));
    const rBlock = PREMIUM_SCREEN.slice(
      PREMIUM_SCREEN.indexOf('const handleRestore'),
      PREMIUM_SCREEN.indexOf('const styles ='),
    );
    assert.ok(/finally\s*\{[^}]*busyRef\.current\s*=\s*false/.test(rBlock));
  });
  });

  it('STRUCTURAL: /privacy and /terms routes have no `as any` cast', () => {
    assert.ok(/router\.push\(['"]\/privacy['"]\)/.test(PREMIUM_SCREEN));
    assert.ok(!/router\.push\(['"]\/privacy['"]\s+as\s+any\)/.test(PREMIUM_SCREEN));
    assert.ok(/router\.push\(['"]\/terms['"]\)/.test(PREMIUM_SCREEN));
    assert.ok(!/router\.push\(['"]\/terms['"]\s+as\s+any\)/.test(PREMIUM_SCREEN));
  });

  it('STRUCTURAL: no forbidden bypasses (as any, @ts-ignore, eslint-disable) in ERR-B4 code', () => {
    assert.ok(!/as\s+any/.test(PREMIUM_SCREEN), 'premium.tsx must not use `as any`');
    assert.ok(!/@ts-ignore/.test(PREMIUM_SCREEN), 'premium.tsx must not use @ts-ignore');
    assert.ok(!/@ts-expect-error/.test(PREMIUM_SCREEN), 'premium.tsx must not use @ts-expect-error');
    assert.ok(!/eslint-disable/.test(PREMIUM_SCREEN), 'premium.tsx must not use eslint-disable');
  });

  it('STRUCTURAL: restore no-purchase message is honest Romanian', () => {
    assert.ok(/premium\.restoreNone/.test(RC_HOOK));
    assert.ok(/Nu am găsit cumpărături de restaurat/.test(I18N_CONFIG));
  });

  it('STRUCTURAL: restore has finally block clearing loading', () => {
    const rBlock = RC_HOOK.slice(
      RC_HOOK.indexOf('const restore'),
      RC_HOOK.indexOf('const priceFor'),
    );
    assert.ok(/finally\s*\{/.test(rBlock));
    assert.ok(/setLoading\(false\)/.test(rBlock));
  });

  it('STRUCTURAL: buy/restore guard unconfigured RevenueCat with Romanian message', () => {
    assert.ok(/!isRevenueCatConfigured\(\)/.test(RC_HOOK));
    assert.ok(/premium\.storeUnavailable/.test(RC_HOOK));
    assert.ok(/Magazinul nu este disponibil momentan/.test(I18N_CONFIG));
  });

  it('STRUCTURAL: refresh catch sets offeringsError', () => {
    const refreshStart = RC_HOOK.indexOf('const refresh');
    const refreshEnd = RC_HOOK.indexOf('}, []);', refreshStart);
    const rBlock = RC_HOOK.slice(refreshStart, refreshEnd + 5);
    assert.ok(/catch/.test(rBlock));
    assert.ok(/setOfferingsError/.test(rBlock));
  });

  it('STRUCTURAL: premium/revenuecat files never insert/update subscriptions', () => {
    const entries = [['premium', PREMIUM_SCREEN], ['revenuecat-hook', RC_HOOK], ['revenuecat-lib', RC_LIB]];
    for (const [name, src] of entries) {
      const hasWrite = /\.from\(\s*['"]subscriptions['"]\)/.test(src) && /\.(insert|update|upsert|delete)/.test(src);
      assert.ok(!hasWrite, `${name} must not write to subscriptions table`);
    }
  });

  it('STRUCTURAL: no console.log of receipts, tokens, or API keys', () => {
    const entries = [['premium', PREMIUM_SCREEN], ['revenuecat-hook', RC_HOOK], ['revenuecat-lib', RC_LIB]];
    for (const [name, src] of entries) {
      assert.ok(!/console\.(log|warn|error)\(.*receipt/i.test(src), `${name} must not log receipts`);
      assert.ok(!/console\.(log|warn|error)\(.*token/i.test(src), `${name} must not log tokens`);
      assert.ok(!/console\.(log|warn|error)\(.*api.?key/i.test(src), `${name} must not log API keys`);
    }
  });

  it('STRUCTURAL: useRevenueCat has mountedRef to guard async state updates', () => {
    assert.ok(/mountedRef/.test(RC_HOOK));
    assert.ok(/!mountedRef\.current/.test(RC_HOOK));
  });

  it('STRUCTURAL: PREMIUM_ENTITLEMENT_ID is "premium"', () => {
    assert.ok(/PREMIUM_ENTITLEMENT_ID\s*=\s*['"]premium['"]/.test(RC_LIB));
  });

  it('STRUCTURAL: no logging of authorization or auth headers', () => {
    const entries = [['premium', PREMIUM_SCREEN], ['revenuecat-hook', RC_HOOK], ['revenuecat-lib', RC_LIB]];
    for (const [name, src] of entries) {
      assert.ok(!/console\.(log|warn|error)\(.*auth/i.test(src), `${name} must not log auth data`);
    }
  });
});
