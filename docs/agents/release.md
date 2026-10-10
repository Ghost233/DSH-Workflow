# DSH Workflow 发布流程

仓库 `deploy-release` skill 与 GhostModelDeck 使用相同正文，统一入口是 `scripts/release.sh`。本文只记录 DSH 的发布参数和验证入口。

## 发布参数

| 项目 | DSH Workflow |
| --- | --- |
| GitHub 仓库与身份 | `Ghost233/DSH-Workflow`，有效身份为 `Ghost233` |
| 应用版本 | `macos-launcher/package.json`；`package-lock.json` 和 Flutter `pubspec.yaml` 的版本主体与其一致 |
| DSH 固定版本 | `dsh-runtime.json`，与应用版本独立 |
| 发布 tag | `macos-v<X.Y.Z>` |
| 发布 workflow | [macos-app.yml](../../.github/workflows/macos-app.yml) |
| 产物 | `DSH-Workflow-macOS-<X.Y.Z>-arm64.dmg`、`manifest.json` 和 `SHA256SUMS` |

应用版本采用用户确定的纯 `X.Y.Z`，高于已有发布 tag。Flutter 可保留 `+build`。脚本读取当前版本；版本修改和 main 提交在执行入口前完成。

## 准备与执行

按改动范围完成仓库相关检查。输入与环境未变的成功结果可直接复用。发布入口改动运行 `python3 -B scripts/test_release.py` 和 `bash -n scripts/release.sh scripts/build-release.sh`；skill 或发布文档改动只验证 skill、引用和相关配置。

生产构建与打包入口见 [macOS 启动器说明](../../macos-launcher/README.md)。工程环境按仓库约定准备。发布内容提交后，当前工作区的 main、origin/main 和实际远端 main 应同步到同一提交。

```sh
scripts/release.sh --dry-run
scripts/release.sh
```

空跑核对应用版本、DSH 固定信息、插件锁文件、工作树、main 同步和有效凭据，显示 tag 与完整提交。正式执行创建并推送附注 tag，触发发布 workflow。用户已要求发布且检查通过时直接执行，沿用会话中的授权。

普通 main push 生成 Actions artifacts。仅修改 Markdown 文档或 skill 的 push、PR 不触发 macOS 产品构建。

## 打包与验收

CI 构建并验收 DSH、Desktop 和启动器，再调用 `scripts/build-release.sh --app-path <完整应用.app> --output-dir <空产物目录>`。该入口生成 DMG 和两份清单，核对应用版本、ARM64、签名及打包的 DSH。使用现有 ad-hoc 签名，未公证。

根据 tag 和完整提交选择发布运行。验收对应管线成功、Release 非草稿且非预发布、三件套完整。读取 manifest 和 SHA256SUMS，核对版本、发布提交、名称、大小及 SHA256。DMG 的校验优先使用本次 CI 记录与 GitHub 资产 digest。需要独立复核、元数据缺失或排障时再下载完整 DMG，运行 `shasum -a 256 -c SHA256SUMS` 并检查应用。

完成前核对本地 main/tag 与实际远端，报告 Release 链接。更新检查发现高于已安装版本的正式 `macos-v<X.Y.Z>` Release。

## 失败恢复

| 情况 | 下一步 |
| --- | --- |
| 检查失败 | 按原错误处理工作树、版本、身份或同步问题。 |
| tag push 失败且实际远端没有 tag | 保留同一附注 tag，运行 `scripts/release.sh --dry-run --retry-tag`，通过后运行 `scripts/release.sh --retry-tag`。 |
| tag 已在远端 | 跟踪既有运行。 |
| 输入未变的临时故障 | 重跑同一运行，保留原错误。 |
| 代码修复或已发布资产有误 | 验证修复，使用下一版本发布。已有 Release 和同名产物保留。 |
