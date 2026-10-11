import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Pins for the iOS black-screen work on the LIVE player.
 *
 * Timeline: build 11 removed the `<Modal>` (necessary, not sufficient - still black), build 12
 * replaced react-native-youtube-iframe's navigation policy (measured on the owner's iPhone: STILL
 * black). Build 13 therefore removed the library altogether: the player is a plain WebView from
 * react-native-webview, so nothing of the library can cancel or shadow the load. Build 15 removes
 * `mute=1` (the owner wants SOUND) and pins the behaviour rule that follows from it: because a
 * player with sound cannot start without a user gesture on iOS, YouTube's own play button is
 * allowed to be the thing that starts the stream - and therefore NOTHING may decide by itself
 * that "the picture did not start" and jump to the browser. Build 15 also fixes the cause the
 * owner measured in Safari: ERROR 153, i.e. YouTube refusing the embed for lack of a valid
 * referer, so the document URL and the `origin=` parameter are the project's own live site.
 *
 * BUILD 17 (10.10.2026) fixed the two things build 15 still had wrong:
 *   1. The frame `src` was built from `EMBED_DOCUMENT_BASE_URL`, the very constant that had just
 *      been moved to our own domain - so the sub-frame asked US for `/embed/<id>` and our site
 *      answered HTTP 404, i.e. the player could never show a picture regardless of YouTube. The
 *      embed host (`YOUTUBE_EMBED_BASE_URL`) is now separate from the document URL/origin.
 *   2. The way out still called `Linking.openURL`, which leaves the app; the owner forbade that.
 *      The manual button now opens an in-app browser (`WebBrowser.openBrowserAsync`).
 *
 * BUILD 18 (10.10.2026) made the header request the main path and kept the build 17 document
 * variant as an 8-second reserve; DSH measured in real Chrome through CDP that the same
 * `/embed/<id>?playsinline=1&rel=0&modestbranding=1` answers ERROR 153 WITHOUT a `Referer` header
 * and loads the player WITH `Referer: https://ortodoxia.web.app/`. Build 18.1 corrected the
 * DIAGNOSTICS, on the owner's report that the screen said `about:blank`: that value came from
 * `injectedJavaScript`, which runs BEFORE the navigation and therefore described the blank
 * document the WebView starts from - it was never evidence about the player page. The address now
 * comes from the WebView's own `onLoadEnd` (`nativeEvent.url`), i.e. from the load that ENDED.
 *
 * BUILD 20 (10.10.2026) is THE MINIMAL VARIANT, and it deletes the mechanism the audit named as the
 * cause: the reserve + the remount on `key={`${videoId}:${mode}`}` could cancel a load that was
 * still in progress - at 8 s the timer wrote mode='document', React unmounted that WebView (aborting
 * the request on the wire) and mounted a fresh one with the document variant, the variant builds
 * 13-17 had already measured as BLACK. Its probe also sampled only at 1200 ms and 4000 ms, and it
 * checked neither `pageLoaded` nor the HTTP status, so it fired even on a load that was merely
 * slow - a 24/7 livestream legitimately needs more than 8 s. So the reserve could only ever turn a
 * slow-but-working load into a known-black one, and it is gone. What is pinned below is therefore:
 * ONE WebView, ONE loading, and NOTHING in the component able to unmount, remount, navigate away
 * from or replace that load (no `key`, no mode state, no reserve, no second source). The only two
 * refs and the only timer outside the probe belong to the REPORT added in 20.2 (see below), and
 * they can only post a JSON body - they never touch `source` or the WebView's lifetime.
 * The diagnostics stay, with ONE change of substance: the injected probe now reports the decisive
 * field, `document.referrer`, read from inside YouTube's own page, plus whether a `<video>` exists
 * and the page's visible text (which carries "Error 153" verbatim when YouTube refuses).
 *
 * BUILD 20.2 (10.10.2026) — THE SAME VALUES ALSO LEAVE THE PHONE. Builds 18 and 19 each ended with
 * no valid reading at all, because a value that exists only on a phone screen has to be read by a
 * human holding that phone. The app now posts to the function `live-player-diagnostic` exactly the
 * expressions printed under the player - the same constants, never a second set - so the screen and
 * the database cannot disagree. Pinned here: the field-by-field pairing, the ceiling of THREE
 * reports per opening (3 s, 8 s, first state change), one single `fetch`, a silent `catch`, and the
 * absence of any personal data beyond a `user_id` that is always null.
 *
 * The non-negotiables pinned here: no library in the player, the embed served by YouTube while the
 * DOCUMENT/origin and the `Referer` are our own live site (never about:blank, never localhost,
 * never youtube.com), `playsinline=1` with inline playback forced on iOS, no muted/forced autoplay,
 * nothing that opens a browser or an app on its own (the only browser call is the in-app one inside
 * the manual button's `onPress`), and every failure printed small under the player. And the rule
 * from 18.1 that no diagnostic may be taken from the document the WebView starts on: the address
 * shown is the one a load ENDED on.
 */
const native = readFileSync('src/live/youtube-embed.native.tsx', 'utf8');
// Comments quote the library's own code and the measurements, so assertions about the shipped
// behaviour are made against the code only.
const code = native
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('build 15: the native player is a plain WebView, not the iframe library', () => {
  assert.match(code, /import \{ WebView \} from 'react-native-webview';/);
  // The library that owned the black screen must be gone from the code (it also installed the
  // policy that cancelled the player's own youtube.com load, YoutubeIframe.js:228-253).
  assert.doesNotMatch(code, /react-native-youtube-iframe/);
  assert.doesNotMatch(code, /YoutubePlayer/);
  assert.doesNotMatch(code, /onShouldStartLoadWithRequest/);
  // And it must not hand the player URL to Safari/the YouTube app behind the user's back: the
  // player has no `Linking` path at all any more (build 17: `Linking.openURL` leaves the app, which
  // the owner forbade); the way out is the in-app browser in the manual button, pinned below.
  assert.doesNotMatch(code, /Linking\./);
});

test('build 20: ONE WebView, ONE loading, and nothing that can cancel it', () => {
  // Exactly one WebView and exactly one source: there is no second variant to switch to, so no
  // failure can be answered by replacing the load that is running.
  assert.equal((code.match(/<WebView/g) ?? []).length, 1, 'exactly one WebView may exist');
  assert.equal((code.match(/source=\{\{/g) ?? []).length, 1, 'exactly one source may exist');
  assert.match(code, /source=\{\{ uri: buildEmbedRequestUrl\(videoId\), headers: \{ Referer: EMBED_REFERER \} \}\}/);
  // THE REMOVAL IS PINNED HERE, so the mechanism the audit found cannot come back quietly. A `key`
  // that changes with the mode unmounts the WebView and aborts the request already in flight; the
  // reserve is what changed it; the mode state and the ref are what fed both.
  assert.doesNotMatch(code, /key=\{/, 'a changing `key` remounts the WebView and aborts the load');
  assert.doesNotMatch(code, /EMBED_RESERVE_MS/, 'the 8-second reserve is what cancelled the load');
  assert.doesNotMatch(code, /EmbedLoading/, 'the header/document state machine must be gone');
  assert.doesNotMatch(code, /setLoading\(/);
  assert.doesNotMatch(code, /playerSignalRef/);
  assert.doesNotMatch(code, /\bmode ===|\bmode !==/);
  // BUILD 20.2 replaced the blanket "no `useRef`" rule with a narrower and stronger one, because the
  // report needs to hold its own payload: EXACTLY two refs exist, both named and both belonging to
  // the report, and nothing may derive the source from a ref or from state (the source expression
  // above is pinned as a literal built from `videoId`).
  assert.equal((code.match(/useRef[<(]/g) ?? []).length, 2, 'only the report may hold refs');
  assert.match(code, /const reportPayloadRef = useRef<LivePlayerDiagnosticReport \| null>\(null\);/);
  assert.match(code, /const reportCountRef = useRef\(0\);/);
  const expectedSource =
    'source={{ uri: buildEmbedRequestUrl(videoId), headers: { Referer: EMBED_REFERER } }}';
  const sourceAt = code.indexOf('source={{');
  assert.equal(
    code.slice(sourceAt, sourceAt + expectedSource.length),
    expectedSource,
    'the source is a literal built from `videoId` - never read from a ref or from state',
  );
  assert.doesNotMatch(code, /buildEmbedDocument/);
  assert.doesNotMatch(code, /baseUrl:/);
  // The file has exactly THREE `setTimeout` calls and each is pinned by name: two inside the injected
  // probe (they only MEASURE - they report twice and decide nothing) and ONE line that schedules the
  // report at 3 s and 8 s. Build 20.2 added that third one on the owner's order; what has NOT come
  // back is the 8-second window in which the source was swapped - `8000` may only be a report delay.
  assert.equal((code.match(/setTimeout\(/g) ?? []).length, 3, 'a fourth timer would be a new automatic action');
  assert.match(code, /setTimeout\(report, 1500\);/);
  assert.match(code, /setTimeout\(report, 5000\);/);
  assert.match(code, /const EMBED_REFERRER_PROBE = `\(function \(\) \{/);
  assert.doesNotMatch(code, /setTimeout\(\(\) => \{/, 'no timer may carry an action');
  assert.match(code, /const LIVE_DIAGNOSTIC_REPORT_DELAYS_MS = \[3000, 8000\];/);
  assert.doesNotMatch(code, /8 \* 1000/);
  assert.doesNotMatch(code, /reserve/i, 'the 8-second reserve is what cancelled the load');
});

test('build 20: the measured header request is the only request, and the two roles stay separate', () => {
  // Item 1 of the owner's order, exactly as measured: YouTube serves the embed, OUR site supplies
  // the Referer - one header was the whole difference in the CDP A/B.
  assert.match(code, /const EMBED_REFERER = `\$\{EMBED_DOCUMENT_BASE_URL\}\/`;/);
  // Build 13 declared `https://www.youtube.com` as the document URL/origin: that presents the app
  // as YouTube embedding YouTube, which YouTube refuses (owner saw ERROR 153 in Safari when there
  // is no valid referer). Build 15 declares the project's own live site instead.
  assert.match(code, /const EMBED_DOCUMENT_BASE_URL = 'https:\/\/ortodoxia\.web\.app';/);
  // Build 17: the two roles are separate constants. The request must go to YouTube's embed endpoint,
  // because OUR site answers HTTP 404 on `/embed/<id>` (measured).
  assert.match(code, /const YOUTUBE_EMBED_BASE_URL = 'https:\/\/www\.youtube\.com';/);
  assert.match(code, /return `\$\{YOUTUBE_EMBED_BASE_URL\}\/embed\/\$\{encodeURIComponent\(videoId\)\}\?\$\{EMBED_PLAYER_PARAMS\}`;/);
  assert.doesNotMatch(code, /\$\{EMBED_DOCUMENT_BASE_URL\}\/embed\//, 'the request must ask YouTube, not our own site (404)');
  // YouTube only answers the embed when the document origin matches the `origin=` parameter - and
  // both come from the same constant, so they cannot drift apart.
  assert.match(code, /origin=\$\{EMBED_DOCUMENT_BASE_URL\}/);
  // The document variant (our own html + `<iframe>` + `baseUrl`) is GONE, and it must not come back:
  // builds 13-17 measured it as BLACK, so falling back to it turns a slow load into a dead one.
  assert.doesNotMatch(code, /<iframe/);
  assert.doesNotMatch(code, /<html style="height:100%">/);
  assert.doesNotMatch(code, /injectedJavaScript=\{mode/);
  // The owner's compositing workaround stays: a fully opaque WKWebView layer can remain black, and
  // build 18 fills the area it is given (`flex: 1`) instead of a fixed 16:9 slice.
  assert.match(code, /webview: \{ flex: 1, width: '100%', backgroundColor: '#000', opacity: 0\.99 \}/);
});

test('build 15: sound on (no muted autoplay), inline playback forced on iOS', () => {
  // The owner asked for sound: `mute=1` must be gone, and with it the forced autoplay that only
  // existed because the player was muted. YouTube's own play button starts the stream instead.
  assert.ok(!code.includes("'mute=1'"), 'the embed put mute=1 back (the owner wants sound)');
  assert.ok(!code.includes("'autoplay=1'"), 'the embed forces autoplay again (iOS blocks it with sound)');
  assert.ok(code.includes("'playsinline=1'"), 'the embed lost playsinline=1 (iOS would go native fullscreen)');
  // `allowsInlineMediaPlayback` must be EXPLICITLY true: that prop is what keeps WKWebView
  // playing inside the app instead of black.
  assert.ok(code.includes('allowsInlineMediaPlayback={true}'), 'allowsInlineMediaPlayback must be explicit true');
  for (const flag of [
    'allowsFullscreenVideo',
    'mediaPlaybackRequiresUserAction={false}',
    'javaScriptEnabled',
    'domStorageEnabled',
    "originWhitelist={['*']}",
  ]) {
    assert.ok(code.includes(flag), `the WebView lost ${flag}`);
  }
});

test('build 20: nothing opens a browser by itself - one in-app call, in the manual button', () => {
  // The owner's correction stands: an automatic hop after a few seconds of buffering is a false
  // negative on a 24/7 livestream - it must not come back with the reserve. Build 17 adds his
  // second rule: when the user DOES tap the way out, it must stay in the app -
  // `WebBrowser.openBrowserAsync`, never `Linking.openURL`.
  assert.doesNotMatch(code, /Linking\./, 'Linking.openURL leaves the app; the owner forbade it');
  assert.doesNotMatch(code, /6000|6 \* 1000/);
  const browserCalls = code.match(/WebBrowser\.openBrowserAsync/g) ?? [];
  assert.equal(browserCalls.length, 1, 'exactly one way out to YouTube: the manual one');
  // It lives inside the press handler of that button - nowhere else, so no timer and no measurement
  // can reach it.
  assert.match(code, /onPress=\{\(\) => \{\s*void WebBrowser\.openBrowserAsync\(buildYouTubeWatchUrl\(videoId\)\)\.catch\(/);
  // The EXACT COUNT above is still the guard, and build 20.2 raised it by exactly ONE, on the
  // record: the three timers are the probe's two calls (inside a string, reporting only) and the
  // single line that schedules the report to the server at 3 s and 8 s. What that third one may
  // never do is carry an action on the PLAYER - it posts a JSON body, the callback is named, and the
  // `8000` it uses is a report delay: the reserve that once used that number is gone for good.
  assert.match(code, /setTimeout\(sendLivePlayerDiagnostic, delay\)/);
  assert.equal((code.match(/setTimeout\(/g) ?? []).length, 3, 'a fourth timer would be a new automatic action');
});

test('build 15: native player never fails silently', () => {
  // WebView-level failures (network, HTTP status) and the page's own reports all reach the
  // screen, small, under the player - the owner asked for text, not an alert.
  assert.match(code, /onHttpError=\{\(event: \{ nativeEvent: \{ statusCode: number; url: string \} \}\)/);
  assert.match(code, /onError=\{\(event: \{ nativeEvent: \{ description: string \} \}\)/);
  assert.match(code, /onMessage=\{\(event: \{ nativeEvent: \{ data: string \} \}\)/);
  // Build 17, item 4, CORRECTED in 18.1: the address under the player is NO LONGER taken from a
  // script inside the page. That script runs before the navigation, so it reported `about:blank` -
  // the owner read exactly that off his screen in build 18. The address now comes from the WebView's
  // own `onLoadEnd`, i.e. from a load that ENDED, and it is printed under the player.
  assert.doesNotMatch(code, /pagina:href/);
  assert.doesNotMatch(code, /location\.href/);
  assert.match(code, /onLoadEnd=\{\(event: \{ nativeEvent: \{ url: string \} \}\) => \{/);
  assert.match(code, /const url = event\.nativeEvent\.url;/);
  assert.match(code, /setLoadedUrl\(\{ videoId, text: url \}\)/);
  assert.match(code, /t\('live\.playerPageOrigin'\)/);
  assert.doesNotMatch(code, /Alert\.alert/);
  assert.match(code, /loadingText/);
  // Build 20.1: the probe's three facts and the WebView's own measured box each have their OWN state,
  // so each can land on its OWN line instead of being packed into one string.
  assert.match(code, /const referrerText = referrer && referrer\.videoId === videoId \? referrer\.text : null;/);
  assert.match(code, /const videoText = videoInfo && videoInfo\.videoId === videoId \? videoInfo\.text : null;/);
  assert.match(code, /const pageTextLine = pageText && pageText\.videoId === videoId \? pageText\.text : null;/);
  assert.match(code, /const webviewSizeText = webviewSize && webviewSize\.videoId === videoId \? webviewSize\.text : null;/);
  // Nothing claims "there is no room to play" from a guess any more: that string and its 0x0
  // measurement left with the document variant, whose script was the only thing that measured a
  // frame we controlled.
  assert.doesNotMatch(code, /frameMeasuredEmpty/);
  assert.doesNotMatch(code, /iframe:marime/);
  // Build 20: the header request has no document of ours, so its page state is collected by the
  // injected probe. There is exactly ONE probe now, it is unconditional (no mode), and what it
  // reports is the decisive datum: `document.referrer` as YouTube's own page sees it, plus whether a
  // `<video>` element exists and its size, plus the page's visible text - so a refusal arrives with
  // "Error 153" verbatim and the open question is settled by a measurement, not by a guess.
  assert.match(code, /injectedJavaScript=\{EMBED_REFERRER_PROBE\}/);
  assert.match(code, /'ref=' \+ \(document\.referrer \|\| '\(gol\)'\)/);
  // Build 20.1: ONE message per fact (`ref=`, `video=`, `text=`), so no two facts share a line.
  assert.match(code, /send\('ref=' \+ \(document\.referrer \|\| '\(gol\)'\)\);/);
  assert.match(code, /send\('video=' \+ \(box \? Math\.round\(box\.width\) \+ 'x' \+ Math\.round\(box\.height\) : 'nu'\)\);/);
  assert.match(code, /if \(text\) send\('text=' \+ text\);/);
  assert.match(code, /var video = document\.querySelector\('video'\);/);
  assert.match(code, /if \(data\.startsWith\('ref='\)\) setReferrer\(\{ videoId, text: data \}\);/);
  assert.match(code, /else if \(data\.startsWith\('video='\)\) setVideoInfo\(\{ videoId, text: data \}\);/);
  assert.match(code, /else if \(data\.startsWith\('text='\)\) setPageText\(\{ videoId, text: data \}\);/);
  // Build 20.1: the WebView measures ITSELF, and only for the videoId it is showing. This is the half
  // of the question a black screen asks that no script inside the page can answer - whether the
  // player had a box to draw in at all.
  assert.match(code, /onLayout=\{\(event: \{ nativeEvent: \{ layout: \{ width: number; height: number \} \} \}\) => \{/);
  assert.match(code, /setWebviewSize\(\{ videoId, text: `\$\{Math\.round\(width\)\}x\$\{Math\.round\(height\)\}` \}\)/);
  // Build 20: the footer carries every measured value, each with its own label - the final url, the
  // HTTP code when a response failed, the WebView's own error text, and the probe's three facts.
  // There is NO "variant" line any more, because there is no second variant: the old label must not
  // come back.
  assert.match(code, /t\('live\.playerPageOrigin'\)\}: \$\{loadedUrlText \?\? DIAGNOSTIC_PENDING\}/);
  assert.match(code, /const DIAGNOSTIC_PENDING = '\.\.\.';/);
  assert.match(code, /t\('live\.playerSignalLabel'\)\}/);
  assert.match(code, /t\('live\.playerHttpLabel'\)\}: \$\{httpStatusText\}/);
  assert.match(code, /t\('live\.playerErrorLabel'\)\}: \$\{errorText\}/);
  assert.match(code, /setHttpStatus\(\{/);
  assert.doesNotMatch(code, /live\.playerVariantLabel/);
  // BUILD 20.1: the ORDER of the diagnostic block, pinned as one sequence, because the owner reads it
  // off the phone in exactly this order and a shuffled line would be misread. In code tokens:
  //   loadingText -> loadedUrlText (`pagina:`) -> httpStatusText (`http:`) -> errorText (`eroare:`)
  //   -> playerSignalLabel (heading) -> referrerText (`ref=`) -> videoText (`video=`)
  //   -> webviewSizeText (`webview=`) -> incarcat= -> pageTextLine (`text=`) -> the manual way out.
  // All of it inside the footer, under the player, above the button.
  assert.match(
    code,
    /<View style=\{styles\.footer\}>[\s\S]*loadingText[\s\S]*loadedUrlText[\s\S]*httpStatusText[\s\S]*errorText[\s\S]*playerSignalLabel[\s\S]*referrerText[\s\S]*videoText[\s\S]*webviewSizeText[\s\S]*incarcat=[\s\S]*pageTextLine[\s\S]*openOnYouTube/,
  );
});

test('build 15/17: the YouTube way out is unconditional and manual, and stays in the app', () => {
  // The player is the main path now, but the service still has to be reachable if the embed is
  // refused (region, age, "watch on YouTube only"): nothing measured may gate that button.
  const footer = code.slice(code.indexOf('<View style={styles.footer}>'));
  const buttonAt = footer.indexOf('<Pressable');
  assert.ok(buttonAt > 0, 'the open-on-YouTube control is missing from the player footer');
  const before = footer.slice(0, buttonAt);
  // The diagnostics may (and do) sit above it, but the button itself is a plain element.
  // Build 20.1 added the probe's own lines AFTER the last conditional (they are unconditional, one per
  // field), so the tail after the last `: null}` is no longer blank - and what this test is about was
  // never the blankness: it is that between the LAST diagnostic line and the button there is no
  // conditional at all, so no `? :` and no `&&` can ever hide the way out. The line before the button
  // is the last probe line (`text=`), which ends in `DIAGNOSTIC_PENDING`.
  const afterDiagnostics = before.slice(
    before.lastIndexOf('DIAGNOSTIC_PENDING') + 'DIAGNOSTIC_PENDING'.length,
  );
  assert.ok(afterDiagnostics.length > 0, 'the way out must come after the diagnostic block');
  assert.doesNotMatch(afterDiagnostics, /\?(?![?=])/, 'no ternary may sit between the diagnostics and the button');
  assert.doesNotMatch(afterDiagnostics, /&&/, 'no `&&` may sit between the diagnostics and the button');
  assert.doesNotMatch(afterDiagnostics, /: null\}/, 'no conditional element may sit between the diagnostics and the button');
  assert.doesNotMatch(before, /\?\s*<Pressable|&&\s*<Pressable/);
  // Build 17: the way out is an IN-APP browser (owner's rule): it must not leave the app.
  assert.match(footer, /WebBrowser\.openBrowserAsync\(buildYouTubeWatchUrl\(videoId\)\)/);
  assert.match(code, /import \* as WebBrowser from 'expo-web-browser';/);
  assert.match(footer, /accessibilityRole="button"/);
  // Discreet and secondary: outlined, never a second filled primary next to the player.
  assert.match(code, /openButton: \{\s*backgroundColor: 'transparent',\s*borderWidth: 1,/);
  assert.match(code, /openText: \{ color: palette\.sky, fontSize: 13,/);
});

test('build 20: the header keeps measurements apart from the open question', () => {
  // Rule 19: a guess may not be written as a fact. The history is recorded with the exact
  // reason each earlier attempt failed, the remaining unknown is named, and the rule that decides
  // the next step is written down with it.
  assert.match(native, /THE CAUSE OF ERROR 153, MEASURED BY THE OWNER/);
  assert.match(native, /it is what decides the next step/);
  // The open question is named AS an open question, with the branch that follows from each answer:
  // an EMPTY `document.referrer` sends us to a real page on our own domain, not to another header.
  // Build 20.1 renamed the token the owner reads to the one actually printed on screen (`ref=`).
  assert.match(native, /ref= \(gol\)/);
  assert.match(native, /build 17 used loadHTMLString/);
  // Build 20.1: the header must state that the diagnostic is printed in the pinned order, because the
  // owner reads it off the phone in that order and no later agent may shuffle it. (The sentence wraps
  // across two comment lines in the source, so the pin allows the line break.)
  assert.match(native, /Build 20\.1[\s\S]{0,20}prints these lines IN THIS ORDER/);
  // The cause the owner measured, with the exact message, and the fix that follows from it.
  assert.match(native, /ERROR 153/);
  assert.match(native, /Referer/);
  // The two decisions that must not be undone quietly are written down where the next reader
  // looks: sound is on (so a tap may be needed) and nothing opens a browser by itself.
  assert.match(native, /NO `mute=1` and NO `autoplay=1`/);
  assert.match(native, /NOTHING HERE OPENS A BROWSER BY ITSELF/);
  // Build 17: the two defects of build 15 are written down with the measurement that found them
  // (our own `/embed/<id>` answers 404) and with the owner's rule that the way out stays in-app.
  assert.match(native, /HTTP 404/);
  assert.match(native, /YOUTUBE_EMBED_BASE_URL/);
  assert.match(native, /an in-app browser/);
  // Build 20: the removal itself has to be written down where the next reader looks - the state
  // machine that could cancel an in-flight load, with the two aggravating details, and why the
  // reserve could only ever make things worse.
  assert.match(native, /That state machine could cancel a load that was still in[\s\S]{0,40}progress/);
  assert.match(native, /BUILD 20/);
  assert.match(native, /8-second RESERVE/);
  assert.match(native, /It is gone\./);
  assert.match(native, /never checked `pageLoaded` or the HTTP status/);
  assert.match(native, /Referer: https:\/\/ortodoxia\.web\.app\//);
});

test('build 20.2: the report carries the screen\'s own values, one expression each', () => {
  // WHY THIS IS A TEST AND NOT A COMMENT: a second, hand-written set of expressions would let the
  // screen and the database disagree about the same opening - and a diagnostic that can contradict
  // itself is worse than no diagnostic. Every measured field has to appear as the SAME source text
  // in both places, so a future edit to one of them cannot silently leave the other behind.
  const payloadStart = code.indexOf('reportPayloadRef.current = {');
  assert.ok(payloadStart > 0, 'the body of the report is missing from the player');
  const payloadBlock = code.slice(
    payloadStart,
    code.indexOf('user_id: null,', payloadStart) + 'user_id: null,'.length,
  );
  const footerBlock = code.slice(code.indexOf('<View style={styles.footer}>'));

  const oneExpressionEach = [
    'loadedUrlText ?? DIAGNOSTIC_PENDING',
    'httpStatusText',
    'errorText',
    'referrerText ?? DIAGNOSTIC_PENDING',
    'videoText ?? DIAGNOSTIC_PENDING',
    'webviewSizeText ?? DIAGNOSTIC_PENDING',
    'pageTextLine ?? DIAGNOSTIC_PENDING',
  ];
  for (const expression of oneExpressionEach) {
    assert.ok(payloadBlock.includes(expression), `the report must send \`${expression}\``);
    assert.ok(
      footerBlock.includes(expression),
      `the screen must print \`${expression}\` - the same expression, never a copy`,
    );
  }
  // `incarcat=` is the boolean side of the same measurement, and it is the same constant too.
  assert.match(payloadBlock, /loaded: pageLoaded,/);
  assert.match(footerBlock, /incarcat=\$\{pageLoaded \? 'da' : 'nu'\}/);
  // The two build fields come from the build itself, once, and from nothing the user can type.
  assert.match(payloadBlock, /app_version: LIVE_DIAGNOSTIC_APP_VERSION,/);
  assert.match(payloadBlock, /device: LIVE_DIAGNOSTIC_DEVICE,/);
  assert.match(code, /import Constants from 'expo-constants';/);
  assert.match(code, /Constants\.expoConfig\?\.version/);
  // `id` and `created_at` belong to the server: the device must not invent either.
  assert.doesNotMatch(payloadBlock, /\bid:|created_at/);
  // NO PII, checked as a closed list rather than a blacklist: exactly the twelve agreed fields, and
  // a `user_id` that is null - the player has no signed-in user and no personal data to send.
  const payloadKeys = (payloadBlock.match(/^\s*([a-z_]+):/gm) ?? []).map((line) =>
    line.trim().replace(':', ''),
  );
  assert.deepEqual(payloadKeys, [
    'video_id',
    'page_url',
    'http_status',
    'error_text',
    'referrer',
    'video_size',
    'webview_size',
    'loaded',
    'page_text',
    'app_version',
    'device',
    'user_id',
  ]);
  assert.match(payloadBlock, /user_id: null,/);
});

test('build 20.2: at most three reports, ONE request, and a wire failure that never reaches the screen', () => {
  const senderStart = code.indexOf('const sendLivePlayerDiagnostic = useCallback(');
  assert.ok(senderStart > 0, 'the sender is missing from the player');
  const sender = code.slice(senderStart, code.indexOf('}, []);', senderStart));

  // The ceiling of three, enforced BEFORE the request leaves the phone, so a slow network cannot let
  // a fourth one through. A diagnostic must never be able to load the network on the player's behalf.
  assert.match(code, /const LIVE_DIAGNOSTIC_REPORT_LIMIT = 3;/);
  assert.match(sender, /if \(reportCountRef\.current >= LIVE_DIAGNOSTIC_REPORT_LIMIT\) return;/);
  assert.match(sender, /reportCountRef\.current \+= 1;/);
  // The budget belongs to the OPENING: reset when the video changes, never on a re-render.
  assert.match(code, /reportCountRef\.current = 0;[\s\S]{0,120}if \(!videoId\) return;/);

  // Three triggers and no more: the ONE scheduled line (which arms both delays) and the ONE state
  // change. Together with the ceiling of three, that is the whole budget of one opening.
  assert.match(code, /const LIVE_DIAGNOSTIC_REPORT_DELAYS_MS = \[3000, 8000\];/);
  assert.equal(
    (code.match(/sendLivePlayerDiagnostic\(\)/g) ?? []).length,
    1,
    'the only direct call is the state change; the two scheduled ones go through the map',
  );
  assert.equal(
    (code.match(/setTimeout\(sendLivePlayerDiagnostic, delay\)/g) ?? []).length,
    1,
    'both delays come from one scheduled line',
  );
  // The state change: loaded, or an error - and each check is bound to THIS videoId, so a leftover
  // state from a previous video can never spend this opening's budget.
  assert.match(code, /const pageLoaded = pageLoadedFor === videoId;/);
  assert.match(code, /\(playerError !== null && playerError\.videoId === videoId\) \|\|/);
  assert.match(code, /\(httpStatus !== null && httpStatus\.videoId === videoId\)/);
  assert.match(code, /if \(!pageLoaded && !failed\) return;[\s\S]{0,40}sendLivePlayerDiagnostic\(\);/);

  // ONE request, a POST, the publishable key read from the environment - and no path from a failure
  // back to the UI: the `catch` swallows, there is no retry, no loop and no second timer.
  assert.equal((code.match(/fetch\(/g) ?? []).length, 1);
  assert.match(sender, /method: 'POST'/);
  assert.match(sender, /apikey: endpoint\.key/);
  assert.match(sender, /Authorization: `Bearer \$\{endpoint\.key\}`/);
  assert.match(sender, /\}\)\.catch\(\(\) => undefined\);/);
  assert.doesNotMatch(sender, /\.then\(/, 'no second step may run on a report');
  assert.doesNotMatch(sender, /setPlayerError|setLoadedUrl|setHttpStatus|Alert/, 'a failure must not reach the UI');
  // The endpoint is the deployed function, and it is assembled from the environment, never hardcoded.
  assert.match(code, /`\$\{projectUrl\}\/functions\/v1\/live-player-diagnostic`/);
  assert.doesNotMatch(code, /https:\/\/[a-z]+\.supabase\.co/, 'the project URL comes from the environment');
  // Missing configuration DISABLES the report instead of throwing: the player works without it.
  assert.match(code, /if \(!projectUrl \|\| !publishableKey\) return null;/);
});
