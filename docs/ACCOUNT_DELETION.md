# Account Deletion — Documentation

> **DEPLOYED** (verified 08.10.2026): `GET /functions/v1/delete-account` answers **405 Method Not Allowed**
> (exists, POST-only — same answer as `orthodox-chat`), so the function **is** published to the live
> project. The line here used to say "LOCAL ONLY — not deployed to any live environment"; measured
> live, that is no longer true.
>
> The table below is machine-checked against the code: `tests/account-deletion.test.mjs:85-88` reads
> this file and fails if any table from `EXPLICITLY_DELETED_TABLES` in
> `supabase/functions/delete-account/core.ts` is not mentioned here.

## Edge Function

- **Name:** `delete-account`
- **Path:** `supabase/functions/delete-account/index.ts`
- **Method:** POST only (GET/PUT/PATCH/DELETE rejected with 405)
- **Auth:** Bearer token in Authorization header (verified server-side)

## Deletion Sequence

1. Verify caller identity via `supabase.auth.getUser(token)` — user ID derived **only** from verified JWT
2. Create service-role client (bypasses RLS) for server-side deletions
3. Delete user-owned data in dependency order:
   - `notification_devices` (cascades to `notification_deliveries`)
   - `notification_device_claims` (audit trail of push-device hand-overs; no foreign key, so it does not
     cascade — deleted in both directions: `previous_user_id = caller` and `new_user_id = caller`)
   - `notification_preferences`
   - `chat_messages` (fetched via owned threads first)
   - `chat_threads`
   - `favorites`
   - `verse_favorites`
   - `usage_daily`
   - `profiles`
4. If any step fails → abort before auth deletion, return 500 with details.
   A table that does not exist yet in the live database (`42P01` / `PGRST205`, e.g. a migration not
   applied) is reported in the function log as `skipped` and does **not** block the deletion: there are
   no rows to delete. The empty DELETE is never silently ignored.
5. Delete auth user via `admin.auth.admin.deleteUser(userId)` — final step, triggers remaining cascades

## Deleted Records

| Table | How | Why |
|-------|-----|-----|
| `profiles` | Explicit DELETE by user_id | User profile data |
| `favorites` | Explicit DELETE by user_id | Saved prayer favorites |
| `verse_favorites` | Explicit DELETE by user_id | Saved verse favorites |
| `chat_threads` | Explicit DELETE by user_id | AI conversation threads |
| `chat_messages` | Explicit DELETE by thread_id (via owned threads) | AI conversation messages |
| `usage_daily` | Explicit DELETE by user_id | Daily AI usage counters |
| `notification_devices` | Explicit DELETE by user_id (cascades to notification_deliveries) | Push token registrations |
| `notification_device_claims` | Explicit DELETE by `previous_user_id` **and** `new_user_id` | Push-device hand-over audit trail (user UUID + device UUID) |
| `notification_deliveries` | Cascade via notification_devices | Delivery history |
| `notification_preferences` | Explicit DELETE by user_id | Notification settings |
| `auth.users` | `admin.auth.admin.deleteUser()` — final step | Auth account |
| `subscriptions` | Cascade via auth.users DELETE | Billing row (see retained) |
| `ai_reports` | Cascade via auth.users DELETE | AI content reports (free text written by the user) |

The code list is authoritative and machine-checked: `supabase/functions/delete-account/core.ts`
(`EXPLICITLY_DELETED_TABLES`, `CASCADE_ONLY_TABLES`, `AUDIT_EXEMPT_TABLES`) is asserted against the
migrations by `tests/account-deletion.test.mjs` and `tests/notification-device-claims-deletion.test.mjs`, so
a user-owned table added later cannot be forgotten here. Tables that hold a user UUID **without** a foreign
key (invisible to the cascade rule) are discovered from the migrations by
`scanUserAuditTables()` in `scripts/lib/deletion-coverage.mjs` and must be deleted explicitly or exempted
with a written reason.

