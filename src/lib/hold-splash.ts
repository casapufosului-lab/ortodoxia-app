import * as SplashScreen from 'expo-splash-screen';

/**
 * Holds the native splash screen from the very first evaluated module.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * Startup is deferred: `metro.config.js` enables `inlineRequires`, so a module's body
 * runs the first time something uses it, not when the file is imported. That is what
 * keeps the Play Billing SDK and the Moldova calendar seeds off the launch path — and
 * it also means a side effect attached to a large module can now run *after* the first
 * render instead of before it.
 *
 * `SplashScreen.preventAutoHideAsync()` is exactly such a side effect: run too late,
 * the platform has already dismissed the splash and the user sees the white gap that
 * `SplashGate` exists to remove. Calling it from a module that imports nothing else
 * makes the ordering explicit — `src/app/_layout.tsx` imports this module before any
 * other import, so by the time the first component is constructed the splash is held.
 *
 * A platform that does not support the call (web) leaves the returned promise rejected;
 * the splash then behaves as it always did, which is better than never hiding.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  // Unsupported platform, or the splash was already prevented.
});
