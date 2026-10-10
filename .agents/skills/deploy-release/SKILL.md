---
name: deploy-release
description: 发布 DSH Workflow 正式版，核验手动版本和 Ghost233 身份，推送发布 tag 并跟踪 DMG 管线。仅在用户明确要求正式发布时使用；编辑此流程不触发发布。
disable-model-invocation: true
---

# deploy-release

发布 DSH Workflow 正式版。执行前读取下方“标准发布流程”与“发布版本号规则”。唯一执行入口是 `scripts/release.sh`；版本选择、失败恢复和完成条件以下方两节为准。

## 步骤

1. 确认工作区是 Ghost233/DSH-Workflow，且用户明确要求正式发布。沿用已有授权；编辑 skill 或脚本只完成编辑与验证。
2. 按版本规则由人手动确定 `macos-launcher/package.json` 的版本，完成相关本地门禁，并将已审查的发布内容合入 main、同步本地。脚本不自动 bump，也不提交未完成的改动。
3. 运行 `scripts/release.sh --dry-run`，展示当前版本、tag 与完整提交。检查通过后，在明确发布授权内执行 `scripts/release.sh`；失败按下方“标准发布流程”恢复，保留原错误。
4. 脚本输出「完成：macos-vX.Y.Z 已推送」只代表发布受理。按脚本给出的 commit 跟踪对应 macos-app.yml：

   ```sh
   gh run list -R Ghost233/DSH-Workflow --workflow macos-app.yml --commit <发布提交>
   ```

5. 按下方 Ghost233 护栏核验每个认证命令。完成条件：对应管线成功，正式 Release/tag/`macos-launcher/package.json` 版本一致，DMG、manifest.json、SHA256SUMS 完整且校验通过，本地 main 与 tag 同实际远端；缺少证据保持未完成。

## 标准发布流程

仅在用户明确要求正式发布时执行 `scripts/release.sh`。编辑发布 skill、脚本或 workflow 只完成编辑与验证。版本规则的唯一来源是下方“发布版本号规则”。

### 发布前

1. 由人手动确定并修改 `macos-launcher/package.json` 的版本，按规则递增；使用纯 `X.Y.Z`，同步 `macos-launcher/package-lock.json` 的顶层与根包版本，以及 `macos-launcher/flutter/pubspec.yaml` 的版本主体；Flutter 可保留 `+build`。完成对应改动的本地门禁、Mac 构建和发布包预检，再提交并合入 main。
2. 当前工作区切到 main，保留并妥善处理用户未提交文件。只采用 fast-forward 同步，本地 main、origin/main 与实际远端必须相同。脚本不会 stash、提交、切换分支、bump 或推送 main。
3. GitHub 业务身份和实际 Git 凭据均为 Ghost233。脚本核验 HTTPS origin 为 Ghost233/DSH-Workflow，并为每次 Git 远端调用使用已核验的 gh credential helper；不修改其他账号的凭据。

### 入口

```sh
scripts/release.sh --dry-run
scripts/release.sh
```

空跑显示仓库、已手动选定的版本、tag 与完整 main 提交，不创建或推送 tag、不改工作区文件、不 fetch。身份切换仅用于仓库账号护栏。

正式执行为当前 main 创建附注 `macos-vX.Y.Z` tag 并推送，随后验证实际远端 tag 提交。tag 触发 `macos-app.yml`，由现有 `build-release.sh` 生成 `DSH-Workflow-macOS-X.Y.Z-arm64.dmg`、`manifest.json`、`SHA256SUMS`。普通 push 到 main 不再触发正式发布。

脚本输出「完成：macos-vX.Y.Z 已推送」代表受理，不代表 DMG 已发布。

### 失败恢复

| 失败点 | 保留状态与下一动作 |
| --- | --- |
| 分支、工作树、账号、版本或同步检查 | 不创建 tag。按错误解决；不自动暂存或覆盖用户文件。 |
| tag push 失败 | 本地 tag 保留。先核对远端是否已有 tag；若没有，运行 `scripts/release.sh --dry-run --retry-tag`、再运行 `scripts/release.sh --retry-tag`。只重推指向当前 main 的同一 tag，不移动 tag、不再次 bump。 |
| tag 已在远端 | 不重新推送或创建版本，跟踪该提交的既有管线。 |
| workflow 构建失败，尚无正式资产 | 定位原错误，在本地完成对应验证。输入未变的临时故障可重跑原 run；代码修复使用下一个手动版本，保留原失败。 |
| Release 创建失败或资产不完整 | 先核对已有 Release/资产，不能把管线重试或 exit 0 当成完整发布；不覆盖同版本 DMG。按下方“回滚规则”撤回并作废该版本，再发布下一个版本。 |

### 完成验证

每个认证 gh 命令前执行 `gh auth switch --hostname github.com --user Ghost233`，再执行 `gh api --hostname github.com user --jq .login`；只有有效身份为 Ghost233 才继续，设置了 GH_TOKEN 或 GITHUB_TOKEN 时同样核验。Git 远端写操作还必须确认实际使用的认证凭据属于 Ghost233；不以 gh 身份推断独立 Git credential helper 的身份。业务命令显式指定本仓库。

