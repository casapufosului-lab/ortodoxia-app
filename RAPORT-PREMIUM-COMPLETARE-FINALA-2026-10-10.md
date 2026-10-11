# RAPORT — PREMIUM, COMPLETARE FINALĂ (rundă 2)

**Data:** 10.10.2026 · **Folder:** `C:\Users\pcgar\Documents\ortodoxia-app` · **Autor:** Open Worker (`cod`)
**Task:** „TASK OPEN WORKER — PREMIUM, COMPLETARE FINALĂ (cod + config, cu porți binare)"
**Scop:** închiderea găurii „Premium activ + 5/zi" (poarta de acces e în bază, ecranul citește entitlement-ul) + porți binare de verificare.
**Reguli respectate:** secretele s-au citit **doar** din `C:\Users\pcgar\.ow-secrets\*.env`; în raport apar doar **nume** de secrete și **prefix + lungime**, niciodată valori. Fără build, fără upload, fără commit.

---

## 0. FAPTE T0 — CONFIRMATE SAU DEVIATE (nu s-au redeschis, s-au re-verificat live)

| # | Faptul din T0 | Verificat acum | Rezultat |
|---|---|---|---|
| 1 | `revenuecat-webhook` = **v16** ACTIVE; cheamă `GET /v1/subscribers/<id>` și dă 502 dacă apelul eșuează | read-back Management API: `GET /v1/projects/pgjabfgibdpcomegkojg/functions -> HTTP 200` | **DEVIAT**: funcția e acum **v18**, `verify_jwt=false`, `updated=1791656749068` (10.10.2026 18:25:49Z / 21:25:49 local). Comportamentul e tot cel reparat — vezi dovada de mai jos |
| 2 | `REVENUECAT_API_KEY` din Supabase = cheie de 64 caractere, prefix `04e8e…`, pe API v1 | script T1, PART A | **CONFIRMAT** (prefix `04e8e…`, lungime raportată 64) + **nuanță dovedită**: valoarea citită înapoi e **mascată** de Management API (un secret-sondă de 33 de caractere s-a citit înapoi ca 64) → un 401 pe valoarea mascată **nu** spune nimic despre cheia reală |
| 3 | `public.subscriptions` = 1 rând (test): `status=expired, plan=annual, provider=revenuecat, environment=sandbox, user_id=240db6ba-…` | script T2, snapshot înainte + read-back după reset; T3 dovada live | **CONFIRMAT**: 1 rând înainte și după toate probele; rândul a fost readus exact la snapshot |
| 4 | „niciun client RC nu are entitlement activ" = FALS; `9e238faf-…` are 1 entitlement activ | script T1 (PART B, eveniment acceptat pentru acel abonat) | **CONFIRMAT** și **corectat în raportul rundei 1** (vezi T6) |
| 5 | Poarta se taie în bază (`reserve_ai_request` → 50/zi premium, 5/zi gratuit); ecranul citește entitlement-ul → DOUĂ SURSE | script T2, PAS 4 + PAS 5 | **CONFIRMAT cu numere**: `daily_limit=50` din bază ȘI `dailyAiLimit=50` din aplicație |
| 6 | Testele: 25/25 și 55/55 — verzi | rularea completă de acum | **CONFIRMAT, peste**: `npm test` = **106 fișiere, 1046 teste, 1046 trec, 0 cad** |

**Dovada că funcția deployată (v18) conține logica reparată** — nu doar presupunerea din versiune:

```
INFO rând inainte: HTTP 200 []
PART B · functia DEPLOYATA, eveniment acceptat (sandbox + entitlement premium) → HTTP 500 | {"error":"Actualizarea nu a reusit."}
INFO rând dupa: HTTP 200 []
PART B: cheia EFECTIVA trece de API v1 (apelul RevenueCat a reușit).
VERDICT: PASS
```

Un eveniment `sandbox` care **nu** e sărit peste (deci acceptul pentru sandbox e în cod) și care întoarce **500** („scrierea a eșuat"), nu 502 („apelul RevenueCat a eșuat") = exact maparea din codul reparat. Al doilea `HTTP 200 []` dovedește că **nu s-a scris niciun rând** în plus (abonatul RC `9e238faf-…` nu are rând în `auth.users`, iar `subscriptions_user_id_fkey` refuză scrierea).

---

## 1. T1 — CHEIA REVENUECAT: VERIFICARE CARE EȘUEAZĂ, NU DOAR LOG

