#!/usr/bin/env bash

set -euo pipefail

# 这个脚本只负责选择启动来源、准备 preset 并启动 Harness。
# 它从不把调用者的工作目录切换到 deepseek-harness 子模块。
SCRIPT_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIRECTORY}"
PROFILE_NAME="${DSH_PROFILE:-web}"
PATCH_FILE="${DSH_OWNER_WORKFLOW_PATCH:-${PROJECT_ROOT}/owner-workflow-plugin/cordis.local.patch.yml}"
PLUGIN_ENTRY="${PROJECT_ROOT}/owner-workflow-plugin/index.js"
DASHBOARD_ENTRY="${PROJECT_ROOT}/owner-workflow-plugin/dashboard-host.mjs"
CLIENT_ENTRY="${PROJECT_ROOT}/owner-workflow-plugin/client.js"
SYNAPSE_DIRECTORY="${DSH_SYNAPSE_DIR:-${PROJECT_ROOT}/dsh-synapse}"
APPROVAL_POLICY_DIRECTORY="${DSH_APPROVE_FOR_ME_SOURCE_DIR:-${PROJECT_ROOT}/owner-workflow-plugin/vendor/dsh-approve-for-me}"
SYNAPSE_PACKAGE_NAME="dsh-synapse"
LOCAL_UI_PACKAGE_NAME="dsh-owner-workflow-local-ui"
LAUNCHER_MODE="${DSH_LAUNCHER:-npx}"
DSH_PACKAGE="${DSH_PACKAGE:-@deepseek-ai/dsh@0.1.0-rc.8}"
# 本地开发默认直接使用 --patch 注入；只有显式指定 profile 时才使用已安装 bundle。
INSTALL_MODE="${DSH_OWNER_WORKFLOW_MODE:-local}"
USER_HOME_DIRECTORY="${HOME:-}"
if [[ -n "${DSH_HOME:-}" ]]; then
  DSH_HOME_DIRECTORY="${DSH_HOME}"
elif [[ -n "${USER_HOME_DIRECTORY}" ]]; then
  DSH_HOME_DIRECTORY="${USER_HOME_DIRECTORY}/.dsh"
else
  printf '无法确定 Harness home，请设置 DSH_HOME 或 HOME。\n' >&2
  exit 1
fi
PROFILE_DIRECTORY="${DSH_HOME_DIRECTORY}/profiles/${PROFILE_NAME}"
PROFILE_MANIFEST="${PROFILE_DIRECTORY}/package.json"
LOCAL_UI_PACKAGE_LINK="${PROFILE_DIRECTORY}/node_modules/${LOCAL_UI_PACKAGE_NAME}"
SYNAPSE_PACKAGE_LINK="${PROFILE_DIRECTORY}/node_modules/${SYNAPSE_PACKAGE_NAME}"
HARNESS_DIRECTORY="${DSH_HARNESS_DIR:-${PROJECT_ROOT}/deepseek-harness}"
WEB_NO_OPEN_ARGUMENTS=()
WEB_COMMAND_MODE=false
CALLER_DIRECTORY="$(pwd -P)"
# Dashboard 永远只观察启动命令所在的业务工作区；可用 DSH_WORKFLOW_ROOT 显式覆盖。
export DSH_OWNER_WORKFLOW_DASHBOARD_ROOT="${DSH_OWNER_WORKFLOW_DASHBOARD_ROOT:-${DSH_WORKFLOW_ROOT:-${CALLER_DIRECTORY}}}"
# Runner catalog 固定在 Harness home，所有工作区共享同一个 Leader 与 attempt journal。
export DSH_OWNER_WORKFLOW_CATALOG_ROOT="${DSH_OWNER_WORKFLOW_CATALOG_ROOT:-${DSH_HOME_DIRECTORY}/owner-workflow}"
DASHBOARD_RUNTIME_PATCH=""
SYNAPSE_RUNTIME_PATCH=""
PROJECT_PLUGINS_READY=false
LOCAL_UI_LINK_CREATED=false
SYNAPSE_LINK_CREATED=false
RUNNER_DAEMON_PID=""
RUNNER_DAEMON_OWNED=false
RUNNER_DAEMON_ENABLED="${DSH_OWNER_WORKFLOW_RUNNER:-1}"
RUNNER_DAEMON_PERSIST="${DSH_OWNER_WORKFLOW_RUNNER_PERSIST:-1}"
RUNNER_DAEMON_LOG="${DSH_OWNER_WORKFLOW_RUNNER_LOG:-${DSH_OWNER_WORKFLOW_CATALOG_ROOT}/.dsh-workflow/runner/daemon.log}"

cleanup_dashboard_runtime_patch() {
  if [[ -n "${DASHBOARD_RUNTIME_PATCH}" ]]; then
    rm -f -- "${DASHBOARD_RUNTIME_PATCH}"
  fi
  if [[ "${LOCAL_UI_LINK_CREATED}" == true ]] && [[ -L "${LOCAL_UI_PACKAGE_LINK}" ]]; then
    rm -f -- "${LOCAL_UI_PACKAGE_LINK}"
  fi
  if [[ -n "${SYNAPSE_RUNTIME_PATCH}" ]]; then
    rm -f -- "${SYNAPSE_RUNTIME_PATCH}"
  fi
  if [[ "${SYNAPSE_LINK_CREATED}" == true ]] && [[ -L "${SYNAPSE_PACKAGE_LINK}" ]]; then
    rm -f -- "${SYNAPSE_PACKAGE_LINK}"
  fi
}

