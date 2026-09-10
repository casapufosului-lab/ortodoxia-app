import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src/app/(tabs)/chat.tsx'), 'utf8');

test('ADV-03 load requested after send begins is deferred before any loading-state mutation', () => {
  const start = source.indexOf('const loadConversation = useCallback(async () => {');
  const sendGuard = source.indexOf('if (isSendingRef.current) {', start);
  const pending = source.indexOf('pendingLoadRef.current = true;', sendGuard);
  const requestId = source.indexOf('const requestId = ++loadRequestRef.current;', start);
  const loading = source.indexOf('setIsLoading(true);', start);

  assert.ok(start >= 0);
  assert.ok(sendGuard > start);
  assert.ok(pending > sendGuard);
  assert.ok(requestId > pending);
  assert.ok(loading > requestId);
});

test('ADV-03 deferred load cannot overwrite an in-flight send snapshot', () => {
  const start = source.indexOf('const loadConversation = useCallback(async () => {');
  const requestId = source.indexOf('const requestId = ++loadRequestRef.current;', start);
  const guardBlock = source.slice(start, requestId);

  assert.ok(guardBlock.includes('if (isSendingRef.current) {'));
  assert.ok(guardBlock.includes('pendingLoadRef.current = true;'));
  assert.ok(guardBlock.includes('return;'));
});

test('ADV-03 deferred reload runs after sending returns to idle', () => {
  const marker = 'if (isSending || !pendingLoadRef.current) return;';
  const start = source.indexOf(marker);
  const end = source.indexOf('}, [isSending, loadConversation]);', start);
  const block = source.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.ok(block.includes('pendingLoadRef.current = false;'));
  assert.ok(block.includes('setTimeout(() => void loadConversation(), 0)'));
});

test('ADV-03 existing send still invalidates loads that began before sending', () => {
  const sendStart = source.indexOf('const send = async () => {');
  const optimistic = source.indexOf('const optimisticId', sendStart);
  const block = source.slice(sendStart, optimistic);

  assert.ok(block.includes('loadRequestRef.current += 1;'));
});

test('ADV-03 send busy ref becomes false before deferred-load effect can observe idle state', () => {
  const finallyStart = source.indexOf('} finally {');
  const sendEnd = source.indexOf('\n    }\n  };', finallyStart);
  const block = source.slice(finallyStart, sendEnd);

  assert.ok(block.includes('isSendingRef.current = false;'));
  assert.ok(block.includes('setIsSending(false);'));
  assert.ok(
    block.indexOf('isSendingRef.current = false;') <
      block.indexOf('setIsSending(false);'),
  );
});