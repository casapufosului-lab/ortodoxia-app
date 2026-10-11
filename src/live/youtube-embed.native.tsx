/**
 * YouTube player for native platforms.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BUILD 20 (10.10.2026) — THE MINIMAL VARIANT. This is the file's current shape;
 * everything below the line is history kept so the next agent does not repeat dead ends.
 *
 * BUILD 20.1 (10.10.2026) — THE FULL MEASUREMENT, on the owner's order for round 20: the screen now
 * carries every fact needed to close the question FROM THE PHONE ALONE, and nothing here can still
 * cancel the load. Added: the WebView's OWN measured box (`onLayout` -> `webview=<w>x<h>`) and the
 * loading state as a token (`incarcat=da/nu`); the injected probe now sends its three fields as
 * THREE separate messages (`ref=`, `video=`, `text=`), so each lands on its OWN line instead of
 * being packed into one. No new timer was added: the probe still has exactly its two `setTimeout`
 * calls and they still only MEASURE - nothing in this file acts on its own.
 * The labels the owner reads off the phone were NOT renamed: `Pagina playerului` / `Raspuns HTTP` /
 * `Eroare player` stay exactly as they were, and the new lines carry the literal tokens
 * `ref=`, `video=`, `webview=`, `incarcat=`, `text=`.
 *
 * BUILD 20.2 (10.10.2026) — THE SCREEN IS NO LONGER THE ONLY CHANNEL. Builds 18 and 19 each ended
 * without one valid reading, because a value that exists only on a phone screen has to be read by a
 * human holding that phone. So the app now ALSO posts, to the function `live-player-diagnostic`,
 * exactly the values it prints - same constants, not re-derived - and DSH reads them from the
 * database with `service_role`. THREE reports at most per opening (~3 s, ~8 s, and the first state
 * change), a network failure is swallowed, and nothing of this touches the load: the two new timers
 * only post a JSON body, they cannot replace the source or the WebView (which is exactly what the
 * deleted 8-second reserve did). The lines on screen REMAIN - the phone stays readable on its own.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS REMOVED, AND WHY (the cause found by the audit in AUDIT-VIDEO-LIVE-ios.md):
 *   The file used to keep TWO loadings - the proven header request and an 8-second RESERVE that
 *   swapped in the older document variant - and it forced BOTH through a remount on
 *   `key={`${videoId}:${mode}`}`. That state machine could cancel a load that was still in
 *   progress: at 8 s (EMBED_RESERVE_MS) the timer wrote mode='document', the `key` changed, React
 *   unmounted the WebView - aborting the request already on the wire - and mounted a fresh one
 *   with the document variant, which is the variant builds 13-17 already measured as BLACK.
 *   Two details made that worse, not smaller:
 *     1. the page probe sampled at 1200 ms and 4000 ms only, so between 4 s and 8 s the component
 *        had NO information yet still acted at 8 s;
 *     2. the reserve never checked `pageLoaded` or the HTTP status, so it fired even on a
 *        successfully loaded page that simply had not produced a <video> yet - a 24/7 stream
 *        (buffering, attaching) legitimately needs more than 8 s on a phone.
 *   So the reserve could only ever turn a slow-but-working load into a known-black one. It is gone.
 *
 * WHAT THE PLAYER IS NOW: exactly ONE WebView (`src/live/youtube-embed.native.tsx`), mounted once
 * for the whole lifetime of `videoId`, with nothing in this file able to unmount, remount, navigate
 * away from or replace the load that is running:
 *   `source={{ uri: buildEmbedRequestUrl(videoId), headers: { Referer: EMBED_REFERER } }}`
 * That is the request DSH measured in real Chrome (refused with Error 153 without the `Referer`,
 * served with it), and the header IS applied on iOS: react-native-webview 13.13.5 builds the
 * request through `RNCWebViewImpl.m:848` -> `requestForSource` (`:1922-1940`) -> RCTConvert
 * (`node_modules/react-native/React/Base/RCTConvert.mm:189  request.allHTTPHeaderFields = headers`).
 *
 * THE DIAGNOSTIC (one small block under the player, and it is what decides the next step). Build 20.1
 * prints these lines IN THIS ORDER, and the owner reads them off the phone:
 *   `pagina:`  the FINAL url of the load that ENDED (`onLoadEnd`); `...` until a load ends;
 *   `http:`    the status code (`onHttpError`), printed only if the response failed;
 *   `eroare:`  the WebView's own error text (`onError`), printed only if there is one;
 *   `ref=`     `document.referrer`, from the probe - what YouTube's page itself sees;
 *   `video=`   whether a `<video>` element exists, and its size;
 *   `webview=` the box the WebView measured ITSELF (`onLayout`) - where there was to draw;
 *   `incarcat=` `da` once `onLoad` fired, `nu` while nothing has loaded;
 *   `text=`    the page's visible text (carries "Error 153"/"configuration error" verbatim).
 *   Only `pagina:` and `incarcat=` are unconditional - the rest appear only when they have something
 *   to report, because an absent value is not a value. `...` marks a field not yet sent.
 *   Decision rule, once read off the device:
 *     * `ref= https://ortodoxia.web.app/` AND a `video=` with a non-zero size -> the embed is
 *       live; a black screen then is a compositing/paint problem, not a loading problem;
 *     * `ref= (gol)` -> WKWebView did NOT carry the referrer into the document (a manual
 *       header reaches the wire but is not necessarily the document's referrer). The answer is then
 *       NOT another header: it is to serve a REAL page of our own from https://ortodoxia.web.app
 *       and load THAT url, so WebKit computes the referrer itself - the one variant never tried
 *       (build 17 used loadHTMLString, i.e. a LOCAL document, not a network one);
 *     * HTTP 4xx/5xx or a redirect away from the embed -> the block is server-side.
 *   Build 20.2 sends these SAME values to `live-player-diagnostic` (see THE REPORT below), so the
 *   decision above can also be made from the database, without a photo and without the phone.
 *
 * SOUND, AND WHY THE PLAYER MAY NEED ONE TAP (owner's decision, 10.10.2026): the embed URL has NO
 * `mute=1` and NO `autoplay=1` - the owner wants sound. On iOS a player with sound cannot start
 * without a user gesture, so YouTube's own play button starts it; that is accepted, and it is why
 * nothing in this file may decide on its own that "the picture did not start". `playsinline=1`
 * stays, so iOS plays inside this overlay instead of handing off to the native full-screen player.
 *
 * NOTHING HERE OPENS A BROWSER BY ITSELF. The only browser call sits in the `onPress` of the small
 * manual button under the player: `WebBrowser.openBrowserAsync(...)` - an in-app browser, on the
 * owner's order (NOT `Linking.openURL`, which leaves the app). It is the user who decides, by
 * tapping. There is no timer, no automatic switch and no second loading: this file now has no
 * behaviour that acts on its own at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * HISTORY (dead ends already paid for - do not re-walk them):
 *   - TestFlight build 8 (10.10.2026): the player was rendered inside a React Native
 *     `<Modal presentationStyle="pageSheet">`. A WKWebView mounted in a presented modal on iOS gets
 *     a deferred/zero frame and stays BLACK - no picture, no sound - while the very same code played
 *     fine on Android. Build 11 stopped using a modal: the player became a full-screen overlay
 *     rendered by the live screen itself, as a sibling of `<Screen>` (`src/app/live.tsx`).
 *   - Build 11 was STILL black. Next hypothesis was react-native-youtube-iframe's own navigation
 *     policy: it installs `onShouldStartLoadWithRequest` (YoutubeIframe.js:228-253, passed at :286)
 *     which on iOS treats every `https://www.youtube.com/...` URL as a link the user tapped -
 *     `Linking.openURL(url)` and `return false` (:237-243) - i.e. it cancels that navigation. Build
 *     12 replaced the policy. MEASURED: build 12 on the iPhone was still a black player, with our
 *     own "page loaded, picture did not start" line. So the policy was not the cause (and, per
 *     RNCWebViewImpl.m, the JS predicate is only consulted for main-frame navigations anyway, while
 *     the player lives in a sub-frame - which explains why replacing it changed nothing).
 *   - Builds 13-17: react-native-youtube-iframe is GONE; the player is a plain WebView. Build 13
 *     declared `baseUrl`/`origin` as `https://www.youtube.com`, i.e. it presented itself as YouTube
 *     embedding itself - same dead end, through the WebView. Build 15 moved the document URL to our
 *     own real site `https://ortodoxia.web.app` (live; privacy/terms are served from it, HTTP 200)
 *     but conflated the two roles: the iframe then asked OUR domain for `/embed/<id>` and got HTTP
 *     404 ("Pagina nu a fost gasita") - the player was guaranteed to show nothing. Build 17 split
 *     the constants (`YOUTUBE_EMBED_BASE_URL` serves the embed, `EMBED_DOCUMENT_BASE_URL` is only
 *     the document URL / `origin=`), and shipped the document variant via `loadHTMLString` +
 *     `baseUrl`. MEASURED: build 17 on the iPhone was STILL black. This is why build 20 does not
 *     fall back to it.
 *   - THE CAUSE OF ERROR 153, MEASURED BY THE OWNER (build 15) AND BY DSH IN REAL CHROME (build 18):
 *     opening `https://www.youtube.com/embed/<id>` directly in Safari on the iPhone shows "VIDEO
 *     PLAYER CONFIGURATION ERROR - ERROR 153". DSH then measured the same request through CDP in
 *     real Chrome: WITHOUT a `Referer` header -> Error 153; WITH `Referer: https://ortodoxia.web.app/`
 *     -> the player loads ("TRINITAS TV LIVE"). Same request, only the header differs. Control
 *     videos that are certainly embeddable give the same 153 without the header, so the error is not
 *     about this stream. Follow-up measurement (10.10.2026, HTTP only): that request answers
 *     `HTTP/1.1 200 OK` directly - there is NO redirect that could drop the header - so the check is
 *     done inside the page, on the referrer the player sees. Hence the probe above.
 *   - Build 18 shipped the header variant TOGETHER WITH the 8-second reserve; build 19 was
 *     diagnostics only (its first line - the `onLoadEnd` address - was never read off the phone).
 *     Build 20 is the minimal variant: one WebView, one loading, no reserve, no remount.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as WebBrowser from 'expo-web-browser';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { palette } from '@/constants/palette';
import { buildYouTubeWatchUrl } from '@/live/live-playback';
import { useLocalization } from '@/providers/localization-provider';

/**
 * Base URL - and therefore the HTTP `Referer` and the embedding origin - of the embed. It MUST be a
 * real site of ours, `https://ortodoxia.web.app` (live; the privacy and terms pages are served from
 * it), and it MUST stay identical to the `origin=` parameter below: YouTube refuses the embed
 * (ERROR 153, seen by the owner in Safari) when it cannot see a valid third-party referer, and
 * refuses just as firmly when the document claims to BE youtube.com.
 */