## Retained Data

| Table | Reason |
|-------|--------|
| `prayers`, `daily_content`, `calendar_days`, `bible_verses` | Global content, not user-owned |
| `guest_usage_daily` | Anonymous usage (no user_id) — purged after **31 days** (see below) |
| `live_service_status_cache` | System cache, not user-owned |

## Server-side Retention (B2 + B3)

Deleting an account is a **user action**. Two kinds of rows belong to somebody who never presses a
button — an anonymous (guest) session created by `signInAnonymously`, and the push-device audit
trail — so they need a **scheduled** cleanup. Without it, a guest's transcript stays under a real
`auth.users.id` forever, which is exactly the audit finding B2.

- **Function:** `public.purge_guest_chat_history(p_days integer default 30, p_claim_days integer default 180, p_usage_days integer default 31)`
- **Migration:** `supabase/migrations/20261008000300_retention_guest_chat.sql` (not applied live yet)
- **Schedule:** `supabase/cron/schedule-retention-purge.sql` — daily 03:30 UTC, run once by the owner
  from the SQL Editor after enabling `pg_cron`

| Window | What it removes | Why this number |
|--------|-----------------|-----------------|
| **30 days** | `chat_threads` of anonymous users idle for 30 days (messages follow via `on delete cascade`) | A guest who has not opened the app in a month has no live conversation; the transcript is the sensitive part |
| **180 days** | `notification_device_claims` older than 180 days | Append-only audit trail of device hand-overs (B3); long enough to investigate a dispute, short enough not to be a permanent device-id log |
| **31 days** | `guest_usage_daily` rows (installation counters, no user_id) | The daily AI limit is a same-day guard; one day of slack prevents an off-by-one at midnight |
| **30 days** | abandoned anonymous `auth.users` rows (no threads left, no `favorites`, no `subscriptions`) | Retires the empty identity itself. The `favorites`/`subscriptions` guards are deliberate: a guest who saved a prayer or paid for Premium keeps the account |

The numbers above are repeated in the migration (as defaults, validated so a bad call cannot wipe
everything), in the cron file, and here — they are the promise behind the Data safety form, so they
are asserted by `tests/retention-guest-chat.test.mjs`.

**Client-side counterpart:** `src/lib/chat-history.ts` (`deleteChatHistoryForSession`) lets the
current session — guest or account — erase its own conversation on demand. It deletes only
`chat_threads` rows filtered by the **session's own** id (messages cascade), because
`chat_messages` has no client DELETE policy. `src/app/(tabs)/chat.tsx` renders the "clear history"
action with a confirmation and a localized result message in all 10 languages.

## Retention Note — Subscriptions

The `subscriptions` table has `ON DELETE CASCADE` on `auth.users(id)`, so deleting the auth user also removes the local subscription row. This is acceptable because:

- The actual billing lifecycle is managed externally by **RevenueCat / Apple / Google**
- The user can cancel via App Store / Google Play regardless of the app account
- The `subscriptions` row contains no PII beyond `user_id`

## Client Integration

- **Helper:** `src/lib/account-deletion.ts` — `requestAccountDeletion()` invokes the Edge Function
- **UI:** `src/app/(tabs)/account.tsx` — "Zona periculoasă" section with "Șterge contul" button
- **Two explicit confirmations** via Alert.alert before deletion is executed
- **Double-submit prevention** via `deleteBusy` guard
- **Error recovery** — loading state always resolves; user is never stuck
- **Post-deletion:** signOut + redirect to home

## Deployment Steps (not yet done)

1. Deploy Edge Function: `supabase functions deploy delete-account`
2. Set secrets in Supabase Dashboard → Edge Functions → Secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Test with a throwaway account in development

## Legal/Support Placeholders

- Privacy Policy (section 8) already describes account deletion behavior
- Terms (section 3) references privacy policy for deletion details
- No additional legal placeholders needed for this feature
