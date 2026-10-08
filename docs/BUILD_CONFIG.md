# Build Configuration — Ortodoxia App

> **Status:** LOCAL ONLY — configuration complete; next step is external credentials.

## App Identity

| Field | Value |
|-------|-------|
| **App name** | Ortodoxia |
| **Slug** | ortodoxia-app |
| **Scheme** | `ortodoxia` (deep-link: `ortodoxia://`) |
| **iOS bundle ID** | `ro.ortodoxia.app` |
| **Android package** | `ro.ortodoxia.app` |

## Versioning

| Field | Current value | Increment rule |
|-------|-------------|----------------|
| **app.json `version`** | `1.0.0` | Semantic versioning — increment for every public store release |
| **app.json `ios.buildNumber`** | `1` | Increment for every iOS build submitted (TestFlight, App Store) |
| **app.json `android.versionCode`** | `1` | Integer; increment monotonically for every Android build |

## EAS Build Profiles (`eas.json`)

### `development`
- `developmentClient: true` — uses a development build (required for Expo Router, Expo Notifications, RevenueCat)
- `distribution: "internal"` — internal distribution
- `ios.simulator: false` — builds for **real iPhone device** (not simulator)
- Use for: `eas build --profile development --platform ios` (or android)
- Also: `expo start` for local Metro bundler without native build

### `preview`
- `distribution: "internal"` — internal distribution
- `ios.simulator: false` — builds for device (ad-hoc or enterprise)
- Use for: `eas build --profile preview --platform ios` (or android)
- Suitable for internal testing on physical devices

### `production`
- No special flags — standard release build
- Use for: `eas build --profile production --platform ios` (or android)
- This profile is used when running `eas build` without `--profile`

## Deep Links

| URL | Purpose |
|-----|---------|
| `ortodoxia://auth` | Auth modal (sign-in / sign-up / password reset) |
| `ortodoxia://reset-confirmation` | Password reset confirmation |
| `ortodoxia://premium` | Premium subscription screen |
| `ortodoxia://` | Home tab |

Supabase Auth redirects use `ortodoxia://auth?type=recovery` for password recovery.

## App Scheme Configuration

The scheme `ortodoxia` is declared in `app.json`:

```json
"scheme": "ortodoxia"
```

This enables `Linking.openURL('ortodoxia://...')` calls and Supabase Auth redirect URLs.

## Permissions

| Platform | Permission | Reason | Source |
|----------|-----------|--------|--------|
| **iOS** | (notification authorization via `UNUserNotificationCenter.requestAuthorization`) | expo-notifications requests at runtime via `Notifications.requestPermissionsAsync()` | expo-notifications plugin (runtime) |
| **Android** | `POST_NOTIFICATIONS` | Required on Android 13+ (API 33+) for push notifications | expo-notifications plugin |
| **Android** | `INTERNET` | All network: Supabase, Expo, RevenueCat, YouTube API via Edge Functions | React Native default |
| **Android** | `VIBRATE` | Notification vibration on Android | expo-notifications default |
| **Android** | `RECEIVE_BOOT_COMPLETED` | Re-schedule notifications after restart | expo-notifications default |

**No camera, microphone, photo library, or location permissions are used.**

## Required External Credentials

### Supabase
| Credential | Where to set |
|-----------|-------------|
| `SUPABASE_URL` | Supabase Dashboard -> Project Settings -> API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard -> Project Settings -> API (anon public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard -> Project Settings -> API (service_role — server-side only) |

### RevenueCat
| Credential | Where to set |
|-----------|-------------|
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | RevenueCat Dashboard -> Project Settings -> API Keys -> Platform API Key (iOS) |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | RevenueCat Dashboard -> Project Settings -> API Keys -> Platform API Key (Android) |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | RevenueCat -> Project Settings -> Webhooks (server-side only) |
| `REVENUECAT_API_KEY` | RevenueCat -> Project Settings -> API Keys -> Secret keys (`sk_…`, server-side only; the webhook reads `GET api.revenuecat.com/v1/subscribers/<id>` with it, `supabase/functions/revenuecat-webhook/core.ts:485`) |

### OpenAI
| Credential | Where to set |
|-----------|-------------|
| `OPENAI_API_KEY` | platform.openai.com -> API Keys (server-side only) |

### YouTube (optional — for live services)
| Credential | Where to set |
|-----------|-------------|
| `YOUTUBE_DATA_API_KEY` | Google Cloud Console -> YouTube Data API v3 (server-side only) |

### App-specific secrets
| Credential | Purpose |
|-----------|---------|
| `NOTIFICATION_CRON_SECRET` | Shared secret for cron->Edge Function auth (`x-cron-secret` header) |
| `PRAYER_AUDIO_GENERATION_TOKEN` | Token for audio generation Edge Function (`x-generation-token` header) |

## Environment Variables

### Client-safe (`EXPO_PUBLIC_*`) — in `.env`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`

### Server-side only — Supabase Dashboard -> Edge Functions -> Secrets
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `REVENUECAT_WEBHOOK_AUTH_TOKEN`
- `REVENUECAT_API_KEY`
- `OPENAI_API_KEY`
- `YOUTUBE_DATA_API_KEY`
- `NOTIFICATION_CRON_SECRET`
- `PRAYER_AUDIO_GENERATION_TOKEN`

## Build Commands

```bash
# Local development (no native build)
npm start

# Development build (native, with dev tools — real device)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (internal testing on device)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Production build
eas build --profile production --platform ios
eas build --profile production --platform android
```

## Assets

All required assets exist and are correctly referenced in `app.json`:

| Asset | Path | Status |
|-------|------|--------|
| App icon | `assets/images/icon.png` | present |
| Android foreground | `assets/images/android-icon-foreground.png` | present |
| Android background | `assets/images/android-icon-background.png` | present |
| Android monochrome | `assets/images/android-icon-monochrome.png` | present |
| Splash icon | `assets/images/splash-icon.png` | present |
| Web favicon | `assets/images/favicon.png` | present |
| iOS expo icon | `assets/expo.icon/icon.json` | present |

## What Remains (External)

1. Create Expo account / sign in: `eas login`
2. Create EAS project: `eas project:create` (or link via `eas build`)
3. Configure Apple Developer account and provisioning profiles
4. Configure Google Play Console
5. Set all secrets in Supabase Dashboard -> Edge Functions -> Secrets
6. Run `eas credentials` to configure iOS certificates
7. Run `eas build` for each platform/profile
8. Set up Supabase cron job for `send-daily-notifications` (production only)
9. Set up RevenueCat webhook pointing to `revenuecat-webhook` Edge Function