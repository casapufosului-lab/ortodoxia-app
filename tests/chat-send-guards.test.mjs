import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatFile = join(__dirname, '..', 'src', 'app', '(tabs)', 'chat.tsx');
const src = readFileSync(chatFile, 'utf8');

// 1. Active-request send guard: ref check must precede all side-effects
test('send guard checks isSendingRef.current before any state mutation', () => {
  const sendStart = src.indexOf('const send = async () => {');
  assert.ok(sendStart !== -1, 'send function must exist');

  const afterSig = src.slice(sendStart, sendStart + 200);
  const refGuardIdx = afterSig.indexOf('isSendingRef.current) return');
  assert.ok(refGuardIdx !== -1, 'isSendingRef.current must be checked before proceeding');

  const setMessagesIdx = afterSig.indexOf('setMessages');
  const setInputIdx = afterSig.indexOf('setInput(');
  const setIsSendingIdx = afterSig.indexOf('setIsSending(true)');
  if (setMessagesIdx !== -1) assert.ok(refGuardIdx < setMessagesIdx, 'ref guard must precede setMessages');
  if (setInputIdx !== -1) assert.ok(refGuardIdx < setInputIdx, 'ref guard must precede setInput');
  if (setIsSendingIdx !== -1) assert.ok(refGuardIdx < setIsSendingIdx, 'ref guard must precede setIsSending');
});

// 2. Rapid double-send: ref is set to true before the first await
test('isSendingRef is set true before any await in send', () => {
  const sendStart = src.indexOf('const send = async () => {');
  const firstAwait = src.indexOf('await', sendStart);
  assert.ok(firstAwait !== -1, 'send must contain an await');

  const refTrue = src.indexOf('isSendingRef.current = true', sendStart);
  assert.ok(refTrue !== -1, 'isSendingRef.current = true must exist in send');
  assert.ok(refTrue < firstAwait, 'ref must be set to true before the first await');
});

// 3. Whitespace-only message rejected
test('whitespace-only message is rejected', () => {
  const sendStart = src.indexOf('const send = async () => {');
  const earlyReturn = src.indexOf('if (!clean) return', sendStart);
  assert.ok(earlyReturn !== -1, 'empty/clean check must exist');

  const trimCall = src.indexOf("input.trim()", sendStart);
  assert.ok(trimCall !== -1, 'clean must come from input.trim()');
  assert.ok(trimCall < earlyReturn, 'trim must happen before the guard');
});

// 4. Failure clears loading state via finally block
test('isSending is cleared in finally block', () => {
  const sendStart = src.indexOf('const send = async () => {');
  const tryIdx = src.indexOf('try {', sendStart);
  const finallyIdx = src.indexOf('finally {', sendStart);
  assert.ok(tryIdx !== -1, 'send must have a try block');
  assert.ok(finallyIdx !== -1, 'send must have a finally block');
  assert.ok(finallyIdx > tryIdx, 'finally must come after try');

  const finallyBlock = src.slice(finallyIdx, finallyIdx + 200);
  assert.ok(finallyBlock.includes('isSendingRef.current = false'), 'finally must reset isSendingRef');
  assert.ok(finallyBlock.includes('setIsSending(false)'), 'finally must call setIsSending(false)');
});

// 5. Retry after failure restores input
test('on failure, original message is restored to input for retry', () => {
  const errorBranch = src.indexOf("'Răspunsul AI nu a putut fi generat");
  assert.ok(errorBranch !== -1, 'error branch with Romanian message must exist');

  const nearError = src.slice(errorBranch, errorBranch + 1000);
  assert.ok(nearError.includes('setInput(clean)'), 'error path must restore input via setInput(clean)');
});

// 6. Optimistic message removed on failure (no duplicate history)
test('on failure, optimistic user message is removed from history', () => {
  const errorBranch = src.indexOf("'Răspunsul AI nu a putut fi generat");
  assert.ok(errorBranch !== -1, 'error branch must exist');

  const nearError = src.slice(errorBranch, errorBranch + 1000);
  assert.ok(
    nearError.includes('.filter(') && nearError.includes('optimisticId'),
    'error path must remove the optimistic message via filter(optimisticId)',
  );
});

// 7. No fake assistant response on failure
test('no assistant message is added on failure', () => {
  const errorBranch = src.indexOf("'Răspunsul AI nu a putut fi generat");
  const errorEnd = src.indexOf('return;', errorBranch);
  assert.ok(errorEnd !== -1, 'error branch must have a return');

  const errorPath = src.slice(errorBranch, errorEnd);
  assert.ok(
    !errorPath.includes("role: 'assistant'"),
    'must not add a fake assistant response in the error path',
  );
});

// 8. Server-side limits remain authoritative
test('remaining and dailyLimit come from server response', () => {
  const successPath = src.indexOf('setRemaining(data.remaining)');
  assert.ok(successPath !== -1, 'remaining must be set from server data');
  const dailyLimitPath = src.indexOf('setDailyLimit(data.dailyLimit)');
  assert.ok(dailyLimitPath !== -1, 'dailyLimit must be set from server data');
});

// 9. Finally block clears both ref and state
test('isSendingRef is never left true after send completes', () => {
  const finallyIdx = src.indexOf('finally {');
  const finallyBlock = src.slice(finallyIdx, finallyIdx + 150);
  assert.ok(finallyBlock.includes('isSendingRef.current = false'), 'finally must clear ref guard');
  assert.ok(finallyBlock.includes('setIsSending(false)'), 'finally must clear loading state');
});

// 10. No development logging of full AI content
test('send function contains no console.log or console.warn', () => {
  const sendStart = src.indexOf('const send = async () => {');
  const sendEnd = src.indexOf('return (', sendStart);
  const sendBody = src.slice(sendStart, sendEnd);
  assert.ok(!sendBody.includes('console.log'), 'send must not contain console.log');
  assert.ok(!sendBody.includes('console.warn'), 'send must not contain console.warn');
});
