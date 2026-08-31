import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/providers/auth-provider';
import { LocalizationProvider } from '@/providers/localization-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}
