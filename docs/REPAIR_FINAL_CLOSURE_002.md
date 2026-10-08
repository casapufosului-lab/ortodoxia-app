# ORTODOXIA-APP-REPAIR-FINAL-CLOSURE-002 — final closure report

> **Atenție (27.09.2026):** o parte din cifrele și lipsurile din raportul acesta sunt învechite — lucruri
> date aici ca nefăcute (textele legale, `projectId`, conținutul zilnic de 365 de zile, `audio_path`) au
> fost rezolvate după data raportului, iar poarta de release dă acum alte numere. Starea verificată acum
> este în [STARE-REALA.md](./STARE-REALA.md), cu dovadă în fișier și linie.

Local technical closure of the Ortodoxia mobile app (`C:\Users\pcgar\Documents\ortodoxia-app`).
Read-only with respect to `ortodoxia-social-engine` (never accessed).

* HEAD: `ae5483ebf55ee0e01683e9bc169cf48c0371c8aa` on `master` (unchanged; reflog unchanged)
* No commit, no push, no deploy, no `eas build`, no `supabase db push`, no remote change
* No `git reset` / `git clean` / `git checkout -- .`
* Pre-existing dirty state preserved, including `packagepentruchat.zip`, `scene-engine/` and the
  corrupted PowerShell filename

---

## 1. Gate results (the only claims that are executable evidence)

| Gate | Command | Result |
| --- | --- | --- |
| App typecheck | `npm run typecheck` | **exit 0** |
| Edge typecheck | `npm run typecheck:edge` | **exit 0** |
| i18n corpus | `npm run test:i18n` | **PASS** — 521 keys × 10 locales, CJK 0, Cyrillic 0, 0 leftover completion tokens |
| Test suite | `npm test` | **535 tests, 535 pass, 0 fail** |
| CI release gate | `npm run test:release` | **10 passed / 0 failed / 10 deferred — CI GATE: PASSED** |
| Full gate set | `npm run verify` | **exit 0** |
| Pre-submission gate | `node scripts/release-readiness.mjs --release` | 10 passed / **7 failed** / 3 deferred — every FAIL is external (see §5) |

Test count moved 517 → 535 (+18) with the tests added in this round.

---

## 2. Reconciliation of the finding arithmetic — **the "102" premise cannot be satisfied**

### 2.1 The supplied numbers do not agree with each other

The domain table I was given (`A=9, B=9, C=9, D=6, E=11, F=11, G=17, H=11, I=6, J=7, K=5, L=6,
M=7, N=4, O=6, P=8, QR=8`):

| Quantity | Value |
| --- | --- |
| Sum of the 17 published domain groups | **140** |
| Sum of the first 13 groups only (A–M) | **114** |
| `82 + 7 + 9 + 5 + 4 + 14` | **121** |
| Total asserted in the published report | **102** |
| Total asserted in the follow-up ("102 findings") | **102** |

Four mutually incompatible totals: **102, 114, 121, 140**. No single reading of the domain table
produces 102.

### 2.2 The repository itself shows two overlapping catalogues

A scan of `src/`, `tests/`, `supabase/`, `scripts/`, `docs/` for finding references finds **two
naming schemes used simultaneously**:

* a severity-numbered list — `HIGH #7`, `HIGH #8`, `MEDIUM #9` … `MEDIUM #20`, `LOW #21`,
  `LOW #22`, `LOW #23` (at least 23 identifiers);
* a domain-letter list — `A-01`, `A-02`, `A-05`, `B-03`, `B-07`, `B-08`, `C-01`, `C-02`, `C-04`,
  `C-05`, `C-07`, `C-09`, `E-09`, `E-10`, `F-07`, `G-11`, `H-01`, `H-03`, `H-06`, `H-07`, `H-10`,
  `I-06`, `J-01`, `J-03`, `J-04`, `K-01`, `K-02`, `L-05`, `L-06`, `M-01`, `O-03`, `P-01`, `P-03`,
  `P-06`, `P-08`, `TG-01` (37 identifiers actually referenced).

The two catalogues overlap (for example `B-03`/`O-03` is the same defect as one numbered item) but
are not a bijection, and the letter catalogue's own domain counts do not match the per-domain
inventory either.

### 2.3 Consequence — `BLOCKED_NEEDS_SOURCE_DATA`

* The published per-ID catalogue (ID → problem/severity/impact) **is not present anywhere in the
  workspace**, and no artifact in the tree reconstructs it (`LIVE_AUDIT_FULL.txt` is a raw file
  dump, not the findings table).
* Producing a 102-row matrix would therefore require **inventing** finding definitions, severities
  and impacts. That is prohibited by this task and by `ORTODOXIA-APP-AUDIT-REPAIR-ALL-001`.
* Everything below is therefore built **only from verifiable evidence**: the ID is only stated
  where the repository itself documents it, and any claim I cannot ground is marked
  `NEVERIFICAT`.

**PRIMARY STATUS totals are therefore not reported as 102.** The honest totals are stated in §6.

---

## 3. Findings closed in this round (evidence-backed)

