---
name: deploy-release
description: 发布 Ghost DSH Station 正式版，核验手动版本与 Ghost233 身份，推送 tag，并跟踪 GitHub Actions 编译、打包和上传 Release。仅在用户明确要求正式发布时使用；编辑此流程不触发发布。
disable-model-invocation: true
---

# deploy-release

正式发布由 `scripts/release.sh` 推送 `macos-vX.Y.Z` 附注 tag，触发 `.github/workflows/macos-app.yml`。Actions 在 macOS ARM64 runner 编译、签名、打包并上传 Release。发布流程只构建产物，版本、签名、包结构、插件本体和哈希核对属于打包门禁。

## 发布步骤

1. 确认仓库为 Ghost233/DSH-Workflow，且用户已明确要求正式发布。编辑技能、脚本或 workflow 只完成编辑与本地验证，不据此发布。
2. 由人按下方规则确定版本，同步启动器 package.json、package-lock.json 和 Flutter pubspec.yaml。在本地完成相关检查、编译与包预检。插件交付按下方“插件随包交付”验收，将已审查内容提交到 main。
3. 核对当前本地 main、origin/main 和实际远端 main 指向同一完整提交。保留用户未提交文件；仅允许 fast-forward 同步。
4. 运行 `scripts/release.sh --dry-run`，展示版本、tag 与完整提交。通过后在已有发布授权内运行 `scripts/release.sh`；它只创建并推送 tag，不自动 bump、提交或推送 main。
5. 按该 tag 和提交跟踪 `macos-app.yml`，确认构建与上传成功。Actions 调用 `scripts/build-local-release.sh` 生成 DMG、manifest.json 和 SHA256SUMS，再调用 `scripts/publish-release.sh`，以 `--verify-tag` 创建正式 Release。
6. 按“完成验证”核对远端证据和本地同步。通过后报告版本、发布提交、Release 与 Actions 链接。

Actions 不运行 CI、单元、集成、smoke、运行时验收或独立类型检查任务，也不启动 Host。构建脚本用 `build:official --scope artifacts` 编译生产产物，准备运行时时传入 `--defer-primary-runtime-smoke`，不调用 `verify-desktop-release.mjs`。仓库保留发布工作流，普通 push 和 PR 不触发测试。

## 身份与执行边界

本地认证命令使用 Ghost233：每次认证 gh 命令前先执行 `gh auth switch --hostname github.com --user Ghost233`，再执行 `gh api --hostname github.com user --jq .login`，有效身份必须是 Ghost233。设置 GH_TOKEN 或 GITHUB_TOKEN 时仍核验实际身份。Git 远端操作使用已核验的 gh credential helper，并单独确认实际 Git 凭据属于 Ghost233；origin 必须是本仓库 HTTPS 地址。业务命令显式指定 Ghost233/DSH-Workflow。

Actions 使用本仓库内置 `GITHUB_TOKEN` 和 `contents: write` 权限上传，不切换本机 gh 账号，不注入个人凭据。工作流只接受发布 tag，核对仓库、ARM64、checkout 提交和版本，再构建该提交。

发布不安装或运行本机应用，不切换现有服务。发布后的资产下载、重新计算哈希、安装和运行，均需用户另行明确要求。

## 失败恢复

| 失败点 | 保留状态与下一动作 |
| --- | --- |
| 分支、工作树、身份、版本或同步检查 | 修复原错误；不创建 tag，不 stash 或覆盖用户文件。 |
| tag push 失败 | 保留本地 tag。核对远端没有该 tag 后，用 `scripts/release.sh --retry-tag` 重推同一 tag，不移动 tag。 |
| tag 已在远端 | 跟踪同一提交的既有 Actions run，不重推 tag。 |
| Actions 编译或打包失败，尚无正式资产 | 保留原始失败。输入未变的临时环境故障可重跑原 run；源码修复使用下一个人工确定的版本，不移动 tag。 |
| Release 创建失败或资产不完整 | 先核对远端；不覆盖同版本 DMG。按下方回滚规则撤回并作废该版本，以人工确定的下一个版本重新发布。 |

## 完成验证

按 tag 对应的完整提交定位运行：

