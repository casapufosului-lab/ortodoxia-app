# Raport — build 15: LIVE pe iOS (playerul nu porneste) — cauza masurata (ERROR 153) si reparatia

Data: 10.10.2026 · App: Ortodoxia (`ro.ortodoxia.app`) · Build: 15 (TestFlight) · Ownerul a testat pe iPhone.

---

## 1. Cauza, spusa de owner si verificata de mine

Ownerul, in Safari pe iPhone: `https://www.youtube.com/embed/gBveUPzZkuU` →
**"VIDEO PLAYER CONFIGURATION ERROR — ERROR 153"**. Eroarea 153 = YouTube refuza embed-ul pentru ca
documentul care il incadreaza nu are un `Referer`/origin valid. **Build 13 a trimis exact ce trebuie
sa nu trimita:** `baseUrl: 'https://www.youtube.com'` + `origin=https://www.youtube.com` — adica
aplicatia se prezenta drept YouTube care isi incadreaza propriul video.

Ce am verificat eu, independent (cinstit, cu limitele la vedere):

| Verificare | Rezultat |
|---|---|
| `https://ortodoxia.web.app/privacy` (domeniul nostru real, folosit de `eas.json` si de `.env` pentru Privacy/Terms) | **HTTP 200**, 3525 bytes, titlu "Politica de confidentialitate — Ortodoxia" |
| `GET /embed/gBveUPzZkuU?...&origin=https://ortodoxia.web.app` fara `Referer` / cu `Referer: ortodoxia.web.app/` / cu `Referer: youtube.com/` (sonde `probe-referer-15.mjs`) | toate **HTTP 200**; pagina intorsa e doar shell-ul playerului, fara `playabilityStatus`/`playInitialResponse` → **sondele HTTP nu pot confirma sau infirma 153**, pentru ca eroarea o decide JS-ul playerului in browser |
| Reproducere locala in browser (Playwright) | **nu am putut**: Playwright nu e instalat in acest mediu (`No module named 'playwright'`). Nu am instalat nimic fara acordul ownerului |
| Cauza 153 = problema de referrer/securitate (corroborare exterioara) | articol tehnic (izoate.com, 25.09.2025) si doua intrebari StackOverflow descriu 153 ca `configuration mismatch` legat de **referrer si politici de securitate**; StackOverflow nu s-a putut deschide (403 din acest mediu) |

**Concluzie onesta:** dovada directa a cauzei este observatia ownerului (Safari, mesajul 153), iar
reparatia ceruta de el — un origin real, al nostru, identic in `baseUrl` si in `origin=` — este ce am
livrat. Nu am putut reproduce local 153 ca sa-l si inchid local; verificarea finala e pe telefon.

---

## 2. Ce am schimbat (fisiere + linii)

### `src/live/youtube-embed.native.tsx` (335 linii)

| Ce | Linii |
|---|---|
| Comentariul de istorie: cauza 153, de ce `youtube.com` ca origin era o fundatura | 21–56 (cauza la **26**) |
| **`EMBED_DOCUMENT_BASE_URL` = `https://ortodoxia.web.app`** (era `https://www.youtube.com`) — acelasi sir da si `baseUrl`, si `origin=` | **90** |
| Parametrii embed: `playsinline=1`, `rel=0`, `modestbranding=1`, `iv_load_policy=3`, `origin=$...`; **fara `mute=1` si fara `autoplay=1`** (ownerul vrea sunet) | **92–100** |
| `<html style="height:100%">`, `html { height:100% }`, `body { height:100% }`, iframe `position:absolute; inset:0; width:100%; height:100%` | **107**, 110–115 |
| iframe cu **`referrerpolicy="origin"`** (trimitem referer-ul intentionat, nu pe incredere) + `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"` + `allowfullscreen` | **119** |
| Singurul timer din fisier: o **masuratoare** de marime la 3 s, in pagina; nu comuta si nu deschide nimic | **129–132** |
| `source={{ html, baseUrl: EMBED_DOCUMENT_BASE_URL }}` la **208** + **`style={[styles.webview, { height: playerHeight, opacity: 0.99 }]}`** la **207** (opacity < 1: stratul WKWebView complet opac poate rămâne negru) | 206–208 |
| `originWhitelist={['*']}` (209), `allowsInlineMediaPlayback={true}` explicit (210), `allowsFullscreenVideo` (211), `mediaPlaybackRequiresUserAction={false}` (212), `javaScriptEnabled` (213), `domStorageEnabled` (214) | 209–214 |
| `onMessage` (216–231), `onError` (232–235), `onHttpError` (236–239) → text mic sub player | 216–239 |
| Stare onesta: eroare, "se incarca", iframe neincarcat, **si `iframe:marime 0x0`** (masurat) → `live.playerLoadedNoImage`. Niciuna nu declanseaza vreo actiune | **190–201** |
| Buton „Deschide pe YouTube" — **manual**, discret (contur, `palette.sky`, 48dp), singurul `Linking.openURL` din fisier | **255**, stil **311–320** |

