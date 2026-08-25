#!/usr/bin/env bash

set -euo pipefail

# 使用子模块当前 commit 的源码，但在主工程的忽略缓存中安装和构建运行时；
# 原 deepseek-harness 子模块不安装、不构建、不写入。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIRECTORY="${DSH_HARNESS_DIR:-${SCRIPT_DIRECTORY}/deepseek-harness}"
RUNTIME_DIRECTORY="${DSH_HARNESS_RUNTIME_DIR:-}"
RUNTIME_ROOT="${DSH_HARNESS_RUNTIME_ROOT:-${SCRIPT_DIRECTORY}/.dsh-harness-runtime}"

cleanup_obsolete_runtime_caches() {
  local current_revision="$1"
  local candidate name
  shopt -s nullglob
  for candidate in "${RUNTIME_ROOT}"/*; do
    name="${candidate##*/}"
    if [[ "${name}" == "${current_revision}" ]]; then
      continue
    fi
    # 只删除运行时根目录下名称严格为 Git SHA 的真实目录，保留临时构建和故障现场。
    if [[ -d "${candidate}" ]] && [[ ! -L "${candidate}" ]] && [[ "${name}" =~ ^[0-9a-fA-F]{40}$ ]]; then
      rm -rf -- "${candidate}"
      printf '已删除旧 Harness 运行时缓存：%s\n' "${candidate}" >&2
    fi
  done
  shopt -u nullglob
}

show_help() {
  cat <<'EOF'
用法：
  ./start-owner-workflow-submodule.sh
  ./start-owner-workflow-submodule.sh plugin --profile <名称> <pnpm 参数...>

无参数时，使用 deepseek-harness 子模块当前 commit 的 TypeScript 源码启动 Web、Owner Workflow 与 Runner。
首个参数为 plugin 时，直接使用同一套子模块 CLI 管理 profile 插件，不启动 Web、Owner Workflow 或 Runner，后续参数原样转发。
首次使用某个 commit 时，会在 .dsh-harness-runtime/<commit>/ 创建独立运行时、安装依赖并从该 commit 的源码构建 CLI 与 Web 产物；原子模块保持不变。

示例：
  ./start-owner-workflow-submodule.sh plugin --profile web add dsh-approve-for-me@latest

可设置：
  DSH_HARNESS_DIR=<子模块路径>
  DSH_HARNESS_RUNTIME_ROOT=<独立运行时缓存根目录>
  DSH_HARNESS_RUNTIME_DIR=<已准备好的独立运行时目录>
EOF
}

case "${1:-}" in
  --help|-h)
    show_help
    exit 0
    ;;
esac

if [[ ! -d "${HARNESS_DIRECTORY}" ]]; then
  printf '找不到 Harness 子模块：%s\n' "${HARNESS_DIRECTORY}" >&2
  exit 1
fi

if [[ -z "${RUNTIME_DIRECTORY}" ]]; then
  if ! command -v git >/dev/null 2>&1; then
    printf '找不到 git，无法读取子模块当前 commit。\n' >&2
    exit 1
  fi
  if ! command -v corepack >/dev/null 2>&1; then
    printf '找不到 corepack，无法在独立运行时安装子模块依赖。\n' >&2
    exit 1
  fi
  if ! REVISION="$(git -C "${HARNESS_DIRECTORY}" rev-parse --verify HEAD)"; then
    printf '无法读取 Harness 子模块的当前 commit。\n' >&2
    exit 1
  fi
  mkdir -p "${RUNTIME_ROOT}"
  RUNTIME_ROOT="$(CDPATH= cd -- "${RUNTIME_ROOT}" && pwd)"
  cleanup_obsolete_runtime_caches "${REVISION}"
  RUNTIME_DIRECTORY="${RUNTIME_ROOT}/${REVISION}"
  READY_FILE="${RUNTIME_DIRECTORY}/.dsh-owner-runtime-ready"
  if [[ ! -f "${READY_FILE}" ]]; then
    if [[ -e "${RUNTIME_DIRECTORY}" ]]; then
      printf '独立运行时缓存不完整：%s\n' "${RUNTIME_DIRECTORY}" >&2
      printf '为保留失败现场，脚本不会自动删除；请检查后手动移除该缓存目录再重试。\n' >&2
      exit 1
    fi
    TEMPORARY_DIRECTORY="${RUNTIME_ROOT}/.${REVISION}.building-$$"
    if [[ -e "${TEMPORARY_DIRECTORY}" ]]; then
      printf '独立运行时临时目录已存在：%s\n' "${TEMPORARY_DIRECTORY}" >&2
      exit 1
    fi
    printf '正在准备子模块 commit %s 的独立源码运行时；不会修改原子模块。\n' "${REVISION}" >&2
    git clone --shared --no-checkout "${HARNESS_DIRECTORY}" "${TEMPORARY_DIRECTORY}"
    git -C "${TEMPORARY_DIRECTORY}" checkout --detach "${REVISION}"
    (
      cd "${TEMPORARY_DIRECTORY}"
      corepack pnpm install --frozen-lockfile
      corepack pnpm run build
    )
    if [[ ! -f "${TEMPORARY_DIRECTORY}/apps/cli/lib/bin.js" ]] \
      || [[ ! -f "${TEMPORARY_DIRECTORY}/apps/web/dist/index.html" ]]; then
      printf '独立源码运行时构建后仍缺少 CLI 或 Web 产物。\n' >&2
      printf '失败现场保留在：%s\n' "${TEMPORARY_DIRECTORY}" >&2
      exit 1
    fi
    printf '%s\n' "${REVISION}" > "${TEMPORARY_DIRECTORY}/.dsh-owner-runtime-ready"
    mv "${TEMPORARY_DIRECTORY}" "${RUNTIME_DIRECTORY}"
    printf '独立源码运行时已就绪：%s\n' "${RUNTIME_DIRECTORY}" >&2
  fi
else
  if [[ ! -d "${RUNTIME_DIRECTORY}" ]]; then
    printf '指定的独立源码运行时不存在：%s\n' "${RUNTIME_DIRECTORY}" >&2
    exit 1
  fi
  RUNTIME_DIRECTORY="$(CDPATH= cd -- "${RUNTIME_DIRECTORY}" && pwd)"
fi

export DSH_LAUNCHER=source-runtime
export DSH_HARNESS_DIR="${RUNTIME_DIRECTORY}"

# profile 插件管理必须直接进入当前 submodule commit 构建出的 DSH CLI。
# 不能经过 start-owner-workflow.sh，否则 plugin 参数会被误当成 Web 参数，且会额外启动 Runner 和注入临时 patch。
if [[ "${1:-}" == "plugin" ]]; then
  exec node "${RUNTIME_DIRECTORY}/apps/cli/lib/bin.js" "$@"
fi

exec "${SCRIPT_DIRECTORY}/start-owner-workflow.sh" "$@"
