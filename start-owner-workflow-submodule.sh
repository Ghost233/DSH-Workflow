#!/usr/bin/env bash

set -euo pipefail

# 直接使用 Harness 子模块当前 commit 的源码；依赖、构建产物和构建标记都在
# 子模块自身的忽略路径中，不会修改受版本控制的文件。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIRECTORY="${DSH_HARNESS_DIR:-${SCRIPT_DIRECTORY}/deepseek-harness}"

show_help() {
  cat <<'EOF'
用法：
  ./start-owner-workflow-submodule.sh
  ./start-owner-workflow-submodule.sh plugin --profile <名称> <pnpm 参数...>

无参数时，使用 deepseek-harness 子模块当前 commit 的 TypeScript 源码启动 Web、Owner Workflow 与 Runner。
首个参数为 plugin 时，直接使用同一套子模块 CLI 管理 profile 插件，不启动 Web、Owner Workflow 或 Runner，后续参数原样转发。
子模块 commit 变更后，会直接在子模块的忽略路径中安装依赖并构建 CLI 与 Web 产物；受版本控制的子模块文件保持不变。

示例：
  ./start-owner-workflow-submodule.sh plugin --profile web add dsh-approve-for-me@latest

可设置：
  DSH_HARNESS_DIR=<子模块路径>
EOF
}

ensure_harness_is_built() {
  local revision build_revision_file
  if ! command -v git >/dev/null 2>&1; then
    printf '找不到 git，无法读取子模块当前 commit。\n' >&2
    exit 1
  fi
  if ! revision="$(git -C "${HARNESS_DIRECTORY}" rev-parse --verify HEAD)"; then
    printf '无法读取 Harness 子模块的当前 commit。\n' >&2
    exit 1
  fi

  build_revision_file="${HARNESS_DIRECTORY}/.dsh-build/owner-workflow-source-revision"
  if [[ -f "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" ]] \
    && [[ -f "${HARNESS_DIRECTORY}/apps/web/dist/index.html" ]] \
    && [[ -f "${build_revision_file}" ]] \
    && [[ "$(<"${build_revision_file}")" == "${revision}" ]]; then
    return
  fi

  if ! command -v corepack >/dev/null 2>&1; then
    printf '找不到 corepack，无法在子模块中安装 Harness 依赖。\n' >&2
    exit 1
  fi

  printf '正在直接在 Harness 子模块中准备 commit %s 的运行时；仅会写入忽略文件。\n' "${revision}" >&2
  (
    cd "${HARNESS_DIRECTORY}"
    # Harness 的 postinstall 会配置开发用 Git hooks；Git submodule 不适用该 worktree 配置。
    CI=true corepack pnpm install --frozen-lockfile
    CI=true corepack pnpm run build
  )
  if [[ ! -f "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" ]] \
    || [[ ! -f "${HARNESS_DIRECTORY}/apps/web/dist/index.html" ]]; then
    printf 'Harness 子模块构建后仍缺少 CLI 或 Web 产物。\n' >&2
    exit 1
  fi
  mkdir -p "$(dirname -- "${build_revision_file}")"
  printf '%s\n' "${revision}" > "${build_revision_file}"
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

ensure_harness_is_built

export DSH_LAUNCHER=source-runtime
export DSH_HARNESS_DIR="${HARNESS_DIRECTORY}"

# profile 插件管理必须直接进入当前 submodule commit 构建出的 DSH CLI。
# 不能经过 start-owner-workflow.sh，否则 plugin 参数会被误当成 Web 参数，且会额外启动 Runner 和注入临时 patch。
if [[ "${1:-}" == "plugin" ]]; then
  exec node "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" "$@"
fi

exec "${SCRIPT_DIRECTORY}/start-owner-workflow.sh" "$@"
