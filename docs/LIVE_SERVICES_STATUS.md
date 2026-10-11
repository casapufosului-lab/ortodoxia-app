# Slujbe LIVE — Surse și servicii

> Stare: **LIVE-C** — UI conectat la backend-ul live-services-status. Include
> client fetch Edge Function, decizie playback (EMBED / EXTERNAL / OFFICIAL),
> player YouTube (WebView nativ + fallback web iframe), per-source status
> semantics și UX error/retry. Toate fazele LIVE-A, LIVE-B și LIVE-C sunt
> completate local.

## Principii

- Ortodoxia **nu este broadcasterul**. Nu descărcăm, nu rehostăm, nu
  proxynam și nu restreamăm transmisiunile. Deschidem doar pagina/sursa
  oficială a providerului.
- Registrul surselor este **canonic și permanent** în
  `src/live/live-services.ts`. UI-ul nu conține URL-uri împrăștiate.
- Sursele permanente **nu conțin niciodată** un `videoId` curent ca
  configurație permanentă. Un `videoId` de o singură emisiune aparține doar
  unui obiect tranzitoriu `CurrentLiveBroadcast` (LIVE-B).
- Detecția dinamică folosește **YouTube Data API v3** (oficial) pentru orice
  verdict: `search.list` + `videos.list` + `playlistItems.list` (uploads).
  În plus, pentru streamurile permanente 24/7, pagina publică
  `https://www.youtube.com/channel/<Channel ID>/live` este citită **doar ca
  indiciu** (vezi „Scara de descoperire”): un `videoId` luat de acolo nu devine
  niciodată LIVE fără confirmarea `videos.list`. Nu există scraping de conținut,
  nu se stochează HTML, nu se folosesc endpoint-uri interne sau servicii terțe.

## Surse candidate

### 1. TRINITAS TV — București

- **Nume**: TRINITAS TV
- **Locație**: București
- **Website oficial**: https://www.trinitas.tv
- **Canal YouTube stabil**: https://www.youtube.com/@TrinitasTVOFICIAL
- **Channel ID verificat**: `UCcqFHIDYfKsaJ5KXZjzW7ZQ`
- **Cum s-a stabilit proveniența**: website-ul oficial trinitas.tv se
  autodefinește ca „Televiziunea Patriarhiei Române”, are iconiță YouTube
  și este listat în proiectele oficiale ale patriarhia.ro. Canalul YouTube
  are numele oficial „TRINITAS TV”.
- **Enabled**: DA
- **Detecție dinamică**: ACTIVĂ (YouTube Data API)
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: nu se afișează program suplimentar.

### 2. Doxologia — Iași / Catedrala Mitropolitană

- **Nume**: Doxologia
- **Locație**: Iași
- **Website oficial**: https://doxologia.ro
- **Canal YouTube stabil**: https://www.youtube.com/@doxologia
- **Channel ID verificat**: `UC48EI8pmHeFuZIn1O4qKu8A`
- **Cum s-a stabilit proveniența**: doxologia.ro se autodefinește ca
  proiect al Arhiepiscopiei Iașilor („Site dezvoltat de DOXOLOGIA MEDIA,
  Arhiepiscopia Iașilor”). Canalul YouTube are numele oficial „doxologia.ro”.
- **Enabled**: DA
- **Detecție dinamică**: ACTIVĂ (YouTube Data API)
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: nu se afișează program suplimentar.

### 3. Mănăstirea Putna — Putna

- **Nume**: Mănăstirea Putna
- **Locație**: Putna
- **Website oficial**: https://www.putna.ro
- **Canal YouTube stabil**: https://www.youtube.com/@ManastireaPutna
- **Channel ID verificat**: `UCFwQ9MMZSMYJ8pevvLHS79g`
- **Cum s-a stabilit proveniența**: website-ul oficial putna.ro declară
  explicit că slujbele sunt transmise în direct „pe pagina de Facebook și
  pe canalul de YouTube ale mănăstirii”. Canalul YouTube are numele oficial
  „Putna Monastery”.
- **Enabled**: DA
- **Detecție dinamică planificată**: DA
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: site-ul oficial publică programul
  săptămânal al slujbelor, inclusiv Sfânta Liturghie de duminică la 9:00.

### 4. Mănăstirea Sihăstria — Neamț

- **Nume**: Mănăstirea Sihăstria
- **Locație**: Neamț
- **Website oficial**: https://sihastria.ro (greu accesibil / temporar nerecepționat)
- **Canal YouTube stabil**: https://www.youtube.com/@manastireasihastria
- **Channel ID verificat**: `UCD3L96gliife4V-II9izsPA`
- **Cum s-a stabilit proveniența**: canalul YouTube există cu numele
  oficial „Mănăstirea Sihăstria”, iar Doxologia confirmă existența
  mănăstirii. **Dar** nu am putut confirma **independent** că website-ul
  oficial al mănăstirii linkuie către acest canal SAU că descrierea
  canalului linkuie clar înapoi către organizație (site nerecepționat în
  timpul verificării). Conform regulilor, acestă sursă este **DEZACTIVATĂ**
  în registru până la reverificarea provenienței.
