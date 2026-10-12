-- ============================================================================
--  A3-08 (12.10.2026) — comentarii pentru tabelele rămase intenționat fără politici
-- ============================================================================
--
--  Un tabel cu RLS activat și ZERO politici arată, pentru cine citește baza, ca o scăpare:
--  pare că cineva a uitat să scrie politicile. În realitate sunt exact tabelele pe care le
--  scrie și le citește DOAR funcția Edge (cheia service_role), iar aplicația nu le atinge
--  niciodată. Fără un comentariu în bază, următorul care se uită la ele „repară” ce nu e stricat
--  (adaugă o politică) sau se teme să le atingă.
--
--  Inventarul la 12.10.2026 (interogat live, `pg_policy` + `pg_class`): 24 de tabele în `public`,
--  dintre care 6 au RLS activat și nicio politică:
--
--    ai_client_usage_daily, ai_provider_usage_daily, ai_usage_monthly, guest_usage_daily,
--    live_player_diagnostics, notification_device_claims
--
--  `live_player_diagnostics` spunea deja asta în comentariu („RLS activat fără nicio policy”),
--  deci rămâne neatins. Celelalte cinci primesc aici fie comentariu nou, fie o propoziție în
--  plus (COMMENT ON înlocuiește textul, deci se scrie tot comentariul, nu doar adaosul).
--
--  Se spun trei lucruri în fiecare: cine scrie tabelul, de ce nu are politici și ce retenție are.
--  Referințele la A3-01 / A3-06 sunt utile: pe 12.10.2026 rolurile `anon`/`authenticated` au
--  pierdut orice drept INSERT/UPDATE/DELETE rămas pe aceste tabele (migrația
--  20261012000100_revoke_client_dml_on_server_tables), respectiv contoarele AI au primit
--  fereastră de retenție (20261012000300_retention_ai_usage).

-- Fără comentariu deloc până acum. Cheia e un `guest_id` de instalație, nu un `user_id`.
comment on table public.guest_usage_daily is
  'Contoarele zilnice ale oaspetilor (cheie de instalatie, fara user_id), folosite pentru limita de mesaje AI. RLS activat intentionat fara nicio policy: tabelul e scris si citit exclusiv de functiile Edge cu service_role, iar rolurile de client nu au niciun drept INSERT/UPDATE/DELETE (A3-01, 12.10.2026). Retentie: 31 de zile, prin public.purge_guest_chat_history.';

comment on table public.ai_client_usage_daily is
  'Daily AI message counters keyed by a salted SHA-256 of (device header + client IP) and of the client IP alone. Only hashes are stored: the raw values never reach the database. Row level security is enabled with no policy on purpose: the Edge functions (service_role) are the only readers and writers, and the client roles hold no INSERT/UPDATE/DELETE grant (A3-01, 12.10.2026). Retention: 31 days, via public.purge_guest_chat_history (A3-06).';

comment on table public.ai_usage_monthly is
  'One row (scope = global) holding the provider-spend brake: every AI message of every identity for the current Bucharest month, against an operator-set cap. Row level security is enabled with no policy on purpose: the Edge functions (service_role) are the only readers and writers, and the client roles hold no INSERT/UPDATE/DELETE grant (A3-01, 12.10.2026). Rows older than 12 months are dropped by public.purge_guest_chat_history (A3-06); the running month is never touched.';

comment on table public.ai_provider_usage_daily is
  'Daily request counter per cascade step (day, step_id). Owned by the Edge function (service_role); it holds no personal data and no keys. Row level security is enabled with no policy on purpose, and no client role has ever held a grant on it.';

comment on table public.notification_device_claims is
  'Append-only audit trail of push-device ownership changes. A cross-account claim is legitimate (same phone, second account) but must be traceable, so every hand-over is recorded here. Row level security is enabled with no policy on purpose: the Edge functions (service_role) are the only readers and writers, and the client roles hold no INSERT/UPDATE/DELETE grant (A3-01, 12.10.2026). Retention: 180 days, via public.purge_guest_chat_history.';
