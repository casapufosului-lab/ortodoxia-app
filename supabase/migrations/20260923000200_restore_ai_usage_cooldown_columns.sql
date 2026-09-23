-- REPARAT 2026-09-23 (aplicat în producție): coloanele de cooldown lipseau din baza reală, deși
-- migrația care le adaugă (`20260903000100_harden_ai_usage`) figurează ca aplicată în istoricul remote.
--
-- CUM A FOST GĂSIT (măsurat, nu presupus): `public.reserve_ai_request` răspundea
--   `42703: column u.last_request_at does not exist`
-- deci funcția `orthodox-chat` întorcea HTTP 500 („Limita zilnică nu a putut fi verificată.") pentru
-- ORICE utilizator — chatul AI era oprit în producție, nu doar limitele noi.
--
-- DE CE O MIGRAȚIE NOUĂ, ȘI NU O RERULARE: istoricul remote consideră `20260903000100` aplicată, deci
-- `supabase db push` nu o mai rulează. Rescrierea unei migrații deja aplicate ar fi minciună în istoric;
-- o migrație nouă, idempotentă, spune exact ce s-a reparat și când.
--
-- EFECT: pur aditiv. Rândurile existente primesc `last_request_at = NULL`, adică „fără cooldown" —
-- nicio rezervare nu devine invalidă și niciun contor nu este rescris.

ALTER TABLE public.usage_daily
  ADD COLUMN IF NOT EXISTS last_request_at timestamptz;

ALTER TABLE public.guest_usage_daily
  ADD COLUMN IF NOT EXISTS last_request_at timestamptz;

COMMENT ON COLUMN public.usage_daily.last_request_at IS
  'Momentul ultimei rezervări acceptate, pentru cooldown-ul de 5 secunde din reserve_ai_request(). NULL = nicio cerere încă.';

COMMENT ON COLUMN public.guest_usage_daily.last_request_at IS
  'Momentul ultimei rezervări acceptate pentru identitatea guest, pentru cooldown-ul de 5 secunde. NULL = nicio cerere încă.';
