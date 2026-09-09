/**
 * Live status engine — orchestration for dynamic YouTube live detection.
 *
 * Contains all timing constants and the status computation logic.
 * Dependency-injected for testability: callers supply YouTube client + cache store.
 *
 * Invariants:
 *   - UNKNOWN never silently becomes NOT_LIVE.
 *   - One-off videoId never enters permanent source configuration.
 *   - Disabled sources cause zero YouTube discovery quota usage.
 *   - Concurrent stale callers reuse cache or UNKNOWN (no duplicate searches).
 */

import type { YouTubeClient, LiveSearchResult, VideoVerification } from './youtube.ts';

// ─── Timing constants (centralised) ────────────────────────────────────────

export const DISCOVERY_REFRESH_MS = 90 * 60 * 1000;
export const LIVE_REVALIDATE_MS = 5 * 60 * 1000;
export const LEASE_MS = 60 * 1000;
export const STALE_LIVE_REUSE_MS = 5 * 60 * 1000;

// ─── Status model ───────────────────────────────────────────────────────────

export type LiveStatus = 'live' | 'not_live' | 'unknown';

export type CachedStatusRow = {
  source_id: string;
  status: LiveStatus;
  current_video_id: string | null;
  current_title: string | null;
  current_channel_id: string | null;
  embeddable: boolean | null;
  checked_at: string;
  live_started_at: string | null;
  next_refresh_at: string;
  refresh_lease_until: string | null;
};

export type SanitizedResponse = {
  sourceId: string;
  status: LiveStatus;
  checkedAt: string;
  currentBroadcast: {
    videoId: string;
    title: string;
    embeddable: boolean;
    liveStartedAt: string | undefined;
  } | null;
};

export type SourceDef = {
  id: string;
  officialChannelId: string;
  enabled: boolean;
  supportsDynamicLiveDetection: boolean;
};

export interface CacheStore {
  get(sourceId: string): Promise<CachedStatusRow | null>;
  upsert(row: Partial<CachedStatusRow> & { source_id: string }): Promise<void>;
  tryClaimLease(sourceId: string, nowMs: number): Promise<boolean>;
}

// ─── YouTube discovery ──────────────────────────────────────────────────────

export type YouTubeDiscoveryOutcome = {
  status: 'LIVE' | 'NOT_LIVE' | 'UNKNOWN';
  videoId?: string;
  channelId?: string;
  title?: string;
  embeddable?: boolean;
  liveStartedAt?: string;
};

/**
 * Discover whether a source is currently live.
 * Steps: search.list → videos.list verify → reject wrong channel / ended.
 * Any error → UNKNOWN (never silently NOT_LIVE).
 */
export async function discoverLiveStatus(
  youtube: YouTubeClient,
  source: SourceDef,
): Promise<YouTubeDiscoveryOutcome> {
  let candidates: LiveSearchResult[];
  try {
    candidates = await youtube.searchLive(source.officialChannelId);
  } catch {
    return { status: 'UNKNOWN' };
  }

  if (candidates.length === 0) {
    return { status: 'NOT_LIVE' };
  }

  let sawUnverifiedCandidate = false;

  for (const candidate of candidates) {
    if (candidate.channelId !== source.officialChannelId) continue;

    let verification: VideoVerification | null;
    try {
      verification = await youtube.verifyVideo(candidate.videoId);
    } catch {
      return { status: 'UNKNOWN' };
    }

    if (!verification) continue;
    if (verification.channelId !== source.officialChannelId) continue;
    if (verification.actualEndTime) continue;
    if (!verification.isLiveContent) continue;
    if (!verification.actualStartTime) {
      sawUnverifiedCandidate = true;
      continue;
    }

    return {
      status: 'LIVE',
      videoId: verification.videoId,
      channelId: verification.channelId,
      title: verification.title,
      embeddable: verification.embeddable,
      liveStartedAt: verification.actualStartTime,
    };
  }

  return { status: sawUnverifiedCandidate ? 'UNKNOWN' : 'NOT_LIVE' };
}

// ─── Sanitise cache → response ─────────────────────────────────────────────

export function sanitise(row: CachedStatusRow | null, sourceId: string): SanitizedResponse {
  if (!row) {
    return { sourceId, status: 'unknown', checkedAt: '', currentBroadcast: null };
  }
  return {
    sourceId: row.source_id,
    status: row.status,
    checkedAt: row.checked_at,
    currentBroadcast:
      row.status === 'live' && row.current_video_id
        ? {
            videoId: row.current_video_id,
            title: row.current_title ?? '',
            embeddable: row.embeddable ?? false,
            liveStartedAt: row.live_started_at ?? undefined,
          }
        : null,
  };
}

// ─── Orchestration ──────────────────────────────────────────────────────────

function unknownResponse(sourceId: string, nowMs: number): SanitizedResponse {
  return {
    sourceId,
    status: 'unknown',
    checkedAt: new Date(nowMs).toISOString(),
    currentBroadcast: null,
  };
}

/**
 * Compute status for a single enabled, eligible source.
 * Uses cache + single-flight lease to prevent thundering-herd.
 */
