/**
 * Mocked tests for the live-services-status Edge Function core logic.
 *
 * These tests NEVER call the real YouTube API. They import the pure TypeScript
 * logic modules (status.ts, youtube.ts) directly under Node's native type
 * stripping and inject fake fetch responses / an in-memory cache store.
 *
 * Run:
 *   node --experimental-strip-types --test supabase/functions/live-services-status/tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fnDir = join(__dirname, '..');

// Import pure TS modules directly (Node 26 native type stripping).
const { computeSourceStatus, computeAllSourceStatuses, discoverLiveStatus } =
  await import(pathToFileURL(join(fnDir, 'status.ts')));
const { createYouTubeClient } = await import(pathToFileURL(join(fnDir, 'youtube.ts')));
const { LIVE_SOURCES, getEligibleSources, getSourceById } = await import(
  pathToFileURL(join(fnDir, 'sources.ts'))
);

// Helper: a canonical source def
const SOURCE = {
  id: 'trinitas-tv',
  officialChannelId: 'UCcqFHIDYfKsaJ5KXZjzW7ZQ',
  enabled: true,
  supportsDynamicLiveDetection: true,
};

// In-memory cache store implementing the CacheStore interface.
function makeMemoryCache(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(sourceId) {
      return store.has(sourceId) ? { ...store.get(sourceId) } : null;
    },
    async upsert(row) {
      store.set(row.source_id, { ...store.get(row.source_id) ?? {}, ...row });
    },
    async tryClaimLease(sourceId, nowMs) {
      // Mirrors the Supabase adapter: the first claim also creates the row
      // (ON CONFLICT DO NOTHING) so brand-new sources can still win the lease.
      const existing = store.get(sourceId);
      const leaseUntil = existing?.refresh_lease_until
        ? new Date(existing.refresh_lease_until).getTime()
        : 0;
      if (leaseUntil > nowMs) return false;
      store.set(sourceId, {
        ...(existing ?? {}),
        source_id: sourceId,
        refresh_lease_until: new Date(nowMs + 60_000).toISOString(),
      });
      return true;
    },
  };
}

function row(nextRefreshOffsetMs, overrides = {}) {
  const now = Date.now();
  return {
    source_id: SOURCE.id,
    status: 'unknown',
    current_video_id: null,
    current_title: null,
    current_channel_id: null,
    embeddable: null,
    checked_at: new Date(now - 1_000).toISOString(),
    live_started_at: null,
    next_refresh_at: new Date(now + nextRefreshOffsetMs).toISOString(),
    refresh_lease_until: null,
    ...overrides,
  };
}

// Fake YouTube client with configurable behavior.
function makeYoutube(overrides = {}) {
  let searchCalls = 0;
  let verifyCalls = 0;
  return {
    calls: { search: () => searchCalls, verify: () => verifyCalls },
    async searchLive() {
      searchCalls += 1;
      if (overrides.searchError) throw overrides.searchError;
      if (overrides.searchReturn) {
        return typeof overrides.searchReturn === 'function'
          ? overrides.searchReturn(searchCalls)
          : overrides.searchReturn;
      }
      return [];
    },
    async verifyVideo(videoId) {
      verifyCalls += 1;
      if (overrides.verifyError) throw overrides.verifyError;
      if (overrides.verifyReturn) return overrides.verifyReturn(videoId);
      return null;
    },
  };
}

const now = () => Date.now();
const T = 90 * 60 * 1000;
const V = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// 1. missing API key → UNKNOWN
// ---------------------------------------------------------------------------
test('missing API key yields UNKNOWN and no YouTube call', async () => {
  const cache = makeMemoryCache();
  const res = await computeSourceStatus(SOURCE, null, cache, now(), false);
  assert.equal(res.status, 'unknown');
  assert.equal(res.currentBroadcast, null);
});

// ---------------------------------------------------------------------------
// 2. unsupported HTTP method → 405 (entry rejects)
// ---------------------------------------------------------------------------
test('entry point rejects unsupported methods', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  assert.ok(idx.includes("if (req.method !== 'GET') return json({ error: 'Metodă neacceptată.' }, 405)"));
});

// ---------------------------------------------------------------------------
// 3. invalid source ID rejected
// ---------------------------------------------------------------------------
test('unknown source ID resolves to undefined', () => {
  assert.equal(getSourceById('nonsense-id'), undefined);
  assert.ok(getSourceById('trinitas-tv'));
});

// ---------------------------------------------------------------------------
// 4. arbitrary client channel ID rejected (server resolves internally)
// ---------------------------------------------------------------------------
test('channel IDs come only from canonical server sources', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  const src = readFileSync(join(fnDir, 'sources.ts'), 'utf8');
  assert.ok(idx.includes("const requestedId = new URL(req.url).searchParams.get('id')"));
  assert.ok(idx.includes('getSourceById(requestedId)'));
  assert.ok(src.includes('UCcqFHIDYfKsaJ5KXZjzW7ZQ'), 'official channel in canonical sources');
  assert.ok(!idx.includes('channelId='), 'client cannot supply channelId param');
});

// ---------------------------------------------------------------------------
// 5. network error → UNKNOWN (never NOT_LIVE)
// ---------------------------------------------------------------------------
test('network error in search yields UNKNOWN', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({ searchError: new Error('network down') });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'UNKNOWN');
});

test('API failure returns UNKNOWN, not false NOT_LIVE (orchestrated)', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({ searchError: new Error('boom') });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(res.status, 'unknown');
  assert.equal(cache.store.get(SOURCE.id).status, 'unknown');
});

// ---------------------------------------------------------------------------
// 6. quota/error response → UNKNOWN
// ---------------------------------------------------------------------------
test('error in verify (quota) yields UNKNOWN for that candidate', async () => {
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'v1', channelId: SOURCE.officialChannelId, title: 'live' }],
    verifyError: new Error('quota exceeded'),
  });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'UNKNOWN');
});

// ---------------------------------------------------------------------------
// 7. malformed YouTube response → UNKNOWN
// ---------------------------------------------------------------------------
test('malformed search response → orchestration UNKNOWN', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({ searchError: new Error('malformed') });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(res.status, 'unknown');
});

// ---------------------------------------------------------------------------
// 8. no current live → NOT_LIVE only after valid lookup
// ---------------------------------------------------------------------------
test('empty search (valid lookup) → NOT_LIVE', async () => {
  const youtube = makeYoutube({ searchReturn: [] });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'NOT_LIVE');
});

// ---------------------------------------------------------------------------
// 9. valid LIVE video
// ---------------------------------------------------------------------------
test('valid live video yields LIVE with verified channel', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'LIVEID', channelId: SOURCE.officialChannelId, title: 'Sf. Liturghie' }],
    verifyReturn: (id) => ({
      videoId: id,
      channelId: SOURCE.officialChannelId,
      title: 'Sf. Liturghie în direct',
      embeddable: true,
      isLiveContent: true,
      actualStartTime: new Date(now() - 600_000).toISOString(),
      actualEndTime: undefined,
    }),
  });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(res.status, 'live');
  assert.equal(res.currentBroadcast.videoId, 'LIVEID');
  assert.equal(res.currentBroadcast.embeddable, true);
  assert.equal(youtube.calls.search(), 1);
});

// ---------------------------------------------------------------------------
// 10. wrong-channel candidate rejected
// ---------------------------------------------------------------------------
test('candidate from another channel is rejected', async () => {
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'HACK', channelId: 'UC-otherchannel', title: 'fake' }],
    verifyReturn: (id) => ({
      videoId: id, channelId: 'UC-otherchannel', title: 'fake',
      embeddable: true, isLiveContent: true, actualStartTime: undefined, actualEndTime: undefined,
    }),
  });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'NOT_LIVE');
  assert.equal(out.videoId, undefined);
});

test('verification whose channel differs from official is rejected', async () => {
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'X', channelId: SOURCE.officialChannelId, title: 'x' }],
    verifyReturn: (id) => ({
      videoId: id, channelId: 'UC-other', title: 'x',
      embeddable: true, isLiveContent: true, actualStartTime: undefined, actualEndTime: undefined,
    }),
  });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'NOT_LIVE');
});

// ---------------------------------------------------------------------------
// 11. non-embeddable LIVE is still reported (UI/client decides)
// ---------------------------------------------------------------------------
test('non-embeddable live is still reported as live', async () => {
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'V', channelId: SOURCE.officialChannelId, title: 't' }],
    verifyReturn: () => ({
      videoId: 'V', channelId: SOURCE.officialChannelId, title: 't',
      embeddable: false, isLiveContent: true, actualStartTime: new Date(now() - 60_000).toISOString(), actualEndTime: undefined,
    }),
  });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'LIVE');
  assert.equal(out.embeddable, false);
});

// ---------------------------------------------------------------------------
// 12. fresh LIVE cache reused
// ---------------------------------------------------------------------------
test('fresh LIVE cache reused without search', async () => {
  const cache = makeMemoryCache({
    [SOURCE.id]: row(V, {
      status: 'live', current_video_id: 'OLDID', current_title: 't', embeddable: true,
    }),
  });
  const youtube = makeYoutube({ searchReturn: [] });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(res.status, 'live');
  assert.equal(res.currentBroadcast.videoId, 'OLDID');
  assert.equal(youtube.calls.search(), 0);
});

// ---------------------------------------------------------------------------
// 13. fresh NOT_LIVE cache reused
// ---------------------------------------------------------------------------
test('fresh NOT_LIVE cache reused without search', async () => {
  const cache = makeMemoryCache({
    [SOURCE.id]: row(T, { status: 'not_live' }),
  });
  const youtube = makeYoutube({ searchReturn: [] });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(res.status, 'not_live');
  assert.equal(youtube.calls.search(), 0);
});

// ---------------------------------------------------------------------------
// 14. fresh cache → zero search calls
// ---------------------------------------------------------------------------
test('fresh cache produces exactly zero search calls', async () => {
  const cache = makeMemoryCache({
    [SOURCE.id]: row(T, { status: 'not_live' }),
  });
  const youtube = makeYoutube({ searchReturn: [] });
  await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(youtube.calls.search(), 0);
});

// ---------------------------------------------------------------------------
// 15. stale cache triggers controlled refresh
// ---------------------------------------------------------------------------
test('stale cache triggers one refresh search', async () => {
  const cache = makeMemoryCache({
    [SOURCE.id]: row(-1, { status: 'not_live' }),
  });
  const youtube = makeYoutube({ searchReturn: [] });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(youtube.calls.search(), 1);
  assert.ok(res.status === 'not_live');
});

// ---------------------------------------------------------------------------
// 16. concurrent stale → no duplicate searches (single-flight lease)
// ---------------------------------------------------------------------------
test('second concurrent caller reuses lease, no duplicate search', async () => {
  const cache = makeMemoryCache();
  let searchCalls = 0;
  const youtube = {
    async searchLive() {
      searchCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return [];
    },
    async verifyVideo() { return null; },
  };
  const caller1 = computeSourceStatus(SOURCE, youtube, cache, now(), true);
  await new Promise((r) => setTimeout(r, 5));
  const caller2 = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  const res1 = await caller1;
  assert.equal(searchCalls, 1, 'only lease holder should search');
  assert.equal(caller2.status, 'unknown');
  assert.equal(res1.status, 'not_live');
});

// ---------------------------------------------------------------------------
// 17. API failure → UNKNOWN, not false NOT_LIVE
// ---------------------------------------------------------------------------
test('verify failure never becomes NOT_LIVE', async () => {
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'V', channelId: SOURCE.officialChannelId, title: 't' }],
    verifyError: new Error('server error'),
  });
  const out = await discoverLiveStatus(youtube, SOURCE);
  assert.equal(out.status, 'UNKNOWN');
});

// ---------------------------------------------------------------------------
// 18. secret never returned
// ---------------------------------------------------------------------------
test('no secret value appears in any API response path', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  const statusSrc = readFileSync(join(fnDir, 'status.ts'), 'utf8');
  assert.ok(statusSrc.includes('SanitizedResponse'));
  assert.ok(!idx.includes('...youtubeApiKey'));
});

// ---------------------------------------------------------------------------
// 19. raw Google payload never returned
// ---------------------------------------------------------------------------
test('YouTube raw payload is never returned to client', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  assert.ok(idx.includes('sources: [result]'));
  assert.ok(idx.includes('sources: results'));
});

// ---------------------------------------------------------------------------
// 20. one-off videoId never enters permanent registry
// ---------------------------------------------------------------------------
test('no videoId field exists in server-side permanent sources', () => {
  const src = readFileSync(join(fnDir, 'sources.ts'), 'utf8');
  // The word videoId may appear in comments; the permanent registry must never
  // assign a current video as configuration (mirrors live-services.test.mjs).
  assert.ok(!src.match(/videoId\s*:/), 'permanent sources must not assign a videoId field');
  assert.ok(!src.includes('current_video_id'), 'no transient field in permanent config');
});

// ---------------------------------------------------------------------------
// 21. disabled source causes zero discovery
// ---------------------------------------------------------------------------
test('disabled source is excluded from eligible sources', () => {
  const eligible = getEligibleSources();
  assert.ok(!eligible.some((s) => s.id === 'sihastria'), 'sihastria disabled → no discovery');
  assert.ok(eligible.some((s) => s.id === 'trinitas-tv'));
});

test('computeAllSourceStatuses honors eligible list only', async () => {
  const cache = makeMemoryCache();
  const results = await computeAllSourceStatuses(
    getEligibleSources(), makeYoutube({ searchReturn: [] }), cache, now(), true,
  );
  assert.equal(results.length, 4);
  assert.ok(!results.some((r) => r.sourceId === 'sihastria'));
});

// ---------------------------------------------------------------------------
// 22. multiple users reuse shared cache
// ---------------------------------------------------------------------------
test('multiple calls reuse shared cache row (single search total)', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({ searchReturn: [] });
  await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  const before = youtube.calls.search();
  const res2 = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(youtube.calls.search(), before);
  assert.ok(res2.status === 'not_live');
});

// ---------------------------------------------------------------------------
// 23. brand-new source (no cache row) can still claim lease and populate
// ---------------------------------------------------------------------------
test('brand-new source with no row claims lease and populates cache', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'BRANDNEW', channelId: SOURCE.officialChannelId, title: 'Sf. Liturghie' }],
    verifyReturn: (id) => ({
      videoId: id, channelId: SOURCE.officialChannelId, title: 'Sf. Liturghie',
      embeddable: true, isLiveContent: true, actualStartTime: new Date(now() - 60_000).toISOString(), actualEndTime: undefined,
    }),
  });
  const res = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(res.status, 'live');
  assert.equal(res.currentBroadcast.videoId, 'BRANDNEW');
  assert.equal(cache.store.get(SOURCE.id).status, 'live');
  assert.equal(youtube.calls.search(), 1);
});

// ---------------------------------------------------------------------------
// X. LIVE → ended → later rediscovery
// ---------------------------------------------------------------------------
test('LIVE then ended: revalidation returns NOT_LIVE and clears broadcast', async () => {
  const cache = makeMemoryCache();
  const youtube = makeYoutube({
    searchReturn: [{ videoId: 'LID', channelId: SOURCE.officialChannelId, title: 't' }],
    verifyReturn: () => ({
      videoId: 'LID', channelId: SOURCE.officialChannelId, title: 't',
      embeddable: true, isLiveContent: true,
      actualStartTime: new Date(now() - 3600_000).toISOString(),
      actualEndTime: undefined,
    }),
  });
  const first = await computeSourceStatus(SOURCE, youtube, cache, now(), true);
  assert.equal(first.status, 'live');
  assert.equal(first.currentBroadcast.videoId, 'LID');

  const cache2 = makeMemoryCache();
  await cache2.upsert({
    source_id: SOURCE.id, status: 'live', current_video_id: 'LID2',
    current_title: 't', current_channel_id: SOURCE.officialChannelId,
    embeddable: true, checked_at: new Date(now() - 1000).toISOString(),
    live_started_at: new Date(now() - 3600_000).toISOString(),
    next_refresh_at: new Date(now() - 1000).toISOString(),
    refresh_lease_until: null,
  });
  const endedYt = makeYoutube({
    searchReturn: [{ videoId: 'LID2', channelId: SOURCE.officialChannelId, title: 't' }],
    verifyReturn: () => ({
      videoId: 'LID2', channelId: SOURCE.officialChannelId, title: 't',
      embeddable: true, isLiveContent: true,
      actualStartTime: new Date(now() - 7200_000).toISOString(),
      actualEndTime: new Date(now() - 60_000).toISOString(),
    }),
  });
  const ended = await computeSourceStatus(SOURCE, endedYt, cache2, now(), true);
  assert.equal(ended.status, 'not_live');
  assert.equal(ended.currentBroadcast, null);
  assert.equal(cache2.store.get(SOURCE.id).status, 'not_live');
  assert.equal(cache2.store.get(SOURCE.id).current_video_id, null);
});

// ---------------------------------------------------------------------------
// Constants sanity
// ---------------------------------------------------------------------------
test('discovery refresh interval ~90 min, live revalidate ~minutes', () => {
  const statusSrc = readFileSync(join(fnDir, 'status.ts'), 'utf8');
  assert.ok(statusSrc.includes('DISCOVERY_REFRESH_MS = 90 * 60 * 1000'));
  assert.ok(statusSrc.includes('LIVE_REVALIDATE_MS = 5 * 60 * 1000'));
});