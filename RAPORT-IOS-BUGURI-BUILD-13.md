# Raport — build 13: LIVE pe iOS (playerul nu pornea) — WebView direct, fără librăria de iframe

Data: 10.10.2026 · Proiect: Ortodoxia (`ro.ortodoxia.app`) · buildNumber **13** · version 1.0.0

Verdict: **PASS** pe tot ce se poate verifica aici (cod, porți, build semnat, bundle expediat, submit).
Verificarea pe iPhone rămâne la tine (§6) — nu am iPhone/emulator iOS în sesiunea asta.

---

## 1. Ce am schimbat (fișiere + linii)

### `src/live/youtube-embed.native.tsx` — rescris (293 linii)
Librăria `react-native-youtube-iframe` a fost **scoasă din player** (nu mai e importată nicăieri în `src/`;
singurele apariții rămase în `src` sunt în comentariul de istoric). Ce e acum:

| Linii | Ce |
|---|---|
| 1–52 | istoricul: de ce build 11 și 12 au fost negre (cu dovada măsurată), ce e nou, ce e încă nedovedit |
| 66 | `EMBED_DOCUMENT_BASE_URL = 'https://www.youtube.com'` |
| 68–76 | `EMBED_PLAYER_PARAMS` — `playsinline=1&autoplay=1&mute=1&rel=0&modestbranding=1&iv_load_policy=3&origin=https://www.youtube.com` |
| 79–108 | `buildEmbedDocument(videoId)` — documentul propriu, cu iframe-ul (linia 92) și scriptul de diagnostic (99 `iframe:incarcat`, 100 `iframe:eroare`, 104 `iframe:marime WxH / ecran WxH`) |
| 117 | `export function YouTubeEmbed({ videoId, onClose })` |
| 123–125 | stările de diagnostic: `playerError` / `pageLoadedFor` / `probe` (fiecare ține minte și `videoId`, ca eroarea unui post să nu rămână pe următorul) |
| 127–138 | `handleBack` + `BackHandler` (păstrate din build 11) |
| 140–148 | la închidere blochează PORTRAIT (păstrat) |
| 159–165 | `statusText`: eroare → „eroare: …", altfel „se încarcă", altfel „pagina s-a încărcat dar imaginea nu a pornit" (doar dacă iframe-ul chiar n-a terminat de încărcat) |
| 172–207 | **un singur `<WebView>`**: `source={{ html: buildEmbedDocument(videoId), baseUrl: EMBED_DOCUMENT_BASE_URL }}` (174), `originWhitelist={['*']}` (175), `allowsInlineMediaPlayback` (176), `allowsFullscreenVideo`, `mediaPlaybackRequiresUserAction={false}`, `javaScriptEnabled`, `domStorageEnabled`, `onMessage` (182), `onError`, `onHttpError` (202) |
| 209–233 | subsolul playerului: statusul mic (210–212), măsurătorile selectabile (213), butonul „Deschide pe YouTube" (217–224, `Linking.openURL(buildYouTubeWatchUrl(videoId))` la 220) și butonul de închidere (225–232) |

Butonul „Deschide pe YouTube" rămâne **permanent, necondiționat** — dar e fallback, playerul din aplicație e calea principală.

### `tests/live-player-ios-fallback.test.mjs` — rescris (6 teste)
Testele vechi fixau metoda build-ului 12 (override pe politica librăriei), care s-a dovedit insuficientă.
Acum fixează: WebView direct și absența librăriei; documentul construit local + `baseUrl`/`origin`; `mute=1` +
`playsinline=1` + steagurile WebView; diagnosticile (inclusiv `onMessage`); **butonul de fallback nu e sub
nicio condiție**; comentariul care desparte măsuratul de ipoteză.

### `tests/live-services-c.test.mjs` — testele 12 și „Native embed…" actualizate (nu șterse)
Testul „no autoplay in native player" cerea librăria; acum cere `mute=1`, interzice `mute=0` și păstrează
interdicția de autoplay cu sunet. Testul de embed cere `react-native-webview`, `/embed/`, `playsinline=1`,
`allowsFullscreenVideo`, `baseUrl`. Am adăugat `eCode` (fișierul fără comentarii) la ~linia 22, ca
aserțiunile să nu prindă textul din comentarii.

## 2. `mute=1` e intenționat, `playsinline=1` rămâne

iOS nu permite autoplay cu sunet: playerul pornește **mut** și omul dă unmute cu un tap pe player.
`playsinline=1` rămâne, altfel iOS aruncă video-ul în playerul nativ fullscreen în loc să-l țină în
overlay-ul aplicației. Ambele sunt scrise în capul fișierului, ca să nu le „repare" nimeni mai târziu.

## 3. Ce am verificat (dovezi reale)

| Poartă | Comandă | Rezultat |
|---|---|---|
| typecheck | `npx tsc --noEmit` | **exit 0**, fără nicio linie de output (`gate-tsc-13.txt`) |
| porți complete | `npm run verify` | **exit 0**; `tests 965 / pass 965 / fail 0`; i18n OK; a11y „clean across 70 source file(s)"; release readiness `passed: 31 failed: 0 deferred: 2`; **CI GATE: PASSED** (`gate-verify-13.txt`) |
| lint | `npm run lint` | **exit 0** (`gate-lint-13.txt`) |
| testele atinse, rulate separat | `node --test …` | **38 teste, 38 pass, 0 fail** |