**Fișier nou:** `scripts/revenuecat-key-health.mjs` (303 linii, 14 982 bytes).
Citește secretele la rulare din `--env-file=<cale>`, ia `REVENUECAT_API_KEY` din Supabase prin Management API (cu `SUPABASE_ACCESS_TOKEN`) și face **exact apelul funcției**: `GET https://api.revenuecat.com/v1/subscribers/9e238faf-7d56-4999-bff5-a51f0ef20b5a`. Nu afișează niciodată valori — doar prefix de 5 caractere + lungime.

**Sintaxa reală a opțiunilor** (diferă de ce scria în brief, care zicea `--secret-key=<sk_…>` / env `REVENUECAT_V1_SECRET_KEY`):
`--env-file=<cale>` (obligatoriu) · `--secret-key=<valoare>` · `--secret-key-file=<cale>` + `--secret-key-name=<NUME>` (se pot repeta, perechi în ordine) · `--through-function` + `--webhook-env-file=<cale>` + `--subscriber=<uuid>` · `--json`.

### 1.a Rularea de bază (PART A: valoarea citită din Supabase)

```
== revenuecat-key-health (T1) ==
proiect Supabase: pgjabfgibdpcomegkojg
abonat real pentru PASS/FAIL: 9e238faf-7d56-4999-bff5-a51f0ef20b5a
REVENUECAT_API_KEY din Supabase: prefix=04e8e… lungime=64 · actualizat: 2026-10-10T18:30:56.192Z
PART A · GET /v1/subscribers/<abonat real> cu valoarea citita din Management API → HTTP 401 (Invalid API Key.)
PART A nu poate hotari singura: valoarea returnata de Management API este MASCATA (dovada: un secret-sonda de 33 de caractere s-a citit inapoi ca 64 de caractere). Verdictul real il da PART B (--through-function).
INFO sonda pe un abonat inexistent (nu decide nimic) → HTTP 401 (Invalid API Key.)
VERDICT: FAIL (PART A HTTP 401: Invalid API Key. — valoarea citita inapoi e mascata)
```

### 1.b Comparația cu cheia v2 (`sk_…`)

```
PART A2 · REVENUECAT_SECRET_API_KEY_V2 din C:\Users\pcgar\.ow-secrets\revenuecat.env: prefix=sk_He… lungime=32 → HTTP 403 (You're trying to use a secret API key incompatible with RevenueCat API V1.)
PART A2 · REVENUECAT_SECRET_API_KEY_V2 din C:\Users\pcgar\.ow-secrets\revenuecat.env NU functioneaza pe v1.
```

### 1.c PART B — prin funcția deployată (criteriul care decide)

```
PART B · functia DEPLOYATA, eveniment acceptat (sandbox + entitlement premium) → HTTP 500 | {"error":"Actualizarea nu a reusit."}
PART B: cheia EFECTIVA trece de API v1 (apelul RevenueCat a reusit).
VERDICT: PASS
```

`EXIT=0` pentru 1.c; `EXIT=1` pentru 1.a și 1.b.

### Concluzii T1 (binar)

1. **Cheia care funcționează pe API v1 este cheia publică SDK** (`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`, `goog_…`, lungime 32) — dovedit în runda 1 prin `tools/t10-key-identity.cjs` (HTTP 200 pe abonatul real) și acum prin PART B.
2. **Cheia secretă `sk_…` NU merge pe v1**: `HTTP 403` — *„You're trying to use a secret API key incompatible with RevenueCat API V1."* → **T1b NU se aplică** (nu are sens să pun o cheie care dă 403 în secretul funcției).
3. Conform brief-ului, pentru cazul „`sk_` dă 403 pe v1": se **documentează în T4** că v1 cere cheie publică și că e o **dependență fragilă** → făcut (vezi T4).
4. **Criteriul binar din Definition of Done #1 e îndeplinit**: scriptul iese **0** (`--through-function`). PART A singură iese 1, dar **motivul e mascarea read-back-ului**, nu o cheie greșită — iar scriptul tipărește exact codul HTTP (401) și motivul.

---

## 2. T2 — LANȚUL COMPLET, CAP-COADĂ, CU NUMERE

**Fișier nou:** `scripts/premium-chain-verify.mjs` (312 linii, 13 873 bytes). Opțiuni: `--env-file=<cale>` (obligatoriu) · `--user-id=<uuid>` · `--json` · `--keep-row`.

