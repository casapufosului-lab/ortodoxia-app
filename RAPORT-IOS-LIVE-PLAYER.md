# RAPORT — BUG LIVE pe iOS (player NEGRU): scos din `<Modal>` · build 11 semnat + urcat în TestFlight

Data: 2026-10-10 · Proiect: `C:\Users\pcgar\Documents\ortodoxia-app` · Autor: workerul `cod` (Open Worker)

**Verdict: PASS** pentru cod + porți + build + submit. Rămâne **o singură verificare**, care nu se poate face
de pe acest calculator: apăsarea reală pe un iPhone (§6).

---

## 1. Cauza, confirmată în cod (nu presupusă)

`src/live/youtube-embed.native.tsx` (98 linii, forma veche) randa `YoutubePlayer`
(`react-native-youtube-iframe` → WKWebView) **într-un `<Modal presentationStyle="pageSheet">`**. Pe iOS, un
WKWebView montat într-un modal prezentat primește un cadru amânat/zero și rămâne **negru** (fără imagine,
fără sunet); același cod cânta pe Android. Fixul minim: playerul nu mai e modal, ci un **overlay full-screen**
randat de ecranul de live.

## 2. Ce am schimbat (fișier + linie)

### 2.1 `src/live/youtube-embed.native.tsx` (98 → 161 linii)

| Linii | Ce e acolo |
|---|---|
| 8–15 | comentariul care fixează cauza (iOS + WKWebView în modal) și noua formă |
| **26–39** | `INITIAL_PLAYER_PARAMS`: `controls: true` (27), `preventFullScreen: false` (28), `rel: false` (29) **păstrate**; adăugate **`iv_load_policy: 3`** (31) și **`modestbranding: true`** (38) |
| 30, 32–37 | de ce: `iv_load_policy` oprește adnotările; `modestbranding` **nu** e declarat în tipul `InitialPlayerParams` al bibliotecii (2.4.1), deci merge prin cast — și e **depreciat de YouTube din 15.08.2023** (no-op), dar e inofensiv |
| 50–61 | `BackHandler` — **neatins** (Android: butonul hardware închide playerul) |
| 63–79 | fullscreen → landscape / portret — neatins |
| 81 | `if (!videoId) return null;` — nimic randat dacă nu e emisiune |
| **85–124** | overlay-ul: `View styles.overlay` (88, `accessibilityViewIsModal`), playerul (90–110), butonul de închidere (113–120) |
| **100–109** | `webViewProps` completat pentru iOS: `allowsFullscreenVideo`, `allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction: false`, `javaScriptEnabled`, `domStorageEnabled`, `originWhitelist: ['*']` + `accessibilityLabel` (108) |
| 115, 119 | butonul de închidere: `t('live.closePlayerAccessibilityLabel')` + `t('live.closePlayer')` (localizat, 56pt — regula 28) |
| 129–138 | `styles.overlay`: `position: 'absolute'` pe tot ecranul, negru, `zIndex/elevation 10` — comportamentul modalului, fără modal |
| — | **`<Modal>` și `onRequestClose` au dispărut** (nu mai există modal de închis); închiderea o face butonul propriu, plus `BackHandler` pe Android |

### 2.2 `src/app/live.tsx` (235 → 244 linii: **12 linii adăugate**, restul re-indentare)

Ecranul își înfășoară conținutul în `<Screen>`, care e un `ScrollView`; de aceea overlay-ul a fost **ridicat
ca frate al `<Screen>`**, nu lăsat înăuntru.

| Linie | Ce e acolo |
|---|---|
| 73 | `const closePlayer = useCallback(() => { setActivePlayerVideoId(null); }, []);` — **neatins** |
| **140** | `<View style={styles.root}>` (nou) |
| 141 / 204 | `<Screen>` / `</Screen>` |
| 205–209 | comentariul care explică de ce nu e `<Modal>` |
| **211** | `<YouTubeEmbed videoId={activePlayerVideoId} onClose={closePlayer} />` — **mutat în afara `<Screen>`** (deci în afara ScrollView-ului) |
| 212 / 217 | `</View>` + `styles.root` (`flex: 1`, fundal ca al ecranului) |

`determinePlaybackMode` / `src/live/live-playback.ts` **nu au fost atinse**. Web playerul
(`youtube-embed.web.tsx`) și celelalte ecrane **nu au fost atinse**.

**Dovada că re-indentarea nu a stricat nimic:** script `verify-reindent.mjs` compară fișierul cu backup-ul
liniuță cu liniuță, ignorând indentarea — singurele diferențe sunt exact cele 12 linii intenționate
(`<View style={styles.root}>`, `</View>`, comentariul de 5 linii, `root:` în StyleSheet, linia mutată).

### 2.3 Teste — 2 aserțiuni statice care „fixau" Modalul (verificare **înlocuită**, nu slăbită)

| Fișier:linie | Înainte | Acum |
|---|---|---|
| `tests/live-services-c.test.mjs:84` | `assert.ok(e.includes('onRequestClose'))` | `assert.ok(e.includes("t('live.closePlayer')"))` + `assert.ok(e.includes("t('live.closePlayerAccessibilityLabel')"))`; `assert.ok(e.includes('BackHandler'))` **a rămas** |
| `tests/ui-low-22.test.mjs:13` | `assert.doesNotMatch(native, /t\('live\.closePlayer/)` | `assert.match(native, /t\('live\.closePlayerAccessibilityLabel'\)/)` + `assert.match(native, /t\('live\.closePlayer'\)/)` |

