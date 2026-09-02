/**
 * Default export for the YouTube player.
 *
 * This base file exists so that the platform-agnostic import
 * `@/live/youtube-embed` resolves in TypeScript tooling. At runtime,
 * Metro/Expo resolves the platform-specific implementation:
 *   - native:  ./youtube-embed.native  (WebView-based)
 *   - web:     ./youtube-embed.web     (iframe-based)
 *
 * Here we re-export the native implementation as the default fallback.
 */

export { YouTubeEmbed } from './youtube-embed.native';
export type { YouTubeEmbedProps } from './youtube-embed.native';
