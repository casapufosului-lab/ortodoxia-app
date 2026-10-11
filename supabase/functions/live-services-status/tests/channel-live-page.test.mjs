/**
 * Tests for permanent 24/7 stream discovery (`channel-live-page.ts` + the ladder
 * in `status.ts`).
 *
 * BACKGROUND (measured 2026-10-10, TRINITAS TV `UCcqFHIDYfKsaJ5KXZjzW7ZQ`):
 * `search.list?eventType=live` returns ZERO items for a channel whose 24/7 stream
 * is on air, and the stream is not in the newest uploads either. The channel's
 * public `/live` URL serves what it broadcasts right now - those hints are collected
 * here and then verified through the official `videos.list` endpoint.
 *
 * WHY THE RESOLVER RETURNS CANDIDATES (measured from the deployed edge, not locally):
 *   - `GET /channel/<id>/live` answers 200 with the SAME url - there is no redirect to
 *     `/watch?v=`, so the id can only come out of the HTML;
 *   - that HTML has no `og:url` and a canonical link of literally `href="undefined"`;
 *   - its FIRST `"videoId"` belongs to a `webPrefetchData` block for a RELATED video and
 *     changes on every request; the channel's own live stream sat at unique index 1 in
 *     all four samples.
 * A single-id rule therefore reported the wrong video (or nothing), which is what
 * `edgeShapedPage()` below pins down: the first candidate is foreign, the real stream
 * comes later, and only `videos.list` may decide.
 *
 * NO REAL NETWORK: fetch is simulated at both layers (the page request is answered
 * with HTML/redirect fixtures, the API request with JSON fixtures). A request that
 * is not expected fails the test that made it.
 *
 * Run:
 *   node --experimental-strip-types --test supabase/functions/live-services-status/tests/channel-live-page.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const fnDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const { createChannelLivePageResolver, extractVideoIdFromHtml, extractVideoIdsFromHtml } = await import(
  pathToFileURL(join(fnDir, 'channel-live-page.ts'))
);
const { createYouTubeClient } = await import(pathToFileURL(join(fnDir, 'youtube.ts')));
const { discoverLiveStatus, computeSourceStatus, UNKNOWN_RETRY_MS } = await import(
  pathToFileURL(join(fnDir, 'status.ts'))
);

const SOURCE = {
  id: 'trinitas-tv',
  officialChannelId: 'UCcqFHIDYfKsaJ5KXZjzW7ZQ',
  enabled: true,
  supportsDynamicLiveDetection: true,
};

/** A real 24/7 stream id shape (11 chars) - the value DSH measured as live. */
const LIVE_VIDEO_ID = 'gBveUPzZkuU';
/** The unrelated recommendation the edge page lists FIRST (observed value). */
const RELATED_ID = 'fDG_C0kPO-A';
const FOREIGN_CHANNEL_ID = 'UC-other-channel-0000000';
const PAGE_URL = `https://www.youtube.com/channel/${SOURCE.officialChannelId}/live`;

// ── fetch fixtures ────────────────────────────────────────────────────────────

function htmlResponse(html, url) {
  return {
    ok: true,
    status: 200,
    url,
    async text() {
      return html;
    },
    async json() {
      throw new Error('page is not JSON');
    },
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    url: 'https://www.googleapis.com/youtube/v3/videos',
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    url: 'https://www.googleapis.com/youtube/v3/videos',
    async json() {
      return { error: { code: status, message } };
    },
    async text() {
      return message;
    },
  };
}

/**
 * Routing fetch: records every URL, answers each route, and throws on an
 * unexpected URL so a stray request can never pass silently.
 */