`PRIMARY STATUS` ∈ {`FIXED_VERIFIED`, `LOCAL_FIX_VERIFIED`, `DEFERRED_REMOTE_VERIFICATION`,
`BLOCKED_*`, `NEVERIFICAT`}.

| ID | SEVERITY (source) | PROBLEM | PRIMARY STATUS | LOCAL FIX STATUS | REMOTE/EXTERNAL DEPENDENCY | VALIDATION | FILES |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CORS/`activeRequest` (unnumbered, found this round) | HIGH (self-assessed) | `_shared/http.ts` CORS helper was imported but never given the request, so `json()` emitted no CORS headers and 6 Edge Functions failed to typecheck | `FIXED_VERIFIED` | Fixed | none | `npm run typecheck:edge` exit 0; `tests/chat-backend.test.mjs` 23/23 | all 6 `supabase/functions/*/index.ts` |

> **Recitire 08.10.2026 (C17):** rândul de mai sus era corect pentru runda lui (helperul a fost legat de cerere), dar reparația de atunci a lăsat cererea într-o variabilă **la nivel de modul** (`let activeRequest`), pe care `json()` o citea înapoi. Într-un isolate, două cereri concurente puteau schimba astfel `Origin`-ul una alteia. Starea de modul a fost eliminată complet: `supabase/functions/_shared/http.ts` expune `createJsonResponder(req, allowedHeaders)`, fiecare handler își construiește respondentul din `req`, iar `tests/edge-cors-per-request.test.mjs` hrănește intercalarea a două origini și pică pe forma veche.
| B-03 / O-03 | HIGH | Session tokens fell back to **plaintext AsyncStorage** when `expo-secure-store` was unavailable or the value exceeded the Android ~2 KB limit | `FIXED_VERIFIED` | Fixed — no plaintext fallback remains anywhere | new native build required (`expo-secure-store` is a native module) | `tests/secure-session-storage.test.mjs` 17/17 (small, large, interrupted, failed write, legacy migration, failed migration, remove, short-value prune, stale generation, corrupt manifest, missing fragment, length mismatch, empty, two keys); `tests/session-storage-hardening.test.mjs` 9/9 (no `AsyncStorage.setItem`, both clients wired, manifest-as-commit-point, no token in logs, versioned manifest) | `src/lib/secure-session-storage.ts`, `src/lib/supabase.ts` |
| E-09 | HIGH (self-assessed) | `current_period_end IS NULL` was treated as "never expires" in the client **and** in the authoritative quota gate, so an entitlement with no verifiable expiry granted Premium forever | `FIXED_VERIFIED` (client + webhook) / `DEFERRED_REMOTE_VERIFICATION` (SQL) | Fixed in `subscription.ts`, `resolveCustomerSnapshot`, and a new migration | executing the migration needs a database | `tests/core-logic.test.mjs` (imports the real implementation), `tests/revenuecat-webhook-ordering.test.mjs`, `tests/sql-migration-hardening.test.mjs` | `src/lib/subscription.ts`, `supabase/functions/revenuecat-webhook/core.ts`, `supabase/migrations/20260915000300_*.sql` |
| E-10 | MEDIUM (self-assessed) | The RevenueCat webhook and `sync_revenuecat_subscription` hardcoded `provider = 'manual'`, so every App Store / Google Play purchase was recorded as an operator grant | `FIXED_VERIFIED` (client + webhook) / `DEFERRED_REMOTE_VERIFICATION` (SQL) | Store → provider mapping (`apple`/`google`/`revenuecat`), threaded through a new RPC parameter; the 8-arg overload is dropped so it cannot survive | executing the migration needs a database | `tests/revenuecat-webhook-ordering.test.mjs` (store matrix + migration assertions) | `supabase/functions/revenuecat-webhook/core.ts`, `supabase/migrations/20260915000300_*.sql` |
| C-09 | MEDIUM (self-assessed) | The `prayer-audio` bucket was `public = true` with an unconditional SELECT policy, so every recording was world-readable at a permanent, unrevocable URL | `FIXED_VERIFIED` (client) / `DEFERRED_REMOTE_VERIFICATION` (SQL) | Bucket made private; client switched from `getPublicUrl()` to a 300 s `createSignedUrl()`; no write policy added | executing the migration needs a database; recordings not yet uploaded | `npm run typecheck` exit 0; `tests/sql-migration-hardening.test.mjs` | `src/app/(tabs)/prayers.tsx`, `supabase/migrations/20260915000400_*.sql` |
| B-07 | MEDIUM (self-assessed) | `key={user?.id ?? 'guest'}` mounted the conversation as *guest* before the persisted session was restored, then remounted it — visible flash of signed-out state plus a wasted quota/history fetch | `FIXED_VERIFIED` | Wait for `isLoading` before mounting | none | `npm run typecheck` exit 0 | `src/app/(tabs)/chat.tsx` |
| B-08 | MEDIUM (self-assessed) | OAuth cancel/dismiss/`locked` returned silently, and `signInWithOAuth` had no timeout — a stalled request left the buttons disabled forever with no explanation | `FIXED_VERIFIED` | Explicit localized "cancelled" notice for every non-success outcome; 30 s timeout mapped to the existing network-error string | none | `npm run typecheck` exit 0; `tests/i18n-foundation.test.mjs` | `src/app/auth.tsx`, `src/i18n/config.ts` |
| C-05 | MEDIUM (documented) | `claim_notification_device` looked the device up by token alone, so any authenticated account that learned a token could take ownership | `DEFERRED_REMOTE_VERIFICATION` | Migration authored: audit table, bounded cross-account claiming (5/24 h), trigger, RPC locked to `authenticated` | executing the migration needs a database | `tests/sql-migration-hardening.test.mjs` (4 assertions) | `supabase/migrations/20260915000200_*.sql` |
| C-01 / H-01 / H-07 / H-10 | documented | `get_calendar_days_localized` had column/identifier ambiguity; `feast_rank` stored a Romanian display literal; notification type detection compared a Romanian literal so the Greek calendar could never produce `red_cross` | `DEFERRED_REMOTE_VERIFICATION` | Migration authored: canonical `feast_rank_code`, trigger, alias-free RPC | executing the migration needs a database | `tests/sql-migration-hardening.test.mjs`, `tests/i18n-plural.test.mjs`, `tests/notifications.test.mjs` | `supabase/migrations/20260915000100_*.sql`, `src/lib/feast-rank.ts`, `supabase/functions/send-daily-notifications/*` |
| C-04 / C-07 | documented | Notification RPCs were executable by `anon`/`authenticated`; `notification_messages` had no uniqueness key so re-seeding duplicated every template | `DEFERRED_REMOTE_VERIFICATION` | Migration authored: REVOKE/GRANT restated, idempotent dedupe + unique index | executing the migration needs a database | `tests/sql-migration-hardening.test.mjs` | `supabase/migrations/20260915000100_*.sql` |
| Static re-review: `get_calendar_days_localized` privilege surface | MEDIUM (found this round) | `CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default, so the `GRANT … TO anon, authenticated` did not restrict anything — including `service_role` | `LOCAL_FIX_VERIFIED` | `REVOKE … FROM PUBLIC` added before the intended GRANT | executing the migration needs a database | `tests/sql-migration-hardening.test.mjs` — "does not leave the default PUBLIC EXECUTE grant in place" | `supabase/migrations/20260915000100_*.sql` |
| Static re-review: stale `feast_rank_code` | MEDIUM (found this round) | The sync trigger only filled a NULL code, so changing `feast_rank` left the **previous** canonical code on the row — the row contradicted itself | `LOCAL_FIX_VERIFIED` | Recompute when `feast_rank` changed and the writer did not supply a code; an explicit code still wins | executing the migration needs a database | `tests/sql-migration-hardening.test.mjs` — "feast-rank trigger recomputes when feast_rank changes" | `supabase/migrations/20260915000100_*.sql` |
| Static re-review: duplicate/backfill + null handling | LOW (found this round) | Dedupe partitions on `theme` (nullable-looking) while the index compares it directly; verified `theme` is `NOT NULL` and `country_code`/`calendar_code` are `COALESCE`d in **both**, so the two agree and index creation cannot fail after a "successful" dedupe | `FIXED_VERIFIED` (verified non-defect) | none needed | none | `tests/sql-migration-hardening.test.mjs` — "dedupe and its unique index agree on NULL handling" | `supabase/migrations/20260915000100_*.sql` |
| L-05 | MEDIUM (documented) | State written after unmount: `live.tsx` closed the player from a cleanup function; `account.tsx` wrote busy state from `finally` after `router.replace('/')` had already navigated away | `FIXED_VERIFIED` | Cleanup effect removed in `live.tsx` (unmount already discards state); `mountedRef` guard in `account.tsx` | none | `npm run typecheck` exit 0 | `src/app/live.tsx`, `src/app/(tabs)/account.tsx` |
| L-06 | LOW (documented) | Chat re-fetched `chat_threads`, `usage_daily`, `subscriptions` and `chat_messages` on **every** foreground transition | `FIXED_VERIFIED` | Reload only when backgrounded ≥ 60 s **and** rendered data is ≥ 60 s old | none | `tests/chat-adv02-quota-refresh.test.mjs` | `src/app/(tabs)/chat.tsx` |
| K-01 | LOW (documented) | `router.push(route as never)` and `router.replace('/reset-confirmation' as never)` silenced the checker for the whole call | `FIXED_VERIFIED` | `as Href` (a documented boundary at the validated notification route) and the cast removed entirely for the generated typed route | none | `npm run typecheck` exit 0 | `src/app/_layout.tsx`, `src/app/auth.tsx` |
| I-06 | MEDIUM (documented) | `cy-paphos`, `rs-sumadija` and `rs-tumane` have `supportsDynamicLiveDetection: false`, so the backend never returns a status for them and their "view broadcasts" label implied detection was merely pending | `FIXED_VERIFIED` | New localized `live.statusNoDetection` (10 locales) rendered for those sources; the action button still opens the official source | none | `scripts/validate-i18n-corpus.mjs` PASS | `src/app/live.tsx`, `src/i18n/config.ts` |
| J-04 | MEDIUM (documented) | The prayers query had **no** `language_code` filter, so a Greek or Georgian user saw the Romanian corpus | `FIXED_VERIFIED` | Ask for the selected language first, fall back to the full corpus only when the language has no rows, and say so with a localized notice (10 locales) | none | `npm run typecheck` exit 0; `scripts/validate-i18n-corpus.mjs` PASS | `src/app/(tabs)/prayers.tsx`, `src/i18n/config.ts` |
| Legal: invalid `mailto:` | MEDIUM (found this round) | `supportMailtoUrl()` interpolated any non-empty env value into `mailto:`, so a value containing whitespace, `,`/`;` or a second `@` produced a dead link or silently added recipients | `FIXED_VERIFIED` | `isPlausibleEmail()`; an implausible address is treated as **not configured** (gate fails, UI shows its notice) and is guarded again at the single `mailto:` construction point | none | `tests/legal-values.test.mjs` — 10 rejected forms incl. `mailto:` injection | `src/lib/legal-values.ts` |
| Test integrity: self-fulfilling `hasPremiumAccess` copy | MEDIUM (found this round) | `tests/core-logic.test.mjs` **duplicated** `hasPremiumAccess` instead of importing it, so the copy agreed with itself and the fail-open branch survived review | `FIXED_VERIFIED` | Test now imports the real implementation | none | `tests/core-logic.test.mjs` 9/9 | `tests/core-logic.test.mjs` |
| Test integrity: duplicate weaker Edge typecheck | MEDIUM (found this round) | `tests/chat-backend.test.mjs` built its own compiler options without `allowImportingTsExtensions`, producing TS5097 while `npm run typecheck:edge` was clean | `FIXED_VERIFIED` | The test now parses and runs the **real** `tsconfig.edge.json` | none | `tests/chat-backend.test.mjs` 23/23 | `tests/chat-backend.test.mjs` |

### 3.1 The I-05 contradiction — resolved

* The previous report described **I-05** as "1 HIGH timeout remaining". That timeout is
  `LIVE_STATUS_TIMEOUT_MS = 20_000` on `supabase.functions.invoke` in
  `src/live/live-status-client.ts`, wrapped in `try/catch` that rethrows a retryable
  `FETCH_FAILED` code. **I-05 = `FIXED_VERIFIED`.**
* The genuinely remaining HIGH was **B-03 / O-03** (plaintext session fallback). With the chunked
  SecureStore adapter the plaintext fallback is gone, so **B-03 / O-03 = `FIXED_VERIFIED`**.
* Therefore the report's "1 HIGH remaining" was attributing the surviving HIGH to the **wrong ID**
  (I-05 instead of B-03/O-03). That is the contradiction, and it is now closed in the direction of
  both IDs being fixed.

---

## 4. OPEN findings — exact list

"OPEN" here means **not closed locally**, i.e. the remaining work needs data, credentials or a
database. Every row names a concrete mechanism and a concrete unblocking action; none is generic.

### 4.1 `BLOCKED_NEEDS_USER_DATA` (operator-supplied data)

| ID | SEVERITY | PROBLEM | WHY STILL OPEN | LOCAL OR EXTERNAL | FILES | FIX PLAN |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 (subset: identity) | HIGH | `EXPO_PUBLIC_LEGAL_ENTITY`, `EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS`, `EXPO_PUBLIC_LEGAL_JURISDICTION`, `EXPO_PUBLIC_LEGAL_LOCALITY` are unset, so the privacy policy renders the localized "to be completed" notice where the operator name, postal address and jurisdiction belong | These are facts about a legal entity that does not exist yet in the repository; inventing them is prohibited | EXTERNAL | `src/lib/legal-values.ts`, `src/app/privacy.tsx`, `src/app/terms.tsx`, `.env.example` | Set the four variables as EAS environment variables; no source change is needed |
| P-01 (subset: contact) | HIGH | `EXPO_PUBLIC_SUPPORT_EMAIL` is unset, so no support `mailto:` exists and the account screen shows `account.helpUnavailable` | No real support address exists | EXTERNAL | `src/lib/legal-fields.ts`, `src/app/(tabs)/account.tsx` | Set `EXPO_PUBLIC_SUPPORT_EMAIL` to a monitored mailbox; the tappable row appears automatically |
| P-03 | MEDIUM | `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE` are unset, so no public legal URL or version date is published | The public pages are not hosted | EXTERNAL | `src/lib/legal-values.ts`, `src/app/privacy.tsx`, `src/app/terms.tsx` | Host the pages, then set the three variables |
| P-08 | — | The 10 legal values are `NEVERIFICAT` as a set beyond the 8 enumerated variables | The original P-08 text is not in the workspace | — | — | Supply the original catalogue |

### 4.2 `DEFERRED_UNTIL_PAID_LAUNCH` (store/account credentials)

| ID | SEVERITY | PROBLEM | WHY STILL OPEN | LOCAL OR EXTERNAL | FILES | FIX PLAN |
| --- | --- | --- | --- | --- | --- | --- |
| RevenueCat production keys | HIGH | Only `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` exists; `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` is missing, so iOS purchases cannot be configured | Production platform keys cannot be issued before the store accounts exist | EXTERNAL | `src/lib/revenuecat.ts`, `.env.example` | Create the apps in App Store Connect / Play Console, then supply the keys as EAS environment variables |
| IAP products | HIGH | `ro.ortodoxia.premium.monthly` / `.annual` do not exist in either store | Products require paid developer accounts | EXTERNAL | `src/lib/revenuecat.ts`, `supabase/functions/revenuecat-webhook/core.ts` | Create both products with those exact identifiers, then attach them to the RevenueCat offering |
| EAS linkage | HIGH | `extra.eas.projectId` and `owner` are absent, so `registerForPushNotificationsAsync()` throws | `eas init` writes these from the Expo account | EXTERNAL | `app.json`, `src/lib/notifications.ts` | Run `eas init` from the project owner's Expo account |
| FCM / APNs credentials | HIGH | Push credentials are not configured in the Expo project | Requires a Firebase project and an Apple developer account | EXTERNAL | `src/lib/notifications.ts` | Upload the FCM v1 service account key and the APNs key to EAS |
| Brand artwork | MEDIUM | The iOS icon is still the Expo template composition (layer `expo-symbol`, grid background) | No Ortodoxia artwork exists in the repository | EXTERNAL | `assets/`, `app.json` | Supply the icon set |
| `LICENSE` holder | LOW | `LICENSE` still carries the Expo template copyright (650 Industries, Inc.) | The distributing entity is not named in the repository | EXTERNAL | `LICENSE` | Replace with the project's own copyright holder |
| `enable_anonymous_sign_ins` | MEDIUM | The guest-chat path calls `signInAnonymously()`; if the Supabase project has anonymous sign-ins disabled the guest thread fails | A project setting, not source | EXTERNAL | `src/lib/supabase.ts`, `src/app/(tabs)/chat.tsx` | Enable anonymous sign-ins in Supabase Auth |
| Supabase redirect allow-list | MEDIUM | `ortodoxia://auth` and the web `/auth` URL must be allow-listed for OAuth and recovery links to return | A project setting | EXTERNAL | `src/lib/native-password-recovery.ts`, `src/app/auth.tsx` | Add both URLs to the Supabase redirect allow-list |
| RevenueCat transfer behaviour | LOW | The `TRANSFER` event is accepted but the project-level transfer setting is unverified | A RevenueCat dashboard setting | EXTERNAL | `supabase/functions/revenuecat-webhook/core.ts` | Confirm the transfer behaviour in the RevenueCat project settings |
| Cron scheduler | MEDIUM | `send-daily-notifications` must be invoked on a schedule | Scheduling is a project/infrastructure setting | EXTERNAL | `supabase/functions/send-daily-notifications/index.ts` | Configure `pg_cron` + `pg_net` (or an external scheduler) after deployment. **Update:** the script is now written (`supabase/cron/schedule-daily-notifications.sql`, every 5 minutes, reads the secret from Vault) and the steps are in `docs/CRON-NOTIFICARI.md` — only the run on the project remains |

