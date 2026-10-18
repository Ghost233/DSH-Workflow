---
name: deploy-release
description: 发布 DSH Workflow 正式版，核验手动版本和 Ghost233 身份，推送发布 tag，并在本机编译、打包、创建 GitHub Release。仅在用户明确要求正式发布时使用；编辑此流程不触发发布。
disable-model-invocation: true
---

# deploy-release

发布 DSH Workflow 正式版。执行前读取下方“标准发布流程”与“发布版本号规则”。发布入口是 `scripts/release.sh`，编译打包是 `scripts/build-local-release.sh`，上传资产是 `scripts/publish-release.sh`；版本选择、失败恢复和完成条件以下方各节为准。

## 步骤

1. 确认工作区是 Ghost233/DSH-Workflow，且用户明确要求正式发布。沿用已有授权；编辑 skill 或脚本只完成编辑与验证。
2. 按版本规则由人手动确定 `macos-launcher/package.json` 的版本，完成对应本地门禁（编译与发布包预检，不运行集成测试），并将已审查的发布内容合入 main、同步本地。脚本不自动 bump，也不提交未完成的改动。
3. 运行 `scripts/release.sh --dry-run`，展示当前版本、tag 与完整提交。检查通过后，在明确发布授权内执行 `scripts/release.sh`，由它创建并推送 `macos-vX.Y.Z` 附注 tag；失败按下方“标准发布流程”恢复，保留原错误。
4. 在本机运行 `scripts/build-local-release.sh` 编译并打包，产出 `.build/release-assets/{*.dmg,manifest.json,SHA256SUMS}`；产物校验失败时停止，不进入发布。
5. 运行 `RELEASE_TAG=macos-vX.Y.Z scripts/publish-release.sh` 上传已校验资产并创建正式 Release（`--verify-tag`，不自动生成 tag、不覆盖同版本资产）。
6. 按下方 Ghost233 护栏核验每个认证命令，依照“完成验证”核对远端发布结果。通过后给出 Release 链接并结束发布；缺少远端证据时保持未完成。发布后的本地资产下载、哈希校验、安装和运行仅在用户另行明确要求时执行。

## 标准发布流程

仅在用户明确要求正式发布时执行 `scripts/release.sh`。编辑发布 skill、脚本或文档只完成编辑与验证。版本规则的唯一来源是下方“发布版本号规则”。

### 发布前

1. 由人手动确定并修改 `macos-launcher/package.json` 的版本，按规则递增；使用纯 `X.Y.Z`，同步 `macos-launcher/package-lock.json` 的顶层与根包版本，以及 `macos-launcher/flutter/pubspec.yaml` 的版本主体；Flutter 可保留 `+build`。完成对应改动的本地门禁与编译验证（`scripts/build-local-release.sh` 或等价步骤），再提交并合入 main。
2. 当前工作区切到 main，保留并妥善处理用户未提交文件。只采用 fast-forward 同步，本地 main、origin/main 与实际远端必须相同。脚本不会 stash、提交、切换分支、bump 或推送 main。
3. GitHub 业务身份和实际 Git 凭据均为 Ghost233。脚本核验 HTTPS origin 为 Ghost233/DSH-Workflow，并为每次 Git 远端调用使用已核验的 gh credential helper；不修改其他账号的凭据。

发布流程不运行 Flutter 集成测试和 GitHub Actions 构建；本地门禁只要求编译、打包校验与远端元数据核对。

### 入口

```sh
scripts/release.sh --dry-run
scripts/release.sh
scripts/build-local-release.sh
RELEASE_TAG=macos-vX.Y.Z scripts/publish-release.sh
```

空跑显示仓库、已手动选定的版本、tag 与完整 main 提交，不创建或推送 tag、不改工作区文件、不 fetch。身份切换仅用于仓库账号护栏。

正式执行为当前 main 创建附注 `macos-vX.Y.Z` tag 并推送，随后验证实际远端 tag 提交。`scripts/build-local-release.sh` 在本机初始化固定 DSH 依赖、运行上游 `build:official`、装配 Flutter 启动器并调用 `scripts/build-release.sh` 生成 `DSH-Workflow-macOS-X.Y.Z-arm64.dmg`、`manifest.json`、`SHA256SUMS`。`scripts/publish-release.sh` 校验资产与 manifest 后用 `gh release create --verify-tag` 创建 Release。

发布 tag 只由 `scripts/release.sh` 创建；普通 push 到 main 不发布正式 Release。

### 失败恢复

| 失败点 | 保留状态与下一动作 |
| --- | --- |
| 分支、工作树、账号、版本或同步检查 | 不创建 tag。按错误解决；不自动暂存或覆盖用户文件。 |
| tag push 失败 | 本地 tag 保留。先核对远端是否已有 tag；若没有，运行 `scripts/release.sh --retry-tag`。只重推指向当前 main 的同一 tag，不移动 tag、不再次 bump。 |
| tag 已在远端 | 不重新推送或创建版本；继续本机编译与 Release 上传。 |
| 本地编译或打包失败 | 定位原错误并修复（可修改构建脚本或重新构建），tag 不移动。使用同一 tag 重跑 `scripts/build-local-release.sh`；不因编译失败更换版本号。 |
| Release 创建失败或资产不完整 | 先核对已有 Release/资产，不能把重试或 exit 0 当成完整发布；不覆盖同版本 DMG。按下方“回滚规则”撤回并作废该版本，再发布下一个版本。 |