- **Enabled**: NU
- **Detecție dinamică planificată**: DA (când va fi reactivată)
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: nu se afișează.

### 5. Radio Renașterea — Cluj-Napoca / Catedrala Mitropolitană

- **Nume**: Radio Renașterea
- **Locație**: Cluj-Napoca
- **Website oficial**: https://radiorenasterea.ro
- **Canal YouTube stabil**: https://www.youtube.com/@Radiorenasterea
- **Channel ID verificat**: `UCMV6BZET4_LpJlUOaBj-QWw`
- **Cum s-a stabilit proveniența**: radiorenasterea.ro se autodefinește ca
  „instrument de misiune a Arhiepiscopiei Vadului, Feleacului și Clujului”
  și este listat în website-ul oficial al Mitropoliei Clujului
  (mitropolia-clujului.ro). Canalul YouTube are numele oficial
  „Radio Renasterea”.
- **Enabled**: DA
- **Detecție dinamică**: ACTIVĂ (YouTube Data API)
- **Plan de redare**: YOUTUBE
- **Evidență program verificată**: site-ul oficial declară că Sfânta
  Liturghie de duminică din Catedrala Mitropolitană este transmisă în
  direct în fiecare duminică și sărbătoare.

---

## Siguranță

- Toate URL-urile din registru sunt **HTTPS** și pe **allowlist explicit**
  (`ALLOWED_DOMAINS` din `src/live/live-services.ts`).
- Deschiderea folosește `openBrowserAsync` (expo-web-browser) după validare
  strictă — doar HTTPS + domeniu aprobat. URL-urile malformate sau
  neaprobate eșuează sigur, fără eroră tehnică pentru utilizator.
- Nu există înregistrări permanente cu `youtube.com/watch?v=...`.

## Backend — Edge Function `live-services-status` (LIVE-B)

### Endpoint

- `GET .../functions/v1/live-services-status` — statusuri sanitizate pentru
  toate sursele ENABLED cu Channel ID verificat.
- `GET .../functions/v1/live-services-status?id=<sourceId>` — o singură sursă
  cunoscută (ID canonic; se resping alte ID-uri cu 400).
- `OPTIONS` — doar pentru CORS.
- Alte metode → `405`.

Clientul **nu poate trimite** `channelId` sau `videoId`: canalul este rezolvat
**server-side** din registrul canonic `supabase/functions/live-services-status/sources.ts`.
Sursa server este legată de registrul client (`src/live/live-services.ts`) printr-un
**test de drift strict** (`tests/drift.test.mjs` — ID-uri, Channel ID, enabled).

### Detecție curentă live — scara de descoperire (3 trepte)

Măsurat pe 10.10.2026 (TRINITAS TV, `UCcqFHIDYfKsaJ5KXZjzW7ZQ`): `search.list`
cu `eventType=live` întoarce **zero** rezultate pentru un canal care are un
stream **permanent 24/7** în direct, iar streamul respectiv **nu** apare nici în
primele uploaduri (a fost urcat demult). De aceea descoperirea are trei trepte,
încercate în ordine; LIVE de la orice treaptă câștigă.

1. **Pagina publică a canalului** — `channel-live-page.ts` cere
   `GET https://www.youtube.com/channel/<Channel ID>/live` și extrage **lista
   ordonată de candidați** (până la `MAX_CANDIDATES = 24` id-uri unice, din
   `"videoId":"..."` plus canonical / `og:url`). Canalul cerut vine **doar** din
   registrul canonic server-side; ID-urile necanonice nu se cer. Textul paginii
   nu se stochează.
   Măsurat pe 10.10.2026 (edge, TRINITAS TV): `/live` **nu** redirectează — YouTube
   randează pagina de watch chiar la acel URL, deci URL-ul final nu e o sursă de
   id; iar de pe edge pagina vine **degradată** (canonical `"undefined"`, fără
   `og:url`, `<title>` gol), cu ordinea candidaților **instabilă** de la o cerere
   la alta (id-ul real a ieșit când pe poziția 0, când pe 1). De aceea nu se alege
   un id după poziție sau după o singură regulă: **toți candidații sunt verificați
   într-un singur apel batch** `videos.list?id=<a,b,c…>` (1 unitate de cotă pentru
   toată lista, față de 100 la `search.list`).
   - `live` **doar** dacă `snippet.liveBroadcastContent === "live"`;
   - `embeddable` din `status.embeddable`, titlu din `snippet.title`,
     `liveStartedAt` din `liveStreamingDetails.actualStartTime` (**opțional** —
     un stream permanent poate să nu raporteze `actualStartTime`);
   - se respinge un candidat cu **Channel ID diferit** (ex. o recomandare
     ridicată din pagină — măsurat: un astfel de candidat chiar era live, pe alt
     canal, și a fost respins corect).
   O eroare a paginii nu decide verdictul (se trece la treapta 2); o eroare
   `videos.list` la verificarea indiciului → **UNKNOWN**, fără a mai cheltui
   cotă pe treptele următoare.
