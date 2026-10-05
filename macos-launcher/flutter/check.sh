#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
flutter_command="${FLUTTER_BIN:-flutter}"
dart_command="${DART_BIN:-dart}"
"$flutter_command" pub get --enforce-lockfile
"$dart_command" format --output=none --set-exit-if-changed lib test tool
"$flutter_command" analyze --no-pub
"$flutter_command" test --no-pub
