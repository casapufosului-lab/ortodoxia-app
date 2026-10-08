-- ============================================================================
--  Programatorul curățeniei de date vechi (Supabase Cron / pg_cron)
-- ============================================================================
--
--  DE CE NU E O MIGRAȚIE
--  Fișierul stă intenționat în `supabase/cron/`, nu în `supabase/migrations/`, din același motiv
--  ca programatorul notificărilor: `create extension pg_cron` poate fi refuzat pe un proiect care
--  nu are extensia activată din dashboard, iar atunci tot `supabase db push` ar cădea din cauza
--  infrastructurii, nu a codului. Funcția de curățenie ESTE în migrație
--  (`20261008000300_retention_guest_chat.sql`); aici e doar programarea.
--
--  CUM SE APLICĂ (owner)
--  1. Dashboard → Database → Extensions: activează `pg_cron`.
--  2. Dashboard → SQL Editor → lipește tot fișierul și rulează-l. E idempotent: dacă jobul există,
--     îl scoate și îl pune la loc cu definiția de acum.
--  3. Verificare: `select jobname, schedule, active from cron.job where jobname = 'retention-purge';`
--     și, după prima rulare, `select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'retention-purge')
--     order by start_time desc limit 5;`
--
--  CE FACE: o dată pe zi, la 03:30 UTC (ora Romaniei: 05:30 sau 06:30, în afara orelor de vârf),
--  cheamă `public.purge_guest_chat_history()` cu ferestrele implicite (30 / 180 / 31 de zile).
--  Funcția întoarce un text cu numărătorile, care ajunge în `cron.job_run_details`.

do $$
declare
  v_job bigint;
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron nu este activat: activeaza-l din Dashboard > Database > Extensions si ruleaza din nou fisierul. Vezi docs/ACCOUNT_DELETION.md.';
    return;
  end if;

  -- Idempotent: dacă jobul există deja, îl scoatem și îl punem la loc cu definiția de acum.
  select jobid into v_job from cron.job where jobname = 'retention-purge';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'retention-purge',
    '30 3 * * *',
    $job$
      select public.purge_guest_chat_history(30, 180, 31);
    $job$
  );
end;
$$;