2. **`search.list`** — `part=snippet`, `channelId=<Channel ID verificat>`,
   `eventType=live`, `type=video`, `maxResults=5`, apoi `videos.list`
   (`part=snippet,liveStreamingDetails,status`) pentru fiecare candidat: se
   respinge orice candidat cu Channel ID diferit, cu `actualEndTime` sau fără
   `liveStreamingDetails`.
3. **Uploaduri** — `channels.list` (`contentDetails` → playlistul `UU…`), apoi
   `playlistItems.list` (`part=contentDetails`, `maxResults=3`); fiecare id este
   verificat ca mai sus. Treapta asta costă 2 unități + 1 per candidat, dar
   **nu** prinde streamurile permanente (de aceea e ultima).

Verdictul final: LIVE doar după confirmare oficială proaspătă. `NOT_LIVE` doar
dacă **toate** treptele au răspuns valid și niciuna nu a găsit un live. Dacă o
treaptă nu a putut răspunde (eroare API/cheie, răspuns malformat, candidat
neverificabil) → **UNKNOWN**.

### Model cu trei stări

- **LIVE** — confirmare proaspătă API oficială (canal + video verificate).
- **NOT_LIVE** — căutare oficială validă cu zero live-uri curente.
- **UNKNOWN** — cheie absentă, timeout, eroare rețea, quota epuizată, răspuns
  malformat, cache stale indisponibilă, eroare server. UNKNOWN **nu devine
  niciodată** NOT_LIVE.

### Cache și cotă (protection)

Tabel local `public.live_service_status_cache` (migrare
`20260902100000_add_live_service_status_cache.sql`):

- `source_id` PK, `status`, `current_video_id`, `current_title`,
  `current_channel_id`, `embeddable`, `checked_at`, `live_started_at`,
  `next_refresh_at`, `refresh_lease_until`, `updated_at`.
- **RLS deny**: anon/authenticated nu pot INSERT/UPDATE/DELETE/SELECT din
  cache. Doar Edge Function (service role) scrie.
- Nu se stochează payload-uri Google brute, nici secrete.
- Un `videoId` curent tranzitoriu **nu se scrie niciodată** înapoi în
  `sources.ts` / registrul permanent.

Constante centralizate (`status.ts`):

| Constantă | Valoare | Semnificație |
|---|---|---|
| `DISCOVERY_REFRESH_MS` | ~90 min | re-căutare descoperire pentru surse fără live cunoscut |
| `LIVE_REVALIDATE_MS` | ~5 min | re-verificare `videos.list` pentru un live cunoscut |
| `LEASE_MS` | ~60 s | durată lease single-flight |
| `STALE_LIVE_REUSE_MS` | ~5 min | reutilizare LIVE cache recent în timpul refresh |
| `UNKNOWN_RETRY_MS` | ~5 min | reîncercare când verdictul **nu** e un verdict (eroare API/cheie, răspuns malformat) |
| `UPLOAD_CANDIDATE_LIMIT` | 3 | câte uploaduri verifică ultima treaptă |

**De ce `UNKNOWN_RETRY_MS`**: `unknown` însemna un singur lucru pe disc — „nu am
putut întreba API-ul” (cheie lipsă, eroare, răspuns malformat). Cache-uit pe
intervalul de descoperire (90 min) a produs chiar bug-ul din 10.10.2026: după ce
secretul `YOUTUBE_DATA_API_KEY` a fost setat în Supabase, funcția a răspuns în
continuare `unknown` pentru toate sursele, din rândurile vechi. Acum un `unknown`
se reîncearcă în ~5 minute; `not_live` rămâne pe 90 de minute, pentru că acela
este un răspuns real, nu o eroare.

**Single-flight / lease**: înainte de a apela YouTube, funcția revendică
atomistic `refresh_lease_until` (UPDATE condiționat). Alți apelanți concurenți
reutilizează cache-ul proaspăt, cache-ul LIVE aceptabil sau revin cu UNKNOWN.
Nu se generează căutări duplicate pentru o herghelie de utilizatori.

### Răspuns sanitizat

