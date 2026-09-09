import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const native = readFileSync('src/live/youtube-embed.native.tsx', 'utf8');
const web = readFileSync('src/live/youtube-embed.web.tsx', 'utf8');

test('LOW #22 native LIVE player uses selected localization', () => {
  assert.match(native, /useLocalization/);
  assert.match(native, /const \{ t \} = useLocalization\(\);/);
  assert.doesNotMatch(native, /translate\('ro'/);
  assert.match(native, /t\('live\.closePlayerAccessibilityLabel'\)/);
  assert.match(native, /t\('live\.closePlayer'\)/);
  assert.match(native, /t\('live\.playerAccessibilityLabel'\)/);
});

test('LOW #22 web LIVE player uses selected localization', () => {
  assert.match(web, /useLocalization/);
  assert.match(web, /const \{ t \} = useLocalization\(\);/);
  assert.doesNotMatch(web, /translate\('ro'/);
  assert.match(web, /t\('live\.closePlayerAccessibilityLabel'\)/);
  assert.match(web, /t\('live\.closePlayer'\)/);
});
