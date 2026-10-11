# TASK — REPARARE PREMIUM, INTEGRAL ȘI CORECT (v2)

Data: 2026-10-10 · Folder: `C:\Users\pcgar\Documents\ortodoxia-app`
Executor: Open Worker (workerul `cod`) · Verificator independent: DSH (Jaguar) + ownerul
Înlocuiește textul „TASK OPEN WORKER — REPARARE PREMIUM". Se bazează pe auditul de cod din `RAPORT-AUDIT-PREMIUM-2026-10-10.md` (același folder).

## CE AM SCHIMBAT FAȚĂ DE BRIEF-UL TĂU (citește primul; fiecare punct se poate contesta)

1. **Nu am pus `Purchases.syncPurchases()` (punctul B2 din brief).** SDK-ul instalat (10.8.1) declară explicit că sincronizarea manuală se folosește doar dacă **nu** se cheamă `purchasePackage` (`node_modules/react-native-purchases/dist/purchases.d.ts:524-538`), iar aplicația cheamă `purchasePackage` (`lib/revenuecat.ts:236`). `logIn` (`use-revenuecat.ts:209`) acoperă deja cazul achiziției făcute pe client anonim. Dacă vrei totuși sincronizarea, varianta corectă e `syncPurchasesForResult()` o singură dată după `logIn` — vezi R1.
2. **Am pus o poartă T0 înainte de cod.** Două cauze găsite la audit nu se văd în cod și nu se repară în cod: webhook-ul **ignoră intenționat evenimentele SANDBOX** (`revenuecat-webhook/core.ts:465-470`) și **sare peste produsele care nu au exact id-ul de magazin așteptat** (`core.ts:17-20, 471-476`). Cât timp una din ele e adevărată, rândul din `subscriptions` nu se scrie, iar chatul dă 5/zi oricât de corectă e interfața. De aceea T0 e obligatoriu înainte de T1.
3. **Am adăugat două teste peste cele 4 cerute:** „citire eșuată ⇒ butoanele tot se văd" (cauza U2: azi o citire picată = „nu are abonament", `lib/subscription.ts:149`) și „linkul Gestionează abonamentul + butonul de restaurare rămân vizibile". Plus: testul (a) verifică **și** ecranul Cont, nu doar Premium + chat.
4. **`premium.tsx:372` nu se șterge pur și simplu.** După A1 (`isPremium` = entitlement) condiția `!premiumActive && isPremium` devine imposibilă → avertismentul (chiar dovada divergenței rând↔magazin) ar dispărea tăcut. Se rescrie explicit pe rândul din baza de date, marcat „informativ, nu acordă acces" (T1.6).
5. **Am adăugat un mesaj nou în chat** („magazinul confirmă, serverul încă nu vede abonamentul", `chat.planActivationPending`, toate cele 10 limbi). Fără el, chatul (5/zi) contrazice din nou ecranul Premium („Premium activ") — exact contradicția pentru care s-a făcut taskul.
6. **B4 („linkul rămâne vizibil") e deja adevărat** — `premium.tsx:325-333` se randează după `manageSubscriptionHref`, nu după `premiumActive`. Deci nu se schimbă cod, se fixează prin test (T6.f).
7. **Nu ating punctele 2 și 3 din contextul tău** (header-ul webhook + entitlement-ul din DSH) și nici punctul 9 (prețul în $ nu e bug de cod). Rămân exact cum le-ai lăsat.
8. **O decizie care îți aparține, pe producție:** `REVENUECAT_ACCEPT_SANDBOX=true` (T0/V4, R3) — temporar, pe cont de test, cu ștergerea flagului și a rândului de test după.

---

## 0. CUM SE EXECUTĂ

1. **Un task pe rând**, în ordinea T0 → T8. Un task se închide doar cu dovada lui (comandă + ieșire reală). Nu se deschide T(n+1) înainte.
2. **T0 (Partea 0) se face ÎNAINTE de orice linie de cod** și se completează de owner/DSH. Motivul e în T0: două dintre cauze nu se văd în cod (filtrul de sandbox și id-urile de produs din webhook). Dacă T0 arată că rândul din `subscriptions` nu se scrie, **reparația de UI nu rezolvă simptomul** și nu are sens să se pornească build-ul de test după ea.
3. **Regula de continuare (regula 63):** la „max iterations reached" sau la trunchiere de context („trim 10%", compactare) NU se cere confirmare: se reia de la ultimul pas neterminat, se curăță fișierele temporare proprii și se duce taskul până la capăt. Raportare o singură dată, la final, cu dovezi.
4. **Oprire:** după raportul din T8, execuția se oprește. Nu se pornește build, nu se face upload, nu se face commit. DSH citește fișierele și pornește build-ul.

### 0.A INTERZIS (se verifică explicit în raport)

