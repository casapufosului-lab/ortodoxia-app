# Raport — build 12: LIVE (embed negru pe iOS) + PREMIUM (fereastra Apple nu apare)

Data: 10.10.2026 · Autor: Open Worker (`cod`) · Build TestFlight: **12**
Baseline: build 11 (`4d71c980-82d8-43ee-8a38-f4892e8f4287`) — conținea scoaterea playerului din
`<Modal>`, dar pe iPhone ecranul rămânea tot negru.

**Verdict: PASS cu o limită spusă clar** — codul ambelor reparații e în build-ul de pe TestFlight
(dovada: marcajele din `main.jsbundle`, §4), porțile ies 0, dar **dacă embed-ul YouTube mai e blocat
pe iOS nu se poate ști de aici**; de aceea build 12 are diagnoză pe ecran și buton permanent către
YouTube (ownerul vede slujba chiar dacă embed-ul e refuzat). Vezi §6.

---

## 1. Ce am făcut (fișiere + linii)

### A) LIVE — playerul negru pe iOS

**`src/live/youtube-embed.native.tsx`** (287 linii)

| Linii | Ce |
|---|---|
| 15–47 | Comentariul de cap: ce e **măsurat** în sursele instalate și ce e **ipoteză** (regula 19); „second round" la 17 |
| 59–72 | `INITIAL_PLAYER_PARAMS` (rundă 1): `iv_load_policy: 3` la 64, `modestbranding` la 71 (cu nota că YouTube l-a dezactivat pe 15.08.2023) |
| 79–89 | `PLAYER_URL_PREFIXES` — URL-urile permise pentru o navigare **de top-frame** |
| 103–105 | Stare de diagnoză: `playerError` (cu `videoId`), `loadedFor`, `readyFor` |
| 141–150 | `errorText` + textul de stare în **3 stări** distincte (eroare / „pagina s-a încărcat, imaginea nu a pornit" / „se încarcă") |
| 157–206 | `YoutubePlayer`: `onError` la **164** (biblioteca îl înghite implicit: `onError = _err => {}`), `onReady` la 161, `onFullScreenChange` la 160 |
| 171–205 | `webViewProps`: `allowsFullscreenVideo` 172, `allowsInlineMediaPlayback` 173, `mediaPlaybackRequiresUserAction: false` 174, `javaScriptEnabled: true` 175, `domStorageEnabled: true` 176, `originWhitelist: ['*']` 177, `baseUrl` 184, `onLoad` 185, `onError` (WebView) 186–189, **`onHttpError`** 190–193 |
| 199–202 | **`onShouldStartLoadWithRequest` propriu** — înlocuiește politica bibliotecii: sub-cadrele (`isTopFrame === false`) sunt mereu permise |
| 208–230 | Subsolul: linia de eroare **mică, sub player** (209–211) + butonul „Deschide pe YouTube" **necondiționat** (214–221) + butonul de închidere (222–229) |
| 217 | `Linking.openURL(buildYouTubeWatchUrl(videoId))` |

Cauza, așa cum reiese din sursele instalate (măsurat, nu presupus):

- `react-native-youtube-iframe/src/YoutubeIframe.js:228-253` instalează propriul
  `onShouldStartLoadWithRequest` (trimis ca prop la :286). Pe iOS orice URL
  `https://www.youtube.com/...` e tratat ca un link apăsat de om: `Linking.openURL(url)` +
  `return false` (:237-243) → navigarea e **anulată**.
- `react-native-webview/apple/RNCWebViewImpl.m:1343` rulează predicatul JS pentru **fiecare**
  navigare, inclusiv sub-cadre (filtru de top-frame există doar pentru `onLoadingStart`,
  :1352/:1387). Un `false` din JS anulează navigarea (:1346-1349).
