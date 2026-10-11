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
| `maestro/premium.yaml` | Premium → eticheta planului + butoanele | „Planul tău" + una dintre valorile reale de plan; butoanele de cumpărare/restaurare sunt acolo |
| `maestro/notifications.yaml` | „Activează notificările" → schimbarea stării | starea din card se schimbă în „Notificările sunt active." (sau, pentru un vizitator, butonul duce pe autentificare) |

Fiecare pas important are un `label:` care spune, în logul CI, **de ce** a picat — nu doar „assert
failed". Fără o transmisiune LIVE reală, `live.yaml` nu poate verifica playerul, deci pică explicit
la aserțiunea „există o transmisiune LIVE embeddabilă", în loc să raporteze un fals succes.

---

## 3. Android, local (gratuit, nelimitat)

Precondiții: `ANDROID_HOME` setat, un AVD pornit.

```powershell
# 1. build debug + instalare
cd C:\Users\pcgar\Documents\ortodoxia-app\android
.\gradlew.bat :app:assembleDebug --console=plain
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb install -r app\build\outputs\apk\debug\app-debug.apk

# 2. serverul de dezvoltare (un build debug are nevoie de el; un build release nu)
cd ..
$env:CI = "1"; npx expo start --port 8081        # în alt terminal
& $adb reverse tcp:8081 tcp:8081

# 3. flow-urile
& "$env:USERPROFILE\.maestro\cli\maestro\bin\maestro.bat" test maestro/
```

`maestro test maestro/` rulează toate flow-urile; `maestro test maestro/live.yaml` rulează unul
singur. Ieșirea fiecărui flow se salvează în consolă, iar `takeScreenshot:` scrie un PNG lângă
locul din care a fost rulată comanda.

---

## 4. iOS, în Codemagic (aceleași flow-uri, în CI)

Workflow-ul `ios-verify` din `codemagic.yaml`:

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

SE PORNEȘTE MANUAL din interfața Codemagic (workflow-ul nu are `triggering`) și **nu în același
timp cu `ios-testflight`** — regula proiectului este să nu consumăm două instanțe de macOS în
paralel. Consumul este de minutele de macOS deja incluse în planul Codemagic.

Artefacte (se descarcă din pagina build-ului): `.app`-ul construit, `maestro-*.xml`,
`flow-results.txt`, `ci-screenshots/*.png`.

---

## 5. Limite, spuse clar

- **Notificările push reale (APNs/FCM) nu se pot verifica pe simulator.** Ele rămân test pe telefon.
  `notifications.yaml` verifică tot ce ține de aplicație: cardul, starea afișată, butonul care o
  schimbă și ecranul pe care ajunge un vizitator.
- Un simulator nu seamănă 100% cu un dispozitiv fizic: alt GPU, alt WebView, altă rețea. Flow-urile
  prind regresii de logică și de randare, nu diferențe de performanță.
- `live.yaml` depinde de existența unei transmisiuni LIVE în momentul rulării.
- Cumpărările reale (RevenueCat) nu se pot face automat: `premium.yaml` verifică ce se poate
  verifica fără plată (eticheta planului, butoanele, textele).

## 6. `mobile-mcp` (evaluat, neinstalat)

[mobile-next/mobile-mcp](https://github.com/mobile-next/mobile-mcp) a fost evaluat și **nu** a fost
instalat: este un agent care conduce dispozitivul pas cu pas, potrivit pentru explorare interactivă,
dar verificarea automată care trebuie să ruleze identic în CI are nevoie de un set de pași
determinist, versionat în depozit și cu verdict clar PASS/FAIL — exact ce dau flow-urile Maestro.
Dacă apare nevoia de explorare manuală pe dispozitiv, se instalează separat, local, fără costuri:
`npx -y @mobilenext/mobile-mcp@latest` (necesită `adb` pentru Android și Xcode pentru iOS).
