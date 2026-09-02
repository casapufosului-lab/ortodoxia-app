/**
 * Client-side live-status fetching and validation.
 *
 * Calls the `live-services-status` Edge Function via Supabase Functions
 * and validates the response shape before rendering. Never exposes any
 * YouTube API key — all discovery happens server-side.
 *
 * This is the ONLY network call the client makes for live detection.
 * A single efficient request fetches all enabled sources at once.
 */

import { supabase } from '@/lib/supabase';

import type { LiveStatus } from './types';

// ─── Response types ────────────────────────────────────────────────────────

/** A single source's live status as returned by the sanitized backend. */
export interface SourceStatusResponse {
  sourceId: string;
  status: LiveStatus;
  checkedAt: string;
  currentBroadcast: {
    videoId: string;
    title: string;
    embeddable: boolean;
    liveStartedAt?: string;
  } | null;
}

/** Shape of the full Edge Function response. */
export interface LiveStatusResult {
  sources: SourceStatusResponse[];
}

// ─── Validation ────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<string>(['live', 'not_live', 'unknown']);

function isLiveStatus(value: unknown): value is LiveStatus {
  return typeof value === 'string' && VALID_STATUSES.has(value);
}

/**
 * Validate a single source status object from the backend response.
 * Returns null for malformed data instead of throwing.
 */
export function validateSourceStatus(data: unknown): SourceStatusResponse | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  if (typeof obj.sourceId !== 'string') return null;
  if (!isLiveStatus(obj.status)) return null;
  if (typeof obj.checkedAt !== 'string') return null;

  // currentBroadcast may be null (no live broadcast known)
  if (obj.currentBroadcast != null) {
    if (typeof obj.currentBroadcast !== 'object') return null;
    const cb = obj.currentBroadcast as Record<string, unknown>;
    if (typeof cb.videoId !== 'string') return null;
    if (typeof cb.title !== 'string') return null;
    if (typeof cb.embeddable !== 'boolean') return null;
  }

  return {
    sourceId: obj.sourceId,
    status: obj.status as LiveStatus,
    checkedAt: obj.checkedAt,
    currentBroadcast: obj.currentBroadcast
      ? {
          videoId: (obj.currentBroadcast as Record<string, unknown>).videoId as string,
          title: (obj.currentBroadcast as Record<string, unknown>).title as string,
          embeddable: (obj.currentBroadcast as Record<string, unknown>).embeddable as boolean,
          liveStartedAt: (obj.currentBroadcast as Record<string, unknown>).liveStartedAt as
            | string
            | undefined,
        }
      : null,
  };
}

// ─── Fetching ──────────────────────────────────────────────────────────────

/** User-facing Romanian error for backend failure. */
export const LIVE_STATUS_FETCH_ERROR = 'Nu am putut verifica transmisiunile acum.';

/**
 * Fetch live statuses for all enabled sources in a single Edge Function call.
 *
 * - Never calls YouTube Data API directly.
 * - Never exposes API keys in client code.
 * - Malformed data fails safely (filtered out, never crashes).
 * - No duplicate requests from rerenders (caller manages invocation).
 */
export async function fetchLiveStatuses(): Promise<LiveStatusResult> {
  const { data, error } = await supabase.functions.invoke('live-services-status');

  if (error || !data) {
    console.warn('live-services-status fetch failed:', error?.message ?? 'no data');
    throw new Error(LIVE_STATUS_FETCH_ERROR);
  }

  if (!data.sources || !Array.isArray(data.sources)) {
    console.warn('live-services-status: unexpected response shape');
    throw new Error(LIVE_STATUS_FETCH_ERROR);
  }

  const sources = (data.sources as unknown[])
    .map(validateSourceStatus)
    .filter((s): s is SourceStatusResponse => s !== null);

  return { sources };
}
