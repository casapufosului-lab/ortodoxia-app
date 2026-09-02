import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { configureRevenueCat } from '@/lib/revenuecat';
import { AuthProvider } from '@/providers/auth-provider';
import { LocalizationProvider } from '@/providers/localization-provider';

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
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ title: 'Contul meu', presentation: 'modal' }} />
            <Stack.Screen name="reset-confirmation" options={{ title: 'Verifică emailul', presentation: 'modal' }} />
            <Stack.Screen name="premium" options={{ title: 'Premium', presentation: 'modal' }} />
            <Stack.Screen name="live" options={{ title: 'Slujbe LIVE' }} />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}
