# task-1（#63）验证证据

时间：2026-11-15 04:10–04:40（Asia/Shanghai）。环境：macOS，DSH 0.2.2-rc.3（Ghost DSH Station 内嵌 node v24.12.0）。
全部验证在**独立开发实例**完成：`DSH_HOME=/tmp/dsh-hub-bot-dev`（独立于用户 ~/.dsh），profile `hub-bot-dev` 从 web 模板创建，监听 127.0.0.1:3199。**用户正在运行的 desktop profile（64764）全程未重启、未停止、未改动。**

## 1. 单测（TDD）

    $ cd hub-bot-plugin && npm test
    ℹ tests 15 / pass 15 / fail 0
    FINAL_EXIT=0

- `test/config.test.js`（6 个）：stateDir 必填/绝对路径/拒绝未知键——插件无 stateDir 拒绝启动。
- `test/store.test.js`（6 个）：SQLite 新库初始化到 SCHEMA_VERSION=1、五张表（kv/trigger/ticket/owner/outbox）、重开幂等且数据保留、拒绝比本构建更新的库、迁移骨架契约（migrations[v] 升级 v→v+1）。
- `test/patch.test.js`（3 个）：用 DSH 运行时**真实的 cordis include 解析器**（js-yaml + entryListSchema，解析 !!js）解析 cordis.patch.yml 并 applyEntryPatches——插入条目恰为 hub-bot + 两个 preset；两 preset 均只读 fs（write:false edit:false）、bash/pwsh-sandbox 5000/5000、tool-jobs 5000/5000、说明含"负责人专用，不供手动选择"，且不含 ask_user/present/schedule/goal/plan/plugin-manager/workflow/subagent/web/fs-search/todo 工具。

## 2. 装载机制实证（不重启用户 DSH 的路径）

    export DSH_HOME=/tmp/dsh-hub-bot-dev MAGPIE_GATEWAY_KEY=placeholder
    DSH="/Applications/Ghost DSH Station.app/Contents/Resources"
    node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" hub-bot-dev --from-default-profile web --dump-config >/dev/null   # EXIT=0，建 profile
    node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile hub-bot-dev add "link:$PWD/hub-bot-plugin"      # EXIT=0，link 装载且自动进 bundles
    # 写 $DSH_HOME/profiles/hub-bot-dev/cordis.patch.yml（样本：docs/dev-profile.patch.yml）
    node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile hub-bot-dev --dump-config                             # EXIT=0

`--dump-config` 组合树（/tmp/dsh-hub-bot-dev/composed.yml）包含：`hub-bot` 条目（profile 层注入 config.stateDir，行 1309）+ `hub-bot-router-preset`（order 90，行 1314）+ `hub-bot-owner-preset`（order 91，行 1383）。

结论：本地开发插件经**独立 DSH_HOME + 独立 profile + `dsh plugin add link:`** 装载——与 superagent docs/006-deployment.md 的 dedicated-profile 形态一致，但 DSH_HOME 独立使开发实例完全不触碰用户 profile 与运行中服务。生产装载同理：在目标 profile `dsh plugin add link:<本目录>`（或安装 tgz）并在其 cordis.patch.yml 给 hub-bot 条目加 config.stateDir，重启该 profile 生效；用户桌面 profile 的重启时机需 Lead 协调。

## 3. 插件装载 + SQLite 初始化（运行实例）

    $ curl -s -H 'x-hub-bot-request: 1' http://127.0.0.1:3199/hub-bot/api/state
    { "ok": true, "name": "hub-bot", "stateDir": "/tmp/dsh-hub-bot-dev/state",
      "database": "/tmp/dsh-hub-bot-dev/state/hub-bot.sqlite", "schemaVersion": 1, "declaredSchemaVersion": 1 }

`ls /tmp/dsh-hub-bot-dev/state/`：hub-bot.sqlite + -shm + -wal（WAL 已启用）。apply() 任一步抛错路由即不存在，故此响应即"装载无报错"证据。实例重启后 store 重开同一库、schemaVersion 仍为 1（重开幂等）。

