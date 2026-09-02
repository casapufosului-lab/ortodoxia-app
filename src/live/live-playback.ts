/**
 * Playback decision logic and YouTube URL construction.
 *
 * Pure functions that determine HOW a source should be opened based on
 * the backend status response and the source's permanent configuration.
 *
 * Three playback modes:
 *   EMBED            → In-app WebView with official YouTube embed (verified + embeddable)
 *   EXTERNAL_CURRENT → Open the verified current live video on YouTube externally
 *   OFFICIAL_SOURCE  → Open the stable official source page (default fallback)
 *
 * These are intentionally separated from UI code so they can be tested
 * without React rendering.
 */

import type { SourceStatusResponse } from './live-status-client';
import type { PermanentLiveSource } from './types';

// ─── Playback mode ─────────────────────────────────────────────────────────

export type PlaybackMode = 'EMBED' | 'EXTERNAL_CURRENT' | 'OFFICIAL_SOURCE';

/**
 * Determine the playback mode for a source given its current backend status.
 *
 * Rules:
 *   - LIVE + embeddable → EMBED (official YouTube iframe)
 *   - LIVE + not embeddable → EXTERNAL_CURRENT (open YouTube externally)
 *   - LIVE + no broadcast info → OFFICIAL_SOURCE (should not happen, safe default)
 *   - NOT_LIVE → OFFICIAL_SOURCE
 *   - UNKNOWN → OFFICIAL_SOURCE
 *   - any error/no data → OFFICIAL_SOURCE
 */
export function determinePlaybackMode(
  sourceStatus: SourceStatusResponse | null,
  _source: PermanentLiveSource,
): PlaybackMode {
  if (!sourceStatus) return 'OFFICIAL_SOURCE';

  const { status, currentBroadcast } = sourceStatus;

  if (status === 'live' && currentBroadcast?.embeddable) {
    return 'EMBED';
  }

  if (status === 'live' && currentBroadcast && !currentBroadcast.embeddable) {
    return 'EXTERNAL_CURRENT';
  }

  return 'OFFICIAL_SOURCE';
}

// ─── YouTube URL construction ──────────────────────────────────────────────

/**
 * Build an official YouTube embed URL for a verified live videoId.
 *
 * Uses only the official youtube.com/embed/ endpoint.
 * autoplay=0 ensures no autoplay on screen open.
 * rel=0 limits related videos to the same channel.
 */
export function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=0&rel=0`;
}

/**
 * Build an official YouTube watch URL for opening externally.
 * Used when the video is not embeddable.
 */
export function buildYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
