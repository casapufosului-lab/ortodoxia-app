# Account Deletion — Documentation

> **LOCAL ONLY** — This implementation is not deployed to any live environment.

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
   - `notification_preferences`
   - `chat_messages` (fetched via owned threads first)
   - `chat_threads`
   - `favorites`
   - `usage_daily`
   - `profiles`
4. If any step fails → abort before auth deletion, return 500 with details
5. Delete auth user via `admin.auth.admin.deleteUser(userId)` — final step, triggers remaining cascades

## Deleted Records

| Table | How | Why |
|-------|-----|-----|
| `profiles` | Explicit DELETE by user_id | User profile data |
| `favorites` | Explicit DELETE by user_id | Saved prayer favorites |
| `chat_threads` | Explicit DELETE by user_id | AI conversation threads |
| `chat_messages` | Explicit DELETE by thread_id (via owned threads) | AI conversation messages |
| `usage_daily` | Explicit DELETE by user_id | Daily AI usage counters |
| `notification_devices` | Explicit DELETE by user_id (cascades to notification_deliveries) | Push token registrations |
| `notification_deliveries` | Cascade via notification_devices | Delivery history |
| `notification_preferences` | Explicit DELETE by user_id | Notification settings |
| `auth.users` | `admin.auth.admin.deleteUser()` — final step | Auth account |
| `subscriptions` | Cascade via auth.users DELETE | Billing row (see retained) |

## Retained Data

| Table | Reason |
|-------|--------|
| `prayers`, `daily_content`, `calendar_days`, `bible_verses` | Global content, not user-owned |
| `guest_usage_daily` | Anonymous usage (no user_id) |
| `live_service_status_cache` | System cache, not user-owned |

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
