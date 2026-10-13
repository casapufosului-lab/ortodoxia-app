#!/usr/bin/env bash
# ruleaza-android-flows.sh — ruleaza UN flow Maestro de 3 ori pe emulatorul Android din CI.
#
# DE CE: masuratoarea oficiala pentru Android se face in cloud (decizia ownerului, 13.10.2026),
# pe un emulator curat, cu APK-ul construit din ACELASI commit. Local ramane doar pentru verificari
# scurte de 5 minute.
#
# REGULI CARE SE VAD IN COD:
#   - un singur Maestro o data (scriptul e secvential);
#   - identitate curata inainte de fiecare trecere: `pm clear` => cota de chat 5/5 (consumul e pe
#     scope=device, 1 mesaj per instalare);
#   - verde = 3 treceri CURATE DIN PRIMA INCERCARE. O trecere picata NU se reia: seria se reia de la 1
#     dupa ce se repara cauza. Dovada de diagnostic (ierarhie + JUnit) ramane pe disc;
#   - poarta pe numarul de rezultate: o lista incompleta nu e niciodata verde;
#   - APK-ul masurat se dovedeste: versionCode si SHA-256, scrise in apk-log.txt.
#
# Cine il cheama: .github/workflows/android-verify.yml, prin reactivecircus/android-emulator-runner@v2
# Variabile: FLOW (obligatoriu), ANDROID_PASSES (implicit 3), APP_ID (implicit ro.ortodoxia.app)
set +e
set -uo pipefail

FLOW="${FLOW:?lipseste FLOW}"
PASSES="${ANDROID_PASSES:-3}"
APP_ID="${APP_ID:-ro.ortodoxia.app}"
APK="app-release.apk"

export PATH="$PATH:$HOME/.maestro/bin"
mkdir -p ci-screenshots
: > flow-results.txt
: > retry-log.txt
: > apk-log.txt
: > chat-latency.txt

echo "======== pregatire: $FLOW, $PASSES treceri, $APP_ID ========"
adb wait-for-device
adb shell getprop ro.build.version.sdk | sed 's/^/API emulator: /'

if [ ! -f "$APK" ]; then
  echo "::error::nu gasesc $APK (artefactul jobului de build)"
  exit 1
fi
SHA=$(sha256sum "$APK" | awk '{print $1}')
echo "apk: $APK sha256=$SHA" | tee -a apk-log.txt

echo "--- instalare"
adb install -r -t "$APK" || { echo "::error::instalarea APK-ului a esuat"; exit 1; }

# versionCode-ul REAL al binarului instalat (nu cel din fisiere): asa se prinde un APK vechi.
VCODE=$(adb shell dumpsys package "$APP_ID" | grep -m1 'versionCode=' | tr -d '\r' | sed -E 's/.*versionCode=([0-9]+).*/\1/')
VNAME=$(adb shell dumpsys package "$APP_ID" | grep -m1 'versionName=' | tr -d '\r' | sed -E 's/.*versionName=([^ ]+).*/\1/')
echo "apk instalat: versionCode=$VCODE versionName=$VNAME sha256=$SHA" | tee -a apk-log.txt

# POARTA pe binar: se masoara exact versiunea ceruta (T5: versionCode 8).
if [ "$VCODE" != "8" ]; then
  echo "::error::APK-ul instalat are versionCode=$VCODE, dar masuratoarea cere 8."
  exit 1
fi

F="maestro/$FLOW.yaml"
if [ ! -f "$F" ]; then
  echo "::error::flow inexistent: $F"
  exit 1
fi

FAILED=""
for pass in $(seq 1 "$PASSES"); do
  echo "======== pass$pass Maestro: $FLOW ========"
  mkdir -p "ci-screenshots/pass$pass"

  # Identitate curata: cota de chat revine la 5/5 (consum pe device, dovedit cu cheia de service).
  adb shell pm clear "$APP_ID" >/dev/null 2>&1 || echo "(pm clear a raportat eroare, continui)"
  adb logcat -c >/dev/null 2>&1 || true

  # ATENTIE: flagurile corecte sunt `--format JUNIT` si `--output`. Cu `-o` Maestro iese cu cod 2
  # si nu ruleaza niciun flow.
  maestro test "$F" --format JUNIT --output "maestro-pass$pass-$FLOW.xml" \
    --debug-output "maestro-pass$pass-$FLOW-debug"
  code=$?

  # Captura de ecran a starii de la finalul trecerii (cerinta: fiecare celula are si PNG).
  adb exec-out screencap -p > "ci-screenshots/pass$pass/$FLOW.png" 2>/dev/null
  # Linia instrumentului [chat-latency] (ReactNativeJS merge in logcat) - dovada de observabilitate.
  adb logcat -d -v brief 2>/dev/null | grep -F '[chat-latency]' >> chat-latency.txt

  if [ "$code" -ne 0 ]; then
    # Dovada pentru diagnostic: ierarhia exacta in momentul picarii + JUnit-ul incercarii 1.
    maestro hierarchy --compact > "hierarchy-pass$pass-$FLOW.incercarea1.txt" 2>&1 || true
    cp -f "maestro-pass$pass-$FLOW.xml" "maestro-pass$pass-$FLOW.incercarea1.xml" 2>/dev/null || true
    maestro hierarchy --compact > "hierarchy-pass$pass-$FLOW.txt" 2>&1 || true
    printf 'trecerea %s: incercarea 1 a picat (exit %s) - trecerea e PICATA, NU se reia; dovada: maestro-pass%s-%s.incercarea1.xml + hierarchy-pass%s-%s.incercarea1.txt\n' \
      "$pass" "$code" "$pass" "$FLOW" "$pass" "$FLOW" >> retry-log.txt
  fi

  case "$code" in
    0) printf 'pass%s\t%s\tPASS\n' "$pass" "$FLOW" >> flow-results.txt ;;
    1) printf 'pass%s\t%s\tFAIL (flow, exit 1)\n' "$pass" "$FLOW" >> flow-results.txt; FAILED="$FAILED pass$pass" ;;
    2) printf 'pass%s\t%s\tEROARE CLI (exit 2): comanda Maestro e gresita, flow-ul NU a rulat\n' "$pass" "$FLOW" >> flow-results.txt; FAILED="$FAILED pass$pass" ;;
    *) printf 'pass%s\t%s\tFAIL (exit %s)\n' "$pass" "$FLOW" "$code" >> flow-results.txt; FAILED="$FAILED pass$pass" ;;
  esac
done

echo "======== REZULTAT pentru $FLOW ========"
cat flow-results.txt
TOTAL=$(wc -l < flow-results.txt | tr -d ' ')
PASSED=$(grep -c 'PASS$' flow-results.txt)
echo "TOTAL=$TOTAL  PASS=$PASSED  FAIL=$(( TOTAL - PASSED ))  ASTEPTAT=$PASSES"

# POARTA 1: numarul de rezultate. O lista incompleta NU e niciodata verde.
if [ "$TOTAL" -ne "$PASSES" ]; then
  echo "::error::ma asteptam la $PASSES rezultate pentru $FLOW, am $TOTAL."
  exit 1
fi
# POARTA 2: nicio trecere picata.
if [ -n "$FAILED" ]; then
  echo "::error::FLOW PICAT: $FLOW ($FAILED)"
  exit 1
fi
echo "flow $FLOW: toate cele $PASSES treceri au trecut."
