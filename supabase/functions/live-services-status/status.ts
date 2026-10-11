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
 *
 * Discovery ladder (in order, see `discoverLiveStatus`):
 *   1. the public channel `/live` page (`channel-live-page.ts`) - it hands over
 *      CANDIDATE ids, which are verified in one batched `videos.list` call - the only
 *      path that covers permanent 24/7 streams;
 *   2. `search.list?eventType=live` (the original path);
 *   3. the channel's uploads playlist (newest videos).
 * A LIVE from any step wins. If no step finds a stream but one of them failed for
 * an API reason, the verdict is UNKNOWN - never NOT_LIVE.
 */

import type { LivePageProbe, LivePageResolver } from './channel-live-page.ts';
import type { YouTubeClient, LiveSearchResult, VideoVerification } from './youtube.ts';

// ─── Timing constants (centralised) ────────────────────────────────────────

export const DISCOVERY_REFRESH_MS = 90 * 60 * 1000;
export const LIVE_REVALIDATE_MS = 5 * 60 * 1000;
export const LEASE_MS = 60 * 1000;
export const STALE_LIVE_REUSE_MS = 5 * 60 * 1000;
/**
 * Retry window for a verdict that is NOT a verdict: missing API key, API error,
 * malformed response, unverifiable candidate.
 *
 * Such a row must not be cached for the 90-minute discovery interval - that is how
 * a run without `YOUTUBE_DATA_API_KEY` kept every source at `unknown` for 90
 * minutes after the key had already been set. Five minutes re-probes quickly
 * without turning a systematically failing API into a hot loop; the day-scoped
 * search budget still bounds the quota either way. `not_live` keeps the full
 * 90-minute interval - it is a real answer, not a failure.
 */
export const UNKNOWN_RETRY_MS = 5 * 60 * 1000;
/** How many uploads are inspected by the last discovery step. */
export const UPLOAD_CANDIDATE_LIMIT = 3;

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
 *
 * Ladder: channel `/live` page candidates → search.list → uploads playlist, every
 * candidate verified through videos.list against the official channel id.
 * Any unanswered API error leaves the source UNKNOWN (never silently NOT_LIVE).
 */
export async function discoverLiveStatus(
  youtube: YouTubeClient,
  source: SourceDef,
  livePage?: LivePageResolver,
): Promise<YouTubeDiscoveryOutcome> {
  // Set when step 1 found no candidate because the page could not be read. It only
  // ever turns a NOT_LIVE verdict into UNKNOWN, never the other way round.
  let pageUnlooked = false;

  // Step 1 - permanent 24/7 streams. search.list does not list them and the
  // uploads playlist does not contain them (both measured 2026-10-10), so the
  // public channel page is asked for candidate ids, which are then verified through
  // the official videos.list endpoint exactly like any other candidate.
  if (livePage) {
    const attempt = await tryChannelLivePage(youtube, source, livePage);
    if (attempt.kind === 'LIVE') return attempt.outcome;
    // A failed videos.list here is an API failure, so it stays UNKNOWN.
    if (attempt.kind === 'UNRESOLVED') return { status: 'UNKNOWN' };
    if (attempt.kind === 'NONE' && attempt.unlooked) pageUnlooked = true;
  }

  // Step 2 - the original path: search.list with eventType=live.
  const searchAttempt = await trySearchLive(youtube, source);
  if (searchAttempt.kind === 'LIVE') return searchAttempt.outcome;

  // Step 3 - newest uploads (cheap: 2 units for the list + 1 per candidate).
  const uploadAttempt = await tryRecentUploads(youtube, source);
  if (uploadAttempt.kind === 'LIVE') return uploadAttempt.outcome;

  if (
    searchAttempt.kind === 'UNRESOLVED'
    || uploadAttempt.kind === 'UNRESOLVED'
    || pageUnlooked
  ) {
    return { status: 'UNKNOWN' };
  }

  return { status: 'NOT_LIVE' };
}

/**
 * Result of one rung of the ladder.
 *
 * `NONE` means "a valid lookup that found no live stream" - only if EVERY rung
 * says `NONE` is the source NOT_LIVE. `UNRESOLVED` means the question could not be
 * answered (API error, malformed payload, unverifiable candidate) and must keep
 * the source UNKNOWN.
 *
 * `unlooked` on `NONE` means "nothing found, and one lookup could not even be made"
 * (the channel page was unreachable). The caller then refuses NOT_LIVE: an unread
 * page is not evidence that a channel is offline.
 */
