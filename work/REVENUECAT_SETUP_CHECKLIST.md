# RevenueCat — Checklist de integrare Premium

Data raport: 2026-09-01
**Reverificat și corectat: 2026-10-08** (poziția C10 din audit — erau trei afirmații care nu mai corespundeau codului: funcția `syncRevenueCatToSupabase`, sursa „autoritativă" a stării premium și locul unde se pune cheia)
Branch: `master`
Commit analizat: `6f45167`

Acest document separă clar ce este deja **implementat în cod** față de ce **mai trebuie configurat** (RevenueCat, App Store, Play, build, testare). Se verifică **fără chei reale**; nu au fost adăugate/afișate valori din `.env`.

---

## Rezumat

| Componentă | Stare |
|------------|-------|
| Pachet npm | `react-native-purchases@^10.8.1` ✅ (în `package.json`) |
| Cod integrare | Compilează fără erori; configurarea și testarea nativă sunt încă necesare |
| Entitlement | `premium` (în cod) — trebuie creat în panoul RevenueCat |
| Produse | `ro.ortodoxia.premium.monthly` / `ro.ortodoxia.premium.annual` (în cod) — trebuie create în RevenueCat + magazine |
| Chei API | ❌ lipsește cheia reală: profilele EAS `preview` și `production` declară `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`, dar cu valoare **goală**, iar `.env.example` are doar placeholder-e. Poarta de release dă FAIL pe ea |
| Plăți web | ❌ neintegrate (SDK nu suportă web) |

---

## 1. Implementat în cod

### 1.1 `src/lib/revenuecat.ts`
- `PREMIUM_ENTITLEMENT_ID = 'premium'`
- `ENTITLEMENT_PRODUCT_MAPPING`: `monthly → ro.ortodoxia.premium.monthly`, `annual → ro.ortodoxia.premium.annual`
- `configureRevenueCat()` — inițializează SDK o singură dată; alege cheia după platformă (iOS→Apple, Android→Google); **returnează pe web** (`Platform.OS === 'web'`)
- `identifyRevenueCatUser(userId)` — leagă utilizatorul Supabase de App User ID (`logIn`)
- `clearRevenueCatUser()` — deconectează la sign-out (`logOut`)
- `getRevenueCatOfferings()`, `packageForPlan()`, `packagePriceText()`
- `purchaseRevenueCatPackage(pkg)` — cumpărare
- `restoreRevenueCatPurchases()` — restaurare
- `isPremiumActive(info)` — verifică entitlement `premium`
- `customerInfoToSubscriptionRow(info)` — mapează CustomerInfo → rând de abonament (plan lunar/anual, status, expirare, renew), **doar pentru afișare**
- ⚠️ **Corectat 08.10.2026:** aici scria `syncRevenueCatToSupabase(userId, info)` — *upsert în tabelul `subscriptions`*. Funcția **nu există** (0 apariții în `src/`, `scripts/`, `supabase/functions/`), iar clientul **nu scrie** în `subscriptions`: singurele accesări din `src/` sunt două citiri (`.from('subscriptions')` în `src/hooks/use-subscription.ts:37` și `src/app/(tabs)/chat.tsx:313`). Rândul din `subscriptions` este scris **exclusiv server-side, de webhook-ul RevenueCat** (`supabase/functions/revenuecat-webhook/core.ts:290`, „Construiește rândul care se va upsert în `subscriptions`”). Un client care ar putea scrie singur `status` ar putea să-și acorde premium — de aceea nu există.
- `isPurchaseCancelledError()` — detectează anularea cumpărării

### 1.2 `src/hooks/use-revenuecat.ts`
- Expune `packages`, `customerInfo`, `activeRow`, `isPremium`, `loading`, `offeringsError`, `priceFor`, `buy`, `restore`, `refresh`
- Se configurează și se abonează la `addCustomerInfoUpdateListener`
- La autentificare → `identifyRevenueCatUser`; la sign-out → `clearRevenueCatUser`
- După cumpărare/restaurare/update → reîmprospătează **afișarea**; `subscriptions` se scrie de webhook, nu de aici
- Pe web: starea rămâne `null` (guard în configure) — nu blochează aplicația

### 1.3 `src/hooks/use-subscription.ts`
- Sursa autoritativă este **tabelul `subscriptions`** (citit cu `.select(...).eq('user_id', …).maybeSingle()`). `CustomerInfo` din RevenueCat **nu acordă acces**: e folosit doar pentru afișare imediată și pentru a declanșa o re-citire după 1,5 s (`src/hooks/use-subscription.ts:62-83`). *(Corectat 08.10.2026: textul de aici spunea invers — că `activeRow` din CustomerInfo „câștigă".)*
- `hasPremiumAccess()` respectă status `active/trialing` și expirarea.

### 1.4 `src/app/premium.tsx`
- Afișează planul curent, beneficii, prețuri (din RevenueCat), butoane de cumpărare lunar/anual și buton de restaurare.

### 1.5 Inițializare — `src/app/_layout.tsx`
- `configureRevenueCat()` în `useEffect` la pornire.

### 1.6 `.env.example`
- Conține doar placeholder-e necesare: `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` și `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` (plus placeholder-e Supabase). ✅ fără chei reale.

### 1.7 Sincronizare `subscriptions`
- Schema `subscriptions` (migrarea `20260830000100_add_subscriptions.sql`) are coloanele folosite: `status`, `plan`, `provider` (apple/google/manual), `product_id`, `provider_subscription_id`, `current_period_end`, `cancel_at_period_end`. ✅ compatibilă cu rândul construit de webhook (`supabase/functions/revenuecat-webhook/core.ts:290`), nu de o funcție de client.

---

## 2. Necesită configurare RevenueCat (panoul web)

- [ ] Creează proiectul RevenueCat și platformele iOS + Android.
- [ ] Creează entitlement-ul **`premium`** (exact așa cum e în cod).
- [ ] Creează produsele `ro.ortodoxia.premium.monthly` și `ro.ortodoxia.premium.annual` și le leagă de produsele din magazine.
- [ ] Creează offering-ul **„Premium"** cu pachetele cu identificatorii `monthly` și `annual` (aplicația caută `pkg.identifier === 'monthly'/'annual'`).
- [ ] Activează modul Sandbox/Test pentru testare.
- [ ] Pune cheia publică Google (`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`) în **variabilele de mediu EAS** ale profilelor `preview` și `production` — nu în `.env` (care e doar pentru dezvoltarea locală) și nu în cod. *(Corectat 08.10.2026: textul de aici trimitea la `.env`.)* Cheia Apple e **DEFERRED** — lansarea de față e doar pe Google Play.

---

## 3. Necesită App Store Connect

- [ ] Creează abonamentele auto-reînnoibile — lunar și anual — cu ID-urile exacte `ro.ortodoxia.premium.monthly` / `ro.ortodoxia.premium.annual`.
- [ ] Configurează prețuri și localizări pentru România (și alte țări target).
- [ ] Creează „App Store Connect API key" sau datele pentru RevenueCat (server-side).
- [ ] Configurare Shared Secret (RevenueCat o folosește) — server side.

---

## 4. Necesită Google Play Console

- [ ] Creează abonamentele lunar și anual cu aceleași ID-uri.
- [ ] Configurează prețuri și localizări.
- [ ] Creează licență de test / testeri de licență.
- [ ] Status „Active" pentru produse; configurează perioadă de probă opțională.

---

## 5. Necesită build nativ

- `react-native-purchases` cere linking nativ (iOS/Android).
- **Expo Go NU suportă plăți real** — necesită development build sau EAS Build (dev-client).
- După configurarea de mai sus: `npx expo run:ios` / `run:android` sau `eas build`.
- Verifică dacă e nevoie de configurare iOS (scheme/marketplace) în `app.json`.

---

## 6. Necesită testare reală

- [ ] Login utilizator + `identifyRevenueCatUser`.
- [ ] Cumpărare lunar (sandbox) → entitlement activ → `isPremium`.
- [ ] Cumpărare anual (sandbox).
- [ ] Restaurare cumpărături (`Restaurează cumpărăturile`).
- [ ] Verificare sincronizare în `subscriptions` și limită AI = 50 mesaje/zi.
- [ ] Expirare/reînnoire, revocare, anulare.
- [ ] Test pe iOS și Android separat.

---

## 7. Plăți mobile

- Implementate în cod (iOS + Android prin RevenueCat) — **funcționale doar după** configurare + build + testare reală.

## 8. Plăți web (momentan NU integrate)

- `react-native-purchases` nu suportă web.
- `configureRevenueCat()` returnează pe web (guard `Platform.OS === 'web'`); starea e nulă.
- Premium pe web necesită o integrare separată (ex. Stripe / Paddle) — **neimplementat**.
