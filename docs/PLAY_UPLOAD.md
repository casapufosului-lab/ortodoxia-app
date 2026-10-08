# Urcarea pe Google Play din linie de comandă (`scripts/upload-play.mjs`)

DE CE EXISTĂ

Uploadul din consolă ține ownerul în browser la fiecare lansare. Cu un **service account** care are
drept de publicare, uploadul devine o comandă — pe care o poate rula și orchestratorul.

## Ce s-a făcut o singură dată (08.10.2026)

1. **Service account** în proiectul Google Cloud `ortodoxia`: `play-release@ortodoxia.iam.gserviceaccount.com`
   (fără roluri IAM — permisiunile vin din Play Console, nu din Cloud).
2. **Cheia JSON** a serviciului, păstrată în **seiful Jaguar** sub numele `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
   (nu în depozit, nu în chat, nu în log).
3. **Play Console → Users and permissions → Invite new users** → adresa serviciului, cu
   **App permissions**: `Release to testing tracks` + `Manage production releases`.
   Fără acest pas, API-ul răspunde `403 The caller does not have permission`.

## Cum se rulează

Cu cheia din seif (recomandat — valoarea intră doar în variabila de mediu a procesului):

```powershell
# 1. scoate cheia din seif (nu se afișează)
Set-Location $env:USERPROFILE\Documents\jaguare
$script = @'
import { getSecret } from './src/secret-store.ts';
process.stdout.write(await getSecret('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'));
'@
$env:GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = ($script | npx tsx --input-type=module - | Out-String).Trim()

# 2. urcă
Set-Location $env:USERPROFILE\Documents\ortodoxia-app
node scripts/upload-play.mjs --track internal --notes "text pentru testeri"
```

Sau direct cu fișierul (dacă îl păstrezi local):

```powershell
node scripts/upload-play.mjs --track internal --aab android/app/build/outputs/bundle/release/app-release.aab
```

## Parametri

| Flag | Implicit | Ce face |
|---|---|---|
| `--track` | `internal` | `internal` · `alpha` · `beta` · `production` |
| `--aab` | `android/app/build/outputs/bundle/release/app-release.aab` | pachetul de urcat |
| `--status` | `completed` | `completed` (publicat integral) · `draft` (urcat, nepublicat) · `inProgress` (rulare graduală) |
| `--notes` | gol | notele de versiune pentru testeri |
| `--lang` | `ro-RO` | limba notelor |
| `--key` | fișierul implicit | calea către cheia JSON |
| `--dry-run` | — | arată ce e pe track-uri, fără să urce nimic |

Cheia se caută în ordinea: `--key` → `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (conținut sau cale) →
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH` → `%USERPROFILE%\Documents\ortodoxia-keystore-backup\play-service-account.json`.

## Ce e bine să știi

- **`--status draft` la Production** urcă versiunea fără s-o publice: e varianta sigură pentru
  lansarea publică, fiindcă poți verifica în consolă înainte de a da drumul.
- Fiecare rulare creează un **edit**; dacă scriptul cade la mijloc, edit-ul expiră și **nu rămâne
  nimic publicat** (scriptul îl anulează și singur, la eroare).
- Track-ul primește **toate versiunile urcate prin API** ca o singură release: pentru a păstra o
  versiune veche activă, nu rula scriptul pe acel track.
- Dovada rulării din 08.10.2026: `bundle urcat, versionCode = 2` → `GATA: versionCode 2 e pe
  track-ul internal (completed)`; `--dry-run` arată apoi `track internal: completed:2`.

## Verificarea drepturilor (fără să urci nimic)

```powershell
node scripts/upload-play.mjs --dry-run
```

Dacă vezi `autentificat ca play-release@…` și lista de track-uri, cheia și drepturile sunt bune.
Dacă vezi `403 The caller does not have permission`, lipsește pasul 3 de mai sus.
