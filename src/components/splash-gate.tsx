import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type PropsWithChildren } from 'react';

import { markStartup } from '@/lib/startup-timing';
import { useLocalization } from '@/providers/localization-provider';

/**
 * Keeps the native splash on screen until the app can actually draw something.
 *
 * THE BUG THIS FIXES
 * ------------------
 * `LocalizationProvider` renders `null` until its three AsyncStorage reads resolve
 * (country, language, calendar preference), and every screen below it depends on
 * that provider. The native splash, however, auto-hides as soon as the first frame
 * is drawn — and the first frame was empty. On a cold start the user therefore saw
 * splash, then a white screen for as long as storage took, then the Home screen.
 *
 * The previous code never called `SplashScreen.hideAsync()` at all: the symbol was
 * imported by `src/components/animated-icon.tsx`, an Expo template file that nothing
 * rendered (removed in the same change), so `preventAutoHideAsync()` had no effect
 * and the timing was entirely up to the platform.
 *
 * WHAT CHANGED
 * ------------
 * `preventAutoHideAsync()` is called at module scope in `src/app/_layout.tsx`, before
 * the navigator mounts, and this component hides the splash exactly once the
 * localization provider reports that it is ready. The failure modes are covered:
 *
 *   - a platform where `preventAutoHideAsync` is unsupported resolves to a no-op and
 *     the splash behaves as before (better than never hiding and showing a frozen
 *     splash forever);
 *   - `hideAsync()` rejecting is swallowed, because a failed animation must not take
 *     down the first screen — the OS hides the splash on its own in that case.
 */
export function SplashGate({ children }: PropsWithChildren) {
  const { isLoading } = useLocalization();

  useEffect(() => {
    if (isLoading) return;
    markStartup('splashHidden');
    SplashScreen.hideAsync().catch(() => {
      // The splash is already scheduled to disappear natively; nothing to recover.
    });
  }, [isLoading]);

  if (isLoading) return null;
  return children;
}
