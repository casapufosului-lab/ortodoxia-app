# Android native hardening

Everything that has to be true in the **generated** Android project — the manifest and
`app/build.gradle` — is produced by configuration that lives in git. Nothing is edited by hand in
`android/`, because `android/` is git-ignored (`.gitignore`, line ~50) and every `expo prebuild`
regenerates it. Hand edits survive until the next build and then disappear silently.

Sources of truth, in order:

| Concern | Where it lives |
| --- | --- |
| Manifest and Gradle hardening | `plugins/with-android-hardening.js` + `app.json` → `expo.plugins` |
| Notification icon and colour | `app.json` → `expo.plugins` → `expo-notifications` |
| Adaptive icon (including the monochrome layer) | `app.json` → `expo.android.adaptiveIcon` |
| Release signing | environment variables (local) or EAS-injected properties (`android.injected.signing.*`) |

## What the plugin does

`plugins/with-android-hardening.js` is a standard Expo config plugin. It runs on every prebuild and:

1. **Removes the 16 ShortcutBadger badge permissions** (`READ_APP_BADGE`, `com.sec.android…`,
   `com.huawei…`, `me.everything.badger…`, …) with `tools:node="remove"`. They arrive transitively
   through `expo-notifications`; the app never calls a badge API. Also removes
   `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`, which nothing in `src/` uses.
2. **Sets `android:usesCleartextTraffic="false"`.** All app traffic is HTTPS.
3. **Replaces the release signing config.** The Expo SDK 57 template ships
   `signingConfig signingConfigs.debug` inside `buildTypes.release`; an AAB signed with the debug
   key is refused at upload, and the error only shows up in Play Console. The plugin declares a
   `signingConfigs.release` block that reads either the `ORTODOXIA_UPLOAD_*` environment variables
   or the `android.injected.signing.*` properties injected by EAS Build, and stops the build with a
   clear `GradleException` if neither is present. Fail loudly, never ship a wrong-signed artifact.

4. **Turns on release minification** (audit item C21). The Expo SDK 57 template reads both switches
   from `android/gradle.properties` —
   `app/build.gradle:69` `enableMinifyInReleaseBuilds = findProperty('android.enableMinifyInReleaseBuilds') ?: false`
   and `app/build.gradle:153-155` `enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'`
   — so without them a release build came out unobfuscated and with the whole resource tree.
   The plugin now writes `android.enableMinifyInReleaseBuilds=true` and
   `android.enableShrinkResourcesInReleaseBuilds=true` on every prebuild.

   **Status: wired, tested and smoke-tested with R8 on** (08.10.2026). A release *test* build was
   produced with a throwaway keystore, R8 ran (`Task :app:minifyReleaseWithR8` in the Gradle log),
   the APK was installed on Pixel_7 (`emulator-5554`) after an explicit `adb uninstall` of the old
   package (a differently-signed package cannot be replaced in place), the merged manifest carried no
   badge/storage permissions, the app started without a crash, and the login chain (sign in →
   account visible → `am force-stop` → relaunch, still authenticated) stayed green on the minified
   build. The artifact is a *test* artifact: it is signed with `CN=Ortodoxia Test Build, O=Worker,
   C=RO`, not with the upload key and not with the debug key. If anything had broken, the one-line retreat is
   `android.enableMinifyInReleaseBuilds=false` in `android/gradle.properties` for that build, plus a
   `-keep` rule in `android/app/proguard-rules.pro`; tell the agent and it will be fixed in the plugin.

The plugin is idempotent: running prebuild twice on the same folder changes nothing. If the
upstream template changes in a way the plugin does not recognise, it throws rather than patching
the wrong thing.

## Regenerating the native project

```powershell
npx expo prebuild -p android --no-install
```

Note that prebuild rewrites `package.json`'s `android`/`ios` scripts (`expo start --android` →
`expo run:android`). If the project intends to keep the `start` variants, restore that file after
prebuild — it is unrelated to the hardening.

## Building a release locally

```powershell
$env:ORTODOXIA_UPLOAD_STORE_FILE       = "C:\path\to\upload.keystore"
$env:ORTODOXIA_UPLOAD_STORE_PASSWORD   = "<password>"
$env:ORTODOXIA_UPLOAD_KEY_ALIAS        = "<alias>"
$env:ORTODOXIA_UPLOAD_KEY_PASSWORD     = "<password>"
cd android; .\gradlew.bat bundleRelease
```

Never commit the keystore or its passwords. On EAS the same values come from the build
credentials, so no local variables are needed.

## How this is enforced

* `tests/android-hardening.test.mjs` runs the plugin's mods against the real template text and a
  manifest fixture, and checks `app.json` still wires everything. Part of `npm test`.