cleanup_owner_workflow_processes() {
  if [[ "${RUNNER_DAEMON_PERSIST}" == 0 ]] && [[ "${RUNNER_DAEMON_OWNED}" == true ]] && [[ -n "${RUNNER_DAEMON_PID}" ]]; then
    kill -TERM "${RUNNER_DAEMON_PID}" 2>/dev/null || true
    wait "${RUNNER_DAEMON_PID}" 2>/dev/null || true
  fi
  cleanup_dashboard_runtime_patch
  if [[ "${PROJECT_PLUGINS_READY}" == true ]]; then
    node "${PROJECT_ROOT}/scripts/project-plugins.mjs" release "${PROJECT_ROOT}" "$$"
  fi
}

trap cleanup_owner_workflow_processes EXIT

verify_synapse_submodule() {
  if [[ ! -d "${SYNAPSE_DIRECTORY}" ]] \
    || [[ ! -f "${SYNAPSE_DIRECTORY}/package.json" ]] \
    || [[ ! -f "${SYNAPSE_DIRECTORY}/index.js" ]] \
    || [[ ! -f "${SYNAPSE_DIRECTORY}/client.js" ]] \
    || [[ ! -f "${SYNAPSE_DIRECTORY}/LICENSE" ]]; then
    printf 'Synapse 子模块尚未初始化或内容不完整：%s\n' "${SYNAPSE_DIRECTORY}" >&2
    printf '请执行：git submodule update --init --recursive\n' >&2
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    printf '找不到 git，无法核验 Synapse 子模块固定版本。\n' >&2
    exit 1
  fi
  local expected_revision actual_revision dirty
  expected_revision="$(git -C "${PROJECT_ROOT}" ls-files --stage -- dsh-synapse | awk '$1 == "160000" { print $2 }')"
  if [[ -z "${expected_revision}" ]]; then
    printf '父仓库没有记录 dsh-synapse gitlink，已拒绝加载未固定的上游源码。\n' >&2
    exit 1
  fi
  if ! actual_revision="$(git -C "${SYNAPSE_DIRECTORY}" rev-parse --verify HEAD)"; then
    printf '无法读取 Synapse 子模块当前 commit；请重新初始化子模块。\n' >&2
    exit 1
  fi
  if [[ "${actual_revision}" != "${expected_revision}" ]]; then
    printf 'Synapse 子模块当前 commit 与父仓库 gitlink 不一致。\n' >&2
    printf '期望：%s\n实际：%s\n' "${expected_revision}" "${actual_revision}" >&2
    exit 1
  fi
  dirty="$(git -C "${SYNAPSE_DIRECTORY}" status --porcelain --untracked-files=all)"
  if [[ -n "${dirty}" ]]; then
    printf 'Synapse 子模块存在内部改动，已拒绝加载只读上游源码。\n' >&2
    exit 1
  fi
}

verify_approval_policy_submodule() {
  if [[ ! -d "${APPROVAL_POLICY_DIRECTORY}" ]] \
    || [[ ! -f "${APPROVAL_POLICY_DIRECTORY}/src/core/index.ts" ]] \
    || [[ ! -f "${APPROVAL_POLICY_DIRECTORY}/src/core/risk.ts" ]] \
    || [[ ! -f "${APPROVAL_POLICY_DIRECTORY}/src/core/reviewer.ts" ]] \
    || [[ ! -f "${APPROVAL_POLICY_DIRECTORY}/LICENSE" ]]; then
    printf 'Operation 审批策略子模块尚未初始化或内容不完整：%s\n' "${APPROVAL_POLICY_DIRECTORY}" >&2
    printf '请执行：git submodule update --init --recursive\n' >&2
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    # 发布包已经只携带固定策略核心和许可证，不再要求存在父仓库 gitlink。
    return
  fi
  if ! git -C "${PROJECT_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    # 从 npm 包运行时没有父仓库；打包清单与 CI 已固定随包策略文件。
    return
  fi
  local project_git_root expected_revision actual_revision dirty
  project_git_root="$(git -C "${PROJECT_ROOT}" rev-parse --show-toplevel)"
  if [[ "${project_git_root}" != "${PROJECT_ROOT}" ]]; then
    # 安装在其他项目 node_modules 中时，外层项目不是该策略 gitlink 的权威父仓库。
    return
  fi
  expected_revision="$(git -C "${PROJECT_ROOT}" ls-files --stage -- owner-workflow-plugin/vendor/dsh-approve-for-me | awk '$1 == "160000" { print $2 }')"
  if [[ -z "${expected_revision}" ]]; then
    printf '父仓库没有记录 owner-workflow-plugin/vendor/dsh-approve-for-me gitlink，已拒绝加载未固定的审批策略源码。\n' >&2
    exit 1
  fi
  if ! actual_revision="$(git -C "${APPROVAL_POLICY_DIRECTORY}" rev-parse --verify HEAD)"; then
    printf '无法读取 Operation 审批策略子模块当前 commit；请重新初始化子模块。\n' >&2
    exit 1
  fi
  if [[ "${actual_revision}" != "${expected_revision}" ]]; then
    printf 'Operation 审批策略子模块当前 commit 与父仓库 gitlink 不一致。\n' >&2
    printf '期望：%s\n实际：%s\n' "${expected_revision}" "${actual_revision}" >&2
    exit 1
  fi
  dirty="$(git -C "${APPROVAL_POLICY_DIRECTORY}" status --porcelain --untracked-files=all)"
  if [[ -n "${dirty}" ]]; then
    printf 'Operation 审批策略子模块存在内部改动，已拒绝加载只读上游源码。\n' >&2
    exit 1
  fi
}

