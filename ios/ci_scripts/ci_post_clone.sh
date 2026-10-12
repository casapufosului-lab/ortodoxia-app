#!/bin/bash
# =============================================================================
# ci_post_clone.sh — SABLON REUTILIZABIL pentru aplicații Expo / React Native
# care se construiesc pe Xcode Cloud (regula 86).
#
# Unde se pune:  <folderul proiectului Xcode>/ci_scripts/ci_post_clone.sh
#               (la Expo, proiectul stă în ios/ → ios/ci_scripts/ci_post_clone.sh)
#               Xcode Cloud caută ci_scripts EXACT lângă proiect/workspace și
#               rulează scripturile cu acel folder ca director curent.
#               Se face executabil: chmod +x ci_scripts/ci_post_clone.sh
#
# Ce face, în ordine:
#   1. intră în rădăcina repo-ului clonat (CI_PRIMARY_REPOSITORY_PATH);
#   2. scrie .env din variabilele PUBLICE de mediu EXPO_PUBLIC_* setate în workflow
#      (doar NUMELE lor apar în log, niciodată valorile);
#   3. npm ci (lockfile obligatoriu);
#   4. npx expo prebuild -p ios — NECONDIȚIONAT (nu „doar dacă lipsește ios/").
#      FĂRĂ --clean: --clean șterge exact proiectul comis pe care Xcode Cloud
#      tocmai l-a citit, iar Apple cere un proiect stabil, prezent continuu;
#   5. pod install explicit (prebuild poate ieși cu cod 0 chiar dacă CocoaPods a
#      eșuat — dovadă 11.10.2026: build „verde", pasul următor picat);
#   6. scrie numărul de build din CI_BUILD_NUMBER în proiect (altfel TestFlight
#      respinge build-uri cu număr repetat);
#   7. se oprește cu eroare clară dacă nu există proiect Xcode în ios/.
#
# NU conține niciun nume de aplicație: proiectul și schema se descoperă din ios/.
# Nu tipărește valori de secrete. Nu face scriere în servicii externe.
# =============================================================================

set -euo pipefail

step() { printf '\n=== %s ===\n' "$1"; }
fail() { printf '\nEROARE: %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 1. rădăcina
step "1/6 Rădăcina repo-ului clonat"
REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-}"
if [ -z "$REPO_ROOT" ]; then
  fail "CI_PRIMARY_REPOSITORY_PATH nu e setat — scriptul rulează doar în Xcode Cloud (sau se cheamă cu variabila setată manual)."
fi
cd "$REPO_ROOT"
echo "repo: $(pwd)"
[ -f package.json ] || fail "nu există package.json în $REPO_ROOT — rădăcina repo-ului nu e cea așteptată."

# Expo/xcodebuild refuză să ceară input când rulează neinteractiv; Xcode Cloud
# trimite deja CI=TRUE, dar îl fixăm explicit ca să nu depindem de imaginea de CI.
export CI=1

# ------------------------------------------------------------- 2. .env public
step "2/6 Scriu .env din variabilele publice EXPO_PUBLIC_*"
ENV_FILE="$REPO_ROOT/.env"
: > "$ENV_FILE"

while IFS= read -r name; do
  [ -n "$name" ] || continue
  value="${!name-}"
  if [ -z "$value" ]; then
    printf '  ATENȚIE: %s e definită în environment dar are valoare goală — se sare peste.\n' "$name"
    continue
  fi
  printf '%s=%s\n' "$name" "$value" >> "$ENV_FILE"
  printf '  scris: %s\n' "$name"          # doar NUMELE, niciodată valoarea
done < <(env | sed -n 's/^\(EXPO_PUBLIC_[A-Za-z0-9_]*\)=.*/\1/p' | sort -u)

if [ -n "${ENVIRONMENT:-}" ]; then
  printf 'ENVIRONMENT=%s\n' "$ENVIRONMENT" >> "$ENV_FILE"
  printf '  scris: %s\n' "ENVIRONMENT"
fi

PUBLIC_COUNT="$(grep -c '^EXPO_PUBLIC_' "$ENV_FILE" || true)"
echo "total variabile publice scrise: $PUBLIC_COUNT"
if [ "$PUBLIC_COUNT" -eq 0 ]; then
  echo "ATENȚIE: nicio variabilă EXPO_PUBLIC_* nu a ajuns în .env — verifică secțiunea Environment a workflow-ului."
fi

# ------------------------------------------------------------------ 3. npm ci
step "3/6 Dependențe Node (npm ci)"
[ -f package-lock.json ] || fail "lipsește package-lock.json — 'npm ci' nu are ce instala determinist; comite lockfile-ul."
npm ci

# --------------------------------------------------------- 4. proiectul iOS
step "4/6 expo prebuild -p ios (necondiționat, fără --clean)"
IOS_DIR="$REPO_ROOT/ios"

