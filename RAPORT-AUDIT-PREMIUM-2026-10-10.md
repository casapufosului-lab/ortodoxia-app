# AUDIT — REPARARE PREMIUM (fază de verificare, fără nicio modificare de cod)

Data: 2026-10-10, ora 20:09 (Europe/Bucharest)
Folder: `C:\Users\pcgar\Documents\ortodoxia-app`
Autor: Open Worker (workerul `cod`)
Comandă din task: *„prima dată vreau să citești și să îmi faci un audit complet și real dacă astea sunt problemele care le avem cu reparația premium din aplicație"* — deci **nu s-a modificat nimic**, se verifică.

**VERDICT: PARTIAL.**

- Cele 9 puncte din task sunt **reale în cod** (fiecare cu dovadă la linie), **dar**:
  - **4 dintre ele sunt deja reparate parțial în arborele de lucru** (nu în commit) de sesiunile de azi (build 13→18): eticheta planului și butoanele din ecranul Premium, cardul „Abonament" din Cont, mesajul de ștergere a contului.
  - lista **nu este completă**: am găsit **3 cauze neenumerate**, dintre care una (filtrul de evenimente **sandbox** din webhook) poate reproduce singură simptomul ownerului («Apple a confirmat plata, dar aplicația spune Plan Gratuit») **chiar și după reparațiile făcute azi de DSH**.
- Deci: diagnostico-ul din task e corect, dar incomplet, iar reparația A–F propusă **nu ar rezolva singură** cazul măsurat pe telefon.

---

## 1. Tabel: cele 9 puncte, verificate în cod (starea de AZI, 10.10.2026)