const EMBED_DOCUMENT_BASE_URL = 'https://ortodoxia.web.app';

/**
 * Host that actually serves the embed. It is YouTube's, and it must NOT be the document URL above:
 * YouTube's `/embed/<id>` endpoint is the only thing that renders a player, while our own site
 * answers HTTP 404 on `/embed/<id>` (measured 10.10.2026). Build 15 conflated the two - the iframe
 * asked our domain and could never show a picture - hence the two separate constants.
 */
const YOUTUBE_EMBED_BASE_URL = 'https://www.youtube.com';

const EMBED_PLAYER_PARAMS = [
  'playsinline=1', // play inside the overlay instead of the native full-screen player
  'rel=0',
  'modestbranding=1',
  'iv_load_policy=3', // no annotation overlays on top of the stream
  // NO `mute=1` and NO `autoplay=1`: the owner wants sound. On iOS a player with sound cannot
  // start without a user gesture, so YouTube's own play button is what starts it - accepted.
  `origin=${EMBED_DOCUMENT_BASE_URL}`,
].join('&');

/**
 * The `Referer` sent on the single request. It is the ONE thing that was measured to decide the
 * outcome (ERROR 153 without it, player with it), so it is a constant of its own and it MUST stay
 * our own real site - the same origin as `origin=`, never youtube.com, never a blank string.
 */
