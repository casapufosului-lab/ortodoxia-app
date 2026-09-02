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
import { getEligibleSources, getSourceById, type LiveSourceDef } from './sources.ts';
import { createYouTubeClient, type YouTubeClient } from './youtube.ts';
import type { CacheStore, CachedStatusRow, SanitizedResponse } from './status.ts';
import { computeAllSourceStatuses, computeSourceStatus } from './status.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Supabase cache adapter ────────────────────────────────────────────────

function createSupacheCacheAdapter(
  admin: ReturnType<typeof createClient>,
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
        .insert(
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Metodă neacceptată.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const youtubeApiKey = Deno.env.get('YOUTUBE_DATA_API_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Serviciul nu este configurat.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cache = createSupacheCacheAdapter(admin);
  const apiKeyPresent = Boolean(youtubeApiKey);
  const youtube: YouTubeClient | null = apiKeyPresent
    ? createYouTubeClient(youtubeApiKey!)
    : null;

  const nowMs = Date.now();

  // Optional single-source filter: ?id=trinitas-tv (must be a known canonical ID)
  const requestedId = new URL(req.url).searchParams.get('id');

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
    const result = await computeSourceStatus(source, youtube, cache, nowMs, apiKeyPresent);
    return json({ sources: [result] });
  }

  const eligible = getEligibleSources();
  const results = await computeAllSourceStatuses(eligible, youtube, cache, nowMs, apiKeyPresent);

  return json({ sources: results });
});
