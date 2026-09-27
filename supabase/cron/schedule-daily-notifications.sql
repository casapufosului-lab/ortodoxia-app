-- ============================================================================
--  Programatorul notificărilor zilnice (Supabase Cron / pg_cron + pg_net)
-- ============================================================================
--
--  DE CE NU E O MIGRAȚIE
--  Fișierul stă intenționat în `supabase/cron/`, nu în `supabase/migrations/`. O migrație se
--  aplică automat la `supabase db push`, iar `create extension pg_cron` poate fi refuzat pe un
--  proiect care nu are extensia activată din dashboard — atunci tot deploy-ul s-ar opri din cauza
--  unui lucru care ține de infrastructură, nu de cod. Îl rulezi tu, o singură dată, după ce
--  activezi extensiile.
--
--  CE TREBUIE FĂCUT ÎNAINTE (detaliat în `docs/CRON-NOTIFICARI.md`)
--  1. Dashboard → Database → Extensions: activează `pg_cron` și `pg_net`.
--  2. Supabase → Project Settings → Edge Functions → Secrets: adaugă
--     `NOTIFICATION_CRON_SECRET` (o parolă lungă, aleasă de tine).
--  3. În SQL Editor, salvează în Vault două secrete (numele contează, sunt citite mai jos):
--
--       select vault.create_secret('https://<proiect>.supabase.co', 'notification_project_url');
--       select vault.create_secret('<parola_de_la_pasul_2>',      'notification_cron_secret');
--
--     Secretul NU se scrie în comanda jobului: jobul îl citește din Vault la fiecare rulare.
--
--  DE CE LA 5 MINUTE
--  Funcția trimite fiecărui om la ora lui locală, iar fereastra de potrivire e de 5 minute
--  (`NOTIFICATION_SEND_WINDOW_MINUTES` din `send-core.ts`). Cu o rulare la fiecare 5 minute,
--  orice oră aleasă de utilizator cade în cel puțin o rulare. Trimiterea nu se repetă în fereastră:
--  rezervarea atomică (`reserve_notification_deliveries`) blochează dublurile.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_url    text;
  v_secret text;
  v_job    bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notification_project_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notification_cron_secret';

  if v_url is null or v_secret is null then
    raise notice 'NU am programat notificările: lipsesc secretele din Vault (notification_project_url / notification_cron_secret). Vezi docs/CRON-NOTIFICARI.md.';
    return;
  end if;

  -- Idempotent: dacă jobul există deja, îl scoatem și îl punem la loc cu definiția de acum.
  select jobid into v_job from cron.job where jobname = 'send-daily-notifications';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'send-daily-notifications',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'notification_project_url')
               || '/functions/v1/send-daily-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                             where name = 'notification_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );

  raise notice 'Notificările zilnice sunt programate la fiecare 5 minute (job: send-daily-notifications).';
end $$;

-- ── Cum verifici că merge ──────────────────────────────────────────────────
--   select jobid, jobname, schedule, active from cron.job;         -- jobul e activ?
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;   -- ultimele rulări
--   select status_code, content, created
--     from net._http_response order by created desc limit 5;        -- ce a răspuns funcția
--
--   Raspunsul funcției arată ca {"success":true,"eligible":N,"sent":M,"skipped":K,"failed":0}.
--   Dacă `failed` nu e 0, ceva s-a stricat pe drum (vezi `docs/NOTIFICATION_STATUS.md`).
--
-- ── Cum oprești programarea ────────────────────────────────────────────────
--   select cron.unschedule('send-daily-notifications');
