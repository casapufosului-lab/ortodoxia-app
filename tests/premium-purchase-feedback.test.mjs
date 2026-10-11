import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Pins for the build-12 Premium failure feedback (10.10.2026).
 *
 * On the iPhone, tapping "Activează planul" opened NOTHING: no Apple sheet, no Face ID, no
 * message. Two things had to change:
 *   - a failed purchase/restore must show the RevenueCat code and message on the screen,
 *     not only the generic "could not be completed" sentence;
 *   - a disabled buy button must say WHY it is disabled, right next to the button.
 *
 * The measured facts behind them (build 11, checked in the shipped .ipa and in the local
 * sources): the App Store key IS in the bundle (a 50-character `appl_...` token), so the
 * SDK is configured on iOS - the silence was in the UI, not in the key.
 */
const hook = readFileSync('src/hooks/use-revenuecat.ts', 'utf8');
const lib = readFileSync('src/lib/revenuecat.ts', 'utf8');
const screen = readFileSync('src/app/premium.tsx', 'utf8');

test('build 12: a failed purchase carries the RevenueCat code and message', () => {
  assert.match(lib, /export function describePurchaseError/);
  assert.match(lib, /underlyingErrorMessage/);
  // Both the buy and the restore path attach the detail to the translated sentence.
  assert.match(hook, /describePurchaseError/);
  const buyDetail = hook.match(/`\$\{t\('premium\.purchaseFailed'\)\} \(\$\{describePurchaseError\(error\)\}\)`/g) ?? [];
  assert.equal(buyDetail.length, 1, 'the buy failure must surface the SDK detail exactly once');
  assert.match(hook, /`\$\{t\('premium\.restoreFailed'\)\} \(\$\{describePurchaseError\(error\)\}\)`/);
  // A cancellation is still not an error: it must keep its own message and must not be
  // reported as a failure with a code.
  assert.match(hook, /isPurchaseCancelledError\(error\)[\s\S]*premium\.purchaseCancelled/);
});

test('build 12: the result of the last action is shown next to the buttons', () => {
  // The status text sits in the card at the top of the screen; the buttons are far below it,
  // so with the old layout the message was rendered off-screen exactly when it mattered.
  const planCardsEnd = screen.lastIndexOf('</Card>');
  assert.ok(planCardsEnd > 0, 'the plan cards are gone');
  const resultAt = screen.indexOf('{purchaseResult ? (');
  assert.ok(resultAt > 0, 'the purchase result is not rendered near the buttons');
  assert.match(screen.slice(resultAt, resultAt + 400), /accessibilityLiveRegion="polite"/);
  assert.match(screen.slice(resultAt, resultAt + 400), /styles\.errorMessage/);
  assert.match(screen.slice(resultAt, resultAt + 400), /styles\.successMessage/);
  // the screen renders exactly the state its own handlers set, so a result can never be
  // computed and then dropped on the floor
  assert.match(screen, /const \[purchaseResult, setPurchaseResult\] = useState/);
  assert.match(screen, /const result = await buy\(plan\);\r?\n\s*if \(!mountedRef\.current\) return;\r?\n\s*setPurchaseResult\(result\);/);
  assert.match(screen, /const result = await restore\(\);\r?\n\s*if \(!mountedRef\.current\) return;\r?\n\s*setPurchaseResult\(result\);/);
});

test('build 12: a blocked buy button explains itself', () => {
  assert.match(screen, /const monthlyBlockedNotice = monthlyBlocked && !monthlyNoticeKey/);
  assert.match(screen, /const annualBlockedNotice = annualBlocked && !annualNoticeKey/);
  assert.match(screen, /t\('premium\.storeUnavailable'\)/);
  assert.match(screen, /t\('premium\.statusChecking'\)/);
  // The explanation is rendered under the button it belongs to, for both plans.
  const monthly = screen.slice(screen.indexOf('premium.activateMonthly'), screen.indexOf('premium.planAnnual'));
  assert.match(monthly, /monthlyBlockedNotice/);
  const annual = screen.slice(screen.indexOf('premium.activateAnnual'), screen.indexOf('disclosure'));
  assert.match(annual, /annualBlockedNotice/);
});

test('build 12: the buy button stays tied to a real store price', () => {
  // Unchanged rule from build 08.10.2026: no price from the store -> button blocked, no
  // invented price. This is asserted in full by tests/premium-paywall-store-state.test.mjs;
  // here we only pin that the build-12 work did not loosen it.
  assert.match(screen, /const monthlyBlocked = Boolean\(user\) && !isPurchasable\(monthlyAvailability\);/);
  assert.match(screen, /const annualBlocked = Boolean\(user\) && !isPurchasable\(annualAvailability\);/);
  assert.match(screen, /priceFor\('monthly'\)/);
  assert.match(screen, /priceFor\('annual'\)/);
});

test('build 12: the on-device diagnostic card reports the state and the last result', () => {
  assert.match(screen, /DIAGNOSTIC PREȚ \(temporar\)/);
  assert.match(screen, /diagValue\("availabilityFor\('monthly'\)", monthlyAvailability\)/);
  assert.match(screen, /diagValue\("availabilityFor\('annual'\)", annualAvailability\)/);
  assert.match(screen, /ultimul rezultat \(cumpărare\/restaurare\)/);
});
