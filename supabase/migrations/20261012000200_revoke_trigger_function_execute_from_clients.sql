-- ============================================================================
--  A3-03 — retragerea EXECUTE de pe funcțiile de trigger, pentru clienți.
--  Data: 2026-10-12. Autor: worker `cod`. Aplicată în baza LIVE în aceeași zi.
-- ============================================================================
--
--  CE E GREȘIT AZI
--  În Supabase, `anon` și `authenticated` primesc EXECUTE prin `PUBLIC` pe orice
--  funcție nou-creată în `public`. Regula din 08.10.2026 (v. tests/rpc-execute-grants.test.mjs)
--  spune că `revoke ... from public` NU e suficient: trebuie numite explicit și
--  `anon` / `authenticated`. Aici e cazul funcțiilor care NU trebuie chemate de
--  niciun client, direct prin PostgREST:
--
--    * public.handle_new_user()   — trigger AFTER INSERT pe auth.users, SECURITY DEFINER;
--                                   scrie în public.profiles pentru fiecare cont nou.
--    * public.rls_auto_enable()   — funcție de EVENT TRIGGER (`ensure_rls`, ddl_command_end),
--                                   SECURITY DEFINER; porneşte RLS pe tabelele noi din `public`.
--
--  Dovada înainte de această migrație: ambele apăreau în
--  `POST /rest/v1/rpc/<nume>` ca apelabile cu cheia publicabilă.
--
--  DE CE NU SE RUPE NIMIC
--    * Funcțiile de trigger/event-trigger sunt chemate de SERVERUL PostgreSQL, iar
--      EXECUTE se verifică la crearea trigger-ului, nu la fiecare declanșare. Cine
--      declanșează trigger-ul nu are nevoie de privilegiu pe funcție.
--    * `handle_new_user`: `supabase_auth_admin` (rolul cu care scrie GoTrue în
--      auth.users) primește EXECUTE explicit mai jos. Fără asta, un cont nou ar putea
--      fi refuzat. Din același motiv: `postgres`, `supabase_admin`, `service_role`.
--      `anon`/`authenticated` NU au nevoie: ei nu creează rânduri în auth.users.
--    * `rls_auto_enable`: DDL-ul pe acest proiect rulează ca `postgres` (SQL editor,
--      Management API, migrații) sau `supabase_admin`; ambele primesc EXECUTE mai jos.
--    * Trigger-ul rămâne definit exact ca înainte: acest fișier nu atinge
--      `pg_trigger` / `pg_event_trigger`, doar `pg_proc.proacl`.
--
--  IDEMPOTENT: un REVOKE pe un privilegiu neacordat nu face nimic și nu dă eroare.

-- ── handle_new_user (trigger AFTER INSERT pe auth.users) ────────────────────────
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to postgres, supabase_admin, supabase_auth_admin, service_role;

-- ── rls_auto_enable (funcția event-trigger-ului `ensure_rls`) ───────────────────
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to postgres, supabase_admin, service_role;