prepare_synapse_patch() {
  if [[ "${PROFILE_NAME}" != "web" ]]; then
    return
  fi
  verify_synapse_submodule
  mkdir -p "${PROFILE_DIRECTORY}/node_modules"
  if [[ -L "${SYNAPSE_PACKAGE_LINK}" ]]; then
    local resolved_link
    resolved_link="$(node --input-type=module -e '
      import { realpathSync } from "node:fs"
      process.stdout.write(realpathSync(process.argv[1]))
    ' "${SYNAPSE_PACKAGE_LINK}")"
    if [[ "${resolved_link}" != "$(CDPATH= cd -- "${SYNAPSE_DIRECTORY}" && pwd -P)" ]]; then
      printf 'Synapse profile 链接已指向其他目录，已拒绝覆盖：%s\n' "${SYNAPSE_PACKAGE_LINK}" >&2
      exit 1
    fi
  elif [[ -e "${SYNAPSE_PACKAGE_LINK}" ]]; then
    printf 'Synapse profile 包位置已被普通文件占用，已拒绝覆盖：%s\n' "${SYNAPSE_PACKAGE_LINK}" >&2
    exit 1
  else
    ln -s "${SYNAPSE_DIRECTORY}" "${SYNAPSE_PACKAGE_LINK}"
    SYNAPSE_LINK_CREATED=true
  fi
  SYNAPSE_RUNTIME_PATCH="$(mktemp -t dsh-owner-workflow-synapse)"
  if ! node --input-type=module -e '
    import { writeFileSync } from "node:fs"
    const path = process.argv[1]
    writeFileSync(path, [
      "# 由 start-owner-workflow.sh 为本次启动生成；固定加载只读 Synapse 子模块。",
      "- insert:",
      "    - id: synapse",
      "      name: dsh-synapse",
      "      config:",
      "        dataFile: !!js dshHomePath(\"synapse/workspaces.json\")",
      "        autoProjection: true",
      "        projectionWorkspaceTitle: DSH 任务",
      "        trustedHosts: []",
      "",
    ].join("\n"), "utf8")
  ' "${SYNAPSE_RUNTIME_PATCH}"; then
    printf '无法生成 Synapse 本地加载 patch。\n' >&2
    exit 1
  fi
}

prepare_local_dashboard_patch() {
  if [[ "${PROFILE_NAME}" != "web" ]]; then
    return
  fi
  mkdir -p "${PROFILE_DIRECTORY}/node_modules"
  if [[ -L "${LOCAL_UI_PACKAGE_LINK}" ]]; then
    local resolved_link
    resolved_link="$(node --input-type=module -e '
      import { realpathSync } from "node:fs"
      process.stdout.write(realpathSync(process.argv[1]))
    ' "${LOCAL_UI_PACKAGE_LINK}")"
    if [[ "${resolved_link}" != "${PROJECT_ROOT}" ]]; then
      printf '本地客户端包别名已指向其他目录，已拒绝覆盖：%s\n' "${LOCAL_UI_PACKAGE_LINK}" >&2
      exit 1
    fi
  elif [[ -e "${LOCAL_UI_PACKAGE_LINK}" ]]; then
    printf '本地客户端包别名位置已被普通文件占用，已拒绝覆盖：%s\n' "${LOCAL_UI_PACKAGE_LINK}" >&2
    exit 1
  else
    ln -s "${PROJECT_ROOT}" "${LOCAL_UI_PACKAGE_LINK}"
    LOCAL_UI_LINK_CREATED=true
  fi
  DASHBOARD_RUNTIME_PATCH="$(mktemp -t dsh-owner-workflow-dashboard)"
  if ! node --input-type=module -e '
    import { writeFileSync } from "node:fs"
    const [patchPath, packageName, entryPath, workspacePath, catalogPath, bundlePresent] = process.argv.slice(1)
    const quote = value => JSON.stringify(value)
    const lines = ["# 由 start-owner-workflow.sh 为本次本地启动生成；进程退出时删除。"]
    if (bundlePresent === "true") {
      // 本地源码模式必须关闭已安装 bundle 的同名 Web 宿主，避免两个客户端重复占用 Slot。
      lines.push(
        "- id: owner-workflow-client-surface",
        "  disabled: true",
        "",
        "- id: owner-workflow-dashboard",
        "  disabled: true",
        "",
      )
    }
    lines.push(
      "- insert:",
      "    - id: owner-workflow-client-surface-local",
      `      name: ${quote(packageName)}`,
      "      config:",
      "        surfaceOnly: true",
      "",
      "    - id: owner-workflow-dashboard-local",
      `      name: ${quote(entryPath)}`,
      "      config:",
      `        root: ${quote(workspacePath)}`,
      `        catalogRoot: ${quote(catalogPath)}`,
    )
    lines.push("")
    writeFileSync(patchPath, lines.join("\n"), "utf8")
  ' "${DASHBOARD_RUNTIME_PATCH}" "${LOCAL_UI_PACKAGE_NAME}" "${DASHBOARD_ENTRY}" "${DSH_OWNER_WORKFLOW_DASHBOARD_ROOT}" "${DSH_OWNER_WORKFLOW_CATALOG_ROOT}" "$([[ "${BUNDLE_STATE}" == "present" ]] && printf true || printf false)"; then
    printf '无法生成本次启动所需的 Web 客户端与 Dashboard patch。\n' >&2
    exit 1
  fi
}

