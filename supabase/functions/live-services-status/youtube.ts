/**
 * YouTube Data API v3 client — the ONLY component that talks to YouTube.
 *
 * Uses ONLY official documented endpoints:
 *   - search.list  (discovery: find live videos on a channel)
 *   - videos.list  (revalidation: verify candidate video status)
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
  isLiveContent: boolean;
  actualStartTime: string | undefined;
  actualEndTime: string | undefined;
};

export type YouTubeClient = {
  searchLive(channelId: string): Promise<LiveSearchResult[]>;
  verifyVideo(videoId: string): Promise<VideoVerification | null>;
};

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

type SearchListResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { channelId?: string; title?: string };
  }>;
  error?: { message?: string; code?: number };
};

type VideoItem = {
  id?: string;
  snippet?: { channelId?: string; title?: string };
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
  status?: { embeddable?: boolean };
  contentDetails?: { relatedPlaylists?: Record<string, string> };
};

type VideoListResponse = {
  items?: VideoItem[];
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
      const data = await request<VideoListResponse>('/videos', {
        part: 'snippet,liveStreamingDetails,status',
        id: videoId,
        maxResults: '1',
      });

      if (data.error) {
        throw new Error(`YouTube videos error: ${data.error.message ?? 'unknown'}`);
      }

      if (!Array.isArray(data.items)) {
        throw new Error('YouTube videos response malformed');
      }

      const item = data.items[0];
      if (!item) return null;
      if (!item.id || !item.snippet?.channelId) {
        throw new Error('YouTube videos response malformed');
      }

      return {
        videoId: item.id,
        channelId: item.snippet?.channelId ?? '',
        title: item.snippet?.title ?? '',
        embeddable: item.status?.embeddable ?? false,
        isLiveContent: Boolean(item.liveStreamingDetails),
        actualStartTime: item.liveStreamingDetails?.actualStartTime,
        actualEndTime: item.liveStreamingDetails?.actualEndTime,
      };
    },
  };
}
