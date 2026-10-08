# Starea reală a proiectului — verificată în cod pe 27.09.2026, reactualizată pe 08.10.2026

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
| „10 passed / 7 failed / 3 deferred" (`closure:24,179`) | **27 passed / 4 failed / 3 deferred → NOT READY** (08.10.2026). Cele 4 FAIL sunt intrări ale ownerului, nu restanțe de cod: cheia RevenueCat publică (2 verificări), `google-services.json`/FCM pentru notificări, plus declarațiile de licență (4 bifate nefăcute) | `node scripts/release-readiness.mjs --release`, rulat pe 08.10.2026 |
| „CJK 0, Cyrillic 0" (`closure:20,235`) | În fișierul de seed sunt 29 de rânduri în georgiană cu caractere chinezești și 4 cu chirilice. **Contaminarea e intenționată**: migrațiile aditive de după ea le acoperă, iar validatorul o cunoaște | `scripts/validate-i18n-corpus.mjs:1178`, `supabase/migrations/20260915000500_*` și `20260915000600_*` |
| `assets/expo.icon/icon.json` „present" (`BUILD_CONFIG.md:155`) | Fișierul nu există | verificat pe disc |

## Ce promitea documentul și nu exista în cod (închis)

| Promisiune | Realitatea | Dovadă |
|---|---|---|
| Favorite la versete și psalmi (`STORE_SUBMISSION_KIT.md:52`) | **Nu mai e o promisiune neacoperită**: tabela `public.verse_favorites` are migrație proprie, ecranul Bibliei o folosește, iar textul de listare a fost aliniat (fără promisiunea de psalmi) | `supabase/migrations/20260927000100_add_verse_favorites.sql`, `src/app/(tabs)/bible.tsx:71,101,108` |

**Stare:** închisă pe ambele planuri. Codul are tabela și ecranul, iar migrația **este aplicată** în
proiectul live — măsurat de mine la 08.10.2026: `GET /rest/v1/verse_favorites?select=user_id&limit=0`
→ **200** (`Content-Range: */0`).

## Ce blochează publicarea (poarta de release)

1. **Lipsește cheia Apple pentru RevenueCat** (`EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`) — raportată
   **DEFERRED**, nu FAIL: lansarea de față e pentru Google Play.
2. **Cheia Google din profilele `preview` și `production` este GOALĂ**
   (`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY = ""` în `eas.json`). Verificat 08.10.2026: nicio cheie reală
   în depozit — singura apariție a șirului `test_` în `src/lib/revenuecat.ts:111` este un comentariu care
   explică de ce o cheie de Test Store este respinsă. Cu cheia goală `configureRevenueCat()` iese devreme, iar
   ecranul premium spune „magazinul nu este disponibil" — deci abonamentul nu poate fi vândut.
   *(Corectat: rândul acesta scria „cheie Google de TEST"; între timp cheia a fost golită, iar
   poarta verifică acum ambele cazuri: cheie lipsă/goală și cheie `test_…`.)*
3. **Cron-ul notificărilor zilnice nu e configurat** (`docs/NOTIFICATION_STATUS.md:100-104`): promisiunea
   „notificare la ora aleasă" nu se împlinește fără el. **Update (runda 18):** scriptul de programare
   există acum, gata de rulat, în `supabase/cron/schedule-daily-notifications.sql`, iar pașii tăi sunt
   în `docs/CRON-NOTIFICARI.md`; lipsește doar rularea pe proiectul tău (extensii + secret + Vault).
4. ~~**Funcția `delete-account` nu e publicată.**~~ **Închis** — măsurat 08.10.2026:
   `GET /functions/v1/delete-account` → **405 Method Not Allowed** (există, cere POST), la fel ca
   `orthodox-chat` → 405, iar `live-services-status` → 200. *(La auditul din 06.10.2026 răspundea 404.)*

## Verificat live pe proiectul Supabase (08.10.2026)

Probe read-only, cu cheia publică din `.env` (fără token, fără `service_role`), rulat de mine:

| Probă | Rezultat |
|---|---|
| `GET /functions/v1/live-services-status` | 200 |
| `GET /functions/v1/orthodox-chat` | 405 (există, cere POST) |
| `GET /functions/v1/delete-account` | **405** (există, cere POST) — publicată între timp |
| `GET /rest/v1/verse_favorites?select=user_id&limit=0` | **200**, `Content-Range: */0` — tabela există |
| `GET /rest/v1/ai_reports?select=id&limit=0` | **401, cod 42501** — tabela există, dar `anon` nu are SELECT: exact ce declară migrația (`revoke all … from anon`, `grant select, insert … to authenticated`) |
| `GET /rest/v1/daily_content?select=id&verse_source=eq.NULL&limit=0` | **0 rânduri** (din 4745 de rânduri în total) — literalul `NULL` curățat |

**Concluzie:** cele patru acțiuni de infrastructură din audit — publicarea `delete-account`, aplicarea
migrațiilor `verse_favorites` și `ai_reports`, curățarea `verse_source` — sunt **încheiate și
verificate live** la 08.10.2026. Ce rămâne la owner e altceva: cheia RevenueCat, FCM + cron-ul de
notificări, cron-ul de retenție și declarațiile de licență (vezi `docs/OWNER-ACTIONS.md`).

## Ce nu s-a putut verifica de aici

- **conținutul** tabelelor live (am citit doar existența lor și numărători: 0 rânduri în
  `verse_favorites`, 0 rânduri cu `verse_source = 'NULL'`, 4745 de rânduri în `daily_content`);
- existența fișierelor MP3 în bucket-ul de storage;
- paginile publice `/privacy` și `/terms` (am probat doar funcțiile Edge);
- comportamentul pe telefon/emulator în această rundă.

Reactualizat pe 08.10.2026 pe baza probelor live de mai sus: „schema reală / migrațiile aplicate" și
„dacă funcțiile Edge sunt publicate" **au fost între timp măsurate** și au ieșit închise.
