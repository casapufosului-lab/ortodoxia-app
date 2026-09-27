# Cron-ul notificărilor zilnice — ce trebuie făcut, pas cu pas

> **Stare:** scriptul e gata în `supabase/cron/schedule-daily-notifications.sql`, dar **nu a fost
> rulat** — are nevoie de proiectul tău Supabase, de secretul funcției și de extensiile din
> dashboard. Nu am acces la ele, deci nu pot spune că notificările pleacă; pot spune exact ce ai de
> făcut și cum verifici.

## Ce lipsește și de ce

Funcția `send-daily-notifications` există, citește preferințele fiecărui om, potrivește ora locală,
rezervă atomic trimiterea (ca să nu se repete) și trimite prin Expo Push. **Nu are cine să o cheme.**
Fără un programator, nimeni nu primește nimic.

Programatorul stă în Supabase Cron (`pg_cron` + `pg_net`), care cheamă funcția prin HTTP, cu un
secret comun în antet (`x-cron-secret`).

## Pașii tăi (o singură dată)

1. **Activează extensiile**: Dashboard → *Database* → *Extensions* → pornește `pg_cron` și `pg_net`.
2. **Pune secretul funcției**: Dashboard → *Project Settings* → *Edge Functions* → *Secrets* →
   adaugă `NOTIFICATION_CRON_SECRET` cu o parolă lungă, generată de tine. (Funcția refuză orice
   cerere fără ea — vezi `supabase/functions/send-daily-notifications/index.ts`, verificarea din
   capul handler-ului.)
3. **Salvează secretele în Vault** (SQL Editor), ca jobul să le citească fără să le scrie în textul
   lui:
   ```sql
   select vault.create_secret('https://<proiect>.supabase.co', 'notification_project_url');
   select vault.create_secret('<parola_de_la_pasul_2>',      'notification_cron_secret');
   ```
4. **Rulează scriptul**: lipește conținutul din `supabase/cron/schedule-daily-notifications.sql` în
   SQL Editor. Dacă secretele lipsesc, scriptul **nu** programează nimic și îți spune asta printr-un
   mesaj, în loc să creeze un job care eșuează în tăcere la fiecare rulare.
5. **Verifică**:
   ```sql
   select jobid, jobname, schedule, active from cron.job;
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   select status_code, content from net._http_response order by created desc limit 5;
   ```
   Răspunsul funcției arată așa: `{"success":true,"eligible":N,"sent":M,"skipped":K,"failed":0}`.
   `failed` diferit de 0 înseamnă că ceva s-a stricat pe drum, iar rularea se raportează ca eșec
   (intenționat: o conductă stricată nu are voie să pară sănătoasă).

## De ce la fiecare 5 minute

Fiecare om își alege ora, iar funcția potrivește ora locală într-o **fereastră de 5 minute**
(`NOTIFICATION_SEND_WINDOW_MINUTES` în `supabase/functions/send-daily-notifications/send-core.ts`).
Cu o rulare la 5 minute, orice oră aleasă cade în cel puțin o rulare, iar rezervarea atomică
(`reserve_notification_deliveries`) oprește dublurile din aceeași fereastră. (Documentul
`NOTIFICATION_STATUS.md` spunea „1-minute cron schedule" — era o descriere dinainte, nu ceva ce
există; l-am corectat.)

## Ce rămâne de verificat de tine, pe telefon

- Că notificarea chiar ajunge la ora aleasă (cu aplicația închisă).
- Că un al doilea dispozitiv al aceluiași cont primește o singură dată, nu de două ori.
- Că schimbarea orei în aplicație se respectă în ziua următoare.

## Costul

O rulare la 5 minute înseamnă 288 de chemări pe zi (~8.600 pe lună). Fiecare chemare citește
preferințele și, doar pentru cei care sunt în fereastră, trimite. Dacă vrei mai ieftin, poți rari
rularea la 10 minute **cu condiția** să mărești fereastra din `send-core.ts` la 10 — altfel o parte
dintre oameni nu mai primesc nimic. Fereastra și programarea trebuie ținute împreună.
