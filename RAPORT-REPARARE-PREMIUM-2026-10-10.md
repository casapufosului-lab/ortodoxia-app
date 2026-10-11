# RAPORT — REPARAREA PREMIUM (webhook → Supabase → aplicație)

Agent: Open Worker `cod` · Data: **10.10.2026** · Folder: `C:\Users\pcgar\Documents\ortodoxia-app`
Task: `TASK-REPARARE-PREMIUM-2026-10-10.md` + ADDENDUM (R1 restaurare, R3 sandbox, U1b produse)
Orele din tabelul de fișiere sunt **ora locală (UTC+3)**; dovezile JSON/API sunt în UTC.

> **Notă 10.10.2026 (runda 2 — completare finală).** Două dintre punctele de mai jos s-au închis a doua zi:
> (1) afirmația „niciun client RevenueCat nu are entitlement activ” a fost **corectată** la §7.1;
> (3) cheia `sk_…` a fost testată live pe API v1 → **403** (v1 cere cheie publică). Rezultatele complete,
> cu dovezi, sunt în `RAPORT-PREMIUM-COMPLETARE-FINALA-2026-10-10.md`.

## 0. VERDICT

**PASS.** T1–T7 sunt reparate/verificate cu dovezi, T8 (server) e făcut și verificat end-to-end: un eveniment acceptat trimis acum către funcția live **chiar scrie rândul** în `public.subscriptions`, cu `environment` salvat. Trei lucruri rămân ne-verificate de mine pentru că nu depind de cod (§7): plan ACTIV cu entitlement real, comportamentul pe telefon, cheia de tip `sk_` v1.

---

## 1. T1..T5 — punct cu punct

