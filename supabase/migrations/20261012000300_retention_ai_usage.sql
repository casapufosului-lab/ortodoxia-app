-- ============================================================================
--  A3-06 (12.10.2026) — retenția contoarelor de consum AI
-- ============================================================================
--
--  CE LIPSEA: `purge_guest_chat_history` (migrația 20261008000300) curăța istoricul de chat,
--  jurnalul de dispozitiv și contoarele de oaspete — dar NU contoarele de consum AI.
--  `ai_client_usage_daily` (un rând per client_hash + zi) și `ai_usage_monthly` (contorul
--  lunar global) cresc la nesfârșit: rândurile vechi nu mai sunt citite de nimeni (cota se
--  calculează pe ziua curentă, respectiv pe luna curentă), dar rămân în bază pe veci.
--
--  CE FACE: rescrie ACEAȘI funcție (semnătură identică, deci programarea din
--  `supabase/cron/schedule-retention-purge.sql` rămâne validă) și adaugă două ștergeri:
--
--    31 zile   — `ai_client_usage_daily` mai vechi de `p_usage_days` (aceeași fereastră ca
--                `guest_usage_daily`: contorul de cotă zilnică nu are nevoie de istoric);
--    12 luni   — `ai_usage_monthly` cu `period_start` mai vechi de 12 luni. Contorul lunar
--                global se citește DOAR pentru luna curentă, deci nu se atinge nimic din ce
--                folosește limita; rămâne un an de istoric pentru orice comparație.
--
--  Ce NU se schimbă: aceleași ferestre (30 / 180 / 31), aceleași ștergeri, aceeași validare
--  (`p_days < 1` → excepție), același `security definer` cu `search_path` fixat, același
--  revoke către clienți. `create or replace` păstrează oricum drepturile existente.
--
--  Idempotentă: se poate reaplica fără efecte secundare.

create or replace function public.purge_guest_chat_history(
  p_days integer default 30,
  p_claim_days integer default 180,
  p_usage_days integer default 31
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_threads integer := 0;
  v_messages integer := 0;
  v_claims integer := 0;
  v_usage integer := 0;
  v_ai_clients integer := 0;
  v_ai_months integer := 0;
  v_accounts integer := 0;
begin
  if p_days < 1 then
    raise exception 'p_days trebuie sa fie cel putin 1 (primit: %)', p_days;
  end if;
  if p_claim_days < 1 then
    raise exception 'p_claim_days trebuie sa fie cel putin 1 (primit: %)', p_claim_days;
  end if;
  if p_usage_days < 1 then
    raise exception 'p_usage_days trebuie sa fie cel putin 1 (primit: %)', p_usage_days;
  end if;

  -- Câte mesaje pleacă, pentru jurnalul rulării. Mesajele nu se șterg direct: cad prin cascadă
  -- (`chat_messages.thread_id → chat_threads.id on delete cascade`), pentru că `chat_messages`
  -- nu are politică de DELETE pentru client.
  select count(*)
    into v_messages
    from public.chat_messages m
   where exists (
     select 1
       from public.chat_threads t
       join auth.users au on au.id = t.user_id
      where t.id = m.thread_id
        and au.is_anonymous = true
        and t.updated_at < now() - make_interval(days => p_days)
   );

  -- Firele de conversație ale oaspeților inactivi.
  delete from public.chat_threads t
   using auth.users au
   where au.id = t.user_id
     and au.is_anonymous = true
     and t.updated_at < now() - make_interval(days => p_days);
  get diagnostics v_threads = row_count;

  -- Jurnalul de schimbare a dispozitivului (B3): append-only, fără cheie externă către auth.users,
  -- deci nu dispare niciodată prin cascadă. Fără linia asta, identificatorii de dispozitiv rămân
  -- pe veci în bază.
  delete from public.notification_device_claims c
   where c.claimed_at < now() - make_interval(days => p_claim_days);
  get diagnostics v_claims = row_count;

  -- Contoarele zilnice anonime țin un `guest_id` de instalație, nu un user_id, deci nici ele nu au
  -- cascadă. Fereastra e cu o zi mai lungă decât cea a chatului, ca limita zilnică să nu poată fi
  -- ocolită prin simpla trecere a datei.
  delete from public.guest_usage_daily u
   where u.usage_date < current_date - p_usage_days;
  get diagnostics v_usage = row_count;

  -- A3-06: contoarele de consum AI au exact aceeași natură — se citesc doar pentru ziua curentă
  -- (per client) respectiv luna curentă (global). `ai_client_usage_daily` nu are cheie externă
  -- către `auth.users` (cheia e un hash de client), deci nu cade prin cascadă la ștergerea contului.
  delete from public.ai_client_usage_daily c
   where c.usage_date < current_date - p_usage_days;
  get diagnostics v_ai_clients = row_count;

  -- Contorul lunar global: se păstrează 12 luni. Limita se verifică pe `period_start`-ul lunii
  -- curente, deci orice rând mai vechi de atât e istoric pur.
  delete from public.ai_usage_monthly m
   where m.period_start < (date_trunc('month', current_date) - interval '12 months')::date;
  get diagnostics v_ai_months = row_count;

  -- Contul anonim complet abandonat: fără fire (au fost șterse mai sus), fără favorite și fără
  -- abonament. Cascada scoate apoi și rândurile rămase (profil, usage_daily).
  delete from auth.users au
   where au.is_anonymous = true
     and au.created_at < now() - make_interval(days => p_days)
     and not exists (select 1 from public.chat_threads t where t.user_id = au.id)
     and not exists (select 1 from public.favorites f where f.user_id = au.id)
     and not exists (select 1 from public.subscriptions s where s.user_id = au.id);
  get diagnostics v_accounts = row_count;

  return format(
    'retentie: fire=%s mesaje=%s claims=%s usage=%s ai_zile=%s ai_luni=%s conturi_anonime=%s',
    v_threads, v_messages, v_claims, v_usage, v_ai_clients, v_ai_months, v_accounts
  );
end;
$$;

comment on function public.purge_guest_chat_history(integer, integer, integer) is
  'B2/B3 + A3-06: sterge istoricul de chat al oaspetilor inactivi (implicit 30 zile), jurnalul de dispozitiv mai vechi de 180 de zile, contoarele anonime si cele de consum AI pe client mai vechi de 31 de zile, contorul lunar global AI mai vechi de 12 luni si conturile anonime abandonate. Se apeleaza din Supabase Cron (vezi supabase/cron/schedule-retention-purge.sql).';

-- Funcția lucrează pe date de utilizator, deci NU are ce căuta la îndemâna aplicației: doar
-- proprietarul bazei (și rolul de serviciu) o pot executa. Regula din 08.10.2026: în Supabase,
-- `revoke ... from public` NU scoate automat EXECUTE de la `anon`/`authenticated` — se scriu
-- explicit toate cele trei.
revoke all on function public.purge_guest_chat_history(integer, integer, integer)
  from public, anon, authenticated;
