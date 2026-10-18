---
status: draft
updated: 2026-10-19
---

# 按仓库的 Git/GitHub 账号

> GitHub issue：[#38](https://github.com/Ghost233/DSH-Workflow/issues/38)

## 目标

同时访问多个仓库时，每个仓库按仓库内声明使用自己的 Git/GitHub 账号，不依赖全局登录态，也不在 harness 之间各写一套机制。设计决策与被否方案见 [ADR 0005](../../adr/0005-repo-scoped-git-account.md)。

## 已确认决策

- 覆盖四个面：提交身份、HTTPS 推认证、deck 自身 gh 出站、模型 bash 里直接敲的 git/gh。
- 真源是仓库内被 Git 忽略、可选、单行的 `.ghswitch`；有就用，没有就完全 no-op 并回落继承的全局登录态。
- 落点是派生版 deck（`matt-skills-panel-plugin/`），按 `upstream.json` 的三方合并流程维护本地差异。
- 模型 bash 面用 `BASH_ENV` 分发脚本，是当前唯一可行的透明注入机制；关闭该层只影响模型 bash，git 面与 deck 出站仍工作。
- 初始化只有 skill 一个入口；deck 不提供绑定/解绑、快照、漂移检测、检查项、面板显示、设置页、宿主记忆或模型工具。
- 改 `.ghswitch` 后 gh 立即跟随；提交身份与推认证属于仓库本地 git 配置，需重跑 skill 才更新（不注入 `GIT_AUTHOR_*`/`GIT_COMMITTER_*`，不逐 bash 同步 git 配置）。
- skill 源码随本仓库提交并随启动器打包；codex-market 中的副本保留，两边各自维护。

## 契约

### `.ghswitch`

- 仓库内可选文本文件，单行 GitHub 登录名；首尾空白忽略。
- 合法形状：1–39 位，字母数字开头和结尾，中间允许连字符（与 GitHub 登录名一致）。
- 运行时从命令当前目录向上找最近一个 `.ghswitch`；遇到自带 `.git`（文件或目录）的目录、`$HOME` 或 `/` 时停止向上。skill 只在仓库根写。
- 内容为空或形状不合法 → 视为未声明，不导出、不传 `GH_CONFIG_DIR`，回落全局。
- 文件本身被 Git 忽略；由 skill 保证 `.gitignore` 覆盖，不提交账号名。

### 账号目录

- 路径 `${XDG_CONFIG_HOME:-$HOME/.config}/gh-profiles/<登录名>`，由 skill 验证或从已有 gh 目录导入（token 只走管道，不落盘、不打印、不创建新 token、不启动浏览器授权）。
- deck 与 shim 只拼路径，不读取其中凭据；目录不存在时按未声明处理，回落全局。
- gh 与 credential helper 都通过 `GH_CONFIG_DIR` 使用该目录，两者指向同一份登录状态。

### 注入面

| 面 | 机制 | 声明缺失时 |
|---|---|---|
| 提交身份 | skill 写仓库本地 `user.name`/`user.email` | 继承全局 git 配置 |
| HTTPS 推认证 | skill 写仓库本地 credential helper，helper 字符串内嵌 `GH_CONFIG_DIR` | 继承全局 helper 与登录态 |
| deck gh 出站 | 每次调用现读 `.ghswitch`，spawn 时显式传 `env: { GH_CONFIG_DIR }` | 不传，继承宿主环境 |
| 模型 bash | `BASH_ENV` 分发脚本导出 `GH_CONFIG_DIR` | 脚本立即返回，不做任何事 |

## deck 实现

1. 新增 `src/host/ghAccount.js`：`resolveGhConfigDir(cwd)` 向上查找并校验 `.ghswitch`，返回账号目录或 `undefined`；账号目录不存在的检查也在此完成。该模块被宿主出站与 shim 生成共用。
2. 宿主 `src/host/index.js` 在 `apply` 安装分发脚本：把 shim 写到 `~/.dsh/mattskillsdeck/gh-account-env.sh`（与 `src/host/choiceStore.js` 的宿主记忆目录约定一致），把 `process.env.BASH_ENV` 指向它，原值存入非敏感变量供 shim 链式 source，用 `ctx.effect` 在 unload 时还原并清理。deck 宿主条目配置 `ghAccount: false` 时跳过安装。
3. shim 内容要求：先 source 原 `BASH_ENV`（存在且可读时），再向上查找声明；命中且账号目录存在时 `export GH_CONFIG_DIR=<目录>`；其余情况零输出零副作用；任何分支都不得让 shell 启动失败；只导出这一个变量。
4. gh 出站三处改为按调用传环境：`src/host/repoKeys.js` 的 `runGh`、`src/host/platformChannel.js` 的 `detectionExec`、github 后端 `client.js` 经 `ctx.exec` 的路径。无声明时保持现状，不构造 `env`。
5. 不新增 RPC、工具、检查项、面板视图或宿主记忆；deck 仍不修改 git 配置、不保存凭据。

## skill 实现

升级 `configure-gh-account` skill（现有源码在 codex-market 副本中，迁移到本仓库 `skills/configure-gh-account/`）：

1. 确定仓库与账号：读 `.ghswitch`（有则默认跟随）、项目约束、现有仓库本地 git 配置、Codex 的 `.codex/config.toml`；无声明时按用户明确值或项目规定选择登录名。
2. 准备账号目录：存在则用 `env -u GH_TOKEN -u GITHUB_TOKEN GH_CONFIG_DIR=<dir> gh api user --jq .login` 验证（忽略大小写）；不存在则按 skill 的 profile 参考流程从已有 gh 目录导入。
3. 身份字段：优先用户明确值或项目规定；否则在验证后的账号环境查 `gh api user` 与 `user/emails` 中已验证的主邮箱，向用户预填并允许修改；不拼造邮箱、不扩大 token 权限。
4. 写仓库本地 git 配置：`user.name`/`user.email`；对 `https://github.com` 与每个 HTTPS GitHub remote URL 写 `credential.<url>.username=<登录名>`，先 `--replace-all .helper ""` 再 `--add .helper` 写入内嵌 `GH_CONFIG_DIR` 的 helper；不改 remote 地址、不改用户级配置。
5. 写声明：`.ghswitch` 不存在则写单行登录名；存在且与目标账号不一致时询问用户，不静默覆盖。
6. 确保 `.gitignore` 忽略 `/.ghswitch`；Codex 分支再忽略 `/.codex/config.toml`。不自动提交任何更改。
7. harness 分支：`$DSH_SESSION_ID` 非空视为 DSH，不生成额外配置文件，用 `bash -c 'echo "$GH_CONFIG_DIR"'` 验证分发层；否则按 Codex 生成 `.codex/config.toml`（`[shell_environment_policy.set] GH_CONFIG_DIR`，`[shell_environment_policy.filters]` 排除 `GH_TOKEN`/`GITHUB_TOKEN`）。
8. 验证交付：`GIT_TERMINAL_PROMPT=0 git credential fill` 进程内校验且不打印凭据；核对仓库本地 git 配置与 `gh api user`；SSH remote 只报告，不迁移、不承诺认证。

## skill 分发

- 源码提交在本仓库 `skills/configure-gh-account/`，使用真实文件（project layer 打包拒绝软链）；不放 `.agents/skills`，避免在仓库内会话重复加载。
- `scripts/dsh-launch-composition.mjs` 的 `definitions` 增加一条 `@deepseek-ai/dsh-skill-filesystem` 实例：`{ id: 'dsh-workflow-gh-account', providerName: 'dsh-workflow-gh-account', includeDefaultRoots: false, customSkillDirs: [join(root, 'skills')] }`，与现有 `mattpocock-skills-zh` 同款。
- `macos-launcher/project-resources.mjs` 的 `sources()` 目录列表加入 `'skills'`，使其进入 project layer 与 `project-layer.json` 清单，随启动器应用发布。
- `scripts/matt-panel-composition.test.mjs` 增加断言，核对新 provider 行存在且目录指向 `<root>/skills`。
- 效果：经 `./start-dsh-workflow.sh` 启动的 DSH 在任意工作区都能使用该 skill；用户 home 目录零安装。改动 skill 后需重新构建启动器才在应用中生效；开发迭代可临时在 `~/.agents/skills` 放软链，发布不依赖它。
- codex-market 副本按用户决定保留，两边各自维护；升级时两边同步相同行为。

## 实施清单

1. **deck 取数模块**：新增 `src/host/ghAccount.js` 与单元测试（最近的声明、非法内容、目录不存在、在 `.git`/`$HOME`/`/` 停止、相对/带尾斜杠 cwd）。
2. **分发脚本层**：宿主加载时安装/链式承接/卸载还原 `BASH_ENV`，写 shim；测试覆盖 shim 的无声明 no-op、命中和还原；确认不含凭据。
3. **出站注入**：`runGh`、`detectionExec`、github 后端 `ctx.exec` 三处按调用传 `env`；测试用假 subprocess 捕获 spawn spec，核对无声明时不传、声明缺失目录时不传。
4. **面板回归**：`npm run build --prefix matt-skills-panel-plugin`、`npm test --prefix matt-skills-panel-plugin`、`npm run upstream:check --prefix matt-skills-panel-plugin`；确认 `vendor/dsh-mattpocock-skills-deck` 未被修改。
5. **skill 升级**：迁移并改造 `skills/configure-gh-account/`（SKILL.md、references、脚本），补齐 DSH/Codex 分支与验证步骤。
6. **分发接线**：启动组合 provider 行、project-resources 清单、组合测试断言；按现有流程构建面板与启动器（`macos-launcher/build.mjs`），需要时安装新应用。
7. **工程检查**：`node scripts/run-project-tests.mjs`、面板测试、`node agent-observation-plugin/scripts/build-client.mjs --check` 全绿；DSH 源码与第三方插件保持原样。

## 验收

1. 在 DSH-Workflow 工作区（根目录已有未跟踪且被忽略的 `.ghswitch`，内容 `Ghost233`）的模型 bash 中：`bash -c 'echo "$GH_CONFIG_DIR"'` 指向 `~/.config/gh-profiles/Ghost233`，`gh api user --jq .login` 为 `Ghost233`。
2. 在无 `.ghswitch` 的工作区：`GH_CONFIG_DIR` 为空，`gh api user` 回到全局账号（当前为 `Charlotte`）。
3. 非法声明（例如含空格或空文件）：静默回落全局，不报错、不阻塞命令。
4. 声明了账号但账号目录不存在：按未声明处理，回落全局。
5. 跑过 skill 的声明仓库：`git config --local user.name` 为该账号、`git config --local credential.https://github.com.helper` 含对应 `GH_CONFIG_DIR`；空提交 author 正确。
6. deck 自身 gh 出站（版本控制/健康检查等）在声明仓库使用声明账号，面板不新增任何账号相关界面。
7. `BASH_ENV` 链式：启动前预置用户自己的 `BASH_ENV` 脚本，声明仓库内模型 bash 仍执行用户脚本；停用 deck 或退出宿主后不再 source shim。
8. 重新构建启动器后，`project-layer.json` 包含 `skills/`；新会话在任意工作区可见该 skill。

## 边界与不做

- 仅 GitHub.com 与 HTTPS remote；SSH remote 只报告认证需单独验证；gitlab 等其它 host 不处理。
- 交互式终端（pty）不读 `BASH_ENV`，不在覆盖范围。
- 不做绑定/解绑、快照恢复、漂移检测、检查链步骤、面板显示、设置页、宿主记忆、模型工具，也不让 deck 修改任何已跟踪文件或 git 配置。
- 平台基线为 macOS ARM64 的启动器应用；DSH 上游源码与第三方插件保持原样。

## 风险与回滚

- `BASH_ENV` 是进程级设置：所有继承宿主环境的非交互 bash 都会 source；shim 必须零副作用、永不失败，且只导出 `GH_CONFIG_DIR`。关闭 deck 条目的 `ghAccount` 或不加载 deck 即回滚该层。
- 静默回落语义下，声明了但账号目录缺失会用全局账号工作；靠 `gh api user` 自检发现，不在 deck 内做检查项。
- deck 与上游保持小差异（新模块、三处调用、一个加载钩子），便于按 `upstream.json` 三方合并；若 DSH 未来提供按工作区环境变量注入，可替换分发脚本层而保留声明契约。
