/**
 * Best-effort resolver for the stream a channel is broadcasting RIGHT NOW, read
 * from the public channel page.
 *
 * WHY THIS EXISTS (measured 2026-10-10, TRINITAS TV `UCcqFHIDYfKsaJ5KXZjzW7ZQ`)
 * ---------------------------------------------------------------------------
 * The YouTube Data API cannot discover permanent 24/7 streams:
 *   - `search.list?part=snippet&channelId=...&eventType=live&type=video` returned
 *     ZERO items while that channel's stream was on air
 *     (`snippet.liveBroadcastContent === 'live'`), and
 *   - `channels.list` does give `contentDetails.relatedPlaylists.uploads`, but the
 *     24/7 stream is not among the newest uploads (it was published long ago), so
 *     the uploads playlist does not cover it either.
 * The public URL `https://www.youtube.com/channel/<channelId>/live` is the signal
 * that does cover it: it serves whatever that channel broadcasts now (measured from
 * the edge: 200 answered in place, no redirect to `/watch?v=`, so the id has to come
 * out of the HTML).
 *
 * WHAT THIS MODULE IS ALLOWED TO DO
 * ---------------------------------
 * It returns candidate 11-character video ids and nothing else - no title, no HTML,
 * no metadata. `status.ts` re-checks every candidate through the official
 * `videos.list` endpoint in one batched call and requires
 * `snippet.liveBroadcastContent === 'live'` plus a matching channel id, so a wrong,
 * stale or unrelated candidate degrades to the documented search path instead of
 * becoming a false LIVE.
 *
 * WHY IT RETURNS A LIST AND NOT "THE" VIDEO ID (measured from the edge 2026-10-10)
 * ------------------------------------------------------------------------------
 * Two things were measured by fetching the page from the deployed edge, not from a
 * workstation, and they killed the naive single-id version:
 *   1. `GET /channel/<id>/live` answers 200 with `finalUrl` unchanged - YouTube
 *      renders the live watch page AT that URL instead of redirecting to `/watch?v=`.
 *      So the URL carries no id and the HTML is the only source.
 *   2. On that page `og:url` is absent and `<link rel="canonical">` is literally
 *      `href="undefined"`, while ~105 `"videoId"` occurrences (21 unique) are present.
 *      The FIRST one belongs to a `webPrefetchData` block for a RELATED video and
 *      changes on every request; the channel's own live stream was at unique index 1
 *      in all four samples. Position-based rules are therefore not trustworthy.
 * Taking every id and letting `videos.list` (one request, one quota unit, up to 50
 * ids) pick the one that is live and owned by the source channel removes the guess.
 *
 * It is deliberately the ONLY place in this function that reads non-API YouTube
 * content, and it is blind by construction: only canonical channel ids from the
 * server-side registry (`UC` + 22 characters) are ever fetched, because the caller
 * passes `source.officialChannelId` and nothing from the request reaches here.
 * `youtube.ts` stays a pure Data API client (see the drift test that asserts it).
 *
 * WHAT THE PAGE OFFERED
 * ---------------------
 * `candidates` are ordered ids: the id in the page URL / `og:url` / canonical link
 * first (most authoritative), then every `"videoId"` of the page in document order.
 * They are candidates, never answers - only `videos.list` decides.
 *
 * `unreachable` is true when the page could not be read at all (transport error or a
 * non-2xx answer). The caller must not turn that into "the channel is not live".
 */
export interface LivePageProbe {
  candidates: string[];
  unreachable: boolean;
}

/** Resolves the candidate ids of whatever a channel is broadcasting right now. */
export type LivePageResolver = (channelId: string) => Promise<LivePageProbe>;

/** Canonical YouTube channel id (`UC` + 22 chars) - the only shape this module fetches. */
const CANONICAL_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_LIVE_PREFIX = 'https://www.youtube.com/channel/';
const REQUEST_TIMEOUT_MS = 6_000;
/**
 * Upper bound of candidates handed to `videos.list`. The whole batch is ONE request
 * (one quota unit), so the only cost of a generous cap is a slightly longer URL - very
 * worth it, because which id is "the" stream on the page is not positional.
 */
