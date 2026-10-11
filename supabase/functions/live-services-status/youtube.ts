/**
 * YouTube Data API v3 client — the ONLY component that talks to YouTube.
 *
 * Uses ONLY official documented endpoints:
 *   - search.list        (discovery: find live videos on a channel)
 *   - videos.list        (revalidation: verify candidate video status)
 *   - channels.list      (uploads playlist id of a channel)
 *   - playlistItems.list (newest uploads of that playlist)
 *
 * Nothing here reads HTML: the public channel `/live` page is handled by
 * `channel-live-page.ts`, which only produces a candidate id that this client
 * re-verifies through videos.list.
 *
 * All requests require a valid YOUTUBE_DATA_API_KEY.
 * Never scrapes HTML, never uses internal/undocumented endpoints.
 */

export type LiveSearchResult = {
  videoId: string;
  channelId: string;
  title: string;
};

export type VideoVerification = {
  videoId: string;
  channelId: string;
  title: string;
  embeddable: boolean;
  /**
   * `snippet.liveBroadcastContent`: 'live' | 'upcoming' | 'none'. This is the
   * field that is actually correct for permanent 24/7 streams, so id-based
   * discovery (page hint, uploads) requires it to be exactly 'live'.
   */
  liveBroadcastContent: string;
  isLiveContent: boolean;
  actualStartTime: string | undefined;
  actualEndTime: string | undefined;
};

export type YouTubeClient = {
  searchLive(channelId: string): Promise<LiveSearchResult[]>;
  verifyVideo(videoId: string): Promise<VideoVerification | null>;
  /**
   * Verify several candidate ids in ONE `videos.list` request - one quota unit for up
   * to 50 ids, against one unit PER id for `verifyVideo`.
   *
   * It exists because the public channel page yields candidates, not an answer: the
   * first `"videoId"` of a live page belongs to a related-video prefetch (measured
   * 2026-10-10), so `status.ts` hands every candidate over at once and keeps the one
   * that is live and owned by the source channel.
   *
   * Optional capability: without it the caller verifies candidates one by one with
   * `verifyVideo`, which costs more units but behaves identically.
   */
  verifyVideos?(videoIds: string[]): Promise<VideoVerification[]>;
  /**
   * Newest uploads of a channel, newest first (video ids only).
   *
   * Optional capability: a client that does not provide it simply skips the
   * uploads step of the discovery ladder (see `status.ts`), which is why the
   * field is optional instead of an extra required method.
   */
  listRecentUploads?(channelId: string, max?: number): Promise<string[]>;
};

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Largest id batch `videos.list` accepts in a single request. */
const MAX_VIDEO_IDS_PER_REQUEST = 50;

type SearchListResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { channelId?: string; title?: string };
  }>;
  error?: { message?: string; code?: number };
};

type VideoItem = {
  id?: string;
  snippet?: { channelId?: string; title?: string; liveBroadcastContent?: string };
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
  status?: { embeddable?: boolean };
  contentDetails?: { relatedPlaylists?: Record<string, string> };
};

type VideoListResponse = {
  items?: VideoItem[];
  error?: { message?: string; code?: number };
};

type ChannelListResponse = {
  items?: Array<{ contentDetails?: { relatedPlaylists?: Record<string, string> } }>;
  error?: { message?: string; code?: number };
};

type PlaylistItemsResponse = {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  error?: { message?: string; code?: number };
};

/**
 * Create a YouTube client bound to a specific API key.
 *
 * @param apiKey  The YouTube Data API key (server-side secret).
 * @param fetchFn Injectable fetch for testability (defaults to global fetch).
 */
