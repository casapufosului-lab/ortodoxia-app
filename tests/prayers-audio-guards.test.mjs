import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prayersFile = join(__dirname, '..', 'src', 'app', '(tabs)', 'prayers.tsx');
const src = readFileSync(prayersFile, 'utf8');

test('toggleAudio uses audioStartingRef to prevent concurrent calls', () => {
  const toggleStart = src.indexOf('const toggleAudio = async');
  const body = src.slice(toggleStart, src.indexOf('};', toggleStart));
  assert.ok(body.includes('audioStartingRef.current'), 'must use ref');
  assert.ok(body.includes('if (audioStartingRef.current) return;'), 'must guard');
  assert.ok(body.includes('audioStartingRef.current = true;'), 'must set true');
  assert.ok(body.includes('finally {'), 'must have finally');
  const finallyBlock = body.slice(body.indexOf('finally {'));
  assert.ok(finallyBlock.includes('audioStartingRef.current = false;'), 'must clear in finally');
});

test('toggleAudio listener guards against stale players', () => {
  const toggleStart = src.indexOf('const toggleAudio = async');
  const body = src.slice(toggleStart, src.indexOf('};', toggleStart));
  const listenerIdx = body.indexOf("player.addListener('playbackStatusUpdate'");
  assert.ok(listenerIdx !== -1, 'must have listener');
  const listenerBody = body.slice(listenerIdx, body.indexOf('});', listenerIdx));
  assert.ok(listenerBody.includes('if (audioPlayerRef.current !== player) return;'), 'must guard stale');
});

test('toggleAudio playback errors reset state via status.error', () => {
  const toggleStart = src.indexOf('const toggleAudio = async');
  const body = src.slice(toggleStart, src.indexOf('};', toggleStart));
  const listenerIdx = body.indexOf("player.addListener('playbackStatusUpdate'");
  assert.ok(listenerIdx !== -1, 'must have listener');
  const listenerBody = body.slice(listenerIdx, body.indexOf('});', listenerIdx));
  assert.ok(listenerBody.includes('if (status.error)'), 'must handle status.error');
  assert.ok(listenerBody.includes('player.release()'), 'error path must release');
  assert.ok(listenerBody.includes('audioPlayerRef.current = null;'), 'error path must clear ref');
  assert.ok(listenerBody.includes('setSpeakingId(') && listenerBody.includes('currentId'), 'error path must reset speakingId');
  assert.ok(listenerBody.includes("'Fișierul audio nu a putut porni. Încearcă din nou.'"), 'error path must show Romanian error');
});

test('toggleAudio speech callbacks guard stale requests', () => {
  const toggleStart = src.indexOf('const toggleAudio = async');
  const body = src.slice(toggleStart, src.indexOf('};', toggleStart));
  assert.ok(body.includes('speechRequestRef.current += 1;'), 'must bump request id per toggle');
  assert.ok(body.includes('const speechRequestId = speechRequestRef.current;'), 'must capture request id');

  const speakIdx = body.indexOf('Speech.speak(');
  assert.ok(speakIdx !== -1, 'must call Speech.speak');
  const speakOptions = body.slice(speakIdx, body.indexOf('});', speakIdx));

  const guard = 'if (speechRequestRef.current !== speechRequestId) return;';
  const guardCount = speakOptions.split(guard).length - 1;
  assert.ok(guardCount >= 3, `onDone/onStopped/onError must reject stale requests (found ${guardCount})`);
});

test('toggleAudio speech onError only acts on its own request', () => {
  const toggleStart = src.indexOf('const toggleAudio = async');
  const body = src.slice(toggleStart, src.indexOf('};', toggleStart));
  const speakIdx = body.indexOf('Speech.speak(');
  assert.ok(speakIdx !== -1, 'must call Speech.speak');
  const speakOptions = body.slice(speakIdx, body.indexOf('});', speakIdx));
  const onError = speakOptions.slice(speakOptions.indexOf('onError:'));
  const onErrorGuard = 'if (speechRequestRef.current !== speechRequestId) return;';
  assert.ok(onError.startsWith('onError: () => {\n') || onError.indexOf('onError:') === 0, 'onError must be an object callback');
  assert.ok(onError.includes(onErrorGuard), 'onError must guard before acting');
  assert.ok(onError.includes("setSpeakingId(null);"), 'onError clears speaking state only for valid request');
  assert.ok(onError.includes("setErrorMessage('Citirea audio nu a putut porni pe acest dispozitiv.');"), 'onError keeps Romanian error');
});
test('loadPrayers always clears loading spinner via finally', () => {
  const loadStart = src.indexOf('const loadPrayers = useCallback(async () => {');
  const body = src.slice(loadStart, src.indexOf('}, [user]);', loadStart));
  const finallyIdx = body.indexOf('finally {');
  assert.ok(finallyIdx !== -1, 'must have finally');
  const finallyBlock = body.slice(finallyIdx);
  assert.ok(finallyBlock.includes('setIsLoading(false)'), 'finally must clear loading');
});

test('loadPrayers failure shows a Romanian error', () => {
  const loadStart = src.indexOf('const loadPrayers = useCallback(async () => {');
  const body = src.slice(loadStart, src.indexOf('}, [user]);', loadStart));
  assert.ok(body.includes('} catch {'), 'must have catch');
  const catchBlock = body.slice(body.indexOf('} catch {'));
  assert.ok(catchBlock.includes("'Nu am putut încărca rugăciunile. Încearcă din nou.'"), 'catch must show Romanian error');
});