case "${INSTALL_MODE}" in
  auto|profile|local) ;;
  *)
    printf 'DSH_OWNER_WORKFLOW_MODE 必须是 auto、profile 或 local。\n' >&2
    exit 1
    ;;
esac

case "${LAUNCHER_MODE}" in
  npx|source|source-runtime) ;;
  *)
    printf 'DSH_LAUNCHER 必须是 npx、source 或 source-runtime。\n' >&2
    exit 1
    ;;
esac

# 兼容旧变量，但显式新变量与旧变量冲突时必须失败，避免重复挂载。
if [[ -n "${DSH_USE_PROFILE_BUNDLE+x}" ]]; then
  case "${DSH_USE_PROFILE_BUNDLE}" in
    1) LEGACY_MODE="profile" ;;
    0) LEGACY_MODE="local" ;;
    *)
      printf 'DSH_USE_PROFILE_BUNDLE 只能是 0 或 1。\n' >&2
      exit 1
      ;;
  esac
  if [[ "${INSTALL_MODE}" != "auto" ]] && [[ "${INSTALL_MODE}" != "${LEGACY_MODE}" ]]; then
    printf 'DSH_OWNER_WORKFLOW_MODE 与 DSH_USE_PROFILE_BUNDLE 冲突，已拒绝启动。\n' >&2
    exit 1
  fi
  INSTALL_MODE="${LEGACY_MODE}"
fi

if ! command -v node >/dev/null 2>&1; then
  printf '找不到 node，请先安装 Node.js。\n' >&2
  exit 1
fi

profile_bundle_state() {
  node --input-type=module - "${PROFILE_MANIFEST}" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const manifestPath = process.argv[2]
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const dependencies = manifest.dependencies ?? {}
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const dependencyPresent = Object.hasOwn(dependencies, 'dsh-owner-workflow')
  const bundlePresent = Array.isArray(bundles) && bundles.includes('dsh-owner-workflow')
  if (!dependencyPresent && !bundlePresent) {
    process.stdout.write('absent')
  } else if (!dependencyPresent || !bundlePresent) {
    process.stdout.write('inconsistent')
  } else {
    try {
      const require = createRequire(manifestPath)
      const packagePath = require.resolve('dsh-owner-workflow/package.json')
      const packageManifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      const packageRoot = path.dirname(packagePath)
      const entryPath = require.resolve('dsh-owner-workflow')
      const patchPath = path.resolve(packageRoot, packageManifest?.dsh?.bundle?.patch ?? '')
      process.stdout.write(
        fs.existsSync(entryPath) && fs.existsSync(patchPath)
          ? 'present'
          : 'broken',
      )
    } catch {
      process.stdout.write('broken')
    }
  }
} catch (error) {
  if (error?.code === 'ENOENT') process.stdout.write('absent')
  else {
    process.stderr.write(`profile manifest 读取失败：${String(error)}\n`)
    process.exit(2)
  }
}
NODE
}

if [[ "${1:-}" == "--self-check" ]]; then
  exec node "${PROJECT_ROOT}/owner-workflow-plugin/src/external-runner.mjs" --self-check
fi

# 本地开发启动始终覆盖由本项目生成的同名 preset；兼容用户过去手工追加的 --force。
if [[ "${1:-}" == "--force" ]]; then
  shift
fi

# 默认不打断当前终端打开浏览器；纯诊断命令不会启动 Web，也不传 Web 专属参数。
if [[ "${PROFILE_NAME}" == "web" ]] && [[ "${DSH_WEB_OPEN:-0}" != "1" ]] \
  && [[ "${1:-}" != "--dump-config" ]] && [[ "${1:-}" != "--dump-default-config" ]] && [[ "${1:-}" != "--help" ]] && [[ "${1:-}" != "-h" ]]; then
  has_no_open=false
  for argument in "$@"; do
    if [[ "${argument}" == "--no-open" ]]; then
      has_no_open=true
      WEB_COMMAND_MODE=true
      break
    fi
  done
  if [[ "${has_no_open}" == false ]]; then
    WEB_NO_OPEN_ARGUMENTS=(--no-open)
    WEB_COMMAND_MODE=true
  fi
fi

if [[ "${LAUNCHER_MODE}" == "source" ]]; then
  if [[ ! -d "${HARNESS_DIRECTORY}" ]]; then
    printf '找不到 Harness 子模块：%s\n' "${HARNESS_DIRECTORY}" >&2
    exit 1
  fi
  if [[ ! -f "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" ]]; then
    printf '找不到 Harness 已构建 CLI：%s\n' "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" >&2
    printf '请先按 Harness 官方流程构建 submodule；插件不会修改 submodule 源码。\n' >&2
    exit 1
  fi
  if [[ "${PROFILE_NAME}" == "web" ]] && [[ "${DSH_WEB_OPEN:-0}" != "1" ]]; then
    if ! grep -Rqs -- '--no-open' "${HARNESS_DIRECTORY}/apps/cli/lib"; then
      printf '当前子模块的已构建 Web CLI 不支持 --no-open，已拒绝自动打开浏览器。\n' >&2
      printf '请重新构建与子模块源码匹配的 Harness，或改用 start-owner-workflow-npm.sh。\n' >&2
      printf '若明确接受自动打开浏览器，可设置 DSH_WEB_OPEN=1。\n' >&2
      exit 1
    fi
  fi