function makeFetch(routes) {
  const seen = [];
  const fn = async (url) => {
    const u = String(url);
    seen.push(u);
    for (const [needle, handler] of routes) {
      if (u.includes(needle)) return handler(u);
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  fn.urlsMatching = (needle) => seen.filter((u) => u.includes(needle));
  /** The `id` query parameter of the nth request to a route (`id=a,b,c`). */
  fn.idParam = (needle, occurrence = 0) => {
    const urls = seen.filter((u) => u.includes(needle));
    const url = urls[occurrence];
    if (!url) return null;
    return new URL(url).searchParams.get('id');
  };
  fn.maxResultsParam = (needle, occurrence = 0) => {
    const urls = seen.filter((u) => u.includes(needle));
    const url = urls[occurrence];
    return url ? new URL(url).searchParams.get('maxResults') : null;
  };
  return fn;
}

/** One `videos.list` item, live and owned by the source channel unless overridden. */
function videoItem(videoId, overrides = {}) {
  return {
    id: videoId,
    snippet: {
      channelId: SOURCE.officialChannelId,
      title: 'Sfânta Liturghie — în direct',
      liveBroadcastContent: 'live',
      ...(overrides.snippet ?? {}),
    },
    status: { embeddable: overrides.embeddable ?? true },
    liveStreamingDetails: {
      actualStartTime: '2026-10-10T04:00:00Z',
      ...(overrides.liveStreamingDetails ?? {}),
    },
  };
}

/**
 * A `videos.list` body. Pass a single id (with overrides) or a list of `{ id, ... }`
 * entries for a batched lookup.
 */
function videosListBody(entries, overrides = {}) {
  const items = Array.isArray(entries)
    ? entries.map((entry) => (typeof entry === 'string'
      ? videoItem(entry, overrides)
      : videoItem(entry.id, entry)))
    : [videoItem(entries, overrides)];
  return { items };
}

/**
 * The page the deployed edge really receives (measured 2026-10-10, reproduced from the
 * probe output): no `og:url`, canonical `href="undefined"`, and the first `"videoId"`
 * belongs to a related-video prefetch while the channel's own live stream appears
 * later, among ~20 other ids that repeat like the real page does.
 */
function edgeShapedPage({ relatedId = RELATED_ID, liveId = LIVE_VIDEO_ID, fillers = 8 } = {}) {
  const fillerIds = Array.from({ length: fillers }, (_, i) => `f${String(i).padStart(10, '0')}`);
  const head = '<!doctype html><html><head><title></title><link rel="canonical" href="undefined"></head><body>';
  const prefetch = `<script>var ytInitialData=${JSON.stringify({
    responseContext: {
      webPrefetchData: { navigationEndpoints: [{ watchEndpoint: { videoId: relatedId } }] },
    },
  })};</script>`;
  const watch = `<script>var ytInitialData2=${JSON.stringify({
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              { videoPrimaryInfoRenderer: { title: { runs: [{ text: 'TRINITAS TV LIVE' }] } } },
              { videoId: liveId, isLive: true },
              ...fillerIds.map((id) => ({ videoId: id })),
            ],
          },
        },
      },
    },
  })};</script>`;
  // Repetitions, because a real live page mentions the same few ids over and over.
  const repeats = `<script>var ytInitialData3=${JSON.stringify([
    { videoId: relatedId }, { videoId: liveId }, { videoId: relatedId },
  ])};</script>`;

  return `${head}${prefetch}${watch}${repeats}</body></html>`;
}

/** Uploads rung fixtures: the channel's uploads playlist id + a listing (newest first). */
function uploadsRoutes(uploadItems = []) {
  return [
    [
      '/youtube/v3/channels',
      () =>
        jsonResponse({
          items: [
            {
              contentDetails: {
                relatedPlaylists: { uploads: `UU${SOURCE.officialChannelId.slice(2)}` },
              },
            },
          ],
        }),
    ],
    ['/youtube/v3/playlistItems', () => jsonResponse({ items: uploadItems })],
  ];
}

// ── 1. the resolver ───────────────────────────────────────────────────────────

test('resolver takes the candidate from the URL the page request ended on', async () => {
  let requested = '';
  const fetchFn = async (url) => {
    requested = String(url);
    return htmlResponse('<html></html>', `https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`);
  };
  const resolve = createChannelLivePageResolver(fetchFn);

  const probe = await resolve(SOURCE.officialChannelId);
  assert.deepEqual(probe, { candidates: [LIVE_VIDEO_ID], unreachable: false });
  assert.equal(requested, PAGE_URL, 'the public channel /live URL is what gets fetched');
});

test('resolver falls back to og:url / canonical / inline player data', async () => {
  const page = (body, url = PAGE_URL) => createChannelLivePageResolver(async () => htmlResponse(body, url));

  assert.equal(
    await page(`<meta property="og:url" content="https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}">`)(
      SOURCE.officialChannelId,
    ).then((p) => p.candidates[0]),
    LIVE_VIDEO_ID,
    'og:url',
  );
  assert.equal(
    await page(`<link rel="canonical" href="https://www.youtube.com/live/${LIVE_VIDEO_ID}">`)(
      SOURCE.officialChannelId,
    ).then((p) => p.candidates[0]),
    LIVE_VIDEO_ID,
    'canonical link',
  );
  assert.equal(
    await page(`<script>var ytInitialPlayerResponse={"videoId":"${LIVE_VIDEO_ID}"};</script>`)(SOURCE.officialChannelId)
      .then((p) => p.candidates[0]),
    LIVE_VIDEO_ID,
    'inline player data',
  );
});

test('resolver returns no candidates (falls through) when there is no hint', async () => {
  const notLive = createChannelLivePageResolver(async () =>
    htmlResponse(`<meta property="og:url" content="https://www.youtube.com/channel/${SOURCE.officialChannelId}">`),
  );
  assert.deepEqual(await notLive(SOURCE.officialChannelId), { candidates: [], unreachable: false });

  const nonCanonical = createChannelLivePageResolver(async () => {
    throw new Error('must not be fetched for a non-canonical channel id');
  });
  assert.deepEqual(await nonCanonical('https://evil.example/channel'), { candidates: [], unreachable: false });
  assert.deepEqual(await nonCanonical('UCtooshort'), { candidates: [], unreachable: false });
});

test('resolver never throws: a page it cannot read is reported as unreachable', async () => {
  const boom = createChannelLivePageResolver(async () => {
    throw new Error('network down');
  });
  assert.deepEqual(await boom(SOURCE.officialChannelId), { candidates: [], unreachable: true });

  const notFound = createChannelLivePageResolver(async () => ({ ok: false, status: 404, url: PAGE_URL }));
  assert.deepEqual(await notFound(SOURCE.officialChannelId), { candidates: [], unreachable: true });

  // A readable page without any id is NOT "unreachable": the page was read, it just
  // does not mention a stream.
  const emptyHtml = createChannelLivePageResolver(async () => htmlResponse('<html>consent</html>', PAGE_URL));
  assert.deepEqual(await emptyHtml(SOURCE.officialChannelId), { candidates: [], unreachable: false });
});

test('extractVideoIdFromHtml rejects foreign hosts and malformed ids', () => {
  assert.equal(extractVideoIdFromHtml('<meta property="og:url" content="https://evil.example/watch?v=aaaaaaaaaaa">'), null);
  assert.equal(extractVideoIdFromHtml('<meta property="og:url" content="https://www.youtube.com/watch?v=short">'), null);
  assert.equal(extractVideoIdFromHtml('<html>nothing here</html>'), null);
});

test('extractVideoIdsFromHtml keeps document order, deduplicates and caps the list', () => {
  const page = edgeShapedPage({ fillers: 3 });
  const ids = extractVideoIdsFromHtml(page);
  assert.equal(ids[0], RELATED_ID, 'first candidate is the related-video prefetch, in document order');
  assert.equal(ids[1], LIVE_VIDEO_ID);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  assert.equal(extractVideoIdsFromHtml(page).length, 5, '2 real ids + 3 fillers');

  const many = Array.from({ length: 40 }, (_, i) => `<script>var v={"videoId":"v${String(i).padStart(10, '0')}"};</script>`).join('');
  assert.equal(extractVideoIdsFromHtml(`<html>${many}</html>`).length, 24, 'capped at 24 candidates');
});

// ── 2. the ladder: page candidates → videos.list wins, search.list not spent ───

test('permanent 24/7 stream: the page candidate verified by videos.list wins, search.list is never called', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse('<html></html>', `https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`)],
    ['/youtube/v3/videos', () => jsonResponse(videosListBody(LIVE_VIDEO_ID))],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);
  const resolve = createChannelLivePageResolver(fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, resolve);

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, LIVE_VIDEO_ID);
  assert.equal(outcome.channelId, SOURCE.officialChannelId);
  assert.equal(outcome.embeddable, true);
  assert.equal(outcome.liveStartedAt, '2026-10-10T04:00:00Z');
  assert.equal(fetchFn.urlsMatching('/search').length, 0, 'a page hit must not spend 100 quota units on search.list');
  assert.equal(fetchFn.urlsMatching('/youtube/v3/videos').length, 1);
});

