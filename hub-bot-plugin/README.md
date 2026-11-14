# dsh-hub-bot (hub-bot-plugin)

中枢 Bot 插件：三层负责人架构的个人 Bot 体系（规格：DSH-Workflow docs/specs/hub-bot-plugin.md；跟踪 issue #62，本包对应工单 #63）。

本目录是一个 DSH cordis bundle：

- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`；bundle 层只插入插件条目（无配置）与两个负责人 preset（`hub-bot-router` L1 路由 / `hub-bot-owner` L2 执行管理，均"负责人专用，不供手动选择"、完全只读、前台命令 5 秒转后台、job 等待 5 秒）。
- `src/index.js` 是插件入口（`name`/`inject`/`apply`）：校验 `stateDir`（必填、绝对路径，否则拒绝启动）、打开版本化 SQLite 存储（`src/store.js`，`PRAGMA user_version` 驱动迁移骨架）、注册 loopback 管理 API。
- 管理 API（`/hub-bot/api/*`，仅 loopback + `x-hub-bot-request: 1` 头）：`state` 健康检查、`sessions` 建会话、`inject` 经 `sessionController.prompt()` 注入既有会话、`decorate` 给会话注册 `hub_bot_ping` 工具、`wait` 等空闲、`transcript` 读持久 transcript。

## 开发期装载（独立 DSH_HOME，不触碰正在运行的 DSH）

DSH 从 `$DSH_HOME/profiles/<name>` 装载 profile（缺省 `DSH_HOME=~/.dsh`）。把 `DSH_HOME` 指到独立目录即可启动一个完全隔离的开发实例——与 superagent 的 "dedicated profile" 形态相同，但不占用户默认目录、不重启用户服务：

```sh
export DSH=/Applications/Ghost\ DSH\ Station.app/Contents/Resources
export DSH_HOME=/tmp/dsh-hub-bot-dev          # 任意独立目录
export MAGPIE_GATEWAY_KEY=placeholder         # 本地网关不校验，provider 只要求变量存在

# 1. 从 web 模板建 profile
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" hub-bot-dev --from-default-profile web --dump-config > /dev/null

# 2. 以 link: 装载开发中的插件（实时反映本目录改动，重启实例生效）
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile hub-bot-dev add "link:$PWD"

# 3. 编辑 $DSH_HOME/profiles/hub-bot-dev/cordis.patch.yml：webserver 端口、LLM provider、默认 model、
#    permission 默认 preset、hub-bot.stateDir（见本目录 docs/dev-profile.patch.yml 示例）

# 4. 启动（独立端口；停止只需 Ctrl-C，用户的 DSH 不受影响）
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile hub-bot-dev web
```

生产装载（与 superagent 相同形态）：在用户自己的 profile 里 `dsh plugin --profile <name> add link:<本目录>`（或安装打包后的 tgz），在该 profile 的 `cordis.patch.yml` 里给 `hub-bot` 条目加 `config.stateDir`，重启该 profile 生效。重启用户正在运行的 DSH 需由交付 Lead 协调时机。

## 测试

```sh
npm test    # node --test：config 校验、SQLite schema 版本化迁移、cordis.patch.yml 结构（用 DSH 运行时的真实 include 解析器）
```
