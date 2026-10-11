import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleSyncUser } from './core.ts';

import { corsHeaders, createJsonResponder, preflightResponse } from '../_shared/http.ts';

const ALLOWED_HEADERS = 'authorization, content-type';

/**
 * Reconciliere cerută de aplicație (T3, 10.10.2026).
 *
 * `verify_jwt = true` (vezi `supabase/config.toml`): poarta o face platforma, iar identitatea este
 * luată aici, o dată, din tokenul verificat. Corpul cererii nu este citit — un client nu poate
 * cere sincronizarea altui utilizator. Se folosește service role doar pentru RPC-ul de scriere.
 */
Deno.serve(async (req: Request) => {
  const json = createJsonResponder(req, ALLOWED_HEADERS);
  if (req.method === 'OPTIONS') return preflightResponse(req, ALLOWED_HEADERS);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const revenueCatApiKey = Deno.env.get('REVENUECAT_API_KEY');

  if (!supabaseUrl || !serviceRoleKey || !revenueCatApiKey) {
    return json({ error: 'Serviciul nu este configurat.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Identitatea: tokenul de sesiune este validat la GoTrue; fără token valid nu există utilizator.
  const getUser = async (accessToken: string): Promise<{ id: string } | null> => {
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error) return null;
    const user = data?.user ?? null;
    return user ? { id: user.id } : null;
  };

  const result = await handleSyncUser(req, {
    revenueCatApiKey,
    getUser,
    fetcher: fetch,
    admin,
  });

  if (result.status === 204 || !result.body) {
    return new Response(null, { status: result.status, headers: corsHeaders(req, ALLOWED_HEADERS) });
  }

  return json(result.body, result.status);
});