test('EDGE SHAPE: the first candidate is a related video - the channel stream further down still wins', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse(edgeShapedPage(), PAGE_URL)],
    [
      '/youtube/v3/videos',
      () => jsonResponse(videosListBody([
        { id: RELATED_ID, snippet: { channelId: FOREIGN_CHANNEL_ID, liveBroadcastContent: 'none' } },
        LIVE_VIDEO_ID,
      ])),
    ],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, LIVE_VIDEO_ID, 'not the first "videoId" of the page');
  assert.equal(
    fetchFn.urlsMatching('/youtube/v3/videos').length,
    1,
    'all candidates are verified in ONE batched request (one quota unit)',
  );
  const ids = fetchFn.idParam('/youtube/v3/videos').split(',');
  assert.equal(ids[0], RELATED_ID);
  assert.equal(ids[1], LIVE_VIDEO_ID);
  assert.ok(ids.length > 2, 'the whole candidate list is verified, not just the first one');
  assert.equal(fetchFn.maxResultsParam('/youtube/v3/videos'), String(ids.length), 'maxResults must not truncate the batch');
});

test('a live candidate of ANOTHER channel is skipped in favour of the source channel one', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse(edgeShapedPage(), PAGE_URL)],
    [
      '/youtube/v3/videos',
      () => jsonResponse(videosListBody([
        // Another channel's live stream with the very same id slot ordering: rejected
        // on channelId, so it can never label this source live.
        { id: RELATED_ID, snippet: { channelId: FOREIGN_CHANNEL_ID, liveBroadcastContent: 'live' } },
        LIVE_VIDEO_ID,
      ])),
    ],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, LIVE_VIDEO_ID);
});

