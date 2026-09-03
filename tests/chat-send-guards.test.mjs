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

// Helper: find the outer catch block text (the one immediately before finally)
function findOuterCatchBlock() {
  const sendStart = src.indexOf('const send = async () => {');
  const finallyIdx = src.indexOf('finally {', sendStart);
  assert.ok(finallyIdx !== -1, 'finally block must exist');
  // Search backwards from finallyIdx for '} catch {'
  const sendBody = src.slice(sendStart, finallyIdx);
  const lastCatchIdx = sendBody.lastIndexOf('} catch {');
  assert.ok(lastCatchIdx !== -1, 'outer catch block must exist before finally');
  return sendBody.slice(lastCatchIdx);
}

// 11. Thrown exception recovery: catch block exists for async failures
test('catch block exists between try and finally for thrown exceptions', () => {
  const sendStart = src.indexOf('const send = async () => {');
  const tryIdx = src.indexOf('try {', sendStart);
  const finallyIdx = src.indexOf('finally {', sendStart);
  const sendBody = src.slice(sendStart, finallyIdx);
  const catchIdx = sendBody.lastIndexOf('} catch {');
  assert.ok(tryIdx !== -1, 'try block must exist');
  assert.ok(catchIdx !== -1, 'catch block must exist after try');
  assert.ok(finallyIdx !== -1, 'finally block must exist');
  assert.ok(tryIdx - sendStart < catchIdx, 'catch must come after try');
  assert.ok(catchIdx < finallyIdx - sendStart, 'finally must come after catch');
});

// 12. Thrown exception: removes optimistic message
test('catch block removes optimistic message on thrown exception', () => {
  const catchBlock = findOuterCatchBlock();
  assert.ok(
    catchBlock.includes('.filter(') && catchBlock.includes('optimisticId'),
    'catch block must remove optimistic message via filter(optimisticId)',
  );
});

// 13. Thrown exception: restores input for retry
test('catch block restores input on thrown exception', () => {
  const catchBlock = findOuterCatchBlock();
  assert.ok(catchBlock.includes('setInput(clean)'), 'catch block must restore input via setInput(clean)');
});

// 14. Thrown exception: shows Romanian error message
test('catch block sets a Romanian error message', () => {
  const catchBlock = findOuterCatchBlock();
  assert.ok(catchBlock.includes('setErrorMessage('), 'catch block must call setErrorMessage');
  const hasRomanian = catchBlock.includes('Încearcă') || catchBlock.includes('disponibil')
    || catchBlock.includes('conexiunea') || catchBlock.includes('eroare');
  assert.ok(hasRomanian, 'catch block error message must be in Romanian');
});

// 15. Thrown exception: no assistant response added
test('catch block does not add an assistant message', () => {
  const catchBlock = findOuterCatchBlock();
  assert.ok(
    !catchBlock.includes("role: 'assistant'"),
    'catch block must not add a fake assistant response',
  );
});