- `src/live/**` și `src/app/live.tsx` — playerul/live: **zero atingeri**.
- **Logica de cumpărare**: `src/lib/revenuecat.ts:233-240` (`purchaseRevenueCatPackage`) — nu se modifică. În `lib/revenuecat.ts` se poate adăuga doar funcția de sincronizare **dacă** ownerul alege opțiunea B-opțional (vezi R1); nimic altceva.
- `supabase/functions/**` (inclusiv `orthodox-chat`, `revenuecat-webhook`, `delete-account`), `supabase/migrations/**` — SQL/RPC/edge/webhook: **nu se ating**, nici măcar comentarii.
- **Prețuri**: nimic hardcodat; prețul vine din magazin (`priceFor` → `packagePriceString`). Punctul 9 din taskul vechi rămâne valabil.
- Header-ul webhook-ului din panoul RevenueCat (setat de DSH) — nu se atinge.
- `package.json` — fără dependențe noi. Fără build, fără upload (`eas`), fără `git commit`.

### 0.B Lista albă (singurele fișiere care au voie să fie atinse)

| # | Fișier | Pentru |
|---|---|---|
| 1 | `src/hooks/use-subscription.ts` | T1, T3 |
| 2 | `src/hooks/use-revenuecat.ts` | T2, T4 |
| 3 | `src/lib/subscription.ts` | T4 (documentație) |
| 4 | `src/app/premium.tsx` | T1, T2, T3, T4 |
| 5 | `src/app/(tabs)/chat.tsx` | T1 |
| 6 | `src/app/(tabs)/account.tsx` | T3, T5 |
| 7 | `src/i18n/config.ts` | T1, T5 (texte noi, în toate cele 10 limbi) |
| 8 | `tests/*.mjs` | T6 (doar cele enumerate în T6) |
| 9 | `src/lib/revenuecat.ts` | doar dacă se alege R1-opțiunea B (o funcție nouă, lângă `restoreRevenueCatPurchases:242`) |

Orice alt fișier atins = **oprire și întrebare**, nu improvizație.

**Limbi (10):** `ro, en, el, sr, bg, mk, uk, ka, ru, sq` — orice text nou de interfață trece prin `t()` și există în **toate** cele 10. Textele de diagnostic (valori tehnice) rămân literale, ca acum.

### 0.C Comentarii care devin false după T1-T4 (se corectesc în același task)

Nu e cosmetică: astea sunt exact locurile în care următorul cititor își formează convingerea despre „cine acordă acces". Listă verificată prin citire directă:

| Loc | Ce spune acum | Ce trebuie să spună |
|---|---|---|
| `src/hooks/use-subscription.ts:62-63` | „CustomerInfo … nu acordă acces" | invers: entitlement-ul acordă accesul; rândul e informativ |
| `src/hooks/use-subscription.ts:82` | „Premium … exclusiv din tabelul `subscriptions`" | exclusiv din entitlement |
| `src/hooks/use-subscription.ts:90-92` | „valoarea unica din care se deriva TOATA interfata" | se referă corect la `premium`/`premiumActive` (entitlement) — se păstrează, dar se scoate orice trimitere la rând ca sursă |
| `src/hooks/use-subscription.ts:97-107` | „Cerinta 3 … sincronizari automate", „Build 14 … `restorePurchases()` AUTOMAT" | restaurare manuală, doar din buton (T2) |
| `src/app/(tabs)/account.tsx:61-62` | „`isPremium` (randul din `subscriptions`, scris de webhook)" | `isPremium` = entitlement |
| `src/app/premium.tsx:55-56` | „eticheta din randul Supabase (isPremium ? numele planului)" | istoric: formularea veche; eticheta din entitlement |
| `src/app/premium.tsx:206-213, 359-362` | „sincronizarea automata" + „rezultatul `restorePurchases()`" | „la cererea ta (buton)" |
| `src/lib/subscription.ts:26, 74-80, 95-100` | `storeStateKnown` fail-closed pe „nicio citire" + „doua surse de adevar" | „prima citire terminată" = cunoscut (T4); divergența rând↔entitlement se explică, nu se mai prezintă ca sursă dublă de acces |
| `tests/premium-auto-sync.test.mjs` (antet) | explică de ce sincronizarea e automată din build 14 | regula nouă (T6.1) |

---

## PARTEA 0 (T0) — DOVEZI ÎNAINTE DE COD · owner + DSH · fără cod

De ce: cauza reală a simptomului „Apple a confirmat plata, dar aplicația spune Plan Gratuit" este **rândul din `public.subscriptions`**, pentru că serverul acordă cota (50/zi) exclusiv din acel rând (`orthodox-chat/index.ts:261` → `reserve_ai_request`, migrarea `20260923000100_add_client_and_monthly_ai_caps.sql:129-135`). Singurul scriitor al rândului este webhook-ul RevenueCat, care **sare peste** evenimente în două situații care nu produc nicio eroare vizibilă (răspunde `200 {skipped:true}`):

- eveniment **SANDBOX** dacă `REVENUECAT_ACCEPT_SANDBOX` nu e setat pe funcție (`revenuecat-webhook/core.ts:36-42, 465-470`); flagul **nu apare în nicio documentație a proiectului**;
- **produs neacceptat**: `event.product_id` (id-ul de **magazin**) trebuie să fie exact unul din `ACCEPTED_PRODUCTS = ['ro.ortodoxia.premium.monthly','ro.ortodoxia.premium.annual']` (`core.ts:17-20, 471-476`). Id-urile `prod0d1aa29aa7` / `prod6229dc8764` sunt id-uri **interne RevenueCat**, nu id-uri de magazin.

