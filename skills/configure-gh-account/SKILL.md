---
name: configure-gh-account
description: 为仓库固定 Git/GitHub 账号：写仓库本地提交身份与 HTTPS 推认证，在仓库根写单行 .ghswitch 声明，并按 DSH 或 Codex 分支验证环境。适用于多个仓库并行使用不同 GitHub 账号、或已有声明需要重新同步时。
---

# 配置仓库 Git/GitHub 账号

本 skill 把一个仓库的 Git/GitHub 身份收敛到仓库自身：提交身份与 HTTPS 推认证写入 `.git/config`，账号声明写入仓库根被忽略的单行 `.ghswitch`，凭据复用 `${XDG_CONFIG_HOME:-$HOME/.config}/gh-profiles/<登录名>`。DSH 侧由 deck 的分发脚本在每次 shell 启动时读取声明，不生成额外配置文件；Codex 侧生成项目 `.codex/config.toml`。默认 gh 配置、Git 全局配置、remote 地址和其他仓库的选择保持不变。

## 适用范围

- 用户要求为某个仓库固定 GitHub 账号，或切换该仓库使用的账号。
- 仓库已有 `.ghswitch`，需要按声明重新同步提交身份与推认证。
- 只在 GitHub.com 与 HTTPS remote 范围内工作；SSH remote 只报告，不迁移协议；gitlab 等其他 host 与交互式终端不在覆盖范围。

## 安全基线

- 不启动交互网页登录，不创建新 token，不刷新或扩大 token 权限，不把 token 写入任何文件。
- 只在目标仓库写 `--local` 配置与工作区声明；不改 `--global`/`--system`，不改 remote URL，不自动提交。
- 导入凭据时 token 只走进程内管道；不开启 shell trace 或 `GH_DEBUG`，不打印 token、credential 输出或带凭据的 URL。
- 已有 `.ghswitch` 与目标账号不一致时必须先询问用户，不静默覆盖。
- 除账号目录外不改仓库之外的文件；账号目录只允许新增或修正目标账号自己的内容。

## 1. 确定仓库、账号与 harness

- 按用户指定路径定位仓库根；未指定时使用当前仓库。先用 `git -C <path> rev-parse --show-toplevel` 确认，只在获准的仓库工作。
- 读取项目约束（如 `AGENTS.md`、规格、README）、已有 `.ghswitch`、根 `.gitignore`、`git config --local` 与 `.codex/config.toml`。用 `git ls-files -- .ghswitch .codex/config.toml` 检查跟踪状态。
- 账号按此顺序确定：已有 `.ghswitch`（默认跟随）→ 用户明确值或项目明确规定 → 仍不明确时列出已登录账号并向用户询问一次。仓库 owner、组织名和提交邮箱不能替代登录名。
- 记录 harness：`[ -n "${DSH_SESSION_ID:-}" ]` 为真即 DSH，否则按 Codex 处理。
- 读取项目要求与现有本地 `user.name`、`user.email`，确定提交姓名和邮箱。优先使用用户明确给出的值或项目规定；已有本地值只在确认属于所选账号时复用，不照搬全局身份。
- 仍缺失时，在步骤 2 验证后的账号环境查询：`gh api --hostname github.com user --jq '[.login, .name, .email] | @tsv'`，以及 `gh api --hostname github.com user/emails --jq '.[] | select(.primary and .verified) | .email'`。只把已验证的主邮箱作为预填，交给用户确认后可改；接口无权限时不得把 `user` 的公开邮箱当成已验证值，只可作为询问候选，问用户一次后写入。不拼造邮箱，不为查询扩大 token 权限。
- 完成条件：仓库根、登录名、账号目录、提交姓名/邮箱来源、harness 都已确定。账号目录为 `${XDG_CONFIG_HOME:-$HOME/.config}/gh-profiles/<登录名>`，在写入任何配置前展开成绝对路径。

## 2. 复用或验证账号目录

已有账号目录时，在该目录环境中验证真实登录（忽略大小写比较）：

```bash
env -u GH_TOKEN -u GITHUB_TOKEN -u GH_DEBUG \
  GH_CONFIG_DIR="$profile_dir" \
  gh api --hostname github.com user --jq .login
```

匹配则复用。目录缺失或登录不符时，读取 [账号目录初始化](references/profile.md)，从该账号已有的 gh 凭据用管道导入；只允许改变目标目录内的配置，token 不落盘、不打印。缺少登录、导入失败或身份不匹配时报告原因并保留项目原配置，不启动网页登录、不创建新 token、不扩大权限。

