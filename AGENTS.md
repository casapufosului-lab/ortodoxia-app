# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

---

# Regulile proiectului (obligatorii)

**Reguli: v4 — 2026-10-10 · 63 de reguli (textul de mai jos e v1, 46 de reguli; H 47-63 sunt în sursă).** Copie din sursa unică
`C:\Users\pcgar\Documents\REGULI-PROIECTE.md`. Dacă diferă ceva, sursa câștigă. Regulile noi sau
schimbate se scriu întâi în sursă, apoi se copiază aici.

**Citește secțiunea asta înainte de orice modificare în proiect.**

## 1. Proiectul

| Ce | Valoare |
|---|---|
| Aplicație | **Ortodoxia** |
| Pachet | `ro.ortodoxia.app` |
| Tehnologie | Expo / React Native (Expo Router), TypeScript |
| Codul | `C:\Users\pcgar\Documents\ortodoxia-app` |
| Documente | `docs\` — inclusiv `STORE_SUBMISSION_KIT.md`, `RELEASE_LEGAL.md`, `ACCOUNT_DELETION.md` |
| Pornire | `npm run start` · `npm run android` |
| Verificare | `npm run preflight` (= `npm run verify` + verificarea de publicare). Rulează-l și citește output-ul, nu te încrede în memorie |

**Tab-uri:** Calendar · Biblie · Rugăciuni · Chat · Cont. Ecrane separate: `live`, `premium`,
`privacy`, `terms`, `auth`.

**Atenție la proiectul ăsta:**
- Are **cont de utilizator** → ștergerea contului din aplicație e obligatorie la Apple și Google.
  Există deja documentată în `docs\ACCOUNT_DELETION.md`; se verifică, nu se presupune.
- **Drepturi pe conținut:** textele biblice și audio-ul de rugăciuni au surse și licențe — vezi
  `docs\BIBLE_CONTENT_STATUS.md`, `docs\PRAYER_CONTENT_SOURCES.md`. Nu se adaugă text sau audio
  fără sursă verificată.
- Conținut religios: fără sfaturi medicale sau promisiuni de vindecare (regula 36).
- Notificările sunt deja folosite — vezi `docs\NOTIFICATION_STATUS.md`.
- **Poze și video AI:** acest calculator NU are placă NVIDIA, deci generarea se face pe un **GPU închiriat
  (Runpod) cu ComfyUI**. Rețeta dovedită, modelele, licențele, parametrii care merg și costul sunt în
  `docs\CUM-GENERAM-POZE-VIDEO.md` — citește-l înainte să propui altă cale. **Nimic plătit nu se pornește
  fără decizia ownerului** (0,89 $/oră cât rulează podul).

## 2. Reguli de cod (R1–R10)

1. **R1. Realitatea întâi** — codul de pe disc e adevărul; citesc fișierul înainte să-l modific; nu
   presupun API, funcție, fișier sau cale neverificate.
2. **R2. Scope minim declarat** — la fiecare task spun ce fișiere ating și ce nu; dacă îmi trebuie
   altceva, mă opresc și întreb.
3. **R3. Fără modificări oarbe** — caut simbolul real, citesc contextul; dacă structura diferă de ce
   am presupus → STOP.
4. **R4. Fail-closed** — ce nu pot demonstra nu declar reușit; necunoscut nu devine succes; stare
   ambiguă → întreb.
5. **R5. Verificare după fiecare task** — typecheck + teste + rulare (build pe emulator pentru
   ecrane); dovada e output-ul real.
6. **R6. Commit doar după verificare** — commit-uri mici, descriptive; fără `git reset/clean/stash/
   push/amend` sau ștergeri de modificări fără cerere explicită.
7. **R7. Un singur writer** — un proiect nu e modificat simultan de doi agenți.
8. **R8. Baza de date** — migrații SQL în fișiere versionate, idempotente; nimic modificat manual în
   bază.
9. **R9. Teste și pe căile de eșec** — poză ilizibilă, dată lipsă, fără internet, notificări
   refuzate, listă de familie goală.
10. **R10. Raportul agentului nu e dovadă** — „a trecut fără erori" nu înseamnă că funcționează;
    numără ce a rulat, cu ce rezultat, pe ce fișiere.

**Cum raportez:** ce am făcut → ce am verificat (comanda și rezultatul) → ce a picat → ce urmează.

## 3. Regulile noastre pentru proiecte (vezi sursa: 61)

### A. Cum vorbim

1. **Răspunsuri scurte.** Dacă se poate în 3 rânduri, în 3 rânduri. Fără teorie, fără introduceri.
2. **Fără „10000 de rânduri".** Textul lung nu înseamnă muncă bună.
3. **Spui direct ce ai greșit** când greșești. Fără scuze lungi, fără explicații.
4. **Nu pui poze mari în chat.** Le salvezi pe Desktop și îmi spui unde sunt.
5. **Nu pui întrebări cu variante pe care le-am respins deja.**
6. **Nu mă întrebi dacă vreau ceva ce ți-am cerut deja.** Cere acordul o dată, nu de cinci ori.

### B. Cum lucrăm

7. **Nu faci nimic fără acordul meu.** Discutăm fiecare pas înainte.
8. **Anunți ce vrei să faci înainte să faci**, chiar dacă ți se pare evident.
9. **Un lucru pe rând.** Nu trei lucruri deodată, nu faze impuse de tine.
10. **Arăți rezultatul, nu promisiuni.** „Gata" fără poză/dovadă nu înseamnă gata.
11. **Verifici pe telefonul real sau pe emulator**, nu pe hârtie.
12. **Nu construiești de la zero ce există gata** (magazine, template-uri, pluginuri).
13. **Dacă folosim un template, îl verifici înainte**: când a fost actualizat ultima dată, ce licență
    are, câte stele are. Un template vechi de 3-8 ani costă mai mult decât ajută.
14. **Nu promiți termene pe care nu le controlezi.** Nu „în 30 de zile" când depinde de vamă.

### C. Adevăr și verificare

15. **Nu inventezi cifre, prețuri, termene, funcții.** Dacă nu știi, spui că nu știi.
16. **Verifici în surse reale:** textul legii, site-ul oficial, aplicația reală din magazin, nu din
    memorie și nu din rezumate.
17. **Când spui că ai verificat, arăți dovada** (poza reală, link-ul, textul din lege).
18. **Spui și ce NU ai putut verifica.** Nu ascunzi limitele.
19. **Nu prezinți o presupunere ca pe un fapt.**

### D. Cum proiectăm aplicațiile

20. **Prima pagină = scopul principal al aplicației** (la un magazin, magazinul), nu altceva.
21. **Fără titluri de marketing pe prima pagină** („cele mai vândute", „recomandate"). Dacă e nevoie de
    ele, apar mici, înăuntrul listelor.
22. **Categoriile principale se văd toate pe ecran**, nu ascunse într-o bandă care se trage.
23. **Litere mari, butoane mari, contrast puternic.** Publicul poate avea dificultăți de vedere sau
    de mișcare. Se verifică pe telefon.
24. **Buton principal = o culoare plină. Buton secundar = alta.** Niciodată amândouă la fel.
25. **Nu pui culoare de spital** (albastru deschis peste tot). Fundal cald sau neutru.
26. **Prețul lunar mare sus; totalul mic dedesubt.** (ex. „242 lei/lună" mare, „total 2.899 lei" mic).
27. **Iconițele importante (coș, favorite) se văd**: minim 24, fiecare în cerc alb.
28. **Săgeata de întoarcere, mare**: cerc de 56.
29. **Structura: 5-6 tab-uri jos**, fiecare tab cu 2-4 secțiuni, iar cardurile deschid subpagini cu
    buton de întoarcere.
30. **Fiecare ecran are un singur lucru principal de făcut.**
31. **Formularul cere puține date.** Omul completează 4 câmpuri, nu 14.

### E. Ce nu facem niciodată în aplicații

32. **Fără date medicale pe server.** Doar nume, email, telefon, adresă, comenzi.
33. **Fără jurnal de sănătate.**
34. **Fără cereri și documente oficiale** (nu facem cereri pentru certificate etc.).
35. **Fără bani între utilizatori** (donații și ajutor, nu vânzări între ei).
36. **Fără sfaturi medicale** în aplicație.
37. **Fără rezervare cu bani.** Rezervarea la produsele lipsă e gratuită.
38. **Fără text pe care AI-ul nu îl poate scrie corect** în video sau poze (litere românești).

### F. Bani

39. **Nimic nu se plătește fără acordul meu**, nici măcar 1 dolar.
40. **Fără studii paralele scumpe.** O singură rundă de verificare, făcută bine.
41. **Costul se spune înainte, nu după.**
42. **Gratis întâi.** Plătim doar când chiar nu există variantă gratuită și doar după ce am văzut că
    funcționează.

### G. Ce se verifică obligatoriu înainte de lansare

43. **Cine are voie să facă asta** (autorizații, notificări: ANMDM pentru dispozitive medicale, EORI
    pentru import).
44. **Ce spune legea exact**, pe textul oficial, nu pe înțelesul general.
45. **Ce se întâmplă cu banii și cu datele** dacă ceva merge prost (retururi, neplata ratelor, GDPR).
46. **Ce cere magazinul de aplicații** (Apple / Google): ștergerea contului, moderare la conținut
    generat de utilizatori, cine încasează abonamentele.
### H. Lucrul tehnic (reguli plătite scump, 27.09.2026)

47. **Un singur emulator.** `Pixel_7` (`emulator-5554`). Nu pornești altul și nu-l șterge.
48. **Un singur Metro o dată.** Verifici întâi ce porturi sunt ocupate (`Get-NetTCPConnection`) și în ce
    folder rulează fiecare. Doar un chat lucrează la un moment dat.
49. **Nu porni un al doilea server** ca să „vezi" ceva. GUI-ul care rulează deja se actualizează prin
    rebuild, nu prin server nou.
50. **După fiecare modificare, comanda de verificare iese cu 0.** `npx tsc --noEmit` întâi; dacă
    proiectul are teste, ele; dacă are lint, el.
51. **Build-ul de pe emulator nu e codul.** O aplicație instalată poate avea bundle-ul îngropat în APK:
    modificarea din cod nu se vede până nu reconstruiești. Verifici ce e instalat înainte să acuzi codul.
52. **Căi lungi peste 260 de caractere strică build-ul pe Windows.** Pentru proiectele cu nume lung se
    lucrează prin scurtătură (ex. `C:\ea` → `expiralert-app`).
53. **Nu ștergi nimic fără acordul meu** — nici fișiere, nici foldere, nici date din emulator.
54. **Nu atinge alte proiecte.** Dacă alt chat lucrează în alt folder, nu porni nimic acolo.
55. **Nu lăsa procese în urmă.** La terminarea unui task, oprești Metro/emulatorul pe care le-ai pornit
    tu; verifici că nu rămân procese blocate.
56. **Un task e „gata" doar cu dovadă**: comanda care a ieșit 0, sau poza din emulator/telefon.
57. **Cheile și secretele nu ajung niciodată în cod, în Git, în log sau în chat.** Doar în seif.
58. **Nu instala pachete noi fără să-mi spui** ce e, ce licență are și de ce e nevoie.
59. **Verifici înainte să declari**: nu „cred că merge", ci „am rulat X, a ieșit Y".
60. **Când ceva pică, spui cauza reală**, nu o presupunere. Dacă n-ai găsit cauza, spui că n-ai găsit.
61. **La finalul fiecărui task dai un raport scurt**: ce ai făcut, ce ai verificat, ce a rămas.
62. **Pozele și video se fac pe GPU închiriat, nu local.** Calculatorul nostru nu are placă NVIDIA, deci
    generarea (poze și video) se face pe un GPU închiriat cu plata la oră (Runpod + ComfyUI). Rețeta
    dovedită — modele, licențe, parametrii care merg, timpi măsurați și cost — stă în
    `C:\Users\pcgar\Documents\CUM-GENERAM-POZE-VIDEO.md` și se citește înainte de a propune altă cale.
    **Nimic plătit nu se pornește fără acordul meu**, iar podul se oprește când nu se lucrează.

---

## 4. La publicare

Cerințele Apple / Google se verifică la sursa oficială, nu din memorie, și se notează cu link.
Regula 46 se aplică înainte de fiecare publicare. **Nu declar „gata de publicat" fără dovada
verificării** (R5 și R10).
63. **Nu te opri la jumătatea taskului — continuă până la capăt.** Când apare „Stopped: max iterations
    reached" SAU o trunchiere de context („trim 10%", compactare, mesaj de context plin), **NU aștepți
    confirmare**: reiei de la ultimul pas neterminat, cureți fișierele temporare pe care le-ai făcut tu și
    duci taskul până la capăt. Raportezi **o singură dată, la final, cu dovezi**. Un task oprit în mijloc
    fără motiv e o greșeală, nu o limită. Se aplică oricărui agent care lucrează pentru mine (Open Worker,
    Jaguar, chat-uri de agent).

## Reguli de execuție după dezastrul din 10.10.2026 (LEGE în orice chat)

Fiecare regulă de mai jos a fost plătită azi cu ~20 de build-uri, zeci de ore de om și bani reali.
Obligatorii pentru orice agent care lucrează la acest proiect (Open Worker, Jaguar, chat-uri de agent).

64. **Întâi instrumentul, apoi reparația.** Nicio modificare de comportament pe dispozitiv nu se livrează
    înainte ca aplicația să poată raporta singură ce vede (ecran + server). Fără instrument, nu se schimbă cod.
65. **O măsurătoare corectă pentru întrebarea greșită e mai rea decât nicio măsurătoare.** Se scrie explicit
    la ce întrebare răspunde o dovadă și la ce NU răspunde.
66. **Ierarhia dovezilor:** ecran/dispozitiv > citire înapoi din serviciu > sursa bibliotecii > test unitar.
    Un test unitar nu închide niciodată un bug de dispozitiv.
67. **O singură schimbare per build; dacă efectul nu se vede, se REVINE înainte de a adăuga alt strat.**
68. **După orice schimbare de configurare, citește înapoi TOT sistemul**, nu doar câmpul scris.
69. **O singură sursă de adevăr per concept.** Accesul la conținut plătit = entitlement-ul din magazin.
70. **Contra documentației oficiale a furnizorului nu se inventează fluxuri.** Se citește docul întâi.
71. **Fail-safe, nu fail-closed mincinos.** Starea necunoscută degenerează în ceva folosibil și onest,
    cu limită de timp.
72. **Succesul tăcut e bug.** Orice integrare care înghite evenimente le scoate la suprafață (log/status/rând).
73. **Citește înainte să afirmi.** Nicio afirmație despre cod/config/rezultat fără fișierul citit sau comanda rulată în acel turn.
74. **Nu scrii un secret pe care nu l-ai verificat.** Se validează prin format + apel real.
75. **Un artifact = un scop.** Inventarul nu e ordin de lucru; un task are un domeniu și o listă de „interzis".
76. **Execuți literal instrucțiunea ownerului.** „Dă-mi taskul" = scrie-l, nu porni-l. „Oprește" = oprește.
77. **Nu întreba a doua oară.** Ce a fost respins o dată devine decizie scrisă.
78. **Regula opririi:** după 2 runde consecutive fără dovadă nouă, oprire și raport BLOCKED cu ce lipsește.
79. **Nicio acțiune scumpă fără întrebarea la care răspunde.** Build-ul se pornește doar dacă se știe ce măsoară.
80. **Igiena între sesiuni:** un domeniu per sesiune; înainte de build, arborele are doar modificări verificate.
81. **Raportul spune doar ce are dovadă** și se închide cu DONE / PARTIAL / BLOCKED.
82. **Limita se declară la început** și canalul de verificare se proiectează înainte de a atinge codul.
83. **„Task livrat" ≠ „muncă făcută".** Se verifică artifactul: fișiere, linii, ore de modificare, citiri înapoi.