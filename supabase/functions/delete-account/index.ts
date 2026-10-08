import { createClient } from 'npm:@supabase/supabase-js@2';

import { deleteOwnedData } from './core.ts';

// ─── CORS ───────────────────────────────────────────────────────────────────

import { createJsonResponder, preflightResponse } from '../_shared/http.ts';

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

// ─── Response helper ────────────────────────────────────────────────────────

/**
 * C17: `json` se construiește în handler, legat de cererea curentă (`createJsonResponder`
 * din `../_shared/http.ts`). Nu mai există nicio stare la nivel de modul, deci o cerere
 * concurentă nu poate împrumuta `Origin`-ul alteia.
 */

// ─── Main ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // C17: responderul e legat de această cerere, nu de o variabilă de modul.
  const json = createJsonResponder(req, ALLOWED_HEADERS);
  if (req.method === 'OPTIONS') return preflightResponse(req, ALLOWED_HEADERS);
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
  //    DELETED (lista exactă: ./core.ts → EXPLICITLY_DELETED_TABLES):
  //      - notification_deliveries (via devices)
  //      - notification_devices
  //      - notification_preferences
  //      - chat_messages (via threads)
  //      - chat_threads
  //      - favorites
  //      - verse_favorites
  //      - usage_daily
  //      - profiles
  //
  //    RETAINED / CASCADE ONLY (lista exactă: ./core.ts → CASCADE_ONLY_TABLES):
  //      - subscriptions: billing lifecycle managed by RevenueCat / Apple / Google;
  //        row will cascade-delete with auth.users but the external billing record
  //        persists. Subscriptions rows contain no PII beyond user_id.
  //      - ai_reports: rapoartele de conținut AI; cascadează cu auth.users.
  //
  //    NOT USER-OWNED (global content):
  //      - prayers, daily_content, calendar_days, bible_verses,
  //        live_service_status_cache, guest_usage_daily

  // 4a-4g. Secvența propriu-zisă stă în `./core.ts`, ca modul pur, ca să poată fi EXECUTATĂ de teste
  // (pozițiile C11 și C12 din audit) în loc să fie doar căutată ca text. Ordinea dependențelor și
  // tratarea erorilor sunt documentate acolo.
  const { errors, skipped } = await deleteOwnedData(admin, userId);

  // Tabele lipsă în baza live (migrație neaplicată) nu blochează ștergerea contului, dar se văd în
  // log — fără date de utilizator, doar numele tabelului.
  if (skipped.length > 0) {
    console.warn(`delete-account: tabele inexistente, sărite: ${skipped.join('; ')}`);
  }

  // If any DB cleanup step failed, abort before deleting the auth user to
  // avoid leaving orphaned data that the user cannot request to re-delete.
  if (errors.length > 0) {
    return json({ error: 'Ștergerea datelor nu a reușit. Încearcă din nou.' }, 500);
  }

  // 5. Delete the auth user. This is the final step and triggers the remaining
  //    cascades (subscriptions, ai_reports). It runs only after every user-owned
  //    table above was deleted successfully — so, if this step fails, the data
  //    rows are ALREADY gone: a retry can no longer restore them, it can only
  //    finish deleting the account. (Anteriorul comentariu „retry without data
  //    loss" era fals — vezi poziția C11 din audit.)
  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserErr) {
    return json({ error: 'Contul nu a putut fi șters. Încearcă din nou.' }, 500);
  }

  return json({ success: true });
});
