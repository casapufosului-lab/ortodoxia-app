# Ce are de făcut ownerul — pași exacți, fără CLI și fără token

> **Stare măsurată de mine, read-only, pe 08.10.2026** (proiectul `pgjabfgibdpcomegkojg`).
> Poarta de lansare: **31 PASS / 0 FAIL / 3 DEFERRED → `RELEASE GATE: NOT READY`**
> (`node scripts/release-readiness.mjs --release`).
>
> **Nu mai există niciun FAIL.** Cele 3 DEFERRED sunt intrări externe — cheia de App Store, care se emite în
> contul App Store Connect, și calendarul 2027, încă nepublicat — nu restanțe de cod. Capitolele 1–3 de mai
> jos sunt deci **închise**. Fiecare pas spune **ce dovadă îl închide**.
>
> Nimic din documentul acesta nu cere linia de comandă, un token sau o parolă. Totul se face din
> dashboarduri, prin copiere–lipire.

---

## 0. DEJA FĂCUT — nu reface

Verificat de mine cu cereri **read-only** (`GET`), cu cheia publicabilă din `.env`; rezultatele sunt în
`live-probe2.txt` din sesiunea de lucru. Nu mai pierde timp aici:

| Ce | Dovada (08.10.2026) | Verdict |
|---|---|---|
| `delete-account` deployat | `GET /functions/v1/delete-account` → **405** `{"error":"Metodă neacceptată."}` (era 404) | ✅ GATA |
| `verse_favorites` există live | `GET /rest/v1/verse_favorites?select=user_id&limit=0` → **200**, `[]` | ✅ GATA |
| `ai_reports` există live | `GET /rest/v1/ai_reports?select=id&limit=0` → **401** `42501` „Grant the required privileges…" (o tabelă **lipsă** ar da 404 `PGRST205`) | ✅ GATA |
| `verse_source = 'NULL'` curățat | `GET /rest/v1/daily_content?select=verse_source&verse_source=eq.NULL&limit=0` → **200**, `[]` (0 rânduri; erau 2 158) | ✅ GATA |
| `live-services-status` merge | `GET /functions/v1/live-services-status` → **200**, `trinitas-tv: live` la `13:12:11Z` | ✅ GATA |
| `orthodox-chat` deployat | `GET /functions/v1/orthodox-chat` → **405** (POST-only) | ✅ GATA |
| Poarta citește corect din orice director | poarta raportează `PASS [content] daily_content covers 365 day(s)` — înainte raporta 0 zile dacă era rulată din alt folder (reparat + test `tests/release-gate-cwd-independence.test.mjs`) | ✅ GATA |

**Rămâne de aplicat live doar capitolul 4** (retenția B2/B3 + cronul ei) — și asta nu se poate
verifica cu cheia publică, deci cere confirmarea ta cu două interogări (vezi 4.3).

---

## 1. Cheia RevenueCat — închide 2 din 4 FAIL

**FAIL-urile care se închid:**
`FAIL [config] missing release variables: EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` și
`FAIL [release] the production profile cannot sell anything: EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`.

### 1.1 Play Console — profil de plăți și produse
1. Play Console → **Setup → Payments profile**: completează profilul de plăți (fără el nu se pot
   publica produse cu abonament).
2. Play Console → aplicația **ro.ortodoxia.app** → **Monetize → Products → Subscriptions**:
   creează **două** abonamente, fiecare cu câte un *base plan* activ:
   - `ro.ortodoxia.premium.monthly` (lunar);
   - `ro.ortodoxia.premium.annual` (anual).
   > ID-urile trebuie scrise exact așa; sunt deja în cod și în textele din aplicație.
3. Activează ambele base plan-uri (un base plan în stare *Draft* nu se vinde).
   > Verificat prin Play Developer API la 08.10.2026: ambele abonamente există
   > (`ro.ortodoxia.premium.monthly` cu planul `monthly`, `ro.ortodoxia.premium.annual` cu planul
   > `annual`), fiecare cu planul de bază în stare **ACTIVE** și prețuri pentru 174 de regiuni.

