const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration.
 *
 * WHY `inlineRequires` IS ON
 * --------------------------
 * Expo's default transformer config sets `inlineRequires: false`
 * (node_modules/@expo/metro-config/build/ExpoMetroConfig.js). With that default, every
 * `import` at the top of a module becomes a module-scope `require`, so the whole
 * dependency graph is evaluated before the first screen can render.
 *
 * The measured bundle makes that expensive:
 *   - `react-native-purchases` pulls in the Google Play Billing library: 1.13MB of
 *     the non-minified Android bundle, evaluated at launch even though the store is
 *     only needed on the Premium screen.
 *   - `src/data/md-calendar-2026.json` and `md-chisinau-calendar-2026.json` add
 *     ~305KB, evaluated at launch even for the 12 countries that never use Moldova's
 *     calendar.
 *   - `src/i18n/config.ts` is 388KB and is needed, but the modules it imports are not.
 *
 * With `inlineRequires: true` those requires move to the first place each binding is
 * used, so a module that the first screen never touches is never evaluated. Metro
 * still parses it — the bundle is one file — but evaluation and the native module
 * registration behind it are skipped, which is what the user waits for.
 *
 * This is the configuration React Native's own template ships
 * (react-native/template/metro.config.js), so it is the well-trodden path rather
 * than a local invention.
 */
const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

module.exports = config;