elif [[ "${LAUNCHER_MODE}" == "source-runtime" ]]; then
  if [[ ! -f "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" ]] || [[ ! -f "${HARNESS_DIRECTORY}/apps/web/dist/index.html" ]]; then
    printf 'Harness 子模块构建产物不完整：%s\n' "${HARNESS_DIRECTORY}" >&2
    printf '请重新运行 start-owner-workflow-submodule.sh 以构建该 commit。\n' >&2
    exit 1
  fi
else
  if ! command -v npx >/dev/null 2>&1; then
    printf '找不到 npx，请先安装 Node.js。\n' >&2
    exit 1
  fi
fi

run_source_cli() {
  if [[ "${LAUNCHER_MODE}" == "source-runtime" ]]; then
    node "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" "$@"
  else
    node "${HARNESS_DIRECTORY}/apps/cli/lib/bin.js" "$@"
  fi
}

run_profile_cli() {
  if [[ "${PROJECT_PLUGINS_READY}" == true ]]; then
    if [[ "${WEB_COMMAND_MODE}" == true ]]; then
      node "${PROJECT_ROOT}/scripts/project-plugins.mjs" run "${PROJECT_ROOT}" web "$@"
    else
      node "${PROJECT_ROOT}/scripts/project-plugins.mjs" run "${PROJECT_ROOT}" --profile "${PROFILE_NAME}" "$@"
    fi
    return
  fi
  if [[ "${PROFILE_NAME}" == "web" ]] && [[ "${WEB_COMMAND_MODE}" == true ]]; then
    if [[ "${LAUNCHER_MODE}" == "source" || "${LAUNCHER_MODE}" == "source-runtime" ]]; then
      run_source_cli web "$@"
    else
      npx --yes "${DSH_PACKAGE}" web "$@"
    fi
  elif [[ "${LAUNCHER_MODE}" == "source" || "${LAUNCHER_MODE}" == "source-runtime" ]]; then
    run_source_cli --profile "${PROFILE_NAME}" "$@"
  else
    npx --yes "${DSH_PACKAGE}" --profile "${PROFILE_NAME}" "$@"
  fi
}

prepare_project_plugins() {
  [[ "${PROFILE_NAME}" == "web" ]] || return 0
  # Help/config inspection must stay offline and never update packages.
  for argument in "$@"; do
    case "${argument}" in --help|-h|--dump-config|--dump-default-config) return 0 ;; esac
  done
  # Browser require.resolve needs NODE_PATH set before Node starts; keep it in this process tree.
  export NODE_PATH="${PROJECT_ROOT}/.dsh-workflow/plugins/node_modules${NODE_PATH:+:${NODE_PATH}}"
  if [[ "${LAUNCHER_MODE}" == "source" || "${LAUNCHER_MODE}" == "source-runtime" ]]; then
    node "${PROJECT_ROOT}/scripts/project-plugins.mjs" prepare "${PROJECT_ROOT}" "${HARNESS_DIRECTORY}/apps/cli/package.json" "$$"
  else
    npx --yes --package "${DSH_PACKAGE}" -- node "${PROJECT_ROOT}/scripts/project-plugins.mjs" prepare "${PROJECT_ROOT}" auto "$$"
  fi
  PROJECT_PLUGINS_READY=true
}

install_profile_bundle() {
  local spec="${1}"
  shift
  if [[ "${LAUNCHER_MODE}" == "source" || "${LAUNCHER_MODE}" == "source-runtime" ]]; then
    run_source_cli plugin --profile "${PROFILE_NAME}" add "${spec}" "$@"
  else
    npx --yes "${DSH_PACKAGE}" plugin --profile "${PROFILE_NAME}" add "${spec}" "$@"
  fi
}

install_preset_from_source() {
  export DSH_OWNER_WORKFLOW_PLUGIN_ENTRY="${PLUGIN_ENTRY}"
  node "${PROJECT_ROOT}/owner-workflow-plugin/src/external-runner.mjs" --install-preset "$@"
}

install_preset_from_profile() {
  local runner_path
  if ! runner_path="$(node --input-type=module - "${PROFILE_MANIFEST}" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const manifestPath = process.argv[2]
const require = createRequire(manifestPath)
const packagePath = require.resolve('dsh-owner-workflow/package.json')
const packageManifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const bin = typeof packageManifest.bin === 'string'
  ? packageManifest.bin
  : packageManifest.bin?.['dsh-owner-workflow']
if (typeof bin !== 'string' || bin.trim() === '') {
  throw new Error('dsh-owner-workflow 没有声明 dsh-owner-workflow bin')
}
const runnerPath = path.resolve(path.dirname(packagePath), bin)
if (!fs.existsSync(runnerPath)) throw new Error(`找不到随包 runner：${runnerPath}`)
process.stdout.write(runnerPath)
NODE
  )"; then
    printf '无法解析 profile bundle 随包 runner，不能安装 Agent preset。\n' >&2
    return 1
  fi
  unset DSH_OWNER_WORKFLOW_PLUGIN_ENTRY
  node "${runner_path}" --install-preset "$@"
}