const EMBED_REFERER = `${EMBED_DOCUMENT_BASE_URL}/`;

/**
 * What the address line shows until `onLoadEnd` reports the final url. It is a placeholder, not
 * copy: `...` says "this load has not ended yet", which is exactly what a missing address means
 * now that the address comes from the load itself.
 */
const DIAGNOSTIC_PENDING = '...';

/**
 * The URL of the PROVEN direct request: YouTube's own embed endpoint, with the parameters above (so
 * `origin=` is ours while the host is YouTube's). This is the exact request DSH measured in real
 * Chrome through CDP - refused with ERROR 153 without a `Referer`, served with one.
 */
function buildEmbedRequestUrl(videoId: string): string {
  return `${YOUTUBE_EMBED_BASE_URL}/embed/${encodeURIComponent(videoId)}?${EMBED_PLAYER_PARAMS}`;
}

/**
 * ═══ BUILD 21 — PAGINA NOASTRĂ DE EMBED (T2) ═══
 *
 * De ce s-a schimbat cererea pe iOS: `source={{ uri, headers }}` NU ajunge la YouTube pe iOS. Biblioteca
 * construiește un `NSMutableURLRequest` (`RCTConvert.mm:189`), iar când cererea se întoarce `nil`
 * WebView-ul este GOLIT la o pagină albă fără nicio eroare, emițând totuși `onLoad`
 * (`RNCWebViewImpl.m:863-866`) — exact `page_url = about:blank`, `loaded = true`, fără cod HTTP și
 * fără eroare, măsurat în build-urile 11–20. Androidul nu a avut niciodată problema: el cheamă
 * `loadUrl(uri, headers)`.
 *
 * Reparația nu este un antet, ci un DOCUMENT: pagina noastră, servită prin HTTPS de propriul nostru
 * site (`public/live-embed.html`, publicat la https://ortodoxia.web.app/live-embed), încărcată cu un
 * `uri` simplu. Atunci browserul pune SINGUR referer-ul (documentul e al nostru), iar pagina încorporează
 * YouTube prin IFrame API. Nimic nu mai depinde de felul în care WebView-ul tratează antetele.
 */
const EMBED_PAGE_PATH = '/live-embed';

/** Adresa paginii noastre de embed, cu id-ul streamului ca singur parametru al paginii. */
function buildEmbedPageUrl(videoId: string): string {
  return `${EMBED_DOCUMENT_BASE_URL}${EMBED_PAGE_PATH}?v=${encodeURIComponent(videoId)}`;
}

/**
 * Sursa cererii, pe platforme. iOS: pagina NOASTRĂ, `uri` simplu, fără antete (deci nimic nu mai poate
 * goli documentul). Android: EXACT cererea care funcționează azi (YouTube direct, cu `Referer`-ul
 * nostru), literă cu literă, ca build-ul din magazin să nu poată regresa. Funcția este pură (nu atinge
 * nimic din React), ca AMBELE ramuri să poată fi pin-uite de teste.
 */
export function embedSourceFor(
  videoId: string,
  platform: string,
): { uri: string; headers?: { Referer: string } } {
  if (platform === 'ios') return { uri: buildEmbedPageUrl(videoId) };
  return { uri: buildEmbedRequestUrl(videoId), headers: { Referer: EMBED_REFERER } };
}

