# RAPORT — build iOS semnat + TestFlight (runda 4: cheia RevenueCat Apple reală)

Data: 2026-10-10 · Proiect: `C:\Users\pcgar\Documents\ortodoxia-app` · Autor: workerul `cod` (Open Worker)

**Verdict: PASS** — cheia RevenueCat Apple reală e în `eas.json` (ambele profile), porțile trec, build semnat **6** urcat în App Store Connect / TestFlight.

Rezerva onestă: nu declar „gata de revizuit pentru App Store" — Apple poate trimite observații la revizuirea aplicației, nu doar la validarea binarului.

Nu am tipărit niciun secret: cheia privată `.p8` nu a fost copiată în repo, comisă sau afișată (citită doar în memoria unui proces Node, pentru semnarea JWT la verificarea la Apple). Cheia App Store din `eas.json` e o **cheie publică de SDK** (`EXPO_PUBLIC_*`, ajunge oricum în binar) — de aceea apare în raport. Cheia Google nu apare în acest raport.

*Notă de numerotare:* **§0 = runda 5** (cea curentă), **§0B = runda 4**, **§0A = runda 3**. Referințele de tipul „§0.x" care apar în secțiunile rundei 4 se citesc ca „§0B.x", iar cele din secțiunile rundei 3 ca „§0A.x".

---

## 0. Runda 5 (cea mai recentă) — limba aplicației (`CFBundleLocalizations`) + diagnosticul de preț, într-un singur build

### 0.1. Limba: `app.json` — fișier + linie

**`app.json`**, în `expo.ios.infoPlist`, **linia 21**:

```json
"CFBundleLocalizations": ["ro", "en", "el", "sr", "bg", "mk", "uk", "ka", "ru", "sq"]
```

Lista e **exact** `COMPLETE_LANGUAGES` din `src/i18n/config.ts:6` (10 limbi, aceeași ordine). Cauza dovedită de DSH: fără cheia asta iOS raportează „en", `Intl` din `detectDeviceLanguage()` întoarce „en", iar aplicația pornește în engleză deși telefonul e pe română.

Nu s-a atins nicio altă cheie din `app.json` (celelalte 4 chei din `infoPlist` și restul fișierului rămân identice). **Nu s-a instalat niciun pachet** — `expo-localization` rămâne neinstalat.

### 0.2. Dovada: Info.plist rezolvat (`npx expo config --type introspect`)

```
infoPlist.chei = 33
CFBundleLocalizations = ["ro","en","el","sr","bg","mk","uk","ka","ru","sq"]
numar limbi = 10
```

Fragment din plist-ul rezolvat (identic cu cel din §0A, plus cheia nouă):

```
NSSpeechRecognitionUsageDescription: "Permite aplicației Ortodoxia să transforme vocea dictată în text."
NSMicrophoneUsageDescription: "Permite aplicației Ortodoxia să folosească microfonul pentru dictarea întrebărilor."
ITSAppUsesNonExemptEncryption: false
NSPhotoLibraryUsageDescription: "Permite aplicației Ortodoxia să acceseze fotografiile tale pentru a afișa imaginile din aplicație."
NSPhotoLibraryAddUsageDescription: "Permite aplicației Ortodoxia să salveze imagini în galeria ta."
CFBundleLocalizations: ["ro","en","el","sr","bg","mk","uk","ka","ru","sq"]
```

Ieșirea a fost scrisă **byte-exact din Node** (`dovezi-ios/introspect-4.json`, `dovezi-ios/introspect-4-infoPlist.txt`) — fără re-decodare cp1252.

### 0.3. Diagnosticul de preț (temporar, **rămas în build** la cererea ownerului)

`src/app/premium.tsx`:

| Linii | Ce e acolo |
|---|---|
| **3** | `import Purchases, { type PurchasesPackage } from 'react-native-purchases';` (folosit doar de diagnostic) |
| **82–140** | blocul de citire: `Purchases.getOfferings()` și, pentru fiecare pachet, `identifier`, `packageType` (numeric + nume), `product.identifier`, `product.priceString`, `product.currencyCode`, `product.price`, `product.subscriptionPeriod`; plus `offerings.all` (câte offering-uri), `offerings.current?.identifier`, numărul de pachete, `priceFor('monthly')`, `priceFor('annual')`, `languageCode`, `region.locale`, `region.countryCode`, `region.currencyCode` |
| **268–276** | blocul afișat pe ecran (Card, text 11 pt, selectabil) |
| **311–318** | stilurile `diagTitle` / `diagText` |

Marcat în **patru** locuri (liniile **82**, **107**, **268**, **311**) cu `// DIAGNOSTIC TEMPORAR (preț iOS) — se scoate după ce citim valorile.`

**Ce NU face:** nu atinge `buy`, `restore`, `priceFor`, `availabilityFor` și nici prețurile; nu adaugă pachete. `expo-localization` nefiind instalat, diagnosticul afișează regiunea/limba **știute de aplicație** (`region.locale`, `region.countryCode`, `region.currencyCode`, `languageCode`), nu locale-ul brut al telefonului — diferența e notată în cod.

### 0.4. Porțile — ieșirea reală (după ambele modificări)

| Poartă | Rezultat |
|---|---|
| `npm run typecheck` | **exit 0**, nicio eroare (`> tsc --noEmit --pretty false`) |
| `npm test` | `tests 923 · suites 10 · pass 923 · fail 0 · cancelled 0 · skipped 0 · todo 0` — **exit 0** |
| `npm run test:release` | `passed: 31   failed: 0   deferred: 2`, `CI GATE: PASSED.` — **exit 0** |
| audit a11y (inclus în poarta de release) | `PASS [a11y] accessibility audit is clean across 70 source file(s)` |

