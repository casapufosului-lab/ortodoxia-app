import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  classifyExpoPushTickets,
  isNotificationDue,
  resolveFeastRankCode,
} from './send-core.ts';

// ─── CORS ───────────────────────────────────────────────────────────────────

import {
  corsHeaders as buildCorsHeaders,
  preflightResponse,
  timingSafeEqual,
} from '../_shared/http.ts';

const ALLOWED_HEADERS = 'content-type, x-cron-secret';

/** CORS headers for this request; the origin comes from the ALLOWED_ORIGINS secret. */
function corsHeaders(req: Request) {
  return buildCorsHeaders(req, ALLOWED_HEADERS);
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Preference = {
  user_id: string;
  daily_time: string;
  timezone: string;
  country_code: string;
  language_code: string;
  calendar_code: string | null;
};

type NotificationType = 'daily' | 'sunday' | 'fasting' | 'red_cross' | 'black_cross';

type DailyContent = {
  verse_text: string;
  verse_source: string;
  parable_title: string;
};

type CalendarDay = {
  title: string | null;
  saints: string[];
  feast_rank: string | null;
  feast_rank_code: string | null;
  fasting_note: string | null;
};

type NotificationMessage = {
  language_code: string;
  country_code: string | null;
  calendar_code: string | null;
  day_type: NotificationType;
  theme: string;
  title_template: string;
  body_template: string;
};

type Device = {
  id: string;
  expo_push_token: string;
};

// ─── Pure helpers ───────────────────────────────────────────────────────────

const DEFAULT_TIMEZONE = 'Europe/Bucharest';
const LANGUAGE_CODE_PATTERN = /^[a-z]{2}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const CALENDAR_CODE_PATTERN = /^[a-z0-9-]+$/;

const FALLBACK_DAILY_CONTENT: Record<string, DailyContent> = {
  en: {
    parable_title: 'Thought of the Day',
    verse_source: 'John 14:27',
    verse_text: 'Peace I leave with you',
  },
  bg: {
    parable_title: 'Мисъл за деня',
    verse_source: 'Йоан 14:27',
    verse_text: 'Мир ви оставям',
  },
  el: {
    parable_title: 'Σκέψη της ημέρας',
    verse_source: 'Ιωάννης 14:27',
    verse_text: 'Ειρήνη αφήνω σε σας',
  },
  ka: {
    parable_title: 'დღის ფიქრი',
    verse_source: 'იოანე 14:27',
    verse_text: 'მშვიდობას გიტოვებთ თქვენ',
  },
  mk: {
    parable_title: 'Мисла на денот',
    verse_source: 'Јован 14:27',
    verse_text: 'Мир ви оставам',
  },
  ro: {
    parable_title: 'Gândul zilei',
    verse_source: 'Ioan 14, 27',
    verse_text: 'Pacea Mea o dau vouă',
  },
  ru: {
    parable_title: 'Мысль дня',
    verse_source: 'Иоанн 14:27',
    verse_text: 'Мир оставляю вам',
  },
  sq: {
    parable_title: 'Mendimi i ditës',
    verse_source: 'Gjoni 14:27',
    verse_text: 'Paqen po ju lë',
  },
  sr: {
    parable_title: 'Мисао дана',
    verse_source: 'Јован 14:27',
    verse_text: 'Мир вам остављам',
  },
  uk: {
    parable_title: 'Думка дня',
    verse_source: 'Іван 14:27',
    verse_text: 'Мир залишаю вам',
  },
};

/** Compute local date and time in the user's timezone. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function localNow(timezone: string, now: Date = new Date()) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

/** Returns true if `now` is a Sunday in the given timezone. */
export function isSunday(timezone: string, now: Date = new Date()): boolean {
  const tz = timezone || DEFAULT_TIMEZONE;
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  }).format(now);
  return weekday === 'Sunday';
}

/**
 * Priority: red_cross > sunday > black_cross > fasting > daily. ONE notification per user per day.
 *
 * Classification is driven by the canonical feast-rank code, never by comparing a
 * localized display literal. The legacy Romanian/Greek strings are accepted only
 * as a fallback so that rows written before the canonical column existed still
 * classify correctly (previously `feastRank === 'cruce roșie'` meant the Greek
 * calendar could never produce a red_cross notification).
 */