/**
 * ═══ THE REPORT TO THE SERVER (build 20.2) ═══
 *
 * The screen is read by a human holding a phone; that is how builds 18 and 19 ended without one
 * valid reading. The SAME values printed under the player are therefore also posted to the function
 * `live-player-diagnostic`, where they can be read with `service_role`.
 *
 * THE RULES - and every one of them is about NOT disturbing the player:
 *   - the body carries EXACTLY the expressions printed on screen (same constants, nothing
 *     re-derived here), so the screen and the database can never disagree;
 *   - at most THREE reports per opening (~3 s, ~8 s, and the first state change: the page loaded or
 *     an error arrived), and then it stops, whatever the result;
 *   - a network failure is swallowed (`catch`), never shown, never retried in a loop, and it adds no
 *     timer of its own: a diagnostic that can break the screen it diagnoses is worth nothing.
 */
const LIVE_DIAGNOSTIC_REPORT_LIMIT = 3;

/**
 * The two scheduled reports. They are the ONLY timers outside the probe, and they neither measure
 * nor drive anything: the callback posts a JSON body. In particular they cannot touch the WebView,
 * its `source` or its lifetime - the whole reason the 8-second reserve was deleted in build 20 is
 * that a timer was allowed to replace the load in flight, and nothing here may repeat that.
 */
const LIVE_DIAGNOSTIC_REPORT_DELAYS_MS = [3000, 8000];

/**
 * App version and system, the only two fields that are not a measurement: without them a row cannot
 * be attributed to a build. Neither is personal data.
 */
const LIVE_DIAGNOSTIC_APP_VERSION = Constants.expoConfig?.version ?? '';
const LIVE_DIAGNOSTIC_DEVICE = `${Platform.OS} ${String(Platform.Version)}`;

/** The body posted to the endpoint: the screen's own fields, plus the two build fields. */
export interface LivePlayerDiagnosticReport {
  video_id: string;
  page_url: string;
  http_status: string | null;
  error_text: string | null;
  referrer: string;
  video_size: string;
  webview_size: string;
  loaded: boolean;
  page_text: string;
  /**
   * T2/T4 (build 21): adresa cererii pe care WebView-ul a PORNIT-O (`onLoadStart`) și mesajele pe care
   * le trimite pagina noastră de embed (`page-ready|api-ready|player-ready|state(n)|error(cod)`).
   * Ambele rămân NULL când evenimentul nu a venit, DELIBERAT: `requested_url` non-null este singurul
   * marcaj care deosebește un rând de build 21 de rândurile build-urilor ≤ 20, iar un substituent
   * („...") ar face marcajul fără sens (ar fi mereu non-null).
   */
  requested_url: string | null;
  page_state: string | null;
  app_version: string;
  device: string;
  /** Always null today: the player has no signed-in user, and no PII belongs in a diagnostic. */
  user_id: null;
}

/**
 * The endpoint, read from the same `EXPO_PUBLIC_*` values `src/lib/supabase.ts` reads (inlined at
 * build time). Missing configuration DISABLES reporting instead of throwing: the player must work
 * without a diagnostic, never the other way round.
 */
function livePlayerDiagnosticEndpoint(): { url: string; key: string } | null {
  const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) return null;
  return { url: `${projectUrl}/functions/v1/live-player-diagnostic`, key: publishableKey };
}

/**
 * The probe injected into YouTube's own page (there is no document of ours to run a script from).
 * It is injected at `WKUserScriptInjectionTimeAtDocumentEnd` in the MAIN frame only
 * (RNCWebViewImpl.m:1687-1697), which is where the player lives.
 *
 * It reports the three facts that settle the question - ONE MESSAGE PER FACT, so each lands on its
 * OWN line under the player (`ref=`, `video=`, `text=`) - and it does nothing else: it switches
 * nothing, opens nothing and decides nothing.
 *   - `ref=`   -> `document.referrer`, the value YouTube's player actually sees. This is the one
 *                 datum that separates "the header reached the wire but not the document" from
 *                 "the referrer is there and the refusal is on YouTube's side".
 *   - `video=` -> whether a `<video>` element exists, and its size (0x0 is a real measurement too).
 *   - `text=`  -> the page's visible text, which carries "Error 153"/"configuration error" verbatim.
 * It runs twice because a 24/7 stream attaches slowly; each run overwrites the line it owns.
 */
const EMBED_REFERRER_PROBE = `(function () {
  function send(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(message));
  }
  function report() {
    var video = document.querySelector('video');
    var box = video ? video.getBoundingClientRect() : null;
    var text = document.body && document.body.innerText
      ? document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 160)
      : '';
    send('ref=' + (document.referrer || '(gol)'));
    send('video=' + (box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'nu'));
    if (text) send('text=' + text);
  }
  setTimeout(report, 1500);
  setTimeout(report, 5000);
})();
true;`;

/**
 * T2 (build 21): este mesajul primit de la pagina NOASTRĂ de embed sau de la sonda din Android?
 * Pagina trimite `page-ready?v=…` (obligatoriu — este dovada că documentul este al nostru), apoi
 * `api-ready`, `player-ready`, `state(n)` la fiecare schimbare de stare și `error(cod)` pentru
 * 2/5/100/101/150. `Error 153` NU este cod de player, ci text de pagină — de aceea pagina îl raportează
 * ca expirare (`error(no-player-in-25s)`), nu prefăcându-se că știe numărul.
 */
