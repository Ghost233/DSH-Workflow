---
name: macos-release
description: 发布或维护 DSH Workflow macOS 启动器的标准流程，检查版本、验证证据及 main 同步，推送 macos-v 标签并验收 GitHub Release。编辑流程只完成编辑与验证；正式发布须有用户明确授权。
---

# DSH Workflow macOS 发布

执行前读取 [发布流程](../../../docs/agents/release.md)。正式入口是 `scripts/release.sh`；DMG 打包入口是 `scripts/build-release.sh`。流程改编自 GhostModelDeck deploy-release，并沿用 `.github/workflows/macos-app.yml` 的 ARM64 标签发布通道。

1. 确认用户明确要求正式发布。维护 skill、脚本或 CI 时只完成编辑与验证，不升版本或推标签。
2. 确定发布内容和纯 `X.Y.Z` 应用版本。沿用已有版本授权；目标未定时，在发布内容准备就绪后说明版本及改动，取得确认。同步启动器 package.json、package-lock.json 和 Flutter pubspec 的版本主体。DSH 版本按 dsh-runtime.json 独立固定。
3. 按 AGENTS.md 和发布文档完成涉及的本地门禁，记录源码版本及真实退出码。缺少本地环境时列明缺口，取得明确的远端补验授权；已知失败先修复。成功验证绑定实际输入，不能用旧产物证明新提交。
4. 审查并提交发布内容。在用户当前主工作区同步 main，使用 fast-forward，保留未提交和未跟踪文件。核对本地 main、origin/main 和实际远端的完整提交一致。脚本不会 bump、提交、推 main、切换账号或自动备份用户文件。
5. 运行 `scripts/release.sh --dry-run`，查看应用版本、DSH 固定提交、发布标签及完整 main 提交。检查通过且已有发布授权时运行 `scripts/release.sh`。只有标签 push 失败、实际远端无标签时使用 `--retry-tag`；其他恢复按发布文档执行，不移动已有标签。
6. 按脚本输出的完整提交跟踪 macos-app.yml，选择发布标签对应的运行。标签已推送只表示受理。验收正式 Release、DMG、manifest、SHA256SUMS、应用版本、源码提交及本地/远端 Git 同步后，报告 Release 链接。缺少证据时如实列明未完成项。

本地打包只生成预检产物。main push 只生成 Actions artifacts。正式 Release 由 `macos-v<X.Y.Z>` 触发，更新检查只发现高于已安装版本的正式发布。已有 Release 及同名本地产物保留，代码修复使用下一版本。
