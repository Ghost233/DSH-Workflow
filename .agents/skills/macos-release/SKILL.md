---
name: macos-release
description: 发布 DSH Workflow macOS 启动器新版本的唯一流程：升级版本号、提交要发布的全部改动、推送 macos-v<版本> 标签触发 GitHub Actions 构建双架构 DMG 并自动附到同名 GitHub Release。凡用户提到发布/发版/上新版 macOS 启动器或 launcher、发 DMG 到 GitHub Release、"检查更新没有新版本"想发新版等场景都使用本 skill。注意：只推 main 不是发布（仅 CI 检查）；本地打 DMG 也不是发布，均不在本 skill 内。
---

# DSH Workflow macOS 启动器发布（GitHub Actions 标签流程）

发布由且仅由 `macos-v<版本>` 标签触发 `.github/workflows/macos-app.yml`：CI 在 macos-15（arm64）和 macos-15-intel（x64）两个 runner 上构建、测试、打 DMG，全部通过后 release job 自动把两个 DMG 附到同名 GitHub Release。推送到 main 只触发 CI 构建检查（DMG 仅作为 Actions artifact），不产生 Release、用户收不到更新提示。构建、测试、DMG 打包校验全部在 CI 内完成，不要在本地重复执行作为发布步骤。

## 硬性约束

违反任何一条，发布会失败或用户收不到更新提示：

- 版本号必须是纯 `X.Y.Z`，不允许 `-beta` 等预发布后缀（`macos-launcher/build.mjs` 按 `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` 校验）。
- 标签必须与 `macos-launcher/package.json` 的 `version` 完全一致（`0.1.1` ↔ `macos-v0.1.1`）；CI 的 "Verify architecture and release version" 步骤会断言，不一致构建直接失败、不会发布。
- `macos-launcher/package.json` 和 `package-lock.json` 必须一起更新。
- CI 从标签指向的提交构建（含递归 submodule checkout）。工作区未提交的改动不会进入发布包；要发布的内容必须在打标签前全部提交并推送。
- 启动器更新检查（`macos-launcher/Sources/UpdatePolicy.swift` 的 `newerRelease`）只认非草稿、非预发布、`macos-v<X.Y.Z>` 且版本**严格大于**已装版本的 Release；同版本号重打 tag，老用户看不到更新。

## 发布步骤

### 1. 前置检查

```sh
git status --porcelain --untracked-files=no   # 工作区剩余改动 = 不想发布的内容才对
git -C deepseek-harness rev-parse HEAD        # 必须等于 dsh-runtime.json 的 commit
git tag -l 'macos-v*'                          # 目标版本号未被占用
gh release list --repo Ghost233/DSH-Workflow --limit 5
```

目标版本号：用户明确指定就用指定的；否则在当前版本基础上 patch +1（如 0.1.0 → 0.1.1），执行前向用户确认。

若工作区还有未提交改动，先和用户确认这些改动是否随本版发布；是则一并提交（可分多个有意义的提交），不相关的改动不要夹带。

### 2. 升版本号

```sh
cd macos-launcher && npm version <X.Y.Z> --no-git-tag-version && cd ..
```

`npm version` 会同时更新 `package.json` 和 `package-lock.json`。检查 diff，两个文件应只有版本号变化。

### 3. 提交、打标签、推送

```sh
git add macos-launcher/package.json macos-launcher/package-lock.json
git commit -m "chore(release): macos v<X.Y.Z>"
git tag macos-v<X.Y.Z>
git push origin main macos-v<X.Y.Z>
```

标签必须打在包含这次版本号变更的提交上（workflow 的 paths 过滤靠 `macos-launcher/**` 的变更命中），分支和标签一起推送。

### 4. 跟踪 CI 直到结束

```sh
gh run list --workflow=macos-app.yml --limit 3
gh run watch <run-id> --exit-status
```

分支 push 和标签 push 会各触发一次 run，盯 tag 那次；要求 build（arm64）、build（x64）、release 三个 job 全绿。

### 5. 验收 Release

```sh
gh release view macos-v<X.Y.Z> --repo Ghost233/DSH-Workflow
```

以下全部满足才算发布完成：

- Release 存在、非草稿、非预发布，tag 为 `macos-v<X.Y.Z>`；
- 恰好两个 DMG 资产：`DSH-Workflow-macOS-<X.Y.Z>-arm64.dmg` 和 `DSH-Workflow-macOS-<X.Y.Z>-x64.dmg`；
- 向用户报告 Release 链接，说明启动器"检查更新"现在能发现该版本（已装版本需低于它）。

## 失败处理

- CI 失败：`gh run view <run-id> --log-failed` 定位原因，修复后重新走流程。
- 标签已推送但构建失败、Release 尚未创建：可删标签修复后重打——`git tag -d macos-v<X.Y.Z> && git push origin :refs/tags/macos-v<X.Y.Z>`，修复提交后重新 tag 并推送。
- Release 已创建或已有用户拿到该版本：不要改写或删除已发布标签，升一个 patch 版本（如 0.1.1 → 0.1.2）重新发布。

## 备注

- CI 产出的 DMG 为 ad-hoc 签名、未公证；其他 Mac 首次打开需右键"打开"。Developer ID 签名与公证是另外的流程，不在本 skill 内。
- 用户要"本地打一个 DMG"（不发布）不属于本 skill：那是 `node macos-launcher/build.mjs` + `hdiutil` 的本地构建，产物只在 `.build/` 下，与发布通道无关。
