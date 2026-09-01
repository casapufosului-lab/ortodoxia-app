import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
};

type Preference = {
  user_id: string;
  daily_time: string;
  timezone: string;
  country_code: string;
  language_code: string;
  calendar_code: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function localNow(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodă neacceptată.' }, 405);
  const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'Acces neautorizat.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Serviciul nu este configurat.' }, 503);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: preferences, error: preferencesError } = await admin
    .from('notification_preferences')
    .select('user_id, daily_time, timezone, country_code, language_code, calendar_code')
    .eq('enabled', true);
  if (preferencesError) return json({ error: 'Preferințele nu au putut fi citite.' }, 500);

  let eligible = 0;
  let sent = 0;
  let skipped = 0;
  for (const preference of (preferences ?? []) as Preference[]) {
    const now = localNow(preference.timezone);
    const configuredMinute = preference.daily_time.slice(0, 5);
    if (configuredMinute !== now.time) continue;
    eligible += 1;

    const [contentResult, calendarResult, devicesResult, deliveriesResult] = await Promise.all([
      admin.from('daily_content').select('verse_text, verse_source, parable_title').eq('country_code', preference.country_code).eq('language_code', preference.language_code).eq('content_date', now.date).eq('is_published', true).maybeSingle(),
      admin.from('calendar_days').select('title, saints, fasting_note, feast_rank').eq('country_code', preference.country_code).eq('language_code', preference.language_code).eq('calendar_code', preference.calendar_code).eq('calendar_date', now.date).eq('is_published', true).maybeSingle(),
      admin.from('notification_devices').select('id, expo_push_token').eq('user_id', preference.user_id).eq('is_active', true),
      admin.from('notification_deliveries').select('device_id').eq('content_date', now.date),
    ]);
    if (contentResult.error || devicesResult.error || deliveriesResult.error || !contentResult.data) {
      skipped += 1;
      continue;
    }

    const calendar = calendarResult.data;
    const bodyParts = [`${contentResult.data.verse_text} (${contentResult.data.verse_source})`];
    if (calendar?.title) bodyParts.push(calendar.title);
    if (calendar?.feast_rank === 'cruce roșie') bodyParts.push('Astăzi este zi cu cruce roșie.');
    bodyParts.push('Deschide aplicația pentru mesajul zilei.');
    const deliveredDeviceIds = new Set((deliveriesResult.data ?? []).map((delivery) => delivery.device_id));
    const pendingDevices = (devicesResult.data ?? []).filter((device) => !deliveredDeviceIds.has(device.id));
    const messages = pendingDevices.map((device) => ({
      to: device.expo_push_token,
      title: 'Mesajul zilei',
      body: bodyParts.join(' '),
      data: { url: '/', contentDate: now.date },
      channelId: 'daily-content',
      sound: 'default',
    }));
    if (messages.length === 0) {
      skipped += 1;
      continue;
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      skipped += 1;
      continue;
    }
    const deliveryRows = pendingDevices.map((device) => ({ device_id: device.id, content_date: now.date }));
    await admin.from('notification_deliveries').upsert(deliveryRows, { onConflict: 'device_id,content_date', ignoreDuplicates: true });
    sent += messages.length;
  }

  return json({ success: true, eligible, sent, skipped });
});
