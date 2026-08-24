#!/usr/bin/env bash

set -euo pipefail

# 脚本路径只用于找到 runner；工作流根目录默认必须是调用者当前目录。
# 这样从 profile 的 package bin 调用时，不会把插件安装目录误当成业务项目。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${DSH_WORKFLOW_ROOT:-}" ]]; then
  exec node "${SCRIPT_DIRECTORY}/owner-workflow-plugin/src/external-runner.mjs" --root "${DSH_WORKFLOW_ROOT}" "$@"
fi
exec node "${SCRIPT_DIRECTORY}/owner-workflow-plugin/src/external-runner.mjs" "$@"
