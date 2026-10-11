# RAPORT — „Sign in with Apple" (ghid Apple 4.8) · GATA: build 10 semnat + urcat în TestFlight

Data: 2026-10-10 · Proiect: `C:\Users\pcgar\Documents\ortodoxia-app` · Autor: workerul `cod` (Open Worker)

**Verdict: PASS** (cu o singură verificare care nu se poate face de pe acest calculator: apăsarea reală pe un iPhone — vezi §6).

- **Codul e gata și verificat** (porți verzi, entitlement dovedit în configul iOS rezolvat, §4).
- **Build 10: `finished`** — `c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf`, buildNumber **10**, cu profilul nou `9D7RH2742F` (§3.2).
- **Submit: `finished`** — `e2542d22-73ed-43d9-b7ae-6ca48ec8abb4`, urcat în App Store Connect (§3.2).
- **Prima încercare (build 9) picase** pe profilul vechi, fără capabilitatea Apple — istoricul rămâne în §3, cu mesajul verbatim de la Apple/EAS. Configul a fost reverificat atunci, la cererea ownerului (§4.1): nimic nu lipsea.
- **Rămâne în afara mâinilor mele:** procesarea Apple a binarului (5–10 min, apoi e-mail) și **providerul Apple din Supabase** (§5).

Nu am făcut commit (cerință explicită a brief-ului).

---

## 1. Ce am schimbat (fișier + linie)

### 1.1. `src/app/auth.tsx` — calea nativă, doar pe iOS

| Linii | Ce e acolo |
|---|---|
| **3** | `import * as AppleAuthentication from 'expo-apple-authentication';` |
| **55–67** | `isAppleSignInCancelled(error)` — recunoaște anularea după `error.code === 'ERR_REQUEST_CANCELED'`, nu după textul mesajului (un mesaj localizat se poate schimba, codul nu) |
| **203–209** | `const [appleAvailable, setAppleAvailable] = useState(false);` — starea inițială e „indisponibil", nu „disponibil" |
| **256–265** | effect: `AppleAuthentication.isAvailableAsync()`, cu `.catch` care lasă butonul ascuns dacă verificarea pică |
| **446–496** | `const signInWithApple = async () => { … }` — fluxul nativ |
| **467–472** | `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })` — foaia sistemului |
| **476–479** | verificarea `if (!credential.identityToken)` (tipul e `string \| null`, deci era obligatorie pentru tip sigur) |
| **481–486** | `supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken })`, în `withTimeout(...)` |
| **489–492** | `if (isAppleSignInCancelled(error)) return;` **înainte** de `showAuthAlert(...)`; restul erorilor merg pe `friendlyAuthError(error, t)` — exact mesajul de la Google |
| **621** | `{Platform.OS === 'ios' && appleAvailable ? (` — poarta de platformă + disponibilitate |
| **630–636** | `<AppleAuthentication.AppleAuthenticationButton buttonType={…SIGN_IN} buttonStyle={…BLACK} cornerRadius={14} onPress={signInWithApple} style={styles.appleButton} />` — **butonul oficial**, randat de sistem |
| **645** | `{Platform.OS !== 'ios' && isProviderEnabled(providerAvailability, 'apple') ? (` — butonul vechi, desenat manual (flux web OAuth), rămâne **doar pe non-iOS**; pe iOS nu se mai randează deloc, ca să nu fie două butoane Apple pe același ecran |
| **677–679** | `appleButton: { width: '100%', height: 50 }` — lățime/înălțime obligatorii, altfel butonul oficial nu se randează |

Ce **nu** am atins: fluxul de email/parolă, fluxul Google, restul ecranului. `git diff --numstat` pe `auth.tsx`: **+112 / −2** (cele 2 linii șterse sunt comentariul vechi, mutat la butonul manual).

### 1.2. `app.json`

| Linie | Ce e acolo |
|---|---|
| **15** | `"usesAppleSignIn": true` (în `expo.ios`) |