### 4.3 `BLOCKED_MISSING_SOURCE_DATA` (content)

| ID | SEVERITY | PROBLEM | WHY STILL OPEN | LOCAL OR EXTERNAL | FILES | FIX PLAN |
| --- | --- | --- | --- | --- | --- | --- |
| daily_content corpus | HIGH | `daily_content` covers 1 of 365 days, so Home shows localized fallback copy and the daily notification sends a generic verse | The reviewed corpus is not in the repository; fabricating liturgical content is prohibited | EXTERNAL | `supabase/migrations/*daily_content*`, `src/app/(tabs)/index.tsx` | Import the reviewed 365-day corpus, then re-run `npm run test:release -- --release` |
| Bible corpus | HIGH | The 7,958 verses exist only in the remote database (per `docs/BIBLE_CONTENT_STATUS.md`), so no seed migration can be written and the Bible tab degrades to an explicit empty state | The corpus is not in the repository | EXTERNAL | `docs/BIBLE_CONTENT_STATUS.md`, `src/app/(tabs)/bible.tsx` | Export the corpus, add it as a seed migration |
| Prayer MP3s | MEDIUM | No `prayers.audio_path` is set, so the audio button falls back to on-device speech | The reviewed MP3s are not in the repository | EXTERNAL | `supabase/migrations/20260915000400_*.sql`, `src/app/(tabs)/prayers.tsx` | Upload the MP3s to the (now private) `prayer-audio` bucket and set `audio_path` |
| 2027 calendars | MEDIUM | Calendar data covers 2026 only; month navigation is clamped and shows a localized empty state | The 2027 liturgical calendars are not published | EXTERNAL | `src/lib/feast-rank.ts`, `src/app/(tabs)/calendar.tsx` | Add the 2027 seeds once published, then widen `SEEDED_CALENDAR_RANGE` |