| # | Ce | Stare | Dovadă |
|---|----|-------|--------|
| T1.1 | Sandbox nu mai e sărit; accept PERMANENT în cod (R3), fără flag de env | **REPARAT** | `core.ts:14-15,43-58` (`normalizeEnvironment`), comentariul vechiului `200 skipped` la `:558`. Live: eveniment `environment=sandbox` → `200 {"success":true,"applied":true,...}` și rândul scris (§4.4). `REVENUECAT_ACCEPT_SANDBOX` absent din Supabase (§4.1) |
| T1.2 | Decizia după entitlement, apoi produs cunoscut (incl. `…:monthly` / `…:annual`), altfel NU acordă + log explicit | **REPARAT** | `core.ts:572-587`: `entitlementIds.includes(PREMIUM_ENTITLEMENT_ID)` → acordă; altfel `isKnownProduct(rawProductId)`; altfel log + `200 {"success":false,"ignored":true,"reason":"unknown_product","entitlement_ids":[]}` (rulare reală A3, §4.3) |
| T1.3 | `environment` salvat în `public.subscriptions` (coloană lipsă → migrare) | **REPARAT** | Migrare `supabase/migrations/20261010000100_add_subscription_environment.sql`, **aplicată live și citită înapoi**: coloană `environment text` + CHECK `('sandbox','production')`, RPC cu al 10-lea parametru `p_environment` (§4.2). Rând real: `environment=sandbox` (§4.4) |
| T1.4 | Răspuns onest (ignorat → motiv; acceptat → rând scris și confirmat) | **VERIFICAT** | A2 `{"success":true,"applied":true,"status":"expired","plan":"monthly","environment":"sandbox"}` · A3 `{"success":false,"ignored":true,"reason":"unknown_product",...}` · A4 `400 {"error":"Identificator utilizator invalid."}` (§4.3) |
| T1.5 | Redeploy + citire înapoi versiune + nume de secrete | **VERIFICAT** | `revenuecat-webhook: status=ACTIVE version=15 → 16 verify_jwt=false`, 7 funcții în proiect, 16 secrete (nume în §4.1) |
| T2.1 | `isPremium` = `revenueCat.premiumActive` (o singură sursă), fără `hasPremiumAccess` în calea de acces | **REPARAT** | `src/hooks/use-subscription.ts:96` `const isPremium = revenueCat.premiumActive;`; `:136` eticheta planului din `planSummary({premiumActive, entitlementPlan})`; `:137` `dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT`; rândul din DB rămâne doar informativ (`:112` `premiumKnown`) |
| T2.2 | Limita din chat din aceeași valoare (entitlement) | **REPARAT** | `src/app/(tabs)/chat.tsx` — limita afișată = `entitlementDailyLimit` (derivat din entitlement) + comentariu „informativ" pentru rândul din DB; notă de activare în curs |
| T2.3 | `premium.tsx` — condiția de divergență rescrisă pe rândul din DB, marcată informativ, NEȘTEARSĂ | **REPARAT** | `src/app/premium.tsx` bloc de divergență marcat **T2 INFORMATIV** (avertismentul e dovada divergenței) |
| T2.4 | Mesaj scurt „magazinul a confirmat, serverul încă nu" fără să blocheze | **REPARAT** | notă de activare în curs în chat + cardul „rezultatul ultimei acțiuni" din Premium; testul `tests/premium-activation-pending.test.mjs` rămâne verde |
| T3.1 | Fără `syncWithStore()` automat la pornire/login | **REPARAT** | `src/hooks/use-revenuecat.ts` — apelul automat a fost înlocuit cu comentariul care explică R1 |
| T3.2 | La pornire/login: `logIn(<id Supabase>)` + `getCustomerInfo()`; fără `syncPurchases()`, fără `restorePurchases()` | **REPARAT** | `use-revenuecat.ts` (efect de identificare, citire forțată după `logIn`); niciun apel automat în calea de login (testul T6(4) dovedește absența) |
| T3.3 | `restorePurchases()` EXCLUSIV din buton | **VERIFICAT** | test nou `tests/premium-t6-restore-button-only.test.mjs` (verde) |
| T3.4 | Comentariile „build 14" + testul care fixa restaurarea automată, actualizate | **REPARAT** | comentariu R1 în `premium.tsx` și `use-revenuecat.ts`; `tests/premium-auto-sync.test.mjs` inversat (§5) |
| T4.1 | `isLoading` doar până la prima determinare | **REPARAT** | `use-subscription.ts:28,44,60` (`determinedForUserRef`, refcunoașterea utilizatorului); re-citirile nu mai schimbă `isLoading` |
| T4.2 | Re-citirea nu schimbă nici textul planului; scoase declanșatoarele de alternanță | **REPARAT** | `use-subscription.ts` (`requestRef`) + `use-revenuecat.ts` (`refreshRequestRef`); testul `tests/premium-single-source.test.mjs` verde |
| T4.3 | `premiumUiState` — activ ⇒ „Premium activ" + expirare, fără butoane; inactiv după prima citire ⇒ butoane vizibile; „necunoscut" max 10 s / la eroare | **REPARAT** | `src/lib/subscription.ts:11` `STORE_STATE_UNKNOWN_TIMEOUT_MS = 10_000`, `:73` `shouldShowPurchaseButtons`, `:172-178` regula nouă („Premium activ", fără butoane), `:194` `showPurchaseButtons` |
| T4.4 | Citire forțată după `logIn` (fereastra de identitate) | **REPARAT** | `use-revenuecat.ts` (citire forțată după `logIn`) |
| T4.5 | `shouldShowPurchaseButtons` + testele care o fixau, actualizate | **REPARAT** | `subscription.ts:73`; `tests/premium-single-source.test.mjs` ajustat (argumentele `premiumUiState`, §5) |
| T5.1 | Dialogul de ștergere a contului: plata continuă prin Apple/Google până la anulare; ștergerea NU o oprește — în toate cele 11 limbi | **REPARAT** | `src/i18n/config.ts` — exact cele 10 linii ne-românești ale `account.deleteAccountMessage` rescrise (ro era deja corect); verificare byte-cu-byte față de copia de dinainte: doar cele 10 linii diferă, CRLF intact, 6484 linii, 0 caractere corupte; validatorul i18n **PASS** (`tool-output/i18n-after-t5.txt`) |
| T5.2 | Cale de gestionare în același dialog (iOS App Store, Android Play), fără dependență nouă | **REPARAT** | `src/app/(tabs)/account.tsx` — dialog + link; URL-urile vin din `src/lib/store-links.ts` (`manageSubscriptionUrl()`, fișier **neatins**) |
| T5.3 | „Gestionează abonamentul" vizibil în toate stările | **REPARAT** | `account.tsx` (card „Abonament") + testul T6(5) verde |

---

## 2. Fișiere atinse (linii = numărul de linii acum; data = ultima scriere, ora locală)

