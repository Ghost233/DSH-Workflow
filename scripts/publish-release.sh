#!/usr/bin/env bash
# 上传已校验的发布资产并创建 GitHub 正式 Release（不创建 tag）。
# 用法：RELEASE_TAG=macos-vX.Y.Z [RELEASE_COMMIT=<sha>] [RELEASE_ASSETS=.build/release-assets] scripts/publish-release.sh
# 前置：tag 已由 scripts/release.sh 推送；Actions 已完成编译与打包。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "publish-release: 错误：$*" >&2; exit 1; }

RELEASE_TAG="${RELEASE_TAG:-}"
[[ -n "$RELEASE_TAG" ]] || fail "需要 RELEASE_TAG（如 macos-v0.3.3）"
[[ "$RELEASE_TAG" =~ ^macos-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail "RELEASE_TAG 不是 macos-vX.Y.Z：$RELEASE_TAG"
RELEASE_COMMIT="${RELEASE_COMMIT:-$(git rev-parse HEAD)}"
[[ "${#RELEASE_COMMIT}" == 40 ]] || fail "RELEASE_COMMIT 必须是完整 40 位提交：$RELEASE_COMMIT"
[[ "$(git rev-parse HEAD)" == "$RELEASE_COMMIT" ]] || fail "当前 HEAD 与 RELEASE_COMMIT 不一致"
RELEASE_ASSETS="${RELEASE_ASSETS:-.build/release-assets}"
[[ -d "$RELEASE_ASSETS" ]] || fail "发布资产目录不存在：$RELEASE_ASSETS"
[[ "$(find "$RELEASE_ASSETS" -maxdepth 1 -name '*.dmg' -type f | wc -l | tr -d ' ')" == 1 ]] || fail "资产目录必须恰好包含一个 DMG"

(cd "$RELEASE_ASSETS" && shasum -a 256 -c SHA256SUMS)

python3 - "$RELEASE_ASSETS" "$RELEASE_TAG" "$RELEASE_COMMIT" <<'PY'
import hashlib, json, os, sys
from pathlib import Path

root = Path(sys.argv[1])
tag = sys.argv[2]
commit = sys.argv[3]
version = tag.removeprefix('macos-v')
expected = f'DSH-Workflow-macOS-{version}-arm64.dmg'
value = json.loads((root / 'manifest.json').read_text())
assert value['tag'] == tag and value['version'] == version, f"manifest tag/version 不一致：{value.get('tag')} {value.get('version')}"
assert json.loads(Path('macos-launcher/package.json').read_text())['version'] == version, '发布 tag 与源码版本不一致'
assert value['sourceCommit'] == commit, f"manifest sourceCommit 不一致：{value.get('sourceCommit')}"
assert len(value['assets']) == 1 and value['assets'][0]['name'] == expected, f"manifest assets 不符合预期：{value.get('assets')}"
assert value['assets'][0]['size'] == (root / expected).stat().st_size, 'manifest size 不一致'
digest = hashlib.sha256()
with (root / expected).open('rb') as file:
    for chunk in iter(lambda: file.read(1024 * 1024), b''):
        digest.update(chunk)
assert value['assets'][0]['sha256'] == digest.hexdigest(), 'manifest sha256 不一致'
print(f"publish-release: 资产校验通过：{expected}")
PY

gh release create "$RELEASE_TAG" \
  "$RELEASE_ASSETS"/*.dmg \
  "$RELEASE_ASSETS"/manifest.json \
  "$RELEASE_ASSETS"/SHA256SUMS \
  --verify-tag \
  --repo Ghost233/DSH-Workflow \
  --title "DSH Workflow macOS ${RELEASE_TAG#macos-v}" \
  --notes "Automated macOS builds for Apple Silicon (ARM64). Locally ad-hoc signed; not notarized."

echo "publish-release: 完成：$RELEASE_TAG 已创建 Release"
