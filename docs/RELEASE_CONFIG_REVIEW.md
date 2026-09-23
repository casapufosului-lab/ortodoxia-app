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
4. **Verificat:** `npx eas-cli project:info` → `@ortodoxia/ortodoxia`. Slug-ul (`ortodoxia`) și `owner`
   (`ortodoxia`) din `app.json` corespund proiectului EAS existent, deci nu trebuie redenumit nimic.

## Starea EAS (23.09.2026, seara)

| Build | Profil | Commit | Rezultat |
|---|---|---|---|
| `03569e16` (pornit de contul `ortodoxia123`) | `production` | `caed0dd` | **terminat** → `.aab`, `versionCode 1` |
| `79c70e73` (pornit de aici) | `preview` | `74d065a` | în coadă → APK de test instalabil |
| `1811380f` | `preview` | `74d065a` | **anulat** (duplicat: aceeași comandă a fost reluată) |

**`.aab`-ul de producție NU se trimite la magazin**, din două motive măsurate:

1. e construit din commit-ul `caed0dd`, adică **înainte** de localizarea mesajelor de cotă (`7e39a3b`) și de
   reparările din `eas.json` (`3411405`, `74d065a`);
2. profilul de producție are **cheia RevenueCat de test** — un build de magazin cu ea nu poate vinde nimic,
   exact ce semnalează `--release` cu FAIL.

**`versionCode 1` e deja folosit** de acel build: următorul build de producție trebuie să aibă `versionCode 2`,
iar asta se întâmplă singur, fiindcă `autoIncrement: true` a fost adăugat între timp.

### Ce mai trebuie pentru `submit` (owner)

1. **Cheile RevenueCat reale** în profilul `production` (`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` +
   `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`), plus produsele `ro.ortodoxia.premium.monthly` / `.annual`
   create în Play Console și App Store Connect și atașate la offering-ul RevenueCat.
2. **Play Console:** aplicația `ro.ortodoxia.app` creată, un track (intern/closed) și un **cont de serviciu**
   cu drept de publicare (`eas credentials` sau cheia JSON la `eas submit`).
3. **App Store Connect:** aplicația înregistrată, acordurile semnate, credențialele Apple în EAS.
4. Abia apoi: `eas build --profile production --platform android` (→ `versionCode 2`) și
   `eas submit --profile production --platform android --latest`.

Comanda de submit **nu a fost rulată**: ar fi trimis artefactul vechi, cu chei de test.

## Cum se verifică

```powershell
npm run test:release          # CI mode: 24 pass / 0 fail / 3 deferred (cele „deferred" sunt chei de magazin)
node scripts/release-readiness.mjs --release   # RELEASE mode: iese cu FAIL pe cheile de magazin
npm test                      # include tests/release-config.test.mjs (7 teste pe app.json + eas.json)
npx expo config --type public  # configul rezolvat, așa cum îl vede EAS
npx eas-cli build:list --limit 3   # ce s-a construit și din ce commit
```
