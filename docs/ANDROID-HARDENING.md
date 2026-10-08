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

   **Status: the switch is wired and tested, but a release build has not yet been smoke-tested on the
   emulator with R8 on** (a release build was in flight in the owner's session when this landed, so
   running a second one in the same `android/` folder was avoided deliberately). Before the next store
   build, do one test build (a throwaway keystore is fine — the artifact is a *test* artifact, not a
   store one) and open the app on the emulator. R8 mistakes show up as a crash on launch or as a
   feature that silently stops working. If anything breaks, the one-line retreat is
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