resolve_runner_entry() {
  if [[ "${INSTALL_MODE}" == "local" ]]; then
    printf '%s' "${PROJECT_ROOT}/owner-workflow-plugin/src/external-runner.mjs"
    return
  fi
  node --input-type=module - "${PROFILE_MANIFEST}" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const manifestPath = process.argv[2]
const require = createRequire(manifestPath)
const packagePath = require.resolve('dsh-owner-workflow/package.json')
const packageManifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const bin = typeof packageManifest.bin === 'string'
  ? packageManifest.bin
  : packageManifest.bin?.['dsh-owner-workflow']
if (typeof bin !== 'string' || bin.trim() === '') throw new Error('dsh-owner-workflow 没有声明 runner bin')
const runnerPath = path.resolve(path.dirname(packagePath), bin)
if (!fs.existsSync(runnerPath)) throw new Error(`找不到随包 runner：${runnerPath}`)
process.stdout.write(runnerPath)
NODE
}

start_runner_daemon() {
  case "${RUNNER_DAEMON_ENABLED}" in
    0) return ;;
    1) ;;
    *)
      printf 'DSH_OWNER_WORKFLOW_RUNNER 只能是 0 或 1。\n' >&2
      exit 1
      ;;
  esac
  case "${RUNNER_DAEMON_PERSIST}" in
    0|1) ;;
    *)
      printf 'DSH_OWNER_WORKFLOW_RUNNER_PERSIST 只能是 0 或 1。\n' >&2
      exit 1
      ;;
  esac
  local runner_entry
  if ! runner_entry="$(resolve_runner_entry)"; then
    printf '无法解析 Owner Workflow runner，已拒绝启动 Harness。\n' >&2
    exit 1
  fi
  local runner_source_digest
  runner_source_digest="$(node --input-type=module -e '
    import fs from "node:fs"
    import crypto from "node:crypto"
    process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))
  ' "${runner_entry}")"
  local daemon_state_path="${DSH_OWNER_WORKFLOW_CATALOG_ROOT}/.dsh-workflow/runner/daemon.json"
  local incompatible_pid=""
  incompatible_pid="$(node --input-type=module -e '
    import fs from "node:fs"
    const [path, expectedDigest] = process.argv.slice(1)
    try {
      const state = JSON.parse(fs.readFileSync(path, "utf8"))
      const heartbeat = Date.parse(state.heartbeatAt ?? "")
      if (state.contract === "DSH_WORKFLOW_RUNNER_DAEMON_V1"
        && state.status === "running"
        && Number.isSafeInteger(state.pid)
        && Number.isFinite(heartbeat)
        && Date.now() - heartbeat <= 60000
        && state.sourceDigest !== expectedDigest) process.stdout.write(String(state.pid))
    } catch {}
  ' "${daemon_state_path}" "${runner_source_digest}")"
  if [[ -n "${incompatible_pid}" ]] && kill -0 "${incompatible_pid}" 2>/dev/null; then
    kill -TERM "${incompatible_pid}" 2>/dev/null || true
    for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
      if ! kill -0 "${incompatible_pid}" 2>/dev/null; then break; fi
      sleep 0.1
    done
    if kill -0 "${incompatible_pid}" 2>/dev/null; then
      printf '旧版全局 Runner pid=%s 未能停止，拒绝并行启动新版本。\n' "${incompatible_pid}" >&2
      exit 1
    fi
  fi
  mkdir -p "$(dirname -- "${RUNNER_DAEMON_LOG}")"
  node "${runner_entry}" \
    --daemon \
    --catalog-root "${DSH_OWNER_WORKFLOW_CATALOG_ROOT}" \
    >>"${RUNNER_DAEMON_LOG}" 2>&1 &
  RUNNER_DAEMON_PID=$!
  RUNNER_DAEMON_OWNED=true

  local ready=false
  for _attempt in 1 2 3 4 5 6 7 8 9 10; do
    if node --input-type=module -e '
      import fs from "node:fs"
      const [path, expectedDigest] = process.argv.slice(1)
      const state = JSON.parse(fs.readFileSync(path, "utf8"))
      const heartbeat = Date.parse(state.heartbeatAt ?? "")
      if (state.contract !== "DSH_WORKFLOW_RUNNER_DAEMON_V1"
        || state.status !== "running"
        || state.sourceDigest !== expectedDigest
        || !Number.isFinite(heartbeat)
        || Date.now() - heartbeat > 10000) process.exit(1)
    ' "${daemon_state_path}" "${runner_source_digest}" 2>/dev/null; then
      ready=true
      break
    fi
    if ! kill -0 "${RUNNER_DAEMON_PID}" 2>/dev/null; then
      RUNNER_DAEMON_OWNED=false
    fi
    sleep 0.1
  done
  if [[ "${ready}" != true ]]; then
    printf 'Owner Workflow Runner daemon 启动失败，日志：%s\n' "${RUNNER_DAEMON_LOG}" >&2
    exit 1
  fi
  if ! kill -0 "${RUNNER_DAEMON_PID}" 2>/dev/null; then
    RUNNER_DAEMON_OWNED=false
  fi
  printf 'Owner Workflow Runner daemon 已启用；全局 catalog=%s，会自动接管已批准的 Workflow。\n' "${DSH_OWNER_WORKFLOW_CATALOG_ROOT}" >&2
}

