# Licențe și drepturi asupra conținutului (B11)

DE CE EXISTĂ ACEST DOCUMENT

Auditul dinainte de lansare, poziția **B11**, a constatat că aplicația publică texte de
rugăciuni, fișiere audio și text biblic **fără nicio urmă scrisă a drepturilor de
folosință**. Pentru un magazin de aplicații asta e o problemă de proprietate
intelectuală, nu o formalitate: dacă un titular de drepturi reclamă, operatorul trebuie
să poată arăta de unde vine fiecare material.

Documentul de față este **registrul** acelor drepturi. Regula lui: fiecare rând are în
coloana `Status` ori `DOCUMENTAT` (există o dovadă în depozit, citată), ori
`NEVERIFICAT` (nu există nicio dovadă — rămâne de răspuns de către owner). **Nu se
presupune nicio licență care nu e scrisă în sursă.** Poziția B11 se închide abia când în
tabel nu mai există niciun `NEVERIFICAT` și nicio bifă nefăcută în ultima secțiune.

Verificarea automată a formatului e în `scripts/release-readiness.mjs`
(`checkContentLicences`), ca documentul să nu poată fi golit fără ca poarta de lansare să
observi.

## Registru

| Clasă | Ce s-a verificat (dovadă) | Bază de drepturi | Status |
|---|---|---|---|
| `biblie` | Traducerea este **Biblia Liberă** (`ronbl`), Noul Testament, definită în `src/data/bible-source.ts:1-9`, cu `status: 'Schiță de traducere, public domain conform sursei'` și cu paginile de sursă și de drepturi expuse în interfață. Procesul e descris în `docs/BIBLE_CONTENT_STATUS.md:9-60`. | Sursa oficială eBible.org declară traducerea **Public Domain** (`docs/BIBLE_CONTENT_STATUS.md:33-37`). Aplicația nu are voie să înlocuiască această denumire cu altă licență (regulă scrisă în același loc). | DOCUMENTAT |
| `rugaciuni-text` | Cele 10 rugăciuni publicate au redactarea verificată editorial, cu pagina folosită pentru verificare listată rând cu rând: `docs/PRAYER_CONTENT_SOURCES.md:13-24`. `editorial_source` în baza de date a fost pus prin migrația `20260903000200_verify_prayer_editorial_source.sql`. | Text liturgic tradițional, în circulație de secole; sursele externe au servit **doar** la verificarea redactării, nu ca material copiat — documentul declară explicit că nu revendică drepturi asupra site-urilor terțe și că nu a fost modificat conținut editorial (`docs/PRAYER_CONTENT_SOURCES.md:5-7`). | DOCUMENTAT |
| `rugaciuni-audio` | Cele 10 fișiere MP3 există și răspund cu `audio/mpeg` (HTTP 200), în bucketul privat `prayer-audio`: `docs/PRAYER_AUDIO_STATUS.md:7-24`. Bucketul a fost făcut privat, citirea se face doar prin link semnat: `supabase/migrations/20260915000400_make_prayer_audio_bucket_private.sql:24-33`. **Proveniența e scrisă în cod**: fișierele sunt generate de funcția de margine `generate-prayer-audio` cu serviciul de sinteză vocală al OpenAI (`supabase/functions/generate-prayer-audio/index.ts:102-115` — `model: 'gpt-4o-mini-tts'`, `response_format: 'mp3'`, voce românească), care scrie rezultatul în `ro/<slug>.mp3` (`:124`). Accesul la generator e păzit de un token (`:63-67`), iar cheia OpenAI stă doar pe server (`docs/BUILD_CONFIG.md:106-122`). Textul citit este cel din tabelă, adică textul deja verificat mai sus. | Fișierele sunt generate de operator, în contul propriu OpenAI, din textul propriu al aplicației — nu sunt materiale cumpărate sau preluate. Rămâne de confirmat de operator că termenii contului OpenAI permit folosirea comercială și redistribuirea fișierelor audio generate (bifă mai jos). | DOCUMENTAT |
| `ai-chat` | Răspunsurile sunt generate la cerere de operator, prin funcția de margine `orthodox-chat`, care folosește `OPENAI_API_KEY` (cheia stă doar pe server: `docs/BUILD_CONFIG.md:92-119`). Răspunsurile nu sunt stocate ca material publicat. | Răspunsul generat aparține operatorului conform termenilor serviciului folosit; rămâne de confirmat de operator că termenii contului permit folosirea comercială și afișarea către utilizatori. În plus, ecranul de chat **nu afișează încă** o mențiune că răspunsul e generat de AI și poate greși (lipsa e urmărită separat, la poziția C25 din audit). | DOCUMENTAT |
| `live-youtube` | Transmisiunea live se redă prin playerul YouTube încorporat (`src/live/youtube-embed.native.tsx`, `src/live/youtube-embed.web.tsx`), cu mențiune proprie în interfață (`src/app/live.tsx:200-201`). Starea serviciilor live e în `docs/LIVE_SERVICES_STATUS.md`. | Materialul nu este descărcat, copiat sau redistribuit: redarea rămâne în playerul YouTube, sub termenii YouTube. Nu se stochează copii în bucketul aplicației. | DOCUMENTAT |
| `imagini-marci` | Fișierele există și sunt folosite de configurație: `docs/BUILD_CONFIG.md:149-155` le enumeră drept prezente, iar `app.json` le leagă de iconița adaptivă. În `assets/` nu există nicio imagine de la terți și **niciun fișier de font inclus** — interfața folosește fonturile sistemului (`src/components/themed-text.tsx:69` folosește `Fonts.mono`, fără `useFonts`). | **Declarație owner (08.10.2026):** imaginile din `assets/` (iconiță, fundal iconiță Android, splash, materiale de magazin) au fost produse de operator cu unelte de generare AI, pornind de la identitatea vizuală proprie a aplicației, și sunt folosite ca marcă a aplicației. Nu există materiale de la terți în `assets/`. | DOCUMENTAT |