test('a candidate that ended (actualEndTime) is not live', async () => {
  const endedId = 'ddddddddddd';
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse('<html></html>', `https://www.youtube.com/watch?v=${endedId}`)],
    [
      '/youtube/v3/videos',
      () => jsonResponse(videosListBody(endedId, { liveStreamingDetails: { actualEndTime: '2026-10-10T05:00:00Z' } })),
    ],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
    ...uploadsRoutes(),
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'NOT_LIVE');
});

test('a live candidate that sits last in the batch still wins', async () => {
  const ids = ['g0000000001', 'g0000000002', 'g0000000003', 'g0000000004', 'g0000000005', 'g0000000006'];
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse(edgeShapedPage({ relatedId: ids[0], liveId: ids[5], fillers: 4 }), PAGE_URL)],
    ['/youtube/v3/videos', () => jsonResponse({ items: [videoItem(ids[5])] })],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, ids[5]);
});

test('without the batched capability the same candidates are verified one by one', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse(edgeShapedPage({ fillers: 1 }), PAGE_URL)],
    [
      '/youtube/v3/videos',
      (url) => {
        const id = new URL(url).searchParams.get('id');
        return jsonResponse(id === LIVE_VIDEO_ID ? videosListBody(LIVE_VIDEO_ID) : { items: [] });
      },
    ],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  // A minimal client: no verifyVideos, so the ladder must fall back to verifyVideo.
  const youtube = {
    searchLive: async () => [],
    verifyVideo: async (id) => {
      const body = await fetchFn(`https://www.googleapis.com/youtube/v3/videos?id=${id}`).then((r) => r.json());
      const item = body.items?.[0];
      if (!item) return null;
      return {
        videoId: item.id,
        channelId: item.snippet.channelId,
        title: item.snippet.title,
        embeddable: item.status?.embeddable ?? false,
        liveBroadcastContent: item.snippet.liveBroadcastContent ?? 'none',
        isLiveContent: Boolean(item.liveStreamingDetails),
        actualStartTime: item.liveStreamingDetails?.actualStartTime,
        actualEndTime: item.liveStreamingDetails?.actualEndTime,
      };
    },
  };

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, LIVE_VIDEO_ID);
  assert.ok(fetchFn.urlsMatching('/youtube/v3/videos').length >= 2, 'one call per candidate');
});