### 4.4 `DEFERRED_REMOTE_VERIFICATION` (authored, not executed)

| ID | SEVERITY | PROBLEM | WHY STILL OPEN | LOCAL OR EXTERNAL | FILES | FIX PLAN |
| --- | --- | --- | --- | --- | --- | --- |
| `20260915000100` | HIGH | Canonical feast-rank migration (C-01/C-02/C-04/C-07/H-01/H-07/H-10 + two static re-review fixes) has never been executed | No database is reachable from this environment; running it is a remote change, which is prohibited in this round | EXTERNAL | `supabase/migrations/20260915000100_*.sql` | Run in a staging branch, compare `get_calendar_days_localized` output for all 13 countries, then promote |
| `20260915000200` | MEDIUM | Device-claim hardening (C-05) has never been executed | Same | EXTERNAL | `supabase/migrations/20260915000200_*.sql` | Run in staging; verify the audit row is written and the 6th cross-account claim in 24 h is refused |
| `20260915000300` | HIGH | Fail-closed expiry (E-09) + provider provenance (E-10) has never been executed | Same | EXTERNAL | `supabase/migrations/20260915000300_*.sql` | Run in staging; verify the 9-arg RPC is the only `sync_revenuecat_subscription` and that `provider` is recorded |
| `20260915000400` | MEDIUM | `prayer-audio` bucket privacy (C-09) has never been executed | Same | EXTERNAL | `supabase/migrations/20260915000400_*.sql` | Run in staging; verify `getPublicUrl` returns nothing usable and `createSignedUrl` succeeds for `anon` |