## Declarații necesare de la owner

Fiecare bifă de mai jos cere un răspuns al ownerului (nu poate fi dedus din depozit).
Poziția B11 nu se închide până când toate sunt bifate **și** tabelul de mai sus nu mai
conține `NEVERIFICAT`.

- [x] `rugaciuni-audio` — **confirmat de owner, 08.10.2026:** fișierele sunt generate în contul propriu OpenAI, iar termenii contului permit folosirea comercială și redistribuirea conținutului generat în aplicația publicată.
- [x] `ai-chat` — **confirmat de owner, 08.10.2026:** răspunsurile sunt generate în contul propriu, iar termenii permit folosirea comercială și afișarea către utilizatori.
- [x] `rugaciuni-text` — **confirmat de owner, 08.10.2026:** redactarea publicată este textul tradițional ortodox, verificat editorial; nu este preluare dintr-o ediție recentă cu drepturi.
- [x] `imagini-marci` — **confirmat de owner, 08.10.2026:** imaginile au fost produse de operator cu unelte de generare AI, pe baza identității vizuale proprii, și sunt folosite ca marcă a aplicației.

## Cum se verifică

```
node scripts/release-readiness.mjs            # raportul de stare: DEFERRED dacă mai există poziții deschise
node scripts/release-readiness.mjs --release  # poarta de lansare: FAIL cât timp există NEVERIFICAT sau bife nefăcute
```

Verificarea o face `checkContentLicences` din `scripts/release-readiness.mjs` (`:1039`), care citește
acest document: numără clasele de conținut rămase `NEVERIFICAT` și bifările nefăcute din secțiunea de
mai sus. **Nu există un fișier de test separat** — o versiune anterioară a acestei secțiuni trimitea la
`tests/content-licences.test.mjs`, care nu există în depozit (verificat 08.10.2026).