### Teste actualizate (structural, pin-uri, nu sterse)

- `tests/live-player-ios-fallback.test.mjs` — rescris pentru build 15; test nou
  **„nothing switches to a browser by itself"** (fara `openBrowserAsync`/`WebBrowser`/`expo-web-browser`,
  fara `6000`, exact **un** `Linking.openURL`, exact **un** `setTimeout` si acela in pagina, doar masoara),
  test nou **„the embed declares a real third-party origin (the 153 fix)"** (origin real, `referrerpolicy="origin"`,
  `html`/`body` 100%, `opacity: 0.99`), plus pin ca `mute=1`/`autoplay=1` nu au voie sa reapara.
- `tests/live-services-c.test.mjs` — testul 12 devine „sunet pornit, playerul nu porneste singur cu sunet";
  testul de embed nativ primeste `allowsInlineMediaPlayback={true}`, `html style="height:100%"`,
  `mediaPlaybackRequiresUserAction={false}` si interdictia `openBrowserAsync`/`WebBrowser`.
- `docs/LIVE_SERVICES_STATUS.md` — linia 287 (rolul playerului) noteaza build 15 si de ce origin-ul e al nostru.

---

## 3. Ce NU am facut (si de ce)

- **Nu exista si nu am adaugat nicio comutare automata pe browser.** Dovada pe codul de pe disc inainte
  de modificari: `openBrowserAsync`/`WebBrowser` apareau doar in `src/components/external-link.tsx`,
  `src/live/live-service-access.ts` (fluxuri manuale de sursa) si `src/app/auth.tsx`; in player si in
  `src/app/live.tsx` — **zero**. In player exista un singur `setTimeout`, in scriptul paginii, care doar
  masoara marimea iframe-ului. Nu am adaugat niciunul.
- **Nu am schimbat `react-native-webview`.** Ownerul a cerut sa-i spun inainte: instalat **13.13.5**,
  iar `npx expo install --check` spune ca SDK 57 asteapta **13.16.1** (si alte 19 pachete sunt in urma:
  `expo@57.0.18` vs `~57.0.27`, `expo-router`, `expo-notifications`...). Nu l-am atins; daca vrei, il urc
  separat, cu build nou.
- **Nu am schimbat** `determinePlaybackMode`, alte ecrane, preturile, logica de oferte.
- **Nu am dat commit** (nu a fost cerut).
- Am observat ca intre timp **alt agent** a editat `src/lib/revenuecat.ts`, `src/hooks/use-revenuecat.ts`,
  `src/app/premium.tsx`, `src/i18n/config.ts` si a produs **build 14** (FINISHED). Build 15 contine si
  modificarile lui; portile de mai jos sunt rulate pe arborele rezultat, deci verifica ambele.

---

## 4. Portile (ieșirile reale)

| Poarta | Comanda | Rezultat |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0**, nicio linie de output (`gate-tsc-15b.txt`) |
| Teste (fisierele atinse) | `node --test tests/live-player-ios-fallback.test.mjs tests/live-services-c.test.mjs tests/ui-low-22.test.mjs` | **exit 0**, `pass 34 / fail 0` (`newtests-15b.txt`) |
| Poarta completa | `npm run verify` | **exit 0**; `CI GATE: PASSED`, `passed: 31 failed: 0 deferred: 2`; teste unitare **966 / 966 pass**, `fail 0`; a11y **clean (70 fisiere)**; i18n PASS; safety gate OK (`gate-verify-15b.txt`) |
| Lint | `npm run lint` | **exit 0** (`gate-lint-15.txt`) |

Prima rulare de `verify` a **picat** (A4: butonul meu de 44pt, sub pragul de 48dp cerut de audit) —
am urcat butonul la 48 si poarta a trecut. Consemnat aici, nu ascuns.

Cifre: 966 teste = 966 trecute (build 13 avea 965; +1 din modificarile celuilalt agent).

---

## 5. Build + submit

