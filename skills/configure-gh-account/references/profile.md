# 账号目录初始化

仅在目标账号目录缺少所选登录、或其中的实际登录与目标账号不符时读取本文件。导入与 harness 无关：DSH 与 Codex 都使用同一个账号目录，导入过程不写仓库配置，也不生成 `.codex/config.toml`。

先确定三个值：

- `profile_account`：GitHub 登录名。
- `profile_source_dir`：保存该账号现有登录的 gh 配置目录。优先使用用户提供的目录或当前 `GH_CONFIG_DIR`；未提供时检查 gh 默认目录 `${XDG_CONFIG_HOME:-$HOME/.config}/gh`。
- `profile_dir`：目标账号目录 `${XDG_CONFIG_HOME:-$HOME/.config}/gh-profiles/<登录名>`。

目录名不是登录证据；目标目录验证通过后才能绑定仓库。凭据只从已存在于来源目录的登录导入，不启动网页授权、不创建新 token、不刷新权限、不撤销来源目录的登录。

## 1. 检查来源与目标

- 将来源与目标目录都规范化为真实绝对路径；两者相同时不能“导入到自己”。若同一目录里保存了该账号、只是当前活动账号不同，只在目标目录内执行 `gh auth switch --hostname github.com --user <登录名>` 后重新验证；该目录没有这个账号时，再从其他已有登录目录获取凭据。
- 记录来源目录中 `hosts.yml`、`config.yml` 是否存在及其摘要，供操作后核对；不读取、不输出文件内容。
- 确认来源目录确实保存所选账号的登录。用隐藏 token 的输出检查，例如 `gh auth status`，不要打印 token。

## 2. 管道导入

在同一次 Bash 调用中设置上面三个已确定的变量，再执行以下流程。token 只保存在进程内，通过标准输入导入；命令文本、输出和项目文件中都不写 token。关闭 shell trace，不要设置 `GH_DEBUG`。

```bash
(
  set +x
  : "${profile_account:?}" "${profile_source_dir:?}" "${profile_dir:?}"
  [ "$profile_source_dir" != "$profile_dir" ] || exit 1

  profile_token=$(env -u GH_TOKEN -u GITHUB_TOKEN -u GH_DEBUG \
    GH_CONFIG_DIR="$profile_source_dir" \
    gh auth token --hostname github.com --user "$profile_account") || exit 1
  [ -n "$profile_token" ] || exit 1

  mkdir -p "$profile_dir" || exit 1
  chmod 700 "$profile_dir" || exit 1

  printf '%s\n' "$profile_token" |
    env -u GH_TOKEN -u GITHUB_TOKEN -u GH_DEBUG \
      GH_CONFIG_DIR="$profile_dir" \
      gh auth login --hostname github.com --git-protocol https --with-token || exit 1
  unset profile_token
)
```

`gh auth login --with-token` 是非交互命令，不弹出浏览器。若来源目录没有该账号的 token、`gh auth token` 返回空或导入失败，停止并报告失败步骤；不要改用新 token、网页登录或全局账号切换绕过。

## 3. 验证目标目录

```bash
env -u GH_TOKEN -u GITHUB_TOKEN -u GH_DEBUG \
  GH_CONFIG_DIR="$profile_dir" \
  gh api --hostname github.com user --jq .login
```

只有实际登录与 `profile_account` 匹配（忽略大小写）、来源配置摘要仍一致时，才能继续写仓库配置。返回其他账号时按身份不匹配报告，不写 Git 配置。

## 4. 失败与清理

- 导入失败时保留已发生的实际结果，报告失败步骤、目标目录路径和验证结果；不复制来源目录的 token 文件，不用 `cp` 搬运凭据。
- gh 若采用文件存储，凭据文件留在用户级账号目录，不复制到仓库。
- 完成后只报告账号目录路径与验证到的登录名，不报告 token、摘要原文或凭据内容。

依据：[gh auth token](https://cli.github.com/manual/gh_auth_token)、[gh auth login](https://cli.github.com/manual/gh_auth_login)、[gh 环境变量](https://cli.github.com/manual/gh_help_environment)。