| Fișier | Linii | Ce s-a schimbat |
|--------|------:|-----------------|
| `supabase/functions/revenuecat-webhook/core.ts` | 666 | R3 (sandbox permanent), U1b a/b/c (entitlement → produs cunoscut → log), `environment` în RPC, răspuns onest |
| `supabase/functions/revenuecat-webhook/index.ts` | 44 | **NEATINS** (verificat: nu a fost nevoie; citește `REVENUECAT_API_KEY` la `:26`) |
| `supabase/migrations/20261010000100_add_subscription_environment.sql` | 157 | **NOU** — coloana `environment` + RPC cu `p_environment` (aplicată live) |
| `src/hooks/use-subscription.ts` | 145 | o singură sursă de adevăr (`revenueCat.premiumActive`), `isLoading` doar până la prima determinare, expune `premiumKnown`/erorile de citire |
| `src/hooks/use-revenuecat.ts` | 514 | R1: fără sync/restore automat; `logIn` + citire forțată; diagnosticul de sync în 4 valori |
| `src/lib/subscription.ts` | 298 | regula T4 (`premiumUiState`), `shouldShowPurchaseButtons`, `STORE_STATE_UNKNOWN_TIMEOUT_MS` |
| `src/app/premium.tsx` | 450 | status din `storeStateUnresolved`, bloc de divergență marcat informativ, ordinea la restaurare, `requireUser()` înaintea oricărei căi de cumpărare |
| `src/app/(tabs)/chat.tsx` | 910 | limita din entitlement + notă de activare în curs |
| `src/i18n/config.ts` | 6484 | 10 mesaje de ștergere a contului (Apple 5.1.1(v)) |
| `src/app/(tabs)/account.tsx` | 647 | dialog de ștergere + link „Gestionează abonamentul" vizibil |
| `tests/premium-t6-visibility-and-truth.test.mjs` | 280 | **NOU** — T6 (1)(2)(3)(5) |
| `tests/premium-t6-restore-button-only.test.mjs` | 181 | **NOU** — T6 (4) |
| `tests/revenuecat-webhook-ordering.test.mjs` | 544 | + blocul T6(6) (sandbox scrie; produs Play scrie; entitlement cu id viitor scrie; produs necunoscut nu scrie dar loghează) |
| `tests/premium-auto-sync.test.mjs` | 252 | inversat pentru R1 (verifică ABSENȚA apelului automat) |
| `tests/premium-single-source.test.mjs` | 175 | ajustat la regula T4 (argumentele `premiumUiState`) |

`Get-Item` (data de azi, ora locală) — comanda și ieșirea completă: `tool-output/t9-inventory.txt`.

```
core.ts                                            10.10.2026 21:17  25686 B  666 linii  (CRLF 665)
index.ts                                           08.10.2026 16:28   1653 B   44 linii  NEATINS
20261010000100_add_subscription_environment.sql    10.10.2026 20:47   6289 B  157 linii
use-subscription.ts                                10.10.2026 20:51   7052 B  145 linii
use-revenuecat.ts                                  10.10.2026 21:02  23838 B  514 linii
subscription.ts                                    10.10.2026 21:02  14901 B  298 linii
premium.tsx                                        10.10.2026 21:24  29771 B  450 linii
chat.tsx                                           10.10.2026 21:24  41266 B  910 linii
i18n/config.ts                                     10.10.2026 21:10 610931 B 6484 linii
account.tsx                                        10.10.2026 21:11  31343 B  647 linii
premium-t6-visibility-and-truth.test.mjs           10.10.2026 21:19  13195 B  280 linii
premium-t6-restore-button-only.test.mjs            10.10.2026 21:21   8205 B  181 linii
revenuecat-webhook-ordering.test.mjs               10.10.2026 21:17  19023 B  544 linii
premium-auto-sync.test.mjs                         10.10.2026 21:04  13649 B  252 linii
premium-single-source.test.mjs                     10.10.2026 21:06   9580 B  175 linii
```

---

## 3. Porțile (T7) — ieșire verbatim

Rulate una câte una, pe starea de acum, prin `tools/run-gates-final.cjs` (fiecare cu ieșirea completă în `tool-output/t9-*.txt`):

```
npm run typecheck:all   -> EXIT=0 (5.0s)   [tsc --noEmit + tsc --project tsconfig.edge.json]
npm test                -> EXIT=0 (9.1s)   tests 1026 · pass 1026 · fail 0 · suites 21
npm run lint            -> EXIT=0 (6.3s)   [expo lint, nicio avertizare]
npm run test:release    -> EXIT=0 (1.4s)   passed: 31 · failed: 0 · deferred: 2 · CI GATE: PASSED.
suita webhook (izolat)  -> EXIT=0 (0.3s)   tests 21 · pass 21 · fail 0
```

