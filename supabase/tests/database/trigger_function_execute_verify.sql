-- Verificare LIVE pentru A3-03 (EXECUTE pe funcțiile de trigger) — se rulează pe baza
-- de date; ultima instrucțiune întoarce raportul.
--
--   psql "$DATABASE_URL" -f supabase/tests/database/trigger_function_execute_verify.sql
--
-- Ce verifică:
--   1. `anon` și `authenticated` NU mai au EXECUTE pe public.handle_new_user() și
--      public.rls_auto_enable() (migrația 20261012000200), nici direct, nici prin PUBLIC.
--   2. Rolurile care chiar au nevoie păstrează EXECUTE: `supabase_auth_admin`
--      (GoTrue creează conturi), `postgres`, `supabase_admin`, `service_role`.
--   3. Trigger-ul și event-trigger-ul sunt NEATINSE: același nume, aceeași funcție,
--      același tabel, `enabled`, SECURITY DEFINER cu search_path fixat.

create temp table a3_fn_expectations (
  fn_signature text,
  role_name    text,
  expected     boolean
) on commit drop;

insert into a3_fn_expectations (fn_signature, role_name, expected)
values
  ('public.handle_new_user()', 'anon',                false),
  ('public.handle_new_user()', 'authenticated',       false),
  ('public.handle_new_user()', 'postgres',            true),
  ('public.handle_new_user()', 'supabase_admin',      true),
  ('public.handle_new_user()', 'supabase_auth_admin', true),
  ('public.handle_new_user()', 'service_role',        true),
  ('public.rls_auto_enable()', 'anon',                false),
  ('public.rls_auto_enable()', 'authenticated',       false),
  ('public.rls_auto_enable()', 'postgres',            true),
  ('public.rls_auto_enable()', 'supabase_admin',       true),
  ('public.rls_auto_enable()', 'service_role',        true);

do $$
declare
  v_bad        text;
  v_public_x   text;
  v_trig_count integer;
  v_evt_count  integer;
begin
  -- 1) + 2) privilegii pe funcții
  select string_agg(
           format('%s %s = %s (aşteptat %s)',
                  e.fn_signature, e.role_name,
                  has_function_privilege(e.role_name, e.fn_signature, 'EXECUTE'),
                  e.expected),
           ' | ' order by e.fn_signature, e.role_name)
    into v_bad
    from a3_fn_expectations e
   where has_function_privilege(e.role_name, e.fn_signature, 'EXECUTE')
         is distinct from e.expected;

  if v_bad is not null then
    raise exception 'A3-03 TRIGGER_FUNCTION_EXECUTE_VERIFY FAILED (privilegii): %', v_bad;
  end if;

  -- 3) nicio urmă de grant PUBLIC (grantee = 0) nu mai rămâne
  select string_agg(format('%s -> PUBLIC', p.proname), ', ' order by p.proname)
    into v_public_x
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
   where n.nspname = 'public'
     and p.proname in ('handle_new_user', 'rls_auto_enable')
     and a.grantee = 0
     and a.privilege_type = 'EXECUTE';

  if v_public_x is not null then
    raise exception 'A3-03 FAILED: EXECUTE încă acordat lui PUBLIC pe %', v_public_x;
  end if;

  -- 4) trigger-ul de pe auth.users e neatins
  select count(*) into v_trig_count
    from pg_trigger t
   where t.tgfoid = 'public.handle_new_user()'::regprocedure
     and t.tgname = 'on_auth_user_created'
     and t.tgrelid = 'auth.users'::regclass
     and t.tgenabled = 'O'
     and t.tgisinternal = false
     and pg_get_triggerdef(t.oid) like '%AFTER INSERT ON auth.users%';

  if v_trig_count <> 1 then
    raise exception 'A3-03 FAILED: trigger-ul on_auth_user_created pe auth.users nu mai e exact cel de dinainte (% potriviri)', v_trig_count;
  end if;

  -- 5) event-trigger-ul `ensure_rls` e neatins
  select count(*) into v_evt_count
    from pg_event_trigger e
   where e.evtname = 'ensure_rls'
     and e.evtevent = 'ddl_command_end'
     and e.evtenabled = 'O'
     and e.evtfoid = 'public.rls_auto_enable()'::regprocedure
     and e.evtowner = 'postgres'::regrole;

  if v_evt_count <> 1 then
    raise exception 'A3-03 FAILED: event-trigger-ul ensure_rls nu mai e exact cel de dinainte (% potriviri)', v_evt_count;
  end if;

  -- 6) funcțiile rămân SECURITY DEFINER cu search_path fixat
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('handle_new_user', 'rls_auto_enable')
       and (p.prosecdef is not true
            or not exists (
                 select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c
                  where c like 'search_path=%'
               ))
  ) then
    raise exception 'A3-03 FAILED: o funcție nu mai e SECURITY DEFINER cu search_path fixat';
  end if;
end
$$;

select e.fn_signature,
       e.role_name,
       e.expected as expected,
       has_function_privilege(e.role_name, e.fn_signature, 'EXECUTE') as actual,
       (has_function_privilege(e.role_name, e.fn_signature, 'EXECUTE')
        is not distinct from e.expected) as ok
  from a3_fn_expectations e
 order by e.fn_signature, e.role_name;