Cele 2 DEFERRED rămase (aceleași ca în runda 4, neschimbate): `[config] App Store-only variables not set locally: EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` și `[calendar] calendar data covers only 2026 — no rows for 2027`. **Nicio poartă nu a interzis textul de diagnostic** și nici `CFBundleLocalizations`; nu am slăbit niciun test.

### 0.5. Build nou semnat

Primul build al acestei runde (`33769bf8-c60f-45df-88ad-f27ff52f02c2`, buildNumber 7) a fost pornit **înainte** de reparația limbii, deci a fost **anulat** (`npx eas-cli build:cancel … → „Build canceled"`, exit 0) și înlocuit cu unul singur, cu ambele modificări:

| Câmp | Valoare |
|---|---|
| Build ID | **`3a373ba9-67c9-414e-a534-b92ba442d348`** |
| Status | **`finished`** (build:list) |
| buildNumber | **8** (`Incrementing buildNumber from 7 to 8`) |
| Profil / distribuție | `production` / `store` |
| Versiune | 1.0.0 |
| Terminat la | 10/10/2026, 1:24:54 PM |
| `.ipa` | https://expo.dev/artifacts/eas/01OXMZJ5osSN6eVDb0UI4D5WfK1xdzXsju2e4JQsuqw.ipa |

Credențiale **reutilizate**, nimic creat: certificat `72EA09B2A39B97B4FE4D00C50A691367`, profil `XRWYZ25S84`, ambele expiră 10 Oct 2027.

### 0.6. Submit în TestFlight

```
Submission details: https://expo.dev/accounts/ortodoxia/projects/ortodoxia/submissions/57f48ef4-53b7-4191-8726-03acf162d0f1
✔ Submitted your app to Apple App Store Connect!
```

| Câmp | Valoare |
|---|---|
| Submission ID | **`57f48ef4-53b7-4191-8726-03acf162d0f1`** |
| Status | **`finished`** (`submit:list`) |
| Build trimis | `3a373ba9-67c9-414e-a534-b92ba442d348` (buildNumber 8) |
| ASC App ID | 6821265789 |
| Exit | **0** |

Notă de metodă: `npx eas-cli submit --platform ios --profile production --non-interactive` **fără** `--id` răspunde `You need to specify the archive source when running in non-interactive mode` (exit 1); comanda corectă pentru această schemă de credențiale e cu `--id <build-ID>` — exact cum s-a procedat și în runda 4.

### 0.7. Verificare directă la Apple

La 13:28 (2 min după upload) build 8 nu apăruse încă; la 13:31:

```
HTTP 200 OK
build-uri gasite: 3
  build 8 | processingState=VALID | uploaded=2026-10-10T03:29:17-07:00 | expired=false
  build 6 | processingState=VALID | uploaded=2026-10-10T01:47:39-07:00 | expired=false
  build 5 | processingState=VALID | uploaded=2026-10-10T01:33:41-07:00 | expired=false
```

**Build 8 e primit și validat automat de Apple (`processingState=VALID`), fără nicio eroare `ITMS-…`.** Disponibil în TestFlight: https://appstoreconnect.apple.com/apps/6821265789/testflight/ios

---

## 0B. Runda 4 — cheia RevenueCat Apple reală

### 0.1. Ce am schimbat — fișier + linie

**`eas.json`** — valoarea placeholder `REPLACE_WITH_APP_STORE_PUBLIC_KEY` înlocuită cu cheia reală, în **ambele** profile:

| Linie | Profil | Cheie | Valoare |
|---|---|---|---|
| **35** | `preview` | `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | `appl_voOlpavdeOGYDVBEdGegdUTFUbh` |
| **53** | `production` | `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | `appl_voOlpavdeOGYDVBEdGegdUTFUbh` |

Cheia Google (`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`) **nu a fost atinsă** — e pe liniile 38 și 56, nemodificate.

```
$ Select-String eas.json -Pattern "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY"
35: "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY": "appl_voOlpavdeOGYDVBEdGegdUTFUbh",
53: "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY": "appl_voOlpavdeOGYDVBEdGegdUTFUbh",
$ (Select-String eas.json -Pattern "REPLACE_WITH" | Measure-Object).Count
0
$ (Select-String eas.json -Pattern "appl_voOlpavdeOGYDVBEdGegdUTFUbh" | Measure-Object).Count
2
```

### 0.2. Dovada că EAS rezolvă cheia în ambele profile

`npx eas-cli@24.12.1 config --platform ios --profile <p> --non-interactive` (filtrat, ca să nu scriu alte valori de mediu în raport):

```
=== profile production ===
Environment variables loaded from the "production" build profile "env" configuration: ENVIRONMENT,
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY, EXPO_PUBLIC_SUPABASE_URL, ...
    "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY": "appl_voOlpavdeOGYDVBEdGegdUTFUbh",
=== profile preview ===
Environment variables loaded from the "preview" build profile "env" configuration: ...
    "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY": "appl_voOlpavdeOGYDVBEdGegdUTFUbh",
```

Niciun `REPLACE_WITH` / „placehold" în ieșirea rezolvată. În plus, la pornirea build-ului 6 EAS a listat explicit variabila între cele încărcate: `Environment variables loaded from the "production" build profile "env" configuration: ENVIRONMENT, EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY, …`.

### 0.3. Porțile — ieșirea reală

