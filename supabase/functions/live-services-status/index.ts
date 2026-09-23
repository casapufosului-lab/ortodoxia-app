/**
 * Supabase Edge Function: live-services-status
 *
 * Returns the current YouTube live status for all enabled sources.
 * Only communicates with YouTube Data API server-side (secret never exposed).
 *
 * GET  /live-services-status          → all enabled sources
 * GET  /live-services-status?id=...   → single known source (by canonical ID)
 *
 * Accepts ONLY known source IDs. Never accepts arbitrary channel IDs/URLs.
 * Returns sanitized JSON — no API key, no service role key, no raw payloads.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getEligibleSources, getSourceById, LIVE_SOURCES, type LiveSourceDef } from './sources.ts';
import { createYouTubeClient, type YouTubeClient } from './youtube.ts';
import type { CacheStore, CachedStatusRow, SanitizedResponse } from './status.ts';
import {
  computeAllSourceStatuses,
  computeSourceStatus,
  createDiscoveryBudget,
  discoveryBudgetSummary,
} from './status.ts';

import { corsHeaders as buildCorsHeaders, preflightResponse } from '../_shared/http.ts';

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-country-code';

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

// ─── Supabase cache adapter ────────────────────────────────────────────────

function createAdminClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createSupacheCacheAdapter(
  admin: ReturnType<typeof createAdminClient>,
): CacheStore {
  return {
    async get(sourceId: string): Promise<CachedStatusRow | null> {
      const { data, error } = await admin
        .from('live_service_status_cache')
        .select('*')
        .eq('source_id', sourceId)
        .maybeSingle();
      if (error || !data) return null;
      return data as CachedStatusRow;
    },

    async upsert(row: Partial<CachedStatusRow> & { source_id: string }): Promise<void> {
      const { error } = await admin
        .from('live_service_status_cache')
        .upsert(
          { ...row, updated_at: new Date().toISOString() },
          { onConflict: 'source_id' },
        );
      if (error) {
        console.error('live-cache upsert failed', row.source_id, error.message);
      }
    },

    async tryClaimLease(sourceId: string, nowMs: number): Promise<boolean> {
      const leaseUntil = new Date(nowMs + 60_000).toISOString();
      const now = new Date(nowMs).toISOString();

      // Seed a baseline row (ON CONFLICT DO NOTHING) so the conditional UPDATE
      // below can match even on the very first request for a source. Without
      // this, the lease could never be claimed for a brand-new source and the
      // discovery would be skipped forever (always UNKNOWN).
      const { error: seedError } = await admin
        .from('live_service_status_cache')
        .upsert(
          {
            source_id: sourceId,
            status: 'unknown',
            current_video_id: null,
            current_title: null,
            current_channel_id: null,
            embeddable: null,
            checked_at: now,
            live_started_at: null,
            next_refresh_at: now,
            refresh_lease_until: null,
            updated_at: now,
          },
          { onConflict: 'source_id', ignoreDuplicates: true },
        );
      if (seedError) {
        console.error('live-cache lease seed failed', sourceId, seedError.message);
        return false;
      }

      // Atomic: only update if no active lease exists
      const { data, error } = await admin
        .from('live_service_status_cache')
        .update({ refresh_lease_until: leaseUntil, updated_at: now })
        .or(`refresh_lease_until.is.null,refresh_lease_until.lt.${now}`)
        .eq('source_id', sourceId)
        .select('source_id')
        .maybeSingle();

      if (error) {
        console.error('live-cache lease failed', sourceId, error.message);
        return false;
      }
      return Boolean(data);
    },
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  activeRequest = req;
  if (req.method === 'OPTIONS') return preflightResponse(req, ALLOWED_HEADERS);
  if (req.method !== 'GET') return json({ error: 'Metodă neacceptată.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const youtubeApiKey = Deno.env.get('YOUTUBE_DATA_API_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Serviciul nu este configurat.' }, 503);
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey);

  const cache = createSupacheCacheAdapter(admin);
  const apiKeyPresent = Boolean(youtubeApiKey);
  const youtube: YouTubeClient | null = apiKeyPresent
    ? createYouTubeClient(youtubeApiKey!)
    : null;

  const nowMs = Date.now();

  // This function is deployed with verify_jwt = false so that guests (who have no
  // account) can read live status — it is read-only, serves only public broadcast
  // metadata, and never receives the YouTube key. Because it is therefore callable
  // by anyone, the request surface is kept deliberately narrow:
  //   * the country header is validated against the known source registry, so an
  //     arbitrary value cannot influence work performed;
  //   * discovery is bounded by a per-invocation search budget (see status.ts), so
  //     repeated or hostile calls cannot consume the daily API quota;
  //   * `?id=` still accepts only a canonical source id.
  const requestedCountryCode = (req.headers.get('x-country-code') ?? 'RO').trim().toUpperCase();
  const knownCountryCodes = new Set(LIVE_SOURCES.map((source) => source.countryCode));
  if (!knownCountryCodes.has(requestedCountryCode)) {
    return json({ error: 'Cod de țară necunoscut.' }, 400);
  }

  // Optional single-source filter: ?id=trinitas-tv (must be a known canonical ID)
  const requestedId = new URL(req.url).searchParams.get('id');
  const budget = createDiscoveryBudget();

  if (requestedId) {
    const source = getSourceById(requestedId);
    if (!source) {
      return json({ error: 'Sursă necunoscută.' }, 400);
    }
    if (!source.enabled || !source.supportsDynamicLiveDetection) {
      return json({
        sourceId: source.id,
        status: 'unknown',
        checkedAt: new Date(nowMs).toISOString(),
        currentBroadcast: null,
      });
    }
    const result = await computeSourceStatus(source, youtube, cache, nowMs, apiKeyPresent, budget);
    return json({ sources: [result], budget: discoveryBudgetSummary(budget) });
  }

  const eligible = getEligibleSources(requestedCountryCode);
  const results = await computeAllSourceStatuses(eligible, youtube, cache, nowMs, apiKeyPresent, budget);

  return json({ sources: results, budget: discoveryBudgetSummary(budget) });
});
