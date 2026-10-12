-- Verificare LIVE pentru A3-01 (drepturi de tabel) — se rulează pe baza de date
-- (nu are nevoie de psql: e format din 4 instrucțiuni, ultima întoarce raportul).
--
--   psql "$DATABASE_URL" -f supabase/tests/database/table_privileges_verify.sql
--
-- Ce verifică:
--   1. Pe cele 15 tabele scrise EXCLUSIV de server: `anon` și `authenticated` NU au
--      INSERT/UPDATE/DELETE (migrația 20261012000100), dar AU în continuare SELECT.
--   2. Pe cele 7 tabele scrise de client (determinate prin scanarea `src/**`):
--      operațiile pe care aplicația le folosește sunt NEATINSE.
--   3. `service_role` păstrează INSERT/UPDATE/DELETE pe toate cele 22 (funcțiile Edge
--      scriu cu cheia de serviciu).
--
-- Orice nepotrivire -> `raise exception` (fișierul cade) ȘI rândul respectiv apare cu
-- `ok = false` în raportul final.

create temp table a3_priv_expectations (
  table_name text,
  privilege  text,
  role_name  text,
  expected   boolean
) on commit drop;

insert into a3_priv_expectations (table_name, privilege, role_name, expected)
with revoked(t) as (
  values
    ('ai_client_usage_daily'),
    ('ai_usage_monthly'),
    ('bible_verses'),
    ('calendar_day_translations'),
    ('calendar_days'),
    ('chat_messages'),
    ('daily_content'),
    ('guest_usage_daily'),
    ('live_service_status_cache'),
    ('notification_deliveries'),
    ('notification_device_claims'),
    ('notification_messages'),
    ('prayers'),
    ('subscriptions'),
    ('usage_daily')
),
-- Tabelele scrise de client + operația pe care aplicația o folosește (din `src/**`).
kept(t, op) as (
  values
    ('ai_reports', 'INSERT'),
    ('chat_threads', 'DELETE'),
    ('favorites', 'INSERT'),
    ('favorites', 'DELETE'),
    ('notification_devices', 'UPDATE'),
    ('notification_preferences', 'INSERT'),
    ('notification_preferences', 'UPDATE'),
    ('profiles', 'UPDATE'),
    ('verse_favorites', 'INSERT'),
    ('verse_favorites', 'DELETE')
),
all_tables(t) as (
  select t from revoked union select t from kept
),
roles(r) as (
  values ('anon'), ('authenticated')
)
-- 1) scrierile clientului sunt scoase pe tabelele server-only
select r.t, p.priv, rl.r, false
  from revoked r
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
  cross join roles rl(r)
union all
-- 2) citirea rămâne acordată pe tabelele server-only
select r.t, 'SELECT', rl.r, true
  from revoked r
  cross join roles rl(r)
union all
-- 3) tabelele scrise de client: matricea completă măsurată ÎNAINTE de migrație
--    (writers-before.txt, 22 rânduri) rămâne identică. `ai_reports` e singura
--    excepție: `anon` nu a avut niciodată drepturi acolo, iar `authenticated` are
--    doar SELECT + INSERT (aplicația doar inserează rapoarte, src/app/(tabs)/chat.tsx).
select k.t,
       p.priv,
       rl.r,
       case
         when k.t = 'ai_reports' and rl.r = 'anon' then false
         when k.t = 'ai_reports' and p.priv in ('UPDATE', 'DELETE') then false
         else true
       end
  from (select distinct t from kept) k
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
  cross join roles rl(r)
union all
-- 5) service_role păstrează scrierea pe toate tabelele
select a.t, p.priv, 'service_role', true
  from all_tables a
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv);

do $$
declare
  v_bad text;
begin
  select string_agg(
           format('%s: %s %s = %s (aşteptat %s)',
                  e.table_name, e.role_name, e.privilege,
                  has_table_privilege(e.role_name, 'public.' || e.table_name, e.privilege),
                  e.expected),
           ' | ' order by e.table_name, e.role_name, e.privilege)
    into v_bad
    from a3_priv_expectations e
   where has_table_privilege(e.role_name, 'public.' || e.table_name, e.privilege)
         is distinct from e.expected;

  if v_bad is not null then
    raise exception 'A3-01 TABLE_PRIVILEGES_VERIFY FAILED: %', v_bad;
  end if;
end
$$;

select e.table_name,
       e.role_name,
       e.privilege,
       e.expected as expected,
       has_table_privilege(e.role_name, 'public.' || e.table_name, e.privilege) as actual,
       (has_table_privilege(e.role_name, 'public.' || e.table_name, e.privilege)
        is not distinct from e.expected) as ok
  from a3_priv_expectations e
 order by e.table_name, e.role_name, e.privilege;