### 完成验证

发布完成以 GitHub Release 的远端证据和本地 tag 同步为准。

每个认证 gh 命令前执行 `gh auth switch --hostname github.com --user Ghost233`，再执行 `gh api --hostname github.com user --jq .login`；只有有效身份为 Ghost233 才继续，设置了 GH_TOKEN 或 GITHUB_TOKEN 时同样核验。Git 远端写操作还必须确认实际使用的认证凭据属于 Ghost233；不以 gh 身份推断独立 Git credential helper 的身份。业务命令显式指定本仓库。

```sh
gh release view macos-vX.Y.Z -R Ghost233/DSH-Workflow --json tagName,isDraft,isPrerelease,tagCommitish,assets,url
git ls-remote origin 'refs/tags/macos-vX.Y.Z^{}' refs/heads/main
```

完成前核对：

- Release：对应版本已正式发布，非草稿、非预发布，tag 与发布提交中 `macos-launcher/package.json` 的版本一致。
- 远端资产：Release 列表含 `DSH-Workflow-macOS-X.Y.Z-arm64.dmg`、`manifest.json` 和 `SHA256SUMS`，大小均大于零。
- 本地证据：`.build/release-assets/SHA256SUMS` 校验通过；manifest 的 `tag`、`version`、`sourceCommit` 与发布提交一致。
- Git 同步：本地 main、origin/main 与实际远端 main 一致；本地 tag 与实际远端 tag 指向同一发布提交。

以上条件满足即完成发布，报告版本、发布提交与 Release 链接。网络瞬态故障重试同一读取，不创建第二次发布；失败或缺少证据时保持未完成。

发布后默认只读取远端状态和资产元数据。下载资产到本地、重新计算哈希、安装或运行应用，仅在用户另行明确要求时执行，不作为默认发布完成条件。

本地流程回归：`python3 -B scripts/test_release.py` 使用临时 Git 仓库与本地裸仓库，在外部 Git/gh CLI 接缝模拟身份；不访问 GitHub，不发正式版。Shell 入口需通过 `bash -n scripts/release.sh scripts/build-release.sh scripts/build-local-release.sh scripts/publish-release.sh`。真实包预检可用 `scripts/build-release.sh --app-path <本次已构建的.app> --output-dir <空产物目录>`，只产出本地文件，避免覆盖既有产物。

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
- tag 与 `macos-launcher/package.json` 必须**严格相等**；`scripts/release.py` 校验 `macos-v` + 版本，`scripts/build-local-release.sh` 与 `scripts/publish-release.sh` 再次核对版本与 manifest，不一致即失败，不允许人工绕过。

### 回滚规则

- **版本号绝不重用。** 同一版本号不得对应两个不同的 DMG（保护 sha256 校验信任链）。
- 错误发布的撤回流程：
  1. 删除对应的 GitHub Release；
  2. 删除对应 tag（`git push origin :refs/tags/macos-v<x.y.z>` 及本地删除）；
  3. 该版本号作废，永不再用；
  4. 修复问题后，按递增规则以**下一个版本号**重新发布。

### 发布操作清单

1. 在发布工单中按上方规则由人手动修改 `macos-launcher/package.json`，完成本地编译与发布包预检，随已审查内容合入 main，并同步本地 main。
2. 明确要求正式发布时执行 `scripts/release.sh --dry-run`，核对当前手动版本与 tag/完整提交，再执行 `scripts/release.sh`。
3. 脚本仅创建并推送 `macos-v<x.y.z>` 附注 tag，不自动 bump、不提交、不推送 main。
4. 本机运行 `scripts/build-local-release.sh` 编译打包，再运行 `scripts/publish-release.sh` 创建正式 Release。
5. 发布后按“完成验证”核对 Release、远端资产与本地 main/tag 同步。默认以远端证据完成验收；发布后的本地资产下载、校验、安装或运行仅在用户另行明确要求时执行。失败恢复见上方“标准发布流程”。

### 本地构建行为

- 正式发布不再由 GitHub Actions 构建；仓库不保留 `macos-app.yml` 发布流水线。
- `scripts/build-local-release.sh` 依次：构建 Matt 面板、Flutter 依赖解析、固定 DSH 依赖安装、上游生产包构建、Desktop 生产构建与校验、启动器 App 构建与校验、DMG 打包、资产校验。它不运行集成测试。
- DSH 源码保持上游原样；构建脚本只消费固定子模块与既有上游构建入口。
- 资产为 `DSH-Workflow-macOS-<x.y.z>-arm64.dmg`、`manifest.json`、`SHA256SUMS`。构建号由 `macos-launcher/build.mjs` 使用应用版本注入。
- `scripts/build-release.sh --app-path <已构建的.app>` 负责本机打包与 bundle 校验；应用版本必须与 `macos-launcher/package.json` 一致，打包的 DSH 版本必须与 `dsh-runtime.json` 一致。
- `scripts/publish-release.sh` 不创建 tag，`--verify-tag` 要求远端已存在该 tag；同一 tag 只创建一次 Release，不覆盖同版本资产。