### Dovada că fix-ul e în ce s-a urcat (nu doar în cod)
`.ipa`-ul de build 13 descărcat și deschis: `Payload/Ortodoxia.app/main.jsbundle`, **5.848.833 bytes**.

Conține (FOUND): `iframe:incarcat`, `iframe:marime`, `mute=1`, `playsinline=1`, `https://www.youtube.com/embed/`,
`allowfullscreen`, `live.openOnYouTube`, `live.playerErrorLabel`, `live.playerLoadedNoImage`, `live.playerLoading`,
`describePurchaseError`.

Nu mai conține (ABSENT) internalele librăriei scoase: `playerQualityChange`, `getAvailablePlaybackRates`,
`HTML5_error` ⇒ librăria chiar a ieșit din bundle, nu doar din cod.

## 4. Build + submit

- **Build semnat de producție:** id `bb0f0751-4a41-4c8d-a3d0-33495168d4ae`, **buildNumber 13**, version 1.0.0,
  profil `production`, status **FINISHED**, `completedAt 2026-10-10T13:29:15Z`, cu `buildUrl` /
  `xcodeBuildLogsUrl` / `applicationArchiveUrl`.
- **Submit TestFlight:** id `fb0bfd17-9848-4ecb-b929-8fd59d11117e`, status **FINISHED** (13:30:00Z).
  CLI-ul a scris negru pe alb: „Submitted your app to Apple App Store Connect!" și
  „Your binary has been successfully uploaded to App Store Connect!" (ASC App ID 6821265789, API Key
  7Q8HDTYAVJ, local).
  Linia „No complete App Store Connect credentials, skipping TestFlight setup" apare și acum — este despre
  pasul automat de configurare TestFlight din EAS, **nu** despre upload; uploadul e confirmat de cele două
  mesaje de mai sus și de înregistrarea FINISHED. (Firma rămasă deschisă de la build 12 e închisă astfel.)

## 5. Ce răspunde YouTube pentru streamul ăsta — și ce NU pot dovedi

Ai cerut explicit: dacă embed-ul chiar nu poate porni pe iOS, spune-o cu dovadă. Am întrebat YouTube de trei ori,
de pe calculator (nu de pe telefon):

1. `oembed` pentru `gBveUPzZkuU` → **HTTP 200**, titlu „🔴 TRINITAS TV LIVE", cu iframe de embed în răspuns
   ⇒ canalul **permite** embed-ul.
2. pagina `/embed/gBveUPzZkuU` (User-Agent de iPhone Safari) → **HTTP 200**, 147.598 caractere, shell de player,
   fără niciun refuz în HTML.
3. endpointul `youtubei/v1/player` cu clientul `WEB_EMBEDDED_PLAYER` → `status: ERROR`,
   `errorCode: PLAYABILITY_ERROR_CODE_EMBEDDER_IDENTITY_DENIED`, „Videoclipul nu este disponibil",
   sub-motiv „Cod de eroare: 152 - 18".
   **Dar** exact același apel, cu aceleași antete, refuză identic un clip de control („Me at the zoo",
   `jNQXAC9IVRw`) și răspunde „Pagina trebuie reîncărcată" pentru clientul obișnuit WEB ⇒ e refuzul general al
   clienților neautentificați/neattestați, **nu** o dovadă despre acest stream.

**Concluzie cinstită: nu am nicio dovadă că YouTube blochează embed-ul acestui stream.** Nu pot vedea din afara
telefonului ce primește WKWebView. De aceea build 13 scrie pe ecran ce a măsurat, ca să știm sigur:
- dacă apare rândul „`iframe:incarcat | iframe:marime 390x219 / ecran 390x844`" **și** imaginea rămâne neagră →
  blocajul e la YouTube pentru streamul ăsta, și îl spun atunci cu cifrele de pe ecran, nu din presupuneri;
- dacă rândul nu apare deloc, sau dimensiunea e `0x0`, sau apare `iframe:eroare` → e WebView-ul, nu YouTube.

## 6. Ce trebuie să testezi tu (build 13, pe iPhone)

1. LIVE → Trinitas: imaginea trebuie să pornească **mută**; dă tap pe player și dă unmute.
2. Sub player: textul mic (încărcare / eroare / măsurători) și butonul „Deschide pe YouTube" — mereu vizibile.
3. Închidere: butonul rotund și butonul fizic de back (Android) închid playerul; după închidere revine portretul.
4. PREMIUM → „Activează planul": fereastra Apple (Face ID) sau, dacă pică, codul + mesajul RevenueCat pe ecran.
5. Dacă pe iOS imaginea tot nu pornește: trimite-mi exact rândul mic de sub player (e selectabil, îl poți copia).
   Din el știu dacă e YouTube sau WKWebView.

## 7. Ce a rămas / limite

- Nu mai există `onFullScreenChange` (react-native-webview nu are așa ceva) ⇒ aplicația nu mai forțează
  LANDSCAPE la fullscreen; sistemul gestionează, portretul revine la închidere. Schimbare scrisă în capul fișierului.
- `react-native-youtube-iframe@^2.4.1` e **încă în `package.json`**, dar nu-l mai importă nimeni. Nu l-am scos
  ca să nu ating lockfile-ul chiar înainte de build — spune și îl scot (e o comandă, urmată de porți).
- Nu am făcut commit (nu a fost cerut).
