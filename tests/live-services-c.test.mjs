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
// The player file's comments quote the library it no longer uses and the sources it measured
// (10.10.2026), so assertions about the shipped code are made against the code only.
const eCode = e.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
test('12. Sound on: the native player never starts itself with sound', () => {
  // 10.10.2026 (build 15): the owner wants SOUND, so `mute=1` is gone - and with it the forced
  // `autoplay=1` that only existed because the player was muted. On iOS nothing with sound can
  // start without a user gesture, so the stream is started by YouTube's own play button (or by
  // the user), which is why no automatic "the picture did not start" logic is allowed either.
  assert.ok(!eCode.includes('mute=1'));
  assert.ok(!eCode.includes('autoplay=1'));
  assert.ok(!eCode.includes('mute=0'));
  assert.ok(eCode.includes('playsinline=1'));
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
  // 10.10.2026: the player stopped being a React Native <Modal> (on iOS the WKWebView
  // inside a pageSheet modal stayed black), so `onRequestClose` no longer exists. The
  // player now closes through its own visible, labelled button, and Android hardware
  // back keeps working through BackHandler.
  assert.ok(e.includes("t('live.closePlayer')"));
  assert.ok(e.includes("t('live.closePlayerAccessibilityLabel')"));
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
test('Native embed uses ONE plain WebView on YouTube\'s embed endpoint', () => {
  // 10.10.2026 (build 13): react-native-youtube-iframe is gone - builds 11 and 12 were still
  // black on the owner's iPhone. The player is a direct react-native-webview WebView. Build 15
  // adds the two conditions iOS needs to render inline instead of black, and forbids the automatic
  // hop to the browser that the owner rejected. Build 17 splits the two roles (the request is
  // served by YouTube, our own domain only provides the document origin and the `Referer` - our
  // `/embed/<id>` is a 404) and makes the single manual way out an IN-APP browser, as the owner
  // requires. Build 18 made the measured header request the main path and kept the document as an
  // in-app reserve. BUILD 20 (the minimal variant) deletes the reserve, the mode state and the
  // remount with it: they could cancel a load still in progress (the audit's cause), and the one
  // thing that is left is the request DSH measured in Chrome.
  assert.ok(eCode.includes("from 'react-native-webview'"));
  assert.ok(!eCode.includes('react-native-youtube-iframe'));
  assert.ok(eCode.includes('/embed/'));
  assert.ok(eCode.includes('YOUTUBE_EMBED_BASE_URL'));
  assert.ok(eCode.includes('playsinline=1'));
  assert.ok(eCode.includes('allowsFullscreenVideo'));
  assert.ok(eCode.includes('allowsInlineMediaPlayback={true}'));
  assert.ok(eCode.includes('mediaPlaybackRequiresUserAction={false}'));
  assert.ok(eCode.includes('OrientationLock.PORTRAIT_UP'));
  // The measured request carries our Referer, and it is the ONLY request there is.
  assert.ok(eCode.includes('headers: { Referer: EMBED_REFERER }'));
  assert.ok(eCode.includes('const EMBED_REFERER = `${EMBED_DOCUMENT_BASE_URL}/`;'));
  assert.ok(eCode.includes('source={{ uri: buildEmbedRequestUrl(videoId), headers: { Referer: EMBED_REFERER } }}'));
  // BUILD 20: the reserve, the header/document mode, the remount on `key` and the ref that fed them
  // are GONE - there is no timer in the component and no second source it could switch to, so
  // nothing in this file can cancel, replace or restart the load that is running.
  assert.ok(!eCode.includes('EMBED_RESERVE_MS'));
  assert.ok(!eCode.includes('EmbedLoading'));
  assert.ok(!eCode.includes('setLoading('));
  assert.ok(!eCode.includes('playerSignalRef'));
  assert.ok(!eCode.includes('key={'));
  // BUILD 20.2: the blanket "no `useRef`" rule became a narrower one, and a stricter one: the two
  // refs that exist belong to the report to the server (its payload and its count of three), and
  // NOTHING may derive the source from a ref or from state - the source stays a literal expression
  // built from `videoId` alone (pinned above).
  assert.equal((eCode.match(/useRef[<(]/g) ?? []).length, 2);
  assert.ok(eCode.includes('const reportPayloadRef = useRef<LivePlayerDiagnosticReport | null>(null);'));
  assert.ok(eCode.includes('const reportCountRef = useRef(0);'));
  const expectedSource =
    'source={{ uri: buildEmbedRequestUrl(videoId), headers: { Referer: EMBED_REFERER } }}';
  assert.equal(
    eCode.slice(eCode.indexOf('source={{'), eCode.indexOf('source={{') + expectedSource.length),
    expectedSource,
    'the source is a literal built from `videoId` - never read from a ref or from state',
  );
  assert.ok(!eCode.includes('<iframe'));
  assert.ok(!eCode.includes('baseUrl:'));
  assert.ok(!eCode.includes('injectedJavaScript={mode'));
  assert.ok(eCode.includes('injectedJavaScript={EMBED_REFERRER_PROBE}'));
  assert.equal((eCode.match(/<WebView/g) ?? []).length, 1);
  assert.equal((eCode.match(/source=\{\{/g) ?? []).length, 1);
  // No timer may act ON THE PLAYER. The file has three `setTimeout` calls, each pinned by name: two
  // inside the injected probe (they only measure) and one line that schedules the report to the
  // server at 3 s and 8 s. Build 20.2 added that third one on the owner's order, and the guard that
  // matters is kept: `8000` is a REPORT delay, never again a window in which the source is swapped.
  assert.equal((eCode.match(/setTimeout\(/g) ?? []).length, 3);
  assert.ok(eCode.includes('const LIVE_DIAGNOSTIC_REPORT_DELAYS_MS = [3000, 8000];'));
  assert.ok(!eCode.includes('8 * 1000'));
  assert.ok(!/reserve/i.test(eCode));
  // Build 18.1 (owner's correction): the address under the player is NOT taken from the injected
  // script any more - that one runs before the navigation and reported `about:blank`. It comes from
  // the WebView's own `onLoadEnd`, printed next to what YouTube's own page reported and the HTTP
  // code, and nothing reports `location.href`. There is no "variant" line any more: no second
  // variant exists.
  assert.ok(!eCode.includes('pagina:href'));
  assert.ok(!eCode.includes('location.href'));
  assert.ok(eCode.includes('onLoadEnd={(event: { nativeEvent: { url: string } }) => {'));
  assert.ok(eCode.includes('setLoadedUrl({ videoId, text: url })'));
  assert.ok(eCode.includes('live.playerPageOrigin'));
  assert.ok(eCode.includes('live.playerSignalLabel'));
  assert.ok(eCode.includes('live.playerHttpLabel'));
  assert.ok(!eCode.includes('live.playerVariantLabel'));
  // The decisive diagnostic added in build 20: `document.referrer` read from inside YouTube's own
  // page, next to the `<video>` element's presence and the page text ("Error 153" arrives verbatim).
  assert.ok(eCode.includes("'ref=' + (document.referrer || '(gol)')"));
  assert.ok(eCode.includes("var video = document.querySelector('video');"));
  // BUILD 20.1: the probe sends ONE MESSAGE PER FACT (they used to travel packed into a single
  // string), each fact gets its own state and therefore its own line on screen.
  assert.ok(eCode.includes("send('ref=' + (document.referrer || '(gol)'));"));
  assert.ok(eCode.includes("send('video=' + (box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'nu'));"));
  assert.ok(eCode.includes("if (text) send('text=' + text);"));
  assert.ok(eCode.includes("if (data.startsWith('ref=')) setReferrer({ videoId, text: data });"));
  assert.ok(eCode.includes("else if (data.startsWith('video=')) setVideoInfo({ videoId, text: data });"));
  assert.ok(eCode.includes("else if (data.startsWith('text=')) setPageText({ videoId, text: data });"));
  // BUILD 20.1: the missing measurement - the box the WebView measured ITSELF (`onLayout`), printed
  // as `webview=<w>x<h>`, plus the loading state as a token (`incarcat=da/nu`).
  assert.ok(eCode.includes('onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => {'));
  assert.ok(eCode.includes('setWebviewSize({ videoId, text:'));
  assert.ok(eCode.includes('webview=${webviewSizeText ?? DIAGNOSTIC_PENDING}'));
  assert.ok(eCode.includes("incarcat=${pageLoaded ? 'da' : 'nu'}"));
  // Nothing in the player opens a browser on its own (owner's correction, 10.10.2026), and the one
  // way out the user can tap stays INSIDE the app - `Linking.openURL` is forbidden (build 17).
  assert.ok(!eCode.includes('Linking.'));
  assert.ok(eCode.includes("import * as WebBrowser from 'expo-web-browser';"));
  assert.ok(eCode.includes('WebBrowser.openBrowserAsync(buildYouTubeWatchUrl(videoId))'));
  assert.equal((eCode.match(/openBrowserAsync/g) ?? []).length, 1);

  // BUILD 20.2: the diagnosis leaves the phone. The app posts the SAME values that are printed
  // under the player to the `live-player-diagnostic` function, so DSH can read them from the
  // database with `service_role` - builds 18 and 19 both ended without one valid reading because
  // the only channel was a phone screen. At most THREE reports per opening, and a network failure
  // is silent: a diagnostic that can break the screen it diagnoses is worth nothing.
  assert.ok(eCode.includes('`${projectUrl}/functions/v1/live-player-diagnostic`'));
  assert.ok(eCode.includes('const LIVE_DIAGNOSTIC_REPORT_LIMIT = 3;'));
  assert.ok(eCode.includes('if (reportCountRef.current >= LIVE_DIAGNOSTIC_REPORT_LIMIT) return;'));
  assert.ok(eCode.includes('reportCountRef.current += 1;'));
  assert.ok(eCode.includes('reportCountRef.current = 0;'));
  assert.ok(eCode.includes('process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
  assert.ok(eCode.includes("method: 'POST'"));
  assert.ok(eCode.includes('apikey: endpoint.key'));
  assert.equal((eCode.match(/fetch\(/g) ?? []).length, 1);
  assert.ok(eCode.includes('}).catch(() => undefined);'));
  assert.ok(!eCode.includes('Alert.alert'));
});