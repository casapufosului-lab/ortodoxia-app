import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWebhook } from './core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Webhook RevenueCat → sincronizează `subscriptions` (server-side).
 * Folosește service role doar aici. Nu loghează tokenuri sau payloaduri.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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
