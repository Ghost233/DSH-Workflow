# task-11 实证：Web 面板三问与设置页（#73）

> 活实例：DSH_HOME=/tmp/dsh-hub-bot-dev，profile hub-bot-dev，端口 3199，devApi token 见 profile。
> 本文全部为真实 HTTP 往返与 SQLite 票面读取，非单测复述。

## 1. 面板静态服务与 token 门禁

| 请求 | 结果 |
| --- | --- |
| GET /hub-bot/panel | 200 text/html（无 token 可达——静态壳无数据） |
| GET /hub-bot/panel/app.js | 200 text/javascript |
| GET /hub-bot/panel/style.css | 200 text/css |
| GET /hub-bot/panel/../src/index.js | 404（仅白名单四件） |
| GET /hub-bot/api/overview 无 token | 401 |
| GET /hub-bot/api/overview 错 token | 401 |
| GET /hub-bot/api/settings 无 token | 401 |

## 2. 三问真实数据（dev 库既有票面）

- GET /overview：owners 7、**tickets 37**（阶段分布横跨 等您验收/进行中/被卡住/已完成），每票带 `stageText` 票面朗读、`authorization`（actor/source/at）、`trigger` 引用、`assignments` 时间线、`ownerLabel`（workspace ?? id）。
- 样张：tsk-b2419219 等您验收，trigger 原文「重建验证：这是注入失败后的自动重建…」，authorization 在票面。
- 健康快照：outbox {queued:0, failed:4, retrying:0, systemProblems:5}（task-8 期间真实残留；面板健康条仅在非零时显示——安静默认）。
- 等您验收票带 `dirListing`（负责人目录清单，已回收负责人跳过，单测覆盖）。

## 3. 设置写回：即时生效 + 0600 持久化 + 重启回放

- POST /settings {concurrency:{slotsPerOwner:2}, github:{repos:{Ghost233/DSH-Workflow:false}}, reporting:{auto:false}}
  → 响应即新视图：slots=2、repo.enabled=false、auto=false。
- **即时生效（活 config 读者同步）**：POST /deliver → `autoReport: {"skipped":"disabled"}`；POST /github/poll → `{"triggered":0,...}`（仓库已停用，不再轮询）。
- **落盘**：state/hub-bot.settings.json 0600，三键齐备；随后非法补丁（见 §4）后文件原样未动。
- **重启回放**：kill+重启实例后 GET /settings → slots=2 / repo=false / auto=false（profile 原值 3/true/true——overlay 覆盖生效，profile 文件未动）。
- 实证后已恢复 profile 等价值（slots=3 / repo=true / auto=true），overlay 文件保留为幂等副本。

## 4. 校验拒绝（HTTP 面）

| 补丁 | 结果 |
| --- | --- |
| {concurrency:{slotsPerOwner:0}} | 400 slotsPerOwner must be an integer >= 1 |
| {telemetry:{on:true}} | 400 unknown settings section "telemetry" |
| {github:{intervalMs:1000}} | 400 github.intervalMs must be an integer >= 30000（认证限额） |

（单测另覆盖：未知键 typo、allowlist 非字符串数组、repos 未知仓库名。）

## 5. 确认裁决（面板按钮 → 真状态机）

- **confirm**：scratch 负责人 + route 真票（等 L2 完成首回合后）票面合成 person/confirm + fork action【合成探针】→ POST /tickets/resolve {resolution:'confirm'}
  → 回执 `{confirmed:true, stage:'working', fork:{fromSessionId: session-b51c3fca…, sessionId: session-4fcfb5c5…}}`；
  票面 stage=working、mechanism=fork、workerSession 重绑 fork 新会话、`confirmOutcome={kind:'confirmed', by:'user', result.fork{…}}`；
  唤醒注入行 1 条 sent（「用户已确认 fork：原会话 … → 新会话 …」携授权记录）。
- **reject**：同法合成票 → `{rejected:true, stage:'blocked'}`；票面 confirmOutcome={kind:'rejected', reason:'面板拒绝：不需要 fork', by:'user'}，保持原会话。
- **错误面**：未知票 404；非法 resolution 400；无已完成回合时 fork 失败 400 fork-failed 且票留 person/confirm（可重试/拒绝/取消，机制注释承诺的行为）。
- 清理：探针票 B 已 cancel→done；探针票 D 经 L2 审理 escalate→blocked 留存（合成票无真实交付物，同 task-7 先例）。

## 6. 测试与双模式

- 新增 test/panel.test.js 9 例（settings 白名单应用/拒绝/校验、overlay 0600 round-trip/缺坏读空/合并累积/boot 回放、overview 三问、recycled 跳过目录、settings view 合并）。
- 全量：node --test test/*.test.js → 156 pass / 4 skip / 0 fail。
- 双模式：plain `npm test` EXIT=0（156 pass / 4 skip）；runtime（DSH_TEST_RUNTIME_ROOT=Station Resources）EXIT=0（160 pass / 0 skip——集成用例全跑）。

## 边界与说明

- 面板视觉未做浏览器截图实证（impl 代理不触碰用户桌面）；可渲染性由静态资源 200 + overview/settings 真实 JSON 证明。模型视觉验收留给 #74 整体验收。
- 验收动作（resolution:'accept'）面板暂不提供，等您验收票的裁决仍在 L1 聊天完成（spec 原则：破坏性动作需确认；面板本期只做确认/拒绝）。
- 「等待模型恢复的会话」当前以 outbox retrying 行呈现；运行时级 waitingModel 信号待后续接入。
