# Slujbe LIVE — Surse și servicii

> Stare: **LIVE-B** — backend de detecție dinamică finalizat local (Edge Function
> `live-services-status` + cache persistent). LIVE-A (registru permanent + UI)
> este complet. LIVE-C conectează UI-ul la backend.

## Principii

- Ortodoxia **nu este broadcasterul**. Nu descărcăm, nu rehostăm, nu
  proxynam și nu restreamăm transmisiunile. Deschidem doar pagina/sursa
  oficială a providerului.
- Registrul surselor este **canonic și permanent** în
  `src/live/live-services.ts`. UI-ul nu conține URL-uri împrăștiate.
- Sursele permanente **nu conțin niciodată** un `videoId` curent ca
  configurație permanentă. Un `videoId` de o singură emisiune aparține doar
  unui obiect tranzitoriu `CurrentLiveBroadcast` (LIVE-B).
- Detecția dinamică folosește **doar YouTube Data API v3** (oficial,
  `search.list` + `videos.list`). Nicio răzuire HTML, niciun endpoint
  intern/documentat greșit, niciun serviciu terț de scraping.

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

### Detecție curentă live (YouTube Data API v3)

1. `search.list` — `part=snippet`, `channelId=<Channel ID verificat>`,
   `eventType=live`, `type=video`, `maxResults=5` (căutare de descoperire).
2. `videos.list` — `part=snippet,liveStreamingDetails,status` pentru fiecare
   candidat (verificare): se respinge orice candidat cu **Channel ID diferit**,
   cu `actualEndTime` (emisiune încheiată) sau fără `liveStreamingDetails`.
3. LIVE doar după confirmare oficială proaspătă. `NOT_LIVE` doar după o
   căutare oficială validă fără candidat live.

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
  Secrets (nu în `.env` Expo, nu în Git, nu în răspunsuri). Când lipsește,
  funcția nu crapă și întoarce UNKNOWN sanitizat; adăugarea secretului NU
  necesită rescriere de cod.

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
| `supabase/functions/live-services-status/index.ts` | Edge Function entry (GET/OPTIONS, wiring) |
| `supabase/functions/live-services-status/sources.ts` | Registru server canonic (legat de LIVE-A prin test de drift) |
| `supabase/functions/live-services-status/youtube.ts` | Client YouTube Data API (search.list + videos.list) |
| `supabase/functions/live-services-status/status.ts` | Motor de status LIVE/NOT_LIVE/UNKNOWN + intervale + lease |
| `supabase/functions/live-services-status/tests/live-status.test.mjs` | Teste mock live-status (fără YouTube real) |
| `supabase/functions/live-services-status/tests/drift.test.mjs` | Teste drift registru + migrare + securitate |
| `supabase/migrations/20260902100000_add_live_service_status_cache.sql` | Cache persistent (RLS deny client) |
| `supabase/config.toml` | Înregistrare funcție `live-services-status` |