| Ce | Valoare |
|---|---|
| Build iOS production (semnat) | id **`e79da348-390f-4b75-8321-147478e1205b`**, `buildNumber` **15** (EAS: "Incrementing buildNumber from 14 to 15"), version 1.0.0, profil `production`, credentiale Expo server, certificate `72EA09B2A39B97B4FE4D00C50A691367`, echipa `WZFJU53RD7` |
| Status build | **FINISHED**, `error=none`, artifacte: `buildUrl`, `xcodeBuildLogsUrl`, `applicationArchiveUrl` |
| `.ipa` descarcat si deschis | `https://expo.dev/artifacts/eas/Y2CnS_IXfyGcTjlH97koVqKzTLfGCEq60Jj2JagTHjk.ipa` → `Payload/Ortodoxia.app/main.jsbundle`, 5.855.045 bytes |
| Submit TestFlight | id **`86376efa-8ce5-42c2-b6fb-7f6082dede91`**, status **FINISHED**, IOS, `2026-10-10T14:08:21.332Z` (`eas submit:list`). Stdout: "Submitted your app to Apple App Store Connect!" / "Your binary has been successfully uploaded to App Store Connect!" → link de procesare: `appstoreconnect.apple.com/apps/6821265789/testflight/ios` |
| Dovezi brute | `build-15-record.json` (din `eas build:list --json`: FINISHED, `createdAt 13:59:58Z` → `completedAt 14:06:08Z`, `gitCommitHash 1d9a41a`), `submit-15-record.json` (`eas submit:list`: FINISHED, 14:08:21Z → 14:08:33Z), `submit-15.txt`, `ipa15-markers.txt`, `gate-verify-15b.txt`, `gate-tsc-15b.txt`, `gate-lint-15.txt`, `newtests-15b.txt`, `probe-referer-15.txt`, `expo-install-check-15.txt` (toate in `C:\Users\pcgar\OpenWorker\dsh-player-1\`) |

### Ce s-a verificat in binarul livrat (`main.jsbundle`, 20 verificari, 0 probleme)

Atentie la metoda: bundle-ul livrat este **bytecode Hermes** (magic `c61fbc03c103191f`), nu text JS.
Se pot cauta doar **sirurile de caractere**; numerele si comentariile nu apar in text. Deci:

- prezente: `ortodoxia.web.app` (origin-ul nostru real), `/embed/`, `playsinline=1`, `referrerpolicy`,
  `autoplay; encrypted-media; picture-in-picture; fullscreen`, `allowfullscreen`, `rel=0`,
  `modestbranding=1`, `iv_load_policy=3`, sondele `iframe:incarcat` / `iframe:eroare` / `iframe:marime`,
  `youtube.com/watch?v=` (butonul manual);
- absente: `mute=1`, `autoplay=1`, `baseUrl:"https://www.youtube.com"`, `react-native-youtube-iframe`
  si internii ei (`playerQualityChange`, `getAvailablePlaybackRates`, `HTML5_error`).

Corectie de onestitate: `opacity: 0.99` si textul `ERROR 153` **nu** pot fi dovedite prin cautare in
bundle (primul e un numar, al doilea apare doar in comentarii) — prima mea verificare le-a raportat
gresit ca „lipsa". Am rescris verificarea (`check-ipa15-markers.mjs`) si acum cele 20 de markere trec.
`openBrowserAsync` **exista** in bundle, dar vine din `expo-web-browser` (folosit de `src/app/auth.tsx`,
`src/components/external-link.tsx`, `src/live/live-service-access.ts`); in player nu exista niciun apel.

Secretele (chei, tokenuri) **nu** apar in acest raport, in cod sau in Git.

---

## 6. Ce trebuie testat pe telefon (owner)

1. LIVE → Trinitas: **playerul trebuie sa porneasca IN aplicatie**. Fara `mute`, deci daca iOS cere un
   gest, YouTube isi arata **butonul lui de play** — apasa pe el (acceptat; nu mai exista nicio comutare
   automata pe browser).
2. Sunetul: dupa play ar trebui sa se auda (fara mute).
3. Textul mic de sub player ramane acolo si ne spune unde e problema, daca mai e:
   - apare `iframe:incarcat | iframe:marime 390x219 / ecran 390x844` dar imaginea nu vine →
     problema e la YouTube (refuz pe embed), nu la aplicatie;
   - lipseste, arata `0x0` sau apare `iframe:eroare` → problema e la WebView/cod, si vin cu urmatorul pas.
4. „Deschide pe YouTube" — buton mic, conturat, **doar manual**; nu trebuie sa se intample nimic singur.
5. Inchidere din buton; pe Android, butonul hardware de back.
6. PREMIUM (celalalt bug, build 12–14): „Activeaza planul" → fereastra Apple sau codul + mesajul
   RevenueCat pe ecran.

## 7. Daca 153 persista pe telefon

Urmatorul pas e **pasul 2 al ownerului**, nu o alta presupunere: incarcarea embed-ului direct, cu referer
explicit — `source={{ uri: 'https://www.youtube.com/embed/<id>?playsinline=1&rel=0&origin=https://ortodoxia.web.app', headers: { Referer: 'https://ortodoxia.web.app/' } }}`.
Se implementeaza doar dupa ce ownerul citeste textul mic de sub player (el decide daca embed-ul chiar refuza).

## 8. Verdict

**PARTIAL-15** — cod + teste + porti verzi, build 15 construit si urcat la TestFlight (submit FINISHED);
inchiderea depinde de testul ownerului pe iPhone (punctul 6), pentru ca 153 nu se poate reproduce in acest mediu.

**Atentie la testare:** alt agent a pornit intre timp **build 16** (`a0ab06fa-3903-432a-a53c-94312e693bb7`,
IN_PROGRESS la 14:07, din acelasi arbore de cod). In TestFlight, build-ul cu numarul cel mai mare e cel
proaspat: daca build 16 apare si el, verifica-l pe acela (are aceleasi modificari de player, plus ce a
schimbat celalalt agent). Playerul se poate recunoaste simplu: textul mic de sub el si butonul discret
„Deschide pe YouTube".
