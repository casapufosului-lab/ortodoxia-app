-- ============================================================================
--  B2 + B3 (registru) — retenția datelor de oaspete
-- ============================================================================
--
--  De ce e nevoie de o curățenie programată, nu doar de un buton în aplicație:
--  un oaspete NU se întoarce niciodată să apese „Șterge istoricul". Fără partea de aici,
--  transcrierile anonime rămân pe veci — exact ce spune poziția B2 din audit
--  („istoricul de chat al utilizatorului neautentificat nu se șterge nicăieri").
--
--  Cine e „oaspete": un rând din `auth.users` cu `is_anonymous = true`. Clientul creează o
--  astfel de sesiune reală (`signInAnonymously`), deci are un id adevărat, dar niciun om în spate.
--
--  Fereastra de retenție e o PROMISIUNE, nu o preferință: exact aceste numere trebuie să apară în
--  formularul Data safety și în politica de confidențialitate. Sunt validate mai jos
--  (`p_days < 1` → excepție), ca un apel greșit să nu golească totul.
--
--  30 zile  — firele de conversație ale oaspeților inactivi (mesajele cad prin cascadă);
--  180 zile — jurnalul de schimbare a dispozitivului de notificări (B3, append-only, fără FK);
--  31 zile  — contoarele zilnice anonime (`guest_usage_daily`), care nu țin user_id;
--  30 zile  — conturile anonime complet abandonate (fără favorite, fără abonament, fără fire).
--
--  Ce NU atinge: conținut (versete, calendar, rugăciuni) și conturile oamenilor reali. Ștergerea
--  contului anonim se face DOAR dacă nu are favorite și niciun rând în `subscriptions`, ca un om
--  care a plătit din întâmplare dintr-o sesiune anonimă să nu-și piardă accesul.
--
--  Idempotentă: funcția e `create or replace`, deci se poate reaplica fără efecte secundare.
--  Programarea NU e aici: `create extension pg_cron` poate fi refuzat de proiect, iar atunci un
--  `supabase db push` întreg ar cădea din cauza infrastructurii. Vezi
--  `supabase/cron/schedule-retention-purge.sql`.

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
    'retentie: fire=%s mesaje=%s claims=%s usage=%s conturi_anonime=%s',
    v_threads, v_messages, v_claims, v_usage, v_accounts
  );
end;
$$;

comment on function public.purge_guest_chat_history(integer, integer, integer) is
  'B2/B3: sterge istoricul de chat al oaspetilor inactivi (implicit 30 zile), jurnalul de dispozitiv mai vechi de 180 de zile, contoarele anonime mai vechi de 31 de zile si conturile anonime abandonate. Se apeleaza din Supabase Cron (vezi supabase/cron/schedule-retention-purge.sql).';

-- Funcția lucrează pe date de utilizator, deci NU are ce căuta la îndemâna aplicației: doar
-- proprietarul bazei (și rolul de serviciu) o pot executa.
revoke all on function public.purge_guest_chat_history(integer, integer, integer) from public;