Cheile existente rămân identice: `bundleIdentifier: "ro.ortodoxia.app"` (linia 12), cele 5 chei din `infoPlist` (17–22, inclusiv `CFBundleLocalizations` cu 10 limbi) și lista `plugins`. **Nu am adăugat** `expo-apple-authentication` în lista `plugins`: e înregistrat automat de prebuild ca plugin „versioned SDK" — verificat în `node_modules/@expo/prebuild-config/build/plugins/withDefaultPlugins.js:171`.

> Ca să nu-și atribuie nimeni altceva: în `app.json` și `package.json` **mai erau modificări necomise ale altui agent** înainte să încep (`supportsTablet`, cheile din `infoPlist`; scripturile `test:live-backend`, `test:ai-chain`, `test:chat`). De la mine sunt strict două linii: `app.json:15` (`usesAppleSignIn`) și `package.json:13` (`expo-apple-authentication`).

### 1.3. `package.json` + `package-lock.json`

| Linie | Ce e acolo |
|---|---|
| **13** | `"expo-apple-authentication": "~57.0.2"` (pachet oficial Expo, MIT, gratuit — aprobat de owner înainte de instalare) |

### 1.4. `tests/apple-signin-native.test.mjs` — **fișier nou** (9 teste)

Test de regresie pentru exact cerința de review, ca fix-ul să nu poată fi desfăcut în silence. Cade dacă: butonul oficial e înlocuit cu unul desenat manual; dispare poarta `Platform.OS === 'ios'`; `isAvailableAsync()` nu mai e consultat; fluxul nativ e înlocuit cu `signInWithOAuth` (redirect); `signInWithIdToken` pierde `provider`/`token`; anularea ajunge la alertă; fluxurile de email/parolă sau Google sunt atinse.

> Notă de onestitate: acest fișier a fost scris **după** ce arhiva build-ului plecase spre EAS. Nu contează pentru binar (testele nu intră în bundle și nu există build hook care să le ruleze), dar îl spun explicit. Singura modificare de după startul build-ului care atinge un fișier de aplicație e ștergerea a 4 linii de **comentariu** din `auth.tsx` (comentariu mutat peste butonul greșit) — zero efect pe comportament, comentariile nu ajung în bundle.

---

## 2. Porțile — ieșire reală

| Poartă | Comandă | Rezultat |
|---|---|---|
| Typecheck | `npm run typecheck` | **exit 0** |
| Teste (tot) | `npm test` | **exit 1** — `tests 954 · pass 952 · fail 2` (ambele **pre-existente**, vezi §2.1) |
| Testul nou | `node --experimental-strip-types --test tests/apple-signin-native.test.mjs` | **exit 0** — `pass 9 · fail 0` |
| Release | `npm run test:release` | **exit 0** — `passed: 31 failed: 0 deferred: 2`, `CI GATE: PASSED.` |
| Accesibilitate | `npm run test:a11y` | **exit 0** — `70 source file(s) scanned, 0 finding(s)` |
| Siguranță | `npm run test:safety` | **exit 0** — `SAFETY GATE: OK` |

Ieșirile sunt păstrate întregi în `C:\Users\pcgar\OpenWorker\dsh-siwa-1\dovezi\` (`gate-typecheck.txt`, `gate-test-full.txt`, `gate-test-release.txt`, `gate-a11y.txt`, `gate-safety.txt`, `gate-introspect-ios.txt`).

### 2.1. Cele 2 teste care pică NU au legătură cu această schimbare

```
test at supabase\functions\live-services-status\tests\aud2-live-validation.test.mjs:26:1
  ✖ AUD2-05 malformed videos payload is rejected          (importă ../youtube.ts, ../status.ts)

test at tests\edge-cors-per-request.test.mjs:156:1
  ✖ C17: nicio funcție edge nu mai ține cererea într-o variabilă de modul
      supabase/functions/live-probe/index.ts: nu construiește respondentul din `req`, în handler
      supabase/functions/live-probe/index.ts: nu importă `createJsonResponder` din `../_shared/http.ts`