- `webViewProps` e împrăștiat **după** props-urile bibliotecii (`YoutubeIframe.js:295` „props above
  this are override-able", :298) → funcția mea o înlocuiește.
- Bibliotecă chiar randează WebView-ul din `react-native-webview`
  (`src/WebView.native.js` îl re-exportă), deci fișierele de mai sus sunt cele implicate.
- Android: același cod mergea pentru că acolo hook-ul e `shouldOverrideUrlLoading`
  (`RNCWebViewClient.java:148`), pe care framework-ul îl cheamă pentru navigările de top-frame
  (măsurat în sursă; **nereverificat pe device** în runda asta).

**Ne-verificat pe device (ipoteză, spusă și în comentariul din cod):** că pe iOS `mainDocumentURL`
lipsește sau e egal cu URL-ul iframe-ului pentru încărcarea proprie
`https://www.youtube.com/embed/<id>`. Dacă pasul acesta e greșit, cauza e în altă parte — de aceea
build 12 scrie pe ecran fiecare eveniment de player/WebView și ține butonul către YouTube permanent
vizibil.

### B) PREMIUM — „Activează planul" nu arăta nimic

**`src/lib/revenuecat.ts`** (333 linii)

| Linii | Ce |
|---|---|
| 300–331 | `describePurchaseError()` nou: `code <cod> \| <mesaj> \| <underlyingErrorMessage>`. `isPurchaseCancelledError` (292) neatins |

**`src/hooks/use-revenuecat.ts`** (296 linii)

| Linii | Ce |
|---|---|
| 12 | import `describePurchaseError` |
| 208–211 | eșec la cumpărare: `premium.purchaseFailed` **+ codul și mesajul RevenueCat** (înainte: doar textul generic) |
| 242, 244 | eșec la restaurare: `premium.restoreFailed` **+ codul și mesajul** |

**`src/app/premium.tsx`** (346 linii)

| Linii | Ce |
|---|---|
| 39 | `purchaseResult` — starea ultimei acțiuni (există din runda precedentă) |
| 82–141 | Cardul „DIAGNOSTIC PREȚ (temporar)": citește cu `Purchases.getOfferings()` exact ce întoarce magazinul (offering curent, fiecare pachet, `product.priceString`, `currencyCode`, `subscriptionPeriod`) + `isRevenueCatConfigured()`, `priceFor('monthly'/'annual')`, limbă/regiune |
| 154–167 | `monthlyBlockedNotice` / `annualBlockedNotice`: **de ce** e mort butonul, cu text lângă el |
| 174–187 / 189–202 | `purchase()` și `handleRestore()` scriu **întotdeauna** rezultatul în `purchaseResult` |
| 225 | același rezultat, în cardul de status (sus) |
| 239 / 251 | motivul blocării, sub butonul planului respectiv |
| 255–262 | **rezultatul ultimei acțiuni randat lângă butoane** (înainte era doar sus, în afara ecranului — de aceea părea că nu se întâmplă nimic) |
| 291–304 | cardul de diagnoză arată `availabilityFor('monthly'/'annual')` și ultimul rezultat |
| 338–345 | stilurile cardului de diagnoză (11 px, monospace, selectabil) |

Reguli respectate: **nu** s-au inventat prețuri, **nu** s-a atins logica de detecție a ofertelor
(`availabilityFor`, `purchaseAvailability`, `isPurchasable`, `packageForPlan`, `priceFor`,
`showPurchaseButtons` — toate neatinse). Butonul rămâne activ doar cu preț real din magazin.

**`src/i18n/config.ts`** — 4 chei noi (`live.openOnYouTube`, `live.playerLoading`,
`live.playerErrorLabel`, `live.playerLoadedNoImage`) în **toate cele 10 locale**:
liniile 1096–1099 (ro), 1452–1455 (en), 2096–2099 (el), 2702–2705 (sr), 3279–3282 (bg),
3896–3899 (mk), 4513–4516 (uk), 5099–5102 (ka), 5664–5667 (ru), 6226–6229 (sq) — verificat cu
`npm run test:i18n` (PASS). Mesajele de eroare Premium refolosesc chei existente
(`premium.purchaseFailed`, `premium.restoreFailed`, `premium.storeUnavailable`,
`premium.statusChecking`), deci nu s-a adăugat vocabular nou acolo.

### Dovezi noi (teste)

- `tests/live-player-ios-fallback.test.mjs` (nou, 5 teste): politica de navigare e înlocuită,
  erorile ajung pe ecran, butonul YouTube e necondiționat, `Linking` e folosit o singură dată,
  comentariile sunt scoase înainte de potrivire (ele citează sursa bibliotecii).
- `tests/premium-purchase-feedback.test.mjs` (nou, 5 teste): eroarea de cumpărare/restaurare duce
  codul + mesajul, rezultatul e randat lângă butoane, butonul blocat își explică motivul, butonul
  rămâne legat de prețul din magazin, cardul de diagnoză raportează starea.

Ambele rulează în `npm test` (agregator): **10/10 pass**.

### Ce am verificat în build 11 (ca să nu mai căutăm în altă parte)

Din `.ipa`-ul build-ului 11: `main.jsbundle` **conține** o cheie RevenueCat de App Store (token
`appl_...`, 50 de caractere) → SDK-ul **era** configurat pe iOS. Deci tăcerea la „Activează planul"
nu venea de la cheie, ci din UI (buton blocat fără explicație / rezultat scris doar sus, în afara
ecranului). Și: `live.openOnYouTube` **lipsea** din bundle-ul 11 → butonul de fallback chiar nu
există în build-ul pe care l-a testat ownerul.

---

## 2. Porțile (ieșire reală)

| Poartă | Comandă | Rezultat |
|---|---|---|
| Typecheck app | `npx tsc --noEmit` | exit 0, fără ieșire |
| Typecheck edge | (`în verify`) `tsc --project tsconfig.edge.json` | exit 0 |
| i18n | `npm run test:i18n` | PASS |
| a11y | (`în verify`) `accessibility-audit.mjs` | PASS — „accessibility audit is clean across 70 source file(s)" |
| Teste | `npm run verify` | **964 pass, 0 fail** (954 existente + 10 noi) |
| Release | `npm run test:release` | 31 PASS / 0 FAIL / 2 DEFERRED |
| Lint | `npm run lint` | exit 0 |
| `verify` complet | `npm run verify` | exit 0, **CI GATE: PASSED** |

Loguri păstrate (folderul de lucru al agentului): `gate-verify-12b.txt`, `gate-lint-12.txt`,
`newtests.txt`.

Cele 2 DEFERRED sunt cunoscute și nu țin de build-ul acesta: variabila de App Store nu e în
`.env`-ul local (o dă profilul de producție — dovada e cheia `appl_` din `.ipa`) și calendarele
2027, care nu sunt încă publicate.

---

## 3. Build + submit (TestFlight)

| | Valoare |
|---|---|
| Build ID | `f326a364-3a99-424d-96b5-780aa123d79b` |
| Build number | **12** (app version 1.0.0) |
| Status build | **FINISHED** (fără eroare, cu artefact `.ipa`) |
| Comandă | `eas build --platform ios --profile production --non-interactive` (așteptat până la `finished`) |
| Artefact | `https://expo.dev/artifacts/eas/1R26H3_uDmF-E09rnfVYRdXpmyoFrRti9hpgG4IYz-E.ipa` |
| Loguri build | `https://expo.dev/accounts/ortodoxia/projects/ortodoxia/builds/f326a364-3a99-424d-96b5-780aa123d79b` |
| Submit ID | `db0b73dd-e37a-4856-a193-f0e758645b79` |
| Status submit | **FINISHED** — „Your binary has been successfully uploaded to App Store Connect!" |
| Comandă submit | `eas submit --platform ios --profile production --non-interactive --id f326a364-… --wait` (exit 0) |
| TestFlight | `https://appstoreconnect.apple.com/apps/6821265789/testflight/ios` (procesarea Apple durează 5–10 min) |

Mesajul build-ului: „fix LIVE (embed negru pe iOS: politica de navigare a playerului + erori vizibile
+ buton YouTube permanent) si PREMIUM (rezultatul cumpararii se vede pe ecran), build 12".

Notă: `eas submit` nu are `--json`, deci ID-ul de submit a fost citit din stdout (documentat în
`submit-ios-12.cmd`); statusurile au fost confirmate separat cu `eas submit:list --json`.

---

## 4. Dovada că fix-ul e chiar în build-ul urcat pe TestFlight

Am descărcat `.ipa`-ul build-ului 12 și am citit `Payload/Ortodoxia.app/main.jsbundle`
(5.875.248 bytes) — marcajele sunt șiruri literale, deci minimizarea nu le poate redenumi:

| Marcaj cerut | În bundle-ul 12 |
|---|---|
| `live.openOnYouTube` (butonul permanent) | FOUND |
| `live.playerErrorLabel` (linia de eroare mică) | FOUND |
| `live.playerLoadedNoImage` („s-a încărcat, imaginea nu a pornit") | FOUND |
| `live.playerLoading` | FOUND |
| `availabilityFor` (starea reală a magazinului, pe ecran) | FOUND |
| `describePurchaseError` (cod + mesaj RevenueCat) | FOUND |
| `underlyingErrorMessage` | FOUND |
| `onHttpError` (handler-ul din `webViewProps`) | FOUND |
| `domStorageEnabled` | FOUND |
| `iv_load_policy` | FOUND |

Sonde: `check-ipa12-markers.mjs`. (Pentru comparație, în build 11 `live.openOnYouTube` **lipsea** —
vezi §1 „Ce am verificat în build 11".)

---

## 5. Ce trebuie testat pe telefon (owner)

**LIVE** (Calendar → live → Trinitas):
1. Se vede imaginea **și** se aude sunetul.
2. Dacă nu se vede: sub player apare un text mic (`player: ...`, `webview: ...` sau
   `http <cod>: ...`) ori „Pagina playerului s-a încărcat, dar imaginea nu a pornit" — scrie-mi
   exact ce scrie.
3. Butonul **„Deschide pe YouTube"** e mereu acolo, sub player, și duce la slujbă.
4. Butonul de închidere și butonul hardware de back merg; la fullscreen se rotește în landscape.

**PREMIUM** (Cont/premium → „Activează planul"):
5. Apare fereastra Apple (Face ID). Dacă nu apare, pe ecran scrie motivul: sub buton („magazinul nu
   e disponibil" / „se verifică") ori ca rezultat al acțiunii, **cu codul și mesajul RevenueCat**.
6. Cardul „DIAGNOSTIC PREȚ (temporar)" (jos) arată ce întoarce magazinul: dacă `getOfferings`
   întoarce 0 pachete sau un pachet fără `priceString`, acolo se vede. Trimite-mi ce scrie.

---

## 6. Limite (ce NU pot demonstra de aici)

1. **Nu am un iPhone** — nu pot confirma că embed-ul pornește. Cauza din §1A e citită în sursele
   bibliotecilor, nu măsurată pe device; dacă pasul cu `mainDocumentURL` e greșit, textul de eroare
   de pe ecran ne spune în ce direcție să căutăm în runda următoare.
2. **`baseUrl: 'https://www.youtube.com'` e inert** (cerut explicit, dar măsurat ca inutil):
   biblioteca își construiește `source` **după** împrăștierea `webViewProps`
   (`YoutubeIframe.js:302`), deci documentul rămâne pagina ei găzduită. Nu am folosit
   `baseUrlOverride`, care ar înlocui chiar pagina ce servește scriptul playerului și ar strica
   embed-ul definitiv.
3. **Nu am putut verifica pe device nici Android** (neregres): acolo `onShouldStartLoadWithRequest`
   nu era cauza, iar schimbarea lasă sub-cadrele permise și pe Android.
4. **Nu am făcut commit** (nu a fost cerut). Modificările sunt în working tree: 5 fișiere sursă +
   2 teste noi; `git status --short` le arată.

---

## 7. Verdict

**PASS (cu limita 1 din §6).** Ambele reparații sunt în build-ul **12**, urcat pe TestFlight
(submit `db0b73dd…`, FINISHED); porțile ies 0 (964/964 teste, CI GATE PASSED); bundle-ul de pe
TestFlight conține toate marcajele cerute. Următorul pas e al ownerului: test pe iPhone (§5) și
trimiterea textului de eroare/diagnoză dacă embed-ul sau fereastra Apple nu apar.
