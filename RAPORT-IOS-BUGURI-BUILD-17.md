# Raport — playerul LIVE pe iOS, build 17

Data: 10.10.2026 · Build: **17** (`8411f799-8c77-4609-9917-cb60be3b6921`) · Submit TestFlight: `2a60d163-e632-4523-a524-2dcd0e71d50a`
Verdict: **PARTIAL-17** — cod + porți + build + submit gata cu dovezi; **verificarea pe iPhone rămâne la owner**.

---

## 1. Ce a raportat ownerul (dovadă externă, Chrome real headless)

| URL deschis direct | Rezultat |
|---|---|
| `https://www.youtube.com/embed/gBveUPzZkuU` (Trinitas LIVE) | **ERROR 153** |
| `https://www.youtube.com/embed/aqz-KE-bpKQ` (video de control) | **ERROR 153** |
| `https://www.youtube.com/embed/jNQXAC9IVRw` (video de control) | **ERROR 153** |

Concluzia ownerului: 153 **nu** vine de la streamul Trinitas (videoclipurile de control, sigur incorporabile, dau aceeași eroare), ci din **lipsa unui Referer/origin public valid** — exact ce se întâmplă când pagina gazdă e `about:blank` sau localhost. În WebView-ul de pe iOS pagina playerului rula fără origin public → iframe-ul pleca fără Referer → 153 → ecran negru.

## 2. Defect real găsit în build 15 (măsurat, nu presupus)

Build 15 a fost reparat pentru origin, dar a rămas cu **un al doilea defect, ascuns în aceeași constantă**: URL-ul sub-iframe-ului era construit din **aceeași** constantă ca documentul, deci după ce build 15 a mutat constanta pe domeniul nostru, iframe-ul cerea **nouă** `https://ortodoxia.web.app/embed/<id>` → **404**, nu YouTube.

Dovada: proba `probe-iframe-host-17.mjs` (scratch) a arătat că gazda iframe-ului era domeniul nostru, iar `/embed/` pe site-ul nostru nu există. Deci build 15 avea **două** motive de ecran negru: origin lipsă (153) **și** iframe care nu ajungea la YouTube.

**Reparația (build 17): cele două constante sunt separate.**
- `EMBED_DOCUMENT_BASE_URL = 'https://ortodoxia.web.app'` — documentul (adică `baseUrl`, Referer, `origin=`). `src/live/youtube-embed.native.tsx:105`
- `YOUTUBE_EMBED_BASE_URL = 'https://www.youtube.com'` — gazda care servește efectiv embed-ul. `src/live/youtube-embed.native.tsx:113`
- `const embedUrl = \`${YOUTUBE_EMBED_BASE_URL}/embed/${...}?${EMBED_PLAYER_PARAMS}\`` — `src/live/youtube-embed.native.tsx:127` (în `buildEmbedDocument()`, linia 126)

## 3. Cele 4 lucruri cerute, în cod

| # | Cerință | Unde e în cod |
|---|---|---|
| 1 | `baseUrl` = domeniul public real | `source={{ html: buildEmbedDocument(videoId), baseUrl: EMBED_DOCUMENT_BASE_URL }}` — `src/live/youtube-embed.native.tsx:240` |
| 2 | `origin=` identic cu `baseUrl` în URL-ul iframe-ului | `` `origin=${EMBED_DOCUMENT_BASE_URL}` `` în `EMBED_PLAYER_PARAMS` — `:122`; parametrii: `playsinline=1` `:116`, `rel=0`, `modestbranding=1`, `iv_load_policy=3` |
| 3 | Fără comutare automată; butonul manual = browser ÎN aplicație | `void WebBrowser.openBrowserAsync(buildYouTubeWatchUrl(videoId))` — `:305`; import `* as WebBrowser from 'expo-web-browser'` — `:90`. **`Linking` nu mai există în cod** (4 apariții, toate în comentarii: liniile 14, 48, 65, 300) |
| 4 | 1 rând mic sub player cu `location.href` + orice eroare | scriptul paginii trimite `pagina:href` (`:155`) și `pagina:eroare`; starea `pageHref` (`:258-259`); rândul `{t('live.playerPageOrigin')}: {pageHrefText}` — `:293`. Cheia de traducere nouă `live.playerPageOrigin` există în **toate 10 limbile** |