| # | Verificare (read-only) | Unde | Rezultat așteptat | Dacă NU e așa |
|---|---|---|---|---|
| V1 | Identificatorul de magazin al celor două produse | RevenueCat → Products → fiecare produs → *Store identifier* | `ro.ortodoxia.premium.monthly` și `ro.ortodoxia.premium.annual` | webhook-ul sare peste TOATE evenimentele, cu 200 „success" în panou. Se corectează în App Store Connect / Play Console / RevenueCat (**configurare, nu cod**). |
| V2 | Entitlement-ul `premium` are ambele produse atașate | RevenueCat → Entitlements → `premium` | ambele produse listate | se atașează în RevenueCat (fără cod) |
| V3 | Tokenul de webhook | RevenueCat → Integrations → Webhooks → *Authorization header* **egal** cu Supabase → Edge Functions → Secrets `REVENUECAT_WEBHOOK_AUTH_TOKEN`; separat, există și `REVENUECAT_API_KEY` (`sk_…`) | egale, ambele setate | 401 (`core.ts:427-430`) sau 503 (`core.ts:423-425`) → rândul nu se scrie niciodată |
| V4 | Regimul de test | dacă testul se face în TestFlight/sandbox: Supabase → Edge Functions → Secrets → `REVENUECAT_ACCEPT_SANDBOX` | `true` **temporar**, doar pentru fereastra de test (vezi R3) | sandbox-ul e ignorat (`core.ts:465-470`) → rândul nu se scrie, deși Apple confirmă plata |
| V5 | Rândul din baza de date | Supabase → SQL Editor: `select user_id, status, plan, current_period_end, updated_at from public.subscriptions;` | după o achiziție + o redeschidere a ecranului Premium: un rând cu `status='active'` și `current_period_end` în viitor | dacă e gol: cauza e V1/V3/V4, nu interfața. NU se repara ecrane până nu se lămurește. |
| V6 | Identitatea din SDK (pe telefon) | ecran Premium → cardul „STAREA REVENUECAT — DIAGNOSTIC PERMANENT" (`premium.tsx:363-374`) | `Purchases.getAppUserID()` = UUID-ul Supabase (nu `$RCAnonymousID:…`) | dacă e anonim: achiziția a intrat pe alt client → se rezolvă prin `logIn` (T2) + butonul de restaurare; dacă persistă, e cazul TRANSFER din RevenueCat |

**T0 se încheie** cu tabelul completat (bife + rezultat) atașat la raport. Abia apoi T1.

---

## PARTEA 1 — COD

### T1. O SINGURĂ SURSĂ DE ADEVĂR = entitlement-ul RevenueCat (A)

Regula: **accesul și eticheta** ies din `customerInfo.entitlements.active['premium']` (`premiumActive`). Rândul din `subscriptions` rămâne expus **doar informativ** (diagnostic) și e folosit în continuare într-un singur loc legitim: detectarea stării „magazinul confirmă, rândul nu a ajuns încă" (`premiumScreenState`).

