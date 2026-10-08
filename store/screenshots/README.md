# Ortodoxia — capturile de ecran pentru magazin

**Stare la 08.10.2026: 6 din 8 capturi există în acest folder**, toate **1080×1920, PNG 24-bit fără alpha**
(9:16, dimensiunea "highly recommended" a Play). Au fost făcute pe emulatorul Pixel_7 (`emulator-5554`),
din **aplicația reală** construită din codul de acum (`gradlew :app:assembleRelease`), după ce s-a rezolvat
blocantul de pornire (cheia RevenueCat de test nu mai ajunge în build) și după ce display-ul emulatorului a
fost comutat de la 1080×2400 (care **încălcă** regula "latura mare ≤ 2 × latura mică") la **1080×1920**.

| # | Fișier | Stare |
|---|---|---|
| 1 | `01-mesajul-zilei.png` | **făcut** — conținut real încărcat, fără eroare |
| 2 | `02-calendar-ortodox.png` | **făcut** — luna octombrie 2026, grila completă |
| 3 | `03-biblia.png` | **făcut** — Noul Testament, sursa traducerii vizibilă (lista de cărți, nu un capitol deschis) |
| 4 | `04-rugaciuni.png` | **făcut** — lista de rugăciuni; lipsește varianta cu rugăciunea deschisă și redarea pornită |
| 6 | `06-slujbe-live.png` | **făcut** — o sursă LIVE ACUM (Trinitas TV) și una oprită (Doxologia) |
| 5 | `05-chat-asistent.png` | **făcut** — întrebare reală („Ce zice postul Crăciunului?") + răspunsul asistentului, cu contorul „4 din 5 întrebări gratuite rămase azi" vizibil. **Nu** s-a folosit un cont autentificat: contorul de întrebări gratuite se vede și fără cont |
| 7 | `07-premium.png` | **lipsește** — se face doar după ce produsele există în magazine |
| 8 | `08-cont.png` | **lipsește** — cere un cont autentificat |

**Cum au fost făcute, ca să se poată repeta:** `adb shell wm size 1080x1920` (pentru 9:16), apoi pentru
fiecare ecran `adb shell am start -a android.intent.action.VIEW -d ortodoxia:///...`, `adb shell screencap
-p`, bara de sistem curățată prin SystemUI *demo mode* (baterie/WiFi/semnal pline, fără notificări), apoi
re-encodare la 24-bit fără alpha — `screencap` produce PNG **cu** canal alpha, care nu e acceptat de Play.

**Observație pe captura 1 — reparat:** sub „Pilda zilei" sursa versetului apărea ca identificator brut
(`ro_versete_0057`) și, dacă `verse_source` conținea literal textul `NULL`, acel text ajungea pe ecran. Ambele sunt
acum filtrate în cod (`src/lib/content-source.ts`, folosit de ecranul principal și de calendar), iar pe emulator
captura arată **„Coloseni 3:15"**, cu **zero** apariții ale lui `ro_versete` sau `NULL` în dump-ul ecranului.
Ce rămâne de curățat (la owner, scriere pe date): tabela `daily_content` încă ține **2158 de rânduri** cu literalul
`NULL` în `verse_source` (din 4745), plus migrația `20261008000100_fix_null_verse_source.sql` neaplicată. UI-ul e
curat și fără migrație; migrația curăță sursa.

`STORE_SUBMISSION_KIT.md` §1 dă deja o listă de 6 capturi, în ordine (start, calendar, Biblia, rugăciuni,
chat, premium). Lista de mai jos păstrează ordinea aceea, o detaliază (stare, ce se vede, de ce) și adaugă
două ecrane care merită în galerie: transmisiunile live și contul.

---

## 1. Cerințe tehnice — verificate la sursă

### Google Play

Sursa: [Add preview assets to showcase your app — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9866151)

| Cerință | Valoare exactă din sursă |
|---|---|
| Număr de capturi | până la **8** per tip de dispozitiv; minim **2** ca să poți publica listarea |
| Format | **JPEG sau 24-bit PNG (fără alpha)** |
| Dimensiune minimă | **320 px** pe latura mică |
| Dimensiune maximă | **3840 px**; latura mare nu poate fi mai mult de **dublul** laturii mici |
| Pentru recomandări („Highly recommended”, condiție de eligibilitate) | minim **4** capturi de minim **1080 px**, **9:16** portret (min. 1080×1920) sau **16:9** landscape (min. 1920×1080) |
| Ecrane mari (tablete, Chromebook) | se pot adăuga minim **4**, între **1080 și 7680 px**, 16:9 landscape / 9:16 portret |
| Conținut | capturi din **aplicația reală**; fără persoane care ating ecranul; fără elemente de tip „Best”, „#1”, „Download now”; text adăugat doar dacă e necesar (max. ~20% din imagine) |
| Bara de notificări | curățată înainte de trimitere: fără notificări, fără numele operatorului; bateria, WiFi și semnalul să fie pline |
| Alt text | de pus la fiecare captură, maximum **140 de caractere** (ex. „Calendarul ortodox al lunii, cu sărbătorile marcate”) |
| Iconiță listare | **32-bit PNG cu alpha, 512×512 px, maximum 1024 KB** |
| Grafică de prezentare (feature graphic) | **JPEG sau 24-bit PNG fără alpha, 1024×500 px** |

**Atenție la raportul de aspect.** Regula „latura mare ≤ 2 × latura mică” este obligatorie. O captură brută
de pe un ecran foarte lung (20:9 sau 21:9) **nu trece**: la 1080×2400, 2400 > 2×1080. Dacă telefonul sau
emulatorul are un asemenea ecran, captura se decupează sau se încadrează la 9:16 (1080×1920).

**Verificat (07.10.2026):** emulatorul Pixel_7 (emulator-5554) raportează exact `1080x2400` la `adb shell wm size`,
deci capturile brute de pe el **nu trec** regula și trebuie decupate sau încadrate la 9:16 (1080×1920).

### Apple App Store

Sursa: [Screenshot specifications — App Store Connect Help](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

| Cerință | Valoare exactă din sursă |
|---|---|
| Număr de capturi | între **1 și 10** |
| Format | `.png`, `.jpg`, `.jpeg`; **fără canal alpha și fără transparență** |
| iPhone 6.9" | 1260×2736, 1290×2796 sau 1320×2868 (portret); variantele landscape corespunzătoare |
| iPhone 6.5" | 1284×2778 sau 1242×2688 (portret) — **cerut** dacă aplicația rulează pe iPhone și nu se trimit capturi pentru 6.9" |
| iPad 13" | 2064×2752 sau 2048×2732 (portret) — **cerut** dacă aplicația rulează pe iPad |

`app.json` are `ios.bundleIdentifier: "ro.ortodoxia.app"` (linia 12), deci aplicația este pregătită și
pentru App Store. **Necesită verificare**: `app.json` nu setează `ios.supportsTablet`, iar eu nu am
verificat dacă build-ul de iOS rulează pe iPad; dacă rulează, Apple cere și capturi de iPad 13".

### Cum am verificat

Paginile oficiale au fost citite prin fetch. Google Help și Apple Help își încarcă textul prin JavaScript,
iar fetch-ul direct a întors doar navigația; textul de mai sus a fost luat din aceleași pagini oficiale
servite prin `r.jina.ai` (aceleași URL-uri de mai sus). Nu am cont de Play Console sau App Store Connect,
deci nu am văzut formularele reale.

---

## 2. Lista de capturi de făcut, în ordinea în care se urcă

Ordinea contează: primele 3 capturi se văd primele, iar Google cere ca ele să arate interfața reală.

| # | Fișier propus | Ecran (sursă) | Starea de pregătit | Ce trebuie să se vadă | De ce |
|---|---|---|---|---|---|
| 1 | `01-mesajul-zilei.png` | `src\app\(tabs)\index.tsx` | o zi obișnuită, cu conținut încărcat complet (fără eroare, fără fallback) | Banda de sus cu data și țara, secțiunea „Pilda zilei” (titlu + text), „Calendarul zilei” (numărul zilei, titlul zilei, rangul sărbătorii, nota de post), cardul „Slujbe live” și butonul „Întreabă ghidul AI” | Prima captură trebuie să arate scopul zilnic al aplicației |
| 2 | `02-calendar-ortodox.png` | `src\app\(tabs)\calendar.tsx` | o lună cu sărbători (grila completă, o zi selectată) | Grila lunii cu zilele marcate, cardul zilei selectate (titlu, sfinți, rangul sărbătorii, nota de post), selectorul de calendar pe țară / stil de calendar | Calendarul ortodox este prima funcție din titlul listării |
| 3 | `03-biblia.png` | `src\app\(tabs)\bible.tsx` | un capitol din Noul Testament încărcat, cu selectorul de carte și capitol | Numele cărții și capitolul, versetele numerotate, sursa traducerii, câmpul de căutare | Arată conținutul real. Se pozează doar Noul Testament: lista de cărți din cod (`bible.tsx`, rândurile 10–38) merge de la Matei la Apocalipsa |
| 4 | `04-rugaciuni.png` | `src\app\(tabs)\prayers.tsx` | lista de rugăciuni încărcată + o rugăciune deschisă, cu redarea pornită | Categoriile și lista, rugăciunea deschisă (titlu + text), butonul de ascultare / rostire, marcajul de favorit | Rugăciunile sunt al doilea pilon din descriere |
| 5 | `05-chat-asistent.png` | `src\app\(tabs)\chat.tsx` | o întrebare reală despre credință și răspunsul primit, cu numărul de întrebări rămase vizibil | Întrebarea utilizatorului, răspunsul asistentului, contorul de întrebări rămase pentru ziua respectivă | Arată cum arată ajutorul AI. **Nu** se pozează starea de limită atinsă sau de eroare |
| 6 | `06-slujbe-live.png` | `src\app\live.tsx` | lista de surse cu statusul primit de la server; ideal una în direct și una oprită | Numele surselor, statusul fiecăreia, locul, butonul de deschidere / playerul | Transmisiunile live sunt promise în listare. Dacă în ziua capturii nicio sursă nu e în direct, se pozează doar lista cu statusul real — **nu se inventează un „live”** |
| 7 | `07-premium.png` — **doar după ce produsele există în magazine** | `src\app\premium.tsx` | abonamentele `ro.ortodoxia.premium.monthly` / `.annual` create în Play Console și în App Store Connect, importate în RevenueCat | Cele două planuri cu prețul real afișat de magazin, lista de beneficii, textele de reînnoire/anulare | Acum, fără produse, ecranul afișează „prețul se vede în magazin” (`premium.tsx`, rândurile 92 și 98) — o captură atunci nu ar arăta nimic util |
| 8 | `08-cont.png` | `src\app\(tabs)\account.tsx` | cont conectat, cu țara, calendarul și limba alese | Datele contului, planul activ, țara / calendarul / limba, butonul de ștergere a contului | Play cere ca ștergerea contului să fie vizibilă în aplicație; captura o arată |

**Ce NU se fotografiază:** ecranele legale (privacy, terms), ecranul de autentificare gol, stările de
încărcare și de eroare, mesajele de „netradus” (`prayers.tsx` are o stare separată pentru conținutul care nu
e încă tradus în limba aleasă) și ecranul premium fără produse create în magazine.

---

## 3. Cum se fac, concret

1. Se instalează APK-ul de test (cel construit local, `gradlew :app:assembleRelease` — **nu** AAB-ul din
   EAS `03569e16`, care, conform `STORE_SUBMISSION_KIT.md` §1, este din cod vechi cu chei de plăți de test).
2. Limba aplicației: **română** (limba principală a listării).
3. Se curăță bara de notificări (baterie, WiFi și semnal pline, fără notificări) — cerință Google.
4. Se salvează în acest folder, cu numele din tabel.
5. Se verifică înainte de urcare: format (JPEG / 24-bit PNG fără alpha), latura mică ≥ 320 px, latura mare
   ≤ 2 × latura mică, minim 2 capturi (ideal 4–8, toate ≥ 1080 px, 9:16).

**Verificat pe disc (08.10.2026):** citind antetul IHDR al fiecărui fișier, toate cele **6** capturi sunt
**1080×1920, 8 bit, RGB — 24-bit fără alpha**, raport 1,7778 (9:16), latura mică 1080 px, regula „latura
mare ≤ 2 × latura mică" respectată. Adică **tabelul de la începutul documentului și regula de la punctul 5
nu se mai contrazic** — afirmația veche din acest fișier („capturile brute ies 1080×2400 și trebuie
decupate") descria emulatorul înainte de comutarea display-ului, iar `:123-130` de mai jos explică exact
ce s-a schimbat.
6. La urcare în Play Console se completează și **alt text**-ul fiecărei capturi (maximum 140 de caractere).

**Cine a făcut pozele:** capturile **01–06** au fost făcute pe emulatorul Pixel_7, din aplicația reală de release
instalată local (nu din EAS), cu display-ul comutat temporar la 1080×1920 — apoi **readus la starea găsită**:
`adb shell wm size` → `Physical size: 1080x2400`, `wm density` → `420`. Bara de sistem apare în starea reală a
emulatorului (**demo mode nu e activ**: `settings get global sysui_demo_allowed` → `0`), deci capturile nu trebuie
considerate „curățate" prin SystemUI. Capturile **07 (premium)** și **08 (cont)** nu pot fi
făcute încă: 07 cere produsele de abonament create în Play Console, 08 cere un cont autentificat. Descrierile lor de
mai sus vin din codul citit (`src\app\...`), nu din poze. Rețeta: `adb shell wm size 1080x1920` → ecranul dorit →
`screencap` → re-encodare la 24-bit fără alpha → `adb shell wm size reset`.
