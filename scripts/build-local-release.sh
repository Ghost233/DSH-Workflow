#!/usr/bin/env bash
# 本地编译并打包发布资产；不运行集成测试，不访问 GitHub。
# 产物：.build/release-assets/{*.dmg,manifest.json,SHA256SUMS}
# 用法：scripts/build-local-release.sh [--skip-dsh-install]
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

SKIP_DSH_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --skip-dsh-install) SKIP_DSH_INSTALL=1 ;;
    *) fail "未知参数：$arg" ;;
  esac
done

step '1/8 构建项目维护的 Matt 面板'
npm ci --prefix matt-skills-panel-plugin --ignore-scripts --no-audit --no-fund
npm run build --prefix matt-skills-panel-plugin

step '2/8 准备 Flutter 依赖'
(cd macos-launcher/flutter && flutter pub get --enforce-lockfile)

step '3/8 安装固定 DSH 依赖'
if [[ "$SKIP_DSH_INSTALL" == 0 ]]; then
  (cd deepseek-harness && pnpm install --frozen-lockfile)
else
  step '跳过 DSH 依赖安装（--skip-dsh-install）'
fi

step '4/8 构建 DSH 生产包'
(
  cd deepseek-harness
  export DSH_DESKTOP_TARGET_PLATFORM=darwin DSH_DESKTOP_TARGET_ARCH=arm64
  TARGET="$PWD/apps/desktop/.desktop-build/targets/mac-${DSH_DESKTOP_TARGET_ARCH}"
  pnpm run build:official
  pnpm run release:pack --family dsh --out "$TARGET/packed/dsh" --concurrency 4
  pnpm --dir apps/desktop-host pack --pack-destination "$TARGET/packed/dsh"
  pnpm run release:pack --family vendor --out "$TARGET/packed/vendor" --concurrency 4
  pnpm --dir native/system run build:ts
  mkdir -p "$TARGET/packed/landlock"
  pnpm --dir native/system/packages/entry pack --pack-destination "$TARGET/packed/landlock"
  pnpm --dir apps/desktop run prepare:runtime
  pnpm --dir apps/desktop run prepare:packages
)

step '5/8 构建并校验可重定位 Desktop'
node deepseek-harness/node_modules/tsx/dist/cli.mjs macos-launcher/build-desktop-release.mjs
DESKTOP_APP="$ROOT/.build/desktop-arm64/mac-arm64/DeepSeek Harness.app"
node deepseek-harness/node_modules/tsx/dist/cli.mjs macos-launcher/verify-desktop-release.mjs "$DESKTOP_APP"

step '6/8 构建并校验启动器 App'
DSH_MACOS_DESKTOP_APP="$DESKTOP_APP" node macos-launcher/build.mjs
APP="$ROOT/.build/DSH Workflow-${APP_VERSION}-dsh${DSH_VERSION}-arm64.app"
[[ -d "$APP" ]] || fail "启动器 App 未生成：$APP"
node deepseek-harness/node_modules/tsx/dist/cli.mjs macos-launcher/verify-desktop-release.mjs "$APP"

step '7/8 打包 DMG、manifest.json 与 SHA256SUMS'
rm -rf .build/release-assets
scripts/build-release.sh --app-path "$APP" --output-dir .build/release-assets

step '8/8 校验发布资产'
(cd .build/release-assets && shasum -a 256 -c SHA256SUMS)
step "完成：$APP"
step "资产：$ROOT/.build/release-assets"
