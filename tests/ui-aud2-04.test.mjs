import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/hooks/use-subscription.ts', 'utf8');

test('AUD2-04 subscription refresh rejects stale async results', () => {
  const start = src.indexOf('const refresh = useCallback(async () => {');
  const query = src.indexOf(".from('subscriptions')", start);
  const guard = src.indexOf('if (refreshRequestRef.current !== requestId) return;', query);
  const publish = src.indexOf('if (queryError) {', query);
  assert.ok(src.includes('const refreshRequestRef = useRef(0);'));
  assert.ok(src.includes('const requestId = ++refreshRequestRef.current;'));
  assert.ok(query > start && guard > query && publish > guard);
});

test('AUD2-04 user-change cleanup invalidates pending subscription refresh', () => {
  const effect = src.indexOf('const timeoutId = setTimeout(() => void refresh(), 0);');
  const nextEffect = src.indexOf('useEffect(() => {', effect + 1);
  const body = src.slice(effect, nextEffect);
  assert.ok(body.includes('clearTimeout(timeoutId);'));
  assert.ok(body.includes('refreshRequestRef.current += 1;'));
});
