# dsh-hub-bot (hub-bot-plugin)

中枢 Bot 插件：三层负责人架构的个人 Bot 体系（规格：DSH-Workflow docs/specs/hub-bot-plugin.md；跟踪 issue #62，本包对应工单 #63）。

本目录是一个 DSH cordis bundle：

- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`；bundle 层只插入插件条目（无配置）与两个负责人 preset（`hub-bot-router` L1 路由 / `hub-bot-owner` L2 执行管理，名称与说明均标"负责人专用，不供手动选择"；文件工具只读、前台 shell 命令 5 秒转后台、job 等待 5 秒）。
- `src/index.js` 是插件入口（`name`/`inject`/`apply`）：校验 `stateDir`（必填、绝对路径，否则拒绝启动）、打开版本化 SQLite 存储（`src/store.js`，`PRAGMA user_version` 驱动迁移骨架）。
- **管理 API 默认关闭**：它能向本 profile 任意会话注入消息，与 #62 Policy 同级敏感，因此仅当配置显式给出 `devApi: { token: "..." }` 时才注册 `/hub-bot/api/*` 路由；请求须带 `x-hub-bot-token: <token>` 头（sha256 后常量时间比对，不符 401），且仍限 loopback。未配置 `devApi` 时插件正常装载、不注册任何路由。路由：`state` 健康检查、`sessions` 建会话、`inject` 经 `sessionController.prompt()` 注入既有会话、`decorate` 给会话注册 `hub_bot_ping` 工具（会话关闭经 `agent/disposed` 自动注销）、`wait` 等空闲、`transcript` 读持久 transcript。

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

# 3. 编辑 $DSH_HOME/profiles/hub-bot-dev/cordis.patch.yml（完整样本：docs/dev-profile.patch.yml）：
#    webserver 端口、LLM provider、默认 model、permission 默认 preset，以及 hub-bot 条目：
HUB_BOT_TOKEN=$(openssl rand -hex 16)   # 开发实例启动时生成随机 token
#   - id: hub-bot
#     config:
#       stateDir: $DSH_HOME/state
#       devApi: { token: $HUB_BOT_TOKEN }    # 不配 devApi 则管理面整体关闭
#    注意：profile 层同 id 条目是替换语义——stateDir 与 devApi 必须写在同一条目内，
#    拆成两个 "- id: hub-bot" 会让后一条覆盖前一条的 config。

# 4. 启动（独立端口；停止只需 Ctrl-C，用户的 DSH 不受影响）
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile hub-bot-dev --no-open

# 调用管理面：curl -H "x-hub-bot-token: $HUB_BOT_TOKEN" http://127.0.0.1:3199/hub-bot/api/state
```

生产装载（与 superagent 相同形态）：在用户自己的 profile 里 `dsh plugin --profile <name> add link:<本目录>`（或安装打包后的 tgz），在该 profile 的 `cordis.patch.yml` 里给 `hub-bot` 条目加 `config.stateDir`（生产不建议开 `devApi`），重启该 profile 生效。重启用户正在运行的 DSH 需由交付 Lead 协调时机。

## 测试

```sh
npm test    # node --test：config 校验、SQLite schema 版本化迁移、cordis.patch.yml 结构
```

patch 结构测试复用仓内先例 `scripts/test-runtime.mjs` 的解析链：`DSH_TEST_RUNTIME_ROOT` 指向一份装好依赖的 DSH 运行时（如 Station 的 Resources 目录），缺省回退仓内 `deepseek-harness/` 源码检出。两者都不可用时 patch 测试 **skip 而非 fail**（其余测试不受影响）；本仓 CI/验收用 `DSH_TEST_RUNTIME_ROOT="/Applications/Ghost DSH Station.app/Contents/Resources" npm test` 获得真实 cordis include 解析器的全量校验。

## 设计决定记录

- **两个 preset 在 cordis.patch.yml 中保持展开（各约 55 行、内容相近）**：与 superagent 先例一致——preset 是给人读的声明式配置，两份各自完整可比 YAML 锚点/生成器的间接层更易审阅；它们的分化（L1/L2 各自增删工具）预期很快发生，届时展开形式 diff 更清晰。
- **preset 措辞不宣称"完全只读"**：文件工具确为只读（write/edit 关闭），但 shell 命令在 5 秒内完成时不受 preset 拦截——preset 约束的是时延（超时转后台）与工具面，不是 shell 能力。执行纪律由系统提示词与后续 Source/Policy 层承担。
- **管理面默认关闭 + token 把守**：注入能力与 #62 Policy 同级，宁可每次开发实例生成一次性 token，不留"静态头即可注入任意会话"的本机面。

## 已知限制

- **自定义 preset 会话的工具面是独立挂载子树**（dsh-agent-preset-registry 的 mountPreset）：插件经 `agent.ctx.tools.register` 的 decorate 对**默认 preset** 会话可见并已验证，但对 hub-bot-router/owner 这类自定义 preset 会话**不进入模型工具列表**（2026-11-15 实测）。因此"L2 会话管理工具由插件按角色注入"的规格假设需调整为：把会话管理工具做成一个**静态插件放进 owner preset 的 plugins 列表**（在子树内部注册），或另寻 mount 后注入机制——交后续工单（#68 前后）定夺。
- `sessionController.prompt()` 注入的消息 source.kind 为 "user"，与人手输入不可区分；Source/Trigger 层需按 superagent AgentDelivery 模式打插件自有 source 标记（幂等 requestId 已由插件生成 hub-bot-<uuid>）。
- 插件配置校验为手写 resolveConfig，未引 schemastery——零运行时依赖的取舍；后续若接 DSH 设置 UI 再评估。
- 插件尚无 persona/系统提示词（提示词体系属后续工单），preset 仅含工具与沙箱裁剪。
