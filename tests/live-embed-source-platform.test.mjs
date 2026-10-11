/**
 * T2 (build 21): CE CERERE PLEACĂ, PE FIECARE PLATFORMĂ — pin-uit literal.
 *
 * `src/live/youtube-embed.native.tsx` este SINGURUL fișier al playerului pentru ambele platforme
 * (lângă el nu există nici `.ios.tsx`, nici `.android.tsx`, deci Metro le dă amândurora același cod).
 * Build 21 a adăugat o singură expresie de sursă, `source={embedSourceFor(videoId, Platform.OS)}`, iar
 * funcția are două ramuri:
 *
 *   iOS      -> pagina NOASTRĂ, `https://ortodoxia.web.app/live-embed?v=<id>`, `uri` simplu, FĂRĂ
 *               antete. Cauza măsurată în builds 1-20: cu antete, `NSMutableURLRequest`-ul pleacă, dar
 *               documentul rămâne `about:blank` și YouTube refuză (Error 153) — iar pe iOS documentul
 *               trebuie să fie al nostru ca WebKit să pună SINGUR referer-ul.
 *   Android  -> EXACT cererea care funcționează în build-ul din magazin: YouTube direct, cu `Referer`
 *               nostru. Rămâne literă cu literă; de aceea constantele Android NU au voie să dispară.
 *
 * Testul citește sursa ca text (fișierul are JSX, deci nu poate fi importat de `node --test`), taie
 * comentariile ca să nu poată fi păcălit de un text, și verifică ambele ramuri separat.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

const PLAYER = 'src/live/youtube-embed.native.tsx';
const native = readFileSync(PLAYER, 'utf8');
const code = native
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Corpul funcției pure, tăiat din sursă: de la declarație până la acolada care o închide. */
const embedSourceBody = (() => {
  const start = code.indexOf('export function embedSourceFor(');
  assert.ok(start > 0, 'funcția `embedSourceFor` lipsește din player');
  const end = code.indexOf('\n}', start);
  assert.ok(end > start, 'nu am găsit sfârșitul funcției `embedSourceFor`');
  return code.slice(start, end);
})();

describe('T2: o singură sursă, două ramuri, ambele pin-uite literal', () => {
  test('există EXACT o expresie de sursă și e funcția pură, cu platforma ca argument', () => {
    assert.equal((code.match(/source=\{/g) ?? []).length, 1, 'o singură sursă are voie să existe');
    assert.ok(
      code.includes('source={embedSourceFor(videoId, Platform.OS)}'),
      'WebView-ul trebuie să-și ia sursa din `embedSourceFor(videoId, Platform.OS)`',
    );
    assert.ok(
      code.includes("import { Platform,") || code.includes(', Platform,') || code.includes('Platform,') ,
      '`Platform` trebuie importat în player',
    );
    assert.match(code, /from 'react-native-webview';/, 'playerul e WebView-ul din bibliotecă');
  });

  test('funcția e pură și are exact două ramuri de întoarcere', () => {
    assert.match(embedSourceBody, /^export function embedSourceFor\(/, 'semnătura funcției');
    assert.match(embedSourceBody, /videoId: string,/, 'primul argument este id-ul streamului');
    assert.match(embedSourceBody, /platform: string,/, 'al doilea argument este platforma');
    assert.equal(
      (embedSourceBody.match(/return \{/g) ?? []).length,
      2,
      'exact două ramuri: iOS și Android (nici mai mult, nici mai puțin)',
    );
  });

  test('IOS: pagina NOASTRĂ, `uri` simplu, FĂRĂ antete (de asta nu mai poate documentul să se golească)', () => {
    const ios = "if (platform === 'ios') return { uri: buildEmbedPageUrl(videoId) };";
    assert.ok(embedSourceBody.includes(ios), 'ramura iOS trebuie să fie exact aceasta');
    assert.ok(!embedSourceBody.includes("platform === 'ios') return { uri: buildEmbedRequestUrl"),
      'iOS nu are voie să ceară YouTube direct (asta era calea care dădea about:blank)');
    // Adresa paginii noastre: baza + calea + id-ul ca parametru.
    assert.ok(code.includes("const EMBED_DOCUMENT_BASE_URL = 'https://ortodoxia.web.app';"));
    assert.ok(code.includes('function buildEmbedPageUrl('), 'lipsește construirea adresei paginii noastre');
    assert.match(code, /const EMBED_PAGE_PATH = '[^']+';/, 'lipsește calea paginii noastre de embed');
    assert.match(code, /\?v=\$\{encodeURIComponent\(videoId\)\}/, 'id-ul trebuie trimis ca parametru `v=');
  });

  test('ANDROID: exact cererea din magazin (YouTube + Referer), cu constantele ei intacte', () => {
    const android = "return { uri: buildEmbedRequestUrl(videoId), headers: { Referer: EMBED_REFERER } };";
    assert.ok(embedSourceBody.includes(android), 'ramura Android trebuie să fie exact aceasta');
    // Constantele Android nu au voie să fie șterse „pentru că iOS nu le mai folosește".
    assert.ok(code.includes("const YOUTUBE_EMBED_BASE_URL = 'https://www.youtube.com';"));
    assert.ok(code.includes('const EMBED_REFERER = `${EMBED_DOCUMENT_BASE_URL}/`;'));
    assert.ok(code.includes('function buildEmbedRequestUrl('), 'lipsește cererea Android');
    assert.ok(code.includes('/embed/'), 'cererea Android trebuie să meargă la endpointul de embed');
    assert.ok(code.includes('EMBED_PLAYER_PARAMS'), 'parametrii playerului lipsesc');
  });

  test('SONDA de diagnostic se injectează DOAR pe Android', () => {
    assert.ok(
      code.includes("injectedJavaScript={Platform.OS === 'android' ? EMBED_REFERRER_PROBE : undefined}"),
      'sonda trebuie să fie condiționată de platformă',
    );
    assert.ok(code.includes('const EMBED_REFERRER_PROBE = `(function () {'), 'sonda însăși a dispărut');
    // Pe iOS documentul e al nostru: o sondă injectată acolo ar raporta despre pagina NOASTRĂ
    // (`video=nu`, referer gol) în timp ce streamul se vede — o măsurătoare a documentului greșit.
    assert.ok(
      !code.includes('injectedJavaScript={EMBED_REFERRER_PROBE}'),
      'sonda nu are voie să fie injectată necondiționat',
    );
    // `onLoadStart` rămâne (build 21): el dă `cerut=`, singurul marker care separă buildul 21.
    assert.ok(code.includes('onLoadStart='), 'lipsește `onLoadStart` (măsurătoarea `cerut=`)');
  });

  test('nu există un al doilea fișier de player: același cod ajunge la ambele platforme', () => {
    for (const sibling of [
      'src/live/youtube-embed.ios.tsx',
      'src/live/youtube-embed.android.tsx',
    ]) {
      assert.equal(
        existsSync(sibling),
        false,
        `${sibling} ar însemna două surse de adevăr, iar ramura de aici ar deveni cod mort`,
      );
    }
  });
});
