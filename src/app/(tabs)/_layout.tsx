import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { palette } from '@/constants/palette';
import { useLocalization } from '@/providers/localization-provider';

const TabIcon = ({ symbol, color }: { symbol: string; color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{symbol}</Text>;

export default function TabsLayout() {
  const { t } = useLocalization();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primaryInk,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.divider, height: 66, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: t('nav.home'), tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} /> }} />
      <Tabs.Screen name="prayers" options={{ title: t('nav.prayers'), tabBarIcon: ({ color }) => <TabIcon symbol="☦" color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: t('nav.calendar'), tabBarIcon: ({ color }) => <TabIcon symbol="▦" color={color} /> }} />
      <Tabs.Screen name="bible" options={{ title: t('nav.bible'), tabBarIcon: ({ color }) => <TabIcon symbol="▤" color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: t('nav.chat'), tabBarIcon: ({ color }) => <TabIcon symbol="◌" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: t('nav.account'), tabBarIcon: ({ color }) => <TabIcon symbol="○" color={color} /> }} />
    </Tabs>
  );
}
