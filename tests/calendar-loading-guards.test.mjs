import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// STRUCTURAL TEST ONLY
// The project has no component/runtime test harness for React screens; the existing
// tests (e.g. prayers-audio-guards.test.mjs, chat-send-guards.test.mjs) are static
// source inspections. These tests therefore verify that the safety *mechanisms*
// are present in the Calendar async load path. They PROVE the guard/cleanup code
// exists in the exact async function and that every state mutation is gated by the
// request-identity ref. They do NOT execute the race at runtime, so they do NOT
// prove observable behavior under real network timing.

const __dirname = dirname(fileURLToPath(import.meta.url));
const calendarFile = join(__dirname, '..', 'src', 'app', '(tabs)', 'calendar.tsx');
const src = readFileSync(calendarFile, 'utf8');

function loadBody() {
  const loadStart = src.indexOf('const loadCalendar = useCallback(async () => {');
  assert.ok(loadStart !== -1, 'loadCalendar must exist');
  const deps = '}, [calendarCode, calendarView, countryCode, region.languageCode, t]);';
  const end = src.indexOf(deps, loadStart);
  assert.ok(end !== -1, 'loadCalendar dependency array must be found');
  return src.slice(loadStart, end + deps.length);
}

// 1. Request identity: create id before request, guard every mutation
test('loadCalendar guards all state updates by request identity', () => {
  const body = loadBody();
  assert.ok(body.includes('const requestId = ++calendarRequestRef.current;'), 'must create request identity');
  const staleGuard = 'if (calendarRequestRef.current !== requestId) return;';
  const guardCount = body.split(staleGuard).length - 1;
  assert.ok(guardCount >= 3, `must guard error/success/catch (found ${guardCount})`);
});

// 2. Thrown exceptions clear loading deterministically (no infinite spinner)
test('loadCalendar handles thrown exceptions with deterministic loading cleanup', () => {
  const body = loadBody();
  assert.ok(body.includes('try {'), 'must have try');
  assert.ok(body.includes('} catch {'), 'must have catch');
  assert.ok(body.includes('} finally {'), 'must have finally');
  const catchIdx = body.indexOf('} catch {');
  const catchBlock = body.slice(catchIdx, body.indexOf('} finally {'));
  assert.ok(catchBlock.includes("setErrorMessage(t('calendar.loadError'))"), 'catch must set localized Romanian error');
  const finallyBlock = body.slice(body.indexOf('} finally {'));
  assert.ok(finallyBlock.includes('if (calendarRequestRef.current === requestId)'), 'finally must only clear its own loading');
  assert.ok(finallyBlock.includes('setIsLoading(false)'), 'finally must clear loading');
});

// 3. Stale failure cannot overwrite newer success
test('loadCalendar guards stale failure so it cannot replace newer data', () => {
  const body = loadBody();
  const errIdx = body.indexOf('if (error) {');
  assert.ok(errIdx !== -1, 'must handle API error');
  const errBlock = body.slice(errIdx, body.indexOf('} else {', errIdx));
  assert.ok(errBlock.includes('if (calendarRequestRef.current !== requestId) return;'), 'error branch must guard before mutating');
  assert.ok(errBlock.includes('setEntries([])'), 'error must clear entries');
  const successIdx = body.indexOf('setEntries(data ?? [])');
  assert.ok(successIdx !== -1, 'success path must set entries');
  const guardBeforeSuccess = body.lastIndexOf('if (calendarRequestRef.current !== requestId) return;', successIdx);
  assert.ok(guardBeforeSuccess !== -1 && guardBeforeSuccess < successIdx, 'success mutation must be guarded');
});

// 4. Retry/navigation reload the currently displayed month (calendarView dep)
test('loadCalendar reloads the current month via calendarView dependency', () => {
  const depsLine = '}, [calendarCode, calendarView, countryCode, region.languageCode, t]);';
  assert.ok(src.includes(depsLine), 'loadCalendar deps must include calendarView');
  const loadStart = src.indexOf('const loadCalendar = useCallback(async () => {');
  assert.ok(src.indexOf('.gte(\'calendar_date\', calendarView.monthStart)', loadStart) !== -1, 'loadCalendar must query current monthStart');
});

// 5. Empty result differs from error result
test('empty result falls back to empty array and is distinct from error', () => {
  const body = loadBody();
  assert.ok(body.includes('setEntries(data ?? [])'), 'valid empty result must not crash');
  const errIdx = body.indexOf('if (error) {');
  const errBlock = body.slice(errIdx, body.indexOf('} else {', errIdx));
  assert.ok(errBlock.includes('setErrorMessage'), 'error must set a message (distinct from empty)');
});

// 6. Effect cleanup invalidates in-flight requests on unmount / load change
test('load effect cleanup invalidates in-flight calendar requests', () => {
  const effectStart = src.indexOf('useEffect(() => {');
  assert.ok(effectStart !== -1, 'must have load effect');
  const effectEnd = src.indexOf('}, [loadCalendar]);', effectStart);
  const effectBody = src.slice(effectStart, effectEnd + 17);
  assert.ok(effectBody.includes('clearTimeout(timeoutId)'), 'must clear scheduled timeout');
  assert.ok(effectBody.includes('calendarRequestRef.current += 1;'), 'must invalidate in-flight requests on cleanup');
});

// 7. Request ref is declared
test('calendarRequestRef is declared for request identity', () => {
  assert.ok(src.includes('const calendarRequestRef = useRef(0);'), 'must declare request ref');
});