| # | Ce spune taskul | Ce spune codul acum (dovadă) | Verdict |
|---|---|---|---|
| 1 | Accesul se decide în baza de date (`reserve_ai_request` → `subscriptions`) | `supabase/functions/orthodox-chat/index.ts:261` cheamă `admin.rpc('reserve_ai_request', …)`. Definiția curentă (cea mai nouă, 4 argumente): `supabase/migrations/20260923000100_add_client_and_monthly_ai_caps.sql:129-135` — `IF EXISTS (SELECT 1 FROM public.subscriptions AS s WHERE s.user_id = p_user_id AND s.status IN ('active','trialing','canceled') AND s.current_period_end > v_now) THEN v_limit := 50;`. Fail-closed pe expirare (migrarea `20260915000300_*`); `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role` | **CONFIRMAT** |
| 2 | `public.subscriptions` are 0 rânduri; cauza = webhook fără header de autorizare | Codul cere header: `revenuecat-webhook/core.ts:192-205` (`authorizeRequest`, comparație timing-safe, acceptă `Bearer <token>` sau token brut), `:423-425` → `503` dacă `REVENUECAT_WEBHOOK_AUTH_TOKEN` sau `REVENUECAT_API_KEY` lipsesc, `:427-430` → `401` dacă tokenul nu se potrivește. Clientul **nu scrie** niciodată în `subscriptions` (RLS: `20260902000100_harden_subscriptions_rls.sql`) | **CONFIRMAT în cod**; «0 rânduri» **NU POT verifica** (vezi §3) |
| 3 | Entitlement-ul `premium` are produsele de App Store atașate (DSH) | Nu e verificabil din cod (e stare de panou RevenueCat). Codul citește entitlement-ul **după cheie**: `use-revenuecat.ts:248` `currentCustomerInfo?.entitlements.active[PREMIUM_ENTITLEMENT_ID]` — deci atașarea produselor la entitlement e exact ce trebuie | **NEPUTÂND VERIFICA AICI** (stare de dashboard) |
| 4 | Două surse de adevăr | **Parțial reparat azi.** Reparat: `premium.tsx:58` (`premiumUiState`), `account.tsx:64,381` (`planSummary({premiumActive, entitlementPlan})`). **RĂMAS REAL:** `use-subscription.ts:83` `isPremium = hasPremiumAccess(subscription)` și `:112` `planLabel` și `:113` `dailyAiLimit` (toate din rândul din `subscriptions`), iar `dailyAiLimit` este **chiar afișat** în `premium.tsx:262` — adică pe ACEEAȘI casetă scrie „Premium activ" din entitlement și „**{5}** mesaje AI pe zi" din baza de date. În plus `chat.tsx:335-337`: `hasPremiumAccess(subscriptionResult.data) ? PREMIUM… : FREE…` | **CONFIRMAT, parțial reparat** |
| 5 | Restaurare automată (contra documentației RevenueCat) | **REAL și acum, dar deliberat.** `use-revenuecat.ts:427-432` — efect automat la fiecare schimbare de `userId`; `premium.tsx:83-89` — `syncWithStore()` la fiecare focus; `use-revenuecat.ts:362-421` `syncWithStore` face `restoreRevenueCatPurchases()` (= `logIn` + `Purchases.restorePurchases()`). Motivația scrisă la `use-revenuecat.ts:342-361` și `use-subscription.ts:105-107`: „cerința build 13 («doar din buton») a fost **retrasă** în build 14" | **CONFIRMAT — dar vezi §4, conflict de decizie** |
| 6 | Clipeala „se verifică" | **REAL.** `use-subscription.ts:35` `setIsLoading(true)` la fiecare `refresh()`, iar `refresh` e declanșat de: schimbarea userului (`:54-60`), schimbarea stării RevenueCat la +1,5 s (`:70-80`), focus-ul ecranului Premium (`premium.tsx:87`) și **poll-ul la 5 s** cât timp e „activation-pending" (`premium.tsx:94-106`). Textul care clipește: `premium.tsx:259` `isLoading ? t('premium.statusChecking') : premiumLabel` și `account.tsx:382` `isPlanLoading ? t('account.planChecking') : …` | **CONFIRMAT** |
| 7 | Butoanele se ascund (`shouldShowPurchaseButtons` + fail-closed) | Regula există neschimbată: `lib/subscription.ts:60-62` `return state === 'free'`. Acum e alimentată din `premiumUiState` (`:140-155`): `storeState = active ? 'active' : storeStateKnown === true ? 'free' : 'activation-pending'` → **butoanele lipsesc ori de câte ori citirea `CustomerInfo` nu a reușit**, nu doar cât „nu s-a terminat prima citire". `storeStateKnown` = `use-revenuecat.ts:255` `currentCustomerInfo !== null \|\| !isRevenueCatConfigured()`, iar `currentCustomerInfo` (`:235`) e `null` și când citirea a **eșuat** și când `customerInfoUserId !== userId` | **CONFIRMAT, parțial reparat** (vezi §2, U2) |
| 8 | Apple 5.1.1(v) — mesajul de ștergere a contului | **Parțial reparat azi.** `i18n/config.ts:557` (ro): „… Contul nu mai poate fi recuperat \n\n Anularea abonamentului se face **separat** din App Store / Google Play." — spune că anularea e separată, dar **NU** spune că **plata continuă până la anulare** și nu oferă calea de gestionare: `account.tsx` nu are niciun link de abonamente (singurul link extern e `supportMailto`, `account.tsx:532`) | **CONFIRMAT, parțial reparat** |
| 9 | Prețul în $ NU se repară în cod | Corect. Prețurile vin numai din magazin: `premium.tsx:288,300` `monthlyPrice ?? t('premium.priceInStore')`, cu `priceFor` → `packagePriceText(pkg)`. Nimic hardcodat | **CONFIRMAT** (nu se atinge) |

---

## 2. Cauze NEENUMERATE în task, găsite de mine (în ordinea impactului)