```sh
gh run list -R Ghost233/DSH-Workflow --workflow macos-app.yml --commit <发布提交>
gh run watch <run-id> -R Ghost233/DSH-Workflow --exit-status
gh release view macos-vX.Y.Z -R Ghost233/DSH-Workflow --json tagName,isDraft,isPrerelease,tagCommitish,assets,url
git ls-remote origin 'refs/tags/macos-vX.Y.Z^{}' refs/heads/main
```

完成条件：

- Actions 对应发布 tag 和完整提交，结论为 success；运行日志只含编译、签名、打包和上传。
- Release 非草稿、非预发布；tag 与发布提交中的启动器版本一致。
- 远端含该版本 ARM64 DMG、manifest.json 和 SHA256SUMS，大小均大于零。
- Actions 日志中的 manifest 绑定相同 tag、版本和 sourceCommit。`pluginPayload` 覆盖本次清单中全部 `startup: true` 插件，版本和 Git 提交一致，交付摘要及打包哈希校验通过。
- 本地 main、origin/main 和实际远端 main 一致；本地 tag 与远端 tag 指向同一发布提交。

缺少证据时保持未完成。读取遇到瞬态网络错误时重试同一读取，不创建第二次发布。发布后默认仅读取远端状态、日志和资产元数据。

本地流程回归：`python3 -B scripts/test_release.py` 使用临时仓库和模拟 CLI，不访问 GitHub。Shell 检查为 `bash -n scripts/release.sh scripts/build-release.sh scripts/build-local-release.sh scripts/publish-release.sh`。这些本地检查不放入 Actions。真实包预检可用 `scripts/build-release.sh --app-path <本次已构建的.app> --output-dir <空目录>`，保留既有产物。

## 插件随包交付

`project-plugins.json` 与生成的锁文件确定版本，清单本身不能证明插件已经交付。构建必须从清单固定的 npm 版本或 Git 提交取得包本体，携带生产依赖和内容摘要。构建失败时保留原始错误，修正来源或版本后重新构建；完整交付范围以原清单为准。

标准 App 构建调用 `macos-launcher/bundle-plugins.mjs`。`scripts/build-release.sh` 在创建 DMG 前重新验证全部文件、插件入口和来源，`scripts/publish-release.sh` 再核对发布 manifest 的完整插件记录。已有 App 只有清单、缺少本体或摘要时，同样不能通过打包门禁。

发布前在本地完成交付回归：

```sh
node scripts/run-project-tests.mjs macos-launcher/runtime/plugin-build.test.mjs macos-launcher/runtime/plugin-payload.test.mjs macos-launcher/runtime/desktop-profile.test.mjs macos-launcher/runtime/startup-plugins.test.mjs macos-launcher/runtime/desktop-packaged-host.test.mjs
python3 -B scripts/test_release.py
```

构建候选 App 后，使用随包资源运行完整 Flutter 验收。`DSH_TEST_NODE` 与 `DSH_TEST_NODE24` 指向本次同版本的独立 Node 文件，路径不得含空格；`DSH_LAUNCHER_TEST_PORT=0` 使真实 Web 验收分配临时端口，避免占用现有服务端口。

```sh
candidate_resources="/绝对路径/候选.app/Contents/Resources"
candidate_node="/绝对路径/无空格目录/node"
(cd macos-launcher/flutter && \
  DSH_SERVICE_TEST_RESOURCES="$candidate_resources" \
  DSH_TEST_NODE="$candidate_node" DSH_TEST_NODE24="$candidate_node" \
  DSH_LAUNCHER_TEST_PORT=0 \
  "${FLUTTER_BIN:-flutter}" test --no-pub --concurrency=1)
```

验收覆盖全新 profile、旧测试链接升级、应用目录迁移和用户主动停用。真实 Host 必须报告固定插件为 `loaded`，实际版本和解析路径来自随包目录；只看到清单、依赖声明或文件存在均不足以验收。插件的界面验收还须打开对应侧边栏和设置入口，保留观察结果；已主动停用的插件保持停用。

运行端从已验证的应用目录部署插件，备份旧包和 profile 声明，保留配置与凭据。部署不下载依赖、不执行包管理器。发布本身仍不安装应用或切换现有服务；真实应用安装及运行需要已有的明确授权。上述本地回归和运行验收不放入 Actions。

## 发布版本号规则

本节是 Ghost DSH Station 版本发布纪律的权威来源。

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
