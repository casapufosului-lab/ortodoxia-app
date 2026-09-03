import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// STRUCTURAL TEST ONLY
// The project has no component/runtime test harness for React screens; the existing
// tests (e.g. prayers-audio-guards.test.mjs, chat-send-guards.test.mjs) are static
// source inspections. These tests therefore verify that the safety *mechanisms*
// are present in the Bible async load path. They PROVE the guard/cleanup code
// exists in the exact async function and that every state mutation is gated by the
// request-identity ref. They do NOT execute the race at runtime, so they do NOT
// prove observable behavior under real network timing.

const __dirname = dirname(fileURLToPath(import.meta.url));
const bibleFile = join(__dirname, '..', 'src', 'app', '(tabs)', 'bible.tsx');
const src = readFileSync(bibleFile, 'utf8');

function loadBody() {
  const loadStart = src.indexOf('const loadChapter = useCallback(async () => {');
  assert.ok(loadStart !== -1, 'loadChapter must exist');
  const deps = '}, [bookCode, chapter]);';
  const end = src.indexOf(deps, loadStart);
  assert.ok(end !== -1, 'loadChapter dependency array must be found');
  return src.slice(loadStart, end + deps.length);
}

test('loadChapter guards all state updates by request identity', () => {
  const body = loadBody();
  assert.ok(body.includes('const requestId = ++requestRef.current;'), 'must create request identity');
  const staleGuard = 'if (requestRef.current !== requestId) return;';
  const guardCount = body.split(staleGuard).length - 1;
  assert.ok(guardCount >= 3, `must guard error/success/catch (found ${guardCount})`);
});

test('loadChapter handles thrown exceptions with deterministic loading cleanup', () => {
  const body = loadBody();
  assert.ok(body.includes('try {'), 'must have try');
  assert.ok(body.includes('} catch {'), 'must have catch');
  assert.ok(body.includes('} finally {'), 'must have finally');
  const catchIdx = body.indexOf('} catch {');
  const finallyIdx = body.indexOf('} finally {');
  const catchBlock = body.slice(catchIdx, finallyIdx);
  assert.ok(catchBlock.includes('Textul nu s-a putut'), 'catch must show Romanian error');
  const finallyBlock = body.slice(finallyIdx);
  assert.ok(finallyBlock.includes('if (requestRef.current === requestId)'), 'finally must only clear its own loading');
  assert.ok(finallyBlock.includes('setLoading(false)'), 'finally must clear loading');
});

test('loadChapter guards stale failure so it cannot replace newer content', () => {
  const body = loadBody();
  const errIdx = body.indexOf('if (requestError) {');
  assert.ok(errIdx !== -1, 'must handle returned API error');
  const errBlock = body.slice(errIdx, body.indexOf('} else {', errIdx));
  assert.ok(errBlock.includes('if (requestRef.current !== requestId) return;'), 'error branch must guard');
  assert.ok(errBlock.includes('setVerses([])'), 'error must clear verses');
  const successIdx = body.indexOf('setVerses((data ?? []) as BibleVerse[])');
  const guardBeforeSuccess = body.lastIndexOf('if (requestRef.current !== requestId) return;', successIdx);
  assert.ok(guardBeforeSuccess !== -1 && guardBeforeSuccess < successIdx, 'success mutation must be guarded');
});

test('loadChapter reloads the current book and chapter via dependencies', () => {
  assert.ok(src.includes('}, [bookCode, chapter]);'), 'deps must include bookCode and chapter');
  const loadStart = src.indexOf('const loadChapter = useCallback(async () => {');
  assert.ok(src.indexOf('.eq(\'book_code\', bookCode)', loadStart) !== -1, 'must query current bookCode');
  assert.ok(src.indexOf('.eq(\'chapter\', chapter)', loadStart) !== -1, 'must query current chapter');
});

test('valid empty chapter is distinguished from search no-match', () => {
  const emptyChapterMsg = 'Acest capitol nu are încă versete publicate.';
  const searchNoMatchMsg = 'Nu am găsit acest cuvânt în capitolul curent.';
  const emptyBranchIdx = src.indexOf(') : verses.length === 0 ? (');
  assert.ok(emptyBranchIdx !== -1, 'must have explicit empty-chapter branch');
  assert.ok(src.indexOf(emptyChapterMsg, emptyBranchIdx) !== -1, 'empty chapter must show its own message');
  const searchIdx = src.indexOf(') : visibleVerses.length === 0 ? (');
  assert.ok(searchIdx !== -1 && searchIdx > emptyBranchIdx, 'search branch must come after empty-chapter');
  assert.ok(src.indexOf(searchNoMatchMsg, searchIdx) !== -1, 'search must keep its own message');
});

test('load effect cleanup invalidates in-flight Bible requests', () => {
  const effectStart = src.indexOf('useEffect(() => {');
  assert.ok(effectStart !== -1, 'must have load effect');
  const effectEnd = src.indexOf('}, [loadChapter]);', effectStart);
  const effectBody = src.slice(effectStart, effectEnd + 17);
  assert.ok(effectBody.includes('void loadChapter()'), 'effect must trigger load');
  assert.ok(effectBody.includes('requestRef.current += 1;'), 'cleanup must invalidate in-flight');
});

test('requestRef is declared for request identity', () => {
  assert.ok(src.includes('const requestRef = useRef(0);'), 'must declare request ref');
});

test('chapter navigation is clamped to valid bounds', () => {
  assert.ok(src.includes('disabled={chapter === 1}'), 'previous disabled at chapter 1');
  assert.ok(src.includes('Math.max(1, current - 1)'), 'previous clamps to min 1');
  assert.ok(src.includes('disabled={chapter === book.chapters}'), 'next disabled at last chapter');
  assert.ok(src.includes('Math.min(book.chapters, current + 1)'), 'next clamps to max');
  const selectBookStart = src.indexOf('function selectBook(code: BookCode) {');
  assert.ok(selectBookStart !== -1, 'selectBook must exist');
  const selectBookBody = src.slice(selectBookStart, src.indexOf('}', selectBookStart) + 1);
  assert.ok(selectBookBody.includes('setChapter(1)'), 'selectBook must reset chapter to 1');
});