require_installed_preset() {
  local target="${DSH_HOME_DIRECTORY}/.agent-presets/owner-workflow"
  local expected_plugin_url
  if [[ ! -f "${target}/agent.cordis.yml" ]] || [[ ! -f "${target}/preset.yml" ]] || [[ ! -f "${target}/plugin.mjs" ]]; then
    printf '找不到已安装的 owner-workflow Agent preset：%s\n' "${target}" >&2
    if [[ "${INSTALL_MODE}" == "profile" ]]; then
      printf '请先显式执行：DSH_OWNER_WORKFLOW_MODE=profile "%s/start-owner-workflow.sh" --install-preset\n' "${PROJECT_ROOT}" >&2
    else
      printf '请先显式执行："%s/start-owner-workflow.sh" --install-preset\n' "${PROJECT_ROOT}" >&2
    fi
    return 1
  fi
  if ! grep -q 'workflow_preflight' "${target}/agent.cordis.yml" \
    || ! grep -q 'operation_start' "${target}/agent.cordis.yml" \
    || ! grep -q 'owner_submit' "${target}/agent.cordis.yml"; then
    printf '已找到 owner-workflow preset，但内容未通过入口校验；请用显式 --install-preset 命令修复。\n' >&2
    return 1
  fi
  if ! expected_plugin_url="$(node --input-type=module -e '
    import { createRequire } from "node:module"
    import { pathToFileURL } from "node:url"
    const [mode, localEntry, profileManifest] = process.argv.slice(1)
    const entry = mode === "local"
      ? localEntry
      : createRequire(profileManifest).resolve("dsh-owner-workflow")
    process.stdout.write(pathToFileURL(entry).href)
  ' "${INSTALL_MODE}" "${PLUGIN_ENTRY}" "${PROFILE_MANIFEST}")"; then
    printf '无法解析 %s 模式对应的插件入口，已拒绝使用 preset。\n' "${INSTALL_MODE}" >&2
    return 1
  fi
  if ! grep -Fq "${expected_plugin_url}" "${target}/plugin.mjs"; then
    printf 'owner-workflow preset 指向的插件入口与当前 %s 模式不一致，已拒绝启动。\n' "${INSTALL_MODE}" >&2
    if [[ "${INSTALL_MODE}" == "local" ]]; then
      printf '请执行："%s/start-owner-workflow.sh" --install-preset --force\n' "${PROJECT_ROOT}" >&2
    else
      printf '请执行：DSH_OWNER_WORKFLOW_MODE=profile "%s/start-owner-workflow.sh" --install-preset --force\n' "${PROJECT_ROOT}" >&2
    fi
    return 1
  fi
}

if [[ "${1:-}" == "--install-preset" ]]; then
  shift
  BUNDLE_STATE="$(profile_bundle_state)"
  case "${INSTALL_MODE}" in
    local)
      verify_approval_policy_submodule
      install_preset_from_source --force "$@"
      ;;
    profile)
      if [[ "${BUNDLE_STATE}" != "present" ]]; then
        printf '明确指定 profile 模式，但没有完整的 Owner 工作流 bundle。\n' >&2
        exit 1
      fi
      install_preset_from_profile --force "$@"
      ;;
    auto)
      case "${BUNDLE_STATE}" in
        present) install_preset_from_profile --force "$@" ;;
        absent)
          verify_approval_policy_submodule
          install_preset_from_source --force "$@"
          ;;
        inconsistent)
          printf 'profile %s 的 Owner 工作流 bundle 状态不一致，已拒绝安装 preset。\n' "${PROFILE_NAME}" >&2
          exit 1
          ;;
        broken)
          printf 'profile %s 的 Owner 工作流包或 bundle patch 已损坏。\n' "${PROFILE_NAME}" >&2
          printf '请先重新执行："%s/start-owner-workflow.sh" --install "%s" --force\n' "${PROJECT_ROOT}" "${PROJECT_ROOT}" >&2
          exit 1
          ;;
      esac
      ;;
  esac
  printf 'owner-workflow Agent preset 已显式安装；下一次启动后可在 Agent preset 选择器中选择 owner-workflow。\n'
  exit 0
fi

if [[ "${1:-}" == "--install" ]]; then
  verify_approval_policy_submodule
  INSTALL_SPEC="${2:-${DSH_OWNER_WORKFLOW_INSTALL_SPEC:-${PROJECT_ROOT}}}"
  if [[ "${INSTALL_SPEC}" == --* ]]; then
    INSTALL_SPEC="${DSH_OWNER_WORKFLOW_INSTALL_SPEC:-${PROJECT_ROOT}}"
  else
    shift
  fi
  shift || true
  install_profile_bundle "${INSTALL_SPEC}" "$@"
  if [[ "$(profile_bundle_state)" != "present" ]]; then
    printf '插件安装命令成功返回，但 profile bundle 状态未达到一致的 present，已拒绝继续。\n' >&2
    exit 1
  fi
  printf 'Owner 工作流 bundle 已安装到 profile %s。\n' "${PROFILE_NAME}"
  printf '按 Harness 当前 profile-boot 规则，preset 不会随 bundle 自动复制；请显式执行：\n'
  printf '  DSH_OWNER_WORKFLOW_MODE=profile "%s/start-owner-workflow.sh" --install-preset\n' "${PROJECT_ROOT}"
  exit 0