const MAX_CANDIDATES = 24;
/**
 * A plain browser-ish UA: the mobile/app UAs get a shell page whose HTML no longer
 * carries the player response. Nothing here identifies the user.
 */
const USER_AGENT = 'Mozilla/5.0 (compatible; OrtodoxiaLiveStatus/1.0; +https://ortodoxia.app)';

/**
 * Read a video id out of a YouTube URL.
 *
 * URL parsing (not string matching) is used on purpose: the caller cannot smuggle
 * a host - `https://evil.example/watch?v=...` is rejected - and only the two shapes
 * a live redirect can take are accepted.
 */
function videoIdFromUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null;

  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;

  const fromLivePath = url.pathname.match(/^\/live\/([A-Za-z0-9_-]{11})$/);
  if (fromLivePath) return fromLivePath[1];

  return null;
}

function metaContent(html: string, key: string): string | null {
  const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i').exec(html);
  if (!forward) return null;
  const content = /content=["']([^"']+)["']/i.exec(forward[0]);
  return content ? content[1] : null;
}

/**
 * Every candidate video id the page mentions, most authoritative first.
 *
 * `urlHint` (the URL the fetch actually ended on) and `og:url` / the canonical link
 * describe the page itself, so they are tried first - those are the only ids that mean
 * "this page IS that video". Then come all inline `"videoId":"..."` occurrences in
 * document order, deduplicated and capped, because on the live page the first of them
 * belongs to a related-video prefetch (measured) and only `videos.list` can say which
 * candidate is the live stream.
 */
export function extractVideoIdsFromHtml(html: string, urlHint?: string | null): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null): void => {
    if (!id || seen.has(id) || ids.length >= MAX_CANDIDATES) return;
    seen.add(id);
    ids.push(id);
  };

  push(videoIdFromUrl(urlHint));
  push(videoIdFromUrl(metaContent(html, 'og:url')));

  const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html);
  if (canonical) {
    const href = /href=["']([^"']+)["']/i.exec(canonical[0]);
    push(videoIdFromUrl(href ? href[1] : null));
  }

  for (const match of html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
    if (ids.length >= MAX_CANDIDATES) break;
    push(match[1]);
  }

  return ids;
}

/**
 * The single best candidate, for callers that only want one - on a normal watch page
 * the final URL or the canonical link is already the answer.
 */
export function extractVideoIdFromHtml(html: string, urlHint?: string | null): string | null {
  return extractVideoIdsFromHtml(html, urlHint)[0] ?? null;
}

/**
 * Build the resolver. Never throws: a transport error, a non-2xx answer or a page
 * without any id all come back as `{ candidates: [], unreachable: ... }`, and the caller
 * falls through to the Data API paths. That is the whole point - this is a hint, not a
 * verdict.
 *
 * `unreachable` exists so the caller can tell "the channel is not live" apart from
 * "we could not look": the second one must never harden into NOT_LIVE.
 *
 * @param fetchFn  Injectable fetch for tests (defaults to the global fetch).
 * @param timeoutMs  Per-request timeout; kept short so a slow YouTube cannot stall
 *                   the whole multi-source refresh.
 */
export function createChannelLivePageResolver(
  fetchFn: typeof fetch = globalThis.fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): LivePageResolver {
  return async function resolveChannelLivePage(channelId: string): Promise<LivePageProbe> {
    if (!CANONICAL_CHANNEL_ID.test(channelId)) return { candidates: [], unreachable: false };

    let res: Response;
    try {
      res = await fetchFn(`${CHANNEL_LIVE_PREFIX}${channelId}/live`, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          // Consent choice is carried in a cookie; without it an EU egress node
          // answers with the consent interstitial instead of the channel page.
          cookie: 'SOCS=CAI',
          'user-agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { candidates: [], unreachable: true };
    }

    if (!res.ok) return { candidates: [], unreachable: true };

    try {
      return { candidates: extractVideoIdsFromHtml(await res.text(), res.url), unreachable: false };
    } catch {
      return { candidates: [], unreachable: true };
    }
  };
}
