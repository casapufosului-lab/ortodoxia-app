import { createClient } from 'npm:@supabase/supabase-js@2';
import { classifyExpoPushTickets, isNotificationDue } from './send-core.ts';

// ─── CORS ───────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
};

// ─── Types ──────────────────────────────────────────────────────────────────

type Preference = {
  user_id: string;
  daily_time: string;
  timezone: string;
  country_code: string;
  language_code: string;
  calendar_code: string | null;
};

type NotificationType = 'daily' | 'sunday' | 'fasting' | 'red_cross';

type DailyContent = {
  verse_text: string;
  verse_source: string;
  parable_title: string;
};

type CalendarDay = {
  title: string | null;
  saints: string[];
  feast_rank: string | null;
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
  ro: {
    parable_title: 'Gândul zilei',
    verse_source: 'Ioan 14, 27',
    verse_text: 'Pacea Mea o dau vouă',
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

/** Priority: red_cross > sunday > daily. ONE notification per user per day. */
export function determineNotificationType(
  feastRank: string | null | undefined,
  fastingNote: string | null | undefined,
  sunday: boolean,
): NotificationType {
  if (feastRank === 'cruce roșie') return 'red_cross';
  if (sunday) return 'sunday';
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
      verse_source: content.verse_source,
      verse_text: content.verse_text,
    }).replace(/\s+/g, ' ').trim();
  }

  const parts = [`${content.verse_text} (${content.verse_source})`];
  if (calendar?.title) parts.push(calendar.title);
  if (type === 'red_cross') parts.push('Astăzi este zi cu cruce roșie.');
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

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodă neacceptată.' }, 405);

  // ── Authorization: cron secret ──
  const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
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
            .select('title, saints, feast_rank, fasting_note')
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
      skipped += 1;
      continue;
    }
    if (devicesResult.error) {
      skipped += 1;
      continue;
    }

    const devices = (devicesResult.data ?? []) as Device[];
    if (devices.length === 0) {
      skipped += 1;
      continue;
    }

    const calendar = calendarResult.data as CalendarDay | null;
    const dailyContent = (contentResult.data as DailyContent | null) ?? getFallbackDailyContent(languageCode);

    // ── Notification type: exactly one per user per day ──
    const notificationType = determineNotificationType(calendar?.feast_rank, calendar?.fasting_note, sunday);

    const { data: messageRows } = await admin
      .from('notification_messages')
      .select('language_code, country_code, calendar_code, day_type, theme, title_template, body_template')
      .eq('is_active', true)
      .in('language_code', Array.from(new Set([languageCode, 'en', 'ro'])))
      .in('day_type', Array.from(new Set([notificationType, 'daily'])))
      .or(`country_code.is.null,country_code.eq.${preference.country_code}`)
      .or(preference.calendar_code
        ? `calendar_code.is.null,calendar_code.eq.${preference.calendar_code}`
        : 'calendar_code.is.null');

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
      skipped += 1;
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
      // Ambiguous outcome: Expo may have accepted the push before the transport failed.
      // Keep the reservation so a later cron run cannot send the same notification twice.
      skipped += 1;
      continue;
    }

    if (!response.ok) {
      await admin.rpc('release_notification_reservation', {
        p_device_ids: pendingDevices.map((d) => d.id),
        p_content_date: now.date,
      });
      skipped += 1;
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

  return json({ success: true, eligible, sent, skipped });
});