| Poartă | Ieșire reală | Exit |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit --pretty false` → nicio eroare | **0** |
| `npm test` | `tests 923` · `suites 10` · **`pass 923`** · `fail 0` · `skipped 0` · `todo 0` · `duration_ms 11074.8076` | **0** |
| `npm run test:release` | `passed: 31   failed: 0   deferred: 3` → **`deferred: 2`**, **`CI GATE: PASSED.`** | **0** |

`deferred` a scăzut **exact cum era prezis**, cu linia cheii App Store:

```
runda 3 (înainte):  DEFERRED [release] store key(s) outside this launch are still unset:
                                 EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY (App Store)
runda 4 (acum):     (linia a dispărut)
```

`Compare-Object` între cele două ieșiri arată o singură diferență: `deferred: 3` → `deferred: 2` plus dispariția liniei de mai sus. Restul liniilor sunt identice — **niciun test nu a fost modificat, nicio verificare nu a fost slăbită** (`passed: 31` în ambele runde, `failed: 0` în ambele).

Cele 2 DEFERRED rămase:

```
DEFERRED [config] App Store-only variables not set locally: EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY
DEFERRED [calendar] calendar data covers only 2026 — no rows for 2027
```

Prima rămâne pentru că verifică **`.env`-ul local** (mediul de dezvoltare), nu `eas.json` — cheia e setată în profilurile de build, care e ce contează pentru binar. A doua nu are legătură cu iOS.

### 0.4. Build nou semnat

```
$ npx eas-cli@24.12.1 build --platform ios --profile production --non-interactive
- Incrementing buildNumber from 5 to 6.
✔ Incremented buildNumber from 5 to 6.
✔ Using remote iOS credentials (Expo server)
Distribution Certificate  Serial Number 72EA09B2A39B97B4FE4D00C50A691367  Expiration Sun, 10 Oct 2027
Provisioning Profile      Developer Portal ID XRWYZ25S84  Status active
✔ All credentials are ready to build @ortodoxia/ortodoxia (ro.ortodoxia.app)
✔ Build finished
🍎 iOS app: https://expo.dev/artifacts/eas/Dzrio2abAqty4uFJ0OPUrMmwWu05ojwmY4s1E42Dy3M.ipa
```

```
$ npx eas-cli@24.12.1 build:view 59c51b0a-4bea-4482-94c1-b964297112ba

ID                       59c51b0a-4bea-4482-94c1-b964297112ba
Platform                 iOS
Status                   finished
Profile                  production
Distribution             store
Version                  1.0.0
Build number             6
Fingerprint              26c83402eeeffa044b334d78185505547ca4e383
Started at               10/10/2026, 11:39:19 AM
Finished at              10/10/2026, 11:44:55 AM
BUILDVIEW_EXIT=0
```

**Build ID: `59c51b0a-4bea-4482-94c1-b964297112ba` · buildNumber 6** (cel așteptat) · `store` + `finished` = semnat de App Store. Certificatul de distribuție și profilul de provisioning au fost **reutilizate** (create de owner; eu nu am creat credențiale, nu am răspuns niciunui prompt).

### 0.5. Submit în TestFlight

```
$ npx eas-cli@24.12.1 submit --platform ios --profile production --non-interactive --id 59c51b0a-4bea-4482-94c1-b964297112ba

Build:
    Build ID    :  59c51b0a-4bea-4482-94c1-b964297112ba
    Build number:  6
Submission details: https://expo.dev/accounts/ortodoxia/projects/ortodoxia/submissions/dffe415b-bd8c-447a-a501-be97bade4206
Your binary has been successfully uploaded to App Store Connect!
SUBMIT_EXIT=0
```

Confirmare (a doua sursă), `submit:list`:

```
ID                  dffe415b-bd8c-447a-a501-be97bade4206
Status              finished
Build ID            59c51b0a-4bea-4482-94c1-b964297112ba
Build number        6
Started at          10/10/2026, 11:46:28 AM
```

**Submission ID: `dffe415b-bd8c-447a-a501-be97bade4206` · status `finished` · exit 0 · nicio eroare ITMS.**

### 0.6. Verificare finală direct la Apple

```
GET https://api.appstoreconnect.apple.com/v1/builds?filter[app]=6821265789&limit=10&sort=-uploadedDate

la 11:48 (2 min după upload):   HTTP 200 OK · build-uri gasite: 1   (doar build 5 = încă în validare)
la 11:50 (4 min după upload):   HTTP 200 OK · build-uri gasite: 2
    build 6 | processingState=VALID | uploaded=2026-10-10T01:47:39-07:00 | expired=false
    build 5 | processingState=VALID | uploaded=2026-10-10T01:33:41-07:00 | expired=false