1. **`src/hooks/use-subscription.ts:83`**
   Înainte: `const isPremium = hasPremiumAccess(subscription);`
   După: `const isPremium = revenueCat.premiumActive === true;`
   Se **reserie** și comentariul de la `:82` („Premium … se determină exclusiv din tabelul `subscriptions`"), care devine: „Accesul (inclusiv limita AI) se decide EXCLUSIV din entitlement-ul RevenueCat. Rândul din `subscriptions` nu acordă acces și nu produce nicio etichetă."
   **Atenție — comentarii care spun exact invers și trebuie corectate în același task:** `:62-63` („CustomerInfo … nu acordă acces") și `:90-92` („valoarea unica din care se deriva TOATA interfata"). Altfel rămân în cod afirmații false.
   Se scot din import (`:4-10`) `hasPremiumAccess` și `subscriptionPlanLabel` (rămân nefolosite aici). `isPremium` rămâne în obiectul returnat (`:109`) — acum e derivat din entitlement.

2. **`src/hooks/use-subscription.ts:112`** — `planLabel` din entitlement, nu din rând:
   înainte de `return`, `const planLabelKey = planSummary({ premiumActive: revenueCat.premiumActive, entitlementPlan: revenueCat.entitlement.plan }).labelKey;` (se importă `planSummary` din `@/lib/subscription`; semnătura: `planSummary(input: { …, entitlementPlan?: string | null })` la `lib/subscription.ts:116-133`, iar `entitlement.plan` vine din `readPremiumEntitlement` — `lib/revenuecat.ts:349-364`, `'annual' | 'monthly' | null`; același calcul ca `premium.tsx:62`), iar la `:112`: `planLabel: t(planLabelKey),`.
   `subscriptionPlanLabel` (`lib/subscription.ts:26-29`) rămâne în fișier (are teste), dar primește un comentariu „nu mai este sursă de etichetă; păstrată pentru compatibilitate/teste".
   **Notă de onestitate:** `planLabel` din `useSubscription` nu are astăzi niciun consumator în `src` (ecranul folosește `premiumUiState`), dar e API public al hook-ului — se face corect ca să nu rămână o a doua sursă de etichetă pentru cine îl va folosi. `isPremium` (`:109`) rămâne în API, derivat acum din entitlement, dar după T1.6 nici el nu mai are consumator în ecrane.

3. **`src/hooks/use-subscription.ts:113`** — expresia rămâne `isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT`, dar acum `isPremium` vine din entitlement (punctul 1). Comentariu: „Limita afișată nu mai poate contrazice eticheta: amândouă ies din `premiumActive`."

4. **`src/app/(tabs)/chat.tsx`**
   - `:14` → `import { FREE_DAILY_AI_LIMIT, PREMIUM_DAILY_AI_LIMIT } from '@/lib/subscription';` (fără `hasPremiumAccess`, fără `SubscriptionRow`).
   - `:187` → `const { premiumActive, priceFor } = useRevenueCat();`
   - Se scoate citirea rândului din `Promise.all` (promisiunea `supabase.from('subscriptions')…maybeSingle()` de la `:320-324`) și `subscriptionResult.error` din condiția de eroare (`:329`). Motiv: limita nu mai vine din rând, iar o eroare de citire a rândului nu are ce să strice ecranul de chat.
   - `:335-337` → `const nextLimit = premiumActive ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT;`

5. **`src/app/(tabs)/chat.tsx` — onestitate când serverul nu e la zi (obligatoriu).**
   Valoarea serverului rămâne autoritară pentru cotă (vine la `:553-554` din `event.meta` și la `:571-574` din eroare). Se adaugă în zona care afișează limita (`:719-730`):
   `const planMismatch = premiumActive && dailyLimit === FREE_DAILY_AI_LIMIT;`
   iar când e `true`, sub linia limitei se randează un text mic (cheie nouă `chat.planActivationPending`, în toate cele 10 limbi): „Magazinul confirmă abonamentul, dar serverul încă nu îl vede. Se activează în câteva minute; dacă persistă, scrie-ne."
   Motiv: fără el, chatul (5/zi) contrazice din nou ecranul Premium („Premium activ") — exact contradicția pentru care s-a făcut tot taskul.

6. **`src/app/premium.tsx:372-374` — OBLIGATORIU, altfel rămâne cod mort.** Linia de azi e `{!premiumActive && isPremium ? (…) : null}`; după T1.1 `isPremium` **este** `premiumActive`, deci condiția devine imposibil de satisfăcut și avertismentul dispare tăcut din diagnosticul permanent. Corect:
   - se adaugă, **randată mereu**, linia informativă cu rândul din baza de date:
     `diagValue('rândul din baza de date (informativ)', subscription ? `${subscription.status}/${subscription.plan}/${subscription.current_period_end ?? '-'}` : 'lipsă')`
   - condiția de la `:372` se scrie explicit pe rândul din baza de date, nu pe `isPremium`: `{!premiumActive && hasPremiumAccess(subscription) ? (`, cu textul existent păstrat și prefațat prin „ATENȚIE (informativ, nu acordă acces): serverul acordă cota din rândul de mai sus, magazinul nu confirmă niciun abonament activ; divergența se rezolvă prin webhook (T0/V1-V5)."
   - `hasPremiumAccess` se importă în `premium.tsx` **doar** pentru această linie de diagnostic, cu comentariul „informativ — nu acordă acces, nu produce etichetă, nu produce limită".
   - din destructuring-ul de la `:39` se scoate `isPremium` (nu mai e folosit nicăieri în ecran).
   Atenție: `tests/premium-activation-pending.test.mjs:132,142` fixează începutul destructurării — se păstrează ordinea, doar `isPremium` dispare; iar `premium.tsx:262` (`dailyAiLimit` în textul „{count} mesaje/zi") rămâne neschimbat.

**Acceptare T1:** `grep` pe `src` → `hasPremiumAccess` apare doar în `lib/subscription.ts` (definiție + `premiumScreenState`), niciunde în ecrane; `isPremium` din `useSubscription` nu mai e folosit ca sursă de acces.

### T2. RESTAURARE DOAR DIN BUTON (B)

1. **Se șterge apelul automat:** `src/hooks/use-revenuecat.ts:423-432` (efectul care cheamă `setTimeout(() => void syncWithStore(), 0)` pentru fiecare schimbare de `userId`) — dispare complet, cu comentariul lui.
2. **Se șterge `syncWithStore`** (comentariul `:342-361` + funcția `:362-421`, cu `setStoreSync` la `:409`) și expunerea lui: `:465` (hook), `src/hooks/use-subscription.ts:101`, `src/app/premium.tsx:39` (destructuring) și apelul din efectul de focus `premium.tsx:85`. Motiv: după punctul 1 rămâne fără apelant, iar `restorePurchases()` la fiecare deschidere a ecranului Premium este exact ce interzice documentația RevenueCat. Se păstrează starea `storeSync` (`:102`) și publicarea ei, dar din buton (punctul 3).
3. **Diagnosticul rămâne dovedit, dar la buton:** `storeSync` se publică acum din `restore()` (`use-revenuecat.ts:302-331`, cu `restoreRevenueCatPurchases` la `:314`) — singurul loc care cheamă restaurarea, chemat exclusiv de butonul „Restaurează cumpărăturile" (`premium.tsx:239-245`, `const result = await restore();` la `:245`, fixat de `tests/premium-purchase-feedback.test.mjs:49` — **nu se modifică**). Liniile diagnosticului își schimbă prima linie în: `la cererea ta (butonul „Restaurează cumpărăturile") la <ora>`; restul (getAppUserID vs id Supabase, rezultatul restaurării, entitlement-urile) rămân identice.
4. **Identitatea rămâne automată:** `identifyRevenueCatUser(userId)` (`use-revenuecat.ts:206-211`, apelul la `:209`) NU se atinge — `logIn` este mecanismul documentat prin care o achiziție făcută pe client anonim ajunge la utilizatorul autentificat pe același dispozitiv, și nu este `restore`. Efectul de reîncărcare a ofertelor (`:177-181`, `setTimeout(refresh, 0)`) și efectul de poll (`:190`) rămân neatinse.
5. **NU se adaugă `syncPurchases`.** Dovadă din SDK-ul instalat (`react-native-purchases@10.8.1`), `node_modules/react-native-purchases/dist/purchases.d.ts:524-538`: `syncPurchases()` este **deprecat**, iar ambele variante avertizează „should only be called if you're not calling purchaseProduct/purchaseStoreProduct/purchasePackage/…". Aplicația folosește `purchasePackage` (`lib/revenuecat.ts:236`), deci `sync` nu e cazul nostru. (Vezi R1 dacă ownerul vrea totuși: se folosește `syncPurchasesForResult()`, o singură dată după `logIn`, niciodată `syncPurchases()`.)
6. **Linkul „Gestionează abonamentul" rămâne vizibil** — deja e randat când platforma are magazin (`premium.tsx:325-333`, condiția e `manageSubscriptionHref`, nu `premiumActive`); butonul de restaurare rămâne vizibil (`:335`). Se adaugă doar testul care fixează asta (T6.f).
7. Comentariile care justifică sincronizarea automată se rescriu: `use-revenuecat.ts:342-361` (dispare), `premium.tsx:76-82`, `use-subscription.ts:102-107`, `premium.tsx:206-213` și textul de rezervă `premium.tsx:215` („sincronizarea automata…" → „restaurarea manuala inca nu a rulat (apasa butonul)").

**Acceptare T2:** în tot `src` rămâne **un singur** apel de restaurare (`restoreRevenueCatPurchases` în `lib/revenuecat.ts:242` → `Purchases.restorePurchases()`), chemat din `restore()`, care e chemat doar din `handleRestore`. Niciun `setTimeout`/efect nu atinge restaurarea. Dovadă: testul nou (c).

### T3. FĂRĂ CLIPEALĂ (C)

1. **`src/hooks/use-subscription.ts`** — `isLoading` devine „prima determinare nu s-a terminat încă":
   - se adaugă `const loadedOnceRef = useRef(false);` (lângă `:23`);
   - `:35` → `if (!loadedOnceRef.current) setIsLoading(true);`
   - după terminarea citirii, în **ambele** ramuri — `:31` (fără utilizator) și imediat înainte de `:51` (citire încheiată, cu sau fără `queryError`, respectând guard-ul `:42`) → `loadedOnceRef.current = true; setIsLoading(false);`
   - la schimbarea utilizatorului se resetează: efectul `:54-60` depinde de `refresh`, care depinde de `user`, deci acolo se adaugă `loadedOnceRef.current = false;` (alt cont = din nou necunoscut; **NU** se resetează la re-sincronizare, adică la efectul `:70-80`).
2. **Re-citirea la 1,5 s (`:70-80`, `setTimeout(() => void refresh(), 1500)` la `:74`) rămâne** (ține rândul informativ la zi, se declanșează când entitlement-ul `activeRow` se schimbă) dar nu mai are voie să atingă `isLoading` și nici vreo etichetă — după T1 eticheta nu mai depinde de rând, deci condiția e îndeplinită prin construcție.
3. **`src/app/premium.tsx:259`** → `<Text style={styles.statusValue}>{isLoading ? t('premium.statusChecking') : premiumLabel}</Text>` devine `{premiumKnown ? premiumLabel : t('premium.statusChecking')}` (nu `isLoading`). „Se verifică" apare **doar** cât timp prima citire de la magazin nu s-a terminat.
   **NU se ating** `premium.tsx:198` și `:203` (`t('premium.statusChecking')` ca motiv al butonului blocat): acolo „checking" vine din starea ofertelor (`availabilityFor` → `offeringsLoad`/`canMakePayments`), nu din entitlement, și e corect așa — motivul real pentru un buton mort se vede deja la `:267` (`offeringsError`), `:270` (`error`) și `:274` (`storeUnavailable`).
4. **`src/app/(tabs)/account.tsx`** — `:382` → `const planLabelText = premiumKnown ? t(plan.labelKey) : t('account.planChecking');`, iar `premiumKnown` se adaugă la destructuring-ul de la `:64` (`const { entitlement, error: planError, isLoading: isPlanLoading, premiumActive } = useSubscription();`), din care se scoate `isLoading: isPlanLoading` dacă rămâne nefolosit (altfel `noUnusedLocals` poate da eroare la typecheck).

**Acceptare T3:** poll-ul (`premium.tsx:94-106`, `setInterval` la `:97`) și re-citirea de la 1,5 s pot rula de oricâte ori: `isLoading` nu mai trece pe `true` după prima determinare, iar textele de plan nu se schimbă. Dovadă: testul nou (d).

### T4. BUTOANELE (D)

Regula țintă (cerințele 1-3 din task, plus cauza U2 găsită la audit):
1. entitlement **activ** → fără butoane de cumpărare; eticheta „Premium activ", tipul real de plan din `entitlement.productIdentifier`/`entitlement.plan`, data expirării, link „Gestionează abonamentul" — **deja implementat** (`premiumUiState`, `premium.tsx:58,62,265`, `:325-333`); se păstrează.
2. entitlement **inactiv după prima citire** → butoanele **VIZIBILE**; neautentificat → buton activ care cere autentificare și duce la login (`premium.tsx:220` `requireUser()` → `/auth?returnTo=/premium`, `:225`, `:292`, `:304` — deja corect, se fixează prin test).
3. **necunoscut** → ascunse **doar** cât timp prima citire nu s-a terminat.

Ce se schimbă, exact:
- **`src/hooks/use-revenuecat.ts`** — `premiumKnown` (`:255`, azi `currentCustomerInfo !== null || !isRevenueCatConfigured()`) nu mai înseamnă „o citire a reușit", ci „**prima citire s-a terminat**":
  - se adaugă starea `const [customerInfoReadFinished, setCustomerInfoReadFinished] = useState(false);` (lângă `:102`);
  - în `refresh()`, după blocul de decizie asupra citirii — după `:165` (ramura if/else de la `:159-165`, cu guard-ul de user/cerere de la `:142-146`) **și** în `catch`-ul de la `:166-174`, după `setOfferingsLoad('error')` de la `:173` → `setCustomerInfoReadFinished(true);` (se marchează terminat pe **ambele** ramuri: reușită, eroare de citire și excepție);
  - se resetează la `false` **doar** la schimbarea utilizatorului (efectul pe `userId`), nu la re-sincronizări;
  - `:255` → `const premiumKnown = customerInfoReadFinished || !isRevenueCatConfigured();`
  - ordinea din obiectul returnat (`:460-462`: `premium, premiumActive, premiumKnown`) se păstrează (e fixată de `tests/premium-single-source.test.mjs:137`).
  Efectul: „nu s-a putut citi" nu mai arată ca „nu are abonament", dar nici nu mai ascunde la nesfârșit butoanele (U2). Când prima citire a eșuat, butoanele se văd, iar motivul pentru care nu se poate cumpăra vine din `availabilityFor` (`:438-451`) + eroarea afișată (`premium.tsx:267,270,274`).
- **`src/lib/subscription.ts:56-62`** — comanda `shouldShowPurchaseButtons` rămâne `state === 'free'` (regula e corectă), dar comentariul se actualizează: ascunse **doar** cât prima citire nu s-a terminat sau când entitlement-ul e activ; „necunoscut" ≠ „citire eșuată".
- **`src/lib/subscription.ts:76-80, 140-155`** — comentariile despre `storeStateKnown` se aliniază cu noua definiție. `premiumUiState` nu se schimbă funcțional (are teste).
- **`src/app/premium.tsx:275-279`** — mesajul „activarea e în curs" rămâne, dar acum apare **numai** când `premiumActive === true` și rândul din baza de date nu a ajuns (`premiumScreenState(subscription, premiumActive) === 'activation-pending'`), deci nu mai poate apărea din simpla nereușită a citirii.

### T5. ȘTERGEREA CONTULUI — Apple 5.1.1(v) (E)

1. **`src/i18n/config.ts:557` (`account.deleteAccountMessage`), în toate cele 10 limbi.** Cerințe de conținut, obligatorii: (i) plata/abonamentul **continuă** prin App Store/Google Play până la anulare; (ii) ștergerea contului **nu** anulează abonamentul; (iii) calea de gestionare e indicată.
   Textul român propus (model):
   „Această acțiune este permanentă și nu poate fi anulată.\n\n• Toate datele contului vor fi șterse\n• Favoritele, conversațiile AI și istoricul vor fi eliminate\n• Contul nu mai poate fi recuperat\n\nAbonamentul Premium continuă să se reînnoiască prin App Store / Google Play până când îl anulezi. Ștergerea contului NU anulează abonamentul. Îl poți gestiona sau anula din pagina de abonamente a magazinului."
   Celelalte 9 limbi: același sens, literal, fără prescurtări.
2. **`src/app/(tabs)/account.tsx:215-240`** — în **primul** dialog (cel care explică) se adaugă un al treilea buton, neutru, doar când platforma are magazin:
   `{ text: t('premium.manageSubscription'), onPress: () => { const url = manageSubscriptionUrl(Platform.OS); if (url) void Linking.openURL(url); } }`
   (reutilizează cheia existentă `premium.manageSubscription`; `manageSubscriptionUrl` din `src/lib/store-links.ts:19-23`; `Linking` e deja importat la `:3`). Ordinea butoanelor în alertă: `[Gestionează abonamentul, Continuă, Anulează]` — Android permite maximum 3 butoane, exact cât iese. Pe web (`:202-213`, `window.confirm`) textul nou ajunge oricum în mesaj; nu se adaugă buton.
   Al doilea dialog (`:225-236`, confirmarea finală) rămâne cu 2 butoane.
3. `account.deleteAccountDescription` (`:555`) rămâne cum e (nu se dublează textul).

**Acceptare T5:** fluxul de ștergere (i) spune explicit că plata continuă și că ștergerea nu o oprește, (ii) oferă drumul spre pagina de abonamente, în toate cele 10 limbi. Dovadă: testul nou (e).

---

## T6. TESTE

Se rulează/testează exact astea (restul suitei nu se atinge):

1. **De rescris:** `tests/premium-auto-sync.test.mjs` — pinii vechii reguli („sincronizarea pornește AUTOMAT", `setTimeout(() => void syncWithStore(), 0)`, `void syncWithStore();` în efectul de focus, expunerea `syncWithStore`) se **înlocuiesc** cu noua regulă: (i) `syncWithStore` nu mai există; (ii) restaurarea se cheamă doar din `handleRestore`; (iii) `identifyRevenueCatUser` rămâne automat; (iv) diagnosticul `storeSync` se publică din `restore()`. Restul testelor din fișier (diagnosticul `describeEntitlements`, expunerea `storeSync`, diagnosticul permanent) **se păstrează**.
2. **Teste noi (fișiere noi în `tests/`), exact cele cerute de task + cele două adăugate la audit:**

   | id | Fișier nou | Ce fixează (dovada obligatorie) |
   |---|---|---|
   | a | `tests/premium-entitlement-single-source.test.mjs` | entitlement activ ⇒ Premium, Cont **și** limita din chat arată plan plătit: `use-subscription.ts` derivă `isPremium`/`dailyAiLimit` din `premiumActive`; `chat.tsx` derivă limita din `premiumActive`; `account.tsx` din `planSummary`; **niciunul** din `hasPremiumAccess(rând)` |
   | b | `tests/premium-buttons-visible.test.mjs` | entitlement inactiv **după prima citire** (inclusiv citire eșuată) ⇒ `showPurchaseButtons === true`; necunoscut (prima citire neterminată) ⇒ ascunse; fără login ⇒ butonul cheamă `requireUser()` și duce la `/auth?returnTo=/premium` |
   | c | `tests/premium-restore-only-from-button.test.mjs` | `Purchases.restorePurchases()` apare o singură dată în tot `src` (în `lib/revenuecat.ts`), iar apelul e atins doar din `restore()` ← `handleRestore`; **zero** `setTimeout`/efect care să cheme restaurarea; `logIn` rămâne automat |
   | d | `tests/premium-loading-stable.test.mjs` | `isLoading` nu se reactivează după prima determinare (`loadedOnceRef`); `premiumKnown`/`premium.statusChecking` și `account.planChecking` ies din prima citire, nu din re-sincronizare; `premiumKnown` nu revine la `false` la re-sincronizare |
   | e | `tests/account-deletion-subscription-notice.test.mjs` | mesajul de ștergere (toate cele 10 limbi) conține (i)+(ii)+(iii) din T5; dialogul oferă butonul de gestionare prin `manageSubscriptionUrl` |
   | f | `tests/premium-manage-subscription-link.test.mjs` (extindere) | linkul „Gestionează abonamentul" și butonul de restaurare rămân vizibile independent de `premiumActive` |

   Testele noi citesc sursa (același tipar ca testele existente: `readFileSync` + `assert.match`/`assert.ok` + apeluri pe funcțiile pure) — proiectul nu are renderer React Native. Fiecare test trebuie declarat în `scripts/run-tests.mjs` dacă acel script ține o listă explicită (se verifică și se adaugă).

3. **Teste existente care se ajustează (doar atât):** `tests/premium-activation-pending.test.mjs:132,142` (destructurarea fără `isPremium`), `tests/premium-auto-sync.test.mjs` (rescris, vezi 1), plus orice aserțiune care numește `syncWithStore` (lista completă, verificată prin grep înainte de editare: `use-revenuecat.ts`, `use-subscription.ts`, `premium.tsx`, `tests/premium-auto-sync.test.mjs`).

**Ce NU dovedesc testele** (se scrie și în raport): randarea reală pe telefon și fluxul real de cumpărare/restaurare cu App Store/Play. Verificarea finală pe dispozitiv rămâne manuală, după build (o face DSH).

---

## T7. PORȚI (ieșire verbatim în raport)

1. `npm run typecheck` → **EXIT 0**, zero erori.
2. Testele țintite pe modulele atinse + cele noi:
   `node --test tests/premium-*.test.mjs tests/account-*.test.mjs tests/chat-*.test.mjs`
3. `npm run test:release` → toate trec.
4. Recomandat (dacă timpul permite): `npm run verify` (typecheck:all + i18n + a11y + safety + startup + test + test:release).
5. `git diff --stat` (dovada că s-au atins **doar** fișierele din lista albă 0.B).

## T8. RAPORT (format exact) + OPRIRE

1. Tabel: **fișier · linii · ce s-a schimbat** (pentru fiecare task T1-T5).
2. Ieșirea **verbatim** a porților din T7.
3. `Get-Item` pe fiecare fișier atins (cu data de azi) — dovada că fișierele sunt cele din lista albă.
4. Confirmare explicită: NU am atins playerul (`src/live/**`, `src/app/live.tsx`), SQL/RPC (`reserve_ai_request`), edge functions, webhook, prețuri; fără dependențe noi în `package.json`; fără build/upload/commit. Plus rezultatul T0 (tabelul completat).
5. Ce nu am putut verifica și de ce (minim: randarea pe dispozitiv, fluxul real de cumpărare, starea panourilor RevenueCat/Supabase).

**OPRIRE.** După raport, execuția se oprește. Nu se pornește build. DSH citește fișierele, rulează porțile independent, apoi pornește build-ul.

---

## R. RISCURI ȘI DECIZII DESCHISE (fiecare cu default-ul propus; ownerul poate schimba)

- **R1 — restaurarea automată.** Taskul vechi cerea `Purchases.syncPurchases()` o dată la pornire/login. Recomandarea tehnică: **nu se adaugă**, pentru că SDK-ul 10.8.1 declară explicit că `syncPurchases` se folosește doar când **nu** se cheamă `purchasePackage` (`purchases.d.ts:524-538`), iar `logIn` acoperă deja cazul achiziției anonime. Default: T2 ca mai sus. Dacă ownerul cere totuși sincronizarea: se folosește `syncPurchasesForResult()` (nu `syncPurchases()`, care e deprecat), o singură dată per sesiune per utilizator, imediat după `logIn`, cu comentariu care explică de ce.
- **R2 — limita din chat.** Default (T1.5): valoarea serverului **câștigă** când sosește (ea e cota reală), iar divergența e anunțată explicit. Alternativa (strict entitlement) ar afișa 50 pe zi unui om căruia serverul îi dă 5 — adică o minciună nouă.
- **R3 — `REVENUECAT_ACCEPT_SANDBOX=true` (T0/V4).** E o setare **privilegiată**: cu ea pornită, o achiziție de test poate scrie un rând real `active` în baza de producție (50 mesaje AI/zi, `revenuecat-webhook/core.ts:452-470`). Default propus: se setează **temporar**, doar cât ține testul, se folosește un cont de test, apoi se **șterge flagul** și rândul de test (DSH). Alternativa fără flag: verificarea se face cu o achiziție reală (non-sandbox). Ambele cer acordul ownerului, fiindcă ating mediul de producție.
- **R4 — „citire eșuată ⇒ butoane vizibile" (T4).** Consecința asumată: un abonat căruia îi pică citirea `CustomerInfo` vede din nou paywall-ul (butonul poate rămâne dezactivat, cu motivul afișat). Compensări: eroarea se afișează (`premium.tsx:270`), butonul de restaurare e vizibil, iar `premiumActive` adevărat ascunde oricând butoanele. Cerința D2/D3 din task cere exact asta („entitlement inactiv după prima citire ⇒ butoanele VIZIBILE"); dacă ownerul preferă fail-closed pe eroare, se schimbă o singură linie (`premiumKnown`).
- **R5 — divergentă de fond, de raportat nu de „reparat" în UI:** serverul acordă cota din rândul din `subscriptions`, iar ecranul din entitlement. Cât timp webhook-ul nu scrie rândul (T0/V1-V4), cele două **trebuie** să difere, iar aplicația o spune acum explicit (T1.5, T1.6). Reparația reală a acelei divergențe este în webhook/panouri, nu în cod de interfață.

## D. DEFINITION OF DONE (bife binare)

1. `hasPremiumAccess(rând)` nu mai decide nici acces, nici etichetă, nici limită de chat în niciun ecran.
2. Niciun apel automat de restaurare; un singur apel de `restorePurchases()` în tot `src`, atins doar din buton.
3. `isLoading` nu se reactivează după prima determinare; „Se verifică" apare doar înainte de prima citire de la magazin.
4. Butoanele de cumpărare: ascunse doar cât prima citire nu s-a terminat sau când entitlement-ul e activ; vizibile după aceea; neautentificat ⇒ duce la login.
5. Se ștergerea contului: text nou (10 limbi) + cale de gestionare a abonamentului în dialog.
6. `npm run typecheck` EXIT 0; `npm run test:release` trece; testele noi (a)-(f) trec.
7. Raport T8 complet (5 părți), cu T0 completat și cu confirmările din 0.A.
8. Zero modificări în afara listei albe 0.B; zero build/upload/commit.
