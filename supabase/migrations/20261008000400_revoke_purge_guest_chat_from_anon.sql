-- ============================================================================
--  Corecție de securitate: funcția de retenție rămâne doar la dispoziția bazei
-- ============================================================================
--
--  DE CE
--  Migrația 20261008000300 a scris `revoke all on function ... from public`, cu comentariul
--  explicit „doar proprietarul bazei (și rolul de serviciu) o pot executa" (liniile 115-117).
--  În Supabase, `revoke ... from public` NU scoate privilegiile acordate rolurilor `anon` și
--  `authenticated` prin privilegiile implicite ale schemei `public`. Efectul real, măsurat
--  live pe 08.10.2026: `POST /rest/v1/rpc/purge_guest_chat_history` cu cheia publică a
--  răspuns 200, adică orice client anonim putea porni ștergerea de istoric de chat.
--
--  Funcția șterge date de utilizator (fire de chat, mesaje, jurnal de dispozitiv, conturi
--  anonime abandonate), deci nu are ce căuta la îndemâna aplicației. O apelează doar cronul
--  (`supabase/cron/schedule-retention-purge.sql`), care rulează ca proprietar al bazei.
--
--  Verificat în cod: `purge_guest_chat_history` nu e apelată nicăieri din `src/` — doar din
--  cron și din migrația care a definit-o.
-- ============================================================================

revoke execute on function public.purge_guest_chat_history(integer, integer, integer) from anon;
revoke execute on function public.purge_guest_chat_history(integer, integer, integer) from authenticated;
revoke execute on function public.purge_guest_chat_history(integer, integer, integer) from public;
