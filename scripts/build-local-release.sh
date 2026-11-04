#!/usr/bin/env bash
# 在本机或 GitHub macOS ARM64 runner 编译、打包；不运行测试，不访问 GitHub Release。
# 产物：.build/release-assets/{*.dmg,manifest.json,SHA256SUMS}
# 用法：scripts/build-local-release.sh
# 说明：发布入口见 .agents/skills/deploy-release/SKILL.md；本脚本只做编译与打包。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "build-local-release: 错误：$*" >&2; exit 1; }
step() { echo "build-local-release: $*"; }

[[ "$(uname -s)" == Darwin ]] || fail "只在 macOS 上构建"
[[ "$(uname -m)" == arm64 ]] || fail "只在 ARM64 上构建"

APP_VERSION="$(node -p "require('./macos-launcher/package.json').version")"
DSH_VERSION="$(node -p "require('./dsh-runtime.json').version")"
[[ "$APP_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail "应用版本不是纯 x.y.z：$APP_VERSION"
TAG="macos-v$APP_VERSION"
step "应用 $APP_VERSION / DSH $DSH_VERSION / tag $TAG"

FLUTTER_BIN="${FLUTTER_BIN:-$(command -v flutter || true)}"
if [[ -z "$FLUTTER_BIN" ]]; then
  for candidate in "$HOME/flutter/bin/flutter" "/opt/homebrew/bin/flutter" "/usr/local/bin/flutter"; do
    if [[ -x "$candidate" ]]; then FLUTTER_BIN="$candidate"; break; fi
  done
fi
[[ -n "$FLUTTER_BIN" ]] || fail "未找到 Flutter；设置 FLUTTER_BIN 或安装 Flutter"
export PATH="$(dirname "$FLUTTER_BIN"):$PATH"

# 步骤 4 的 `node` 需要 Node-API 开发头文件；步骤 6 会复制一个自包含的 Node 进启动器，
# 由 DSH_LAUNCHER_NODE 指定（默认 PATH 中的 node）。Homebrew 等动态链接 libnode 的发行版
# 不能直接复制，需另备自包含 Node 后在执行时设置该变量。
LAUNCHER_NODE="${DSH_LAUNCHER_NODE:-$(command -v node || true)}"
[[ -n "$LAUNCHER_NODE" ]] || fail "未找到 node；设置 PATH 或 DSH_LAUNCHER_NODE"
if otool -L "$LAUNCHER_NODE" 2>/dev/null | grep -q 'libnode'; then
  fail "步骤 6 需要自包含的 Node；$LAUNCHER_NODE 依赖 libnode。请设置 DSH_LAUNCHER_NODE"
fi

[[ $# == 0 ]] || fail "未知参数：$*"

step '1/5 构建项目维护的 Matt 面板'
npm ci --prefix matt-skills-panel-plugin --ignore-scripts --no-audit --no-fund
npm run build --prefix matt-skills-panel-plugin

step '2/5 准备 Flutter 依赖'
(cd macos-launcher/flutter && flutter pub get --enforce-lockfile)

step '3/5 构建并签名 Web 版 Station'
"$LAUNCHER_NODE" macos-launcher/build.mjs
APP="$ROOT/.build/Ghost DSH Station-${APP_VERSION}-dsh${DSH_VERSION}-arm64.app"
[[ -d "$APP" ]] || fail "启动器 App 未生成：$APP"

step '4/5 打包 DMG、manifest.json 与 SHA256SUMS'
[[ ! -e .build/release-assets ]] || fail '已有 .build/release-assets，已保留原有产物；请先选择空的构建目录'
scripts/build-release.sh --app-path "$APP" --output-dir .build/release-assets

step '5/5 校验发布资产'
(cd .build/release-assets && shasum -a 256 -c SHA256SUMS)
step "完成：$APP"
step "资产：$ROOT/.build/release-assets"
