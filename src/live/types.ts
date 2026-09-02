/**
 * Core type definitions for the "Slujbe LIVE" feature.
 *
 * These types separate the PERMANENT SOURCE (the stable identity of a
 * church/monastery/provider/broadcaster) from the CURRENT LIVE BROADCAST
 * (a transient live video event). LIVE-B and LIVE-C will plug dynamic
 * detection into this architecture WITHOUT rewriting the UI model.
 */

/** Playback destination supported by a permanent source. */
export type StreamType = 'youtube' | 'official_link';

/**
 * Live status supported by the UI model.
 * This task renders UNKNOWN/neutral; LIVE-B/LIVE-C will connect real detection.
 */
export type LiveStatus = 'live' | 'not_live' | 'unknown';

/**
 * PERMANENT SOURCE — stable identity of a broadcaster/provider.
 *
 * This object describes WHO broadcasts liturgies, their stable official
 * website and stable official YouTube channel. It must NEVER contain a
 * one-off YouTube `watch?v=...` videoId as permanent configuration.
 */
export interface PermanentLiveSource {
  /** Stable unique identifier for this source (e.g. 'trinitas-tv'). */
  id: string;

  /** Public-facing source/church/monastery name. */
  name: string;

  /** City/region where the broadcaster is based. */
  location: string;

  /** Organization that operates the source (e.g. 'Patriarhia Română'). */
  provider: string;

  /** Stable official website (HTTPS). */
  officialWebsiteUrl: string;

  /** Stable official YouTube channel page (HTTPS). */
  officialChannelUrl: string;

  /** Verified official YouTube channel ID (UC...) — only when confidently verified. */
  officialChannelId?: string;

  /** How this source is watched. */
  streamType: StreamType;

  /** Sort priority (lower = shown first among enabled sources). */
  priority: number;

  /** Optional verified schedule note (only when supported by official evidence). */
  scheduleNote?: string;

  /** Whether this source is currently wired in. Disabled sources are excluded from UI. */
  enabled: boolean;

  /** Whether LIVE-B can attempt dynamic live detection against this channel. */
  supportsDynamicLiveDetection: boolean;
}

/**
 * CURRENT LIVE BROADCAST — transient data about a live event.
 *
 * Created only later (LIVE-B) from YouTube API discovery. The app must
 * NEVER derive a permanent source from one of these transient objects.
 */
export interface CurrentLiveBroadcast {
  /** The live video's temporary YouTube videoId. */
  videoId: string;

  /** Derived live status. */
  status: LiveStatus;

  /** ISO timestamp of when this status was last checked. */
  checkedAt: string;

  /** Whether the widget/browser can embed this broadcast. */
  embeddable: boolean;

  /** Display title of the live event. */
  title: string;

  /** Optional extra metadata from the platform. */
  metadata?: Record<string, unknown>;
}