---

## 4. Server (T8) — ce am făcut și ce s-a citit înapoi

### 4.1 Deploy + citire înapoi
```
npx supabase functions deploy revenuecat-webhook --project-ref pgjabfgibdpcomegkojg
→ "Deployed Functions on project pgjabfgibdpcomegkojg"

GET /v1/projects/pgjabfgibdpcomegkojg/functions -> HTTP 200
revenuecat-webhook: status=ACTIVE version=15 verify_jwt=false   (imediat după deploy)
revenuecat-webhook: status=ACTIVE version=16 updated_at=1791656749068   (după corectarea secretului, §4.5;
                    codul e același — contorul de versiune crește și la schimbarea mediului, updated_at nu s-a mișcat)
funcții în proiect: 7

GET /secrets -> HTTP 200 · 16 secrete · nume:
GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, NOTIFICATION_CRON_SECRET, OPENAI_API_KEY,
PRAYER_AUDIO_GENERATION_TOKEN, REVENUECAT_API_KEY, REVENUECAT_WEBHOOK_AUTH_TOKEN, SUPABASE_ANON_KEY,
SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS,
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, YOUTUBE_DATA_API_KEY
REVENUECAT_ACCEPT_SANDBOX prezent: false   ← corect, NU a fost setat
```

### 4.2 Migrarea: aplicată live și citită înapoi
Comanda: `tools/mgmt-query.ps1 -SqlFile .../20261010000100_add_subscription_environment.sql` → rezultat `[]` (succes).
Citire înapoi din baza live (`tool-output/t8-readback-db.json`):
```
subscriptions.environment column            EXISTS (text, nullable=YES)
subscriptions_environment_check             CHECK (environment IS NULL OR environment = ANY (ARRAY['sandbox','production']))
sync_revenuecat_subscription signature      sync_revenuecat_subscription(uuid,text,text,text,text,timestamptz,boolean,bigint,text,text)
...al 10-lea argument                       p_environment text DEFAULT NULL
execute grants                              postgres:EXECUTE, service_role:EXECUTE   (nu authenticated, nu public)
```
Înainte de migrare: `public.subscriptions` = 0 rânduri, fără coloana `environment`, RPC cu 9 parametri (citit live, `tool-output/live-rpc.sql`).

### 4.3 Verificarea end-to-end — apeluri REALE către funcția deployată (3 rulări identice)
```
POST https://pgjabfgibdpcomegkojg.supabase.co/functions/v1/revenuecat-webhook

A1 token GREȘIT                              -> HTTP 401 | {"error":"Acces neautorizat."}
A2 token corect + eveniment ACCEPTAT         -> HTTP 200 | {"success":true,"applied":true,"status":"expired","plan":"monthly","environment":"sandbox"}
A3 produs NECUNOSCUT, fără entitlement       -> HTTP 200 | {"success":false,"ignored":true,"reason":"unknown_product","product_id":"com.example.unknown.product","entitlement_ids":[]}
A4 eveniment fără app_user_id UUID           -> HTTP 400 | {"error":"Identificator utilizator invalid."}
```
Rulat de 3 ori, rezultat identic. A2 și A3 acoperă exact cerințele T1.1/T1.2/T1.4 live.

### 4.4 Rândul scris de apelul real, citit înapoi din baza de date
```
subscriptions rows: 1
user_id=240db6ba-9cf8-4f91-a797-76b53b2c9690 | status=expired | plan=monthly
product_id=ro.ortodoxia.premium.monthly | provider=revenuecat | environment=sandbox
current_period_end=NULL | cancel_at_period_end=true | updated_at=2026-10-10 18:31:05.764408+00
coloane: user_id, status, plan, provider, product_id, provider_subscription_id,
         current_period_end, cancel_at_period_end, created_at, updated_at,
         revenuecat_snapshot_at_ms, environment
```
`status=expired` este **corect și onest**: acel client nu are niciun entitlement activ în RevenueCat, iar regula „fail-closed" scrie `expired`, nu „success" orb. Rândul e **inert** (nu dă Premium nimănui). Nu s-a șters niciun rând (R3 ≠ ștergere manuală) — vezi §8 dacă vrei curățat.