**Known limitation of the authored SQL (recorded honestly).** The cross-account claim limit in
`20260915000200` counts rows in a 24 h window without taking a lock on that count, so two
*simultaneous* claims of two *different* tokens by the same account can both pass and land 6 instead
of 5. Same-token claims are serialised by the RPC's `pg_advisory_xact_lock`. The limit is a
backstop, not a hard cap; a strict cap would need a unique/aggregate constraint on the audit table.

---

## 5. `--release` gate: every FAIL is external

`node scripts/release-readiness.mjs --release` → 10 passed / **7 failed** / 3 deferred.

| FAIL | Category | Counterpart marker |
| --- | --- | --- |
| 8 legal values not configured | operator data | `BLOCKED_NEEDS_USER_DATA` |
| no actionable support contact | operator data | `BLOCKED_NEEDS_USER_DATA` |
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` missing | paid credentials | `DEFERRED_UNTIL_PAID_LAUNCH` |
| EAS `projectId` / `owner` missing | remote configuration | `DEFERRED_REMOTE_CONFIGURATION` |
| iOS icon is the Expo template asset | external artwork | `BLOCKED_MISSING_SOURCE_DATA` |
| `LICENSE` attributes the Expo template | operator identity | `BLOCKED_NEEDS_USER_DATA` |
| `daily_content` covers 1 of 365 days | content corpus | `BLOCKED_MISSING_SOURCE_DATA` |

No FAIL is a code defect, and the gate reports the exact variable or file for each. The in-repo CI
mode of the same gate is green (10 passed / 0 failed / 10 deferred).

---

## 6. Counts (honest, evidence-based)

### 6.1 Closed this round

| PRIMARY STATUS | Count |
| --- | --- |
| `FIXED_VERIFIED` | 18 |
| `LOCAL_FIX_VERIFIED` (SQL authored + statically verified; execution deferred) | 2 |
| `DEFERRED_REMOTE_VERIFICATION` (migration authored, not executed) | 4 |
| Unique IDs referenced above | 21 ID rows + 4 migration rows |

### 6.2 Remaining local-technical defects by severity

| Severity | Remaining local-technical count |
| --- | --- |
| CRITICAL | **0** |
| HIGH | **0** — every locally-repairable HIGH found in this round is fixed (B-03/O-03, E-09, CORS/`activeRequest`); the remaining HIGHs are data/credential gaps in §4 |
| MEDIUM | **0** — every locally-repairable MEDIUM found in this round is fixed (E-10, C-09, B-07, B-08, L-05, I-06, J-04, invalid `mailto:`, both static SQL re-review findings, both test-integrity findings); the only MEDIUM remainder is the documented concurrency limitation in §4.4 |
| LOW | **0** safely-fixable — L-06 and K-01 are fixed; nothing else safely fixable was found |

### 6.3 Primary-status totals — **not 102**

| PRIMARY STATUS | Count |
| --- | --- |
| Findings actually identifiable from the repository | 37 letter-ID references + 23 severity-numbered references, with overlap |
| Findings closed and verified this round | 21 distinct rows (§3) |
| Findings remaining OPEN (external / deferred) | 20 distinct rows (§4) |
| Claimed "102" | **`NEVERIFICAT`** — the supplied domain counts sum to 140 (or 114 for A–M), and the supplied six-term expression sums to 121 |

---

## 7. Legal configuration checks (item 6) — all satisfied

| Check | Result |
| --- | --- |
| No invented values | `LEGAL_VALUES` reads only `EXPO_PUBLIC_*`; every unset field stays `null`; no legal entity, address, email or URL exists in the source |
| Checker fails when missing | `--release` mode FAILs with the exact variable names; CI mode reports `DEFERRED` with `BLOCKED_NEEDS_USER_DATA` |
| No literal `{legalEntity}` in the UI | 140 completion tokens normalised → 0; every rendered legal string passes through `fillLegal(...)`, and a missing value renders the localized `legal.toBeCompleted` label, never a raw `{token}` |
| No invalid `mailto:` | `isPlausibleEmail()` rejects 10 malformed/injection forms; `supportMailtoUrl()` returns `null` instead of a broken link |
| All 10 languages complete | 521 keys × 10 locales; `ka` notification rows 370 with CJK 0 / Cyrillic 0; 0 leftover completion tokens |

---

## 8. Prohibited actions — confirmed not taken

| Prohibited action | Count |
| --- | --- |
| `git reset` / `git clean` / `git checkout -- .` | 0 |
| commits | 0 |
| pushes | 0 |
| deploys | 0 |
| `eas build` | 0 |
| `supabase db push` / any remote DB change | 0 |
| remote changes of any kind | 0 |
| paid API calls | 0 |
| invented keys, IDs, legal entities, emails, addresses | 0 |
| fabricated biblical/calendar/notification content | 0 |
| access to `ortodoxia-social-engine` | 0 |
| pre-existing untracked artifacts deleted | 0 |

Files created: 4 migrations (§4.4) + 1 test + 1 report. Files modified: the ones listed in §3.
`HEAD` is still `ae5483ebf55ee0e01683e9bc169cf48c0371c8aa` on `master`; the reflog has no new entry.

---

## 9. The one thing that blocks a true 102-row matrix

**`BLOCKED_NEEDS_SOURCE_DATA`** — the published per-ID finding catalogue (ID → problem → severity →
impact → verified/potential) is not in the workspace and cannot be reconstructed. The four totals in
play (102 / 114 / 121 / 140) are mutually incompatible, and the repository's own references show two
overlapping catalogues (`HIGH #7`…`LOW #23` and `A-01`…`TG-01`).