* `scripts/release-readiness.mjs` → `checkAndroidNativeHardening()` fails if the plugin is
  unwired, or if a checked-out `android/` folder does not carry the plugin's output. Part of
  `npm run verify` / `npm run preflight`.

## `google-services.json`: where it may live

`app.json` sets `expo.android.googleServicesFile = "./google-services.json"`. That value is a **path
relative to the project root**, and two things read it:

* Expo's own prebuild plugins — `@expo/config-plugins/build/android/GoogleServices.js`: it copies the
  file to `android/app/google-services.json` (`DEFAULT_TARGET_PATH`, line 46) and, if the source does
  not exist, **throws** `Cannot copy google-services.json from … to …. Ensure the source and
  destination paths exist.` (lines 88-102). The same default plugin set adds the
  `com.google.gms:google-services` classpath and applies it (`@expo/prebuild-config/build/plugins/
  withDefaultPlugins.js` lines 150, 152, 161).
* `scripts/release-readiness.mjs` → `checkPushNotifications()`: it looks for the file in
  `google-services.json` **or** `android/app/google-services.json`, and requires `app.json` to point at
  it, `expo-notifications` to be a dependency and the cron script to exist.

So the file in `android/app/` is not a hand edit to preserve: **every prebuild re-creates it from the
root copy**, and the Gradle wiring with it. The consequence for a fresh checkout is that prebuild
fails loudly until the root copy exists.

Putting the copy at the repo root is **not** the way to satisfy that, because the release gate treats
it as a leaked credential. Measured 08.10.2026:

```
# with google-services.json at the repo root:
FAIL [security] 1 possible credential(s) in source   →  google-services.json: possible Google API key
# after removing it again:
PASS [security] no hardcoded credential pattern found in the tracked tree
passed: 31   failed: 0   deferred: 3
```

The reason is explicit in the checker: `SECRET_PATTERNS` matches `AIza[0-9A-Za-z_-]{30,}`
(`release-readiness.mjs:782`) and the walk deliberately skips the generated native folders —
`if (['node_modules', '.git', '.expo', 'dist', 'work', 'android', 'ios', '.npm-cache'].includes(entry.name)) continue;`
(`release-readiness.mjs:810`). The root is not skipped, so a Firebase config there fails the gate.
Relaxing that check to make the file fit is forbidden — the check is right, the file is in the
wrong place.

Accepted routes, in order of preference:

1. **EAS file variable (recommended).** Upload the file once as a secret environment variable of type
   *file* named `GOOGLE_SERVICES_JSON`; EAS makes it available to the build job **as a path**, so
   `app.json` cannot read it and the app config has to become dynamic:

   ```js
   // app.config.js — app.json is still read and handed in as `config`
   module.exports = ({ config }) => ({
     ...config,
     android: {
       ...config.android,
       googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
     },
   });
   ```

   Nothing lands at the repo root, so the security gate stays green; local development keeps working
   with a file in `android/app/` or with `EXPO_PUBLIC_*`-style local env. This touches `app.json`
   (owned by the launch session) — it is an owner decision, and the fallback keeps the current
   behaviour intact when the variable is unset.

   **Implemented on 08.10.2026:** this route is in the tree. `app.config.js` reads
   `GOOGLE_SERVICES_JSON_PATH` or `GOOGLE_SERVICES_JSON` (the name EAS Build gives a file-type
   variable) and falls back to `./google-services.json` when neither points at an existing file —
   warning on stderr, so a missing file cannot pass unnoticed. The Gradle wiring no longer depends on
   a hand edit either: `plugins/with-google-services.js` (registered in `app.json`) adds the
   `com.google.gms:google-services` classpath to `android/build.gradle` and the `apply plugin` line
   that activates it in `android/app/build.gradle`, at prebuild time, idempotently.
   Covered by `tests/google-services-plugin.test.mjs` (a mutant that drops the `apply plugin` line
   makes it fail). Nothing was relaxed in the credential scanner.

2. **Transient local copy.** For a *local* prebuild only: copy the file to the repo root, run
   `npx expo prebuild -p android`, then delete it. The gate must not be run while it is there — it
   would (correctly) report the FAIL above.
3. **`eas.json` `prebuildCommand`.** Keep `app.json` static and have the build step place
   `$GOOGLE_SERVICES_JSON` at the root before running `npx expo prebuild`. Same effect as route 1 with
   no app-config change, at the cost of owning the prebuild command in `eas.json`.

Whatever the route, the Firebase **admin** credential must never travel: `google-services.json`
contains only the client key (restricted by package name + SHA-1), which is public by design and ends
up inside the APK/AAB anyway.
