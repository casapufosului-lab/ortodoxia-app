# Verificare automată pe dispozitiv (Maestro) — Android local + simulator iOS în Codemagic

DE CE EXISTĂ: până acum, singura cale de a vedea dacă aplicația chiar funcționează pe iOS era să
urci un build în TestFlight și să-l deschizi pe telefonul ownerului. Așa a trecut neobservat
defectul „WebView-ul playerului primește `about:blank`" (build-urile 11–20): fiecare build părea
bun până ajungea pe un iPhone. Flow-urile din `maestro/` prind această clasă de defect **înainte**
de urcarea build-ului.

CE NU FACE: nu publică nimic. Workflow-ul `ios-verify` nu are secțiune `publishing` și nu atinge
TestFlight sau App Store Connect.

---

## 1. Ce este Maestro și de ce el

[Maestro](https://github.com/mobile-dev-inc/Maestro) este un instrument open source (Apache 2.0)
care conduce aplicația pe dispozitiv ca un utilizator: apasă, scrie, așteaptă, citește ecranul.
Flow-urile sunt fișiere YAML, în depozit, fără cod de test și fără dependențe noi în `package.json`
(Maestro se instalează separat, pe mașină, nu în runtime-ul aplicației).

Aplicația nu are `testID`-uri (`grep -r testID src/` → gol), deci flow-urile fac aserțiuni pe
**texte reale** (chei i18n cu diacritice, luate din `src/i18n/config.ts`) și pe **etichete de
accesibilitate**. Textele nu au fost scrise de mână: au fost extrase cu un script, fiindcă
PowerShell distorsionează diacriticele românești.

---

## 2. Flow-urile (un fișier per scenariu)

| Fișier | Scenariu | Aserțiunea care doare |
|---|---|---|
| `maestro/live.yaml` | Slujbe LIVE → playerul chiar încarcă | pagina playerului s-a terminat de încărcat (`incarcat=da`) și adresa NU e `about:blank`; pe iOS, pagina noastră de embed a răspuns (`page-ready`) |
| `maestro/chat.yaml` | o întrebare → răspuns al asistentului | apare „Raportează" (buton care există doar sub un răspuns complet) și NU apar textele de eroare / de cotă epuizată |
| `maestro/premium.yaml` | Premium → cardul fiecărui plan + butoanele | cardul NU e gol: arată fie butonul real („Activează planul lunar/anual", „Treci la …", „Planul tău actual"), fie textul care spune DE CE nu există buton (vizitator / magazin indisponibil / dispozitiv care nu poate cumpăra); plus „Anual" și nota de reînnoire, „Restaurează cumpărăturile" și nota de plată |
| `maestro/notifications.yaml` | „Activează notificările" → schimbarea stării | starea din card se schimbă în „Notificările sunt active." (sau, pentru un vizitator, butonul duce pe autentificare) |
| `maestro/set-language-ro.yaml` | prolog (nu e scenariu de sine stătător) | trece aplicația pe română, fiindcă aplicația urmează limba DISPOZITIVULUI |

Fiecare pas important are un `label:` care spune, în logul CI, **de ce** a picat — nu doar „assert
failed". Fără o transmisiune LIVE reală, `live.yaml` nu poate verifica playerul, deci pică explicit
la aserțiunea „există o transmisiune LIVE embeddabilă", în loc să raporteze un fals succes.

---

## 3. Android, local (gratuit, nelimitat)

Precondiții: `ANDROID_HOME` setat, un AVD pornit. Rețeta de mai jos este cea **rulată și dovedită**
pe 11.10.2026 (emulator `Pixel_7`, android-35, x86_64) — 4/4 flow-uri trecute.

```bat
REM 1. emulatorul. Fără fereastră: pe acest calculator fereastra îl omoară (UpdateLayeredWindowIndirect),
REM    iar pornirea dintr-un script care se termină îl ucide (job object) — se pornește detașat.
%ANDROID_HOME%\emulator\emulator.exe -avd Pixel_7 -no-window -no-audio -no-boot-anim
%ANDROID_HOME%\platform-tools\adb.exe wait-for-device
REM Dialogul „System UI isn't responding" al emulatorului acoperă ecranul și strică capturile;
REM animațiile lungesc fiecare pas până la timeout:
%ANDROID_HOME%\platform-tools\adb.exe shell settings put global hide_error_dialogs 1
%ANDROID_HOME%\platform-tools\adb.exe shell settings put global window_animation_scale 0
%ANDROID_HOME%\platform-tools\adb.exe shell settings put global transition_animation_scale 0
%ANDROID_HOME%\platform-tools\adb.exe shell settings put global animator_duration_scale 0

REM 2. APK de RELEASE pentru x86_64 (Release = bundle-ul JS e în aplicație, deci NU are nevoie de Metro).
REM    Un release normal cere keystore-ul de upload; pe un emulator de test se injectează cheia de debug.
cd C:\Users\pcgar\Documents\ortodoxia-app\android
gradlew.bat :app:assembleRelease -PreactNativeArchitectures=x86_64 ^
  -Pandroid.injected.signing.store.file=C:/Users/pcgar/Documents/ortodoxia-app/android/app/debug.keystore ^
  -Pandroid.injected.signing.store.password=android ^
  -Pandroid.injected.signing.key.alias=androiddebugkey ^
  -Pandroid.injected.signing.key.password=android --console=plain

REM 3. instalare. Dacă pe emulator există o instalare cu ALTĂ semnătură, adb dă
REM    INSTALL_FAILED_UPDATE_INCOMPATIBLE → întâi `adb uninstall ro.ortodoxia.app` (se pierde doar
REM    sesiunea de test a emulatorului).
adb install -r app\build\outputs\apk\release\app-release.apk

REM 4. flow-urile, UNUL CÂTE UNUL (un singur emulator ⇒ nu în paralel).
"%USERPROFILE%\.maestro\cli\maestro\bin\maestro.bat" --device emulator-5554 test maestro\live.yaml ^
  --format JUNIT --output maestro-out\live.xml ^
  --test-output-dir maestro-out\artifacts-live --debug-output maestro-out\debug-live
```

`maestro test maestro/` rulează toate flow-urile; `maestro test maestro/live.yaml` rulează unul
singur. `--format JUNIT --output …` scrie rezultatul mașină-citibil (`failures="0"` per flow), iar
`--test-output-dir` adună capturile `takeScreenshot:` într-un singur loc.

Trei lucruri fac diferența între „verde" și un roșu care NU e defect al aplicației:

1. **Limba.** Aplicația urmează limba DISPOZITIVULUI (persistată în AsyncStorage), nu pe cea din cod.
   Un emulator `en_US` afișează engleză, iar flow-urile asertează texte românești ⇒ pică de la prima
   poartă. De aceea fiecare flow are, imediat după `launchApp`, prologul `runFlow: set-language-ro.yaml`
   (Cont → secțiunea de limbă → „Română"; eticheta „Română" e identică în orice limbă, deci se poate
   apăsa „orbește").
2. **Textele se compară EXACT.** Maestro potrivește tot textul nodului (regex pe tot textul), nu
   prefixe: „Pagina playerului" NU prinde „Pagina playerului: https://…". Unde textul are sufix,
   poarta se scrie cu `.*`.
3. **Ordinea contează la derulare.** Derularea se oprește de îndată ce ținta devine vizibilă (poate
   rămâne chiar la marginea de jos), iar cardurile de plan sunt unul SUB altul ⇒ fiecare țintă are
   propriul pas de derulare. Prologul de limbă lasă ecranul Cont derulat, deci un titlu de ecran
   asertat imediat după el poate fi în afara ecranului.

---

## 4. iOS: verificare pe GitHub Actions (Codemagic a rămas doar pentru build-ul semnat)

Mutare făcută la 11.10.2026, la cererea ownerului: coada Codemagic ajunsese singurul lucru lent din
lanț — 114 min de așteptare pentru o rulare (care apoi a picat din altă cauză). **Maestro nu era
lent**: cele patru flow-uri rulează în ~4 minute.

Workflow-ul `ios-verify` din `.github/workflows/ios-verify.yml` (aceiași pași ca `ios-verify`-ul care
exista în `codemagic.yaml`, scos de acolo odată cu mutarea):

1. `npm ci`, scrie `.env` cu valorile publice `EXPO_PUBLIC_*`;
2. `npx expo prebuild --platform ios --clean`;
3. construiește `.app` **Release pentru simulator** — `xcodebuild -sdk iphonesimulator
   -configuration Release ... CODE_SIGNING_ALLOWED=NO`. Release, nu Debug, fiindcă un build Debug
   are nevoie de serverul Metro pornit, iar Release împachetează bundle-ul JS în aplicație (fără
   semnare: simulatorul nu cere profil de provisionare);
4. instalează Maestro CLI (`curl -Ls https://get.maestro.mobile.dev | bash`);
5. pornește primul simulator iPhone disponibil, instalează aplicația;
6. rulează cele patru flow-uri, **unul câte unul**, scrie `maestro-<flow>.xml` (JUnit) și face câte
   o captură de ecran a simulatorului pentru fiecare; la final afișează un tabel PASS/FAIL și iese
   cu cod de eroare dacă a picat oricare.

SE PORNEȘTE **la orice push pe branch-ul `maestro-verify`** (branch-ul de verificare) sau manual, din
tab-ul Actions / CLI (`gh workflow run ios-verify.yml --ref maestro-verify`). Pornirea se face în
**secunde** — măsurat 11.10.2026: push la 20:45:35, rularea `38173557861` pornită la 20:45:42.
Nu se pornește nimic în paralel pe macOS: `concurrency` serializează rulările acestui workflow, iar
build-ul semnat (`ios-testflight`) se pornește manual, **dimineața, unul per lansare**, nu noaptea.

Costul: pe repo **privat**, minutele de macOS se consumă de **10×** mai repede (din 2.000 min/lună
rămân ~200 min efective de macOS ≈ 10 rulări complete). De aceea verificarea nu se pornește „la
fiecare push" pe branch-uri obișnuite, ci doar pe branch-ul de verificare sau la cerere.

Pentru comparație, coada Codemagic (acum doar pentru `ios-testflight`): măsurat 11.10.2026, ~115 min
și ~75 min de așteptare. Timpul din coadă **nu consumă minute** — se scad doar secundele în care
instanța chiar rulează (~20 min per rulare). Efectul practic: o greșeală în scriptul pasului se
plătește cu încă o coadă, deci **verifică comanda local, pe același Maestro, înainte de a porni
build-ul** (așa a fost prins `-o` → `--output`).

Artefactele le iei din rulare: `gh run download -R casapufosului-lab/ortodoxia-app <run-id>` →
`.app`-ul construit, `maestro-*.xml` (JUnit), `flow-results.txt`, `ci-screenshots/*.png`.

---

## 5. Cum pornești verificarea iOS (GitHub Actions)

Fișierul e gata scris (`.github/workflows/ios-verify.yml`) și rulează deja; ce urmează sunt comenzile
de zi cu zi:

```bash
# pornește verificarea: push pe branch-ul de verificare
git push origin maestro-verify
# sau manual:
gh workflow run ios-verify.yml --ref maestro-verify
gh run list  -R casapufosului-lab/ortodoxia-app -L 3          # statusul rulărilor
gh run view  -R casapufosului-lab/ortodoxia-app <run-id>      # pașii, cu durată și verdict
gh run download -R casapufosului-lab/ortodoxia-app <run-id>   # dovezile (JUnit, flow-results, capturi)
```

Workflow-ul rulează **doar** pe branch-ul de verificare `maestro-verify` și la cerere (workflow_dispatch).
Pe branch-urile de lucru nu consumă nimic: acolo rulează doar `CI`-ul de Linux (~1 min). `concurrency`
serializează rulările acestui workflow, dar **nu știe de Codemagic** — verifică întâi că nu rulează
`ios-testflight` înainte de a porni o verificare (regula: un singur macOS care consumă minute, o dată).

## 6. Limite, spuse clar

- **Notificările push reale (APNs/FCM) nu se pot verifica pe simulator.** Ele rămân test pe telefon.
  `notifications.yaml` verifică tot ce ține de aplicație: cardul, starea afișată, butonul care o
  schimbă și ecranul pe care ajunge un vizitator.
- Un simulator nu seamănă 100% cu un dispozitiv fizic: alt GPU, alt WebView, altă rețea. Flow-urile
  prind regresii de logică și de randare, nu diferențe de performanță.
- `live.yaml` depinde de existența unei transmisiuni LIVE în momentul rulării.
- Cumpărările reale (RevenueCat) nu se pot face automat: `premium.yaml` verifică ce se poate
  verifica fără plată (eticheta planului, butoanele/textul care explică lipsa lor, textele).
- Pe emulatorul Android magazinul răspunde `device-cannot-pay` (aplicația nu e instalată din Play),
  deci cardul de plan arată textul care explică de ce nu există buton. Flow-ul acceptă ambele
  situații — dar asta înseamnă că **fluxul de cumpărare real nu e acoperit** de testul automat.

## 7. `mobile-mcp` — instalat local, pentru EXPLORARE (nu pentru poartă)

[mobile-next/mobile-mcp](https://github.com/mobile-next/mobile-mcp) este un server MCP: îi dai un
dispozitiv și îl conduci pas cu pas (apasă, citește ecranul, face poză). Poarta de verificare rămâne
**Maestro** — pași determiniști, versionați, verdict PASS/FAIL — dar pentru explorare („ce scrie pe
ecran acum?", „apasă aici și vezi ce se întâmplă") mobile-mcp e util.

Instalare locală, fără costuri și fără cont; dispozitivele locale sunt gratuite, iar flota lor
remote (plătită) NU se folosește:

```bash
npx -y @mobilenext/mobile-mcp@latest      # pornește serverul MCP pe stdio
```

Necesită `adb` pentru Android (deja avem) și Xcode/`idb` pentru iOS. Dovada că merge pe acest
calculator (11.10.2026, `node docs/tools/mobile-mcp-smoke.mjs`):

```
[server] mobile-mcp 1.0.9 (mcp sdk 2.0.0) server running on stdio
UNELTE (33): mobile_list_available_devices, mobile_list_apps, mobile_launch_app, mobile_install_app,
  mobile_list_elements_on_screen, mobile_click_on_screen_at_coordinates, mobile_type_keys,
  mobile_take_screenshot, mobile_get_device_logs, mobile_list_crashes, …
mobile_list_available_devices → {"devices":[{"id":"Pixel_7","name":"Pixel 7","platform":"android",
  "type":"emulator","version":"15","state":"online","model":"sdk_gphone64_x86_64"}]}
```

Conectarea la un client MCP (config JSON al clientului, secțiunea de servere MCP):

```json
{ "mcpServers": { "mobile": { "command": "npx", "args": ["-y", "@mobilenext/mobile-mcp@latest"] } } }
```

Regula de folosire: mobile-mcp este pentru **explorare manuală** și pentru a înțelege un eșec
(„arată-mi ecranul"), nu pentru poartă. Ce merită păstrat din explorare se transformă în pas într-un
flow Maestro, ca să ruleze identic în CI.
