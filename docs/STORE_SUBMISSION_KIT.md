# Kit de publicare în magazine (gata de folosit în ziua în care conturile sunt plătite)

> **Atenție (27.09.2026):** textul de listare promite favorite la versete și psalmi, dar în cod
> favoritele există **doar la rugăciuni** (tabela `favorites` are doar `prayer_id`). Ori se
> implementează, ori promisiunea se scoate din listare. Restul stării reale:
> [STARE-REALA.md](./STARE-REALA.md).

Ce e în acest document: exact ce se încarcă, cu ce text, ce răspunsuri se dau la formularele magazinelor
și în ce ordine se rulează comenzile. Tot ce se putea pregăti fără plată e deja făcut și verificat.

---

## 1. Fișiere gata de urcat

| Fișier | Ce e | Cerință Play | Stare |
|---|---|---|---|
| `android/app/build/outputs/apk/release/app-release.apk` | aplicația pentru test pe telefon | — | construit local (`gradlew :app:assembleRelease`) |
| `.aab` din EAS (build `03569e16`) | pachetul pentru magazin | — | **NU se folosește**: e din cod vechi, cu cheie de plăți de test |
| `assets/store/play-icon-512.png` | iconița listării | 512×512, PNG, ≤1 MB | generat: 512×512, 624 KB |
| `assets/store/play-feature-1024x500.png` | grafica de prezentare | 1024×500, PNG/JPEG | generat: 1024×500, 205 KB |

Se regenerează oricând cu: `pwsh -File scripts/make-store-assets.ps1`

**Capturi de ecran** (nu se pot genera fără aplicația pornită): se fac de pe telefon, din APK-ul de test.
Play cere minimum 2, recomandat 4-8, format telefon (ex. 1080×1920). Ce merită pozat, în ordinea asta:
1. ecranul de start (mesajul zilei),
2. calendarul ortodox (o lună cu sărbători),
3. Biblia (un capitol),
4. rugăciunile (lista + redarea audio),
5. chatul cu asistentul (o întrebare + răspuns),
6. ecranul premium.

---

## 2. Textele listării (RO — limba principală)

**Titlu** (max 30 caractere): `Ortodoxia — calendar și rugăciuni`

**Descriere scurtă** (max 80 caractere):
`Calendar ortodox, rugăciuni, Biblia și un asistent AI, într-o aplicație luminoasă.`

**Descriere completă** (max 4000 caractere):

```
Ortodoxia este un ghid creștin-ortodox pentru fiecare zi: calendar, rugăciuni, Biblia și un asistent
care răspunde la întrebări despre credință.

CE GĂSEȘTI ÎN APLICAȚIE
• Calendar ortodox pe țară și stil de calendar, cu sărbătorile zilei, sfinții și rânduiala postului.
• Mesajul zilei: un verset și o pildă scurtă, în fiecare dimineață.
• Rugăciuni de bază, cu text și audio, ca să le poți asculta și urmări.
• Biblia (Noul Testament, traducere în domeniul public), pe capitole, cu sursa indicată.
• Asistent cu inteligență artificială pentru întrebări despre rugăciune, calendar, sfinți și viață
  duhovnicească. Răspunsurile sunt informative și nu înlocuiesc sfatul preotului.
• Slujbe live: unde poți urmări o slujbă transmisă online.
• Notificări la ora pe care o alegi, ca să nu ratezi mesajul zilei.
• Favorite: versete, psalmi și rugăciuni salvate pentru mai târziu.

PENTRU CINE
Pentru oricine vrea să țină aproape credința, calendarul și rugăciunea, fără să caute prin zeci de
site-uri. Interfața este tradusă în 10 limbi și funcționează pe 13 țări.

CE NU FACE
Nu colectează date despre locația ta, nu folosește cookie-uri de publicitate, nu vinde și nu închiriază
datele tale. Nu îți cere contactele, mesajele sau fișierele de pe telefon.

ABONAMENT
O parte din funcții (întrebări mai multe la asistentul AI) este disponibilă în varianta premium, prin
abonament lunar sau anual, plătit prin magazin. Poți anula oricând, din setările contului tău din magazin.

CONTACT
Scrie-ne la contact@ortodoxiaapp.anonaddy.com. Politica de confidențialitate:
https://ortodoxia.web.app/privacy — Termeni: https://ortodoxia.web.app/terms
```

**Titlu scurt pentru Apple** (max 30): `Ortodoxia`
**Subtitlu Apple** (max 30): `Calendar, rugăciuni, Biblia`
**Cuvinte-cheie Apple** (max 100, separate cu virgulă):
`calendar ortodox,rugaciuni,biblia,post,sfinti,credinta,slujbe,mesajul zilei,psalmi,ortodox`

