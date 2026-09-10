/**
 * YouTube player for native platforms.
 *
 * Uses the official YouTube IFrame Player API through react-native-youtube-iframe.
 * Normal playback stays in portrait.
 * Android fullscreen rotates to landscape only after the user requests fullscreen.
 */

import { useCallback, useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BackHandler, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

import { useLocalization } from '@/providers/localization-provider';


export interface YouTubeEmbedProps {
  videoId: string | null;
  onClose: () => void;
}

export function YouTubeEmbed({ videoId, onClose }: YouTubeEmbedProps) {
  const { t } = useLocalization();
  const { width } = useWindowDimensions();

  const handleBack = useCallback(() => {
    if (videoId) {
      onClose();
      return true;
    }
    return false;
  }, [videoId, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  const handleFullScreenChange = useCallback((isFullScreen: boolean) => {
    const orientation = isFullScreen
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;

    void ScreenOrientation.lockAsync(orientation).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!videoId) return;

    return () => {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    };
  }, [videoId]);

  if (!videoId) return null;

  const playerHeight = Math.max(220, Math.round(width * 9 / 16));

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.playerArea}>
          <YoutubePlayer
            height={playerHeight}
            videoId={videoId}
            onFullScreenChange={handleFullScreenChange}
            initialPlayerParams={{
              controls: true,
              preventFullScreen: false,
              rel: false,
            }}
            webViewProps={{
              allowsFullscreenVideo: true,

              accessibilityLabel: t('live.playerAccessibilityLabel'),
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  playerArea: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
});