```

**Build 6 e primit de Apple și validat automat (`processingState=VALID`)** — nicio eroare de tip `ITMS-...`. Ambele build-uri (5 și 6) sunt valide în App Store Connect, deci disponibile în TestFlight: https://appstoreconnect.apple.com/apps/6821265789/testflight/ios

---

## 0A. Runda 3 — respingerea Apple pe binarul 4 și reparația

### 0.1. Motivul real, verbatim (dat de DSH, din App Store Connect)

```
ITMS-90683: Missing purpose string in Info.plist
... the "Ortodoxia.app" bundle should contain a NSPhotoLibraryUsageDescription key
with a user-facing purpose string ...
```

Cauza (verificată de DSH în proiect): **nu există nicio funcție de atașare poze** și nici `expo-image-picker` / media-library în `package.json`. Cheia e cerută pentru că **`expo-image`** (folosit în `src/app/(tabs)/index.tsx`) referențiază API-urile Photos; Apple cere textul chiar dacă aplicația nu deschide galeria.

### 0.2. Ce am schimbat — fișier + linie (punctul 1)

**`app.json`**, în `expo.ios.infoPlist`, exact două linii adăugate:

| Linie | Cheie | Valoare |
|---|---|---|
| **19** | `NSPhotoLibraryUsageDescription` | `Permite aplicației Ortodoxia să acceseze fotografiile tale pentru a afișa imaginile din aplicație.` |
| **20** | `NSPhotoLibraryAddUsageDescription` | `Permite aplicației Ortodoxia să salveze imagini în galeria ta.` |

Cheile existente **nu au fost atinse** — `app.json` liniile 16 (`NSSpeechRecognitionUsageDescription`), 17 (`NSMicrophoneUsageDescription`), 18 (`ITSAppUsesNonExemptEncryption: false`), 14 (`supportsTablet: false`) sunt neatinse. Nu am adăugat nicio cheie de cameră / localizare / contacte.

Dovadă că s-au adăugat exact liniile astea și nimic altceva:

```
$ git diff --stat -- app.json
 app.json | 6 +-
$ git diff -- app.json   (doar liniile schimbate)
+      "supportsTablet": false,                          <- task 1
+        "ITSAppUsesNonExemptEncryption": false,         <- task 1
+        "NSPhotoLibraryUsageDescription": "...",        <- task 3, linia 19
+        "NSPhotoLibraryAddUsageDescription": "..."      <- task 3, linia 20
```

### 0.3. Dovada că Info.plist rezolvat conține cheile (punctul 6)

`npx expo config --type introspect --json` → scris pe disc **octet cu octet** (PowerShell `>` ar re-coda UTF-8 ca cp1252 și ar strica diacriticele; am folosit un script care scrie stdout exact). Apoi am comparat valorile din `app.json` cu cele din plist-ul rezolvat, caracter cu caracter:

```
citesc: introspect-3.json (22043 bytes)
NSPhotoLibraryUsageDescription
  app.json  : IDENTIC cu textul cerut
  Info.plist: IDENTIC cu textul cerut
  codepoints non-ASCII (app.json) : 021b 0103 0219 021b
  codepoints non-ASCII (plist)    : 021b 0103 0219 021b
NSPhotoLibraryAddUsageDescription
  app.json  : IDENTIC cu textul cerut
  Info.plist: IDENTIC cu textul cerut
  codepoints non-ASCII (app.json) : 021b 0103 00ee
  codepoints non-ASCII (plist)    : 021b 0103 00ee
---
REZULTAT: OK — textele sunt exact cele cerute, in app.json si in Info.plist rezolvat.
```

Codepoints-urile `021b` = ț, `0103` = ă, `0219` = ș, `00ee` = î — deci diacriticele sunt corecte în build, nu doar „arătau bine". (Mojibake-ul care se vede în consola PowerShell e doar afișarea consolei.) Dovada brută: `dovezi-ios\introspect-3.json` + `dovezi-ios\check-plist-strings-3.txt`.

A doua dovadă, independentă de introspecție (compară direct `app.json` cu textele cerute și scrie rezultatul octet-cu-octet, ca să nu poată interveni codarea consolei):

```
chei infoPlist: ["NSSpeechRecognitionUsageDescription","NSMicrophoneUsageDescription","ITSAppUsesNonExemptEncryption","NSPhotoLibraryUsageDescription","NSPhotoLibraryAddUsageDescription"]
NSPhotoLibraryUsageDescription: IDENTIC cu textul cerut
  codepoints non-ASCII: 21b 103 219 21b
NSPhotoLibraryAddUsageDescription: IDENTIC cu textul cerut
  codepoints non-ASCII: 21b 103 ee
alte chei in infoPlist (neatinse): ["NSSpeechRecognitionUsageDescription","NSMicrophoneUsageDescription","ITSAppUsesNonExemptEncryption"]
REZULTAT: OK        VERIFY_EXIT=0
```

Adică `infoPlist` are **exact 5 chei**: cele 3 care existau (microfon, dictare, `ITSAppUsesNonExemptEncryption`) plus cele 2 noi de poze — **nicio cheie de cameră, localizare sau contacte**. Dovada: `dovezi-ios\app-json-keys-final.txt`.

### 0.4. Porțile, ieșirea reală (punctul 2)

| Poartă | Ieșire reală | Exit |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit --pretty false` → nicio eroare, nicio linie de ieșire | **0** |
| `npm test` | `tests 923` · `suites 10` · **`pass 923`** · `fail 0` · `skipped 0` · `todo 0` · `duration_ms 18529.9804` | **0** |
| `npm run test:release` | `passed: 31   failed: 0   deferred: 3` → **`CI GATE: PASSED.`** | **0** |

**Nu am modificat niciun test și niciun script de poartă — și nu a fost nevoie.** Dovada că nu am slăbit nimic:

```
$ git diff --stat -- tests/release-config.test.mjs tests/release-store-keys.test.mjs scripts/release-readiness.mjs scripts/lib/store-keys.mjs
(ieșire goală — niciunul dintre fișierele de poartă nu a fost atins)
```

De ce nu a fost nevoie: verificarea din `scripts/release-readiness.mjs` (liniile 684-696) e o **listă de așteptare pe două perechi de chei** — `NSSpeechRecognitionUsageDescription` ↔ `speechRecognitionPermission` (690) și `NSMicrophoneUsageDescription` ↔ `microphonePermission` (691) — și verifică doar că fiecare pereche e completată și că cele două locuri coincid. **Cheile în plus nu o deranjează**, deci a trecut cu noile chei fără să ating nimic. Poarta „the iOS permission messages agree with the speech plugin" a rămas `PASS` (nu am slăbit-o, nu am adăugat o excepție).