Alte repere în același fișier: `style={[styles.webview, { height: playerHeight, opacity: 0.99 }]}` (`:239`, rețeta ownerului pentru WKWebView), `allowsInlineMediaPlayback={true}` (`:242`), `mediaPlaybackRequiresUserAction={false}`, `allowsFullscreenVideo`, `originWhitelist`, plus în HTML `referrerpolicy="origin"` și `allowfullscreen`. Fișierul are **392 de linii**.

Sunet: **fără** `mute=1` și **fără** `autoplay=1` (ownerul vrea sunet) — `playsinline=1` a rămas.

## 4. Porți (rulate de mine, cu ieșire reală)

| Poartă | Comandă | Rezultat |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit=0** (`gate-tsc-17.txt`, `gate-tsc-17b.txt`) |
| i18n | `node scripts\validate-i18n-corpus.mjs` | **PASS** — „canonical rank and location keys exist in all 10 locales" (`gate-i18n-17.txt`) |
| Teste concentrate | `node --test tests\live-player-ios-fallback.test.mjs tests\live-services-c.test.mjs tests\ui-low-22.test.mjs` | **34/34 pass** (`newtests-17b.txt`) |
| Poarta completă | `npm run verify` | **exit=0**, 1187 linii, `tests 974 / pass 974 / fail 0`, `passed: 31 failed: 0 deferred: 2`, **CI GATE: PASSED** (`gate-verify-17.txt`) |
| Lint | `npm run lint` | **exit=0** (`gate-lint-17.txt`) |

Testele care pinuiesc reparatiile de la build 17 (în `tests/live-player-ios-fallback.test.mjs`, fișier nou, netracked):
- `build 15/17: our origin is the DOCUMENT, YouTube is the EMBED (the 153 fix + the 404 fix)`
- `build 17: nothing opens a browser by itself - one in-app call, in the manual button`
- `build 15/17: the YouTube way out is unconditional and manual, and stays in the app`
- `build 15: sound on (no muted autoplay), inline playback forced on iOS`
- `build 15: native player never fails silently`

Diferențe în working tree: `src/live/youtube-embed.native.tsx` 374 schimbări, `src/i18n/config.ts` **60 inserări / 0 ștergeri** (doar adăugare), `tests/live-services-c.test.mjs` 55, `docs/LIVE_SERVICES_STATUS.md` 83.

## 5. Build + submit (non-interactiv, producție, semnat)

| | Valoare |
|---|---|
| Build ID | `8411f799-8c77-4609-9917-cb60be3b6921` |
| buildNumber | **17** (versiune 1.0.0, profil `production`, `STORE`, SDK 57) |
| Status | **FINISHED**, `error: null` |
| Creat / terminat | `2026-10-10T14:24:57Z` → `2026-10-10T14:31:18Z` |
| Commit | `1d9a41ad86089830db65b2e29cda72155f251704` |
| `.ipa` | `https://expo.dev/artifacts/eas/-CE6fZtITs0ber-197EWytkpAe1pIsZObe-n2ehbV8s.ipa` |
| Submit ID | `2a60d163-e632-4523-a524-2dcd0e71d50a` |
| Submit | **FINISHED**, „Your binary has been successfully uploaded to App Store Connect!" (`2026-10-10T14:31:32Z` → `14:31:44Z`) |
| Recorduri | `build-17-record.json`, `submit-17-record.json` (scratch) |