function isEmbedPageMessage(data: string): boolean {
  return (
    data === 'page-ready' ||
    data.startsWith('page-ready?') ||
    data === 'api-ready' ||
    data === 'player-ready' ||
    data.startsWith('state(') ||
    data.startsWith('error(')
  );
}

/**
 * Câte mesaje de pagină se păstrează per deschidere. `state(n)` se repetă la fiecare tick de
 * buffering, iar `page-ready` — singura dovadă că documentul e al nostru — trebuie să rămână PRIMUL.
 */
const PAGE_STATE_MAX_ENTRIES = 8;

export interface YouTubeEmbedProps {
  videoId: string | null;
  onClose: () => void;
}

export function YouTubeEmbed({ videoId, onClose }: YouTubeEmbedProps) {
  const { t } = useLocalization();

  // Every event is remembered TOGETHER with the videoId it belongs to, so a measurement of a
  // previous service cannot stay pinned on the next one.
  const [playerError, setPlayerError] = useState<{ videoId: string; text: string } | null>(null);
  const [pageLoadedFor, setPageLoadedFor] = useState<string | null>(null);
  // The FINAL url of the load, taken from the WebView's own `onLoadEnd` (`nativeEvent.url`) and NOT
  // from a script inside the page: the address of a load that really ENDED, so it can never read
  // `about:blank` (which the owner saw in build 18 and which read like a finding).
  const [loadedUrl, setLoadedUrl] = useState<{ videoId: string; text: string } | null>(null);
  // The HTTP status code the WebView reports for a failed response (`onHttpError`), on its own line.
  const [httpStatus, setHttpStatus] = useState<{ videoId: string; text: string } | null>(null);
  // Build 20.1: the probe's three fields, EACH ON ITS OWN LINE (they used to arrive packed into one
  // message), and the box the WebView itself measured (`onLayout`).
  const [referrer, setReferrer] = useState<{ videoId: string; text: string } | null>(null);
  const [videoInfo, setVideoInfo] = useState<{ videoId: string; text: string } | null>(null);
  const [pageText, setPageText] = useState<{ videoId: string; text: string } | null>(null);
  const [webviewSize, setWebviewSize] = useState<{ videoId: string; text: string } | null>(null);
  // Build 21: adresa pe care WebView-ul a PORNIT cererea (`onLoadStart`) — instrumentul care lipsea în
  // build 20 (acolo numai `onLoadEnd` scria, adică documentul COMIS, deja golit) — și mesajele paginii
  // noastre, acumulate în ordinea sosirii.
  const [requestedUrl, setRequestedUrl] = useState<{ videoId: string; text: string } | null>(null);
  const [pageState, setPageState] = useState<{ videoId: string; messages: string[] } | null>(null);
  // Blocul tehnic stă în spatele unui buton transparent de 48x48 (implicit: ascuns). Nu se șterge — a
  // fost singurul canal citibil în 20 de build-uri — dar nu mai concurează cu playerul pe ecran.
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleBack = useCallback(() => {
    if (videoId) {
      onClose();
      return true;
    }
    return false;
  }, [videoId, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  useEffect(() => {
    if (!videoId) return;

    return () => {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    };
  }, [videoId]);

  // ─── The report to the server (build 20.2) ───
  // Every value the screen prints and the report sends is derived HERE, once, above the report and
  // above the early return: the report reads exactly these constants, never a second expression of
  // its own, and the early return stays exactly where it was (all of these are null-safe with no
  // videoId).
  const errorText = playerError && playerError.videoId === videoId ? playerError.text : null;
  const pageLoaded = pageLoadedFor === videoId;
  // The url of the load that ENDED (onLoadEnd) and the HTTP code if the response failed.
  const loadedUrlText = loadedUrl && loadedUrl.videoId === videoId ? loadedUrl.text : null;
  const httpStatusText = httpStatus && httpStatus.videoId === videoId ? httpStatus.text : null;
  // Build 20.1: the probe's three lines, exactly as the probe sent them (`ref=`, `video=`, `text=`),
  // and the WebView's own measured box.
  const referrerText = referrer && referrer.videoId === videoId ? referrer.text : null;
  const videoText = videoInfo && videoInfo.videoId === videoId ? videoInfo.text : null;
  const pageTextLine = pageText && pageText.videoId === videoId ? pageText.text : null;
  const webviewSizeText = webviewSize && webviewSize.videoId === videoId ? webviewSize.text : null;
  // Build 21: ce s-a CERUT (`onLoadStart`) și ce a raportat pagina. `requestedUrlText` rămâne null dacă
  // evenimentul nu a venit — este o măsurătoare, nu un substituent.
  const requestedUrlText = requestedUrl && requestedUrl.videoId === videoId ? requestedUrl.text : null;
  const pageStateText =
    pageState && pageState.videoId === videoId && pageState.messages.length > 0
      ? pageState.messages.join('|')
      : null;
  // Honest states only: we cannot see "the picture is playing" from here, so we claim nothing beyond
  // what was measured. The loading sentence is the line that was already on screen; `incarcat=`
  // below says the same thing as a token. Neither state triggers any ACTION: nothing in this
  // component opens a browser, and there is no timer left at all. A 24/7 livestream may legitimately
  // need a tap or a while.
  const loadingText = !pageLoaded ? t('live.playerLoading') : null;

  // The body is kept in a ref so a sender always posts the LATEST measurement, and the counter is
  // the hard ceiling of three per opening. Both only READ state: neither can change `source`, the
  // WebView or its lifetime.
  const reportPayloadRef = useRef<LivePlayerDiagnosticReport | null>(null);
  const reportCountRef = useRef(0);

  // The body of the report: the SAME expressions printed below - `pagina:`, `http:`, `eroare:`,
  // `ref=`, `video=`, `webview=`, `incarcat=` and `text=` come from one source each, on screen AND in
  // the database (the test suite pins that pairing so the two cannot drift apart).
  //
  // It is refreshed on EVERY render (hence no dependency array) and it is deliberately declared
  // BEFORE the sender and the state-change effect: within one commit effects run in order, so a
  // report caused by a state change carries the values of that very change, never the previous one.
  // Writing the ref here - inside an effect, never during render - is also what keeps the screen the
  // only thing that renders: the report is a side channel, it is not part of the output.
  useEffect(() => {
    if (!videoId) return;
    reportPayloadRef.current = {
      video_id: videoId,
      page_url: loadedUrlText ?? DIAGNOSTIC_PENDING,
      http_status: httpStatusText,
      error_text: errorText,
      referrer: referrerText ?? DIAGNOSTIC_PENDING,
      video_size: videoText ?? DIAGNOSTIC_PENDING,
      webview_size: webviewSizeText ?? DIAGNOSTIC_PENDING,
      loaded: pageLoaded,
      page_text: pageTextLine ?? DIAGNOSTIC_PENDING,
      // T4 (build 21): the two columns added BEFORE the build, so the verdict does not need a photo.
      requested_url: requestedUrlText,
      page_state: pageStateText,
      app_version: LIVE_DIAGNOSTIC_APP_VERSION,
      device: LIVE_DIAGNOSTIC_DEVICE,
      user_id: null,
    };
  });

  const sendLivePlayerDiagnostic = useCallback(() => {
    if (reportCountRef.current >= LIVE_DIAGNOSTIC_REPORT_LIMIT) return;
    const endpoint = livePlayerDiagnosticEndpoint();
    const payload = reportPayloadRef.current;
    if (!endpoint || !payload) return;
    // Counted BEFORE the request leaves, so a slow network can never let a fourth one through.
    reportCountRef.current += 1;
    void fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: endpoint.key,
        Authorization: `Bearer ${endpoint.key}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }, []);

  // The two scheduled reports. Keyed on `videoId` alone, so a re-render cannot restart the clock,
  // and every new opening starts with a fresh budget of three.
  useEffect(() => {
    reportCountRef.current = 0;
    if (!videoId) return;

    const timers = LIVE_DIAGNOSTIC_REPORT_DELAYS_MS.map((delay) =>
      setTimeout(sendLivePlayerDiagnostic, delay),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [videoId, sendLivePlayerDiagnostic]);

  // The third report: the state itself changing - the page reported as loaded, or an error arriving.
  // It may fire more than once and that is fine: the ceiling above stops everything at three.
  useEffect(() => {
    if (!videoId) return;
    const failed =
      (playerError !== null && playerError.videoId === videoId) ||
      (httpStatus !== null && httpStatus.videoId === videoId);
    if (!pageLoaded && !failed) return;
    sendLivePlayerDiagnostic();
  }, [videoId, pageLoaded, playerError, httpStatus, sendLivePlayerDiagnostic]);

  if (!videoId) return null;

  return (
    // iOS: the overlay is a full-screen modal region for VoiceOver, so the content of
    // the screen underneath is not announced while the player is open.
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.playerArea}>
        <WebView
          // THERE IS NO `key` HERE ON PURPOSE. A `key` that changes (as the old `videoId:mode` did)
          // unmounts this WebView and aborts the request already in flight; the player is mounted
          // once per videoId and nothing in this file may restart or replace that load.
          style={styles.webview}
          // The measured request: YouTube's own embed URL, with our `Referer` on it. One source,
          // always the same; there is no second variant to fall back to.
          //
          // ═══ BUILD 21 (T2): sursa are acum o ramură de PLATFORMĂ, într-o singură expresie ═══
          // iOS: pagina noastră servită de site-ul nostru, `uri` simplu, fără antete (deci nimic nu
          // mai poate goli documentul); Android: cererea YouTube de azi, cu `Referer`, neschimbată.
          // Există o SINGURĂ expresie de sursă în fișier, ca să nu existe o a doua cale de încărcare.
          source={embedSourceFor(videoId, Platform.OS)}
          // ═══ BUILD 21 (T2): sonda se injectează DOAR pe Android. Pe iOS documentul este al nostru,
          // iar `ref=`/`video=` ar raporta despre pagina noastră (care nu are `<video>` în documentul
          // părinte) — un diagnostic FALS care ar arăta „video=nu" chiar când streamul se vede, exact
          // în build-ul care trebuie să dea verdictul. Mesajele paginii rămân singura sursă pe iOS. ═══
          injectedJavaScript={Platform.OS === 'android' ? EMBED_REFERRER_PROBE : undefined}
          originWhitelist={['*']}
          allowsInlineMediaPlayback={true}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          // Build 20.1: the box the WebView ITSELF measured - the other half of what a black screen
          // asks, i.e. whether there was anywhere to draw. A 0x0 here is a finding, not a default.
          // It only MEASURES: nothing reacts to this number.
          onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => {
            const { width, height } = event.nativeEvent.layout;
            if (width > 0 || height > 0) {
              setWebviewSize({ videoId, text: `${Math.round(width)}x${Math.round(height)}` });
            }
          }}
          onLoad={() => setPageLoadedFor(videoId)}
          // Build 21 (T2): adresa cererii pe care WebView-ul a PORNIT-O. `onLoadEnd` scrie documentul
          // COMIS (deja `about:blank` când cererea a fost anulată, `RNCWebViewImpl.m:863-866`), deci
          // numai această linie poate arăta dacă cererea a plecat și CE s-a cerut.
          onLoadStart={(event: { nativeEvent: { url: string } }) => {
            const url = event.nativeEvent.url;
            if (url) setRequestedUrl({ videoId, text: url });
          }}
          // The address is taken from the load that ENDED, not from a script that ran before the
          // navigation. `onLoadEnd` fires for a finished load (success or failure), so this line can
          // never again read `about:blank`.
          onLoadEnd={(event: { nativeEvent: { url: string } }) => {
            const url = event.nativeEvent.url;
            if (url) setLoadedUrl({ videoId, text: url });
          }}
          onMessage={(event: { nativeEvent: { data: string } }) => {
            const data = event.nativeEvent.data;
            // Build 20.1: the probe sends one message per fact, so each fact gets its own line.
            if (!data) return;
            if (data.startsWith('ref=')) setReferrer({ videoId, text: data });
            else if (data.startsWith('video=')) setVideoInfo({ videoId, text: data });
            else if (data.startsWith('text=')) setPageText({ videoId, text: data });
            // Build 21: mesajele paginii NOASTRE. Se ACUMULEAZĂ, nu se suprascriu: streamul retrimite
            // `state(n)` la fiecare tick, iar `page-ready` — singura dovadă că documentul e al nostru —
            // trebuie să rămână primul în rând.
            else if (isEmbedPageMessage(data)) {
              setPageState((previous) => {
                const current = previous && previous.videoId === videoId ? previous.messages : [];
                if (current.includes(data) || current.length >= PAGE_STATE_MAX_ENTRIES) {
                  return previous && previous.videoId === videoId ? previous : { videoId, messages: current };
                }
                return { videoId, messages: [...current, data] };
              });
            }
          }}
          onError={(event: { nativeEvent: { description: string } }) => setPlayerError({
            videoId,
            text: `webview: ${event.nativeEvent.description}`,
          })}
          onHttpError={(event: { nativeEvent: { statusCode: number; url: string } }) => {
            // Build 20.1: the HTTP line keeps the code of the failed response, and the error line is
            // fed by `onError` ALONE, so the two can never repeat each other on screen.
            setHttpStatus({
              videoId,
              text: `${event.nativeEvent.statusCode}: ${event.nativeEvent.url}`,
            });
          }}
          accessibilityLabel={t('live.playerAccessibilityLabel')}
        />
      </View>
      <View style={styles.footer}>
        {/* The loading sentence that was already on screen, unchanged, and still shown only while the
            page has not loaded. `incarcat=nu` further down says the same thing as a token. */}
        {loadingText ? <Text style={styles.diagnostic}>{loadingText}</Text> : null}
        {/* ═══ BUILD 21: blocul tehnic a trecut în spatele țintei invizibile de 48x48 de mai jos. Este
            ACELAȘI bloc, cu aceleași linii, plus `cerut=` și mesajele paginii; NU se șterge (a fost
            singurul canal citibil în 20 de build-uri) — doar nu mai împinge playerul. ═══ */}
        {showDiagnostics ? (
          <>
        {/* pagina: the address of the load that ENDED (`onLoadEnd`). Unconditional on purpose -
            `...` means the load never ended, which is a measurement too, and it is not `about:blank`. */}
        <Text selectable style={styles.probe}>
          {`${t('live.playerPageOrigin')}: ${loadedUrlText ?? DIAGNOSTIC_PENDING}`}
        </Text>
        {/* cerut=: the url the WebView actually STARTED (`onLoadStart`, build 21). This is the line
            that was missing in every build up to 20: `pagina:` above shows the COMMITTED document,
            which is `about:blank` as soon as the request is cancelled. `null` here (the line stays
            `...`) means the event never arrived - a measurement, never a substitute. */}
        <Text selectable style={styles.probe}>{`cerut=${requestedUrlText ?? DIAGNOSTIC_PENDING}`}</Text>
        {/* http: the status code, only if the WebView reported a failed response. */}
        {httpStatusText ? (
          <Text selectable style={styles.probe}>{`${t('live.playerHttpLabel')}: ${httpStatusText}`}</Text>
        ) : null}
        {/* eroare: the WebView's own error text, only if it reported one. */}
        {errorText ? (
          <Text selectable style={[styles.diagnostic, styles.diagnosticError]}>
            {`${t('live.playerErrorLabel')}: ${errorText}`}
          </Text>
        ) : null}
        {/* The heading that was already on screen (`Semnal player`), kept unchanged as the title of
            the block below: the values it used to pack into one line are now one per line. */}
        <Text selectable style={styles.probe}>{`${t('live.playerSignalLabel')}:`}</Text>
        {/* Build 20.1, the decisive lines, one field per line, EXACTLY as the probe sent them:
            `ref=` is `document.referrer` as YouTube's own page sees it, `video=` is whether the
            player element exists and how big it is, `text=` is the visible text (with "Error 153"
            verbatim when YouTube refuses). `...` means that field has not been reported yet. */}
        <Text selectable style={styles.probe}>{referrerText ?? DIAGNOSTIC_PENDING}</Text>
        <Text selectable style={styles.probe}>{videoText ?? DIAGNOSTIC_PENDING}</Text>
        {/* webview=: the box this WebView measured itself (`onLayout`). */}
        <Text selectable style={styles.probe}>{`webview=${webviewSizeText ?? DIAGNOSTIC_PENDING}`}</Text>
        {/* incarcat=: from the events - `onLoad` fired means a page finished loading. Together with
            `pagina:` above (a load that ENDED, success or failure) this separates "still loading"
            from "ended in failure". */}
        <Text selectable style={styles.probe}>{`incarcat=${pageLoaded ? 'da' : 'nu'}`}</Text>
        <Text selectable style={styles.probe}>{pageTextLine ?? DIAGNOSTIC_PENDING}</Text>
        {/* Build 21: mesajele paginii NOASTRE, exact cum au sosit, deduplicate (`page-ready` primul).
            Ele sunt singura sursă pe iOS, unde sonda nu se injectează. */}
        <Text selectable style={styles.probe}>{`page=${pageStateText ?? DIAGNOSTIC_PENDING}`}</Text>
          </>
        ) : null}
        {/* Always visible, never inside a condition, and MANUAL - nothing opens it by itself, no
            timer and no "the picture did not start" guess: the player above is the main path and a
            24/7 livestream may need a tap or a few seconds of buffering first. This stays as a
            discreet way out if the embed is refused (region, age, "watch on YouTube only"), and it
            opens the IN-APP browser (`WebBrowser.openBrowserAsync`); the owner forbade
            `Linking.openURL`, which leaves the app. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('live.openOnYouTube')}
          onPress={() => {
            void WebBrowser.openBrowserAsync(buildYouTubeWatchUrl(videoId)).catch((error: unknown) => {
              // A failure to even open the in-app browser must not be silent either.
              setPlayerError({
                videoId,
                text: `browser: ${error instanceof Error ? error.message : String(error)}`,
              });
            });
          }}
          style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
        >
          <Text style={styles.openText}>{t('live.openOnYouTube')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('live.closePlayerAccessibilityLabel')}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>{t('live.closePlayer')}</Text>
        </Pressable>
        {/* Ținta invizibilă care arată blocul tehnic: 48x48 (piscul minim al proiectului: 48, nu 44 —
            vezi `youtube-embed.native.tsx:601` și `:607-608`), în colțul dreapta-jos, cu etichetă
            pentru cititoarele de ecran. Implicit: blocul este ascuns. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('live.playerDiagnosticsToggle')}
          onPress={() => setShowDiagnostics((visible) => !visible)}
          style={styles.diagnosticsToggle}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the whole screen of the live route (below its native header) and paints over
  // the screen content: same behaviour as the modal had, without the modal.
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000',
    zIndex: 10,
    elevation: 10,
  },
  playerArea: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  // `opacity: 0.99` is deliberate (owner's recipe): WKWebView inside a plain React Native view
  // can be composited as a black rectangle when the layer is fully opaque; a hair below 1 forces
  // the video layer to be composited and drawn. `flex: 1` (plus the black background the owner's
  // step 1 asks for) lets the player fill the whole area it is given instead of a fixed 16:9 slice.
  webview: { flex: 1, width: '100%', backgroundColor: '#000', opacity: 0.99 },
  footer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#000',
  },
  // Readable on the black overlay: both colours come from the brand palette and are far
  // above the WCAG AA floor against #000 (palette.sky ~15:1, palette.goldLight ~11:1).
  diagnostic: { color: palette.sky, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  diagnosticError: { color: palette.goldLight },
  // The raw measurements from the page (11 px, selectable so the owner can copy them).
  probe: { color: palette.sky, fontSize: 11, lineHeight: 16, textAlign: 'center', opacity: 0.8 },
  // Discreet, outlined, manual: the player is the main path, so this must not compete with it
  // (AGENTS.md rule 24 - one filled primary per screen, and here that is the player itself).
  // 48 px minimum: the accessibility audit (A4) requires 48dp, not Apple's 44pt floor.
  openButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.sky,
    borderRadius: 24,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openText: { color: palette.sky, fontSize: 13, fontWeight: '600' },
  // AGENTS.md rule 28: the way out of a full-screen view is a big, round target.
  closeButton: {
    backgroundColor: palette.blueSoft,
    borderRadius: 28,
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  // Build 21 (T2): ținta care arată blocul tehnic. Invizibilă deliberat (fără fundal, fără text — pe
  // ecran trebuie să se vadă playerul), dar o țintă REALĂ: 48x48, minimul impus de auditul de
  // accesibilitate al proiectului (48, nu 44), în colțul dreapta-jos al zonei de jos, cu
  // `accessibilityLabel` pentru cititoarele de ecran.
  diagnosticsToggle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 48,
    height: 48,
  },
  pressed: { opacity: 0.75 },
});
