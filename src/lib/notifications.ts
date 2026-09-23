import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { resolveNotificationRoute, type DailyNotificationData } from '@/lib/notification-routing';

export const DAILY_NOTIFICATION_CHANNEL_ID = 'daily-content';

// Routing rules live in a pure module so they can be unit-tested without Expo.
export { resolveNotificationRoute, type DailyNotificationData };

/**
 * Subscribe to notification taps, for both warm and cold starts.
 *
 * `getLastNotificationResponseAsync` covers the cold-start case: the response is
 * delivered before React mounts, so a listener alone would miss it.
 */
export function subscribeToNotificationResponses(
  onRoute: (route: string) => void,
): () => void {
  if (Platform.OS === 'web') return () => undefined;

  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const data = response.notification.request.content.data as DailyNotificationData | undefined;
    onRoute(resolveNotificationRoute(data));
  };

  void Notifications.getLastNotificationResponseAsync().then(handle).catch((error) => {
    console.warn('Could not read the last notification response:', error);
  });

  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}

export async function registerForPushNotificationsAsync(channelName: string) {
  if (Platform.OS === 'web') throw new Error('Notificările push se configurează în aplicația mobilă.');
  if (!Device.isDevice) throw new Error('Notificările push se testează pe un telefon real.');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DAILY_NOTIFICATION_CHANNEL_ID, {
      name: channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') throw new Error('Permisiunea pentru notificări a fost refuzată.');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Aplicația nu are încă un proiect EAS configurat.');

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return { token, platform: Platform.OS as 'ios' | 'android' };
}

/** Current device IANA timezone, falling back to the configured region. */
export function currentTimezone(fallbackTimezone: string): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || fallbackTimezone;
}

/** Open the OS notification settings so a user can fix a denied permission. */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.warn('Could not open the system settings:', error);
  }
}