```sh
gh run list -R Ghost233/DSH-Workflow --workflow macos-app.yml --commit <发布提交>
gh run watch <run-id> -R Ghost233/DSH-Workflow --exit-status
gh release view macos-vX.Y.Z -R Ghost233/DSH-Workflow
gh release download macos-vX.Y.Z -R Ghost233/DSH-Workflow --dir <本次验证目录>
```

选择与发布 tag/完整提交匹配的 run。网络瞬态故障重试同一读取，不创建第二次发布。验收：对应管线成功，Release 是正式版本，tag/macos-launcher/package.json/manifest/.app 版本一致，三件套名称、大小与 SHA 校验通过，本地 main/tag 与实际远端一致。下载目录内运行 `shasum -a 256 -c SHA256SUMS` 并核对 manifest 中 DMG 的大小和 sha256。

本地流程回归：`python3 -B scripts/test_release.py` 使用临时 Git 仓库与本地裸仓库，在外部 Git/gh CLI 接缝模拟身份；不访问 GitHub，不发正式版。Shell 入口需通过 `bash -n scripts/release.sh scripts/build-release.sh`。真实包预检可用 `scripts/build-release.sh --app-path <本次已构建的.app> --output-dir <空产物目录>`，只产出本地文件，避免覆盖既有产物。

## 发布版本号规则

本节是 DSH Workflow 版本发布纪律的权威来源。

### 版本权威

- 版本号的唯一权威来源是 `macos-launcher/package.json` 的 `version` 字段，使用纯 `x.y.z`。`macos-launcher/package-lock.json` 的顶层与根包版本，以及 `macos-launcher/flutter/pubspec.yaml` 的 semver 部分必须一致；Flutter 可保留 `+build`，不参与版本比较。构建号（`CFBundleVersion`）由 `macos-launcher/build.mjs` 使用应用版本注入。`dsh-runtime.json` 的 DSH 固定版本与应用版本独立。
- 版本号由**人**在每个发布工单的实施中手动递增；禁止 CI 或脚本自动推导、自动 bump。
- 应用内读取当前版本必须来自打包信息（Info.plist / package_info_plus 等派生值），不得硬编码。

### 递增与 rollover 规则

版本号格式为 `x.y.z`，每次发布递增 **1**，采用「满 10 进位」的十进制 rollover：

- `z` 满 10 时进位为 `y+1.0`：`0.1.9` 的下一个版本是 `0.2.0`。
- `y` 满 10 时进位为 `x+1.0.0`：`0.9.9` 的下一个版本是 `0.10.0`（**不是** `1.0.0`——y 从 9 进为 10，不发生二次进位）。
- `1.0.9` 的下一个版本是 `1.1.0`；`1.9.9` 的下一个版本是 `1.10.0`。
- 每次发布最多进位一次；`0.9.9` 不跳级到 `1.0.0`。

该规则保持 semver 序单调递增（`0.1.9 < 0.2.0`、`0.9.9 < 0.10.0`），因此检查更新可以直接使用标准 semver 比较，无需特殊处理 rollover。

### tag 规则

- tag 格式为 `macos-v<x.y.z>`（例如 `macos-v0.1.0`）。
- tag 与 `macos-launcher/package.json` 必须**严格相等**；发布 workflow 强制校验，不一致即失败，不允许人工绕过。

### 回滚规则

- **版本号绝不重用。** 同一版本号不得对应两个不同的 DMG（保护 sha256 校验信任链）。
- 错误发布的撤回流程：
  1. 删除对应的 GitHub Release；
  2. 删除对应 tag（`git push origin :refs/tags/macos-v<x.y.z>` 及本地删除）；
  3. 该版本号作废，永不再用；
  4. 修复问题后，按递增规则以**下一个版本号**重新发布。

### 发布操作清单

1. 在发布工单中按上方规则由人手动修改 `macos-launcher/package.json`，完成本地门禁与发布包预检，随已审查内容合入 main，并同步本地 main。
2. 明确要求正式发布时执行 `scripts/release.sh --dry-run`，核对当前手动版本与 tag/完整提交，再执行 `scripts/release.sh`。
3. 脚本仅创建并推送 `macos-v<x.y.z>` 附注 tag，不自动 bump、不提交、不推送 main。tag 触发 workflow 构建并创建正式 Release。
4. 发布后核对三件套资产、manifest 版本/大小/哈希、SHA256SUMS 与应用版本；失败恢复见上方“标准发布流程”。

### workflow 行为

- `.github/workflows/macos-app.yml` 由 **push macos-v* tag** 触发；普通 push 到 main 不发布正式 Release。
- tag 去掉 macos-v 后必须与 `macos-launcher/package.json` 版本严格相等；checkout 的提交必须等于发布 tag 的提交。
- 使用固定 macos-15 / Flutter 3.47.6 调用 `scripts/build-release.sh`；该脚本验证应用 bundle id、`.app` 版本及打包的 DSH 版本。
- tag 已由本地发布入口创建，CI 使用 `gh release create --verify-tag`，不自动生成 tag、不覆盖同版本资产。同一 tag 的流水线应串行执行。
- 资产为 `DSH-Workflow-macOS-<x.y.z>-arm64.dmg`、`manifest.json`、`SHA256SUMS`。构建号由 `macos-launcher/build.mjs` 使用应用版本注入。
- `scripts/build-release.sh --app-path <已构建的.app>` 在本机预检打包环节；应用版本必须与 `macos-launcher/package.json` 一致。
