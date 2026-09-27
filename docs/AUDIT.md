> **Raportul final pe toate aplicatiile** (ce s-a reparat si ce ramane de partea proprietarului) este in `C:\Users\pcgar\Desktop\RAPORT-FINAL-APLICATII.md`.

# AUDIT — Ortodoxia (audit al stării reale, citire-only)

Audit făcut la 2026-09-27, pe copia locală `C:\Users\pcgar\Documents\ortodoxia-app`. Nu am modificat
niciun fișier în afară de acesta, nu am rulat git, nu am construit nimic, nu am atins baza remote.
Regula 17: fiecare afirmație are dovadă `fișier:linie` sau comanda care a produs rezultatul.

Comanda de poartă, rulată acum (sursa: `scripts/release-readiness.mjs:825`, sumar la `:861`, verdict la
`:866`):

```
node scripts/release-readiness.mjs --release
→ passed: 24   failed: 2   deferred: 1
→ RELEASE GATE: NOT READY
FAIL [config]  missing release variables: EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY
FAIL [release] production profile still ships a RevenueCat TEST key: EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
DEFERRED [calendar] calendar data covers only 2026 — no rows for 2027
```

## 1. Ce e aplicația

Ortodoxia este o aplicație Expo/React Native (Expo SDK 57, React Native 0.86.3, `package.json:11,32`)
pentru publicul ortodox: calendar pe 13 țări, Biblie (Noul Testament), rugăciuni cu audio, mesajul
zilei, slujbe live de la mănăstiri, chat AI și abonament premium. Are 5 tab-uri — Calendar, Biblie,
Rugăciuni, Chat, Cont (`src/app/(tabs)/`) — plus ecrane separate `live.tsx`, `premium.tsx`, `privacy.tsx`,
`terms.tsx`, `auth.tsx` (`src/app/`). Pachetul este `ro.ortodoxia.app`, identic pe iOS și Android
(`app.json:12,20`).

## 2. Tabel: promisiune / de făcut → stare