Everything in this report is derived from executable gates or from ID references present in the
tree. To produce the mandated exclusive-PRIMARY-STATUS matrix that sums to exactly 102, the original
finding list must be supplied; without it, any such matrix would be fabricated.

---

## 10. Round of 2026-10-08 — the later 49-position launch audit

A second, independent read-only audit (49 positions: 11 Play blockers, 12 high, 26 medium/low)
was reconciled against the tree and its code-only positions were repaired in this round. `HEAD`
moved from `019940f` to `8a01197`. The already-verified state was first frozen in 13 small
descriptive commits (explicit paths only, never `git add -A`), then one commit per position, each
committed only on a green gate. Files modified by another writer in the shared tree (`app.json`,
`eas.json`, `docs/LICENTE-CONTINUT.md`, `docs/STORE_SUBMISSION_KIT.md`, `google-services.json`)
were never staged.

### 10.1 Code positions closed (evidence-backed)

| ID | What changed | Commit |
| --- | --- | --- |
| B8 | Auth callback exchanged the session token in the URL; now PKCE (`exchangeCodeForSession`) in `src/lib/supabase.ts` | `f884561` |
| B2 | Anonymous chat history is deleted (client + migration `20260829…`); the purge function is still undeployed (10.2) | `7723809` |
| B3 | `notification_device_claims` retention policy | `c11d0f5` |
| B4 | `live-services-status`: per-request budget + `verify_jwt` | — |
| B7 | In-app AI-answer reporting is in the UI, not only in `ai_reports` (§10.3 of the task report) | — |
| PREMIUM | Webhook fallback, surfaced subscription error, "manage subscription" link, restore flow, trial wording (a–e) | `12ca183` |
| C4 / C5 / C16 | storage fallback, `babel-plugin-react-compiler` declared, `timingSafeEqual` | `0b25fb2` / `20840c0` / `7b31bfb` |
| C10 / C17 / C23 / C25 | as listed in the task report | `23cd6ec`, `9992abd`, `218a7e8` |
| C8 | Accessibility: minimum tap target 44 → 48 dp, icon ≥ 24, back control ≥ 56; audit returns 0 findings over 65 files | `b753e68` |
| C21 | Release build turns on R8 minify **and** resource shrinking, written by `plugins/with-android-hardening.js` at every prebuild (the template reads them with `findProperty(...) ?: false`, `android/app/build.gradle:69`, `:153`) | `8a01197` |