### 1.2 Contul de serviciu Google pentru RevenueCat
Play Console → **Setup → API access** → creează legătura către un cont de serviciu (RevenueCat cere
un cont de serviciu cu drept de citire a finanțelor) → **descarcă JSON-ul** → în RevenueCat:
**Project settings → Integrations → Google Play** → urcă JSON-ul.

### 1.3 RevenueCat — produse, entitlement, offering, webhook
1. RevenueCat → **Products**: adaugă cele două produse de mai sus (le aduce din Play Console).
2. RevenueCat → **Entitlements**: creează entitlement-ul `premium` (numele este folosit de aplicație)
   și atașează-i **ambele** produse.
3. RevenueCat → **Offerings**: creează offering-ul `Premium` și marchează-l **CURRENT**
   (altfel aplicația nu are ce afișa).
4. RevenueCat → **Integrations → Webhooks**: adaugă
   `https://pgjabfgibdpcomegkojg.supabase.co/functions/v1/revenuecat-webhook`, iar la *Authorization
   header* pune un token lung ales de tine (webhook-ul îl verifică la fiecare cerere).
   Apoi, în **Supabase → Project Settings → Edge Functions → Secrets**, adaugă **două** secrete
   (numele sunt citite exact așa de cod — `supabase/functions/revenuecat-webhook/index.ts:48-51`, iar
   fără ele funcția răspunde `503 Serviciul nu este configurat.`):

   | Secret | Ce este |
   |---|---|
   | `REVENUECAT_WEBHOOK_AUTH_TOKEN` | exact token-ul pus mai sus în webhook-ul RevenueCat |
   | `REVENUECAT_API_KEY` | cheia **secretă** RevenueCat (`sk_…`, *Project settings → API keys → Secret keys*) — folosită doar pe server, la `GET api.revenuecat.com/v1/subscribers/<id>` (`core.ts:485`) |

### 1.4 Cheia publică în profilurile de build — **pasul care mișcă poarta**
RevenueCat → **Project settings → API keys** → copiază cheia **publică** pentru Android
(începe cu `goog_`). Este o cheie **publică**, nu un secret.

Apoi, în **`eas.json`**, linia care azi are șirul gol trebuie **completată sau ștearsă**
(`eas.json:37` la profilul `preview`, `eas.json:54` la profilul `production`):

```json
"EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY": ""
```

devine