type DiscoveryAttempt =
  | { kind: 'LIVE'; outcome: YouTubeDiscoveryOutcome }
  | { kind: 'NONE'; unlooked?: true }
  | { kind: 'UNRESOLVED' };

/**
 * A candidate counts as LIVE only on the official field for it:
 * `snippet.liveBroadcastContent === 'live'`, same channel, no `actualEndTime`.
 * `liveStartedAt` is optional on purpose - the task handed to this function says a
 * permanent stream may not report `actualStartTime`, and a missing timestamp must
 * not turn a live broadcast into UNKNOWN.
 */
function confirmedLive(
  verification: VideoVerification | null,
  source: SourceDef,
): YouTubeDiscoveryOutcome | null {
  if (!verification) return null;
  if (verification.channelId !== source.officialChannelId) return null;
  if (verification.actualEndTime) return null;
  if (verification.liveBroadcastContent !== 'live') return null;

  return {
    status: 'LIVE',
    videoId: verification.videoId,
    channelId: verification.channelId,
    title: verification.title,
    embeddable: verification.embeddable,
    liveStartedAt: verification.actualStartTime,
  };
}

/**
 * Step 1: channel `/live` page candidates → ONE batched videos.list verification.
 *
 * The page yields candidates, not an answer: on the live page the first `"videoId"`
 * belongs to a related-video prefetch and changes between requests (measured from the
 * edge 2026-10-10), so all of them are verified together and the live one owned by the
 * source channel wins. Batching keeps this at one quota unit per source.
 */
async function tryChannelLivePage(
  youtube: YouTubeClient,
  source: SourceDef,
  livePage: LivePageResolver,
): Promise<DiscoveryAttempt> {
  let probe: LivePageProbe;
  try {
    probe = await livePage(source.officialChannelId);
  } catch {
    // The page is only a hint, so the Data API rungs still get their chance - but a
    // page we could not read must not harden into NOT_LIVE either.
    return { kind: 'NONE', unlooked: true };
  }

  const candidates = probe?.candidates ?? [];
  if (candidates.length === 0) {
    return probe?.unreachable ? { kind: 'NONE', unlooked: true } : { kind: 'NONE' };
  }

  let verifications: VideoVerification[];
  try {
    verifications = youtube.verifyVideos
      ? await youtube.verifyVideos(candidates)
      : await verifyCandidatesOneByOne(youtube, candidates);
  } catch {
    // Verifying is an API call: a failure is not an answer.
    return { kind: 'UNRESOLVED' };
  }

  for (const verification of verifications) {
    const outcome = confirmedLive(verification, source);
    if (outcome) return { kind: 'LIVE', outcome };
  }

  // A candidate that is not (or is no longer) live - including one that belongs to
  // another channel, e.g. a recommendation lifted from the page - is discarded rather
  // than reported as NOT_LIVE.
  return { kind: 'NONE' };
}

/**
 * Fallback for a client without the batched call: one `videos.list` per candidate.
 * Same verdict, more quota units - `verifyVideos` exists so callers can avoid it.
 */
async function verifyCandidatesOneByOne(
  youtube: YouTubeClient,
  candidates: string[],
): Promise<VideoVerification[]> {
  const verified: VideoVerification[] = [];
  for (const videoId of candidates) {
    const verification = await youtube.verifyVideo(videoId);
    if (verification) verified.push(verification);
  }
  return verified;
}

/**
 * Step 2: `search.list?eventType=live` + per-candidate verification.
 *
 * The rules of this rung are unchanged from the original implementation (a
 * candidate needs `liveStreamingDetails`, no `actualEndTime` and an
 * `actualStartTime`), because the existing suites pin exactly this behaviour.
 */