### 10.2 Live probes (read-only, 2026-10-08, project `pgjabfgibdpcomegkojg`)

| Probe | Result | Before |
| --- | --- | --- |
| `GET /rest/v1/verse_favorites` | **200** | 404 `PGRST205` |
| `GET /rest/v1/ai_reports` | **401** `42501` for `anon` (table exists; `anon` denied by design) | 404 |
| `GET daily_content?verse_source=eq.'NULL'` | `Content-Range: */0` | **2158** rows |
| `GET /functions/v1/delete-account` | **405** "Metodă neacceptată" | 404 `NOT_FOUND` |
| `GET /functions/v1/live-services-status` | **200** | 200 |
| `/rpc/purge_guest_chat_history` | **404 `PGRST202`** — still not deployed | 404 |

### 10.3 Gate (executed 2026-10-08, after the last commit)

`tsc` 0 · `tsc:edge` 0 · `npm test` **816 pass / 0 fail / 7 suites** · `test:release` **PASSED**
(31 passed / 0 failed / 3 deferred) · `test:a11y` 0 findings over 65 files · `test:safety` all PASS ·
`lint` clean · `release-readiness --release` exit 1 with **31 passed / 0 failed / 3 deferred**
(fail-closed; the 3 deferred are the two App Store-only variables and the 2027 calendar corpus).
The 816 is the 813 that closed this round plus the three tests added by
`tests/rpc-execute-grants.test.mjs` (§10.6).