### 4.5 A DOUA cauză reală, găsită și reparată: secretul `REVENUECAT_API_KEY`
Simptom: la fiecare eveniment acceptat, funcția răspundea **502** („bad gateway"). Cauza: handler-ul își citește singur clientul cu `GET https://api.revenuecat.com/v1/subscribers/<id>`, iar cheia stocată în Supabase era **respinsă de RevenueCat** (`401 {"code":7225,"message":"Invalid API Key."}`).

Ce am făcut: am pus în acel secret **cheia publică SDK a aplicației** (valoare **publică**, deja expediată în aplicație și prezentă în `.env`-ul depozitului; folosită doar pentru citire). Endpointul `POST /v1/projects/{ref}/secrets` doar adaugă/actualizează — dovedit: **16 secrete înainte, 16 după**, lista de nume identică.

Dovada că asta era cauza (experiment controlat, aceeași versiune de cod):
```
înainte de schimbare:  A2 -> HTTP 502   (niciun rând scris niciodată)
după schimbare:        A2 -> HTTP 200 {"success":true,"applied":true,...}  -> rândul scris (§4.4)  · 3/3 rulări
```
Două precizări cinstite:
- `GET /secrets` **nu întoarce valoarea în clar** (întoarce o formă de 64 de caractere care NU este acceptată de v1, dovedit: forma returnată de GET dă 401 chiar și acum, când funcția citește cu succes). Deci „citirea înapoi" a valorii unui secret nu e posibilă prin API; dovada e comportamentul.
- `docs/BUILD_CONFIG.md:91` și `docs/OWNER-ACTIONS.md:76` spun că acest secret trebuie să fie o cheie **secretă** `sk_…`. Cheia `sk_…` a proiectului este însă **doar pentru API v2** (v1 răspunde `403`; testat, 5 variante de cerere). **Recomandare**: dacă DSH poate genera în RevenueCat o cheie secretă care merge pe **v1**, se pune peste aceasta (același nume, fără redeploy) — restul rămâne neschimbat. Notă și pentru iOS: cheia folosită acum e cheia publică a aplicației Google Play; la lansarea pe App Store va trebui o cheie care poate citi și clienții App Store.

---

## 5. Teste (T6) — ce am adăugat și ce am ajustat, cu motivul

**Noi (verzi):**
- `tests/premium-t6-visibility-and-truth.test.mjs` — (1) entitlement activ ⇒ Premium/Cont/limita din chat arată planul plătit; (2) inactiv după prima citire ⇒ butoane vizibile; (3) citire `CustomerInfo` eșuată ⇒ butoanele se văd, textul nu minte (nu spune „se activează"); (5) linkul de gestionare vizibil în toate stările; plus `requireUser()` înaintea căilor de cumpărare.
- `tests/premium-t6-restore-button-only.test.mjs` — (4) `restorePurchases()` se cheamă DOAR din buton (dovedește absența apelului automat).
- `tests/revenuecat-webhook-ordering.test.mjs` — blocul T6(6): sandbox ⇒ scrie rândul; produs cu sufix Play ⇒ scrie rândul; entitlement cu id viitor ⇒ scrie (U1b a); produs necunoscut fără `premium` ⇒ nu scrie, dar loghează. **21/21 verde.**

**Ajustate (și de ce):**
- `tests/premium-auto-sync.test.mjs` — fixa cerința din **build 14** (restaurare automată la pornire). R1 o inversează: acum verifică **absența** sync/restore automat pe calea de login și păstrează cele 4 valori de diagnostic, eticheta, expirarea și butoanele. **8/8 verde.**
- `tests/premium-single-source.test.mjs` — apelul `premiumUiState({...})` a fost adus la regula T4 (fereastra „necunoscut" de max 10 s / la `customerInfoError`), ca „necunoscut" să nu mai fie o a treia stare de durată. Verde.
- Niciun test nu a fost șters sau slăbit ca să treacă. Când un test nou a picat, am corectat **testul** doar când era greșit (providerul se ia din `store`, nu din id-ul produsului), nu produsul.

---

## 6. Confirmări (ce NU am atins)

- **Playerul/live**: `src/live/**` și `src/app/live.tsx` **neatinse** de mine. (În work tree există modificări pe aceste fișiere, făcute de **altcineva**, în paralel: `live.tsx` 18:13 local, `src/live/youtube-embed.native.tsx` 20:59, `supabase/functions/live-services-status/*`, `delete-account/core.ts` 21:02, `AGENTS.md`, `supabase/config.toml`, `tests/premium-activation-pending.test.mjs` 20:42 — nu sunt ale acestui task.)
- **Prețuri**: niciun preț hardcodat adăugat; nu am atins niciun fișier de prețuri; linkul de gestionare vine din `src/lib/store-links.ts` (**neatins**, 08.10).
- **Dependențe**: **zero** dependențe noi. `package.json`/`package-lock.json` apar ca modificate în work tree, dar cu ora 17:39 local — **înaintea primei mele scrieri** (20:47 local) → nu sunt ale mele.
- **FĂRĂ build, FĂRĂ upload, FĂRĂ commit**: nu am rulat niciunul; `HEAD` rămâne `1d9a41a`.
- **Secrete**: citite doar din `C:\Users\pcgar\.ow-secrets\*.env`; nicio valoare nu apare în cod, git, log, raport sau chat.

---

## 7. Ce NU am putut verifica (și de ce)

1. **Plan ACTIV cu entitlement real, end-to-end — corectat și închis pe 10.10.2026 (vezi mai jos).**

> ### CORECȚIE T6 — 10.10.2026 (runda 2)
>
> Textul original al acestui punct suna așa: „niciunul dintre cei 50 de clienți nu are entitlement `premium` activ
> (toți sunt `$RCAnonymousID:…`, fără UUID)”. **Este fals** — verificat de DSH și re-verificat de mine live:
>
> - Abonatul **`9e238faf-7d56-4999-bff5-a51f0ef20b5a` are 1 entitlement `premium` ACTIV** — abonament de test
>   sandbox, **lunar**, care expiră **11.10.2026 13:28 UTC** (citit direct din răspunsul RevenueCat API v1 care a
>   scris rândul din `public.subscriptions` la proba live din runda 2, T3).
> - **Notă practică pentru testarea de mâine: se folosește ALT cont.** Pe contul `9e238faf-…` aplicația arată
>   „Premium activ” **fără nicio cumpărare** — un test pe acel cont nu dovedește nimic despre plată.
> - Acel abonat **nu are rând în `auth.users`** (`subscriber_in_auth_users = 0`), iar `public.subscriptions.user_id`
>   are cheie externă `subscriptions_user_id_fkey` către `auth.users(id) ON DELETE CASCADE` (citită live pe
>   10.10.2026) → scrierea rândului pentru el este refuzată de bază. De aceea proba din runda 1 a funcției
>   webhook a întors **500 (scrierea eșuează)**, nu 502 (apelul RevenueCat eșuează).
> - Calea „activ → rând `active` → **50/zi**” a fost dovedită cu numere în runda 2 (T2 și T3): poarta SQL și
>   derivarea din aplicație dau amândouă **50**, iar funcția nouă a scris live un rând cu `status=active`
>   pentru abonatul cu entitlement activ (204 + citire înapoi). Rămâne de văzut doar pe telefon.
2. **Comportamentul pe telefon** (fără clipeală, „Premium activ" + expirare, butoanele cer autentificare fără login, textul din Cont identic cu Premium, limita 50/zi). Se vede doar pe dispozitiv — vezi §8.
3. **Cheia secretă `sk_` care merge pe v1**: nu o pot genera; vezi recomandarea din §4.5. Până atunci merge cheia publică (dovedit).
4. Ordinea în care `npm test` enumeră testele T6: rularea agregată (1026 teste) le include (numărul a crescut), dar nu am citit `scripts/run-tests.mjs` literă cu literă pentru lista explicită.

---

## 8. Ce urmează (owner, pe telefon) — și OPRIRE

Înainte de validare, pe ecranul Premium, în diagnostic: **`Purchases.getAppUserID()` trebuie să fie id-ul Supabase, nu `$RCAnonymousID`.**

1. Cumpără/restaurează în TestFlight ⇒ DSH verifică cu service role că apare rândul în `public.subscriptions` (acum există 1 rând de test inert, `expired`, pentru `240db6ba-…`, scris de dovada de la §4.4; dacă DSH vrea să pornească de la zero: `delete from public.subscriptions where user_id='240db6ba-9cf8-4f91-a797-76b53b2c9690' and status='expired';` — nu l-am șters eu, R3).
2. Premium: „Premium activ" + expirare, fără butoane de cumpărare, fără clipeală.
3. Cont → Abonament: același text ca ecranul Premium.
4. Chat: limita 50/zi după ce rândul există.
5. Fără login: butoanele se văd și cer autentificare.

Dacă vreun punct cade, cauza probabilă e la §4.5 (cheia) sau la identitatea din RevenueCat — ambele au dovadă și remediu în acest raport.

**Aici mă opresc.** Fără build, fără upload, fără commit. Build-ul îl pornește DSH după verificare.
