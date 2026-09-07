# Chat backend repair, 2026-09-07

Scope: orthodox-chat endpoint, quota reservation migration, dedicated backend tests.
No live database changes or deployment were performed.

## Repaired

- Removed duplicate declarations and code that referenced the request body before parsing.
- Preserved the existing guest ID format and Romanian message length limit (1,200).
- Handles malformed JSON, invalid body shape, AI network errors, invalid AI JSON, and 30-second timeout.
- AI failure removes the optimistic saved user message when database cleanup succeeds.
- Database exceptions return a generic response without internal error details.
- Quota is reserved before creating a new thread, storing messages, or calling AI.
- The database derives 5/50 limits from the verified user's subscription, including monthly/annual and in-window canceled/trialing subscriptions.
- Conditional INSERT/ON CONFLICT checks quota and the five-second cooldown while updating the same row.
- Guest IDs are text, matching the existing schema; the day uses Europe/Bucharest.
- The old incompatible increment_ai_usage function is removed. The replacement is executable only by service_role.

## Quota behavior

Accepted reservations consume one attempt, including later AI or storage failures. No automatic refund is made. Invalid requests and unowned thread IDs do not reserve quota. This intentionally prevents repeated failing upstream calls from bypassing the spending limit.
Guest quotas remain per guest identifier. A guest identifier is not proof of a unique person or device.

## Validation

`npm.cmd run test:chat-backend` executes the actual endpoint with mocked Supabase/AI services and typechecks it against the installed Supabase types. Only the Deno host declarations are provided by the test; the endpoint is not excluded or rewritten for the typecheck.

`node tests/database/chat-quota.mjs <absolute-path-to-pglite-dist/index.js>` creates a fresh in-memory PostgreSQL engine, executes the relevant existing schema/migrations and the new migration, and checks quota, cooldown, subscription rules, identity validation and SQL privileges. It never accepts a database URL.
PGlite is an external test-only dependency and is not added to the application. Tested with PGlite 0.5.8 installed in the coordinator's temporary workspace.

The database test executes SQL, but PGlite serializes requests: it is not a real multi-session PostgreSQL concurrency test. No live Supabase, device UI, real paid AI call, or Deno deployment was tested.

## External release order, not executed

Apply `20260907000100_fix_ai_request_reservation.sql` before deploying the repaired endpoint. Without the migration, the endpoint fails closed with HTTP 500 and does not call AI.
Before production, validate through the Supabase runtime and verify concurrent reservations on a multi-session PostgreSQL instance.

`npm.cmd run lint:chat-backend` runs the existing ESLint rules against the otherwise excluded endpoint. A resolver maps its Deno npm: Supabase import to the installed package; no lint rule is disabled. Both errors and warnings fail the command.

Observed on 2026-09-07: 362/362 suite tests passed (including 21 Chat backend tests); database runner passed 29 assertions. General TypeScript and the dedicated backend typecheck passed.