```

Dovada că nu vin de la mine:
- cele două suite importă **doar** `supabase/functions/**` (`../supabase/functions/_shared/http.ts`, `../youtube.ts`, `../status.ts`) și scanează folderul `supabase/functions`; nu citesc niciun fișier pe care l-am atins;
- sursele lor erau deja modificate în arborele de lucru **înainte de prima mea comandă**: `M supabase/functions/live-services-status/index.ts`, `M .../status.ts`, `M .../youtube.ts`, `?? supabase/functions/live-probe/` (lucrează altcineva acolo);
- `git diff --stat` al meu: `app.json`, `package.json`, `package-lock.json`, `src/app/auth.tsx` — **niciunul** din `supabase/`.

**Nu le-am reparat** (R7: un singur writer; nu ating munca în curs a altcuiva) — le raportez ca să le știe DSH.

---

## 3. Build-ul semnat — a PICAT, cu motivul exact

```
$ npx eas-cli@24.12.1 build --platform ios --profile production --non-interactive

ID                 29f83a48-4552-40a8-9ca0-f56530c67956
Platform           iOS          Status      errored
Profile            production   Distribution store
Version            1.0.0        Build number 9
Started at         10/10/2026, 2:44:36 PM     Finished at  2:46:08 PM
Logs               https://expo.dev/accounts/ortodoxia/projects/ortodoxia/builds/29f83a48-4552-40a8-9ca0-f56530c67956
```

Ce a cerut Apple/EAS, **verbatim** (nu inventez nimic):

```
iOS build failed:
The "Run fastlane" step failed because of an error in the Xcode build process.
We automatically detected following errors in your Xcode build logs:
- Provisioning profile "*[expo] ro.ortodoxia.app AppStore 2026-10-10T08:07:34.989Z"
  doesn't include the Sign In With Apple capability. (in target 'Ortodoxia' from project 'Ortodoxia')
- Provisioning profile "*[expo] ro.ortodoxia.app AppStore 2026-10-10T08:07:34.989Z"
  doesn't include the com.apple.developer.applesignin entitlement. (in target 'Ortodoxia' from project 'Ortodoxia')
```

**Cauza reală, citită din mesaj:** profilul de provisioning folosit de EAS a fost emis la **2026-10-10T08:07:34Z** (11:07 ora locală) — deci **înainte** ca DSH să activeze capabilitatea `APPLE_ID_AUTH` pe App ID. Xcode cere entitlementul (pe care build-ul îl are, §4), iar profilul nu-l acoperă. Nu e o problemă de cod și nu e o problemă de certificat.

Ce NU pot face eu: **regenerarea profilului cere autentificare la Apple**. `eas credentials` este **doar interactiv** (verificat: `eas credentials --help` nu are nicio opțiune de non-interactiv / regenerare), iar `eas build --non-interactive` nu regenerează profilul singur — exact de asta a picat.

### 3.1. Fixul — două căi, amândouă în contul Apple (owner / DSH)

1. **Din browser (fără terminal):** https://expo.dev/accounts/ortodoxia/projects/ortodoxia/credentials → iOS → **Provisioning Profile** (`XRWYZ25S84`) → **Regenerate**. Nu trebuie certificat nou; doar profilul, ca să prindă capabilitatea activată.
2. **Din terminal (ca în runda 2):** `npx eas-cli@24.12.1 credentials -p ios` → *Build Credentials* → *Provisioning Profile* → **Regenerate** (cere login la Apple).

După asta, comenzile rămase sunt exact cele din brief:

```
npx eas-cli@24.12.1 build --platform ios --profile production --non-interactive
npx eas-cli@24.12.1 submit --platform ios --profile production --non-interactive --id <build-ID>
```

Atenție la submit: **fără `--id` nu merge** în mod non-interactiv (`You need to specify the archive source when running in non-interactive mode` — constatare din runda 4, păstrată în `RAPORT-IOS-BUILD.md:107`).

Notă: numărul de build a fost deja consumat (`8 → 9`) de încercarea picată, deci următorul build va fi **10**.

### 3.2. Profil regenerat de owner → build 10 REUȘIT + submit REUȘIT

Ownerul a regenerat profilul de provisioning (Developer Portal ID **9D7RH2742F**, care înlocuiește `XRWYZ25S84`). EAS l-a folosit imediat — se vede în antetul build-ului:

```
Provisioning Profile
Developer Portal ID       9D7RH2742F
Status                    active
Updated                   1 minute ago
Distribution Certificate  Serial Number 72EA09B2A39B97B4FE4D00C50A691367 (expiră 10 Oct 2027)
Apple Team                WZFJU53RD7 (YAC PLANET S.R.L.)
- Incrementing buildNumber from 9 to 10.
✔ Incremented buildNumber from 9 to 10.
See logs: https://expo.dev/accounts/ortodoxia/projects/ortodoxia/builds/c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf
✔ Build finished
🍎 iOS app: https://expo.dev/artifacts/eas/D1EglTgEAuspHGkBio80jl4FJCiwRLgOoemebeix_Js.ipa
```

**Build (verbatim din `eas build:list --platform ios --limit 2 --non-interactive`):**

```
ID                       c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf
Platform                 iOS
Status                   finished
Profile                  production
Distribution             store
SDK Version              57.0.0
Version                  1.0.0
Build number             10
Commit                   1d9a41ad86089830db65b2e29cda72155f251704
Logs                     https://expo.dev/accounts/ortodoxia/projects/ortodoxia/builds/c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf
Application Archive URL  https://expo.dev/artifacts/eas/D1EglTgEAuspHGkBio80jl4FJCiwRLgOoemebeix_Js.ipa
Build Artifacts URL      null
Fingerprint              d6fc91ccfc3df941717bfbb7a827a66ee47f5c88
Started at               10/10/2026, 3:01:38 PM
Finished at              10/10/2026, 3:07:51 PM
Started by               ortodoxia123
```

**Submit (verbatim din `eas submit:list --platform ios --limit 2 --non-interactive`):**

```
ID                  e2542d22-73ed-43d9-b7ae-6ca48ec8abb4
Platform            iOS
Status              finished
ASC App ID          6821265789
Build ID            c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf
Build Profile       production
App Version         1.0.0
Build number        10
Fingerprint         d6fc91ccfc3df941717bfbb7a827a66ee47f5c88
Commit              1d9a41ad86089830db65b2e29cda72155f251704
Started at          10/10/2026, 3:11:29 PM
Finished at         10/10/2026, 3:11:45 PM
Submission Details  https://expo.dev/accounts/ortodoxia/projects/ortodoxia/submissions/e2542d22-73ed-43d9-b7ae-6ca48ec8abb4
```

Mesajul CLI la submit: `✔ Submitted your app to Apple App Store Connect!` / `Your binary has been successfully uploaded to App Store Connect! — It is now being processed by Apple`. Notă informativă din același output: `No complete App Store Connect credentials, skipping TestFlight setup` (s-a sărit doar configurarea grupului de testeri; **urcarea a reușit**).

Comenzile rulate (identic cu brief-ul):

```
npx eas-cli@24.12.1 build  --platform ios --profile production --non-interactive
npx eas-cli@24.12.1 submit --platform ios --profile production --non-interactive --id c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf
npx eas-cli@24.12.1 build:list  --platform ios --limit 2 --non-interactive
npx eas-cli@24.12.1 submit:list --platform ios --limit 2 --non-interactive
```

**De ce reușita asta dovedește și că binarul conține Sign in with Apple:** la build 9, Xcode a refuzat exact pentru că fișierul de entitlement generat de prebuild cerea `com.apple.developer.applesignin`, iar profilul nu-l acoperea. Același pipeline, aceeași configurație — la build 10, cu profilul regenerat, semnarea a trecut. Adică entitlementul e cerut de proiect **și** acoperit de profilul cu care e semnat binarul.

---

## 4. Dovada entitlementului (nu din memorie, din configul rezolvat)

```
$ npx expo config --type introspect --json          # nu scrie nimic pe disc

ios.entitlements = {
  "com.apple.developer.applesignin": ["Default"],
  "aps-environment": "development"
}
ios.infoPlist.CFBundleAllowMixedLocalizations = true
ios.bundleIdentifier = "ro.ortodoxia.app"
```

Adică: proiectul iOS **generat de prebuild conține** entitlementul cerut de Apple — `ios.usesAppleSignIn` + pachetul instalat sunt suficiente. Verificat și de ce: `expo-apple-authentication` e auto-înregistrat ca plugin, iar pluginul lui scrie entitlementul (`node_modules/@expo/prebuild-config/build/plugins/withDefaultPlugins.js:171`, `…/unversioned/expo-apple-authentication.js:21`). Blocajul e strict profilul din contul Apple, nu configurația din repo.

### 4.1. Verificarea configului (cerută de owner pe 2026-10-10, după build-ul picat): **nu lipsește nimic**

| Ce s-a verificat | Dovada (comanda sau fișierul) | Rezultat |
|---|---|---|
| Versiunea cerută de SDK 57 | docs versionate: `docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/` | „Recommended version: **~57.0.2**" |
| Ce e declarat / instalat | `package.json:13` · `node_modules/expo-apple-authentication/package.json` | `~57.0.2` declarat, **57.0.2 exact** pe disc |
| Compatibilitate cu SDK-ul | `npx expo install --check` | **`expo-apple-authentication` NU apare** în lista de actualizat (deci versiunea e cea corectă) |
| Modul documentat de activare a capabilității | docs SDK 57: „set the `ios.usesAppleSignIn` property to `true`" | `app.json:15` → `"usesAppleSignIn": true` |
| Ce scrie pluginul în proiect | `node_modules/expo-apple-authentication/plugin/build/withAppleAuthIOS.js:22–23` | `withEntitlementsPlist` → `com.apple.developer.applesignin = ['Default']` |
| Pluginul se aplică fără să fie listat | `node_modules/@expo/prebuild-config/build/plugins/withDefaultPlugins.js:52,171` | da — e „versioned SDK package", deci **nu** se pune în `plugins` (dacă l-aș fi pus, s-ar dubla) |
| **Entitlementul, în configul rezolvat** | `npx expo config --type introspect --json` | `{"com.apple.developer.applesignin": ["Default"], "aps-environment": "development"}` |
| `CFBundleAllowMixedLocalizations` (cerut de docs ca butonul să folosească limba telefonului) | `npx expo config --type introspect --json` | **`true`** (nu e scris de noi în `app.json:16–23` — vine din prebuild-ul Expo) |
| `bundleIdentifier` | `npx expo config --type public --json` | `ro.ortodoxia.app` (același cu App ID-ul cu capabilitatea activată) |
| Poarta iOS în cod | `src/app/auth.tsx:621`, `:630` | `Platform.OS === 'ios' && appleAvailable` + `AppleAuthenticationButton` oficial |

**Concluzie: dinspre repo, lanțul e complet** — `app.json:15` → plugin auto-înregistrat → entitlement `com.apple.developer.applesignin` în proiectul iOS generat. Nu există fișier sau cheie lipsă pe care să ți-o pot arăta.

**Ce urmează, în ordinea asta (dacă după regenerarea profilului mesajul reapare):**

1. Regenerează profilul (§3.1) și repornește build-ul.
2. Dacă **același** mesaj reapare, atunci capabilitatea nu e efectiv activă pe App ID: de verificat în Apple Developer → *Identifiers* → `ro.ortodoxia.app` (bundle id `3DZ5BNWHRP`) → **Sign In with Apple** bifat la *Capabilities* → Save; abia apoi regenerarea profilului.
3. Al doilea mesaj („doesn't include the `com.apple.developer.applesignin` entitlement") e **consecința** primului, nu o problemă separată — nu are nevoie de alt fix.

**Informativ, nelegat de acest task:** `npx expo install --check` iese 1 pentru 20 de pachete rămase în urmă față de SDK 57 (ex. `expo@57.0.18` vs `~57.0.27`, `expo-notifications@57.0.15` vs `~57.0.22`). Nu le-am atins (nu sunt ale acestui task și n-am aprobare de upgrade) — le semnalez pentru DSH.

---

## 5. Dependență care trebuie închisă înainte de review (nu o pot închide eu)

Pe iOS butonul nativ **nu** consultă disponibilitatea providerului din Supabase — deliberat: Apple cere ca butonul să existe, iar „ascuns fiindcă un GET a picat" ar însemna respingere. Consecința: **providerul Apple din Supabase trebuie activat (client id = `ro.ortodoxia.app`) înainte de trimiterea la review** — binarul care va merge la review e build 10 (§3.2). Dacă rămâne stins, butonul se vede și dă eroare la apăsare. La ultima verificare (azi), `GET /auth/v1/settings` răspundea încă `"apple": false` — DSH a spus că îl configurează.

---

## 6. Ce NU am putut verifica (nu ascund limitele)

- **Nu am putut rula fluxul pe un dispozitiv iOS.** Nu există Mac pe acest calculator, iar butonul nativ și foaia „Sign in with Apple" nu există în web/Android — deci „am apăsat și a mers" nu se poate demonstra aici, doar pe un iPhone (sau TestFlight).
- **Nu am putut verifica profilul de provisioning din contul Apple** (cere autentificare) — am citit doar ce a raportat EAS.
- **Procesarea Apple** (build `VALID` în TestFlight) nu se vede din EAS: durează ~5–10 min și anunță pe e-mail. Legătura din output: https://appstoreconnect.apple.com/apps/6821265789/testflight/ios
- **Nu declar „gata de trimis la review"**: mai trebuie (a) confirmarea Apple că binarul e `VALID`, (b) providerul Apple activ în Supabase (§5).

---

## 7. Rezumat pentru brief

| Punct din brief | Stare |
|---|---|
| 1. Buton nativ „Sign in with Apple", doar pe iOS, cu `isAvailableAsync()`, stil oficial `AppleAuthenticationButton` | **GATA** — §1.1 (auth.tsx:3, 209, 256–265, 621, 630–636); pachet aprobat înainte de instalare (§1.3) |
| 2. Legat de Supabase prin fluxul nativ IdToken | **GATA** — auth.tsx:481–486 |
| 3. Anulare = fără alertă; eroare reală = mesajul existent | **GATA** — auth.tsx:62, 489–492 |
| 4. Email/parolă și Google neatinse | **GATA** — testul 9 din `tests/apple-signin-native.test.mjs` + `git diff` |
| 5. Porțile, ieșire reală | **GATA** — §2 (typecheck 0 · test:release 0 · a11y 0 · safety 0 · `npm test` 952/2, cele 2 pre-existente, §2.1) |
| 6. Build semnat + submit TestFlight | **GATA** — build `c7a2afd8-57e8-40d7-ae9d-64ba6a9cb8bf`, buildNumber **10**, status **finished** (§3.2); submit `e2542d22-73ed-43d9-b7ae-6ca48ec8abb4`, status **finished**, urcat în ASC (App ID `6821265789`). Prima încercare (build 9) picase pe profilul vechi — §3 |
| 7. Raport | **GATA** (acest fișier) |
| „Dacă Apple cere altceva, spune exact ce" | **GATA** — §3, mesaj verbatim: profilul nu include capabilitatea „Sign In With Apple" / entitlementul `com.apple.developer.applesignin` (rezolvat de owner prin regenerarea profilului → `9D7RH2742F`) |
| Nu face commit | respectat — nicio comandă git de scriere nu a fost rulată |