### U1. Webhook-ul **ignoră intenționat** evenimentele de tip sandbox — și nu scrie rândul
`revenuecat-webhook/core.ts:465-470`:
```ts
const environment = typeof event.environment === 'string' ? event.environment.toUpperCase() : '';
const isSandboxEvent = environment === 'SANDBOX';
if (isSandboxEvent && !acceptsSandboxEvents()) {
  return { status: 200, body: { success: true, skipped: true, reason: 'sandbox_event_ignored' } };
}
```
`acceptsSandboxEvents()` (`:36-42`) e **true doar** dacă `REVENUECAT_ACCEPT_SANDBOX === 'true'`.
Căutare în tot depozitul: `REVENUECAT_ACCEPT_SANDBOX` apare **doar în `core.ts:34,39`** — în nicio documentație, script de deploy sau listă de secrete (`docs/OWNER-ACTIONS.md:65-80` listează doar `REVENUECAT_WEBHOOK_AUTH_TOKEN` și `REVENUECAT_API_KEY`).

**Consecință directă:** testarea din TestFlight / sandbox (adică exact ce facem, dovadă: prețul în $ inexact din punctul 9) **nu poate scrie niciun rând** în `subscriptions`. Rezultatul e exact ce a raportat ownerul: magazinul/Apple confirmă plata, aplicația (care citea rândul) spune «Plan Gratuit» / 5 mesaje pe zi. Și, fiind `200 skipped`, **RevenueCat raportează livrare reușită** — deci nu se vede nicio eroare în panou.