完成条件：所选账号目录的真实 API 登录与目标账号一致；导入没有改写凭据来源目录的配置文件。读取 token 成功本身不构成身份验证。

## 3. 写入仓库本地 Git 配置与声明

姓名、邮箱确定且账号验证通过后，运行本 skill 的 [本地配置脚本](scripts/configure_local_git.py)。把 `SKILL_ROOT` 设为本 skill 所在目录，其他变量使用前面确定的真实值；Codex 分支额外带上 `--ignore '/.codex/config.toml'`，DSH 分支不带：

```bash
python3 "$SKILL_ROOT/scripts/configure_local_git.py" \
  --project "$project_root" --account "$profile_account" \
  --profile "$profile_dir" --name "$git_name" --email "$git_email" \
  --write-gitignore
```

脚本行为：

- 校验仓库根、登录名形状、账号目录存在且目录名与登录名一致；声明冲突或已被 Git 跟踪时停止，不做任何写入。
- 扫描所有 remote 的 fetch 与 push URL（`--all`、`--push --all`），只处理 HTTPS `github.com`；拒绝 URL 内嵌凭据或用户名与账号不一致，不改 remote 地址。
- 写 `--local user.name`/`user.email`；对 `https://github.com` 和每个 HTTPS GitHub remote URL 写 `credential.<url>.username`，先用 `--replace-all .helper ""` 清空继承的 helper，再 `--add` 内嵌 `GH_CONFIG_DIR` 与 gh 绝对路径的 `gh auth git-credential`。重复执行不累积 helper。
- 写仓库根的单行 `.ghswitch`；`--write-gitignore` 确保 `.gitignore` 含 `/.ghswitch`，以及 `--ignore` 指定的额外规则。
- SSH remote 只打印“认证仍需单独验证”，不自动迁移；失败以非 0 退出并输出中文原因。
- 不修改用户级/全局配置，不打印任何 token。

完成条件：命令成功退出；后文第 4、6 步的核对通过。声明已存在且与目标账号不一致时，先询问用户，确认后才加 `--replace-declaration` 重跑；不得静默覆盖。

## 4. 核对声明与忽略规则

```bash
cat "$project_root/.ghswitch"                    # 必须只有一行登录名
git -C "$project_root" check-ignore -v -- .ghswitch
git -C "$project_root" ls-files -- .ghswitch     # 必须为空
```

- `.ghswitch` 内容与目标账号一致；文件被忽略且未被跟踪。
- 若文件已被 Git 跟踪，脚本会拒绝执行；向用户说明后，经明确授权才执行 `git rm --cached -- .ghswitch`（保留磁盘文件）并重跑。只添加忽略规则不能改变已跟踪状态。
- 不提交 `.ghswitch`，也不在本步骤自动提交任何更改。

完成条件：声明单行、内容正确、已被忽略且未被跟踪；未解决时明确报告剩余事项。

## 5. harness 分支

### DSH（`DSH_SESSION_ID` 非空）

不生成任何额外配置文件，也不为本分支追加 `.codex/config.toml` 忽略项。在仓库目录下验证分发层：

```bash
cd "$project_root" && bash -c 'echo "${GH_CONFIG_DIR:-}"'
```

输出应等于账号目录。为空说明宿主 deck 的 `BASH_ENV` 注入未启用或未重启（旧版 deck、未加载 `ghAccount`、当前会话早于安装），这是预期状态，不代表需要手写配置文件：提示用户重启 DSH 或确认 deck 条目启用后重试。不要为此创建 `.codex/config.toml`、shell 启动文件或其他配置。直接账号验证仍使用第 2 步命令。

### Codex（`DSH_SESSION_ID` 为空）

合并项目根 `.codex/config.toml`，路径写真实绝对路径，禁止写入 `~`、`$HOME` 或占位符：

```toml
[shell_environment_policy.set]
GH_CONFIG_DIR = "/absolute/account/config/directory"

[shell_environment_policy.filters]
GH_TOKEN = "exclude"
GITHUB_TOKEN = "exclude"
```

