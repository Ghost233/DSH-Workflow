---
status: accepted
date: 2026-10-19
implementation: implemented
---

# 用仓库内声明与运行时注入承载按仓库的 Git/GitHub 账号

用户需要同时访问多个仓库，且不同仓库使用不同的 Git/GitHub 账号，不能依赖全局登录态。方案把账号归属收敛到仓库自身：仓库内一份被 Git 忽略、可选、单行的 `.ghswitch` 记录该仓库使用的 GitHub 登录名；账号目录沿用 `${XDG_CONFIG_HOME:-$HOME/.config}/gh-profiles/<登录名>`。声明由 `configure-gh-account` skill 写入，Station 在每次原生 Bash 调用时读取。账号选择基于仓库的声明与已有账号目录。

提交身份与 HTTPS 推认证由仓库本地 Git 配置承担。Codex 使用项目的 `.codex/config.toml`。Station 以自身的沙箱 Bash 执行器插件读取会话创建时的工作目录，用 Git 解析仓库根，每次前台或后台 Bash 都读取该仓库的账号声明，并用执行请求的 `env` 传入 `GH_CONFIG_DIR`。单次命令的 `workdir` 和 `cd` 仅决定命令在哪运行。链接 worktree 缺少声明时沿用同一仓库主工作区的声明。声明不可用或账号目录缺失时沿用继承的环境。

Station 选择 DSH 文档支持的执行器扩展方式，因为原生 Bash 的前后台执行共用该接口，业务配置可以随 Station 交付，环境只作用于对应的子进程。早期设计在 Deck 中用 `BASH_ENV` 做进程级注入，历史取舍见[原始规格](../specs/repo-git-account/spec.md)。配置与验证流程以[随包技能](../../skills/configure-gh-account/SKILL.md)为准。
