#!/usr/bin/env bash

set -euo pipefail

# 通过 npm 固定 DeepSeek Harness 版本；插件仍从当前项目本地 patch 注入。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${DSH_NPM_VERSION:-0.1.0-rc.8}"

show_help() {
  cat <<'EOF'
用法：
  ./start-owner-workflow-npm.sh [--version <版本>] [dsh 参数...]

示例：
  ./start-owner-workflow-npm.sh --version 0.1.0-rc.8
  DSH_NPM_VERSION=latest ./start-owner-workflow-npm.sh

本脚本只固定 npm 上的 @deepseek-ai/dsh 版本；Owner 工作流插件始终使用当前项目源码。
EOF
}

case "${1:-}" in
  --help|-h)
    show_help
    exit 0
    ;;
  --version)
    if [[ -z "${2:-}" ]] || [[ "${2}" == --* ]]; then
      printf '%s\n' '--version 必须提供非空的 npm 版本或 dist-tag。' >&2
      exit 1
    fi
    VERSION="${2}"
    shift 2
    ;;
esac

if [[ -z "${VERSION}" ]] || [[ "${VERSION}" =~ [[:space:]\\] ]]; then
  printf '%s\n' 'DSH npm 版本不能为空、包含空白或反斜杠。' >&2
  exit 1
fi

export DSH_LAUNCHER=npx
export DSH_PACKAGE="@deepseek-ai/dsh@${VERSION}"
exec "${SCRIPT_DIRECTORY}/start-owner-workflow.sh" "$@"