```json
"EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY": "goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

> **Atenție (capcană reală):** un **șir gol** aici **are prioritate** față de o variabilă de mediu EAS
> și ajunge exact așa în bundle. Deci ori bagi cheia direct în `eas.json` (cele două linii de mai
> sus), ori **ștergi linia** și o pui ca variabilă EAS pentru `preview` **și** `production`.
> Ambele variante sunt bune; a treia (șir gol + variabilă EAS) **nu funcționează**.

**Ce închide pasul:** `node scripts/release-readiness.mjs --release` nu mai listează cele două FAIL-uri
cu RevenueCat → `passed: 29, failed: 2` (din 4).

---

## 2. Notificările push (FCM) — închide al 3-lea FAIL

**FAIL care se închide:**
`FAIL [release] the listing promises notifications, but the push channel cannot work: no google-services.json in the project; app.json does not set expo.android.googleServicesFile`.

Poarta verifică **patru** lucruri (`scripts/release-readiness.mjs:903-938`); două sunt deja bune
(`expo-notifications` e dependență, scriptul de cron există). Lipsesc două:

### 2.1 `google-services.json` (Firebase)
1. <https://console.firebase.google.com> → **Add project** (ex. `ortodoxia`) → apoi
   **Add app → Android**, cu pachetul **`ro.ortodoxia.app`** → **Download `google-services.json`**.
2. Alege **una** din variante:
   - **A. în depozit** (poarta devine verde): pune fișierul în rădăcina depozitului
     (`C:\Users\pcgar\Documents\ortodoxia-app\google-services.json`). Nu este un secret Google,
     dar conține identificatori ai proiectului tău — decizia de a-l versiona este a ta.
   - **B. doar pentru build** (aplicația merge, poarta rămâne roșie la acest punct): încarcă fișierul
     în **Expo → Project → Environment variables** ca variabilă de tip **file**, cu numele
     `GOOGLE_SERVICES_JSON`; EAS îl injectează la build.
     În acest caz, scrie în raport că FAIL-ul rămâne **asumat** — este o intrare a ownerului, nu o
     restanță de cod.

### 2.2 Linia din `app.json`
În `app.json`, în blocul `expo.android` (acum: `package`, `versionCode`, `adaptiveIcon`,
`predictiveBackGestureEnabled`, `permissions`), se adaugă:

```json
"googleServicesFile": "./google-services.json"
```

> Această linie este o modificare de cod de o linie. Se face **împreună** cu 2.1 varianta A, altfel
> build-ul local caută un fișier care nu există.

> **Stare verificată 08.10.2026, 20:00.** Linia din `app.json` **există deja**
> (`app.json:22` → `"googleServicesFile": "./google-services.json"`), dar fișierul nu e la locul
> cerut: singura copie este `android/app/google-services.json` (990 bytes), iar folderul `android/`
> este **ignorat de Git și regenerat de `expo prebuild`**. Deci exact cazul de mai sus: următorul
> build pornit de la zero (EAS sau `prebuild --clean`) nu mai găsește fișierul.
> **Ce ai de făcut:** copiază fișierul în rădăcină (`ortodoxia-app\google-services.json`), sau
> încarcă-l ca variabilă EAS de tip file numită `GOOGLE_SERVICES_JSON` (2.1 varianta B).
> Dovada că e rezolvat: `node scripts/release-readiness.mjs --release` → linia
> `PASS [release] the push notification channel is configured` **și** fișierul există la rădăcină.

### 2.3 Cronul notificărilor (o singură dată)
Supabase Dashboard → **Database → Extensions**: activează **`pg_cron`** și **`pg_net`**. Apoi:
1. **Project Settings → Edge Functions → Secrets**: adaugă `NOTIFICATION_CRON_SECRET` (o parolă
   lungă, aleasă de tine).
2. **SQL Editor**, salvează în Vault două secrete (numele contează — sunt citite de script):

```sql
select vault.create_secret('https://pgjabfgibdpcomegkojg.supabase.co', 'notification_project_url');
select vault.create_secret('<parola_de_la_pasul_1>',                     'notification_cron_secret');
```

3. **SQL Editor** → deschide fișierul `supabase/cron/schedule-daily-notifications.sql`, copiază tot
   și rulează-l (este idempotent).
4. Verificare:

```sql
select jobid, jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content from net._http_response order by created desc limit 5;
```

Răspunsul funcției trebuie să arate ca `{"success":true,"eligible":N,"sent":M,"skipped":K,"failed":0}`.
Pașii detaliati, cu toate capcanele, sunt în `docs/CRON-NOTIFICARI.md`.

**Ce închide pasul:** poarta raportează
`PASS [release] the push notification channel is configured (Firebase file, app.json, cron script)`,
plus o notificare primită pe telefon la ora aleasă (dovada finală a canalului).

> **Alternativa legitimă:** dacă notificările **nu** intră în v1, scoate promisiunea „Notificări la ora
> pe care o alegi" din `docs/STORE_SUBMISSION_KIT.md`. Atenție: **FAIL-ul din poartă rămâne** (verifică
> existența fișierului, nu textul listării) — se mută de la „de reparat" la „asumat și documentat".

---

## 3. Licențele de conținut — închide al 4-lea FAIL

**FAIL care se închide:**
`FAIL [licences] content rights are only partly documented: 1 class(es) NEVERIFICAT (imagini-marci), 4 owner declaration(s) unanswered`
→ „Complete the registry table and the «Declarații necesare de la owner» list in `docs/LICENTE-CONTINUT.md`".

### 3.1 Exact cele 4 declarații care așteaptă răspunsul tău
Sunt ultimele patru bife din `docs/LICENTE-CONTINUT.md` (secțiunea *Declarații necesare de la owner*).
Răspunsul tău nu se poate deduce din depozit; fiecare cere un „da, confirm" scris:

1. **`rugaciuni-audio`** — confirmi că termenii contului **OpenAI** folosit permit **folosirea
   comercială și redistribuirea** fișierelor audio generate de `gpt-4o-mini-tts` (cele 10 MP3-uri din
   bucketul `prayer-audio`), în aplicația publicată.
2. **`ai-chat`** — confirmi că termenii contului folosit pentru generarea răspunsurilor permit
   **folosirea comercială** și **afișarea către utilizatori** a răspunsurilor (funcția `orthodox-chat`,
   aceeași cheie OpenAI).
3. **`rugaciuni-text`** — confirmi că redactarea publicată a celor 10 rugăciuni este **textul
   tradițional** (în circulație de secole), **nu** o preluare dintr-o ediție recentă cu drepturi de autor.
4. **`imagini-marci`** — spui **cine a produs** imaginile din `assets/` (iconița, fundalul iconiței
   Android, splash-ul, materialele de magazin) și **confirmi dreptul** de a le folosi ca marcă a
   aplicației (autor propriu / generator AI / material cumpărat — care anume).

### 3.2 Cum se închide, concret
În `docs/LICENTE-CONTINUT.md`:
1. În tabelul **Registru**, rândul `imagini-marci` are în coloana `Status` valoarea `NEVERIFICAT`. Se
   schimbă în `DOCUMENTAT` **cu dovada citată** în aceeași celulă (cine a produs imaginile + unde e
   scris dreptul).
2. Fiecare din cele 4 bife se marchează `- [x]` (nu se șterge textul; se bifează).

**Ce închide pasul:** poarta raportează `PASS [licences] every content class has a documented rights
basis (6 classes)`. Verificarea se face de `checkContentLicences` din `scripts/release-readiness.mjs`
(`:1039`) — nu există un fișier de test separat, iar documentul care afirma altfel a fost corectat
(vezi `docs/LICENTE-CONTINUT.md`, secțiunea „Cum se verifică").

---

## 4. Singurul SQL live rămas: retenția datelor de oaspete (B2/B3) + cronul ei

> Nu se poate verifica de mine cu cheia publică: funcția are `EXECUTE` revocat (e corect așa), iar
> PostgREST ascunde funcțiile fără drept de execuție — răspunsul e identic (404 `PGRST202`) pentru o
> funcție existentă și pentru una inexistentă. Deci: **neverificat**, îl confirmi tu la 4.3.

### 4.1 Funcția de curățenie (o dată)
Supabase Dashboard → **SQL Editor** → deschide `supabase/migrations/20261008000300_retention_guest_chat.sql`,
copiază tot fișierul și rulează-l. Este idempotent (`create or replace function`) și nu atinge
conținutul (versete, calendar, rugăciuni) și nici conturile oamenilor reali.

Ce promite (exact numerele care trebuie să apară în formularul Data safety și în politica de
confidențialitate — sunt validate în funcție, ca un apel greșit să nu golească totul):

| Ce se șterge | Fereastră |
|---|---|
| firele de conversație ale oaspeților inactivi (mesajele cad prin cascadă) | **30 zile** |
| jurnalul de schimbare a dispozitivului de notificări (`notification_device_claims`) | **180 zile** |
| contoarele zilnice anonime (`guest_usage_daily`) | **31 zile** |
| conturile anonime complet abandonate (fără favorite, fără abonament, fără fire) | **30 zile** |

### 4.2 Programarea (o dată)
Dashboard → **Database → Extensions**: activează **`pg_cron`**. Apoi SQL Editor → deschide
`supabase/cron/schedule-retention-purge.sql`, copiază tot și rulează-l. Dacă extensia nu e activată,
fișierul **nu inventează** nimic: afișează un `notice` și nu programează nimic (rulează-l din nou după
ce activezi extensia).

### 4.3 Cum se închide (dovada cerută de la tine)
Rulează în SQL Editor și trimite-mi rezultatul (sunt interogări de citire):

```sql
select jobname, schedule, active from cron.job where jobname = 'retention-purge';
select proname from pg_proc where proname = 'purge_guest_chat_history';
```

Prima trebuie să întoarcă un rând cu `active = true`; a doua, funcția. Potrivit promisiunii,
**Data safety se completează după** ce acestea sunt verzi.

---

## 5. Autentificarea (Google / Apple) — „URL Configuration" în Supabase

**Nu închide niciun FAIL din poartă** (poarta nu citeşte dashboardul), dar închide două lucruri pe care le
simte un om real: butonul „Continuă cu Google" şi linkul din emailul „Ai uitat parola?". Amândouă merg azi
pe **aceeaşi** adresă greşită, deci se repară cu aceeaşi două câmpuri.

### 5.1 Ce e greşit acum (măsurat, 08.10.2026)
Supabase → proiectul `pgjabfgibdpcomegkojg` → **Authentication → URL Configuration**:

- `Site URL` este `http://127.0.0.1:8081` — valoarea implicită de development;
- lista `Redirect URLs` **nu** conţine `ortodoxia://auth`.

