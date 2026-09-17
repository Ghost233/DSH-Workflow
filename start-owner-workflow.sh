#!/usr/bin/env bash
set -euo pipefail

# 单一 Web / Owner Team 宿主；保留调用者目录和原有 DSH 配置。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if (( $# != 0 )); then
  printf '用法：./start-owner-workflow.sh（无需参数）\n' >&2
  exit 1
fi
exec node "${SCRIPT_DIRECTORY}/scripts/kernel-web-launch.mjs"