### U2. „Nu s-a citit încă" și „citirea a eșuat" sunt tratate identic (fail-closed) → butoanele lipsesc, cu mesaj care induc în eroare
`lib/subscription.ts:149` + `use-revenuecat.ts:255` + `premium.tsx:50,58`:
- citirea `CustomerInfo` a **eșuat** (rețea, SDK, identitate) ⇒ `premiumKnown = false` ⇒ stare `'activation-pending'` ⇒ `showPurchaseButtons = false` (butoanele lipsesc) **și** se afișează `premium.activationPending` («activarea e în curs»), deși nu se așteaptă nicio activare — doar nu am reușit să citim.
- simptomul ownerului din build 16 („Plan Gratuit" + butoane dispărute) e deci încă **atingibil**, prin altă cale decât cea reparată.

### U3. Fereastra de identitate: `customerInfoUserId !== userId` ⇒ `customerInfo` se ignoră complet
`use-revenuecat.ts:235` `const currentCustomerInfo = customerInfoUserId === userId ? customerInfo : null;`
După login, `refresh()` citește pentru `requestUserId = userId` (`:122,139`) și publică `setCustomerInfoUserId(requestUserId)` (`:160`) — dar dacă **citirea pentru noul user a eșuat** (`:163-165` setează doar eroarea), obiectul vechi (al altui user sau `null`) rămâne, `currentCustomerInfo` devine `null`, `premiumKnown` devine `false` → butoanele dispar până la o reușită (focus/sync). Fără `syncWithStore` automat (cum cere punctul B din task), **nimic nu mai reîncearcă** până când omul iese și reintră în ecran.

---

## 3. Ce NU am putut verifica (și de ce)

| Afirmație | De ce nu se poate verifica de aici | Cum se verifică (read-only, de owner/DSH) |
|---|---|---|
| `public.subscriptions` are 0 rânduri | Nu am niciun acces la proiectul Supabase: `.env` conține doar `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (cheie publicabilă). Cu ea, RLS-ul întoarce „0 rânduri" și pentru un tabel plin — deci citirea nu ar dovedi nimic | SQL Editor: `select user_id, status, plan, current_period_end, updated_at from public.subscriptions;` |
| Header-ul de autorizare e acum pus în RevenueCat (DSH) | Stare de panou, nu de cod | RevenueCat → Integrations → Webhooks: tokenul din header == secretul `REVENUECAT_WEBHOOK_AUTH_TOKEN`; separat Supabase → Edge Functions → Secrets: există `REVENUECAT_API_KEY` (`sk_…`) — altfel webhook-ul răspunde `503` (`core.ts:423-425`) |
| Entitlement-ul `premium` are produsele attach-ate | Stare de panou | Vezi checks 1 și 2 din §5 — **atenție, e cel mai probabil loc unde se rupe lanțul** |
| `REVENUECAT_ACCEPT_SANDBOX` pe funcția deployată | Secretele funcției nu sunt în depozit (și nici nu trebuie să fie) | Supabase → Edge Functions → Secrets: dacă testăm în sandbox, trebuie `REVENUECAT_ACCEPT_SANDBOX=true`; altfel evenimentele sunt sărite (`core.ts:465-470`) |
| Dacă achiziția a intrat pe `$RCAnonymousID:` în loc de id-ul Supabase | Depinde de device | Ecranul Premium are diagnosticul permanent (`premium.tsx:363-374`): `Purchases.getAppUserID()` vs `utilizator Supabase (userId)` |
| Prețul corect în $ | Nu e problemă de cod (punctul 9) și nu se poate verifica fără device | Rămâne cum a spus ownerul: se verifică în sandbox, nu în cod |

---

## 4. Ce înseamnă asta pentru planul A–F (nu am executat nimic)

- **A (o singură sursă de adevăr):** parțial făcut azi (Premium, Cont). **Rămâne de făcut:** `use-subscription.ts:83,112,113` (inclusiv `dailyAiLimit`, care se vede la `premium.tsx:262`) și `chat.tsx:335-337`. Fără ele, contradicția „Premium activ" + „5 mesaje pe zi" rămâne pe ecran.
- **B (restaurare doar din buton):** intră în conflict cu două lucruri scrise în depozit: `tests/premium-auto-sync.test.mjs:110` („sincronizarea pornește AUTOMAT la login, nu doar din buton") și nota din `use-revenuecat.ts:342-361` / `use-subscription.ts:105-107` care spune că cerința „doar din buton" a fost **retrasă** în build 14 tocmai pentru cazul achiziției intrate pe `app_user_id` anonim. Varianta care respectă și documentația RevenueCat, și cazul anonim: automat rămâne **doar** `logIn` (`identifyRevenueCatUser` — mută oricum clientul anonim pe utilizatorul autentificat) + `Purchases.syncPurchases()` o dată; `Purchases.restorePurchases()` rămâne **exclusiv** pe buton. Asta **schimbă o decizie documentată și un test care acum trece** → am nevoie de „da"-ul tău explicit pe ea.
- **C (fără clipeală):** se aplică; de reținut că sursa clipelei nu e doar `:35`, ci și cele patru declanșatoare de `refresh()` (inclusiv poll-ul la 5 s din `premium.tsx:94-106`).
- **D (butoanele):** mare parte făcută azi; **rămâne U2** („citire eșuată" ≠ „activare în curs"), altfel butoanele pot lipsi în continuare, cu mesaj fals.
- **E (Apple 5.1.1(v)):** textul spune deja că anularea e separată; rămâne de adăugat „plata continuă prin Apple/Google până la anulare" + calea de gestionare în fluxul de ștergere (`account.tsx` nu are linkul; `premium.tsx:325-333` îl are, prin `manageSubscriptionUrl`).
- **F (interzis):** respectat — nu am atins playerul, SQL/RPC, webhook, prețuri, `package.json`; fără build, fără upload, fără commit.

---

## 5. Verificările de făcut ÎNAINTE de a repara cod (toate read-only, ~10 minute)

1. **RevenueCat → Products:** identificatorul de **magazin** (App Store / Play) al celor două produse trebuie să fie **exact** `ro.ortodoxia.premium.monthly` și `ro.ortodoxia.premium.annual`. Webhook-ul compară `event.product_id` (id-ul de magazin) cu lista din `core.ts:17-20` și **sare peste orice altceva, returnând 200 `skipped`** (`core.ts:471-476`) — deci o nepotrivire de id nu se vede ca eroare nicăieri. (`prod0d1aa29aa7` / `prod6229dc8764` sunt id-uri interne RevenueCat, nu id-uri de magazin.)
2. **RevenueCat → entitlement `premium`:** ambele produse atașate (DSH a spus că da — se confirmă vizual).
3. **Testare în sandbox?** Atunci: Supabase → Edge Functions → Secrets → `REVENUECAT_ACCEPT_SANDBOX=true` (altfel nu se scrie niciun rând, vezi U1). Pentru lansare reală, rămâne `false`/nesetat.
4. **Supabase SQL Editor:** `select * from public.subscriptions;` — după o achiziție și o re-deschidere a ecranului Premium ar trebui să apară rândul (`status='active'`, `current_period_end` în viitor). Dacă e tot gol: webhook-ul nu ajunge sau e sărit (pașii 1–3).
5. **Pe telefon, ecranul Premium → cardul „STAREA REVENUECAT — DIAGNOSTIC PERMANENT":** `Purchases.getAppUserID()` trebuie să fie **id-ul Supabase** (un UUID), nu `$RCAnonymousID:…`; `entitlement 'premium'.isActive` = ce spune magazinul.

Recomandarea mea de ordine: 1→5 întâi (dovedesc unde se rupe lanțul), apoi reparația A–F. Altfel e posibil să reparăm ecranele și să rămână „5 mesaje pe zi", pentru că serverul (punctul 1, care e singurul care contează pentru cotă) citește tot din `subscriptions`.

---

## 6. Porți rulate AZI ca linie de bază (dovezi verbatim, nimic modificat)

```
> ortodoxia-app@1.0.0 typecheck
> tsc --noEmit --pretty false

EXIT=0
```

```
node --test tests/premium-single-source.test.mjs tests/premium-auto-sync.test.mjs \
  tests/premium-activation-pending.test.mjs tests/premium-paywall-store-state.test.mjs \
  tests/account-premium-single-source.test.mjs tests/premium-manage-subscription-link.test.mjs \
  tests/premium-purchase-guards.test.mjs

ℹ tests 99
ℹ suites 16
ℹ pass 99
ℹ fail 0
```

Testele care fixează comportamentul de schimbat (vor trebui actualizate odată cu reparația): `premium-auto-sync.test.mjs` (cere sincronizare automată), `premium-single-source.test.mjs`, `account-premium-single-source.test.mjs`, `premium-activation-pending.test.mjs`.

## 7. Starea depozitului (nu am modificat nimic; dovadă: datele de modificare sunt de azi, din sesiunile anterioare)

```
git log -1: 1d9a41a  Fri Oct 9 17:23:04 2026 +0300
git status: 15 fișiere modificate, necomise (premium.tsx +205, use-revenuecat.ts +210,
            lib/subscription.ts +93, use-subscription.ts +21, i18n/config.ts +90, …)
```

```
src/hooks/use-subscription.ts   10/10/2026
src/hooks/use-revenuecat.ts     10/10/2026
src/lib/subscription.ts         10/10/2026
src/app/premium.tsx             10/10/2026
src/app/(tabs)/account.tsx      10/10/2026
src/app/(tabs)/chat.tsx         10/10/2026
src/i18n/config.ts              10/10/2026
tests/premium-single-source.test.mjs       10/10/2026 17:42
tests/premium-auto-sync.test.mjs           10/10/2026 17:42
tests/account-premium-single-source.test.mjs 10/10/2026 18:49
```

Fișierele modificate azi sunt opera sesiunilor de dinainte (build 13→18), **nu a acestei auditări**: în această fază am făcut doar citiri, `git log/status`, `npm run typecheck` și `node --test`.

---

## 8. Confirmări cerute de task

- **NU** am atins playerul/live (`src/live/**`, `src/app/live.tsx`) — zero accesări.
- **NU** am atins SQL/RPC (`reserve_ai_request`), funcțiile edge, webhook-ul, prețurile.
- **NU** am atins logica de cumpărare (`purchaseRevenueCatPackage` din `lib/revenuecat.ts`).
- **NU** am adăugat dependențe, **NU** am rulat build, upload sau commit.
- **NU** am pornit nicio reparație: acesta este raportul de audit cerut înainte de orice modificare.

**OPRIRE.** Mă opresc aici, conform taskului: aștept verdictul tău pe diagnostic (§1–§2) și pe cele două decizii din §4 (B — restaurarea automată; și confirmarea că pașii 1–5 din §5 se fac înainte de cod).
