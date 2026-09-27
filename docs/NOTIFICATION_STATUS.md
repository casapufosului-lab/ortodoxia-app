# Notification System Status

> **Status:** LOCAL ONLY — complete locally before any deployment.

## Overview

The Ortodoxia notification system sends daily push notifications with Orthodox Christian content (Bible verses, parables, calendar events) to users at their preferred time. Each user receives **exactly one notification per day**, with type determined by their local date and calendar.

## Notification Types

| Type | Trigger | Priority |
|------|---------|----------|
| `daily` | Default (weekday, no special feast) | Lowest |
| `sunday` | Sunday in user's local timezone | Medium |
| `red_cross` | `feast_rank === 'cruce roșie'` in calendar | **Highest** |

**Priority rule:** If Sunday and `cruce roșie` coincide on the same day, `red_cross` wins. This is deterministic — the calendar seed data is the single source of truth, and no religious invention is involved.

## Architecture

### Client-side (`src/lib/notification-logic.ts`)
Pure helper functions for notification logic. **No React, no Supabase, no network calls.** Testable in isolation.

- `localNow(timezone)` — local date/time in user's timezone using `Intl.DateTimeFormat('en-CA')`
- `isSunday(timezone)` — Sunday detection in user's local timezone
- `determineNotificationType(feastRank, sunday)` — priority resolution
- `isNotificationDue(configuredTime, localTime)` — exact minute match
- `buildNotificationBody(type, content, calendar)` — notification body from verified content only
- `deliveryIdempotencyKey(userId, contentDate, type)` — deterministic dedup key
- `isSupportedCalendar(countryCode, calendarCode)` — validates calendar selection
- `calendarCountryMismatch(countryCode, calendarCode)` — cross-country calendar detection

### Server-side (Edge Function `send-daily-notifications`)

> **Cine o cheamă:** nimeni, încă. Funcția e completă, dar programatorul (Supabase Cron) trebuie
> pornit de proprietar — scriptul e gata în `supabase/cron/schedule-daily-notifications.sql`, iar
> pașii sunt în `docs/CRON-NOTIFICARI.md`. Fără el, notificările nu pleacă.

Se cheamă la fiecare 5 minute (fereastra de potrivire a orei locale e de 5 minute, vezi
`NOTIFICATION_SEND_WINDOW_MINUTES`). Pentru fiecare om cu preferința pornită și ora locală în
fereastră:

1. Fetches daily content, calendar day, and active devices in parallel
2. Determines notification type using `determineNotificationType()`
3. Reserves delivery atomically via `reserve_notification_deliveries()` RPC
4. Sends push notifications via Expo Push API
5. On failure, releases reservation via `release_notification_reservation()` RPC

### Database (migration `20260902000200`)
- Adds `notification_type` column to `notification_deliveries`
- `reserve_notification_deliveries(device_ids, date, type)` — atomic `INSERT ... ON CONFLICT DO NOTHING`
- `release_notification_reservation(device_ids, date)` — releases on failed send

## Region Support

| Country | Language | Calendar | Timezone | Default Calendar |
|---------|----------|----------|----------|-----------------|
| RO | ro | `ro-bor` | `Europe/Bucharest` | `ro-bor` |
| MD | ro | `md-basarabia`, `md-chisinau` | `Europe/Chisinau` | None (user must choose) |

## Safety Rules

1. **No content fabrication** — if `daily_content` is missing for the date, notification is skipped entirely
2. **No duplicate sends** — atomic DB reservation prevents concurrent workers/cron retries from double-sending
3. **Retry-safe** — failed push releases reservation so the next cron run can retry
4. **One notification per user per day** — type is determined once, stored with the delivery record
5. **Timezone-aware** — all date comparisons use user's configured timezone, never UTC

## Environment Variables (Edge Function)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access, internal only) |
| `NOTIFICATION_CRON_SECRET` | Shared secret for cron authorization via `x-cron-secret` header |

## Testing

```bash
# Run notification tests (all pure logic, no network calls)
npm run test:notifications

# Run all tests
npm run test:live && npm run test:notifications
```

Test coverage includes:
- Time window matching (before, at, after)
- UTC/local timezone boundary handling
- Sunday detection across timezones
- Notification type priority (red_cross > sunday > daily)
- Duplicate reservation prevention
- Concurrent worker disjoint sets
- Failed-send retry behavior
- Missing content skip (no fabrication)
- Cron secret authorization
- Edge Function structural checks (via file reads)
- Migration structural checks

## Deployment Order

1. ✅ Create `src/lib/notification-logic.ts` (pure helpers)
2. ✅ Create migration `20260902000200_add_notification_idempotency.sql` (LOCAL ONLY)
3. ✅ Refactor Edge Function to use new helpers + atomic reservation
4. ✅ Create tests `tests/notifications.test.mjs`
5. ✅ Update `package.json` with `test:notifications` script
6. ⏳ Run `supabase db reset` locally to apply migration
7. ⏳ Test locally with `supabase functions serve`
8. ⏳ Deploy migration to staging: `supabase db push`
9. ⏳ Deploy Edge Function: `supabase functions deploy send-daily-notifications`
10. ⏳ Configure cron secret in Supabase dashboard