### 0.5. Build nou semnat + submit (punctele 3, 4)

**Build 5 — GATA, semnat de App Store:**

```
$ npx eas-cli@24.12.1 build:view 4d85f69b-8a19-4cb5-9dc2-56a31706740e

ID                       4d85f69b-8a19-4cb5-9dc2-56a31706740e
Platform                 iOS
Status                   finished
Profile                  production
Distribution             store
SDK Version              57.0.0
Version                  1.0.0
Build number             5
Commit                   1d9a41ad86089830db65b2e29cda72155f251704
Logs                     https://expo.dev/accounts/ortodoxia/projects/ortodoxia/builds/4d85f69b-8a19-4cb5-9dc2-56a31706740e
Application Archive URL  https://expo.dev/artifacts/eas/ZIHW5fAXPQBrL8hHjFymK-7fAvUeVOIBSU_H6F5vvIE.ipa
Fingerprint              52cf3c5ec8f289c76d8b67afe00b7ee528162036
Started at               10/10/2026, 11:25:22 AM
Finished at              10/10/2026, 11:31:50 AM
Started by               ortodoxia123
BUILDVIEW_EXIT=0
```

**Build ID: `4d85f69b-8a19-4cb5-9dc2-56a31706740e`** · link: https://expo.dev/accounts/ortodoxia/projects/ortodoxia/builds/4d85f69b-8a19-4cb5-9dc2-56a31706740e · `.ipa`: https://expo.dev/artifacts/eas/ZIHW5fAXPQBrL8hHjFymK-7fAvUeVOIBSU_H6F5vvIE.ipa

`Build number 5` = numărul prezis (build 4 respins → următorul e 5), `Distribution: store` + `finished` = semnat pentru App Store, nu simulator. **Nu am creat niciun certificat nou și nu am răspuns niciunui prompt** — am folosit certificatul de distribuție și profilul create de owner (vezi §5).

**Submit în TestFlight — GATA:**

```
$ npx eas-cli@24.12.1 submit --platform ios --profile production --non-interactive --id 4d85f69b-8a19-4cb5-9dc2-56a31706740e

ASC App ID:                 6821265789
App Store Connect API Key:
    Key ID    :  7Q8HDTYAVJ
    Key Source:  local
    Key Path  :  C:\Users\pcgar\Documents\ortodoxia-keystore-backup\AuthKey_7Q8HDTYAVJ.p8
Build:
    Build ID    :  4d85f69b-8a19-4cb5-9dc2-56a31706740e
    App Version :  1.0.0
    Build number:  5
Submission details: https://expo.dev/accounts/ortodoxia/projects/ortodoxia/submissions/da1b29db-5d88-40e6-b59d-f3057882db84
Your binary has been successfully uploaded to App Store Connect!
- It is now being processed by Apple - you will receive an email when the processing finishes.
SUBMIT_EXIT=0
```

**Submission ID: `da1b29db-5d88-40e6-b59d-f3057882db84` · exit 0 · fără erori.** Confirmare independentă (a doua sursă), `submit:list`:

```
ID                  da1b29db-5d88-40e6-b59d-f3057882db84
Status              finished
Build ID            4d85f69b-8a19-4cb5-9dc2-56a31706740e
Build Profile       production
App Version         1.0.0
Build number        5
Started at          10/10/2026, 11:32:31 AM
Finished at         10/10/2026, 11:32:43 AM
```

A treia sursă — direct la Apple (JWT ES256 semnat în proces, cheia citită doar în memorie, niciodată afișată):

```
GET https://api.appstoreconnect.apple.com/v1/builds?filter[app]=6821265789&limit=10&sort=-uploadedDate

la 11:34 (2 min după upload):   HTTP 200 OK · build-uri gasite: 0        (normal: binarul era în validare)
la 11:36 (4 min după upload):   HTTP 200 OK · build-uri gasite: 1
    build 5 | processingState=VALID | uploaded=2026-10-10T01:33:41-07:00 | expired=false
```

**Asta e dovada care închide bucla:** binarul 5 e **vizibil în App Store Connect și `processingState = VALID`**, la ~3 minute după upload. Adică **validarea automată Apple a trecut** — dacă `NSPhotoLibraryUsageDescription` ar fi lipsit în continuare, Apple ar fi respins binarul cu același `ITMS-90683` (așa cum s-a întâmplat cu build 4, care nici nu mai apare în listă). Nu a venit nicio eroare nouă de validare.

`HTTP 200` = cheia API ASC e validă și autorizată pe aplicație. Build-ul e deci în TestFlight: https://appstoreconnect.apple.com/apps/6821265789/testflight/ios

**De ce e rezolvată cauza respingerii:** respingerea a fost `Missing purpose string in Info.plist` → textul e în `app.json` (linii 19-20) **și** dovedit în Info.plist-ul rezolvat (§0.3), deci în `.ipa`-ul trimis ca build 5. Nu am schimbat nimic altceva care ar putea atrage altă respingere.

---

## 1. Task 2 — ce am schimbat (fișier + linie)

**`eas.json`, liniile 76-84** — blocul `submit.production.ios`. Înainte era gol (cu placeholderele `REPLACE_WITH_ASC_APP_ID` / `REPLACE_WITH_APPLE_TEAM_ID` din task 1).

