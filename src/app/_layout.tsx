import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { configureRevenueCat } from '@/lib/revenuecat';
import { AuthProvider } from '@/providers/auth-provider';
import { LocalizationProvider, useLocalization } from '@/providers/localization-provider';

/**
 * Renders the navigation Stack with localized header titles.
 * Must be rendered as a child of LocalizationProvider.
 */
function StackScreens() {
  const { t } = useLocalization();
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
  const colorScheme = useColorScheme();

  // Initializăm RevenueCat la pornirea aplicației, cât mai devreme posibil,
  // astfel încât cumpărările să fie disponibile din prima ecran Premium.
  useEffect(() => {
    configureRevenueCat();
  }, []);

  return (
    <LocalizationProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <StackScreens />
        </ThemeProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}