async function trySearchLive(
  youtube: YouTubeClient,
  source: SourceDef,
): Promise<DiscoveryAttempt> {
  let candidates: LiveSearchResult[];
  try {
    candidates = await youtube.searchLive(source.officialChannelId);
  } catch {
    return { kind: 'UNRESOLVED' };
  }

  if (candidates.length === 0) {
    return { kind: 'NONE' };
  }

  let sawUnverifiedCandidate = false;

  for (const candidate of candidates) {
    if (candidate.channelId !== source.officialChannelId) continue;

    let verification: VideoVerification | null;
    try {
      verification = await youtube.verifyVideo(candidate.videoId);
    } catch {
      return { kind: 'UNRESOLVED' };
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
      kind: 'LIVE',
      outcome: {
        status: 'LIVE',
        videoId: verification.videoId,
        channelId: verification.channelId,
        title: verification.title,
        embeddable: verification.embeddable,
        liveStartedAt: verification.actualStartTime,
      },
    };
  }

  return { kind: sawUnverifiedCandidate ? 'UNRESOLVED' : 'NONE' };
}

/**
 * Step 3: newest uploads of the channel, verified like any other candidate.
 *
 * Skipped silently when the client does not implement `listRecentUploads` (the
 * in-repo fakes), where it degrades to the previous two-rung behaviour.
 */