Amândouă testau **forma veche** (butonul de închidere venea din `pageSheet`-ul modalului, deci embedul nativ
nu avea voie să aibă buton propriu). Intenția lor — „există o cale de închidere, localizată" — e acum
asertată direct. Nu s-a șters nicio verificare.

### 2.4 `docs/LIVE_SERVICES_STATUS.md:287`

Descrierea `src/live/youtube-embed.native.tsx` spune acum „overlay full-screen, NU într-un `<Modal>`".

## 3. Porțile (ieșire reală)

`npm run verify` → **exit 0** (`gate-verify.txt`):

```
> npm run typecheck:all      → tsc --noEmit + tsc -p tsconfig.edge.json         (OK, fără erori)
> npm run test:i18n          → PASS — i18n corpus is consistent (556 chei x 10 locale)
> npm run test:a11y          → 70 source file(s) scanned, 0 finding(s)
> npm run test:safety        → SELF-TEST: OK (parser bundle + scanner a11y)
> npm test                   → tests 954 · pass 954 · fail 0 · skipped 0
> npm run test:release       → passed: 31   failed: 0   deferred: 2
                               CI GATE: PASSED.
```

Cele 2 „deferred" sunt cunoscute și neblocante: cheia App Store-only `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`
nu e setată local, iar calendarul liturgic 2027 nu e publicat încă.

Cele două fișiere de test modificate, rulate direct:

```
node --test tests/live-services-c.test.mjs tests/ui-low-22.test.mjs
  → tests 27 · pass 27 · fail 0
```

`npm run lint` (`expo lint`) → **exit 0**, 0 probleme.

## 4. Build semnat de producție

| | |
|---|---|
| Comandă | `npx eas-cli build --platform ios --profile production --non-interactive --message "fix live - playerul iese din Modal (iOS ramanea negru), build 11"` |
| **Build ID** | **`4d71c980-82d8-43ee-8a38-f4892e8f4287`** |
| **buildNumber** | **11** (remote era 10; `autoIncrement: true`) · App Version 1.0.0 |
| **Status** | **`FINISHED`** — 12:20:53Z → 12:26:52Z (12:20:53Z creat) |
| Profil / distribuție | `production` / `STORE` (semnat pentru App Store) |
| Credențiale | profilul nou `9D7RH2742F` (cel regenerat pentru Sign in with Apple) — „All credentials are ready to build" |
| Artefact | `https://expo.dev/artifacts/eas/QMLw6y3DzoNuFwGAPV3AedPb_36LOb70w2l0LhwkpbA.ipa` (33,4 MB) |

**Nu a fost nevoie de commit:** `eas.json` nu are `requireCommit`, iar eas-cli 24.12.1 copiază în arhivă și
fișierele modificate/neurmărite — comentariu verbatim din `build/vcs/clients/git.js`:

```
// After we create the shallow Git copy, we copy the files
// again. This way we include the changed and untracked files
// (`git clone` only copies the committed changes).
```

## 5. Submit în TestFlight

| | |
|---|---|
| Comandă | `npx eas-cli submit --platform ios --profile production --non-interactive --id 4d71c980-… --wait` |
| **Submit ID** | **`d598bd4a-7c95-430c-a679-35632400c9b6`** |
| **Status** | **`FINISHED`** (build 11, App Version 1.0.0, fără eroare) |
| Rezultat | „Your binary has been successfully uploaded to App Store Connect!" |
| Link | `https://appstoreconnect.apple.com/apps/6821265789/testflight/ios` |

Procesarea Apple (5–10 min) + e-mailul sunt **în afara mâinilor mele**.

## 6. Ce trebuie verificat pe device (nu pot de aici)

Pe **build 11**, pe iPhone:

1. **LIVE → Trinitas (✅) → butonul de redare**: trebuie să apară **imaginea și sunetul** (nu ecran negru).
2. **Butonul de închidere** (cercul de jos) → revine pe ecranul LIVE.
3. **Rotirea**: intrarea în fullscreen rotește în landscape, ieșirea revine în portret.
4. Pe **Android** (build echivalent): butonul hardware *back* închide playerul la fel ca înainte.

## 7. Ce am făcut și ce nu

- **Nu am făcut commit** (nu a fost cerut; modificările stau în working tree, iar build-ul le-a inclus — dovada §8).
- **Nu am atins**: `determinePlaybackMode`, `live-playback.ts`, web playerul, alte ecrane, alte funcții.
- `modestbranding` e **depreciat de YouTube** (no-op din 15.08.2023) — l-am adăugat cum s-a cerut, dar **nu**
  ascunde brandingul singur; `iv_load_policy: 3` chiar oprește adnotările.

## 8. Dovada că fixul e în binarul urcat (nu doar în cod)

Am descărcat `.ipa`-ul build 11, l-am despachetat și am căutat în `Payload/Ortodoxia.app/main.jsbundle`:

```
FOUND    iv_load_policy            FOUND    domStorageEnabled
FOUND    modestbranding            FOUND    live.closePlayer
FOUND    allowsInlineMediaPlayback FOUND    live.closePlayerAccessibilityLabel
FOUND    live.playerAccessibilityLabel      FOUND    preventFullScreen
```

`iv_load_policy` și `modestbranding` există în **tot proiectul** doar în `src/live/youtube-embed.native.tsx`
(verificat: absente în `react-native-youtube-iframe`, în `react-native-webview` și în restul `src/`), deci
prezența lor în bundle nu poate veni din altă parte — un binar fără acest fix nu le-ar putea conține.
