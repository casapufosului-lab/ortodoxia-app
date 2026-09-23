# Review `app.json` / `eas.json` (23.09.2026)

Ce s-a verificat: fișierele care decid ce pleacă spre App Store și Google Play. Modificările din
`app.json`/`eas.json` veneau din altă sesiune și intraseră necomise în arborele de lucru; le-am citit,
le-am validat (`npx expo config --type public` rezolvă configul) și am reparat ce nu era în regulă.

## Ce e bine

| Verificare | Rezultat |
|---|---|
| Configul se rezolvă | `npx expo config --type public --json` → `slug: ortodoxia`, `owner: ortodoxia`, `projectId: ef0641df-…` |
| Identitatea aplicației | `ro.ortodoxia.app` la iOS ȘI la Android, `scheme: ortodoxia` |
| Pluginul de dictare | `expo-speech-recognition` configurat cu mesajele de permisiune + pachetele serviciului Android |
| Variabilele publice în profilul de producție | toate cele 9 cerute de aplicație (Supabase, identitate legală, URL-uri legale) |
| Fără secrete de server | profilul nu conține cheie de service, token sau parolă (verificat automat) |
| Mesajele iOS vs plugin | identice (fără două surse de adevăr divergente) |
| URL-urile legale | `https://ortodoxia.web.app/privacy` și `/terms` — publicate, răspund 200 |

## Ce am reparat

1. **`autoIncrement` lipsea din profilul de producție.** Fără el, al doilea build de producție ar fi
   refolosit `versionCode 1` / `buildNumber 1`, iar Play Console / App Store Connect respinge al doilea
   upload cu același număr. Acum: `"autoIncrement": true`.
2. **Nu exista profil de `submit`.** `eas submit` ar fi cerut un profil interactiv la fiecare trimitere.
   Acum există `submit.production` (credențialele de magazin rămân în EAS, nu în depozit).
3. **Garda din poarta de release** (`scripts/release-readiness.mjs`) verifică acum și configurația de
   build: variabile publice complete, zero secrete de server, `autoIncrement`, mesajele de permisiune
   identice cu pluginul și — cel mai important — **nicio cheie RevenueCat de test în producție**.

## Ce rămâne de făcut de owner (blochează publicarea, nu e cod)

1. **`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` este încă o cheie de TEST** (`test_hVIDVoa…`). Cu ea,
   un build de producție nu poate vinde nimic, iar magazinele resping IAP care nu funcționează.
   Se înlocuiește cu cheia publică SDK din RevenueCat (Project → API keys → *public app-specific key*),
   ca variabilă de mediu EAS, nu în fișier comis.
2. **`EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` lipsește** (se emite după ce contul plătit Apple există).
3. **Produsele IAP trebuie create în ambele magazine** (`ro.ortodoxia.premium.monthly` / `.annual`) și
   atașate la offering-ul RevenueCat — altfel ecranul premium nu are ce vinde.
4. **De verificat o dată, online:** `npx eas-cli project:info` — slug-ul din `app.json` (`ortodoxia`) și
   `owner` (`ortodoxia`) trebuie să corespundă proiectului EAS existent. `projectId`-ul este același, deci
   build-urile merg; dacă în dashboard proiectul se numește altfel, se redenumește acolo (nu în două locuri).

## Cum se verifică

```powershell
npm run test:release          # CI mode: 23 pass / 0 fail / 3 deferred (cele „deferred" sunt chei de magazin)
node scripts/release-readiness.mjs --release   # RELEASE mode: iese cu FAIL pe cheile de magazin
npm test                      # include tests/release-config.test.mjs (7 teste pe app.json + eas.json)
npx expo config --type public  # configul rezolvat, așa cum îl vede EAS
```
