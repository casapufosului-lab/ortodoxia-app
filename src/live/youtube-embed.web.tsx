/**
 * YouTube embed player — web platform fallback.
 *
 * On web, uses an iframe to embed the YouTube player directly.
 * This preserves YouTube branding and controls.
 * No download, no proxy, no restream.
 */

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/palette';

import { buildYouTubeEmbedUrl } from './live-playback';

interface YouTubeEmbedProps {
  videoId: string | null;
  onClose: () => void;
}

export function YouTubeEmbed({ videoId, onClose }: YouTubeEmbedProps) {
  if (!videoId) return null;

  const embedUrl = buildYouTubeEmbedUrl(videoId);

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Închide playerul video"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>✕ Închide</Text>
          </Pressable>
        </View>
        <iframe
          src={embedUrl}
          title="Player YouTube live"
          style={{ border: '0', width: '100%', flex: 1 }}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#000',
  },
  closeButton: {
    backgroundColor: palette.blueSoft,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