```
== premium-chain-verify (T2) ==
utilizator de test: 240db6ba-9cf8-4f91-a797-76b53b2c9690
proiect: https://pgjabfgibdpcomegkojg.supabase.co

PAS 2 · rând INAINTE (snapshot): {"user_id":"240db6ba-9cf8-4f91-a797-76b53b2c9690","status":"expired","plan":"annual","provider":"revenuecat","product_id":"ro.ortodoxia.premium.annual","provider_subscription_id":null,"current_period_end":null,"cancel_at_period_end":true,"created_at":"2026-10-10T18:31:05.764408+00:00","updated_at":"2026-10-10T19:06:47.27545+00:00","revenuecat_snapshot_at_ms":1791658069617,"environment":"sandbox"}
PAS 3 · rând DUPA scriere (read-back): {"user_id":"240db6ba-9cf8-4f91-a797-76b53b2c9690","status":"active","plan":"annual","provider":"revenuecat","product_id":"ro.ortodoxia.premium.annual","provider_subscription_id":null,"current_period_end":"2026-11-09T20:10:42.879+00:00","cancel_at_period_end":true,"created_at":"2026-10-10T18:31:05.764408+00:00","updated_at":"2026-10-10T20:10:43.076389+00:00","revenuecat_snapshot_at_ms":1791658069617,"environment":"sandbox"}
PAS 4 · reserve_ai_request -> {"remaining_limit":48,"daily_limit":50,"success":true,"denial_reason":null,"retry_after_seconds":0,"client_limit":20,"monthly_remaining":19945}
PAS 4 · daily_limit din baza = 50 (consumat: 1 unitate din cota de test)
PAS 5 · isPremiumActive(CustomerInfo cu entitlement premium activ) = true (functia reala: src/lib/revenuecat.ts)
PAS 5 · isPremiumActive(CustomerInfo fara entitlement) = false (control: nu e o functie care intoarce mereu true)
PAS 5 · expresia din hook (verbatim): dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT
PAS 5 · evaluata cu isPremium=true, PREMIUM_DAILY_AI_LIMIT=50, FREE_DAILY_AI_LIMIT=5 -> dailyAiLimit = 50
PAS 6 · rând RESETAT la snapshot (read-back): {"user_id":"240db6ba-…","status":"expired",…,"current_period_end":null,…}
PAS 6 · coloane diferite fata de snapshot: niciuna

PORTA SQL  daily_limit = 50   (asteptat 50)
APLICATIA  dailyAiLimit = 50   (asteptat 50)
VERDICT: PASS
```

`EXIT=0`. **Cele două numere: 50 și 50.**

Note de onestitate:
- S-a **consumat 1 unitate** din cota de test a utilizatorului `240db6ba-…` (48 rămase din 50 la momentul probei) — menționat în brief ca acceptabil.
- Rândul a fost readus la snapshot; singura diferență e `updated_at` (inevitabilă, nu e o coloană de conținut) — scriptul raportează explicit „coloane diferite față de snapshot: niciuna".
- Scriptul **nu duplică logica aplicației**: importă `isPremiumActive` din `src/lib/revenuecat.ts` și citește textual expresia `dailyAiLimit` din hook.

---

## 3. T3 — CALEA DE REPARARE (gaura „Premium activ + 5/zi")

### 3.1 Cod

| Fișier | Linii | Ce s-a făcut |
|---|---|---|
| `supabase/functions/revenuecat-sync-user/core.ts` | 189 | **nou** — `handleSyncUser`: ia identitatea **din JWT** (fără token → 401; niciodată `user_id` din corp), cheamă RC v1 cu cheia **doar pe server**, scrie rândul prin RPC `sync_revenuecat_subscription` (cu `p_environment`); coduri: **204** succes · **502** apelul RC a eșuat · **500** scrierea a eșuat · 405 altă metodă · 503 secrete lipsă · 409 nimic de scris |
| `supabase/functions/revenuecat-sync-user/index.ts` | 51 | **nou** — mirror după `revenuecat-webhook/index.ts`; importă `createClient` și `corsHeaders, createJsonResponder, preflightResponse` din `../_shared/http.ts` |
| `supabase/functions/revenuecat-webhook/core.ts` | 697 | **modificat** — rezolvarea intrării de abonament scoasă într-un helper exportat (`findSubscription`, :261) și tipul intrării extins (`store?: string \| null`), ca webhook-ul și funcția nouă să rezolve **aceeași** intrare și să scrie **același** rând. Extragere pură, fără schimbare de comportament |
| `supabase/config.toml` | 31 | **modificat** — bloc nou, liniile 15-19: comentariu + `[functions.revenuecat-sync-user]` / `verify_jwt = true` (**deliberat true**, spre deosebire de webhook) |
| `src/lib/premium-sync-policy.ts` | 35 | **nou** — politici pure (fără importuri): când e nevoie de sincronizare + throttle de 10 minute |
| `src/lib/premium-sync.ts` | 51 | **nou** — cererea `functions.invoke('revenuecat-sync-user')` |
| `src/hooks/use-subscription.ts` | 179 | **modificat** — efectul care cheamă funcția **o singură dată**, cel mult o dată la 10 minute, apoi re-citește rândul; fără bucle, fără alte temporizatoare; dacă entitlement-ul e inactiv → nu cheamă nimic |
| `tests/premium-sync-user.test.mjs` | 351 | **nou** — 20 de teste (vezi 3.3) |

