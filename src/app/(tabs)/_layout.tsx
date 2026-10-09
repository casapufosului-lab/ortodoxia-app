import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { tabBarMetrics } from '@/lib/tab-bar-metrics';
import { useLocalization } from '@/providers/localization-provider';

/**
 * Regula 27 din AGENTS.md: iconițele importante se văd, minim 24. Tab-urile aveau glyfe
 * la 20, deci sub prag — de aici `TAB_ICON_SIZE`, ca valoarea să fie una singură și
 * verificabilă (`tests/tab-icons-rule-27.test.mjs`).
 *
 * Clauza „fiecare în cerc alb" nu se randează aici: bara de tab-uri e deja alb pur
 * (`palette.card` = #FFFFFF), deci un cerc alb ar fi invizibil. Cercul din regulă se referă
 * la iconițele desenate PESTE conținut.
 */
const TAB_ICON_SIZE = 24;

const TabIcon = ({ symbol, color }: { symbol: string; color: ColorValue }) => (
  <Text style={{ color, fontSize: TAB_ICON_SIZE, lineHeight: TAB_ICON_SIZE + 4 }}>{symbol}</Text>
);

export default function TabsLayout() {
  const { t } = useLocalization();
  /**
   * Bug 09.10.2026: înălțimea și padding-ul de jos erau fixe (66 / 8), deci pe telefoanele
   * cu navigare pe 3 butoane bara de tab-uri rămânea sub bara de sistem (Android 15 e
   * edge-to-edge obligatoriu, iar aplicația are targetSdk 36). `insets.bottom` se adaugă
   * peste dimensiunea de bază, prin `tabBarMetrics`, ca bara să rămână deasupra barei de
   * navigare. Pe navigarea gestuală `insets.bottom` e mic, deci bara arată aproape la fel.
   */
  const insets = useSafeAreaInsets();
  const barMetrics = tabBarMetrics(insets.bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primaryInk,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.divider, ...barMetrics, paddingTop: 6 },
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
