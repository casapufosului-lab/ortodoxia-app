/**
 * YouTube embed player using react-native-webview (native platforms).
 *
 * Renders a full-screen Modal with an official YouTube embed iframe.
 * - No autoplay: user must tap to play inside the embed.
 * - Preserves YouTube branding and controls.
 * - No download, no proxy, no restream.
 * - Properly cleans up on close/unmount.
 */

import { useCallback, useEffect } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview'
import { useLocalization } from '@/providers/localization-provider';

import { palette } from '@/constants/palette';

import { buildYouTubeEmbedUrl } from './live-playback';

export interface YouTubeEmbedProps {
  videoId: string | null;
  onClose: () => void;
}

export function YouTubeEmbed({ videoId, onClose }: YouTubeEmbedProps) {
  const { t } = useLocalization();
  const handleBack = useCallback(() => {
    if (videoId) {
      onClose();
      return true; // consumed
    }
    return false;
  }, [videoId, onClose]);

  // Handle hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

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
            accessibilityLabel={t('live.closePlayerAccessibilityLabel')}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>{t('live.closePlayer')}</Text>
          </Pressable>
        </View>
        <WebView
          source={{ uri: embedUrl }}
          style={styles.webview}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          startInLoadingState
          originWhitelist={['https://www.youtube.com', 'https://youtube.com']}
          accessibilityLabel={t('live.playerAccessibilityLabel')}
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
  webview: { flex: 1 },
  pressed: { opacity: 0.75 },
});