```json
"submit": {                          // linia 75
  "production": {                    // linia 76
    "ios": {                         // linia 77
      "ascAppId": "6821265789",                                              // 78
      "appleTeamId": "WZFJU53RD7",                                           // 79
      "ascApiKeyPath": "C:\\Users\\pcgar\\Documents\\ortodoxia-keystore-backup\\AuthKey_7Q8HDTYAVJ.p8",  // 80
      "ascApiKeyIssuerId": "40efa48c-c05b-4c67-b958-cf21ed707063",           // 81
      "ascApiKeyId": "7Q8HDTYAVJ"                                            // 82
    }
  }
}
```

Dovadă: `git diff --stat eas.json` → `1 file changed, 18 insertions(+), 1 deletion(-)`; verificare programatică a cheilor blocului `submit` → `["ascAppId","appleTeamId","ascApiKeyPath","ascApiKeyIssuerId","ascApiKeyId"]`, `placeholdere ramase: null`.

În `eas.json` intră **doar calea** către `.p8`, nu conținutul cheii. Cheia rămâne în afara repo-ului. Am confirmat doar existența și mărimea ei (`p8 exista: True`, `258` bytes), fără să-i citesc conținutul.

---

## 2. Prima rundă de build semnat (task 2) — GATA

```
$ npx eas-cli@24.12.1 build:view 05f8c309-b691-4984-9cb7-1004c3eb5a25

ID                       05f8c309-b691-4984-9cb7-1004c3eb5a25
Status                   finished
Profile                  production
Distribution             store
Version                  1.0.0
Build number             4
Started at               10/10/2026, 11:09:45 AM
Finished at              10/10/2026, 11:15:48 AM
Application Archive URL  https://expo.dev/artifacts/eas/Pz4WCSyELbr-nEceYa5k7VwFGbPSSUKpTaHxhulGldE.ipa
```

Aceasta e versiunea pe care Apple a respins-o ca **build 4** (§0.1). Se păstrează în raport ca istoric.

---

## 3. Prima rundă de submit (task 2) — GATA

```
$ npx eas-cli@24.12.1 submit --platform ios --profile production --non-interactive --id 05f8c309-b691-4984-9cb7-1004c3eb5a25

- Creating TestFlight group...
✔ TestFlight group created: Team (Expo)
Build:
    Build ID    :  05f8c309-b691-4984-9cb7-1004c3eb5a25
    Build number:  4
Submission details: https://expo.dev/accounts/ortodoxia/projects/ortodoxia/submissions/d8d18c6f-01b2-48de-9531-b79f3d71e4eb
Your binary has been successfully uploaded to App Store Connect!
SUBMIT_EXIT=0
```

**Submission ID: `d8d18c6f-01b2-48de-9531-b79f3d71e4eb` · exit 0** (binarul respins ulterior de Apple).

---

## 4. Porțile din prima rundă (task 2)

| Poartă | Rezultat | Exit |
|---|---|---|
| `npm run typecheck` | nicio eroare | **0** |
| `npm test` | `tests 923` · **`pass 923`** · `fail 0` | **0** |
| `npm run test:release` | `passed: 31   failed: 0   deferred: 3` → `CI GATE: PASSED.` | **0** |

Poarta de secrete a trecut și după completarea `eas.json`: `PASS [security] no hardcoded credential pattern found in the tracked tree`. Verificare suplimentară pe rapoarte: fără conținut de cheie privată (`OK: niciun continut de cheie privata in rapoarte`).

---

## 5. Ce a fost blocat la prima încercare de build (istoric, util de știut)

Prima încercare de build non-interactiv a picat, pentru că proiectul nu avea încă certificat de distribuție pe serverele EAS:

```
$ npx eas-cli@24.12.1 build --platform ios --profile production --non-interactive --no-wait
✔ Incremented buildNumber from 1 to 2.
✔ Using remote iOS credentials (Expo server)
Distribution Certificate is not validated for non-interactive builds.
Failed to set up credentials.
Credentials are not set up. Run this command again in interactive mode.
    Error: build command failed.
EXIT=1
```

Cauza reală, citită în sursa CLI (`credentials/ios/actions/SetUpDistributionCertificate.js` → `runNonInteractiveAsync`): în mod non-interactiv EAS **preia** un certificat existent, dar nu creează niciodată unul; crearea există doar în ramura interactivă. Iar `credentials:configure-build` a confirmat exact întrebarea blocantă:

```
Input is required, but stdin is not readable. Failed to display prompt: Generate a new Apple Distribution Certificate?
```

Shell-ul de agent nu e TTY (`isNonInteractiveByDefault()` = `CI` sau `!process.stdin.isTTY`, în `commandUtils/flags.js`), deci nu puteam răspunde. Am respectat interdicția: nu am creat certificat, nu am strecurat răspuns. Ownerul a rulat pasul o dată într-un terminal real → de aici „All credentials are ready to build" și build-urile reușite din §0.5 și §2.

Efect secundar rămas de știut: numărătorul remote de versiune a avansat (1 → 2 la prima încercare, apoi 4 la build-ul respins, apoi **5**). Numerele de build nu se refolosesc niciodată — e normal și inofensiv.

---

## 6. Ce mai lipsește (neblocant pentru TestFlight)