---

## 3. Produsele de abonament (aceleași ID-uri în ambele magazine)

| ID produs | Tip | Unde se creează |
|---|---|---|
| `ro.ortodoxia.premium.monthly` | abonament lunar | Play Console → *Monetize → Products → Subscriptions* **și** App Store Connect → *Subscriptions* |
| `ro.ortodoxia.premium.annual` | abonament anual | la fel |

Apoi, în RevenueCat: *Products* → se importă ambele → *Entitlements* → un entitlement (ex. `premium`) →
*Offerings* → pachetele `monthly` / `annual`. Fără pasul din RevenueCat, ecranul premium rămâne gol
(aplicația afișează „prețul se vede în magazin").

Codul folosește exact aceste ID-uri (`src/lib/revenuecat.ts`), deci nu se schimbă nimic în aplicație.

---

## 4. Formularul „Data safety" (Play) — răspunsuri

Pe baza politicii publicate (`https://ortodoxia.web.app/privacy`):

| Întrebare | Răspuns |
|---|---|
| Colectează sau partajează date? | **Da** (cont, preferințe, conținut salvat, conversații AI) |
| Date criptate în tranzit? | **Da** (HTTPS) |
| Utilizatorul poate cere ștergerea datelor? | **Da** → `https://ortodoxia.web.app/delete-account` |
| Tipuri colectate | Adresă de email; nume (opțional); preferințe în aplicație; conținut salvat (versete, rugăciuni); mesaje în chat (textul întrebărilor) |
| Scop | Funcționarea aplicației, autentificare, limite de utilizare, suport |
| Partajate cu terți? | Doar procesatori tehnici (găzduire, bază de date, autentificare, notificări, furnizor AI) — nu pentru publicitate |
| Locație colectată? | **Nu** |
| Cookie-uri de publicitate? | **Nu** |

---

## 5. Chestionarul de clasificare a conținutului (Play)

| Întrebare | Răspuns |
|---|---|
| Categorie | Referințe / Cărți sau Educație |
| Violență, limbaj, sexualitate, droguri, jocuri de noroc | **Nu** la toate |
| Conținut generat de utilizatori / interacțiune între utilizatori | **Nu** (chatul este cu un asistent AI, fără interacțiune între oameni) |
| Funcții social / localizare partajată | **Nu** |
| Conținut digital sau achiziții | **Da** (abonament) |
| Reclame | **Nu** |

Clasificarea rezultată va fi „Toate vârstele" / 3+ (conținut religios informativ, fără elemente sensibile).

---

## 6. Ștergerea contului (cerință Play)

- **În aplicație:** *Setări → Cont → Șterge cont* (implementat, cu funcția `delete-account`).
- **Pe web:** `https://ortodoxia.web.app/delete-account` — pagina există în site și e legată din politica
  de confidențialitate. Play cere un URL public; acesta este.

---

## 7. Ordinea exactă în ziua plății

```powershell
# 1. cheile reale de plăți în profilul de producție (eas.json → build.production.env)
#    EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY = <cheia publică din RevenueCat>
#    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY  = <la fel, pentru iOS>

# 2. poarta trebuie să fie verde în modul de release (0 FAIL)
node scripts/release-readiness.mjs --release

# 3. build de magazin (versionCode crește singur, mulțumită autoIncrement)
npx eas-cli build --profile production --platform android

# 4. cont de serviciu Play (o dată): Play Console → Setup → API access → creare cont de serviciu
#    → drepturi de publicare → descărcare JSON → îl dai lui EAS:
npx eas-cli credentials --platform android

# 5. urcarea în Play (track intern, ca test final)
npx eas-cli submit --profile production --platform android --latest

# 6. după ce trece testul intern: se promovează în producție, din Play Console
```

Pentru iOS (după contul Apple plătit): `npx eas-cli build --profile production --platform ios` și
`npx eas-cli submit --profile production --platform ios --latest`.

---

## 8. Ce rămâne strict la owner

1. Plată: cont Google Play (25 USD, o dată) și, pentru iPhone, Apple Developer (99 USD/an).
2. Conturile create: aplicația `ro.ortodoxia.app` în Play Console și în App Store Connect.
3. Cheile publice RevenueCat (Google + Apple) și produsele de abonament create în ambele magazine.
4. Contul de serviciu Play (JSON) și credențialele Apple pentru EAS.
5. Capturile de ecran (din APK-ul de test) și confirmarea textelor listării.
6. Declarațiile legale din console (Data safety, clasificare) — răspunsurile sunt pregătite mai sus.
