import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import {
  LIVE_OPEN_ERROR_CODE,
  getOpenableUrlForSource,
  isValidSourceUrl,
  openLiveSourceUrl,
} from '@/live/live-service-access';
import {
  fetchLiveStatuses,
  type SourceStatusResponse,
} from '@/live/live-status-client';
import { buildYouTubeWatchUrl, determinePlaybackMode } from '@/live/live-playback';
import { getEnabledLiveSources } from '@/live/live-services';
import type { PermanentLiveSource } from '@/live/types';
import { YouTubeEmbed } from '@/live/youtube-embed';
import { localizeLocation } from '@/lib/i18n-locations';
import { useLocalization } from '@/providers/localization-provider';

/**
 * Merged view model: permanent source + current backend status.
 */
interface SourceViewModel {
  source: PermanentLiveSource;
  status: SourceStatusResponse | null;
}

/**
 * "Slujbe LIVE" dedicated screen — LIVE-C final implementation.
 *
 * Fetches live statuses from the Edge Function in a single request,
 * renders per-source status semantics, manages embedded playback lifecycle,
 * and provides offline/error/retry UX.
 */
export default function LiveScreen() {
  const { t, countryCode } = useLocalization();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceStatuses, setSourceStatuses] = useState<Map<string, SourceStatusResponse>>(
    new Map(),
  );
  const [activePlayerVideoId, setActivePlayerVideoId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const sources = getEnabledLiveSources(countryCode);

  const loadStatuses = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLiveStatuses(countryCode);
      if (requestId !== requestRef.current) return;
      const map = new Map<string, SourceStatusResponse>();
      for (const s of result.sources) map.set(s.sourceId, s);
      setSourceStatuses(map);
    } catch {
      if (requestId === requestRef.current) setError(t('live.errorStatusFetch'));
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [countryCode, t]);

  // Single fetch on mount — no polling, no repeated effects
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatuses();
    return () => { requestRef.current += 1; };
  }, [loadStatuses]);

  const closePlayer = useCallback(() => { setActivePlayerVideoId(null); }, []);

  // L-05: there is deliberately no "close player on unmount" effect.
  // Unmounting already discards this component's state, so calling
  // setActivePlayerVideoId(null) from a cleanup function would be a no-op
  // state update on an unmounted component (React warns about it and it can
  // interleave badly with the in-flight status request). The player is closed
  // explicitly through closePlayer() while the screen is still mounted.

  const handleSourceAction = useCallback(async (vm: SourceViewModel) => {
    const mode = determinePlaybackMode(vm.status, vm.source);
    if (mode === 'EMBED' && vm.status?.currentBroadcast?.videoId) {
      setActivePlayerVideoId(vm.status.currentBroadcast.videoId);
      return;
    }
    if (mode === 'EXTERNAL_CURRENT' && vm.status?.currentBroadcast?.videoId) {
      const url = buildYouTubeWatchUrl(vm.status.currentBroadcast.videoId);
      if (isValidSourceUrl(url)) {
        const openError = await openLiveSourceUrl(url);
        if (openError === LIVE_OPEN_ERROR_CODE) setError(t('live.errorOpenSource'));
      } else {
        setError(t('live.errorOpenSource'));
      }
      return;
    }
    const url = getOpenableUrlForSource(vm.source);
    if (!url) { setError(t('live.errorOpenSource')); return; }
    const openError = await openLiveSourceUrl(url);
    if (openError === LIVE_OPEN_ERROR_CODE) setError(t('live.errorOpenSource'));
  }, [t]);

  function getStatusLabel(status: SourceStatusResponse | null, source: PermanentLiveSource): {
    text: string; color: string; emoji: string;
  } {
    // I-06: `getEligibleSources` on the backend skips sources whose
    // supportsDynamicLiveDetection is false, so cy-paphos, rs-sumadija and
    // rs-tumane can never receive a status entry. Rendering the neutral
    // "view broadcasts" label for them implied detection was merely pending.
    // They get an explicit "not monitored" label instead, while the action
    // button still opens the official source.
    if (!source.supportsDynamicLiveDetection) {
      return { text: t('live.statusNoDetection'), color: palette.muted, emoji: '○' };
    }
    if (!status) return { text: t('live.statusView'), color: palette.muted, emoji: '▶' };
    switch (status.status) {
      case 'live':
        return { text: t('live.statusLive'), color: palette.danger, emoji: '🔴' };
      case 'not_live':
        return { text: t('live.statusNotLive'), color: palette.muted, emoji: '○' };
      case 'unknown':
        return { text: t('live.statusView'), color: palette.blue, emoji: '▶' };
      default:
        return { text: t('live.statusView'), color: palette.muted, emoji: '▶' };
    }
  }

  function getActionLabel(vm: SourceViewModel): string {
    const mode = determinePlaybackMode(vm.status, vm.source);
    switch (mode) {
      case 'EMBED': return t('live.actionEmbed');
      case 'EXTERNAL_CURRENT': return t('live.actionExternal');
      case 'OFFICIAL_SOURCE':
      default: return t('live.actionOfficial');
    }
  }

  return (
    <Screen>
      <PageHeader
        eyebrow={t('live.eyebrow')}
        title={t('live.title')}
        subtitle={t('live.subtitle')}
      />
      {error ? (
        <Card style={styles.errorCard}>
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('live.retry')}
            onPress={() => void loadStatuses()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>{t('live.retry')}</Text>
          </Pressable>
        </Card>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={palette.blue} />
          <Text style={styles.loadingText}>{t('live.loading')}</Text>
        </View>
      ) : sources.map((source) => {
        const status = sourceStatuses.get(source.id) ?? null;
        const vm: SourceViewModel = { source, status };
        const label = getStatusLabel(status, source);
        return (
          <Card key={source.id} style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <Text style={styles.sourceName}>{source.name}</Text>
              <Text style={styles.location}>{localizeLocation(source.location, t)}</Text>
            </View>
            <Text style={styles.provider}>{t('live.providerLabel').replace('{provider}', source.provider)}</Text>
            {source.scheduleNote ? (
              <Text style={styles.scheduleNote}>{source.scheduleNote}</Text>
            ) : null}
            <View style={styles.statusRow}>
              <Text style={styles.statusEmoji}>{label.emoji}</Text>
              <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: label.color }]}>
                {label.text}
              </Text>
            </View>
            {status?.status === 'live' && status.currentBroadcast?.title ? (
              <Text style={styles.broadcastTitle} numberOfLines={2}>
                {status.currentBroadcast.title}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${getActionLabel(vm)} ${source.name}`}
              onPress={() => void handleSourceAction(vm)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionButtonText}>{getActionLabel(vm)}</Text>
            </Pressable>
          </Card>
        );
      })}
      <Text style={styles.disclaimer}>
        {t('live.disclaimer')}
      </Text>
      <YouTubeEmbed videoId={activePlayerVideoId} onClose={closePlayer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sourceCard: { gap: 8 },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  sourceName: { color: palette.ink, fontSize: 17, fontWeight: '800', flex: 1 },
  location: { color: palette.goldDark, fontSize: 13, fontWeight: '700' },
  provider: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  scheduleNote: { color: palette.blue, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  statusEmoji: { fontSize: 14 },
  statusText: { fontSize: 13, fontWeight: '800' },
  broadcastTitle: { color: palette.ink, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  actionButton: {
    backgroundColor: palette.blueSoft, minHeight: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2,
  },
  actionButtonText: { color: palette.blue, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.75 },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  retryButton: {
    backgroundColor: palette.blueSoft, minHeight: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 6,
  },
  retryText: { color: palette.blue, fontSize: 14, fontWeight: '700' },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  loadingText: { color: palette.muted, fontSize: 14 },
  disclaimer: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingTop: 4 },
});
