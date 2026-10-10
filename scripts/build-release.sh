#!/usr/bin/env bash
# DSH Workflow DMG 打包；改编自 GhostModelDeck 的 build-release.sh。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH=""
DIST_DIR="$REPO_ROOT/.build/release-assets"

usage() {
  printf 'Usage: scripts/build-release.sh [--app-path PATH] [--output-dir PATH]\n'
}
die() { printf 'build-release: 错误：%s\n' "$*" >&2; exit 1; }

while (( $# )); do
  case "$1" in
    --app-path|--output-dir)
      [[ $# -ge 2 && -n "$2" ]] || die "$1 需要非空路径"
      if [[ "$1" == --app-path ]]; then APP_PATH="$2"; else DIST_DIR="$2"; fi
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "未知参数：$1" ;;
  esac
done

[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || die '仅支持 macOS ARM64'
cd "$REPO_ROOT"
VERSION="$(python3 -c 'import json,re; v=json.load(open("macos-launcher/package.json"))["version"]; assert re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)",v), "Invalid app version"; print(v)')"
DSH_VERSION="$(python3 -c 'import json; print(json.load(open("dsh-runtime.json"))["version"])')"
[[ -n "$APP_PATH" ]] || APP_PATH="$REPO_ROOT/.build/DSH Workflow-${VERSION}-dsh${DSH_VERSION}-arm64.app"
[[ -d "$APP_PATH" ]] || die "完整应用不存在：${APP_PATH}；先完成生产运行时与启动器构建"
plist="$APP_PATH/Contents/Info.plist"
[[ -f "$plist" ]] || die "缺少 Info.plist：$plist"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
[[ "$bundle_id" == com.ghostagent.dsh-workflow-launcher ]] || die "bundle id 不匹配：$bundle_id"
app_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
[[ "$app_version" == "$VERSION" ]] || die "应用版本不匹配：启动器为 ${VERSION}，实际应用为 $app_version"
python3 - "$APP_PATH" "$DSH_VERSION" <<'PY'
import json, sys
from pathlib import Path
resources = Path(sys.argv[1]) / 'Contents/Resources'
package = json.loads((resources / 'node_modules/@deepseek-ai/dsh/package.json').read_text())
if package.get('name') != '@deepseek-ai/dsh' or package.get('version') != sys.argv[2]:
    raise SystemExit('build-release: 打包应用的 DSH 版本与固定版本不一致')
if not (resources / 'desktop/DeepSeek Harness.app').is_dir():
    raise SystemExit('build-release: 缺少完整 Desktop 应用')
PY
exe="$APP_PATH/Contents/MacOS/DSH Workflow"
[[ -s "$exe" ]] || die "可执行文件缺失或为空：$exe"
[[ "$(lipo -archs "$exe")" == arm64 ]] || die '启动器可执行文件必须为 ARM64'
codesign --verify --deep --strict "$APP_PATH"

DMG_NAME="DSH-Workflow-macOS-${VERSION}-arm64.dmg"
for name in "$DMG_NAME" manifest.json SHA256SUMS; do
  [[ ! -e "$DIST_DIR/$name" && ! -L "$DIST_DIR/$name" ]] || die "产物已存在，保留原文件：$DIST_DIR/$name"
done
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-workflow-dmg.XXXXXX")"
cleanup() {
  local rc=$?
  if ! rm -rf "$STAGING_DIR"; then
    printf 'build-release: 清理临时目录失败：%s\n' "$STAGING_DIR" >&2
    if (( rc == 0 )); then rc=1; fi
  fi
  exit "$rc"
}
trap cleanup EXIT
mkdir "$STAGING_DIR/image" "$STAGING_DIR/assets"
ditto "$APP_PATH" "$STAGING_DIR/image/DSH Workflow.app"
ln -s /Applications "$STAGING_DIR/image/Applications"
hdiutil create -format UDZO -volname 'DSH Workflow' -srcfolder "$STAGING_DIR/image" "$STAGING_DIR/assets/$DMG_NAME"
hdiutil verify "$STAGING_DIR/assets/$DMG_NAME"
[[ -s "$STAGING_DIR/assets/$DMG_NAME" ]] || die 'DMG 为空'
source_commit="$(git rev-parse HEAD)"
python3 - "$STAGING_DIR/assets" "$DMG_NAME" "$VERSION" "$DSH_VERSION" "$source_commit" <<'PY'
import hashlib, json, sys
from pathlib import Path
directory, name, version, dsh, commit = sys.argv[1:]
root = Path(directory)
dmg = root / name
digest = hashlib.sha256()
with dmg.open('rb') as file:
    for chunk in iter(lambda: file.read(1024 * 1024), b''):
        digest.update(chunk)
manifest = {'version': version, 'tag': 'macos-v' + version, 'sourceCommit': commit,
            'dshVersion': dsh, 'assets': [{'name': name, 'sha256': digest.hexdigest(), 'size': dmg.stat().st_size}]}
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
PY
(cd "$STAGING_DIR/assets" && shasum -a 256 "$DMG_NAME" manifest.json > SHA256SUMS && shasum -a 256 -c SHA256SUMS)
mkdir -p "$DIST_DIR"
for name in "$DMG_NAME" manifest.json SHA256SUMS; do
  [[ ! -e "$DIST_DIR/$name" && ! -L "$DIST_DIR/$name" ]] || die "产物已存在，保留原文件：$DIST_DIR/$name"
  cp "$STAGING_DIR/assets/$name" "$DIST_DIR/$name"
done
printf 'build-release: 完成：%s\n' "$DIST_DIR/$DMG_NAME" "$DIST_DIR/manifest.json" "$DIST_DIR/SHA256SUMS"
