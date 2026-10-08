# Configurare Supabase

1. Creează un proiect Supabase.
2. Deschide SQL Editor în dashboard.
3. Rulează fișierele din `migrations` în ordinea numelui lor.
4. Copiază `.env.example` în `.env`.
5. Completează URL-ul proiectului și cheia publicabilă din Project Settings, API Keys.

Nu folosi cheia `service_role` și nu o introduce în aplicație.

## Chat AI

- Codul funcției este în `functions/orthodox-chat/index.ts`.
- Vizitatorii primesc 5 întrebări gratuite pe zi fără cont, iar utilizatorii autentificați au 5 mesaje pe zi pentru planul gratuit sau 50 pentru Premium.
- Migrarea `20260831000100_add_guest_ai_usage.sql` trebuie rulată după celelalte migrări pentru contorizarea întrebărilor anonime.
- Secretul `OPENAI_API_KEY` se adaugă numai în Supabase, Edge Functions, Secrets.
- Cheia OpenAI nu se adaugă în `.env`-ul aplicației Expo.
- Modelul configurat pentru MVP este `gpt-5.4-mini` prin Responses API.

## Premium

- Starea abonamentului este păstrată în tabela `subscriptions`.
- Utilizatorul poate citi numai propriul abonament.
- Aplicația nu poate activa singură Premium. Scrierea în tabelă rămâne rezervată sistemului de plăți de pe server.
- Plățile Apple și Google nu sunt încă conectate.

## Slujbe LIVE

- Codul funcției este în `functions/live-services-status/` (entry `index.ts`).
- Sursele și Channel ID-urile canonicale server-side sunt în
  `functions/live-services-status/sources.ts`, sincronizate cu registrul client
  (`src/live/live-services.ts`) printr-un test de drift.
- Secretul `YOUTUBE_DATA_API_KEY` se adaugă numai în Supabase, Edge Functions,
  Secrets. Nu se adaugă în `.env`-ul aplicației Expo și nu se expune clientului.
- Migrarea `migrations/20260902100000_add_live_service_status_cache.sql` creează
  tabela `live_service_status_cache` cu RLS deny pentru clienți (scrie doar
  service role). Se aplică local până la deploy; nu este aplicată live.
- Teste mock: `npm run test:live-backend` (nu apelează YouTube real).

## Funcții RPC care lucrează pe date de utilizator

În Supabase, `revoke execute on function … from public` **nu** scoate privilegiile rolurilor
`anon` și `authenticated` — ele primesc EXECUTE prin `PUBLIC`, iar revocarea de la `PUBLIC` nu le
atinge. Măsurat pe proiectul live (08.10.2026): `POST /rest/v1/rpc/purge_guest_chat_history` cu cheia
publicabilă răspundea **200** (orice client anonim putea porni ștergerea); după
`revoke execute … from anon, authenticated` răspunde **401 permission denied for function**. ACL-ul
corect este cel de la `reserve_ai_request` / `sync_revenuecat_subscription`:
`postgres=X/postgres, service_role=X/postgres`.

Regulă: orice funcție nouă `security definer` care citește/scrie date de utilizator (sau care
pornește o operație distructivă) primește în **aceeași migrare**:

```sql
revoke all on function public.<nume>(<semnătura>) from public, anon, authenticated;
grant execute on function public.<nume>(<semnătura>) to service_role;
```

La funcțiile `security definer` RLS este ocolit (regulile se aplică în numele definer-ului), deci
GRANT-ul/REVOKE-ul este singura barieră. Proba rapidă, în SQL Editor:

```sql
select p.proname, p.prosecdef, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;
```

Cele 11 migrări anterioare datei de 08.10.2026 nu conțin niciun `revoke` (15 definiții
`security definer`) — sunt înghețate ca atare de `tests/rpc-execute-grants.test.mjs`, care pică dacă
apare o funcție nouă fără revoke. Nu slăbi testul: scrie revoke-ul în migrarea nouă.

## Verificare minimă

- toate cele nouă tabele există în schema `public`;
- Row Level Security este activ pe fiecare tabel;
- la crearea unui utilizator apare automat profilul cu același identificator;
- un utilizator autentificat nu poate citi profilul, favoritele sau conversațiile altui utilizator;
- utilizatorii neautentificați pot citi numai conținutul publicat.