test('page failure does not decide the verdict: search.list still answers', async () => {
  const fetchFn = makeFetch([
    [
      'youtube.com/channel/',
      () => {
        throw new Error('page blocked');
      },
    ],
    [
      '/youtube/v3/search',
      () => jsonResponse({ items: [{ id: { videoId: 'ccccccccccc' }, snippet: { channelId: SOURCE.officialChannelId, title: 'live' } }] }),
    ],
    ['/youtube/v3/videos', () => jsonResponse(videosListBody('ccccccccccc'))],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, 'ccccccccccc');
});

test('page unreachable and no other rung finds anything: UNKNOWN, never NOT_LIVE', async () => {
  const fetchFn = makeFetch([
    [
      'youtube.com/channel/',
      () => {
        throw new Error('page blocked');
      },
    ],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
    ...uploadsRoutes(),
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'UNKNOWN', 'an unread page is not evidence that a channel is offline');
});

test('a readable page that mentions no stream still allows a NOT_LIVE verdict', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse('<html>no ids here</html>', PAGE_URL)],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
    ...uploadsRoutes(),
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'NOT_LIVE');
});

test('page hint that is not live anymore falls through to the search path', async () => {
  const STALE_ID = 'aaaaaaaaaaa';
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse('<html></html>', `https://www.youtube.com/watch?v=${STALE_ID}`)],
    ['/youtube/v3/videos', () => jsonResponse(videosListBody(STALE_ID, { snippet: { liveBroadcastContent: 'none' } }))],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
    ...uploadsRoutes(),
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);
  const resolve = createChannelLivePageResolver(fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, resolve);

  assert.equal(outcome.status, 'NOT_LIVE');
  assert.equal(fetchFn.urlsMatching('/search').length, 1, 'a discarded hint must reach the official search');
});

test('third rung: newest uploads find the stream when page and search both miss it', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse('<html>no hint</html>', PAGE_URL)],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
    ...uploadsRoutes([{ contentDetails: { videoId: LIVE_VIDEO_ID } }]),
    ['/youtube/v3/videos', () => jsonResponse(videosListBody(LIVE_VIDEO_ID))],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'LIVE');
  assert.equal(outcome.videoId, LIVE_VIDEO_ID);
  assert.equal(fetchFn.urlsMatching('/playlistItems').length, 1);
});

test('API error while verifying the candidates stays UNKNOWN (never NOT_LIVE)', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse(edgeShapedPage(), PAGE_URL)],
    ['/youtube/v3/videos', () => errorResponse(403, 'quota exceeded')],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);

  const outcome = await discoverLiveStatus(youtube, SOURCE, createChannelLivePageResolver(fetchFn));

  assert.equal(outcome.status, 'UNKNOWN');
  assert.equal(fetchFn.urlsMatching('/search').length, 0, 'an API failure short-circuits, it does not fall through');
});

// ── 3. cache behaviour ────────────────────────────────────────────────────────

