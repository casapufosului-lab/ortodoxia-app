import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { LIVE_OPEN_ERROR, getOpenableUrlForSource, openLiveSourceUrl } from '@/live/live-service-access';
import { getEnabledLiveSources } from '@/live/live-services';
import type { PermanentLiveSource } from '@/live/types';

/**
 * "Slujbe LIVE" dedicated screen.
 *
 * Displays the enabled official sources as individual cards. This task
 * shows a neutral "Vezi transmisiunile" / "Deschide sursa oficială" state
 * because official live-status detection is not yet connected (LIVE-B).
 * The UI model already supports the future "live" | "not_live" | "unknown"
 * statuses, but renders UNKNOWN here.
 */
export default function LiveScreen() {
  const [error, setError] = useState<string | null>(null);
  const sources = getEnabledLiveSources();

  const openSource = useCallback(async (source: PermanentLiveSource) => {
    const url = getOpenableUrlForSource(source);
    if (!url) {
      setError(LIVE_OPEN_ERROR);
      return;
    }
    const openError = await openLiveSourceUrl(url);
    if (openError) setError(openError);
  }, []);

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
        </Card>
      ) : null}

      {sources.map((source) => (
        <Card key={source.id} style={styles.sourceCard}>
          <View style={styles.sourceHeader}>
            <Text style={styles.sourceName}>{source.name}</Text>
            <Text style={styles.location}>{source.location}</Text>
          </View>

          <Text style={styles.provider}>Furnizor: {source.provider}</Text>

          {source.scheduleNote ? (
            <Text style={styles.scheduleNote}>{source.scheduleNote}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Deschide sursa oficială ${source.name}`}
            onPress={() => void openSource(source)}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <Text style={styles.actionButtonText}>Deschide sursa oficială</Text>
          </Pressable>
        </Card>
      ))}

      <Text style={styles.disclaimer}>
        Sursele sunt afișate în mod neutru. Starea de transmisie live va fi
        disponibilă într-o versiune viitoare a aplicației.
      </Text>
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
  actionButton: {
    backgroundColor: palette.blueSoft,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 2,
  },
  actionButtonText: { color: palette.blue, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.75 },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  disclaimer: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingTop: 4 },
});
