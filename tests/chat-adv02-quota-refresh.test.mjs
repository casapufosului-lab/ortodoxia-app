import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src/app/(tabs)/chat.tsx'), 'utf8');

test('ADV-02 chat reloads quota whenever the retained Chat route regains focus', () => {
  assert.ok(source.includes("import { router, useFocusEffect } from 'expo-router';"));

  const start = source.indexOf('useFocusEffect(');
  const end = source.indexOf('  );', start);
  const block = source.slice(start, end + 4);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.ok(block.includes('useCallback(() => {'));
  assert.ok(block.includes('setTimeout(() => void loadConversation(), 0)'));
  assert.ok(block.includes('clearTimeout(timeoutId);'));
  assert.ok(block.includes('loadRequestRef.current += 1;'));
  assert.ok(block.includes('}, [loadConversation]),'));
});

test('ADV-02 foregrounding the native app revalidates server quota and subscription', () => {
  assert.ok(source.includes('AppState.addEventListener'));
  // The handler is a guarded multi-line condition (it must not reload while
  // dictation is active, and since L-06 it must not reload on a trivial app
  // switch), so assert the structure rather than one exact line: the previous
  // single-line string assertion had drifted out of sync with the source and was
  // never executed by any npm script.
  const listenerStart = source.indexOf("AppState.addEventListener('change'");
  assert.ok(listenerStart >= 0);
  const listenerEnd = source.indexOf('});', listenerStart);
  assert.ok(listenerEnd > listenerStart);
  const listener = source.slice(listenerStart, listenerEnd);
  assert.ok(listener.includes("state !== 'active'"), 'must record when the app leaves the foreground');
  assert.ok(listener.includes('backgroundedAtRef.current = Date.now();'));
  assert.ok(listener.includes('backgroundedAtRef.current = null;'), 'must consume the marker once');
  assert.ok(listener.includes('void loadConversation();'), 'must revalidate against the server');
  assert.ok(listener.includes('CHAT_FOREGROUND_RELOAD_MIN_ABSENCE_MS'));
  assert.ok(listener.includes('CHAT_FOREGROUND_RELOAD_MIN_STALENESS_MS'));
  assert.ok(source.includes('return () => subscription.remove();'));
});

test('ADV-02 quota date is captured once and usage query uses that exact Bucharest date', () => {
  assert.ok(source.includes('const quotaDateRef = useRef(localDateKey());'));
  assert.ok(source.includes('const quotaDate = localDateKey();'));
  assert.ok(source.includes('quotaDateRef.current = quotaDate;'));
  assert.ok(source.includes(".eq('usage_date', quotaDate)"));
  assert.ok(!source.includes(".eq('usage_date', localDateKey())"));
});

test('ADV-02 an open foreground chat detects Bucharest midnight without restart', () => {
  const start = source.indexOf('const intervalId = setInterval(() => {');
  const end = source.indexOf('}, 60_000);', start);
  const block = source.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.ok(block.includes('const currentQuotaDate = localDateKey();'));
  assert.ok(block.includes('currentQuotaDate === quotaDateRef.current'));
  assert.ok(block.includes('void loadConversation();'));
});

test('ADV-02 zero-quota screen still exposes a server revalidation path', () => {
  const zeroStart = source.indexOf('{remaining <= 0 ? (');
  const errorBranch = source.indexOf(') : errorMessage ? (', zeroStart);
  const block = source.slice(zeroStart, errorBranch);

  assert.ok(zeroStart >= 0);
  assert.ok(errorBranch > zeroStart);
  assert.ok(block.includes("router.push('/premium')"));
  assert.ok(block.includes('onPress={() => void loadConversation()}'));
  assert.ok(block.includes("t('chat.retry')"));
});

test('ADV-02 quota refresh remains compatible with ADV-03 send/load coordination', () => {
  const loadStart = source.indexOf('const loadConversation = useCallback(async () => {');
  const requestStart = source.indexOf('const requestId = ++loadRequestRef.current;', loadStart);
  const block = source.slice(loadStart, requestStart);

  assert.ok(block.includes('if (isSendingRef.current) {'));
  assert.ok(block.includes('pendingLoadRef.current = true;'));
  assert.ok(block.includes('return;'));
});