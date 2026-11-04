#!/usr/bin/env bash
set -euo pipefail

# macOS ARM64 使用 Station 管理的独立 Web 后端。
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
for candidate in "${SCRIPT_DIRECTORY}"/.build/*.app "/Applications/Ghost DSH Station.app" "/Applications/DSH Workflow.app"; do
  if [[ -f "${candidate}/Contents/Resources/workflow/macos-launcher/runtime/global-supervisor.mjs" &&
        -f "${candidate}/Contents/Resources/workflow/macos-launcher/runtime/service-manager.mjs" &&
        -f "${candidate}/Contents/Resources/workflow/macos-launcher/runtime/web-host.mjs" ]]; then
    if [[ -z "$launcher" || "$candidate" -nt "$launcher" ]]; then launcher="$candidate"; fi
  fi
done
if [[ -z "$launcher" ]]; then
  printf '请先构建包含 Web 服务的 Ghost DSH Station 启动器。\n' >&2
  exit 1
fi
exec /usr/bin/open -a "$launcher" 'dsh-workflow://open-global'
