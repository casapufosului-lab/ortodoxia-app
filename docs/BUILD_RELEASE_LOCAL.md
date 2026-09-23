# Build de release local (fără Metro)

Aplicația din emulator era un **development build**: fără Metro pornit rămânea pe
„Reloading…". Varianta de release are codul JS împachetat în APK, deci pornește singură.

## Comanda

```powershell
cd C:\Users\pcgar\Documents\ortodoxia-app\android

# fara cheia de test RevenueCat: SDK-ul închide aplicația în release dacă primește o cheie
# de test („Wrong API Key — the app will close now"). Valoarea de mai jos este tratată ca
# placeholder de `isPlaceholderRevenueCatKey`, deci RevenueCat nu se inițializează.
$env:EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY = "REPLACE_FOR_LOCAL_RELEASE_BUILD"
$env:NODE_ENV = "production"

.\gradlew.bat assembleRelease --console=plain
```

Rezultat: `android\app\build\outputs\apk\release\app-release.apk` (≈116 MB, semnat cu
`debug.keystore` — bun pentru emulator, NU pentru magazine).

## Instalare în emulator

```powershell
adb -s emulator-5554 install -r "C:\Users\pcgar\Documents\ortodoxia-app\android\app\build\outputs\apk\release\app-release.apk"
adb -s emulator-5554 shell am start -n ro.ortodoxia.app/.MainActivity
```

## Timpi reali (i5-12450H, 16 GB RAM)

| Situație | Durată |
|----------|--------|
| Primul build (compilează nativ pentru 4 ABI) | ~25 min |
| Rebuild după schimbare doar de JS/env | ~6 min |
| Build doar pentru emulator (`-PreactNativeArchitectures=x86_64`) | nemăsurat; compilează un singur ABI în loc de 4, deci mai rapid |

Ca să forțezi reîmpachetarea JS după o schimbare de `.env`, șterge bundle-ul generat:

```powershell
Remove-Item -Recurse -Force android\app\build\generated\assets\react\release
```

## Ce NU funcționează în acest build local

Cumpărăturile (RevenueCat) sunt dezactivate: cheia de producție nu există încă, iar cea de
test face SDK-ul să închidă aplicația. Restul aplicației (calendar, rugăciuni, Biblie,
notificări, chat) funcționează normal, fără Metro.

## Development vs release

| | development build | release local |
|---|---|---|
| Are nevoie de Metro | da | nu |
| RAM consumat pe PC | ~500 MB–1 GB (Metro) | 0 |
| Se încarcă la cald | da (fast refresh) | nu (reinstalezi APK-ul) |
| Folosit pentru | dezvoltare | testare/demo pe emulator |