fi

BUNDLE_STATE="$(profile_bundle_state)"
if [[ "${INSTALL_MODE}" == "auto" ]]; then
  case "${BUNDLE_STATE}" in
    present) INSTALL_MODE="profile" ;;
    absent) INSTALL_MODE="local" ;;
    inconsistent)
      printf 'profile %s 的 Owner 工作流依赖和 bundle 清单不一致，已拒绝启动；请先用官方 dsh plugin remove/add 修复。\n' "${PROFILE_NAME}" >&2
      exit 1
      ;;
    broken)
      printf 'profile %s 的 Owner 工作流安装不完整，已拒绝启动。\n' "${PROFILE_NAME}" >&2
      printf '请重新执行："%s/start-owner-workflow.sh" --install "%s" --force\n' "${PROJECT_ROOT}" "${PROJECT_ROOT}" >&2
      exit 1
      ;;
  esac
elif [[ "${INSTALL_MODE}" == "profile" ]] && [[ "${BUNDLE_STATE}" != "present" ]]; then
  printf '明确指定 profile 模式，但 profile %s 没有完整的 Owner 工作流 bundle。\n' "${PROFILE_NAME}" >&2
  exit 1
fi

prepare_project_plugins "$@"

case "${INSTALL_MODE}" in
  profile)
    require_installed_preset
    unset DSH_OWNER_WORKFLOW_PLUGIN_ENTRY
    printf '使用 profile %s 中已安装的 Owner 工作流 bundle。\n' "${PROFILE_NAME}" >&2
    start_runner_daemon
    prepare_synapse_patch
    if [[ -n "${SYNAPSE_RUNTIME_PATCH}" ]]; then
      printf 'Synapse 会话地图：使用固定只读子模块 %s。\n' "${SYNAPSE_DIRECTORY}" >&2
      run_profile_cli --patch "${SYNAPSE_RUNTIME_PATCH}" "${WEB_NO_OPEN_ARGUMENTS[@]}" "$@"
    else
      run_profile_cli "${WEB_NO_OPEN_ARGUMENTS[@]}" "$@"
    fi
    ;;
  local)
    verify_approval_policy_submodule
    if [[ ! -f "${PATCH_FILE}" ]]; then
      printf '找不到本地开发 patch：%s\n' "${PATCH_FILE}" >&2
      exit 1
    fi
    if [[ ! -f "${PLUGIN_ENTRY}" ]]; then
      printf '找不到本地插件入口：%s\n' "${PLUGIN_ENTRY}" >&2
      exit 1
    fi
    if [[ "${PROFILE_NAME}" == "web" ]] && [[ ! -f "${DASHBOARD_ENTRY}" ]]; then
      printf '找不到本地 Dashboard 插件入口：%s\n' "${DASHBOARD_ENTRY}" >&2
      exit 1
    fi
    if [[ "${PROFILE_NAME}" == "web" ]] && [[ ! -f "${CLIENT_ENTRY}" ]]; then
      printf '找不到本地等待列表客户端产物：%s\n' "${CLIENT_ENTRY}" >&2
      printf '请执行：npm run build:client\n' >&2
      exit 1
    fi
    export DSH_OWNER_WORKFLOW_PLUGIN_ENTRY="${PLUGIN_ENTRY}"
    export DSH_OWNER_WORKFLOW_DASHBOARD_ENTRY="${DASHBOARD_ENTRY}"
    # 本地 preset 只是一份指向当前源码入口的用户级代理；首次启动自动创建，内容一致时不改写。
    install_preset_from_source --force >/dev/null
    printf '使用本地 patch 注入 preset 与 Owner 工作流插件：%s\n' "${PLUGIN_ENTRY}" >&2
    require_installed_preset
    start_runner_daemon
    if [[ "${PROFILE_NAME}" == "web" ]]; then
      printf 'Owner Workflow Dashboard：启动后可打开 /owner-workflow 查看 DAG 状态。\n' >&2
      printf 'Owner Workflow 等待列表：会话头部与侧边栏已启用。\n' >&2
      prepare_synapse_patch
      prepare_local_dashboard_patch
      printf 'Synapse 会话地图：使用固定只读子模块 %s。\n' "${SYNAPSE_DIRECTORY}" >&2
      if [[ -n "${DASHBOARD_RUNTIME_PATCH}" ]] && [[ -n "${SYNAPSE_RUNTIME_PATCH}" ]]; then
        run_profile_cli --patch "${PATCH_FILE}" --patch "${DASHBOARD_RUNTIME_PATCH}" --patch "${SYNAPSE_RUNTIME_PATCH}" "${WEB_NO_OPEN_ARGUMENTS[@]}" "$@"
      elif [[ -n "${DASHBOARD_RUNTIME_PATCH}" ]]; then
        run_profile_cli --patch "${PATCH_FILE}" --patch "${DASHBOARD_RUNTIME_PATCH}" "${WEB_NO_OPEN_ARGUMENTS[@]}" "$@"
      else
        run_profile_cli --patch "${PATCH_FILE}" "${WEB_NO_OPEN_ARGUMENTS[@]}" "$@"
      fi
    else
      run_profile_cli --patch "${PATCH_FILE}" "${WEB_NO_OPEN_ARGUMENTS[@]}" "$@"
    fi
    ;;
esac
