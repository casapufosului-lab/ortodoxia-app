// MUST be the first import: with `inlineRequires` enabled, a module body runs on first
// use, so the splash hold has to come from a module that is evaluated immediately and
// depends on nothing else. See src/lib/hold-splash.ts.
import '@/lib/hold-splash';

import { DefaultTheme, Stack, ThemeProvider, router, type Href } from 'expo-router';
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
    // Pornirea aplicatiei nu are voie sa depinda de magazin: daca SDK-ul nu poate fi
    // configurat (cheie lipsa/invalida, modul nativ indisponibil), ecranele trebuie sa
    // se incarce in continuare si sa arate "magazinul nu este disponibil".
    try {
      configureRevenueCat();
    } catch (error) {
      if (__DEV__) {
        console.warn('RevenueCat: configurarea a esuat; magazinul rămâne indisponibil.', error);
      }
    }
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