export async function computeSourceStatus(
  source: SourceDef,
  youtube: YouTubeClient | null,
  cache: CacheStore,
  nowMs: number,
  apiKeyPresent: boolean,
): Promise<SanitizedResponse> {
  const row = await cache.get(source.id);

  // Cache is fresh → reuse directly
  if (row && new Date(row.next_refresh_at).getTime() > nowMs) {
    return sanitise(row, source.id);
  }

  // No API key → everything UNKNOWN
  if (!apiKeyPresent || !youtube) {
    await cache.upsert({
      source_id: source.id,
      status: 'unknown',
      current_video_id: null,
      current_title: null,
      current_channel_id: null,
      embeddable: null,
      checked_at: new Date(nowMs).toISOString(),
      live_started_at: null,
      next_refresh_at: new Date(nowMs + DISCOVERY_REFRESH_MS).toISOString(),
      refresh_lease_until: null,
    });
    return unknownResponse(source.id, nowMs);
  }

  // Stale: try single-flight lease
  const leaseClaimed = await cache.tryClaimLease(source.id, nowMs);
  if (!leaseClaimed) {
    if (row?.status === 'live' && row.current_video_id) {
      const ageMs = nowMs - new Date(row.checked_at).getTime();
      if (ageMs <= STALE_LIVE_REUSE_MS) {
        return sanitise(row, source.id);
      }
    }
    return unknownResponse(source.id, nowMs);
  }

  // We hold the lease → YouTube discovery
  const outcome = await discoverLiveStatus(youtube, source);

  if (outcome.status === 'LIVE' && outcome.videoId) {
    await cache.upsert({
      source_id: source.id,
      status: 'live',
      current_video_id: outcome.videoId,
      current_title: outcome.title ?? null,
      current_channel_id: outcome.channelId ?? null,
      embeddable: outcome.embeddable ?? null,
      checked_at: new Date(nowMs).toISOString(),
      live_started_at: outcome.liveStartedAt ?? null,
      next_refresh_at: new Date(nowMs + LIVE_REVALIDATE_MS).toISOString(),
      refresh_lease_until: null,
    });
    return sanitise(
      {
        source_id: source.id,
        status: 'live',
        current_video_id: outcome.videoId,
        current_title: outcome.title ?? null,
        current_channel_id: outcome.channelId ?? null,
        embeddable: outcome.embeddable ?? null,
        checked_at: new Date(nowMs).toISOString(),
        live_started_at: outcome.liveStartedAt ?? null,
        next_refresh_at: new Date(nowMs + LIVE_REVALIDATE_MS).toISOString(),
        refresh_lease_until: null,
      },
      source.id,
    );
  }

  if (outcome.status === 'NOT_LIVE') {
    const notLiveRow: Partial<CachedStatusRow> & { source_id: string } = {
      source_id: source.id,
      status: 'not_live',
      current_video_id: null,
      current_title: null,
      current_channel_id: null,
      embeddable: null,
      checked_at: new Date(nowMs).toISOString(),
      live_started_at: null,
      next_refresh_at: new Date(nowMs + DISCOVERY_REFRESH_MS).toISOString(),
      refresh_lease_until: null,
    };
    await cache.upsert(notLiveRow);
    return sanitise(
      { ...notLiveRow, refresh_lease_until: null } as CachedStatusRow,
      source.id,
    );
  }

  // UNKNOWN: if we had a recent LIVE cache, preserve it
  if (row?.status === 'live' && row.current_video_id) {
    const ageMs = nowMs - new Date(row.checked_at).getTime();
    if (ageMs <= STALE_LIVE_REUSE_MS) {
      await cache.upsert({
        source_id: source.id,
        status: 'live',
        current_video_id: row.current_video_id,
        current_title: row.current_title,
        current_channel_id: row.current_channel_id,
        embeddable: row.embeddable,
        checked_at: row.checked_at,
        live_started_at: row.live_started_at,
        next_refresh_at: new Date(nowMs + LIVE_REVALIDATE_MS).toISOString(),
        refresh_lease_until: null,
      });
      return sanitise(row, source.id);
    }
  }

  await cache.upsert({
    source_id: source.id,
    status: 'unknown',
    current_video_id: null,
    current_title: null,
    current_channel_id: null,
    embeddable: null,
    checked_at: new Date(nowMs).toISOString(),
    live_started_at: null,
    next_refresh_at: new Date(nowMs + DISCOVERY_REFRESH_MS).toISOString(),
    refresh_lease_until: null,
  });
  return unknownResponse(source.id, nowMs);
}

/**
 * Compute statuses for all eligible sources.
 */
export async function computeAllSourceStatuses(
  sources: readonly SourceDef[],
  youtube: YouTubeClient | null,
  cache: CacheStore,
  nowMs: number,
  apiKeyPresent: boolean,
): Promise<SanitizedResponse[]> {
  const results: SanitizedResponse[] = [];
  for (const source of sources) {
    results.push(
      await computeSourceStatus(source, youtube, cache, nowMs, apiKeyPresent),
    );
  }
  return results;
}
