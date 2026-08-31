import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') throw new Error('Notificările push se configurează în aplicația mobilă.');
  if (!Device.isDevice) throw new Error('Notificările push se testează pe un telefon real.');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-content', {
      name: 'Mesajul zilei',
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