Build 16 (`a0ab06fa-…`, alt agent) e FINISHED; ownerul trebuie să testeze **build-ul 17** în TestFlight (cel mai mare buildNumber).

## 6. Verificarea bundle-ului livrat (`main.jsbundle` = Hermes bytecode `c61fbc03c103191f`)

Nu se pot căuta numere/comentarii, doar literalii string. 24 de verificări, **0 probleme** (`ipa17-markers.txt`):

Prezente: `ortodoxia.web.app`, `https://www.youtube.com`, `/embed/`, `origin=`, `playsinline=1`, `referrerpolicy`, allow-ul complet, `allowfullscreen`, `rel=0`, `modestbranding=1`, `iv_load_policy=3`, `iframe:incarcat`, `iframe:eroare`, `iframe:marime`, **`pagina:href`**, **`pagina:eroare`**, `live.playerPageOrigin`, `youtube.com/watch?v=`.
Absente: `mute=1`, `autoplay=1`, `react-native-youtube-iframe`, `playerQualityChange`, `getAvailablePlaybackRates`, `HTML5_error`.

## 7. Ce trebuie privit pe iPhone (cheia de diagnostic)

Sub player, un rând mic:
- `live.playerPageOrigin: https://ortodoxia.web.app/` ⇒ documentul rulează pe origin-ul public (reparația a intrat).
- `iframe:incarcat` ⇒ pagina de embed s-a încărcat; dacă imaginea tot nu pornește, vina e la YouTube.
- **`ERROR 153` vizibil** ⇒ origin-ul tot nu ajunge la YouTube.
- rândul lipsește / `iframe:eroare` ⇒ vina e în WebView (WKWebView a refuzat pagina).

## 8. Ce NU am putut verifica (spus direct)

1. **Nu am putut reproduce 153 local** — pe calculatorul ăsta nu există Playwright/browser real (`browser_open_url` e indisponibil). Dovada pentru 153 vine de la owner (Safari pe iPhone) și de la Chrome headless al DSH; eu am putut doar să confirm în cod și în bundle că reparatiile sunt în binarul livrat.
2. **Nu am putut verifica pe iPhone** — verificarea pe device e a ownerului; de asta verdictul e PARTIAL, nu PASS.
3. `react-native-webview` instalat **13.13.5**, Expo SDK 57 așteaptă **13.16.1** (~19 pachete în urmă). **Nu l-am schimbat** — ownerul a cerut să fie întrebat înainte.
4. S-a pierdut `onFullScreenChange` de la vechea librărie ⇒ aplicația nu mai forțează landscape pe fullscreen. Nu afectează 153.
5. `react-native-youtube-iframe@^2.4.1` a rămas în `package.json`, nefolosit (nu se importă nicăieni în `src/`). Nu l-am scos fără acord.
6. Pe parcurs am introdus eu o eroare: scriptul de i18n a duplicat blocurile de limbă. Am reparat-o imediat și am verificat cu `git diff`: **60 inserări, 0 ștergeri**.

## 9. Dacă 153 tot apare pe build 17

Pasul 2 din instrucțiunea ownerului, o singură schimbare minimă: încărcarea embed-ului **direct**, nu prin HTML propriu —
`source={{ uri: \`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&origin=https://ortodoxia.web.app\`, headers: { Referer: 'https://ortodoxia.web.app/' } }}` — care trimite Referer explicit, indiferent de origin-ul documentului. Nu se aplică până nu văd rezultatul de pe telefon.

## 10. Verdict

**PARTIAL-17.** Cele 4 lucruri cerute sunt în cod și în bundle-ul livrat (dovadă: 24 markeri, 0 probleme), porțile sunt verzi (974/974 teste, CI GATE PASSED, lint 0), build 17 e FINISHED și e în TestFlight (submit FINISHED). Rămâne **o singură verificare, pe iPhone** — nu declar „merge" fără ea. Nu am făcut commit (nu a fost cerut).