Când `redirect_to` nu e în lista albă, Supabase **îl ignoră fără să dea eroare** şi foloseşte `Site URL`.
De aceea autentificarea cu Google **chiar reuşeşte** (contul se creează), dar sesiunea e trimisă la o adresă
moartă (`http://127.0.0.1:8081`, unde nu ascultă nimic pe telefon), iar aplicaţia afişează „Autentificare
anulată". Exact acelaşi lucru se întâmplă cu linkul de resetare a parolei: **un om care îşi uită parola
rămâne blocat**.

### 5.2 Ce se apasă şi ce se lipeşte (2 minute)
Tot în **Authentication → URL Configuration**:

1. **Site URL** — schimbă `http://127.0.0.1:8081` în `https://ortodoxia.web.app` (domeniul canonic al
   aplicaţiei; e live şi răspunde 200). Nu lăsa `127.0.0.1` acolo nici ca „a doua variantă".
2. **Redirect URLs** — adaugă, **una pe linie** (butonul *Add URL* de fiecare dată):
   - `ortodoxia://**` ← patternul documentat de Supabase pentru scheme proprii; acoperă `ortodoxia://auth`
     folosit de aplicaţie (şi de linkul de parolă, şi de OAuth);
   - `https://ortodoxia.web.app/**` — pentru varianta web;
   - `http://localhost:8081/**` — opţional, doar pentru development local pe calculator.