1. **Procesarea Apple** — build-urile 5, 6 **și 8** sunt `processingState=VALID` la Apple; ultimul (`3a373ba9…`, buildNumber 8) e cel din runda 5, cel care conține reparația de limbă și diagnosticul. Rămâne partea de TestFlight care nu depinde de noi (grupul de testeri / emailul de disponibilitate).
2. **Blocul de diagnostic de preț din `src/app/premium.tsx` (§0.3) e TEMPORAR și trebuie scos înainte de trimiterea la review** — ownerul îl păstrează în build până citește valorile de pe telefon (instrucțiune explicită: „NU scoate diagnosticul până nu-ți spun"). Fără o rundă nouă după scoatere, binarul din TestFlight conține text de diagnostic vizibil pentru utilizator.
3. **`CFBundleLocalizations`** e acum în plist (§0.1) — de confirmat pe telefon că aplicația pornește în română (dovada de aici e doar plist-ul rezolvat, nu comportamentul la rulare).
4. **`EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`** — **rezolvată în runda 4**: cheia reală e în `eas.json` pe liniile 35 și 53 (§0B.1). Rămâne un DEFERRED, dar doar la nivel local: `[config] App Store-only variables not set locally` verifică `.env`-ul de dezvoltare, nu `eas.json` — nu afectează binarul (EAS a încărcat variabila în build-urile 6 și 8).
5. **`autoIncrement`** lipsește din profilul `production` din `eas.json` (raportat și în task 1) — la următorul upload de aceeași versiune ar fi nevoie de grijă.
6. **`aps-environment`** apare ca `development` în introspecție (întrebare rămasă din task 1, nerezolvată) — de urmărit la primul test real de notificări push pe un build de TestFlight.
7. Nimic nu e comis (constrângere respectată: nu fac commit). `git status`: `M app.json`, `M eas.json`, `M src/app/premium.tsx`, `?? RAPORT-IOS-BUILD.md` — plus modificările care erau deja în proiect înainte de mine (`AGENTS.md`, `package.json`, `plugins/with-android-hardening.js`, `supabase/functions/orthodox-chat/index.ts`, `tests/android-hardening.test.mjs`, `tests/chat-backend.test.mjs`, `tsconfig.edge.json`). **Nu am atins niciunul dintre acele fișiere.**

---

## 7. Dovezi pe disc

`C:\Users\pcgar\OpenWorker\dsh-ff149ee3-3f7\dovezi-ios\`:

- runda 5 (cea mai recentă): `introspect-4.json` · `introspect-4-infoPlist.txt` (dovada `CFBundleLocalizations`) · `gate-typecheck-t5.txt` + `gate-tests-t5.txt` + `gate-release-t5.txt` (porțile după diagnostic) · `gate-typecheck-t6.txt` + `gate-tests-t6.txt` + `gate-release-t6.txt` (porțile după ambele modificări) · `build-prod-7.txt` + `build7-cancel.txt` (build-ul anulat) · `build-prod-8.txt` · `build-list-t6.txt` + `build-list-t6b.txt` (build 8 `finished`, build 7 `canceled`) · `submit-prod-4.txt` · `submit-list-4.txt` · `asc-builds-check-5.txt` (**build 8 `VALID`**) · `RAPORT-IOS-BUILD.md` (copia acestui raport)
- runda 4: `build-prod-6.txt` (build-ul, cu credențialele reutilizate) · `build-prod-view-3.txt` · `submit-prod-3.txt` · `submit-list-3.txt` · `asc-builds-check-4.txt` · `gate-typecheck-t4.txt` · `gate-tests-t4.txt` · `gate-release-t4.txt` · `RAPORT-IOS-BUILD.md` (copia acestui raport)
- task 3: `build-prod-view-2.txt` · `submit-prod-2.txt` · `submit-list-2.txt` · `asc-builds-check-2.txt` (0 la 1 min) + `asc-builds-check-3.txt` (**build 5, `VALID`**) · `introspect-3.json` · `introspect-3-run.txt` · `check-plist-strings-3.txt` · `app-json-keys-final.txt` · `gate-typecheck-t3.txt` · `gate-tests-t3.txt` · `gate-release-t3.txt` · `RAPORT-IOS-BUILD.md` (copia acestui raport)
- task 2: `build-prod-view.txt` · `submit-prod.txt` · `submit-list.txt` · `asc-builds-check.txt` · `build-prod.txt` + `creds-configure-build.txt` (prima încercare blocată, istoric) · `gate-*-t2.txt`
- task 1: `gate-*.txt` · `eas-build.txt` · `introspect.json` · `introspect-2*.json` · `RAPORT-IOS-PREGATIRE.md`

Temporarele din sesiune (scripturile de verificare) au fost șterse după scrierea raportului.

---

## 8. Verdict

**PASS.**

| Punct din brief (runda 5 — cea curentă) | Stare |
|---|---|
| A. `CFBundleLocalizations` în `app.json` → `ios.infoPlist` cu exact cele 10 limbi din `COMPLETE_LANGUAGES`; nicio altă cheie atinsă; niciun pachet instalat | **GATA** — `app.json` **linia 21**, lista identică cu `src/i18n/config.ts:6` (§0.1) |
| A3. Dovada prin `npx expo config --type introspect` | **GATA** — plist-ul rezolvat conține `CFBundleLocalizations` cu 10 limbi (§0.2) |
| B. Porțile, ieșirea reală | **GATA** — typecheck **exit 0** · `npm test` **923/923, 0 fail**, exit 0 · `test:release` `passed: 31 failed: 0 deferred: 2`, `CI GATE: PASSED.`, exit 0 · a11y clean pe 70 de fișiere. Nicio poartă nu a interzis diagnosticul; niciun test slăbit (§0.4) |
| C. Build semnat non-interactiv, `finished`, buildNumber 8 | **GATA** — **`3a373ba9-67c9-414e-a534-b92ba442d348`**, `production`/`store`, v1.0.0, **buildNumber 8**, `finished` 13:24:54 (§0.5). Primul build al rundei (`33769bf8…`, buildNumber 7) a fost anulat pentru că era pornit înainte de reparația limbii |
| C. Submit non-interactiv + verificare cu `submit:list` | **GATA** — submission **`57f48ef4-53b7-4191-8726-03acf162d0f1`**, status **`finished`**, exit 0, ascAppId 6821265789 (§0.6); `build:list` confirmă build 8 `finished`, build 7 `canceled`; Apple: build 8 `processingState=VALID` (§0.7) |
| D. Diagnosticul de preț rămâne în build | **GATA** — păstrat, marcat „DIAGNOSTIC TEMPORAR" în 3 locuri (§0.3); se scoate doar la cererea ownerului (§6.2) |

| Punct din brief (runda 4) | Stare |
|---|---|
| 1. Cheia reală în `eas.json`, ambele profile, fără să ating cheia Google | **GATA** — liniile 35 și 53, valoarea `appl_voOlpavdeOGYDVBEdGegdUTFUbh`; 0 placeholdere rămase în fișier (§0.1) |
| 2. Dovadă că nu mai există placeholder | **GATA** — `Select-String`: 0× `REPLACE_WITH`, 2× cheia nouă; `eas config` pentru `production` și `preview` rezolvă cheia reală (§0.2) |
| 3. Porțile | **GATA** — typecheck exit 0 · `npm test` 923 pass / 0 fail, exit 0 · `test:release` `passed: 31 failed: 0 deferred: 2`, `CI GATE: PASSED.`, exit 0; DEFERRED 3 → 2, exact linia cheii App Store a dispărut (§0.3) |
| 4. Build semnat nou (ID + buildNumber) | **GATA** — `59c51b0a-4bea-4482-94c1-b964297112ba`, `production`, `store`, v1.0.0, **buildNumber 6**, `finished` 11:44:55 (§0.4) |
| 5. Submit în TestFlight (ID + status) | **GATA** — submission `dffe415b-bd8c-447a-a501-be97bade4206`, `finished`, exit 0, fără eroare ITMS; **Apple a confirmat build 6 ca `processingState=VALID`** (§0.6) |
| 6. Raport | **GATA** (acest fișier) |

| Punct din brief (task 3) | Stare |
|---|---|
| 1. Două chei `NSPhotoLibrary*UsageDescription` în `app.json` → `ios.infoPlist`, cheile existente neatinse, fără chei de cameră/localizare/contacte | **GATA** — `app.json` liniile 19 și 20 (§0.2) |
| 2. Porțile, ieșirea reală; testul de release actualizat DOAR ca listă corectă, fără slăbire | **GATA** — typecheck 0 · `npm test` 923 pass / 0 fail · `test:release` 31 pass / 0 fail / 3 deferred, `CI GATE: PASSED.` (§0.4). **Nu a fost nevoie de nicio modificare de test/poartă**: verificarea de permisiuni (`scripts/release-readiness.mjs:684-696`) e o listă pe două perechi de chei, iar cheile în plus o lasă `PASS`; `git diff` pe cele patru fișiere de poartă e gol (§0.4) |
| 3. Rebuild semnat, ID nou | **GATA** — `4d85f69b-8a19-4cb5-9dc2-56a31706740e`, `production`, `store`, v1.0.0 (**build number 5**), `finished` 11:31:50 (§0.5) |
| 4. Submit în TestFlight, rezultatul real | **GATA** — submission `da1b29db-5d88-40e6-b59d-f3057882db84`, `finished`, exit 0, „successfully uploaded to App Store Connect"; **binarul 5 apare la Apple ca `processingState=VALID`** (§0.5) |
| 5. Raport (fișier+linie, porți, build ID, submit, eroare verbatim dacă respinge iar) | **GATA** (acest fișier) |
| 6. `npx expo config --type introspect` ca dovadă că Info.plist conține cheile | **GATA** — ambele chei prezente, texte identice cu cele cerute, codepoints `021b 0103 0219` / `00ee` (§0.3) |

| Punct din brief (task 2, runda anterioară) | Stare |
|---|---|
| 1. `eas.json` → `submit.production.ios` completat, placeholdere dispărute | **GATA** (§1) |
| 2. Credențiale EAS iOS cu cheia API | **GATA** — cheia API funcționează (HTTP 200 la Apple); certificatul + profilul au fost create de owner în terminal; eu nu am creat credențiale și nu am răspuns promptului (§5) |
| 3. Build de producție semnat (ID + link) | **GATA** — `05f8c309-…` (build 4, respins de Apple) → refăcut ca `4d85f69b-…` (build 5, §0.5) |
| 4. Submit în TestFlight | **GATA** — `d8d18c6f-…` (binarul respins) → `da1b29db-…` (validat de Apple, `VALID`, §0.5) |
| 5. Porți (`typecheck`, `npm test`, `test:release`) | **GATA** — verzi în ambele runde (§0.4, §4) |
| 6. Raport | **GATA** (acest fișier) |

**Ce NU pot declara:** că nu mai vine nicio altă observație de la Apple — Apple poate trimite observații și **după** validarea binarului (la revizuirea aplicației pentru App Store, nu la TestFlight). Ce pot declara, cu dovadă: binarul 5 e **validat automat și vizibil în App Store Connect** (`build 5 … processingState=VALID`, §0.5), deci `ITMS-90683` e închis — dacă textul ar fi lipsit în continuare, binarul ar fi fost respins ca build 4, care nici nu mai apare în listă.
