# Ortodoxia — dosarul de magazin: ce există, ce lipsește

Textele de listare **există deja** și nu se rescriu aici. Fișierul acesta spune doar unde sunt, ce mai
trebuie făcut și ce trebuie verificat înainte de publicare.

---

## 1. Unde sunt textele (nu le duplic)

Toate sunt în `..\docs\STORE_SUBMISSION_KIT.md` (168 de linii). Nu l-am modificat.

| Ce | Unde |
|---|---|
| Titlu, descriere scurtă, descriere completă — **română** | `docs\STORE_SUBMISSION_KIT.md` §2 |
| Titlu scurt pentru Apple, subtitlu, cuvinte-cheie | §2 (ultimele rânduri) |
| ID-urile produselor de abonament (aceleași în ambele magazine) | §3 |
| Răspunsurile la „Data safety” | §4 |
| Chestionarul de clasificare a conținutului | §5 |
| Ștergerea contului (în aplicație și pe web) | §6 |
| Ordinea comenzilor în ziua plății | §7 |
| Ce rămâne strict la proprietar | §8 |

Deci **nu există `store\listing.md`** pentru Ortodoxia: textele sunt deja în kit, iar o a doua copie ar
începe să difere la prima schimbare. Rezumat de listare separat nu e nevoie — kitul §2 este rezumatul.

## 2. Ce există deja ca grafică și ce lipsește

Grafica de magazin **a fost deja generată** (nu am generat-o eu, doar am verificat fișierele):

| Fișier | Cerință (verificată la sursă) | Ce am verificat eu |
|---|---|---|
| `assets\store\play-icon-512.png` | 512×512 px, 32-bit PNG cu alpha, maximum 1024 KB — [Play Console Help](https://support.google.com/googleplay/android-developer/answer/9866151) | fișierul are exact **512×512** și **624 KB** → respectă cerința |
| `assets\store\play-feature-1024x500.png` | JPEG sau 24-bit PNG fără alpha, 1024×500 px — aceeași sursă | fișierul are exact **1024×500** și **205 KB** → respectă dimensiunea |

Kitul §1 spune că ambele se regenerează cu `pwsh -File scripts/make-store-assets.ps1`. **Nu am rulat
scriptul** și nu am verificat dacă fișierele au canal alpha sau nu (nu am deschis pixelii, doar antetul PNG).

| Ce lipsește | Stare |
|---|---|
| `store\screenshots\` | **de făcut** — pozele nu au fost făcute; lista exactă e în `screenshots\README.md` |
| confirmarea textelor de listare de către proprietar | în așteptare (kit §8, punctul 5) |
| conturile de magazin și plata (Google Play 25 USD o dată, Apple Developer 99 USD/an) | la proprietar (kit §8, punctul 1) — sumele sunt citate din kit §8, nu le-am verificat la sursă |
| pagina publică de ștergere a contului: `https://ortodoxia.web.app/delete-account` | scrisă în kit §6; nu am verificat că e online |
| politica de confidențialitate: `https://ortodoxia.web.app/privacy` | scrisă în kit §2 și §4; nu am verificat că e online |

Modelul echipei (ExpirAlert) are în `store\` `listing.md`, `icon-512.png`, `feature-graphic-1024x500.png` și
`screenshots\`. La Ortodoxia, echivalentul iconiței și al graficii există deja în `assets\store\`, iar
textele în `docs\`; în `store\` rămâne de făcut doar folderul de capturi.

## 3. Prețuri — ce am găsit, exact

**Nu există niciun preț scris în cod**, deci nu am avut ce cita și nu inventez nimic.

- `src\app\premium.tsx`, rândurile 37–38: prețul se ia din magazin —
  `const monthlyPrice = priceFor('monthly');` / `const annualPrice = priceFor('annual');`
- rândurile 92 și 98: dacă nu există ofertă, ecranul afișează `t('premium.priceInStore')`
  („prețul se vede în magazin”).
- `docs\STORE_SUBMISSION_KIT.md` §3: produsele `ro.ortodoxia.premium.monthly` și
  `ro.ortodoxia.premium.annual` se creează în Play Console și în App Store Connect, apoi se importă în
  RevenueCat.

**Prețul se stabilește în magazine, împreună cu proprietarul** — aplicația îl afișează pe cel din magazin.

## 4. Ce am verificat în cod (afirmații din descrierea de listare)

| Afirmație din kit §2 | Ce am găsit |
|---|---|
| „Interfața este tradusă în 10 limbi” | `src\i18n\config.ts`, linia 6: `COMPLETE_LANGUAGES` are exact **10** limbi (ro, en, el, sr, bg, mk, uk, ka, ru, sq) |
| „funcționează pe 13 țări” | `src\i18n\config.ts`, de la linia 72: `SUPPORTED_REGIONS` are **13** intrări distincte (RO, MD, GR, CY, RS, ME, BG, MK, UA, GE, RU, BY, AL) |
| „Biblia (Noul Testament, traducere în domeniul public)” | `src\app\(tabs)\bible.tsx`, rândurile 10–38: lista de cărți merge de la Matei la Apocalipsa — **doar Noul Testament**. Descrierea e corectă; nu scrie „toată Biblia” |
| „Slujbe live: unde poți urmări o slujbă transmisă online” | există ecranul `src\app\live.tsx`, cu surse, status de la server și player |
| „Notificări la ora pe care o alegi” | `app.json` are pluginul `expo-notifications`; `src\lib\notifications.ts` |
| „Favorite: versete, psalmi și rugăciuni salvate” | `src\app\(tabs)\prayers.tsx` are favorite pe rugăciuni (am citit doar începutul fișierului; pentru versete/psalmi **nu am verificat**) |

## 5. Ce urmează, în ordine

1. Capturile — `store\screenshots\README.md` (de făcut de proprietar).
2. Confirmarea textelor din kit §2 și verificarea paginilor publice (privacy, delete-account).
3. Produsele de abonament în ambele magazine + RevenueCat (kit §3), apoi captura ecranului premium.
4. Plățile și conturile (kit §8) — strict la proprietar.
5. Ordinea comenzilor din kit §7, apoi trimiterea la verificare.

## 6. Ce NU am putut verifica

- Nu am rulat aplicația, emulatorul, scriptul de grafică sau vreo comandă de build.
- Nu am cont în Play Console sau App Store Connect și nu am văzut formularele reale.
- Nu am verificat că `https://ortodoxia.web.app/privacy` și `.../delete-account` sunt online.
- Nu am verificat dacă grafica din `assets\store\` are sau nu canal alpha (am citit doar antetul PNG).
- Nu am verificat dacă build-ul de iOS rulează pe iPad (ar decide dacă sunt cerute capturi de iPad 13").
- Suma de 99 USD/an pentru Apple Developer și cea de 25 USD pentru Play sunt citate din kit §8, nu
  verificate la sursă (nu am verificat prețurile magazinelor).