function makeMemoryCache(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(sourceId) {
      return store.has(sourceId) ? { ...store.get(sourceId) } : null;
    },
    async upsert(row) {
      store.set(row.source_id, { ...(store.get(row.source_id) ?? {}), ...row });
    },
    async tryClaimLease(sourceId, nowMs) {
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

test('orchestrated: 24/7 stream is reported live with the real videoId and cached', async () => {
  const fetchFn = makeFetch([
    ['youtube.com/channel/', () => htmlResponse(edgeShapedPage(), PAGE_URL)],
    ['/youtube/v3/videos', () => jsonResponse({ items: [videoItem(LIVE_VIDEO_ID)] })],
    ['/youtube/v3/search', () => jsonResponse({ items: [] })],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);
  const cache = makeMemoryCache();

  const result = await computeSourceStatus(
    SOURCE,
    youtube,
    cache,
    Date.now(),
    true,
    undefined,
    createChannelLivePageResolver(fetchFn),
  );

  assert.equal(result.status, 'live');
  assert.equal(result.currentBroadcast.videoId, LIVE_VIDEO_ID);
  assert.equal(cache.store.get(SOURCE.id).current_video_id, LIVE_VIDEO_ID);
  assert.equal(cache.store.get(SOURCE.id).status, 'live');
});

test('API failure caches `unknown` on a SHORT retry, not the 90-minute interval', async () => {
  const fetchFn = makeFetch([
    [
      'youtube.com/channel/',
      () => {
        throw new Error('page blocked');
      },
    ],
    ['/youtube/v3/search', () => errorResponse(500, 'backend error')],
  ]);
  const youtube = createYouTubeClient('test-key', fetchFn);
  const cache = makeMemoryCache();
  const nowMs = Date.now();

  const result = await computeSourceStatus(
    SOURCE,
    youtube,
    cache,
    nowMs,
    true,
    undefined,
    createChannelLivePageResolver(fetchFn),
  );

  assert.equal(result.status, 'unknown');

  const row = cache.store.get(SOURCE.id);
  const retryInMs = new Date(row.next_refresh_at).getTime() - nowMs;
  assert.equal(row.status, 'unknown');
  assert.ok(retryInMs <= UNKNOWN_RETRY_MS + 1_000, `retry after API error was ${retryInMs} ms`);
  assert.ok(retryInMs < 90 * 60 * 1000, 'an API error must not be cached for the discovery interval');
});

test('missing API key caches `unknown` on a short retry too (the stuck-unknown bug)', async () => {
  const cache = makeMemoryCache();
  const nowMs = Date.now();

  const result = await computeSourceStatus(SOURCE, null, cache, nowMs, false);

  assert.equal(result.status, 'unknown');
  const retryInMs = new Date(cache.store.get(SOURCE.id).next_refresh_at).getTime() - nowMs;
  assert.ok(retryInMs <= UNKNOWN_RETRY_MS + 1_000, `retry after a key error was ${retryInMs} ms`);
  assert.ok(retryInMs < 90 * 60 * 1000, 'a missing secret must not pin every source to unknown for 90 minutes');
});

test('a fresh not_live row still suppresses all requests (no extra cost)', async () => {
  const fetchFn = makeFetch([]); // any request would fail this test
  const youtube = createYouTubeClient('test-key', fetchFn);
  const nowMs = Date.now();
  const cache = makeMemoryCache({
    [SOURCE.id]: {
      source_id: SOURCE.id,
      status: 'not_live',
      current_video_id: null,
      current_title: null,
      current_channel_id: null,
      embeddable: null,
      checked_at: new Date(nowMs - 1_000).toISOString(),
      live_started_at: null,
      next_refresh_at: new Date(nowMs + 60 * 60 * 1000).toISOString(),
      refresh_lease_until: null,
    },
  });

  const result = await computeSourceStatus(
    SOURCE,
    youtube,
    cache,
    nowMs,
    true,
    undefined,
    createChannelLivePageResolver(fetchFn),
  );

  assert.equal(result.status, 'not_live');
});