### 10.4 C26 — test build with R8 enabled

Test-only artifact (never a store artifact): its own throwaway keystore
(`CN=Ortodoxia Test Build, O=Worker, C=RO`), `GRADLE_EXIT=0`, `BUILD SUCCESSFUL in 13m 33s`,
`Task :app:minifyReleaseWithR8` executed, APK 107,822,106 bytes. The owner's AAB in
`android/app/build/outputs/bundle/release/` was left untouched (86,630,560 bytes,
2026-10-08 19:26:05). The merged manifest of this build passes
`scripts/verify-android-release-manifest.mjs` (0 badge permissions, no cleartext, not debuggable),
the app starts with no crash, and the login chain is green on the minified build
(DoD #1 and #2 both VERDE).

### 10.5 Still owner-only (no code can close these)

1. `google-services.json` must exist at the path `app.json` declares (`./google-services.json`);
   the only copy is `android/app/google-services.json`, and `android/` is gitignored and regenerated.
   Putting that copy at the repository root is **not** an option: the gate’s own credential scanner
   looks for `AIza…` (`release-readiness.mjs:782`) and only skips the generated native folders
   (`release-readiness.mjs:810`), so a root copy turns `[security]` red — measured. Use an EAS
   file-type variable plus a dynamic app config, or an `eas.json` `prebuildCommand`; see
   `docs/ANDROID-HARDENING.md` → “`google-services.json`: where it may live”.
2. Apply `supabase/migrations/20261008000300_retention_guest_chat.sql` and
   `supabase/cron/schedule-retention-purge.sql` (the purge RPC is still 404).
3. Start `supabase/cron/schedule-daily-notifications.sql`.
4. Confirm which upload key signed the released AAB and its Play App Signing registration; the
   newest AAB carries a non-debug certificate with an empty subject DN
   (SHA-256 `30:30:A0:8E:C8:E6:E0:19…`, valid 2026-09-23 → 2054-02-08) that is **not** the repo's
   `android/app/debug.keystore` — the key's identity remains `NEVERIFICAT`.
5. Publish the 2027 calendar corpus, or accept the `DEFERRED` (the UI already shows an explicit
   message instead of an empty grid).

### 10.6 Round 2026-10-08 (evening) — the four post-launch items on the code side

The launch session handed over four items. Two are code-side and one is a rule; this is what the
tree now records, and what it refuses to do.

| Item | Verdict | Evidence |
| --- | --- | --- |
| (a) `google-services.json` at the repository root | **Rejected after measurement** — the copy was made, the gate went red, the copy was reverted | With the root copy: `FAIL [security] 1 possible credential(s) in source`. After removing it: `PASS [security] no hardcoded credential pattern found in the tracked tree`, 31 passed / 0 failed / 3 deferred. The file is re-created from the root path by Expo’s own default prebuild plugins (`@expo/prebuild-config/…/withDefaultPlugins.js:150,152,161`), so the root path is the only missing piece — and it has to come from EAS, not from git |
| (b) Legal URL alignment (`ortodoxia.web.app/privacy` vs `yacplanet.ro/privacy`) | **Open — owner decision** (user-visible value) | Both answer 200 and neither carries placeholder text, but they are two different documents: `ortodoxia.web.app/privacy` names a natural person as operator (Ștefan Ștefan, Rm. Vâlcea, contact@ortodoxiaapp.anonaddy.com), while `yacplanet.ro/privacy` names YAC PLANET S.R.L. (last updated 2 Oct 2026, covers every app in section 2). The repo consistently uses `ortodoxia.web.app` in all three `eas.json` profiles, in `docs/STORE_SUBMISSION_KIT.md:88` and in `tests/release-config.test.mjs:125-126`; only the published listing uses the company domain |
| (c) 2027 calendars | **DEFERRED, unchanged** — no published source and no invented data | `DEFERRED [calendar] calendar data covers only 2026 … BLOCKED_MISSING_SOURCE_DATA` |
| (d) `revoke execute … from public, anon, authenticated` for RPCs that touch user data | **Rule written down and enforced by a test** | `supabase/README.md` (section “Funcții RPC care lucrează pe date de utilizator”) + `tests/rpc-execute-grants.test.mjs`: the 15 `security definer` definitions in 11 pre-08.10.2026 migrations that carry no revoke are frozen as a baseline, a new definition without a revoke fails the suite, and the detector’s own negative case is asserted so the test cannot pass through a broken regex |

Live proof for (d): `POST /rest/v1/rpc/purge_guest_chat_history` with the publishable key answered
**200** before the owner’s `20261008000400_revoke_purge_guest_chat_from_anon.sql` and **401
`permission denied for function`** after it — `revoke … from public` alone does not touch `anon`.