export function createYouTubeClient(
  apiKey: string,
  fetchFn: typeof fetch = globalThis.fetch,
): YouTubeClient {
  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${YOUTUBE_API_BASE}${path}`);
    url.searchParams.set('key', apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetchFn(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as Record<string, unknown> | null;
      const errMsg = (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`YouTube API error: ${errMsg}`);
    }
    return (await res.json()) as T;
  }

  /**
   * One `videos.list` request for every candidate id.
   *
   * `maxResults` is set explicitly because it defaults to 5: with a 24-id lookup the
   * default would silently drop most of the batch.
   *
   * Ids are passed through as given (deduplicated and capped, nothing else). Filtering
   * out ids that "do not look right" would skip the request altogether, and a payload
   * that was never fetched is exactly the malformed case the AUD2 suite requires to be
   * rejected instead of silently answered with "nothing found".
   */
  async function verifyVideos(videoIds: string[]): Promise<VideoVerification[]> {
    const ids = [...new Set(videoIds)].slice(0, MAX_VIDEO_IDS_PER_REQUEST);
    if (ids.length === 0) return [];

    const data = await request<VideoListResponse>('/videos', {
      part: 'snippet,liveStreamingDetails,status',
      id: ids.join(','),
      maxResults: String(ids.length),
    });

    if (data.error) {
      throw new Error(`YouTube videos error: ${data.error.message ?? 'unknown'}`);
    }

    if (!Array.isArray(data.items)) {
      throw new Error('YouTube videos response malformed');
    }

    return data.items
      .filter((item) => Boolean(item.id && item.snippet?.channelId))
      .map((item) => ({
        videoId: item.id as string,
        channelId: item.snippet?.channelId ?? '',
        title: item.snippet?.title ?? '',
        embeddable: item.status?.embeddable ?? false,
        liveBroadcastContent: item.snippet?.liveBroadcastContent ?? 'none',
        isLiveContent: Boolean(item.liveStreamingDetails),
        actualStartTime: item.liveStreamingDetails?.actualStartTime,
        actualEndTime: item.liveStreamingDetails?.actualEndTime,
      }));
  }

  return {
    async searchLive(channelId: string): Promise<LiveSearchResult[]> {

      const data = await request<SearchListResponse>('/search', {
        part: 'snippet',
        channelId,
        eventType: 'live',
        type: 'video',
        maxResults: '5',
        order: 'date',
      });

      if (data.error) {
        throw new Error(`YouTube search error: ${data.error.message ?? 'unknown'}`);
      }

      if (!Array.isArray(data.items)) {
        throw new Error('YouTube search response malformed');
      }

      return data.items
        .map((item) => ({
          videoId: item.id?.videoId ?? '',
          channelId: item.snippet?.channelId ?? '',
          title: item.snippet?.title ?? '',
        }))
        .filter((r) => r.videoId && r.channelId);
    },

    async verifyVideo(videoId: string): Promise<VideoVerification | null> {
      const [first] = await verifyVideos([videoId]);
      return first ?? null;
    },

    verifyVideos,

    /**
     * Newest uploads of a channel (third discovery step).
     *
     * 1. `channels.list` → the official uploads playlist id (1 unit). The `UU…`
     *    convention is only a fallback for a response without contentDetails,
     *    never the primary source.
     * 2. `playlistItems.list` → newest video ids (1 unit).
     *
     * Both calls together cost 2 quota units, against 100 for a `search.list`,
     * so this step is cheap - but it does NOT find permanent 24/7 streams whose
     * video was uploaded long ago (measured 2026-10-10), which is why it is the
     * last step and why the page hint in `channel-live-page.ts` exists.
     */
    async listRecentUploads(channelId: string, max = 3): Promise<string[]> {
      const take = Math.min(Math.max(Math.trunc(max), 1), 10);

      const channels = await request<ChannelListResponse>('/channels', {
        part: 'contentDetails',
        id: channelId,
        maxResults: '1',
      });
      if (channels.error) {
        throw new Error(`YouTube channels error: ${channels.error.message ?? 'unknown'}`);
      }

      const fromApi = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      const uploadsPlaylistId = fromApi || (channelId.startsWith('UC') ? `UU${channelId.slice(2)}` : '');
      if (!uploadsPlaylistId) {
        throw new Error('YouTube channels response has no uploads playlist');
      }

      const items = await request<PlaylistItemsResponse>('/playlistItems', {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: String(take),
      });
      if (items.error) {
        throw new Error(`YouTube playlistItems error: ${items.error.message ?? 'unknown'}`);
      }
      if (!Array.isArray(items.items)) {
        throw new Error('YouTube playlistItems response malformed');
      }

      return items.items
        .map((item) => item.contentDetails?.videoId ?? '')
        .filter((videoId) => /^[A-Za-z0-9_-]{11}$/.test(videoId))
        .slice(0, take);
    },
  };
}
