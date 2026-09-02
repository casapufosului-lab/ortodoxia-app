-- Verificare locală a configurației RLS pentru public.subscriptions.
--
-- Rulează pe baza de date (locală sau de test), fără efecte secundare
-- (doar citiri din catalog PostgreSQL + RAISE EXCEPTION dacă ceva e greșit):
--   psql "$DATABASE_URL" -f supabase/tests/database/subscriptions_rls_verify.sql
--
-- Ce verifică:
--   1. RLS activ pe public.subscriptions și tabelul NU este FORCE RLS
--      (service_role scrie prin BYPASSRLS din Edge Functions, deci nu trebuie
--      să fie blocat de FORCE RLS).
--   2. Există exact politica de SELECT „doar rândul propriu"
--      (subscriptions_select_own, authenticated, auth.uid() = user_id).
--   3. INSERT/UPDATE/DELETE sunt imposibile pentru authenticated și anon:
--      singurele politici de scriere sunt cele de tip „block" cu expresii false,
--      iar nicio politică permisivă suplimentară nu acoperă anon/authenticated.
--   4. service_role nu se bazează pe politici RLS și are privilegiile
--      (INSERT/UPDATE/DELETE) necesare pe tabel pentru webhook-ul RevenueCat.

do $$
declare
  rls_enabled         boolean;
  rls_forced          boolean;
  total_policies      integer;
  select_own_ok       boolean;
  write_blocked_ok    boolean;
  anon_write_ok       boolean;
  service_role_acl_ok boolean;
begin
  -- 1) RLS activ, fără FORCE.
  select c.relrowsecurity, c.relforcerowsecurity
    into rls_enabled, rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'subscriptions';

  if rls_enabled is null then
    raise exception '[1] public.subscriptions nu există';
  end if;
  if not rls_enabled then
    raise exception '[1] RLS este dezactivat pe public.subscriptions';
  end if;
  if rls_forced then
    raise exception '[1] FORCE RLS este activ: blochează și service_role (BYPASSRLS), deci Edge Function revenuecat-webhook nu ar mai putea scrie';
  end if;

  -- 2) Inventar de politici: exact 4, nimic în plus/în minus.
  select count(*) into total_policies
    from pg_policies
   where schemaname = 'public' and tablename = 'subscriptions';
  if total_policies <> 4 then
    raise exception '[2] pe public.subscriptions trebuie să existe exact 4 politici; există %', total_policies;
  end if;

  -- SELECT doar rândul propriu.
  select_own_ok := (
    select count(*) = 1
      from pg_policies
     where schemaname = 'public' and tablename = 'subscriptions'
       and cmd = 'SELECT'
       and permissive
       and 'authenticated' = any(roles)
       and policyname = 'subscriptions_select_own'
       and qual is not null
       and qual like '%auth.uid()%'
  );
  if not select_own_ok then
    raise exception '[2] politica de SELECT propriu lipsește sau e greșită (așteptat subscriptions_select_own cu auth.uid() = user_id)';
  end if;

  -- 3) Scriere client imposibilă.
  --    Permis doar dacă singurele politici de scriere care ating authenticated/anon
  --    sunt exact cele „block" cu expresii false:
  --      INSERT  -> with check (false)
  --      UPDATE  -> using (false) with check (false)
  --      DELETE  -> using (false)
  --    Orice altă politică permisivă de scriere -> ESEC.
  write_blocked_ok := (
    not exists (
      select 1
        from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'subscriptions'
         and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
         and p.permissive
         and ('authenticated' = any(p.roles) or 'anon' = any(p.roles))
         and not (
              (p.policyname = 'subscriptions_block_insert_authenticated'
               and p.cmd = 'INSERT'
               and p.qual is null
               and p.with_check::text = 'false')
              or
              (p.policyname = 'subscriptions_block_update_authenticated'
               and p.cmd = 'UPDATE'
               and p.qual::text = 'false'
               and p.with_check::text = 'false')
              or
              (p.policyname = 'subscriptions_block_delete_authenticated'
               and p.cmd = 'DELETE'
               and p.qual::text = 'false'
               and p.with_check is null)
         )
    )
    and (
      select count(*)
        from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'subscriptions'
         and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
         and 'authenticated' = any(p.roles)
    ) = 3
  );
  if not write_blocked_ok then
    raise exception '[3] există politici de scriere neașteptate sau politicile block au fost modificate pe public.subscriptions (authenticated)';
  end if;

  anon_write_ok := not exists (
    select 1
      from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'subscriptions'
       and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
       and 'anon' = any(p.roles)
  );
  if not anon_write_ok then
    raise exception '[3] anon are politici de scriere pe public.subscriptions';
  end if;

  -- 4) service_role: fără politici RLS (folosește BYPASSRLS) + privilegii de tabel.
  if exists (
    select 1
      from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'subscriptions'
       and 'service_role' = any(p.roles)
  ) then
    raise exception '[4] service_role nu trebuie să aibă politici RLS; accesul lui vine din BYPASSRLS';
  end if;

  service_role_acl_ok := (
        exists (
          select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            cross join lateral aclexplode(c.relacl) a
            left join pg_roles r on r.oid = a.grantee
           where n.nspname = 'public' and c.relname = 'subscriptions'
             and a.privilege_type = 'INSERT'
             and (r.rolname = 'service_role' or a.grantee = 0)
        )
    and exists (
          select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            cross join lateral aclexplode(c.relacl) a
            left join pg_roles r on r.oid = a.grantee
           where n.nspname = 'public' and c.relname = 'subscriptions'
             and a.privilege_type = 'UPDATE'
             and (r.rolname = 'service_role' or a.grantee = 0)
        )
    and exists (
          select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            cross join lateral aclexplode(c.relacl) a
            left join pg_roles r on r.oid = a.grantee
           where n.nspname = 'public' and c.relname = 'subscriptions'
             and a.privilege_type = 'DELETE'
             and (r.rolname = 'service_role' or a.grantee = 0)
        )
  );
  if not service_role_acl_ok then
    raise exception '[4] service_role nu are INSERT/UPDATE/DELETE pe public.subscriptions';
  end if;

  raise notice 'SUBSCRIPTIONS_RLS_VERIFY_OK (RLS activ, nu FORCE; SELECT propriu ok; scrieri client blocate; service_role ok)';
end
$$;