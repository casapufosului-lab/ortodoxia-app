# AI limits: per device/IP and the global monthly cap (2026-09-23)

Scope: `supabase/migrations/20260923000100_add_client_and_monthly_ai_caps.sql`, the
`orthodox-chat` Edge Function, the client device identifier and the tests around them.
**No live database was touched and nothing was deployed.**

## 1. Why the per-account limit was not a spending limit

The quota gate reserved messages against the authenticated identity: 5 per day free, 50 per day with a
verified paid entitlement. An identity, however, costs nothing to create — the app signs in anonymously
with one call — so "5 messages per account" bounded one account and not one person, and the provider
bill had no ceiling at all. Two brakes close that:

| Brake | Counter | Limit | Applies to | Denial code |
|---|---|---|---|---|
| Account per day | `usage_daily` / `guest_usage_daily` | 5 free / 50 paid | every identity | `daily_limit` |
| Device + IP per day | `ai_client_usage_daily` (scope `device`) | 20 | free identities | `client_limit` |
| IP per day | `ai_client_usage_daily` (scope `ip`) | 60 | free identities | `ip_limit` |
| Global per month | `ai_usage_monthly` (single row) | operator-set, seeded at 20 000 | **everyone**, paid included | `monthly_cap` |
| Cooldown | `last_request_at` | 5 seconds | every identity | `cooldown` |

The device brake alone would be escapable (the identifier is a client value); the IP-only counter is
why rotating it does not help. Both are free-tier brakes, so a verified paid entitlement is not blocked
by them — its own entitlement already pays for 50 messages/day — while the monthly cap stops everyone,
because it exists to bound the provider bill.

## 2. How the client identity is built (and what is never stored)

The Edge Function derives two SHA-256 hashes per request, salted with a server-only secret:

```
client_hash = sha256(salt | "device" | client address | x-device-id)
ip_hash     = sha256(salt | "ip"     | client address)
```

- Salt: `AI_LIMIT_SALT` when set, otherwise the service-role key (already server-only, so the brake
  cannot silently disappear on a deployment that has not set the dedicated secret). No salt and no
  Web Crypto ⇒ **503 before any database access**.
- The client address comes from `cf-connecting-ip` / `x-real-ip` / the first `x-forwarded-for` entry,
  bounded and lower-cased; anything missing or implausible becomes `unknown`, which still yields a
  shared counter instead of no counter.
- The raw address and the device value **never reach SQL or a log line**: only the two hashes travel
  (asserted by `tests/chat-backend.test.mjs`).
- The app's identifier is stored in the platform Keychain / Keystore (`src/lib/ai-limit-device.ts`).
  It is an abuse-control signal, not authentication: the server never trusts it alone.

## 3. The global monthly cap

- One row (`scope = 'global'`) holds `period_start`, `ai_messages` and `message_cap`. Every accepted
  reservation increments it; the counters that were already there move in the same transaction.
- A new Bucharest month resets `ai_messages` to 0 under the same lock that serialises the shared row,
  and the cap is carried forward — a month boundary cannot break chat and cannot silently lift the cap.
- When the cap is reached, the denial carries `retry_after_seconds` up to the next month, so the app can
  say when the budget resets instead of inviting a retry that cannot work.
- A database with **no** budget row raises instead of spending: an unconfigured deployment fails closed.
  The seed value (20 000 messages/month) is a conservative starting brake, not a measured optimum.
- Operator controls (service-role only): `set_ai_monthly_cap(cap)` and `ai_monthly_status()`.

## 4. Release order (not executed here)

1. Apply `20260923000100_add_client_and_monthly_ai_caps.sql`.
2. Deploy the `orthodox-chat` function.

The migration drops the 2-argument `reserve_ai_request` and creates the 4-argument one, so between the
two steps chat answers `500` ("Limita zilnică nu a putut fi verificată") and never calls the model —
failing closed rather than spending without the brake. The old function is dropped rather than given a
default, because a default would leave the old call shape working with no client brake.

Set the dedicated salt before or after step 2 (`AI_LIMIT_SALT` in the function secrets); until then the
service-role key is used. Set the real monthly cap once the provider cost per message is known:

```sql
select * from public.set_ai_monthly_cap(20000);
select * from public.ai_monthly_status();
```

## 5. Verified (executed, not described)

- `node tests/database/ai-caps.mjs <pglite-dist>` — **56 assertions** against a real PostgreSQL engine
  (PGlite) that executes the migration chain: the account limit unchanged, the device brake, the IP
  brake with a rotated device identifier, the monthly cap, the month rollover, the paid exemption, the
  fail-closed paths (invalid/absent hash, no budget row), the operator controls and the privileges.
  PGlite is a test-only dependency (`npm install --no-save @electric-sql/pglite`) and is not part of
  the app; the runner is listed in `scripts/run-tests.mjs` as needing an external engine.
- `npm run test:chat-backend` — the endpoint executed in a sandbox: identical requests produce identical
  hashes, a different device or IP produces different ones, no raw signal is forwarded, a missing Web
  Crypto refuses with 503, and each denial code maps to its own 429.
- `npm test` — includes `tests/ai-limits.test.mjs`: the migration guards, the endpoint/SQL constant
  agreement, the client identifier (stable, persisted, replaced when malformed, never throwing) and this
  document's operator steps.
- `npm run typecheck:all` and `npm run lint:chat-backend` are clean.

## 6. Not verified / open

- No live Supabase run and no deployment: the migration has never been executed against a real database,
  and the endpoint has never been deployed with the new arguments.
- PGlite serialises statements: the advisory locks and `FOR UPDATE` clauses are exercised but not raced.
  A multi-session concurrency check on a real PostgreSQL instance is still required before production.
- The client brake's interaction with shared addresses (a family or an office behind one NAT) is a
  product decision: the paid exemption is the current answer, and 20/60 per day are starting values that
  can be revised in the migration.
- Quota messages are Romanian, like the rest of the server-side errors; the machine-readable codes
  (`client_limit`, `ip_limit`, `monthly_cap`) are what a localized client should map.
- No refund is issued when the upstream AI call fails after a reservation. This keeps the existing
  policy (an accepted reservation consumes one attempt) and prevents repeated failing calls from
  bypassing the limit; it also means a monthly counter can be spent without a reply.
