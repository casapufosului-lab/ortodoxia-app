import { createClient } from 'npm:@supabase/supabase-js@2';

// ─── CORS ───────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Response helper ────────────────────────────────────────────────────────

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodă neacceptată.' }, 405);

  // 1. Read environment
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Serviciul nu este configurat.' }, 503);
  }

  // 2. Verify caller identity from Authorization header ONLY.
  //    The user ID is derived exclusively from the verified JWT — never from
  //    the request body or any client-supplied parameter.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Autentificare necesară.' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !userData?.user?.id) {
    return json({ error: 'Autentificare invalidă.' }, 401);
  }

  const userId = userData.user.id;

  // 3. Service-role client for server-side deletions (bypasses RLS).
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 4. Delete user-owned data in dependency order.
  //    Tables with ON DELETE CASCADE on auth.users will also cascade, but we
  //    delete explicitly for clarity and to control the sequence.
  //
  //    DELETED:
  //      - notification_deliveries (via devices)
  //      - notification_devices
  //      - notification_preferences
  //      - chat_messages (via threads)
  //      - chat_threads
  //      - favorites
  //      - usage_daily
  //      - profiles
  //
  //    RETAINED:
  //      - subscriptions: billing lifecycle managed by RevenueCat / Apple / Google;
  //        row will cascade-delete with auth.users but the external billing record
  //        persists. Subscriptions rows contain no PII beyond user_id.
  //
  //    NOT USER-OWNED (global content):
  //      - prayers, daily_content, calendar_days, bible_verses,
  //        live_service_status_cache, guest_usage_daily

  const errors: string[] = [];

  // 4a. notification_deliveries (via notification_devices cascade)
  const { error: ndevErr } = await admin
    .from('notification_devices')
    .delete()
    .eq('user_id', userId);
  if (ndevErr) errors.push(`notification_devices: ${ndevErr.message}`);

  // 4b. notification_preferences
  const { error: nprefErr } = await admin
    .from('notification_preferences')
    .delete()
    .eq('user_id', userId);
  if (nprefErr) errors.push(`notification_preferences: ${nprefErr.message}`);

  // 4c. chat_messages — delete by joining on owned threads
  //     We fetch thread IDs first, then delete messages for each.
  const { data: threads, error: threadListErr } = await admin
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId);

  if (!threadListErr && threads && threads.length > 0) {
    const threadIds = threads.map((t: { id: string }) => t.id);
    const { error: msgsErr } = await admin
      .from('chat_messages')
      .delete()
      .in('thread_id', threadIds);
    if (msgsErr) errors.push(`chat_messages: ${msgsErr.message}`);
  }

  // 4d. chat_threads
  const { error: threadsErr } = await admin
    .from('chat_threads')
    .delete()
    .eq('user_id', userId);
  if (threadsErr) errors.push(`chat_threads: ${threadsErr.message}`);

  // 4e. favorites
  const { error: favErr } = await admin
    .from('favorites')
    .delete()
    .eq('user_id', userId);
  if (favErr) errors.push(`favorites: ${favErr.message}`);

  // 4f. usage_daily
  const { error: usageErr } = await admin
    .from('usage_daily')
    .delete()
    .eq('user_id', userId);
  if (usageErr) errors.push(`usage_daily: ${usageErr.message}`);

  // 4g. profiles
  const { error: profileErr } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (profileErr) errors.push(`profiles: ${profileErr.message}`);

  // If any DB cleanup step failed, abort before deleting the auth user to
  // avoid leaving orphaned data that the user cannot request to re-delete.
  if (errors.length > 0) {
    return json({ error: 'Ștergerea datelor nu a reușit. Încearcă din nou.', details: errors }, 500);
  }

  // 5. Delete the auth user. This is the final step and triggers any remaining
  //    cascades (e.g., subscriptions). Must be done last so that if it fails,
  //    the user can retry without data loss.
  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserErr) {
    return json({ error: 'Contul nu a putut fi șters. Încearcă din nou.' }, 500);
  }

  return json({ success: true });
});