Link partajat dovedit: `revenuecat-sync-user/core.ts:30-35` importă `isValidUUID, resolveCustomerSnapshot, type RevenueCatCustomerInfo, type RevenueCatSubscriptionInfo` **din `../revenuecat-webhook/core.ts`** → o singură sursă de rezolvare, fără logică duplicată.

**ABATERE DE LA BRIEF (spusă direct, ca să nu inducă în eroare):** brief-ul numea `src/hooks/use-revenuecat.ts` (punctul T3.5) ca loc al apelului throttled. Implementarea a pus apelul în **`src/hooks/use-subscription.ts`** — fișierul care deține `revenueCatKey` / `refresh` și starea afișată (isPremium, dailyAiLimit, planLabel). Motivul: acolo există deja atât entitlement-ul, cât și rândul din bază (condiția „entitlement activ DAR rând lipsă/expirat"), deci apelul nu are nevoie de nicio stare suplimentară și nu introduce dependențe circulare; `use-revenuecat.ts` e mai jos în lanț (doar clientul RevenueCat) și nu știe de rândul din bază. Comportamentul cerut e identic: o chemare, throttle 10 minute, nimic când entitlement-ul e inactiv.

### 3.2 Server: deploy + read-back

```
GET /v1/projects/pgjabfgibdpcomegkojg/functions -> HTTP 200
numar functii: 8
  revenuecat-sync-user     status=ACTIVE version=1 verify_jwt=true updated=1791662785732 <== urmarit
  revenuecat-webhook       status=ACTIVE version=18 verify_jwt=false updated=1791656749068 <== urmarit
```

`verify_jwt=true` **citit înapoi din serviciu** (nu doar din `config.toml`) ✔

### 3.3 Testele noi (T3.7) — verzi

```
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

`EXIT=0` (rerulat pe fișierele finale). Din suită: condiția de apel (entitlement activ + rând lipsă/expirat → se cheamă), throttle-ul (a doua chemare în 10 minute **nu** se face), absența apelului când entitlement-ul e inactiv, identitatea **din JWT** (nu un `user_id` trimis de client) și maparea 500/502/204. Titlurile sunt intenționat **doar ASCII** (consola Windows cp850 mânca diacriticele la afișare, iar raportul trebuie să poată cita titlul verbatim).

### 3.4 Dovada live (401 / 204 / rând scris / curățenie)

```
=== 0. stare (read-only) ===
randuri in public.subscriptions inainte: 1
=== 1. POST fara Authorization (trebuie 401) ===
HTTP 401
corp: {"error":"Acces neautorizat."}
=== 2. utilizator de proba pentru abonatul cu entitlement activ ===
HTTP 200
utilizator creat: id=9e238faf-7d56-4999-bff5-a51f0ef20b5a (id public, apare in task), email=.invalid (neafisat)
=== 3. login (JWT real; se afiseaza doar lungimea) ===
HTTP 200
access_token primit: lungime=827; user id=9e238faf-7d56-4999-bff5-a51f0ef20b5a
=== 4. POST cu JWT valid (trebuie 204) ===
HTTP 204
corp: (gol)
=== 5. read-back rand scris ===
{"user_id":"9e238faf-7d56-4999-bff5-a51f0ef20b5a","status":"active","plan":"monthly","provider":"apple","environment":"sandbox","current_period_end":"2026-10-11 13:28:19+00","cancel_at_period_end":false,"revenuecat_snapshot_at_ms":1791662852416}
=== 6. curatenie ===
stergere utilizator de proba: HTTP 200
randuri ramase pentru acel id: 0
randuri in public.subscriptions dupa: 1 (inainte: 1)
```

`EXIT=0`. Aici s-au folosit **două** lucruri deodată pentru dovadă: (a) un utilizator de probă temporar cu id-ul **exact** al abonatului RC care are entitlement activ, ca să existe atât JWT-ul, cât și apelul RC reușit; (b) cheile `service_role`/`access_token` încărcate doar în proces (raportate ca lungimi: service_role 41, access_token 44, valori neafișate). Utilizatorul de probă și rândul lui au fost **șterse**, iar tabelul a revenit la 1 rând.

Observație importantă pentru DSH: în probele live, apelul RC pentru `240db6ba-…` **reușește** (subscriber cunoscut de RevenueCat), dar entitlement-ul lui **nu** e activ → sincronizarea ar scrie un rând *inactiv*. De aceea dovada de 204 s-a făcut cu id-ul cu entitlement activ.

---

## 4. T4 — REGISTRU DE CONFIGURARE (fără valori)

**Fișier nou:** `docs/CONFIG-SECRETE.md` (97 linii, 9 225 bytes). Cuprinde, pentru fiecare secret: **nume**, **scop**, **cine/când l-a schimbat ultima dată**, **tipul cheii și limita** ei. **Zero valori** (verificat prin igienă de text: 0 secvențe `\uXXXX` literale, 0 perechi mojibake, diacritice reale).

Conține explicit dependența fragilă cerută de T1: `REVENUECAT_API_KEY` = **cheie publică SDK** folosită pe **API v1** (schimbată 10.10.2026 de Open Worker); cheia secretă `sk_…` **nu** funcționează pe v1 (`HTTP 403`, mesaj verbatim), iar read-back-ul din Management API e **mascat**; verificarea stării se face cu `scripts/revenuecat-key-health.mjs` (`--through-function` pentru verdictul real).

---

## 5. T5 — DECIZIE DE BIFAT (owner): `environment`

**Nu am implementat nimic.** Cele două variante, exact cum cere brief-ul:

**Varianta A (implicit acum):** `environment='sandbox'` **dă acces**; `environment` rămâne **doar pentru raportare**. Poarta rămâne `status IN ('active','trialing','canceled')` + `current_period_end` în viitor, fără să se uite la `environment`. Efect: TestFlight funcționează, la fel și producția.
**Varianta B:** accesul se dă **doar** pentru `environment='production'` (sau pentru build-uri de test) → se schimbă poarta din `reserve_ai_request` (migrare nouă) **și** testul aferent; abonamentele de sandbox rămân scrise, dar nu mai „deschid" 50/zi.

Ce recomand (fără să decid): **A**, până când testarea pe TestFlight se termină, pentru că altfel nu se poate testa deloc lanțul pe dispozitiv; trecerea pe **B** e o migrare mică și se poate face oricând, cu un test nou. Ownerul bifează.

---

## 6. T6 — CORECTAREA RAPORTULUI RUNDEI 1 (aplicată)

Am corectat `RAPORT-REPARARE-PREMIUM-2026-10-10.md` **în ambele copii** (depozit + sesiune), cu păstrarea textului original citat ca atare și cu o casetă marcată `CORECȚIE T6 — 10.10.2026 (runda 2)`:

| Ce | Înainte | După |
|---|---|---|
| §7.1 „niciun client RevenueCat nu are entitlement activ" | afirmația falsă | **FALS, corectat**: `9e238faf-7d56-4999-bff5-a51f0ef20b5a` are **1 entitlement activ** (abonament de test sandbox), verificat de DSH și re-verificat live de mine |
| Notă practică pentru testare | lipsea | **cu contul `9e238faf-…` aplicația arată „Premium activ" fără cumpărare → pentru testarea de mâine se folosește ALT cont** |
| De ce nu se poate scrie rândul pentru acel abonat | nu era explicat | abonatul RC `9e238faf-…` **nu are rând în `auth.users`**, iar `subscriptions_user_id_fkey` (FK → `auth.users(id)`) refuză scrierea → de aici **500** („scrierea a eșuat"), nu 502 („apelul RC a eșuat") |
| Abaterea de implementare | neconsemnată | apelul throttled e în **`use-subscription.ts`**, nu în `use-revenuecat.ts` (motivul din §3.1) |

Dovada aplicării: `sha256` identic pentru cele două copii — `6ff27cff3e456e49a2a54aee9d5cbda8523cb78726ebc6d3ef6dcf936b5e4967` (depozit) și același hash (sesiune); înainte: `daef6048…`, 20 898 caractere → după: 22 481 caractere, 238 linii; igienă de text: `\uXXXX=0`, perechi mojibake=0.

---

## 7. T7 — PORȚI, DOVEZI, AUDIT

### 7.1 Porți — ieșire verbatim (rulare completă, pe fișierele finale)

```
typecheck -> EXIT=0 (9.1s)
typecheck:edge -> EXIT=0 (2.9s)
npm test -> EXIT=0 (12.7s)
lint -> EXIT=0 (9.9s)
test:release -> EXIT=0 (1.4s)
suita webhook (izolat) -> EXIT=0 (0.4s)
suita sync-user (izolat) -> EXIT=0 (0.4s)
```

- `npm test`: `Ortodoxia test suite — 106 file(s), 0 skipped by policy` · `ℹ tests 1046` · `ℹ pass 1046` · `ℹ fail 0` · `ℹ cancelled 0` · `ℹ skipped 0` · `ℹ todo 0`
- `test:release`: `passed: 31   failed: 0   deferred: 2` + `CI GATE: PASSED.`
- suita webhook (izolat): `ℹ pass 21` · `ℹ fail 0`
- suita `premium-sync-user` (izolat, rerulată pe fișierele finale): `ℹ tests 20` · `ℹ pass 20` · `ℹ fail 0`
- `lint`: `expo lint` fără nicio problemă raportată (exit 0)

### 7.2 Rezultatele scripturilor

| Script | Rezultat | Cod HTTP | Exit |
|---|---|---|---|
| `scripts/revenuecat-key-health.mjs` (PART A) | FAIL, cu motivul (read-back mascat) | 401 (`Invalid API Key.`) | 1 |
| `scripts/revenuecat-key-health.mjs` (`sk_…`) | nu funcționează pe v1 | 403 (cheie secretă incompatibilă cu v1) | 1 |
| `scripts/revenuecat-key-health.mjs` (`--through-function`) | **PASS** | 500 = scrierea a eșuat, deci apelul RC a **reușit** | **0** |
| `scripts/premium-chain-verify.mjs` | **PASS** cu **50 și 50** | — | **0** |

### 7.3 Dovada funcției noi

`status=ACTIVE`, `version=1`, `verify_jwt=true`, `updated=1791662785732` (10.10.2026 20:06:25Z / 23:06:25 local); `POST` fără JWT → **401** `{"error":"Acces neautorizat."}`; `POST` cu JWT valid → **204** și rândul scris + citit înapoi (`status=active, plan=monthly, provider=apple, environment=sandbox, current_period_end=2026-10-11 13:28:19+00`), apoi curățenie.

### 7.4 Tabel fișier · linii · ce s-a schimbat + `Get-Item`

| Fișier | Linii | Bytes | Modificat (azi) | Ce s-a schimbat |
|---|---|---|---|---|
| `supabase\functions\revenuecat-sync-user\core.ts` | 189 | 7 980 | 10.10.2026 22:19:26 | nou: `handleSyncUser` (JWT → identitate, RC v1, RPC cu `p_environment`, 401/204/502/500) |
| `supabase\functions\revenuecat-sync-user\index.ts` | 51 | 1 975 | 10.10.2026 22:18:40 | nou: intrarea funcției (CORS, client, apel `handleSyncUser`) |
| `supabase\functions\revenuecat-webhook\core.ts` | 697 | 27 294 | 10.10.2026 22:11:56 | helper partajat `findSubscription` + tip intrare extins (`store`) |
| `supabase\config.toml` | 31 | 1 138 | 10.10.2026 22:16:19 | `[functions.revenuecat-sync-user]` cu `verify_jwt = true` (liniile 15-19) |
| `src\hooks\use-subscription.ts` | 179 | 8 911 | 10.10.2026 22:18:40 | efectul de reconciliere: o chemare, throttle 10 min, re-citire rând |
| `src\lib\premium-sync.ts` | 51 | 2 510 | 10.10.2026 22:18:40 | nou: cererea către funcția de sincronizare |
| `src\lib\premium-sync-policy.ts` | 35 | 1 584 | 10.10.2026 22:18:40 | nou: politici pure (nevoie de sincronizare + throttle) |
| `tests\premium-sync-user.test.mjs` | 351 | 16 470 | 10.10.2026 23:03:46 | nou: 20 de teste (condiție de apel, throttle, inactiv, JWT, 500/502/204) |
| `scripts\revenuecat-key-health.mjs` | 303 | 14 982 | 10.10.2026 22:05:07 | nou: verificarea binară a cheii (T1) |
| `scripts\premium-chain-verify.mjs` | 312 | 13 873 | 10.10.2026 22:06:43 | nou: lanțul dovedit cap-coadă (T2) |
| `docs\CONFIG-SECRETE.md` | 97 | 9 225 | 10.10.2026 23:08:58 | nou: registru de configurare, fără valori (T4) |
| `RAPORT-REPARARE-PREMIUM-2026-10-10.md` | 237 | 23 216 | 10.10.2026 23:10:18 | corectat la T6 (ambele copii, hash identic) |
| `RAPORT-PREMIUM-COMPLETARE-FINALA-2026-10-10.md` | 331 | 29 427 | 10.10.2026 23:13:44 | **prezentul raport** (rundă 2); numerele sunt pentru versiunea de dinaintea ultimei fraze de formatare; ambele copii identice (anexa de integritate) |

(`Get-Item` rulat pe fiecare; numărul de linii = `(Get-Content <f> -Encoding utf8).Count`.)

### 7.5 Audit punct-cu-punct

| # | Ce | Stare | Dovadă |
|---|---|---|---|
| T1 | Verificarea cheii, binară, cu `--through-function` | **REPARAT/VERIFICAT** | `VERDICT: PASS`, exit 0; 403 verbatim pentru `sk_`; 401+motiv pentru read-back-ul mascat |
| T1b | Punerea cheii `sk_` în `REVENUECAT_API_KEY` | **NU SE APLICĂ** (condiția: doar dacă `sk_` merge pe v1) | `HTTP 403` pe v1; documentat în T4 |
| T2 | Lanțul complet cu numere | **VERIFICAT** | `PORTA SQL daily_limit = 50` · `APLICATIA dailyAiLimit = 50` · `VERDICT: PASS`, exit 0 |
| T3 | Funcția de sincronizare + apelul din aplicație + 4 teste | **REPARAT/VERIFICAT** | 8 fișiere (§7.4); `ACTIVE/version=1/verify_jwt=true`; 401 fără JWT; 204 cu JWT + rând scris; suita 20/20 |
| T4 | Registru de secrete, fără valori | **REPARAT** | `docs/CONFIG-SECRETE.md`, 97 linii; igienă de text curată |
| T5 | Decizia ownerului pe `environment` | **ÎN AȘTEPTARE (owner)** | variantele A/B în §5; **nimic implementat** |
| T6 | Corectarea raportului | **REPARAT** | caseta `CORECȚIE T6`, ambele copii, `sha256 6ff27cff…` |
| T7 | Porți + raport | **VERIFICAT** | §7.1-§7.4, toate exit 0 / 0 căderi |

### 7.6 Confirmări

- **Live/playerul: NEATINS de mine.** `src\app\live.tsx` (10.10.2026 15:13:29), `src\live\youtube-embed.native.tsx` (10.10.2026 20:59:54) apar modificate în `git status`, dar **nu de mine** — sunt ale celuilalt scriitor activ în depozit (live/player). `src\live\live-playback.ts` (02.09.2026 15:15:53) și `src\live\youtube-embed.web.tsx` (08.10.2026 18:24:56) sunt neatinse.
- **Prețuri: nemodificate.** Niciun identificator de produs sau preț nu a fost atins în această rundă (singurele atingeri de produse au fost în runda 1, în logica de entitlement).
- **Hosting: neatins.**
- **Fără dependențe noi adăugate de mine.** `package.json` (+5/-1) și `package-lock.json` (+12) sunt modificate de **alt scriitor**, la **10.10.2026 14:39** (înainte de runda 1): `expo-apple-authentication` + două scripturi de test (`test:ai-chain`, `test:chat`) + un fișier de test adăugat la `test:live-backend`. Eu nu am rulat `npm install` și nu am adăugat nicio dependență.
- **Fără build, fără upload, fără commit.** `HEAD` rămâne `1d9a41a`; niciun `git commit` rulat; niciun build/upload.

### 7.7 Ce NU am putut verifica și de ce

1. **Valoarea reală a lui `REVENUECAT_API_KEY` din Supabase** — Management API **maschează** la citire (dovadă: sondă de 33 de caractere citită înapoi ca 64). De aceea verdictul cheii se dă prin funcția deployată (PART B), care e oricum singurul consumator real.
2. **Un cont care să aibă și rând în `auth.users`, și entitlement RC activ** — nu există azi în proiect (35 de utilizatori în `auth.users`; singurul entitlement activ e al unui abonat fără rând în `auth.users`). Dovada de 204 a folosit un utilizator de probă temporar cu id-ul abonatului, șters la final.
3. **De ce funcția live `revenuecat-webhook` e v18, iar T0 spunea v16** — nu pot ști cine a deployat (alt scriitor, la 18:25:49Z); pot dovedi doar că **codul live e cel reparat** (eveniment sandbox acceptat + 500, nu 502) și că **nu conține ultima mea modificare** (extragerea helperului, făcută la 22:11:56 local = după deploy). Extragerea e pură (fără schimbare de comportament), verificată de `typecheck:edge` (exit 0) și de suita webhook (21/21).
4. **Sincronizarea din aplicație pe un dispozitiv real** (bifa „Premium activ" fără cumpărare pe contul greșit) — se vede abia pe TestFlight, cu un cont nou (vezi T6).
5. **`PLAN-COORDONARE.md`** nu poate fi citit din această sesiune (calea iese din sandbox) — nu l-am putut re-verifica, dar nu era necesar pentru niciun punct al taskului.

---

## 8. DEFINITION OF DONE (binar)

| # | Cerință | Verdict | Dovadă |
|---|---|---|---|
| 1 | `revenuecat-key-health.mjs` iese 0 (sau raportează exact codul HTTP și motivul, cu T1b documentat) | **PASS** (ambele ramuri) | `--through-function` → exit 0, `VERDICT: PASS`; PART A → 401+motiv, T1b documentat ca neaplicabil (403) |
| 2 | `premium-chain-verify.mjs` iese 0 și afișează 50 și 50 | **PASS** | `VERDICT: PASS`, `daily_limit = 50`, `dailyAiLimit = 50`, exit 0 |
| 3 | `revenuecat-sync-user` deployată, `verify_jwt: true`, 401 fără JWT, 204 cu JWT, rând scris (read-back) | **PASS** | read-back API: `ACTIVE version=1 verify_jwt=true`; 401; 204; rând `active/sandbox` citit înapoi; curățenie (1 rând înainte și după) |
| 4 | Cele 4 teste noi T3 trec; toate porțile verzi; 0 căderi | **PASS** | suita 20/20; `typecheck` 0 · `typecheck:edge` 0 · `npm test` 1046/1046 · `lint` 0 · `test:release` 31/0 · webhook 21/21 |
| 5 | `docs/CONFIG-SECRETE.md` scris, fără valori | **PASS** | 97 linii; nume/scop/cine-când/tip+limită; 0 valori; fragilitatea v1 documentată |
| 6 | Raportul corectat la T6 + tabelul de audit complet | **PASS** | caseta `CORECȚIE T6` în ambele copii (`sha256 6ff27cff…`); §7.4 și §7.5 |
| 7 | Nimic din lista „interzis" atins; fără build/upload/commit | **PASS** | §7.6; `HEAD=1d9a41a` neschimbat |

---

## 9. RECOMANDARE PENTRU DSH (nimic din ce urmează nu am executat)

1. **Un singur pas de deploy** când hotărăști: `revenuecat-webhook` (ca repo și live să fie identice — acum live e v18, cu un refactor în urmă) și, dacă mai modifici ceva, `revenuecat-sync-user`. Ambele din același commit de sursă.
2. **Testarea de mâine pe telefon cu un cont NOU** (T6): contul `9e238faf-…` arată „Premium activ" fără cumpărare, deci nu poate dovedi nimic.
3. Verificarea independentă, dacă vrei să vezi singur lanțul: `node scripts/premium-chain-verify.mjs --env-file=C:\Users\pcgar\.ow-secrets\supabase.env` (îți consumă 1 unitate din cota de test a lui `240db6ba-…` și își readuce rândul la loc).
4. Ownerul bifează **A sau B** la T5 înainte de build 20 (dacă alege B, mai e o migrare mică + un test).

**Aici mă opresc.** Fără build, fără upload, fără commit.

---

**Anexă de integritate (dovada că cele două copii sunt identice):** copia din depozit (`C:\Users\pcgar\Documents\ortodoxia-app\RAPORT-PREMIUM-COMPLETARE-FINALA-2026-10-10.md`) și copia din sesiune (`C:\Users\pcgar\OpenWorker\f1c3deac-167\RAPORT-PREMIUM-COMPLETARE-FINALA-2026-10-10.md`) au fost comparate cu `certutil -hashfile <fișier> SHA256` și au ieșit **identice** la fiecare verificare. Ultima verificare, pentru versiunea de dinaintea acestei ultime fraze: `d798dbfafe089cdaf41014cd4440ceda9011e74b18e64016870ab17c1dff7f00`, 29 427 bytes, 331 linii. (Raportul rundei 1, corectat la T6, are în ambele copii `sha256 6ff27cff3e456e49a2a54aee9d5cbda8523cb78726ebc6d3ef6dcf936b5e4967`.)