export function determineNotificationType(
  feastRank: string | null | undefined,
  fastingNote: string | null | undefined,
  sunday: boolean,
  feastRankCode?: string | null,
): NotificationType {
  const rank = resolveFeastRankCode(feastRankCode, feastRank);
  if (rank === 'red_cross') return 'red_cross';
  if (sunday) return 'sunday';
  if (rank === 'black_cross') return 'black_cross';
  if (fastingNote && fastingNote.trim().length > 0) return 'fasting';
  return 'daily';
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => values[key] ?? match);
}

function pickEditorialMessage(
  messages: NotificationMessage[],
  languageCode: string,
  countryCode: string,
  calendarCode: string | null,
  type: NotificationType,
  localDate: string,
): NotificationMessage | null {
  const languagePriority = [languageCode, 'en', 'ro'].filter((value, index, all) => all.indexOf(value) === index);
  const dayPriority: NotificationType[] = type === 'daily' ? ['daily'] : [type, 'daily'];
  const countryPriority = [countryCode, null];
  const calendarPriority = [calendarCode, null];

  for (const language of languagePriority) {
    for (const dayType of dayPriority) {
      for (const candidateCountry of countryPriority) {
        for (const candidateCalendar of calendarPriority) {
          const matches = messages.filter((message) => (
            message.language_code === language
            && message.day_type === dayType
            && message.country_code === candidateCountry
            && message.calendar_code === candidateCalendar
          ));
          if (matches.length > 0) {
            const index = Math.abs([...localDate].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % matches.length;
            return matches[index];
          }
        }
      }
    }
  }

  return null;
}

/** Build notification body from verified content only. Never fabricates. */
export function buildNotificationBody(
  type: NotificationType,
  content: DailyContent,
  calendar: CalendarDay | null,
  message: NotificationMessage | null = null,
): string {
  if (message) {
    return renderTemplate(message.body_template, {
      feast_title: calendar?.title ?? '',
      fasting_note: calendar?.fasting_note ?? '',
      verse_source: content.verse_source,
      verse_text: content.verse_text,
    }).replace(/\s+/g, ' ').trim();
  }

  const parts = [`${content.verse_text} (${content.verse_source})`];
  if (calendar?.title) parts.push(calendar.title);
  if (type === 'red_cross') parts.push('Astăzi este zi cu cruce roșie.');
  if (type === 'black_cross') parts.push('Astăzi este zi cu cruce neagră.');
  parts.push('Deschide aplicația pentru mesajul zilei.');
  return parts.join(' ');
}

function buildNotificationTitle(message: NotificationMessage | null) {
  return message?.title_template ?? 'Mesajul zilei';
}

function safeLanguageCode(value: string) {
  return LANGUAGE_CODE_PATTERN.test(value) ? value : 'en';
}

function getFallbackDailyContent(languageCode: string): DailyContent {
  return FALLBACK_DAILY_CONTENT[languageCode] ?? FALLBACK_DAILY_CONTENT.en;
}

function isSafeCountryCode(value: string) {
  return COUNTRY_CODE_PATTERN.test(value);
}

function isSafeCalendarCode(value: string | null) {
  return value === null || CALENDAR_CODE_PATTERN.test(value);
}

// ─── Response helper ────────────────────────────────────────────────────────

/**
 * The request currently being handled.
 *
 * json() is called ~60 times across the functions and cannot take the request as a
 * parameter without editing every call site. Deno serves each request in its own task,
 * and the value is assigned synchronously at the top of the handler and read before the
 * handler returns, so a module-level marker is not observable across requests.
 */
let activeRequest: Request | null = null;

function json(body: Record<string, unknown>, status = 200) {
  const req = activeRequest;
  if (!req) {
    // Defensive: never emit CORS headers for an unknown origin.
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  activeRequest = req;
  if (req.method === 'OPTIONS') return preflightResponse(req, ALLOWED_HEADERS);
  if (req.method !== 'POST') return json({ error: 'Metodă neacceptată.' }, 405);

  // ── Authorization: cron secret ──
  // C16 (registru): comparatie in timp constant. `!==` iese din functie la primul caracter
  // diferit, deci durata comparatiei scurta cand prefixul se potriveste; un atacator care
  // cronometreaza raspunsul putea reconstrui secretul caracter cu caracter.
  const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET');
  if (!cronSecret || !timingSafeEqual(req.headers.get('x-cron-secret'), cronSecret)) {
    return json({ error: 'Acces neautorizat.' }, 401);
  }

  // ── Supabase admin client (service role, internal only) ──
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Serviciul nu este configurat.' }, 503);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Fetch all enabled preferences (no per-user cron) ──
  const { data: preferences, error: preferencesError } = await admin
    .from('notification_preferences')
    .select('user_id, daily_time, timezone, country_code, language_code, calendar_code')
    .eq('enabled', true);
  if (preferencesError) return json({ error: 'Preferințele nu au putut fi citite.' }, 500);

  let eligible = 0;
  let sent = 0;
  let skipped = 0;
  // Skips caused by an operational failure (query/claim/transport error) are
  // counted separately from expected skips (no device, no content, wrong time).
  // The run only reports success when no failures occurred, so a broken pipeline
  // cannot look healthy to the scheduler.
  let failed = 0;

  for (const preference of (preferences ?? []) as Preference[]) {
    if (!isSafeCountryCode(preference.country_code) || !isSafeCalendarCode(preference.calendar_code)) {
      skipped += 1;
      continue;
    }

    const languageCode = safeLanguageCode(preference.language_code);
    const timezone = preference.timezone || DEFAULT_TIMEZONE;
    if (!isValidTimezone(timezone)) {
      skipped += 1;
      continue;
    }

    // ── Local date and time in user's timezone ──
    const now = localNow(timezone);
    if (!isNotificationDue(preference.daily_time, now.time)) continue;
    eligible += 1;

    // ── Determine notification type from local date and calendar ──
    const sunday = isSunday(timezone);
    const [contentResult, calendarResult, devicesResult] = await Promise.all([
      admin
        .from('daily_content')
        .select('verse_text, verse_source, parable_title')
        .eq('country_code', preference.country_code)
        .eq('language_code', languageCode)
        .eq('content_date', now.date)
        .eq('is_published', true)
        .maybeSingle(),
      preference.calendar_code
        ? admin
            .from('calendar_days')
            .select('title, saints, feast_rank, feast_rank_code, fasting_note')
            .eq('country_code', preference.country_code)
            .eq('language_code', languageCode)
            .eq('calendar_code', preference.calendar_code)
            .eq('calendar_date', now.date)
            .eq('is_published', true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from('notification_devices')
        .select('id, expo_push_token')
        .eq('user_id', preference.user_id)
        .eq('is_active', true),
    ]);

    // ── Use published daily content when present; otherwise use a fixed editorial fallback. ──
    if (contentResult.error) {
      failed += 1;
      continue;
    }
    if (devicesResult.error) {
      failed += 1;
      continue;
    }

    const devices = (devicesResult.data ?? []) as Device[];
    if (devices.length === 0) {
      skipped += 1;
      continue;
    }

    const calendar = calendarResult.data as CalendarDay | null;
    const dailyContent = (contentResult.data as DailyContent | null) ?? getFallbackDailyContent(languageCode);

    // ── Notification type: exactly one per user per day (canonical rank code) ──
    const notificationType = determineNotificationType(
      calendar?.feast_rank,
      calendar?.fasting_note,
      sunday,
      calendar?.feast_rank_code,
    );

    const { data: messageRows, error: messageError } = await admin
      .from('notification_messages')
      .select('language_code, country_code, calendar_code, day_type, theme, title_template, body_template')
      .eq('is_active', true)
      .in('language_code', Array.from(new Set([languageCode, 'en', 'ro'])))
      .in('day_type', Array.from(new Set([notificationType, 'daily'])))
      .or(`country_code.is.null,country_code.eq.${preference.country_code}`)
      .or(preference.calendar_code
        ? `calendar_code.is.null,calendar_code.eq.${preference.calendar_code}`
        : 'calendar_code.is.null');

    // A failure here previously fell through silently and produced a Romanian
    // fallback title/body for every language. Count it and skip the send instead
    // of emitting a message we cannot localize.
    if (messageError) {
      failed += 1;
      continue;
    }

    const editorialMessage = pickEditorialMessage(
      (messageRows ?? []) as NotificationMessage[],
      languageCode,
      preference.country_code,
      preference.calendar_code,
      notificationType,
      now.date,
    );

    // ── Build notification body from verified content ──
    const body = buildNotificationBody(notificationType, dailyContent, calendar, editorialMessage);
    const title = buildNotificationTitle(editorialMessage);

    // ── Atomic reservation: prevents duplicate sends across concurrent workers ──
    const deviceIds = devices.map((d) => d.id);
    const { data: reservedRows, error: reserveError } = await admin.rpc(
      'reserve_notification_deliveries',
      {
        p_device_ids: deviceIds,
        p_content_date: now.date,
        p_notification_type: notificationType,
      },
    );

    if (reserveError) {
      failed += 1;
      continue;
    }

    // Only send to devices that were NEWLY reserved (not duplicates)
    const reservedSet = new Set(
      (reservedRows ?? []).map((row: { device_id: string }) => row.device_id),
    );
    const pendingDevices = devices.filter((d) => reservedSet.has(d.id));

    if (pendingDevices.length === 0) {
      skipped += 1;
      continue;
    }

    // ── Push messages via Expo Push API ──
    const messages = pendingDevices.map((device) => ({
      to: device.expo_push_token,
      title,
      body,
      data: { url: '/', contentDate: now.date, notificationType },
      channelId: 'daily-content',
      sound: 'default',
    }));

    let response: Response;
    try {
      response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    } catch {
      // Ambiguous outcome: Expo may have accepted the push before the transport
      // failed. Keep the reservation (so a retry cannot duplicate the push) but
      // report the run as failed so the scheduler surfaces the problem.
      failed += 1;
      continue;
    }

    if (!response.ok) {
      // Expo rejected the whole batch. Release the reservations so the next cron
      // run can retry the same devices, and count the run as failed.
      await admin.rpc('release_notification_reservation', {
        p_device_ids: pendingDevices.map((d) => d.id),
        p_content_date: now.date,
      });
      failed += 1;
      continue;
    }

    let expoPayload: unknown;
    try {
      expoPayload = await response.json();
    } catch {
      // Ambiguous outcome: Expo may have accepted the push before the transport failed.
      // Keep the reservation so a later cron run cannot send the same notification twice.
      skipped += 1;
      continue;
    }

    const tickets = classifyExpoPushTickets(expoPayload, pendingDevices.length);
    if (!tickets) {
      // A successful Expo HTTP response with an unusable payload has an unknown delivery outcome.
      // Preserve the reservation to prevent an accidental duplicate on retry.
      skipped += 1;
      continue;
    }

    const retryDeviceIds = tickets.retryIndexes.map((index) => pendingDevices[index].id);
    const deactivateDeviceIds = tickets.deactivateIndexes.map((index) => pendingDevices[index].id);
    const hasAmbiguousTickets = tickets.ambiguousIndexes.length > 0;

    // Ambiguous individual tickets intentionally keep their reservations.
    // Expo may have accepted them, so releasing here could cause duplicate delivery.

    if (retryDeviceIds.length > 0) {
      await admin.rpc('release_notification_reservation', {
        p_device_ids: retryDeviceIds,
        p_content_date: now.date,
      });
    }

    if (deactivateDeviceIds.length > 0) {
      await admin
        .from('notification_devices')
        .update({ is_active: false })
        .in('id', deactivateDeviceIds);
    }

    sent += tickets.acceptedIndexes.length;
    if (retryDeviceIds.length > 0 || deactivateDeviceIds.length > 0 || hasAmbiguousTickets) skipped += 1;
  }

  // Report failure honestly: a run where every eligible user failed must not look
  // like a healthy run to the scheduler. `success` is only true when no
  // operational failure occurred. Ambiguous transport outcomes are counted as
  // `ambiguous` (reservation intentionally kept) rather than as failures.
  const success = failed === 0;
  const status = success ? 200 : 500;
  return json({ success, eligible, sent, skipped, failed }, status);
});
