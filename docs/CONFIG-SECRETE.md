# Registru de configurare — secrete (FĂRĂ VALORI)

> **Scop:** cine schimbă ce, de ce, și ce se strică dacă se schimbă greșit.
> **Regulă absolută: în acest fișier nu apare nicio valoare de cheie.** Doar nume, tip, scop, limite.
> **Scris:** 10.10.2026 de **Open Worker** (runda 2, T4). Proiect Supabase: `pgjabfgibdpcomegkojg`.
> Valorile nu au fost citite de mine: `GET /v1/projects/{ref}/secrets` întoarce valorile **mascate**, iar
> cheia folosită de funcții a fost dovedită doar **live** (apel real care a reușit), nu citită.
> Numărul de secrete citit înapoi pe 10.10.2026: **16**.

---

## 1. Secrete care țin lanțul Premium (singurele care contează pentru acces)

| Nume | Scop | Cine / când l-a schimbat ultima dată | Ce tip de cheie este | Limită / ce poate face | Cum se verifică |
|---|---|---|---|---|---|
| `REVENUECAT_API_KEY` | Cheia cu care **funcțiile edge** (`revenuecat-webhook`, `revenuecat-sync-user`) citesc abonatul din RevenueCat. Se folosește **doar pe server**; nu ajunge niciodată în aplicație, în log sau în raport. | **Open Worker, 10.10.2026** (runda 1, T8) — scrisă ca **cheie publică SDK** a proiectului, după ce varianta anterioară dădea 502 pe webhook. | **Cheie publică SDK** (nu cheie secretă de API). Se folosește pe **RevenueCat API v1** (`GET https://api.revenuecat.com/v1/subscribers/<id>`). | **Citire** pe v1, pentru proiectul ei. **Nu** are drepturi de scriere/administrare. **NU funcționează pe API v2** și **nici invers:** o cheie secretă `sk_…` dă **403 pe v1** (măsurat în T1). | `node scripts/revenuecat-key-health.mjs --env-file C:\Users\pcgar\.ow-secrets\supabase.env` → **PASS = HTTP 200** pe apelul real; **FAIL = exit 1** cu codul HTTP. Se poate compara cu o a doua cheie prin `--secret-key-file` + `--secret-key-name`. |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | Valoarea din headerul de autorizare pe care RevenueCat o trimite către `revenuecat-webhook`; funcția o compară și răspunde **401** dacă nu se potrivește. | **DSH, 09–10.10.2026** — setat în dashboardul RevenueCat ȘI în Supabase. Valoarea **nu poate fi citită înapoi** din niciun API (nici din dashboardul RevenueCat). | Secret partajat (șir oarecare, nu e cheie de API). | Doar autentifică apelurile webhook. **Nu** dă acces la RevenueCat. | Nu se poate verifica din afară fără a trimite un apel webhook semnat; dovada indirectă = un webhook real care primește altceva decât 401. |

**Notă de context (T0/DSH, 10.10.2026):** `revenuecat-webhook` citește abonatul cu `REVENUECAT_API_KEY` și răspunde **502** dacă acel apel eșuează; deci „altceva decât 502" pe calea webhook dovedește că apelul RevenueCat a reușit.

---

## 2. Secrete de platformă (generate/menținute de Supabase — nu se ating de mână)

| Nume | Scop | Cine / când | Tip | Notă |
|---|---|---|---|---|
| `SUPABASE_URL` | URL-ul proiectului, folosit de funcții | Supabase (automat) | valoare de configurare | Se citește de funcții; nu e secretă în sine |
| `SUPABASE_ANON_KEY` | Cheia publicabilă veche, pentru clienți | Supabase (automat) | cheie publică (JWT, `role=anon`) | Expusă intenționat (e în aplicație) |
| `SUPABASE_PUBLISHABLE_KEYS` | Cheile publicabile noi (set, pentru rotație) | Supabase (automat) | chei publice | Înlocuitor pentru `SUPABASE_ANON_KEY` |
| `SUPABASE_SECRET_KEYS` | Cheile secrete noi (set, pentru rotație) | Supabase (automat) | chei secrete | **Nu** ies din server |
| `SUPABASE_SERVICE_ROLE_KEY` | Ocolirea RLS pentru operații de server | Supabase (automat) | cheie secretă (JWT, `role=service_role`) | Putere totală pe bază; folosită de scripturile de verificare |
| `SUPABASE_JWKS` | Cheile publice pentru validarea JWT | Supabase (automat) | chei publice (JWKS) | Permite verificarea semnăturii tokenurilor |
| `SUPABASE_DB_URL` | Șirul de conexiune la Postgres | Supabase (automat) | conține parolă | **Nu** se copiază nicăieri |

---

## 3. Alte secrete de funcții (nu au legătură cu Premium)

| Nume | Scop | Cine / când |
|---|---|---|
| `OPENAI_API_KEY` | `orthodox-chat` (răspunsuri AI) | neschimbat în aceste două runde |
| `GEMINI_API_KEY` | `orthodox-chat`, rezervă/furnizor alternativ | neschimbat în aceste două runde |
| `GROQ_API_KEY` | `orthodox-chat`, rezervă | neschimbat în aceste două runde |
| `MISTRAL_API_KEY` | `orthodox-chat`, rezervă | neschimbat în aceste două runde |
| `YOUTUBE_DATA_API_KEY` | `live-services-status` (starea transmisiilor) | neschimbat în aceste două runde |
| `NOTIFICATION_CRON_SECRET` | `send-daily-notifications` (doar cronul poate chema) | neschimbat în aceste două runde |
| `PRAYER_AUDIO_GENERATION_TOKEN` | `generate-prayer-audio` | neschimbat în aceste două runde |