| # | Promisiune / de făcut (document, secțiune) | Stare | Dovadă | Ce lipsește |
|---|---|---|---|---|
| 1 | Conținut zilnic 365 de zile (`REPAIR_FINAL_CLOSURE_002.md` §4.3; `BIBLE_CONTENT_STATUS.md` §CORPUS) | **FĂCUT** | `supabase/migrations/20260922083211_seed_daily_content_365_days.sql:1-2` (365 zile, 13 țări); 4745 rânduri de valori; poarta: „PASS [content] daily_content covers 365 day(s)" | Nimic. Poarta de la §4.3 a raportului de închidere („1 of 365") este depășită. |
| 2 | Corpus biblic în depozit, 7958 versete, 27 cărți (`BIBLE_CONTENT_STATUS.md` §CORPUS, 23.09.2026) | **FĂCUT** | `supabase/migrations/20260923000300_seed_bible_verses_corpus.sql` — 7958 rânduri numărate; poarta: „7958 verses are seeded locally" | Nimic. |
| 3 | Rugăciuni cu `audio_path`, 10/10 (`PRAYER_AUDIO_STATUS.md`; `REPAIR_FINAL_CLOSURE_002.md` §4.3 „no audio_path is set") | **FĂCUT (seed) / NECONFIRMAT (fișierele)** | `supabase/migrations/20260923000400_seed_prayers_with_audio.sql:12-23` (10 rânduri, fiecare cu `ro/*.mp3`) | Nu am putut confirma că fișierele MP3 există în bucket (vezi §6). |
| 4 | Bucket `prayer-audio` făcut privat, client pe `createSignedUrl` (`REPAIR_FINAL_CLOSURE_002.md` §3, C-09) | **FĂCUT (cod)** | `supabase/migrations/20260915000400_make_prayer_audio_bucket_private.sql:19-21` (`public = false`); `src/app/(tabs)/prayers.tsx:219-220` (`createSignedUrl`) | Migrația e scrisă, executarea pe remote nu e dovedită aici (§6). |
| 5 | Slujbe live: registru canonic + detecție YouTube + player (`LIVE_SERVICES_STATUS.md` §Surse, §Backend) | **FĂCUT (cod)** | 33 surse în client și 33 în server, fără diferențe (comparate programatic); `src/live/live-services.ts:114-574`; `supabase/functions/live-services-status/index.ts` | Funcția `live-services-status` nu e dovedită ca deployată: `LIVE_SERVICES_STATUS.md:221` o dă ca pas viitor. |
| 6 | Notificări zilnice, o singură dată pe zi (`NOTIFICATION_STATUS.md`) | **PARȚIAL** | Cod: `src/lib/notification-logic.ts`, `supabase/functions/send-daily-notifications/index.ts:292-299` | Cron-ul nu e configurat: `NOTIFICATION_STATUS.md:100-104` (pași ⏳); `REPAIR_FINAL_CLOSURE_002.md:149`. Fără el nu pleacă nicio notificare. |
| 7 | Limite de chat: 5/50 pe cont, 20/dispozitiv, 60/IP, plafon lunar 20 000 (`AI_LIMITS_DEVICE_MONTHLY.md` §1) | **PARȚIAL** | Client mapează codurile: `src/app/(tabs)/chat.tsx:60-63`; migrație: `supabase/migrations/20260923000100_add_client_and_monthly_ai_caps.sql` | Frâna pe dispozitiv nu poate acționa în producție până nu există un build care trimite `x-device-id` — scris de autor: `AI_LIMITS_DEVICE_MONTHLY.md:119-121,133-134`. |
| 8 | Abonament prin magazin (RevenueCat), produse `ro.ortodoxia.premium.monthly` / `.annual` (`STORE_SUBMISSION_KIT.md` §3) | **LIPSĂ** | `eas.json:53` — profilul `production` are cheia `test_hVIDVoa…`; `eas.json:47-63` nu conține `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`; poarta: 2× FAIL (vezi antetul) | Cheie reală Google, cheie Apple, cele două produse create în Play Console / App Store Connect. |
| 9 | Ecran premium funcțional (preț din magazin, restaurare) | **PARȚIAL** | `src/app/premium.tsx:37-38,92,98` (preț din ofertă, altfel „prețul se vede în magazin"), `:110` (Restaurare) | Fără produse în magazine, ecranul nu are ce vinde (poarta: FAIL pe cheia de test). |
| 10 | Ștergerea contului în aplicație (`STORE_SUBMISSION_KIT.md` §6; `ACCOUNT_DELETION.md`) | **FĂCUT (cod)** | `src/app/(tabs)/account.tsx:195-277,531-549`; `src/lib/account-deletion.ts`; funcție: `supabase/functions/delete-account/index.ts` | Deploy-ul funcției: `ACCOUNT_DELETION.md:3` („LOCAL ONLY") și `:67-74` (pași nefăcuți). |
| 11 | Pagina publică de ștergere a contului | **FĂCUT** | Am cerut `https://ortodoxia.web.app/delete-account` → HTTP 200, cu pașii de ștergere și operatorul numit | Nimic. |
| 12 | Textele legale completate (`RELEASE_LEGAL.md` §Unresolved Placeholders) | **FĂCUT** | `eas.json:54-61` (toate cele 8 valori); `.env` le are pe toate 8; poarta: „PASS [legal] legal identity and support contact are fully configured" | Nimic în cod. Documentul `RELEASE_LEGAL.md` este depășit (§3). |
| 13 | 10 limbi și 13 țări (`STORE_SUBMISSION_KIT.md` §2) | **FĂCUT** | `src/i18n/config.ts:6` (10 limbi), `:72-190` (13 regiuni); `node scripts/validate-i18n-corpus.mjs` → PASS, 531 chei × 10 locale | Curățenia de script în banca de notificări: `20260913121000_…sql` încă are 29 rânduri `ka` cu text chinez (reparate aditiv, §3.8). |
| 14 | Grafică de magazin 512×512 și 1024×500 (`STORE_SUBMISSION_KIT.md` §1; `store/README.md` §2) | **FĂCUT** | `assets/store/play-icon-512.png` = 512×512 (639 322 B), `assets/store/play-feature-1024x500.png` = 1024×500 (210 103 B), dimensiuni citite din antetul PNG | Nu am verificat prezența canalului alpha pe pixel (§6). |
| 15 | Textele listării (titlu, descrieri, cuvinte-cheie) | **FĂCUT** | `docs/STORE_SUBMISSION_KIT.md:32-74`; `store/README.md:14-15` (kit §2 e sursa) | Confirmarea lor de către proprietar (`STORE_SUBMISSION_KIT.md:167`). |
| 16 | Capturi de ecran pentru magazine | **LIPSĂ** | `store/screenshots/README.md:3` („Pozele NU au fost făcute"); în folder nu există niciun PNG, doar README | Toate capturile, pe telefon real. |
| 17 | Favorite: versete, psalmi și rugăciuni (`STORE_SUBMISSION_KIT.md:52`) | **PARȚIAL** | Favorite există doar pe rugăciuni: `src/app/(tabs)/prayers.tsx:100-110,162-187`; tabelul are doar `prayer_id`: `supabase/migrations/20260829000100_initial_schema.sql:95-99` | Favorite pe versete și psalmi nu există în cod („psalm" nu apare deloc în `src/`). |
| 18 | `LICENSE` fără atribuirea Expo (`REPAIR_FINAL_CLOSURE_002.md` §5) | **FĂCUT** | `LICENSE:3` — „Copyright (c) 2026 Ortodoxia"; poarta: „PASS [release] LICENSE does not carry the Expo template attribution" | Nimic. |
| 19 | Legătura EAS (`projectId`, `owner`) (`REPAIR_FINAL_CLOSURE_002.md` §4.2) | **FĂCUT** | `app.json:72` (`projectId: ef0641df-…`), `:75` (`owner: ortodoxia`); poarta: „PASS [release] EAS projectId and owner are configured" | Nimic. |
| 20 | Calendar 2027 (`REPAIR_FINAL_CLOSURE_002.md` §4.3) | **LIPSĂ** | Poarta: „DEFERRED [calendar] calendar data covers only 2026 — no rows for 2027"; `src/lib/feast-rank.ts:194,201-202` (limita `SEEDED_CALENDAR_RANGE`); planul e în `REPAIR_FINAL_CLOSURE_002.md:158` | Datele liturgice pentru 2027, când vor fi publicate. |
| 21 | Build de test instalabil | **FĂCUT** | `android/app/build/outputs/apk/release/app-release.apk`, 120 265 271 B, scris 2026-09-23 18:22; rețeta în `docs/BUILD_RELEASE_LOCAL.md:8-21` | Cumpărăturile sunt dezactivate în acel build (`BUILD_RELEASE_LOCAL.md:44-48`). |
| 22 | Verificări automate (typecheck, teste, poartă) | **FĂCUT** | `package.json:58-77`; poarta rulează 27 de verificări (24 PASS, 2 FAIL, 1 DEFERRED, vezi antetul) | Cele 2 FAIL sunt externe (§4). |

## 3. Contradicții între documente și cod

1. **Textele legale: goale sau completate?** `RELEASE_LEGAL.md:8-19` spune că `privacy.tsx` și `terms.tsx`
   au placeholdere `[DE COMPLETAT]`; `REPAIR_FINAL_CLOSURE_002.md:131` spune că cele 8 variabile legale
   sunt necompletate. Realitatea din arbore: `eas.json:54-61` le are pe toate, iar poarta scrie
   „PASS [legal] legal identity and support contact are fully configured". **Mai nouă este realitatea
   din cod**: `eas.json` a fost scris 2026-09-23 17:19, iar documentele sunt din 2026-09-03 și 2026-09-15.
   Textele nu mai conțin placeholdere între paranteze drepte, ci tokeni `{…}` umpluți din variabile
   (`src/lib/legal-values.ts:160-169`).
2. **Conținut zilnic: 1 zi sau 365?** `REPAIR_FINAL_CLOSURE_002.md:155` (15.09.2026) spune „covers 1 of
   365 days"; `supabase/migrations/20260922083211_seed_daily_content_365_days.sql:1-2` (22.09.2026) are
   365 de zile × 13 țări, iar poarta confirmă „covers 365 day(s)"
   (`scripts/release-readiness.mjs:384`). **Mai nouă este migrația** (07 zile mai târziu).
3. **Audio la rugăciuni: setat sau nu?** `REPAIR_FINAL_CLOSURE_002.md:157` spune „No `prayers.audio_path`
   is set"; `supabase/migrations/20260923000400_seed_prayers_with_audio.sql:12-23` seedează 10 rânduri
   cu `audio_path`. **Mai nouă este migrația** (23.09.2026) și poarta confirmă „prayer audio paths are
   seeded by a migration (10 căi)".
4. **Cheile EAS și iconița: lipsesc sau există?** `REPAIR_FINAL_CLOSURE_002.md:142` spune că
   `extra.eas.projectId` și `owner` lipsesc, iar `:144` că iconița iOS e șablonul Expo. Realitatea:
   `app.json:72,75` are ambele, iar poarta scrie „PASS [release] EAS projectId and owner are configured"
   și „PASS [release] iOS icon composition is not the Expo template". **Mai nouă este realitatea din
   arbore** (`app.json` scris 2026-09-23 16:11).
5. **Numărul de verificări ale porții de release.** `REPAIR_FINAL_CLOSURE_002.md:24,179` raportează
   „10 passed / 7 failed / 3 deferred"; astăzi poarta raportează **24 passed / 2 failed / 1 deferred**
   (`scripts/release-readiness.mjs:861`). Cele 5 FAIL-uri dispărute sunt exact cele reparate între timp
   (valori legale, iconiță, `LICENSE`, `daily_content`, corpus biblic). **Mai nouă este rularea de acum.**
6. **Cifrele de test din documente nu se potrivesc cu ieșirea de acum.** `REPAIR_FINAL_CLOSURE_002.md:21`
   spune „521 keys × 10 locales" și `:235` la fel; validatorul de acum scrie „531 keys per locale"
   (`node scripts/validate-i18n-corpus.mjs`). Diferența de 10 chei nu e explicată de niciun document.
   Nu pot spune care dintre cifre e greșită fără să compar cheie cu cheie (§6).
7. **Curățenia de script în `ka`.** `REPAIR_FINAL_CLOSURE_002.md:20,235` scrie „CJK 0, Cyrillic 0".
   Astăzi validatorul scrie „ka notification rows: 370 (CJK 29, Cyrillic 4, repaired by additive
   migration 33)" — adică seed-ul are încă 29 de rânduri cu chineză și 4 cu chirilică
   (`supabase/migrations/20260913121000_seed_multilingual_daily_notification_message_bank.sql:1183-1208,1162,1300,1453,1480`).
   Am verificat programatic: toate cele 29 de rânduri cu chineză **și** cele 4 cu chirilică au câte o
   reparație aditivă (`20260915000500_repair_applied_seed_data.sql:81,411,455,466` și cele 36 de
   `UPDATE`); în migrațiile de reparație nu mai există niciun caracter chinezesc. Deci baza remote este
   curată, dar fișierul de seed rămâne contaminat **intenționat** (`scripts/validate-i18n-corpus.mjs:1178-1180`).
8. **Iconița iOS din documentație.** `docs/BUILD_CONFIG.md:155` listează `assets/expo.icon/icon.json`
   ca „present". Fișierul nu există: în `assets/` sunt doar `bible`, `images`, `store`, iar `app.json:8`
   folosește `./assets/images/icon.png` (1024×1024). Documentul e depășit.
9. **„Fără fișier biblic local".** `docs/BIBLE_CONTENT_STATUS.md:104` scrie că în depozit nu există
   niciun fișier JSON/CSV cu versete. Există `assets/bible/bible-verses.json` (2 943 383 B), dar niciun
   fișier din `src/`, `tests/` sau `scripts/` nu îl referă (căutare în tot arborele: 0 potriviri). Deci
   afirmația este adevărată pentru codul care citește Biblia, dar nu pentru arbore.

## 4. Ce lipsește înainte de publicare

1. **Cheia RevenueCat reală pentru Google și cheia Apple.** Poarta: FAIL [config] + FAIL [release]
   (`eas.json:53` are o cheie `test_…`, `:47-63` nu are cheia Apple). Cu cheia de test, SDK-ul închide
   aplicația în release — scris de autor: `docs/BUILD_RELEASE_LOCAL.md:11-14`.
   Cerința magazinului: „necesită verificare" (nu am citit un text oficial care să spună exact asta).
2. **Produsele de abonament create în ambele magazine** (`STORE_SUBMISSION_KIT.md:78-89`).
3. **Cron-ul pentru notificări** (`NOTIFICATION_STATUS.md:100-104`; `REPAIR_FINAL_CLOSURE_002.md:149`).
   Fără el, promisiunea „notificări la ora pe care o alegi" din listare nu se împlinește.
4. **Deploy-ul funcțiilor care nu apar ca deployate:** `delete-account`
   (`ACCOUNT_DELETION.md:3,67-74`), `live-services-status` (`LIVE_SERVICES_STATUS.md:221`),
   `send-daily-notifications` (`NOTIFICATION_STATUS.md:103`). Pentru `orthodox-chat` deploy-ul este
   consemnat ca făcut (`AI_LIMITS_DEVICE_MONTHLY.md:99`).
5. **Capturile de ecran** (`store/screenshots/README.md:3`); pentru Play minim 2, recomandat 4–8
   (`STORE_SUBMISSION_KIT.md:20`). Cerințele exacte de format sunt citate cu link oficial în
   `store/screenshots/README.md:17,40` (Google Play Console Help, Apple App Store Connect Help).
6. **Cron-ul și declarațiile din console** (Data safety, clasificare): răspunsurile sunt pregătite
   (`STORE_SUBMISSION_KIT.md:93-121`), dar nu pot fi depuse fără conturi plătite.
7. **Un build nou al aplicației** pentru ca frâna pe dispozitiv să funcționeze
   (`AI_LIMITS_DEVICE_MONTHLY.md:119-121`).
8. **Calendarul 2027** — nu blochează publicarea, dar lasă o limită vizibilă în aplicație
   (poarta: DEFERRED [calendar]).

## 5. Ce ține de proprietar

- **Bani:** cont Google Play (25 USD, o dată) și Apple Developer (99 USD/an) — sumele sunt citate din
  `STORE_SUBMISSION_KIT.md:163`, **nu le-am verificat la sursă**. Cheile RevenueCat (Google + Apple) și
  cele două produse de abonament (`:165`). Consumul AI: plafonul lunar e 20 000 de mesaje
  (`docs/AI_LIMITS_DEVICE_MONTHLY.md:19,73`), iar saltul se schimbă cu
  `select public.set_ai_monthly_cap(<n>)` (`:122-124`) — decizie de buget.
- **Conturi și acte:** aplicația `ro.ortodoxia.app` în Play Console și App Store Connect
  (`STORE_SUBMISSION_KIT.md:164`), contul de serviciu Play și credențialele Apple pentru EAS (`:166`).
- **Identitatea juridică:** operatorul este o persoană fizică — `eas.json:54` are
  `EXPO_PUBLIC_LEGAL_ENTITY = Ștefan Ștefan`, iar adresa poștală (`:56`) este „Rm. Vâlcea, județul
  Vâlcea, România", fără stradă și număr. Dacă e corect sau nu, este decizia proprietarului; textul
  publicat pe site (`https://ortodoxia.web.app/delete-account`) afișează aceeași identitate.
- **Declarațiile legale din console** (`STORE_SUBMISSION_KIT.md:168`) și **confirmarea textelor
  listării** (`:167`).
- **Decizia de a folosi în listare afirmația despre favorite la versete și psalmi** — în cod nu există
  (§2, rândul 17), deci ori se implementează, ori textul se schimbă.

## 6. Ce nu am putut verifica

1. **Baza remote Supabase.** Nu am rulat `supabase` și nu am citit schema reală. Toate afirmațiile
   „aplicat pe producție" vin din documente (`AI_LIMITS_DEVICE_MONTHLY.md:93-116`), nu din verificarea
   mea. Nu știu ce migrații sunt aplicate efectiv.
2. **Fișierele MP3 din bucket.** Dovada lor este un document din 2026-09-02
   (`PRAYER_AUDIO_STATUS.md:5-18`, verificare prin HEAD); nu am repetat cererile.
3. **Deploy-ul fiecărei funcții Edge.** Nu am acces la proiectul Supabase.
4. **Site-ul.** Am verificat doar `https://ortodoxia.web.app/delete-account` (HTTP 200). Nu am deschis
   `/privacy` și `/terms` (documentul `RELEASE_CONFIG_REVIEW.md:17` spune că răspund 200, dar aceasta
   este afirmația lui, nu a mea).
5. **Dacă grafica de magazin are canal alpha** — am citit doar antetul PNG, nu pixelii.
6. **Dacă aplicația arată corect pe telefon.** Nu am pornit emulatorul și nu am instalat APK-ul.
7. **Cifra exactă de chei i18n** (521 în raportul din 15.09, 531 acum) — nu am făcut diferența cheie cu
   cheie.
8. **Prețurile magazinelor** (25 USD / 99 USD) — citate din document, neverificate la sursă.
9. **Dacă `supabase/config.toml:19` (`enable_anonymous_sign_ins = true`) corespunde setării reale** din
   proiect — fișierul este local.
10. **Starea testelor și a typecheck-ului.** Am rulat doar poarta de release și validatorul i18n. Nu am
    rulat `npm test`, `tsc --noEmit` sau `npm run verify`.
11. **Istoricul git** (ce e comis și ce nu) — nu am rulat nicio comandă git, conform cerinței.

---

## Ce s-a reparat după audit (27.09.2026, runda 2)

- **Contradicțiile document–cod sunt strânse într-un singur loc verificat:** `docs/STARE-REALA.md`,
  cu dovadă în fișier și linie pentru fiecare rând (textele legale, `projectId`/`owner`, 365 de zile de
  conținut, `audio_path`, numerele porții, contaminarea intenționată a seed-ului georgian,
  `assets/expo.icon/icon.json` care nu există).
- **Am pus avertismente de tip „datele de aici sunt învechite"** în capul documentelor care induc în
  eroare: `REPAIR_FINAL_CLOSURE_002.md` și `STORE_SUBMISSION_KIT.md`.
- **Promisiunea de favorite la versete și psalmi** e marcată ca neacoperită: în cod favoritele există
  doar la rugăciuni (tabela `favorites` are doar `prayer_id`). De decis: se implementează sau se scoate
  din textul de magazin.
- **Rămâne de făcut de proprietar:** cheia Apple pentru RevenueCat, cheia Google reală în profilul
  `production` (acum e de test), cron-ul notificărilor, deploy-ul funcțiilor `delete-account` și
  `live-services-status`.
