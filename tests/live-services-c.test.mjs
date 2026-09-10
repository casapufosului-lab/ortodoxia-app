/**
 * LIVE-C tests: Slujbe LIVE UI, status rendering, playback, lifecycle.
 * Static source analysis only — no dynamic imports (avoids @/ alias issue).
 * Run: node --test tests/live-services-c.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const s = readFileSync(join(root, 'src/app/live.tsx'), 'utf8');
const c = readFileSync(join(root, 'src/live/live-status-client.ts'), 'utf8');
const p = readFileSync(join(root, 'src/live/live-playback.ts'), 'utf8');
const sv = readFileSync(join(root, 'src/live/live-services.ts'), 'utf8');
const t = readFileSync(join(root, 'src/live/types.ts'), 'utf8');
const h = readFileSync(join(root, 'src/app/(tabs)/index.tsx'), 'utf8');
const e = readFileSync(join(root, 'src/live/youtube-embed.native.tsx'), 'utf8');

test('1. Home route opens Slujbe LIVE', () => {
  assert.ok(h.includes("router.push('/live')"));
  assert.ok(h.includes("t('home.liveSectionTitle')"));
});
test('2. Enabled sources render', () => {
  assert.ok(s.includes('getEnabledLiveSources'));
  assert.ok(s.includes('sources.map'));
  assert.ok((sv.match(/enabled:\s*true/g) || []).length >= 4);
});
test('3. Disabled sources filtered out', () => {
  assert.ok(sv.includes('source.enabled && source.countryCode === countryCode'));
  assert.ok((sv.match(/enabled:\s*false/g) || []).length >= 1);
});
test('4. LIVE renders LIVE ACUM', () => {
  assert.ok(s.includes("t('live.statusLive')"));
  assert.ok(s.includes("case 'live'"));
});
test('5. UNKNOWN never false negative', () => {
  assert.ok(s.includes("case 'unknown'"));
  assert.ok(!s.includes('Nu este live acum'));
});
test('6. NOT_LIVE wording only for NOT_LIVE', () => {
  assert.ok(s.includes("case 'not_live'"));
  assert.ok(s.includes("t('live.statusNotLive')"));
});
test('7. No time-based LIVE heuristic', () => {
  assert.ok(!s.includes('getDay()'));
  assert.ok(!s.includes('getHours()'));
  assert.ok(!s.includes('Sunday'));
  assert.ok(s.includes('fetchLiveStatuses'));
});
test('8. EMBED mode for embeddable LIVE', () => {
  assert.ok(p.includes("'EMBED'"));
  assert.ok(p.includes("status === 'live'"));
  assert.ok(p.includes('currentBroadcast?.embeddable'));
});
test('9. EXTERNAL_CURRENT for non-embeddable', () => {
  assert.ok(p.includes('!currentBroadcast.embeddable'));
  assert.ok(p.includes("'EXTERNAL_CURRENT'"));
});
test('10. OFFICIAL_SOURCE as fallback', () => {
  assert.ok(p.includes("return 'OFFICIAL_SOURCE'"));
  assert.ok(p.includes('!sourceStatus'));
});
test('11. URL validation enforces domain allowlist', () => {
  assert.ok(sv.includes('ALLOWED_DOMAINS'));
  assert.ok(sv.includes('isAllowedDomain'));
  assert.ok(s.includes('isValidSourceUrl'));
});
test('12. No autoplay in native player', () => {
  assert.ok(e.includes('react-native-youtube-iframe'));
  assert.ok(!e.includes('play={true}'));
  assert.ok(p.includes('autoplay=0'));
});
test('13. Single player state', () => {
  assert.ok(s.includes('activePlayerVideoId'));
  assert.ok(s.includes('requestRef'));
  assert.ok((s.match(/<YouTubeEmbed/g) || []).length === 1);
});
test('14. Close clears player', () => {
  assert.ok(s.includes('closePlayer'));
  assert.ok(s.includes("setActivePlayerVideoId(null)"));
  assert.ok(e.includes('onRequestClose'));
  assert.ok(e.includes('BackHandler'));
});
test('15. Error caught and displayed', () => {
  assert.ok(s.includes('catch'));
  assert.ok(s.includes('setError'));
  assert.ok(c.includes('LIVE_STATUS_FETCH_ERROR_CODE'));
});
test('16. Loading terminates on failure', () => {
  assert.ok(s.includes('finally'));
  assert.ok(s.includes('setIsLoading(false)'));
});
test('17. Retry button calls loadStatuses', () => {
  assert.ok(s.includes("t('live.retry')"));
  assert.ok(s.includes('retryButton'));
  assert.ok(s.includes('loadStatuses'));
});
test('18. No videoId in permanent registry', () => {
  assert.ok(!sv.includes('videoId:'));
  assert.ok(!sv.includes('watch?v='));
  assert.ok(t.includes('interface CurrentLiveBroadcast'));
});
test('19. Validation handles malformed payload', () => {
  assert.ok(c.includes('typeof obj.sourceId'));
  assert.ok(c.includes('isLiveStatus'));
  assert.ok(c.includes('typeof cb.videoId'));
});
test('20. UNKNOWN not transformed to NOT_LIVE', () => {
  assert.ok(s.includes("case 'unknown'"));
  assert.ok(s.includes("case 'not_live'"));
  assert.ok(s.includes("case 'live'"));
  assert.ok(!s.includes("status === 'not_live' &&"));
});
test('LIVE request is scoped to selected country', () => {
  assert.ok(s.includes('getEnabledLiveSources(countryCode)'));
  assert.ok(s.includes('fetchLiveStatuses(countryCode)'));
  assert.ok(c.includes("'x-country-code': countryCode"));
  assert.ok(s.includes('}, [countryCode, t]);'));
  assert.ok(s.includes('const requestId = ++requestRef.current;'));
  assert.ok(s.includes('if (requestId !== requestRef.current) return;'));
});

test('Edge Function contract', () => {
  assert.ok(c.includes("'live-services-status'"));
  assert.ok(c.includes('supabase.functions.invoke'));
  assert.ok(c.includes('Array.isArray'));
});
test('Accessibility labels present', () => {
  assert.ok(s.includes('accessibilityRole="button"'));
  assert.ok(s.includes('accessibilityLabel='));
  assert.ok(s.includes('accessibilityLiveRegion="polite"'));
});
test('No download/proxy/restream', () => {
  assert.ok(!p.includes('download'));
  assert.ok(!p.includes('proxy'));
  assert.ok(!p.includes('restream'));
});
test('Native embed uses YouTube iframe player', () => {
  assert.ok(e.includes("from 'react-native-youtube-iframe'"));
  assert.ok(e.includes('onFullScreenChange'));
  assert.ok(e.includes('allowsFullscreenVideo'));
  assert.ok(e.includes('OrientationLock.LANDSCAPE'));
  assert.ok(e.includes('OrientationLock.PORTRAIT_UP'));
});