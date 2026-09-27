# Starea reală a proiectului — verificată în cod pe 27.09.2026

Documentele din `docs/` s-au scris pe rând, în zile diferite (03, 15, 22, 23 septembrie). Câteva
afirmații din ele au rămas în urmă: descriu lipsuri care între timp au fost rezolvate, sau promit
lucruri care nu există. Documentul acesta nu înlocuiește rapoartele, ci spune, punct cu punct, ce e
adevărat **acum**, cu dovada în fișier și linie. Fiecare rând a fost verificat direct în cod, nu preluat
din alt raport.

## Ce era dat ca lipsă și există

| Ce spune documentul vechi | Ce e adevărat acum | Dovadă |
|---|---|---|
| Textele legale necompletate (`RELEASE_LEGAL.md:8-19`, `REPAIR_FINAL_CLOSURE_002.md:131`) | Sunt completate: profilul de release are toate valorile publice, iar poarta de release le dă PASS | `eas.json` (32 de valori `EXPO_PUBLIC_*`), `scripts/release-readiness.mjs` |
| EAS `projectId` și `owner` lipsă (`closure:142,144`) | Există amândouă | `app.json:72` (`projectId`), `app.json:75` (`owner`) |
| Iconița e cea din șablonul Expo (`closure:144`) | Nu mai e: compoziția iconiței de iOS e proprie | poarta: „iOS icon composition is not the Expo template" — PASS |
| Conținut zilnic „1 of 365" (`closure:155`) | 365 de zile, pentru toate țările | `supabase/migrations/20260922083211_seed_daily_content_365_days.sql` (2,4 MB) |
| `audio_path` „not set" (`closure:157`) | 10 căi de audio seedate | `supabase/migrations/20260923000400_seed_prayers_with_audio.sql:12-23` |
| „10 passed / 7 failed / 3 deferred" (`closure:24,179`) | 24 passed / 2 failed / 1 deferred | `node scripts/release-readiness.mjs --release`, rulat pe 27.09.2026 |
| „CJK 0, Cyrillic 0" (`closure:20,235`) | În fișierul de seed sunt 29 de rânduri în georgiană cu caractere chinezești și 4 cu chirilice. **Contaminarea e intenționată**: migrațiile aditive de după ea le acoperă, iar validatorul o cunoaște | `scripts/validate-i18n-corpus.mjs:1178`, `supabase/migrations/20260915000500_*` și `20260915000600_*` |
| `assets/expo.icon/icon.json` „present" (`BUILD_CONFIG.md:155`) | Fișierul nu există | verificat pe disc |

## Ce promite documentul și nu există în cod

| Promisiune | Realitatea | Dovadă |
|---|---|---|
| Favorite la versete și psalmi (`STORE_SUBMISSION_KIT.md:52`) | Favoritele există **doar la rugăciuni** | tabela `public.favorites` are doar `prayer_id` (`supabase/migrations/20260829000100_initial_schema.sql`), iar ecranul le folosește doar pentru rugăciuni (`src/app/(tabs)/prayers.tsx:100-110`) |

**De decis:** ori se implementează favoritele la versete și psalmi, ori textul de magazin se scoate.
Până atunci, promisiunea rămâne neacoperită într-un document care ajunge la magazin.

## Ce blochează publicarea (poarta de release)

1. **Lipsește cheia Apple pentru RevenueCat** (`EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`).
2. **Profilul `production` are o cheie Google de TEST** (`eas.json:53`, `test_hVIDVoa…`). Cu o cheie de
   test, SDK-ul închide aplicația într-un build de release.
3. **Cron-ul notificărilor zilnice nu e configurat** (`docs/NOTIFICATION_STATUS.md:100-104`): promisiunea
   „notificare la ora aleasă" nu se împlinește fără el.
4. **Funcțiile `delete-account` și `live-services-status` nu sunt dovedite ca deployate** pe proiectul
   Supabase.

Primele două țin de proprietar (cont Apple, chei reale). Al treilea și al patrulea se pot face în cod,
dar se aplică în proiectul Supabase al proprietarului.

## Ce nu s-a putut verifica de aici

- schema reală din Supabase și migrațiile aplicate efectiv (am citit doar fișierele);
- existența fișierelor MP3 în bucket-ul de storage;
- dacă funcțiile Edge sunt publicate;
- paginile `/privacy` și `/terms` (s-a verificat doar `/delete-account`, care răspunde 200);
- comportamentul pe telefon/emulator.
