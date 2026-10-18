---
status: accepted
date: 2026-10-19
implementation: implemented
---

# 用仓库内声明与运行时注入承载按仓库的 Git/GitHub 账号

用户需要同时访问多个仓库，且不同仓库使用不同的 Git/GitHub 账号，不能依赖全局登录态。方案把账号归属收敛到仓库自身：仓库内一份被 Git 忽略、可选、单行的 `.ghswitch` 记录该仓库使用的 GitHub 登录名；账号目录沿用 `${XDG_CONFIG_HOME:-$HOME/.config}/gh-profiles/<登录名>`。声明只由 `configure-gh-account` skill 写入，deck 只读取，每次使用时现读，不缓存声明、不保存状态；账号名格式非法或账号目录缺失时按未声明处理。文件缺失或为空时整条链路完全 no-op，沿用从宿主进程继承的全局 gh 登录态。用户明确否决了在声明之上增加绑定/解绑、快照恢复、漂移检测、检查链步骤、面板显示和宿主记忆，避免把一条声明做成账号管理系统。

账号需要作用到四个面：提交身份、HTTPS 推认证、面板自身的 gh 出站，以及模型在 bash 里直接敲的 git/gh。DSH 没有按工作区注入普通环境变量的机制：启动环境只有调用目录的 `.env` 一层且进程级定格，hooks 配置是进程级且输出没有环境变量通道，`ctx.shell` 每个上下文只允许一个执行器，`shellEnv` 只接受 `DSH_*` 保留前缀。因此分工为：提交身份与推认证由仓库本地 git 配置承担（credential helper 内嵌 `GH_CONFIG_DIR`，与 harness 无关）；面板 gh 出站在每次 spawn 时显式传 `GH_CONFIG_DIR`；模型 bash 面用 `BASH_ENV` 分发脚本补齐——deck 宿主插件加载时生成 shim 并把 `process.env.BASH_ENV` 指向它（保存并链式承接原值，卸载时还原），非交互 `bash -c` 启动即 source，脚本从当前目录向上找最近的 `.ghswitch` 并导出对应的账号目录，无声明则什么都不做。不全局切号、不解析命令文本、不修改已跟踪文件。

初始化只保留一个入口。`configure-gh-account` skill 读取已有声明与项目约束，验证或从已有 gh 目录导入账号目录，写仓库内 `--local` 的 `user.name`/`user.email` 与 credential helper/`username`，缺失时写 `.ghswitch` 并确保 `.gitignore` 覆盖它。skill 通过 `DSH_SESSION_ID` 区分 harness：DSH 侧不需要额外配置文件（由分发脚本承担），Codex 侧继续生成 `.codex/config.toml`。skill 源码随本仓库提交，并由启动组合注册为自定义 skill 目录、随启动器发布物安装；用户 home 目录不安装 skill。codex-market 中的副本按用户决定保留，两边各自维护。

被否的方案包括：包装 `ctx.shell` 在调用前注入环境变量（每个上下文只允许一个 shell 实现，只能改内部实现，升级易碎）；不做透明层（模型 bash 裸敲 gh 会落到全局账号，与 Codex 侧效果不等价）；等待 DSH 上游提供按工作区环境变量（启动环境文档明确说明不提供，周期不可控）；以及旧的全局 `gh auth switch` 切号 hook（存在全局竞态、需要解析命令文本、已被废弃）。用户同时否决了围绕声明文件的管理系统。

这一决定使 deck 承担一次进程级的 `BASH_ENV` 设置：所有继承宿主环境的非交互 bash 都会 source 该 shim，因此 shim 必须在无声明时零副作用、永不失败，且只导出 `GH_CONFIG_DIR`。改 `.ghswitch` 后 gh 调用立即跟随，但提交身份和推认证是仓库本地 git 配置，需重跑 skill 才更新。首版只覆盖 GitHub.com 与 HTTPS remote；SSH remote、gitlab 等其它 host、交互式终端不在范围。用户于 2026-10-19 通过设计访谈确认整体设计和上述边界，实施清单与验收见[规格](../specs/repo-git-account/spec.md)。
