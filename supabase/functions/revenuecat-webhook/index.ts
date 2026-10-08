import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWebhook } from './core.ts';

import { createJsonResponder, preflightResponse } from '../_shared/http.ts';

const ALLOWED_HEADERS = 'authorization, content-type';

/**
 * C17: `json` se construiește în handler, legat de cererea curentă (`createJsonResponder`
 * din `../_shared/http.ts`). Nu mai există nicio stare la nivel de modul, deci o cerere
 * concurentă nu poate împrumuta `Origin`-ul alteia.
 */

/**
 * Webhook RevenueCat → sincronizează `subscriptions` (server-side).
 * Folosește service role doar aici. Nu loghează tokenuri sau payloaduri.
 */
Deno.serve(async (req: Request) => {
  // C17: responderul e legat de această cerere, nu de o variabilă de modul.
  const json = createJsonResponder(req, ALLOWED_HEADERS);
  if (req.method === 'OPTIONS') return preflightResponse(req, ALLOWED_HEADERS);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookAuthToken = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN');
  const revenueCatApiKey = Deno.env.get('REVENUECAT_API_KEY');

  if (!supabaseUrl || !serviceRoleKey || !webhookAuthToken || !revenueCatApiKey) {
    return json({ error: 'Serviciul nu este configurat.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await handleWebhook(req, {
    webhookAuthToken,
    revenueCatApiKey,
    fetcher: fetch,
    admin,
  });
  return json(result.body, result.status);
});