---

## 4. Fișierele locale de secrete (pe acest calculator, în afara depozitului de cod)

Cale: `C:\Users\pcgar\.ow-secrets\`. Se **citesc** doar de acolo; nu se scriu în cod, git, log sau chat.
Mai jos sunt **doar numele** variabilelor din fiecare fișier (citite cu `tools/secrets-keys.cjs`).

| Fișier | Variabile (doar nume) |
|---|---|
| `supabase.env` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_PROJECT_REF` |
| `revenuecat.env` | `REVENUECAT_SECRET_API_KEY_V2`, `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_AUTH_TOKEN`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_IOS_APP_ID`, `REVENUECAT_ANDROID_APP_ID`, `REVENUECAT_TEST_APP_ID`, `REVENUECAT_ENTITLEMENT_ID` |
| `apple.env` | `APPLE_ISSUER_ID`, `APPLE_API_KEY`, `APPLE_TEAM_ID`, `APPLE_ASC_PRIVATE_KEY_PATH`, `APPLE_APP_ID`, `APPLE_SUBSCRIPTION_MONTHLY_ID`, `APPLE_SUBSCRIPTION_ANNUAL_ID`, `APPLE_REVIEW_DEMO_EMAIL`, `APPLE_REVIEW_DEMO_PASSWORD`, `SIWA_KEY_ID`, `SIWA_TEAM_ID`, `SIWA_CLIENT_SECRET`, `SIWA_PRIVATE_KEY_PATH` |
| `google-play.env` | `GOOGLE_PLAY_SERVICE_ACCOUNT_PATH`, `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` |
| `misc.env` | `YOUTUBE_DATA_API_KEY`, `EXPO_API_KEY` |

Fișiere care nu sunt `.env` și nu se citesc: `README.md`, `apple-asc-key.p8`, `siwa-key.p8`, `google-play-service-account.json`.

---

## 5. Dependențe fragile — de citit ÎNAINTE de a schimba o cheie

1. **API v1 cere o cheie PUBLICĂ.** `REVENUECAT_API_KEY` trebuie să rămână o cheie publică SDK. Dacă cineva o înlocuiește cu o cheie secretă `sk_…` (firească pentru API v2), lanțul se rupe: apelul către v1 dă **403** → webhook-ul răspunde **502** și funcția de sincronizare la fel, în timp ce aplicația continuă să arate „Premium activ" din entitlement. Adică exact gaura „Premium activ + 5/zi" reapare, fără nicio eroare vizibilă în RevenueCat. **Măsurat în T1: `sk_…` → 403 pe v1.**
2. **Valoarea nu poate fi auditată din afară.** Citirea secretelor prin Management API întoarce valoarea **mascată**, deci nu se poate compara cu ce e în `.ow-secrets`. Singura dovadă reală e un **apel live** —`scripts/revenuecat-key-health.mjs` (și, mai puternic, un apel real al funcției care întoarce 204).
3. **`REVENUECAT_WEBHOOK_AUTH_TOKEN` trăiește în două locuri** (dashboardul RevenueCat + Supabase). Se schimbă **simultan**; altfel webhook-ul dă 401, iar rândul din `public.subscriptions` nu se mai scrie niciodată — fără nicio eroare vizibilă în aplicație.
4. **`REVENUECAT_ACCEPT_SANDBOX` NU se setează** (decizia R3). Acceptul pentru evenimentele de sandbox e permanent, în cod. Dacă cineva îl adaugă, nu strică nimic, dar contrazice decizia și poate crea impresia că sandboxul depinde de o variabilă de mediu.
5. **Ordinea corectă la rotație:** (a) scrie cheia nouă în Supabase; (b) rulează `scripts/revenuecat-key-health.mjs` → PASS; (c) abia apoi consideră schimbarea încheiată. Fără pasul (b), nu se știe dacă cheia merge pe v1.

---

## 6. Verificări care se rulează la orice atingere a acestor secrete

```
node scripts/revenuecat-key-health.mjs --env-file C:\Users\pcgar\.ow-secrets\supabase.env
node scripts/premium-chain-verify.mjs
```

- Primul: **PASS** = HTTP 200 pe apelul real către RevenueCat v1 (altfel **FAIL**, exit 1, cu codul HTTP și mesajul). Nu afișează niciodată valoarea cheii — doar prefix de 5 caractere și lungime.
- Al doilea: dovedește lanțul cap-coadă cu numere — poarta SQL dă **50** și derivarea din aplicație dă **50** pentru un abonament activ (resetează rândul de test la starea inițială și citește înapoi).

---

## 7. Jurnal de schimbări (cele mai recente primele)

| Data | Ce | Cine |
|---|---|---|
| 10.10.2026, 20:06 UTC | `revenuecat-sync-user` deployat (v1, ACTIVE, `verify_jwt: true`); folosește `REVENUECAT_API_KEY` pe v1, doar pe server | Open Worker (runda 2, T3) |
| 10.10.2026 | `REVENUECAT_API_KEY` scrisă ca **cheie publică SDK** (după 502 pe webhook cu varianta anterioară) | Open Worker (runda 1, T8) |
| 10.10.2026 | Migrarea `20261010000100_add_subscription_environment.sql` (coloana `environment`, `CHECK sandbox/production`) | Open Worker (runda 1) |
| 09–10.10.2026 | `REVENUECAT_WEBHOOK_AUTH_TOKEN` setat în RevenueCat + Supabase; webhook-ul `revenuecat-webhook` redeployat | DSH |