- 用 TOML 解析并保留注释的局部编辑；同名表只保留一份，修改前后都必须可解析。文件不存在时创建。
- 沿用文件已有的环境过滤表示。已有旧式 `exclude` / `include_only` 数组时，把两个 token 变量追加进 `exclude` 并保留原数组；同一配置层不混用旧式数组与 `filters` 表。
- 存在 include 白名单时，把 `GH_CONFIG_DIR` 纳入白名单并保留其他条目；过滤键按大小写不敏感去重。
- 显式 `set` 在排除之后生效。检查项目层与继承层是否设置这两个 token；有覆盖时在项目 `set` 中把对应值设为空字符串，避免继承凭据恢复。其他环境变量保持原值。
- 项目层已有无效 TOML、互斥过滤配置或受管理策略限制时，先报告具体问题，只修复本次账号配置所需部分，不重写整个文件。
- 确认 `.gitignore` 含精确规则 `/.codex/config.toml`（第 3 步的 `--ignore` 已完成时复用），不要扩大为忽略整个 `.codex/`。用 `git check-ignore -q -- .codex/config.toml` 与 `git ls-files -- .codex/config.toml` 核对；已跟踪时说明忽略规则对已跟踪文件无效，经用户明确授权才执行 `git rm --cached -- .codex/config.toml` 并保留磁盘文件。
- 配置只影响之后启动的 Codex 命令与会话，不改变当前已加载环境；提示用户新开会话用 `printenv GH_CONFIG_DIR` 与第 2 步 API 命令确认。

完成条件：Codex 配置选择目标账号目录、排除 token 覆盖、被忽略且未被跟踪；原有配置保留。DSH 分支不产生任何配置文件。

## 6. 验证交付

```bash
# 仓库本地身份
git -C "$project_root" config --local --get user.name
git -C "$project_root" config --local --get user.email
git -C "$project_root" var GIT_AUTHOR_IDENT

# 凭据绑定（helper 应含 GH_CONFIG_DIR=<账号目录> 与 gh 绝对路径）
git -C "$project_root" config --local --get 'credential.https://github.com.username'
git -C "$project_root" config --local --get-all 'credential.https://github.com.helper' | grep '^!env'

# 进程内校验：只输出 username，丢弃其余输出
printf 'protocol=https\nhost=github.com\n\n' |
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0 \
  git -C "$project_root" credential fill 2>/dev/null |
  sed -n 's/^username=//p'
```

- `credential.helper` 会先保留一条空的清空项，再是实际的 `!env ...` helper；用 `grep '^!env'` 只看实际命令，直接 `--get-all` 看到的空行是预期的重置项。
- 校验时隔离全局与系统 Git 配置，确保凭据确实由仓库本地 helper 提供，而不是继承的 keychain 或其他 helper。
- `credential fill` 只在进程内解析 `username`，不得把完整输出、密码或 token 打印到对话或日志；返回 `username` 等于账号即说明 helper 生效。失败时可去掉 `2>/dev/null` 排查，但仍不要贴出完整结果。
- 有多个 HTTPS GitHub remote 时，逐个用 `git -C "$project_root" config --local --get-regexp '^credential\.'` 核对 helper 与 username，不只看 `https://github.com` 通用条目。
- 用 `git var GIT_AUTHOR_IDENT` 核对有效提交身份；环境变量或 worktree 配置有覆盖时报告具体来源，不声称已经生效。需要提交级证据时，只有在用户同意后才在临时分支做一次空提交，用 `git show -s --format='%an <%ae>'` 核对，不要在共享分支制造空提交。
- 再次在账号目录环境执行第 2 步 `gh api ... user --jq .login`，与实际 Git 身份交叉核对。
- SSH remote 只报告“认证仍需单独验证”，不承诺、不迁移、不创建 key。其他 host 同样只报告。
- 多仓库请求分别验证各自目录与实际登录，默认 gh 配置保持不变。

交付时汇总：仓库根、GitHub 登录名、账号目录、仓库本地姓名/邮箱、`.ghswitch` 内容、`.gitignore` 规则与实际跟踪状态、harness 分支及生效情况、凭据校验结果，以及仍未验证的部分（SSH、重启后生效等）。

官方依据：[gh 环境变量](https://cli.github.com/manual/gh_help_environment)、[gh auth token](https://cli.github.com/manual/gh_auth_token)、[gh auth login](https://cli.github.com/manual/gh_auth_login)、[Git 凭据匹配与 helper](https://git-scm.com/docs/gitcredentials)、[Codex shell 环境策略](https://learn.chatgpt.com/docs/config-file/config-advanced)。