async function tryRecentUploads(
  youtube: YouTubeClient,
  source: SourceDef,
): Promise<DiscoveryAttempt> {
  const listRecentUploads = youtube.listRecentUploads;
  if (typeof listRecentUploads !== 'function') return { kind: 'NONE' };

  let uploadIds: string[];
  try {
    uploadIds = await listRecentUploads.call(youtube, source.officialChannelId, UPLOAD_CANDIDATE_LIMIT);
  } catch {
    return { kind: 'UNRESOLVED' };
  }

  for (const videoId of uploadIds.slice(0, UPLOAD_CANDIDATE_LIMIT)) {
    let verification: VideoVerification | null;
    try {
      verification = await youtube.verifyVideo(videoId);
    } catch {
      return { kind: 'UNRESOLVED' };
    }

    const outcome = confirmedLive(verification, source);
    if (outcome) return { kind: 'LIVE', outcome };
  }

  return { kind: 'NONE' };
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
 * Discovery budget.
 *
 * `search.list` costs 100 units of the YouTube Data API daily quota while a
 * `videos.list` revalidation costs 1. With 28 eligible sources and the original
 * 90-minute discovery interval the function issued 28 x 16 = 448 searches per day
 * (~44,800 units) against a default quota of 10,000, so discovery would fail for
 * most of the day and every source would sit at UNKNOWN.
 *
 * Rather than raising the interval (which only moves the problem) the function
 * enforces a ceiling on searches. Cache rows carry `next_refresh_at`, so a source
 * that is skipped now is picked up by a later run.
 *
 * The ceiling is scoped to the DAY, not to the invocation. It used to be created
 * inside the handler, so every request started again with the full allowance and a
 * caller could burn the whole daily quota alone while the comment here claimed the
 * opposite (pre-launch audit, item B4). `createDayScopedDiscoveryBudget` keeps one
 * budget per deployed instance per UTC day, and the endpoint throttles a single
 * client before it can get that far (`rate-limit.ts`).
 */
export const DISCOVERY_SEARCH_COST_UNITS = 100;
export const YOUTUBE_DAILY_QUOTA_UNITS = 10_000;
/** Fraction of the daily quota reserved for discovery (the rest covers videos.list). */
export const DISCOVERY_QUOTA_SHARE = 0.7;
export const DISCOVERY_MAX_SEARCHES_PER_DAY = Math.floor(
  (YOUTUBE_DAILY_QUOTA_UNITS * DISCOVERY_QUOTA_SHARE) / DISCOVERY_SEARCH_COST_UNITS,
);

/**
 * Mutable per-invocation budget handed to every `computeSourceStatus` call.
 * A value of `Infinity` means "unbounded" and is used by tests.
 */
export type DiscoveryBudget = {
  remainingSearches: number;
  skippedForBudget: number;
};

export function createDiscoveryBudget(maxSearches = DISCOVERY_MAX_SEARCHES_PER_DAY): DiscoveryBudget {
  return { remainingSearches: maxSearches, skippedForBudget: 0 };
}

/** UTC day key (`YYYY-MM-DD`) the discovery budget is scoped to. */
export function discoveryBudgetDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export type DayScopedDiscoveryBudget = {
  /** The budget for the day `nowMs` falls in; the same object while the day lasts. */
  forNow(nowMs: number): DiscoveryBudget;
  /** The day the current budget belongs to (`''` before the first call). */
  dayKey(): string;
};

/**
 * One discovery budget per deployed instance per UTC day.
 *
 * Deno keeps a warm instance between requests, so a module-level budget means
 * repeated calls share the allowance instead of restarting it. Cold starts and
 * extra instances still each get their own budget — this bounds accidental and
 * repeated use, while the per-client limiter in `rate-limit.ts` bounds a hostile
 * single caller. A global counter would need a table and is deliberately left to
 * the owner (see docs/LIVE_SERVICES_STATUS.md).
 */
export function createDayScopedDiscoveryBudget(
  maxSearches = DISCOVERY_MAX_SEARCHES_PER_DAY,
): DayScopedDiscoveryBudget {
  let currentDay = '';
  let budget: DiscoveryBudget | null = null;
  return {
    forNow(nowMs: number): DiscoveryBudget {
      const day = discoveryBudgetDayKey(nowMs);
      if (!budget || currentDay !== day) {
        currentDay = day;
        budget = createDiscoveryBudget(maxSearches);
      }
      return budget;
    },
    dayKey(): string {
      return currentDay;
    },
  };
}

function consumeDiscoveryBudget(budget: DiscoveryBudget | undefined): boolean {
  if (!budget) return true;
  if (!Number.isFinite(budget.remainingSearches)) return true;
  if (budget.remainingSearches <= 0) {
    budget.skippedForBudget += 1;
    return false;
  }
  budget.remainingSearches -= 1;
  return true;
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
  budget?: DiscoveryBudget,
  livePage?: LivePageResolver,
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
      // Short retry: a missing secret is a configuration error, not an answer.
      // Caching it for the full discovery interval kept every source `unknown`
      // long after the key had been restored in Supabase.
      next_refresh_at: new Date(nowMs + UNKNOWN_RETRY_MS).toISOString(),
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

  // We hold the lease. Discovery costs 100 quota units, so respect the budget:
  // when it is exhausted the lease is released and the source keeps its previous
  // verdict until a later invocation refreshes it. This bounds the quota a single
  // call (or a flood of calls) can consume.
  if (!consumeDiscoveryBudget(budget)) {
    await cache.upsert({
      source_id: source.id,
      status: row?.status ?? 'unknown',
      current_video_id: row?.current_video_id ?? null,
      current_title: row?.current_title ?? null,
      current_channel_id: row?.current_channel_id ?? null,
      embeddable: row?.embeddable ?? null,
      checked_at: row?.checked_at ?? new Date(nowMs).toISOString(),
      live_started_at: row?.live_started_at ?? null,
      // Retry soon: the budget resets on the next invocation.
      next_refresh_at: new Date(nowMs).toISOString(),
      refresh_lease_until: null,
    });
    if (row && row.status === 'live' && row.current_video_id) {
      const ageMs = nowMs - new Date(row.checked_at).getTime();
      if (ageMs <= STALE_LIVE_REUSE_MS) return sanitise(row, source.id);
    }
    return unknownResponse(source.id, nowMs);
  }

  // We hold the lease → YouTube discovery
  const outcome = await discoverLiveStatus(youtube, source, livePage);

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
    // An API failure is not a verdict: retry soon instead of caching `unknown`
    // for the 90-minute discovery interval (see UNKNOWN_RETRY_MS).
    next_refresh_at: new Date(nowMs + UNKNOWN_RETRY_MS).toISOString(),
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
  budget: DiscoveryBudget = createDiscoveryBudget(),
  livePage?: LivePageResolver,
): Promise<SanitizedResponse[]> {
  const results: SanitizedResponse[] = [];
  for (const source of sources) {
    results.push(
      await computeSourceStatus(source, youtube, cache, nowMs, apiKeyPresent, budget, livePage),
    );
  }
  return results;
}

/** Export of the budget type's counter for logging by callers. */
export function discoveryBudgetSummary(budget: DiscoveryBudget) {
  return {
    remainingSearches: Number.isFinite(budget.remainingSearches) ? budget.remainingSearches : null,
    skippedForBudget: budget.skippedForBudget,
    maxSearchesPerDay: DISCOVERY_MAX_SEARCHES_PER_DAY,
  };
}
