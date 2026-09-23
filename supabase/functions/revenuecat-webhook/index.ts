import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWebhook } from './core.ts';

import { corsHeaders as buildCorsHeaders, preflightResponse } from '../_shared/http.ts';

const ALLOWED_HEADERS = 'authorization, content-type';

/** CORS headers for this request; the origin comes from the ALLOWED_ORIGINS secret. */
function corsHeaders(req: Request) {
  return buildCorsHeaders(req, ALLOWED_HEADERS);
}

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

/**
 * Webhook RevenueCat → sincronizează `subscriptions` (server-side).
 * Folosește service role doar aici. Nu loghează tokenuri sau payloaduri.
 */
Deno.serve(async (req: Request) => {
  activeRequest = req;
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