## 4. 两个负责人 preset 进入注册表（运行时证据）

preset 不在注册表则 create 失败；实测成功：

    POST /hub-bot/api/sessions {"cwd":"/tmp/dsh-hub-bot-dev/scratch","agentPreset":"hub-bot-router"}
    → {"sessionId":"session-b7f1afab-fe16-4522-9654-5a4787768058","agentPreset":"hub-bot-router"}
    POST … {"agentPreset":"hub-bot-owner"}
    → {"sessionId":"session-1f0823c8-bf05-44b3-b78c-3edc905e92f6","agentPreset":"hub-bot-owner"}

preset 名称/说明（composed.yml 行 1314–1389）均含"负责人专用，不供手动选择"。

## 5. 注入链路：prompt() → transcript → 执行 → 回复

测试会话 A（默认 preset）：session-953145af-8490-4981-ab0d-7ede84166668

    POST /hub-bot/api/inject {"sessionId":"…A","text":"Reply with exactly: INJECTION-CHAIN-OK"}
    → {"accepted":true,"requestId":"hub-bot-9de876c2-577a-4f32-b66f-42a24868888c"}
    POST /hub-bot/api/wait {"sessionId":"…A","timeoutMs":100000}
    → {"reason":"idle", …assistant/message "INJECTION-CHAIN-OK"（magpie/zhipu/glm-4.5-air，turn 1，stop）}

持久 transcript（GET /hub-bot/api/transcript?sessionId=…A）记录链：user/message「Reply with exactly: INJECTION-CHAIN-OK」→ turn/start → step/start → assistant/message「INJECTION-CHAIN-OK」→ step/end → turn/end（/tmp/dsh-hub-bot-dev/transcript-a.json）。
router preset 会话 B 同样注入→回复「ROUTER-PRESET-OK」（/tmp/dsh-hub-bot-dev/wait-b.json），证明负责人 preset 会话可正常执行注入消息。

## 6. decorate 最小工具并可调用

    POST /hub-bot/api/decorate {"sessionId":"…A"}  → {"decorated":true,"tool":"hub_bot_ping"}
    POST /hub-bot/api/inject  {"sessionId":"…A","text":"Call the tool named hub_bot_ping exactly once with text hello-63, …"}

持久 transcript（/tmp/dsh-hub-bot-dev/transcript-a2.json，56 条）turn 3 step 3：

- tool/call `hub_bot_ping {"text":"hello-63"}`（callId call_ebd65141b0ab41cfb08a12fb）
- tool/result content "pong: hello-63"，isError:false
- 助手回复确认工具返回 pong: hello-63

## 7. Web 可观察性

dev 实例 Web UI（实例仍在后台运行，job bash-3980034cdb94433e）：
http://127.0.0.1:3199/?token=mEHYsLue3rWvRrcwari1F1OpwzECHYWDbUytKNmfIPY
会话 A/B/C 在会话列表可见，打开会话 A 可见上述 transcript。截图未取：验证时桌面会话锁定（cua sessionLocked=true），按约束停止 UI 操作；持久 transcript 记录作为验收证据（工单接受"截图或记录"）。

## 已知限制 / 交后续工单

- `sessionController.prompt()` 注入的消息 source.kind 为 "user"，与人手输入不可区分；Source/Trigger 层（#68 等）需按 superagent AgentDelivery 模式打插件自己的 source 标记（幂等 requestId 已由插件生成 hub-bot-<uuid>）。
- 插件配置校验为手写 resolveConfig，未引 schemastery——零运行时依赖的取舍；后续若接 DSH 设置 UI 再评估。
- dev 实例 permission 默认 danger-full-access 以便无人值守验证；生产负责人会话权限策略由后续工单定。
- 插件尚无 persona/系统提示词（提示词体系属后续工单），preset 仅含工具与沙箱裁剪。
