#!/usr/bin/env bash
# DSH Workflow 正式发布入口；改编自 GhostModelDeck 的发布脚本。
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$task_root/scripts/release.py" "$@"
