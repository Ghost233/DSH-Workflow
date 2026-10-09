#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  printf "Flutter launcher checks require macOS ARM64\n" >&2
  exit 1
fi
cd "$(dirname "$0")"
flutter_command="${FLUTTER_BIN:-flutter}"
dart_command="${DART_BIN:-dart}"
"$flutter_command" pub get --enforce-lockfile
"$dart_command" format --output=none --set-exit-if-changed lib test tool
"$flutter_command" analyze --no-pub
"$flutter_command" test --no-pub
