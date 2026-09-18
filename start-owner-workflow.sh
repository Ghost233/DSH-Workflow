#!/usr/bin/env bash
set -euo pipefail

# 单一 Web / Owner Team 宿主；启动器幂等启用 DSH 官方 Agent Teams Host 与 Web 层。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if (( $# != 0 )); then
  printf '用法：./start-owner-workflow.sh（无需参数）\n' >&2
  exit 1
fi
exec node "${SCRIPT_DIRECTORY}/scripts/kernel-web-launch.mjs"
