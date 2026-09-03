import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import {
  LIVE_OPEN_ERROR,
  getOpenableUrlForSource,
  isValidSourceUrl,
  openLiveSourceUrl,
} from '@/live/live-service-access';
import {
  LIVE_STATUS_FETCH_ERROR,
  fetchLiveStatuses,
  type SourceStatusResponse,
} from '@/live/live-status-client';
import { buildYouTubeWatchUrl, determinePlaybackMode } from '@/live/live-playback';
import { getEnabledLiveSources } from '@/live/live-services';
import type { PermanentLiveSource } from '@/live/types';
import { YouTubeEmbed } from '@/live/youtube-embed';

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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceStatuses, setSourceStatuses] = useState<Map<string, SourceStatusResponse>>(
    new Map(),
  );
  const [activePlayerVideoId, setActivePlayerVideoId] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const sources = getEnabledLiveSources();

  const loadStatuses = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLiveStatuses();
      const map = new Map<string, SourceStatusResponse>();
      for (const s of result.sources) map.set(s.sourceId, s);
      setSourceStatuses(map);
    } catch {
      setError(LIVE_STATUS_FETCH_ERROR);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Single fetch on mount — no polling, no repeated effects
  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  const closePlayer = useCallback(() => { setActivePlayerVideoId(null); }, []);

  // Close player on unmount
  useEffect(() => {
    return () => { setActivePlayerVideoId(null); };
  }, []);

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
        if (openError) setError(openError);
      } else {
        setError(LIVE_OPEN_ERROR);
      }
      return;
    }
    const url = getOpenableUrlForSource(vm.source);
    if (!url) { setError(LIVE_OPEN_ERROR); return; }
    const openError = await openLiveSourceUrl(url);
    if (openError) setError(openError);
  }, []);

  function getStatusLabel(status: SourceStatusResponse | null): {
    text: string; color: string; emoji: string;
  } {
    if (!status) return { text: 'Vezi transmisiunile', color: palette.muted, emoji: '▶' };
    switch (status.status) {
      case 'live':
        return { text: 'LIVE ACUM', color: palette.danger, emoji: '🔴' };
      case 'not_live':
        return { text: 'Momentan nu este LIVE', color: palette.muted, emoji: '○' };
      case 'unknown':
        return { text: 'Vezi transmisiunile', color: palette.blue, emoji: '▶' };
      default:
        return { text: 'Vezi transmisiunile', color: palette.muted, emoji: '▶' };
    }
  }

  function getActionLabel(vm: SourceViewModel): string {
    const mode = determinePlaybackMode(vm.status, vm.source);
    switch (mode) {
      case 'EMBED': return 'Vezi în direct';
      case 'EXTERNAL_CURRENT': return 'Deschide pe YouTube';
      case 'OFFICIAL_SOURCE':
      default: return 'Deschide sursa oficială';
    }
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Slujbe LIVE"
        title="Slujbe LIVE"
        subtitle="Urmărește Sfânta Liturghie în direct de la surse oficiale. Transmisiunile aparțin instituțiilor bisericești respective."
      />
      {error ? (
        <Card style={styles.errorCard}>
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reîncearcă"
            onPress={() => void loadStatuses()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Reîncearcă</Text>
          </Pressable>
        </Card>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={palette.blue} />
          <Text style={styles.loadingText}>Se verifică transmisiunile…</Text>
        </View>
      ) : sources.map((source) => {
        const status = sourceStatuses.get(source.id) ?? null;
        const vm: SourceViewModel = { source, status };
        const label = getStatusLabel(status);
        return (
          <Card key={source.id} style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <Text style={styles.sourceName}>{source.name}</Text>
              <Text style={styles.location}>{source.location}</Text>
            </View>
            <Text style={styles.provider}>Furnizor: {source.provider}</Text>
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
        Transmisiunile aparțin surselor oficiale. Aplicația afișează starea live
        doar pe baza datelor primite de la server.
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