# CAPCANĂ DOVEDITĂ (12.10.2026, măsurat cu git status pe un checkout curat):
# dacă ios/ există dar NU conține încă niciun .xcodeproj, Expo consideră folderul
# „malformat" și — fiind neinteractiv, ca orice CI — îl ȘTERGE FĂRĂ SĂ ÎNTREBE,
# chiar și fără --clean. Locurile din sursa CLI-ului:
#   @expo/cli/build/src/prebuild/prebuildAsync.js:124-127  (fără --clean cheamă
#     promptToClearMalformedNativeProjectsAsync)
#   @expo/cli/build/src/prebuild/clearNativeFolder.js:167-183  (malformat = nu
#     există .xcodeproj/.pbxproj)
#   @expo/cli/build/src/prebuild/clearNativeFolder.js:194-204  (neinteractiv ⇒
#     șterge direct; lasă doar warning-ul „project files will be cleared and reinitialized")
# Măsurat: după rulare, `git status --short` → " D ios/ci_scripts/ci_post_clone.sh".
# Adică dispărea ci_scripts/ întreg (inclusiv acest script), iar un eventual
# ci_pre_xcodebuild.sh / ci_post_xcodebuild.sh comis acolo nu mai era la locul lui.
# Protecție: se salvează ci_scripts înainte de prebuild și se pune la loc după.
CI_SCRIPTS_DIR="$IOS_DIR/ci_scripts"
CI_SCRIPTS_BACKUP=""

# Punerea la loc se face și explicit după prebuild, și automat la ieșire (trap pe EXIT):
# dacă prebuild cade (sau cade orice pas de mai jos), fișierele tot revin. Fără trap,
# un `npx expo prebuild` eșuat lăsa ios/ fără ci_scripts — adică exact starea pe care
# am măsurat-o pe 12.10.2026 (testul cu prebuild real: „PICAT ci_post_clone.sh a fost șters").
restore_ci_scripts() {
  if [ -z "$CI_SCRIPTS_BACKUP" ] || [ -e "$CI_SCRIPTS_DIR/ci_post_clone.sh" ]; then
    return 0
  fi
  mkdir -p "$CI_SCRIPTS_DIR" || return 0
  cp -R "$CI_SCRIPTS_BACKUP/." "$CI_SCRIPTS_DIR/" || return 0
  printf 'ci_scripts pus la loc (%s fișiere)\n' "$(find "$CI_SCRIPTS_DIR" -type f | wc -l | tr -d ' ')"
  return 0
}
trap restore_ci_scripts EXIT

if [ -d "$CI_SCRIPTS_DIR" ]; then
  CI_SCRIPTS_BACKUP="$(mktemp -d)/ci_scripts"
  cp -R "$CI_SCRIPTS_DIR" "$CI_SCRIPTS_BACKUP"
  printf 'ci_scripts salvat înainte de prebuild (%s fișiere)\n' "$(find "$CI_SCRIPTS_BACKUP" -type f | wc -l | tr -d ' ')"
fi

npx expo prebuild -p ios
[ -d "$IOS_DIR" ] || fail "expo prebuild s-a terminat, dar $IOS_DIR nu există."
restore_ci_scripts

# Descoperirea proiectului: Xcode Cloud are nevoie de un .xcodeproj/.xcworkspace
# stabil. La Expo, numele fișierului dă și numele schemei.
PROJECT_PATH="$(find "$IOS_DIR" -maxdepth 2 -name '*.xcodeproj' -not -path '*/Pods/*' -type d | head -n 1 || true)"
[ -n "$PROJECT_PATH" ] || fail "nu există niciun *.xcodeproj în $IOS_DIR după prebuild — proiectul nu s-a generat."
PROJECT_NAME="$(basename "$PROJECT_PATH" .xcodeproj)"
echo "proiect descoperit: $PROJECT_NAME ($PROJECT_PATH)"

SCHEME_FILE="$PROJECT_PATH/xcshareddata/xcschemes/$PROJECT_NAME.xcscheme"
if [ -f "$SCHEME_FILE" ]; then
  echo "schema partajată: $PROJECT_NAME.xcscheme (Xcode Cloud o poate selecta)"
else
  echo "ATENȚIE: nu găsesc schema partajată $SCHEME_FILE."
  echo "         Xcode Cloud cere scheme partajate; dacă workflow-ul nu vede schema,"
  echo "         se partajează o dată din Xcode (Product → Scheme → Manage Schemes → Shared)."
fi

# -------------------------------------------------------------- 5. pod install
step "5/6 pod install"
[ -f "$IOS_DIR/Podfile" ] || fail "lipsește $IOS_DIR/Podfile — nu pot rula pod install."
command -v pod >/dev/null 2>&1 || fail "CocoaPods (pod) nu e disponibil în imaginea de CI — verifică toolchain-ul."
( cd "$IOS_DIR" && pod install )

WORKSPACE_PATH="$(find "$IOS_DIR" -maxdepth 1 -name '*.xcworkspace' -type d | head -n 1 || true)"
[ -n "$WORKSPACE_PATH" ] || fail "pod install nu a produs niciun *.xcworkspace în $IOS_DIR (vezi liniile de mai sus)."
echo "workspace: $(basename "$WORKSPACE_PATH")"

# ----------------------------------------------------------- 6. număr de build
step "6/6 Numărul de build din CI_BUILD_NUMBER"
if [ -z "${CI_BUILD_NUMBER:-}" ]; then
  fail "CI_BUILD_NUMBER nu e setat — în Xcode Cloud e mereu prezent; nu inventez un număr de build."
fi
echo "CI_BUILD_NUMBER=$CI_BUILD_NUMBER"
( cd "$IOS_DIR" && xcrun agvtool new-version -all "$CI_BUILD_NUMBER" )

printf '\nGATA: %s pregătit pentru xcodebuild (%s).\n' "$PROJECT_NAME" "$(basename "$WORKSPACE_PATH")"
