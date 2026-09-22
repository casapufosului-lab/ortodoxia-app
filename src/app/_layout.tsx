import { DefaultTheme, Stack, ThemeProvider, router, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SplashGate } from '@/components/splash-gate';
import { useNotificationTimezoneSync } from '@/hooks/use-notification-timezone-sync';
import { subscribeToNotificationResponses } from '@/lib/notifications';
import { configureRevenueCat } from '@/lib/revenuecat';
import { markStartup } from '@/lib/startup-timing';
import { AuthProvider } from '@/providers/auth-provider';
import { LocalizationProvider, useLocalization } from '@/providers/localization-provider';

/**
 * Hold the native splash until the first real screen can draw.
 *
 * Called at module scope, not inside an effect: the splash must be prevented from
 * auto-hiding before React mounts, otherwise the platform can dismiss it during the
 * first render pass and the user sees the white gap that SplashGate exists to remove.
 * Failures are ignored on purpose — see src/components/splash-gate.tsx.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  // Unsupported platform (web) or already prevented: the splash auto-hides normally.
});

/**
 * Renders the navigation Stack with localized header titles.
 * Must be rendered as a child of LocalizationProvider.
 */
function StackScreens() {
  const { t } = useLocalization();
  // Send the user to the content the push referred to (warm and cold start).
  // K-01: the destination comes from the notification payload, so it is a plain
  // string at runtime. resolveNotificationRoute() already rejects anything that
  // is not an in-app absolute path (no "//", no "://"); the cast to Href is the
  // single, deliberate boundary where that runtime guarantee meets the typed
  // route union. `as never` (the previous code) silenced the checker for the
  // whole call and would have hidden a genuinely invalid route.
  useEffect(() => subscribeToNotificationResponses((route) => {
    router.push(route as Href);
  }), []);
  // Keep the stored notification timezone aligned with the device.
  useNotificationTimezoneSync();
  // First render of the navigator: measured so a startup regression can be told
  // apart from slow storage reads (see src/lib/startup-timing.ts).
  markStartup('firstScreen');
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ title: t('account.pageTitle'), presentation: 'modal' }} />
      <Stack.Screen name="reset-confirmation" options={{ title: t('resetConfirmation.title'), presentation: 'modal' }} />
      <Stack.Screen name="premium" options={{ title: 'Premium', presentation: 'modal' }} />
      <Stack.Screen name="live" options={{ title: t('live.title') }} />
      <Stack.Screen name="privacy" options={{ title: t('layout.privacyTitle') }} />
      <Stack.Screen name="terms" options={{ title: t('account.termsLink') }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Initializăm RevenueCat la pornirea aplicației, cât mai devreme posibil,
  // astfel încât cumpărările să fie disponibile din prima ecran Premium.
  useEffect(() => {
    configureRevenueCat();
  }, []);

  return (
    <LocalizationProvider>
      <SplashGate>
        <AuthProvider>
          <ThemeProvider value={DefaultTheme}>
            <StatusBar style="dark" />
            <StackScreens />
          </ThemeProvider>
        </AuthProvider>
      </SplashGate>
    </LocalizationProvider>
  );
}