3. **Save**. Fără pasul acesta, cele două câmpuri nu se aplică.

### 5.3 Apple — butonul se ascunde singur, nu-l „repara" manual
`GET /auth/v1/settings` răspunde azi **`"apple": false`** (providerul nu e activat), deci butonul „Continuă
cu Apple" **nu se mai afişează** în aplicaţie — un buton care duce garantat la eroare nu are ce căuta pe
ecran. Nu ai nimic de făcut aici.

În ziua în care vrei Apple pornit (pe Android nu e cerut de Google Play; e o cerinţă Apple pentru iOS):
**Authentication → Providers → Apple** → activează şi completează `Services ID`, `Team ID`, `Key ID` şi
cheia `.p8`. Butonul **reapare singur**, fără nicio modificare de cod — codul întreabă aceeaşi listă de
provideri la fiecare pornire.

### 5.4 Dovada care închide pasul (o aduc eu, fără credenţiale)
1. **Proba `303`** — `GET https://pgjabfgibdpcomegkojg.supabase.co/auth/v1/callback` cu cheia publicabilă:
   - *înainte:* `303` → `http://127.0.0.1:8081?error=…`;
   - *după:* `303` → `https://ortodoxia.web.app…`, **fără** `127.0.0.1` în adresă.
2. **Pe emulator, cu un cont real:** apeşi „Continuă cu Google" → se deschide Google → **fila se închide
   singură**, fără `127.0.0.1` în bara de adrese; ecranul **Cont** arată adresa contului; după
   `am force-stop` şi repornire, contul e **încă** autentificat.

