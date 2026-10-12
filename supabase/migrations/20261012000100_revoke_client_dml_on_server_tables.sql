-- ============================================================================
--  A3-01 — retragerea scrierii (INSERT/UPDATE/DELETE) pe tabelele care sunt
--  scrise EXCLUSIV de server (service_role / funcții Edge).
--  Data: 2026-10-12. Autor: worker `cod`. Aplicată în baza LIVE în aceeași zi.
-- ============================================================================
--
--  DE CE
--  Pe aceste tabele, RLS taie deja scrierile clienților (0 politici permisive de
--  scriere), dar privilegiile de tabel rămâneau acordate: `anon` și `authenticated`
--  aveau INSERT/UPDATE/DELETE pe 22 de tabele din `public`
--  (`acl` = `anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres`). Dacă o
--  politică RLS permisivă apare din greșeală — sau o migrație viitoare deschide o
--  cale de scriere — privilegiul de tabel ar fi rămas singurul zăgaz, iar el lipsea.
--  Aici îl scoatem: apărare în adâncime, exact pe tabelele la care clientul nu are
--  ce să scrie.
--
--  REGULA DE SIGURANȚĂ (aplicată ÎNAINTE de scrierea acestui fișier)
--  1. S-a scanat `src/**` (73 de fișiere) pentru lanțuri `.from('<tabel>').insert |
--     update | delete | upsert` și pentru apeluri `.rpc(...)`.
--  2. Tabelele scrise de client au fost EXCLUSE complet. Lista lor, cu fișier:linie,
--     este în capul fișierului `tests/table-privileges-revoke.test.mjs`, iar testul
--     RE-DERIVĂ lista din `src/**` la fiecare rulare: o scriere nouă din aplicație
--     rupe `npm test` înainte să ajungă în bază.
--  3. S-au verificat și scrierile din `supabase/functions/**`: toate folosesc clientul
--     `admin` (service_role). Clienții cu cheia publicabilă din `orthodox-chat` și
--     `delete-account` sunt folosiți EXCLUSIV pentru `auth.getUser(token)` (identitate),
--     niciodată pentru scrieri de tabel. `service_role` păstrează toate drepturile.
--  4. S-au verificat RPC-urile Security Definer chemate de client: scriu ca proprietar
--     (`postgres`), nu ca apelant. Ex.: `public.claim_notification_device()`
--     (src/app/(tabs)/account.tsx:324) scrie în `notification_devices` și
--     `notification_deliveries` — de aceea revocarea pe `notification_deliveries`
--     nu rupe nimic.
--
--  TABELE EXCLUSE (clientul scrie; NU se revocă nimic pe ele):
--    ai_reports            src/app/(tabs)/chat.tsx:663                               [insert]
--    chat_threads          src/lib/chat-history.ts:78                                [delete]
--    favorites             src/app/(tabs)/prayers.tsx:177,178                        [delete, insert]
--    notification_devices  src/app/(tabs)/account.tsx:375                            [update]
--    notification_preferences src/app/(tabs)/account.tsx:313,339,369
--                          src/hooks/use-notification-timezone-sync.ts:44            [insert/update/upsert]
--    profiles              src/app/(tabs)/account.tsx:179                            [update]
--    verse_favorites       src/app/(tabs)/bible.tsx:101,108                          [delete, insert]
--
--  ATENȚIE: `ai_reports` era în lista de candidați a taskului A3-01. Scanarea a
--  arătat că aplicația inserează în el de la client, deci rămâne NEATINS.
--  `live_player_diagnostics` și `ai_provider_usage_daily` (candidați și ele) nu mai
--  apar în lista de 22 — verificat: nici `anon`, nici `authenticated` nu au
--  INSERT/UPDATE/DELETE pe ele, nu e nimic de revocat.
--
--  CE NU SE SCHIMBĂ
--    * SELECT rămâne acordat — aplicația citește 13 tabele, inclusiv `chat_messages`,
--      `subscriptions`, `usage_daily`, `chat_threads`, `favorites`, `profiles`.
--    * `service_role` păstrează INSERT/UPDATE/DELETE pe toate tabelele.
--    * NICIO politică RLS nu este atinsă de acest fișier (nici adăugată, nici slăbită).
--
--  IDEMPOTENT: un REVOKE pe un privilegiu neacordat nu face nimic și nu dă eroare.

-- ── Consum / cote AI — scrise de Edge Function `orthodox-chat` (service_role) ────
revoke insert, update, delete on public.ai_client_usage_daily from anon, authenticated;
revoke insert, update, delete on public.ai_usage_monthly from anon, authenticated;
revoke insert, update, delete on public.guest_usage_daily from anon, authenticated;
revoke insert, update, delete on public.usage_daily from anon, authenticated;

-- ── Abonamente — scrise de webhook-ul RevenueCat / `revenuecat-sync-user` ────────
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ── Notificări — scrise de `send-daily-notifications` + RPC definer + delete-account
revoke insert, update, delete on public.notification_deliveries from anon, authenticated;
revoke insert, update, delete on public.notification_device_claims from anon, authenticated;
revoke insert, update, delete on public.notification_messages from anon, authenticated;

-- ── Servicii live — scrise de `live-services-status` / `live-player-diagnostic` ──
revoke insert, update, delete on public.live_service_status_cache from anon, authenticated;

-- ── Istoricul conversațiilor — scris de Edge Function `orthodox-chat` ────────────
revoke insert, update, delete on public.chat_messages from anon, authenticated;

-- ── Conținut editorial / corpus — scris doar de migrații și de scripturile de seed
revoke insert, update, delete on public.bible_verses from anon, authenticated;
revoke insert, update, delete on public.calendar_day_translations from anon, authenticated;
revoke insert, update, delete on public.calendar_days from anon, authenticated;
revoke insert, update, delete on public.daily_content from anon, authenticated;
revoke insert, update, delete on public.prayers from anon, authenticated;
