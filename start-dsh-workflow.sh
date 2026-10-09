#!/usr/bin/env bash
set -euo pipefail

# macOS ARM64 复用官方桌面端的全局后端。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if (( $# != 0 )); then
  printf '用法：./start-dsh-workflow.sh（无需参数）\n' >&2
  exit 1
fi
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  printf '仅支持 macOS ARM64。\n' >&2
  exit 1
fi
launcher=""
for candidate in "${SCRIPT_DIRECTORY}"/.build/*.app "/Applications/DSH Workflow.app"; do
  if [[ -f "${candidate}/Contents/Resources/workflow/macos-launcher/runtime/global-supervisor.mjs" &&
        -f "${candidate}/Contents/Resources/workflow/macos-launcher/runtime/prepare-desktop.mjs" &&
        -d "${candidate}/Contents/Resources/desktop/DeepSeek Harness.app" ]]; then
    if [[ -z "$launcher" || "$candidate" -nt "$launcher" ]]; then launcher="$candidate"; fi
  fi
done
if [[ -z "$launcher" ]]; then
  printf '请先构建包含官方桌面端的 DSH Workflow 启动器。\n' >&2
  exit 1
fi
exec /usr/bin/open -a "$launcher" 'dsh-workflow://open-global'