Ambele sunt măsurători, nu promisiuni — trimite-mi doar „am salvat", restul verific eu.

---

## 6. Magazinul — în ordinea asta, după 1–5

1. **Textele de listare** sunt deja în limite (`docs/STORE_SUBMISSION_KIT.md`): titlul
   „Ortodoxia: calendar ortodox" = **27** caractere (max 30), descrierea scurtă are **51** caractere
   (max 80, iar vechiul text de 82 a fost scos). Verifică-le încă o dată înainte de lipire.
2. **Captura #1 de magazin trebuie refăcută**: acum `verse_source` nu mai conține „NULL" (0 rânduri),
   iar aplicația ascunde și valorile necitibile (`src/lib/content-source.ts`), deci ecranul arată
   referința biblică. Captura veche arăta id-ul intern.
3. **Capturile 07 (premium) și 08 (cont)** lipsesc: 6 din 8 există. Nu se pot face înainte de pasul 1
   (ecranul premium fără produse create nu are ce fotografia, vezi `store/screenshots/README.md`).
4. **AAB-ul de magazin există deja și e pe track-ul intern** (măsurat 08.10.2026):
   `android/app/build/outputs/bundle/release/app-release.aab` (82,6 MB, `versionCode 2`), semnat cu un
   certificat propriu (nu cu cel de debug), iar `node scripts/upload-play.mjs --dry-run` tipărește
   `track internal: completed:2` — versiunea e publicată pentru testare internă. Build-ul de release
   fără `ORTODOXIA_UPLOAD_*` este oprit de `android/app/build.gradle:144-152` (verificare de siguranță,
   `docs/ANDROID-HARDENING.md:27-29`); urcarea se face cu `node scripts/upload-play.mjs --track internal`
   (`docs/PLAY_UPLOAD.md`).
5. **Formularul Data safety** abia după capitolul 4 (reține ferestrele de retenție de acolo: 30/180/31
   de zile). Declarațiile despre tokenul de push sunt deja pregătite (poarta verifică 9 limbi).
6. **Ca să se poată CUMPĂRA Premium, contul trebuie să fie tester, iar aplicația trebuie instalată din
   Play.** Restul e deja pe loc (citit din Play Developer API la 08.10.2026): abonamentele există cu
   planurile de bază **ACTIVE** (vezi nota de la 1.1), iar versiunea `versionCode 2` e `completed` pe
   track-ul `internal`. Ce lipsește e **lista de testeri**: eroarea măsurată este „The item you were
   attempting to purchase could not be found." (fereastra Google Play), în timp ce pagina aplicației în
   Play Store scrie „Item not found."
   1. Play Console → **Test and release → Testing → Internal testing → fila Testers**: adaugă
      `casapufosului@gmail.com` și `stefanbdz1981@gmail.com` → **Save**.
   2. Apasă **Copy link** (linkul de înscriere, `https://play.google.com/apps/internaltest/…`).
   3. Deschide linkul **pe emulator, cu contul de tester** → *Become a tester* → *Download it on Google
      Play*. Instalarea prin `adb` nu poate cumpăra nimic (`installerPackageName=null`, măsurat).
   4. Play Console → **Setup → License testing**: adaugă aceleași conturi, ca testarea să nu coste.

   > **Capcană:** ecranul Premium arată 18,99 RON / 159,99 RON **și când Play nu poate vinde nimic** —
   > prețurile vin din catalogul RevenueCat, nu sunt dovadă că produsul există în Play.

---

## 7. Când e gata

După capitolele 1, 2 și 3, poarta trebuie să întoarcă **`RELEASE GATE: READY`** (0 FAIL).
Atunci rulează, în ordine:

```
npx tsc --noEmit
npm test
npm run test:release
npm run test:a11y
npm run test:safety
npm run lint
node scripts/release-readiness.mjs --release
```

Ultima linie tipărită trebuie să fie `RELEASE GATE: READY`. Dacă mai rămâne vreun `FAIL`, el este o
intrare de owner lipsă — nu se raportează „gata" cu FAIL-uri deschise.