```json
{
  "sources": [
    {
      "sourceId": "trinitas-tv",
      "status": "live",
      "checkedAt": "2026-09-02T10:00:00.000Z",
      "currentBroadcast": {
        "videoId": "...",
        "title": "...",
        "embeddable": true,
        "liveStartedAt": "..."
      }
    }
  ]
}
```

Nu se întorc niciodată: cheia API YouTube, service role key, payload-uri brute
Google, stack traces, date personale.

### Secret viitor (extern, NU în code)

- `YOUTUBE_DATA_API_KEY` — se adaugă doar în Supabase → Edge Functions →
  Secrets (nu în Git, nu în răspunsuri). SERVER-SIDE ONLY: `.env.example`
  conține doar placeholder-ul `YOUTUBE_DATA_API_KEY=` pentru documentare,
  NU trebuie folosit prefixul `EXPO_PUBLIC_` și NU se expune în codul client
  React Native. Când lipsește asociat în Supabase, funcția nu crapă și
  întoarce UNKNOWN sanitizat; adăugarea secretului NU necesită rescriere de cod.

### Pași viitori (externi)

1. Aplică migrarea `20260902100000_add_live_service_status_cache.sql`
   (local întâi; live numai după review).
2. Adaugă secretul real `YOUTUBE_DATA_API_KEY` în Supabase.
3. Deploy: `supabase functions deploy live-services-status`.

## Fișiere

| Fișier | Rol |
|---|---|
| `src/live/types.ts` | Tipuri `PermanentLiveSource`, `CurrentLiveBroadcast`, `LiveStatus` |
| `src/live/live-services.ts` | Registrul canonic al surselor + allowlist domenii |
| `src/live/live-service-access.ts` | Validare URL și deschidere sigură |
| `src/app/live.tsx` | Ecran dedicat „Slujbe LIVE” |
| `tests/live-services.test.mjs` | Teste focalizate LIVE-A |
| `tests/live-services-c.test.mjs` | Teste analiză statică LIVE-C (24 verificări) |
| `src/live/live-status-client.ts` | Client fetch Edge Function (live-services-status) + validare răspuns |
| `src/live/live-playback.ts` | Decizie playback (EMBED/EXTERNAL_CURRENT/OFFICIAL_SOURCE) + URL YouTube |
| `src/live/youtube-embed.tsx` | Barrel/TS-resolve stub (re-exportă .native pentru TypeScript) |
| `src/live/youtube-embed.native.tsx` | Player YouTube WebView (React Native) \u2014 overlay full-screen randat ca frate al `<Screen>`, **NU** \u00eentr-un `<Modal>` (pe iOS un WKWebView \u00eentr-un modal `pageSheet` r\u0103m\u00e2nea negru, 10.10.2026); se \u00eenchide cu butonul propriu, plus `BackHandler` pe Android. Build 15: WebView direct cu HTML propriu (f\u0103r\u0103 libr\u0103ria de iframe), `baseUrl` \u0219i `origin=` = `https://ortodoxia.web.app` (EROAREA 153 = YouTube refuz\u0103 embed-ul f\u0103r\u0103 un referer valid), f\u0103r\u0103 `mute=1`/`autoplay=1` (sunet), f\u0103r\u0103 comutare automat\u0103 pe browser |
| `src/live/youtube-embed.web.tsx` | Player YouTube iframe fallback (web) |
| `supabase/functions/live-services-status/index.ts` | Edge Function entry (GET/OPTIONS, wiring) |
| `supabase/functions/live-services-status/sources.ts` | Registru server canonic (legat de LIVE-A prin test de drift) |
| `supabase/functions/live-services-status/youtube.ts` | Client YouTube Data API (search.list + videos.list + uploads) |
| `supabase/functions/live-services-status/channel-live-page.ts` | Resolver pentru streamurile permanente 24/7: pagina publică `/channel/<id>/live` → **listă ordonată de candidați** (verificați obligatoriu, în batch, cu `videos.list`) |
| `supabase/functions/live-services-status/status.ts` | Motor de status LIVE/NOT_LIVE/UNKNOWN + scara de descoperire + intervale + lease |
| `supabase/functions/live-services-status/tests/live-status.test.mjs` | Teste mock live-status (fără YouTube real) |
| `supabase/functions/live-services-status/tests/channel-live-page.test.mjs` | Teste resolver 24/7 + scara de descoperire + cache `unknown` (fetch simulat, fără rețea) |
| `supabase/functions/live-services-status/tests/drift.test.mjs` | Teste drift registru + migrare + securitate |
| `supabase/migrations/20260902100000_add_live_service_status_cache.sql` | Cache persistent (RLS deny client) |
| `supabase/config.toml` | Înregistrare funcție `live-services-status` |
