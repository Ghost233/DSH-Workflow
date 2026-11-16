# DSH 平台能力事实调研：调度、审批、会话生命周期与全局事件

- 关联工单：Ghost233/DSH-Workflow#87（地图 #79「hub-bot v2 — always-on agent 演进」）
- 调研日期：2026-11-16
- 调研性质：只读本机一手源码；不修改 DSH、hub-bot 或正在运行的进程；不做设计选择。
- DSH 基线：`/Applications/Ghost DSH Station.app/Contents/Resources`，`@deepseek-ai/dsh-base` 版本为 `0.2.2-rc.3`（`DSH/node_modules/@deepseek-ai/dsh-base/package.json:1-4`）。
- hub-bot 参照基线：`a5687134e8a152386b1eb34d485e67c2038e2ca6`。
- 本报告基于 `origin/main` `82e94141faf410d2eb9c0c0a297417bb94b8d930` 创建。

## 路径缩写与判定口径

- `DSH` = `/Applications/Ghost DSH Station.app/Contents/Resources`
- `PKG` = `DSH/node_modules/@deepseek-ai`
- `HUB` = `/Volumes/外挂/Ghost233HomeRepo/DSH-Workflow.worktrees/62-hub-bot-plugin/hub-bot-plugin`
- **有**：源码中存在插件可到达的对应接口；附带条件仍明确列出。
- **部分**：只有某些子能力，或可达性受 open turn、answerer、所有权等关键条件限制。
- **无**：在本次检查的一手源码中没有对应接口。本报告没有把“未找到”扩张成对所有内部实现的绝对否定。

## 速览

| 能力 | 判定 | 事实摘要 | 核心出处 |
|---|---|---|---|
| 1. 定时 / 调度 | **有** | 有纤维绑定的 `ctx.timeout/interval/throttle/debounce`；Web bundle 另有持久化 `ctx.schedule`，支持 `after/every/cron/rrule`，但投递的是 prompt，不是任意函数回调。 | `PKG/cordis-plugin-timer/src/index.ts:3-15`；`PKG/dsh-schedule/src/types.ts:316-375,478-486` |
| 2. 审批 / 确认 | **部分** | 插件可调用 `ctx.approval.request()`，也可注册 `approval/request` answerer；但请求要求目标 Agent 有 open turn，且 UI 由 answerer 链提供，不是一个无条件的全局弹窗 API。 | `PKG/dsh-user-approval/src/index.ts:224-259`；`PKG/dsh-user-approval/src/types.ts:63-91` |
| 3. 会话生命周期 | **部分** | compaction 可观察、可触发；archive/unarchive 在 `ctx.workspaceRegistry`；但没有通用的 `sessionController.close/delete`。live Agent 的 dispose 属于创建者持有的 capability，持久化 handle 的 close 只是释放句柄。 | `PKG/dsh-compaction/src/index.ts:119-176`；`PKG/dsh-workspace/src/index.ts:411-483`；`PKG/dsh-agent/src/index.ts:146-162` |
| 4. 全局事件 | **有** | `ctx.on(name, listener, { global: true })` 可跨 scope 监听 Cordis Events；除 `agent/disposed` 外还有 Agent、Session、Workspace、API Session、工具、调度等事件。 | `PKG/dsh/docs/cordis-tutorial/04-events.zh.md:85-104`；`PKG/dsh-agent/src/runtime-types.ts:275-430`；`PKG/dsh-session/src/index.ts:48-87` |

---

## 1. 定时 / 调度：有

### 1.1 hub-bot 当前实际使用什么

- 当前插件声明的注入只有 `sessionController`、`sessionPersistence`、`webServer`，没有声明 `timer` 或 `schedule`（`HUB/src/index.js:38-40`）。
- 1 秒主 tick 是原生 `setInterval`：每轮调用 router、自动汇报、飞书 / GitHub 回复投递与 recycler sweep，并在插件 dispose 时 `clearInterval`（`HUB/src/index.js:169-190`）。
- 另有一个按 `config.github.intervalMs` 运行的 GitHub 轮询 `setInterval`，所以现状并非只有一个计时器（`HUB/src/index.js:191-203`）。

### 1.2 Cordis 进程内计时原语

`dsh-base` 明确加载 `@deepseek-ai/cordis-plugin-timer`（`PKG/dsh-base/cordis.patch.yml:24-25`）。该服务把下列方法混入 Cordis Context（`PKG/cordis-plugin-timer/src/index.ts:3-15`）：

| 原语 | 源码事实 | 出处 |
|---|---|---|
| `ctx.timeout(callback, delay)` | 一次性延迟回调；也支持 `ctx.timeout(delay)` 返回 Promise。 | `PKG/cordis-plugin-timer/src/index.ts:28-53` |
| `ctx.interval(callback, delay)` | 重复回调；也支持 async iterator 形式。 | `PKG/cordis-plugin-timer/src/index.ts:56-107` |
| `ctx.throttle(callback, delay, noTrailing?)` | 返回节流函数。 | `PKG/cordis-plugin-timer/src/index.ts:127-143` |
| `ctx.debounce(callback, delay)` | 返回防抖函数。 | `PKG/cordis-plugin-timer/src/index.ts:145-149` |
| `ctx.setTimeout/setInterval` | 分别是 `timeout/interval` 的 deprecated 别名。 | `PKG/cordis-plugin-timer/src/index.ts:18-26` |

这些计时器通过 `ctx.effect` 注册清理，随当前 fiber dispose；源码没有把它们声明为跨重启持久任务（`PKG/cordis-plugin-timer/src/index.ts:35-52,57-91,110-124`）。对**动态 Host 包**，guard 要求先声明 `inject: ['timer']` 才开放 timer helper；未声明时 `setTimeout/setInterval` 等会抛错（`PKG/dsh-cordis-host-runner/src/sandbox.ts:50-59`；`PKG/dsh-cordis-host-runner/src/guard.ts:755-778`）。这一条是动态包约束，不能反推所有传统本地插件都经过同一个 VM guard。

### 1.3 持久化调度 / cron 类能力

Web bundle 加载 `@deepseek-ai/dsh-schedule`，注释明确其职责是保存任务并把到期 occurrence 投递到目标 Session（`PKG/dsh-web-app/cordis.patch.yml:131-136`）。服务以 `ctx.schedule` 暴露（`PKG/dsh-schedule/src/index.ts:73-76`），插件可通过 Cordis 注入该服务后调用其公开管理方法：

- `create(request, actorSessionId?, signal?)` 创建任务（`PKG/dsh-schedule/src/index.ts:371-388`）。
- `edit`、`run`、`deleteInactive`、`list/view/history/deliveryLimits` 等公开管理面也存在（`PKG/dsh-schedule/src/index.ts:430-547,583-619`）。
- 当前类型化 `ScheduleTiming` 包含 `rrule`、`cron`、`every`、`after`；RFC 5545 `rrule` 使用 DTSTART + RRULE 文本（`PKG/dsh-schedule/src/types.ts:316-353`）。
- 目标可以是 `this_session`、`new_once`、`new`（`PKG/dsh-schedule/src/types.ts:353-395`）。
- 创建请求的内容是 `title`、`prompt`、`timing`、`target`；到期执行的是指令 / prompt 投递，而非序列化并调用插件函数（`PKG/dsh-schedule/src/types.ts:477-486`）。运行时还有恢复 overdue task 的路径（`PKG/dsh-schedule/src/index.ts:247-258`）。

**边界结论：**“延迟 / 周期执行进程内回调”与“持久化定时向 Session 投递 prompt”都存在；后者不是通用 cron callback registry，且 `schedule` 服务由 Web bundle 提供，其他运行 profile 是否加载需另查其 bundle。

---

## 2. 审批 / 确认：部分

### 2.1 插件能触发什么

`dsh-base` 加载 `dsh-user-approval`（`PKG/dsh-base/cordis.patch.yml:259-262`），Context 上有 `ctx.approval`（`PKG/dsh-user-approval/src/index.ts:25-28`）。公开调用形状为：

```ts
ctx.approval.request(req: ApprovalRequest): Promise<ApprovalOutcome>
```

出处：`PKG/dsh-user-approval/src/index.ts:224-259`。请求字段以 `agent`、`toolName` 为必填，另有可选 `callId`、`reason`、`displayReason`、`signal`；结果闭集为 `allowed-once / rejected / cancelled / unavailable`（`PKG/dsh-user-approval/src/types.ts:28-32,63-76`；`PKG/dsh-user-approval/src/index.ts:124-149`）。

关键限制：

- 目标 Agent 必须有 **open turn**；idle 时调用会在写入审计记录前拒绝（`PKG/dsh-user-approval/src/index.ts:224-244`）。
- `ask` 策略才进入 answerer 链；`never` 直接拒绝。没有 answerer 或 answerer 抛错时结果为 `unavailable`，即 fail closed（`PKG/dsh-user-approval/src/index.ts:58-68,246-257`）。
- 服务向 Session 写入成对的 `approval/asked` / `approval/decided` 审计事件（`PKG/dsh-user-approval/src/index.ts:246-259`；`PKG/dsh-user-approval/src/types.ts:34-58`）。

### 2.2 answerer / UI 的可达面形状

- 插件可注册 `approval/request` 监听器成为 answerer。它是 **waterfall**：返回 outcome 表示接管，调用 `next()` 表示委派给下一个 answerer（`PKG/dsh-user-approval/src/types.ts:78-91`）。
- `ApprovalService` 最终通过带 Agent scope 的 `approval/request` 发起分发（`PKG/dsh-user-approval/src/index.ts:299-329`）。需要跨 Agent 接收时可使用 Cordis 的 `{ global: true }` 语义；普通 agent-scoped listener 只收对应 Agent（同上，及 `PKG/dsh/docs/cordis-tutorial/04-events.zh.md:85-104`）。
- 本机 Web 审批 UI 是 Client 侧 answerer：`dsh-client-ui-approval` 在 `ctx.remote.$on('approval/request', ...)` 上接收请求、移除已结束请求、回答并调用 `next()`（`PKG/dsh-client-ui-approval/src/client/index.ts:37-110`）。
- 因此源码支持的是“**发起审批请求 → answerer 链 → 拥有该 Agent 的 Client/UI 回答**”，不是 `approval.showModal(...)` 这类独立 UI 方法。ApprovalRequest 的注释也明确 UI answerer 只回答它拥有的 Agent（`PKG/dsh-user-approval/src/index.ts:128-141`）。

另有独立的 `UserQuestionsService` 与 `user-questions/request` waterfall，用于结构化提问，不应与 approval 混为同一 API（`PKG/dsh-user-questions/src/index.ts:139-154`；`PKG/dsh-user-questions/src/types.ts:165-178`）。

**边界结论：**插件能进入审批服务和 answerer 体系；能否出现用户可见 UI 取决于 open turn、策略、对应 Client/answerer 是否在线。后台 idle Session 不能直接借一次 `request()` 弹出审批。

---

## 3. 会话生命周期：部分

### 3.1 compaction / checkpoint 的观察：有

两条观察通道同时存在：

1. **Cordis 全局 `session/event`**：每次有事件提交到持久化日志就发射，payload 带 `session` 与 `event`；监听器内不能嵌套写同一 Session（`PKG/dsh-session/src/index.ts:67-79`）。跨 scope 观察使用 `{ global: true }`。
2. **持久化 `SessionEventMap`**：compaction 声明了 `compaction/start`、`compaction/summary`、`compaction/end`、`compaction/prune`（`PKG/dsh-compaction/src/types.ts:17-24,25-67,68-89`）。这些可通过上述 `session/event` 观察，也可经已有历史 / transcript 读取面观察；它们本身不是同名 Cordis 全局事件。

checkpoint 不是另一套独立会话 API：compaction 用紧随 summary 的 `user/message` 替换 surface，并以 `compact-checkpoint` source 携带 compaction identity 与被替换范围（`PKG/dsh-compaction/src/index.ts:110-117`；`PKG/dsh-compaction/src/checkpoint.ts:20-34`）。

另有 Cordis waterfall `compaction/summary-error`，允许插件在摘要失败时尝试恢复；它是扩展点，不是普通完成通知（`PKG/dsh-compaction/src/index.ts:92-106`）。

### 3.2 compaction 的触发：有，但不在 SessionController 上

`dsh-base` 加载 `dsh-compaction-basic` 与人工 `/compact` 命令插件（`PKG/dsh-base/cordis.patch.yml:355-361`）。`ctx.compaction` 是实现无关的 `CompactionEngine` 服务（`PKG/dsh-compaction/src/index.ts:88-91,110-121`），公开三类入口：

| 入口 | 行为 | 出处 |
|---|---|---|
| `compactIfNeeded(agent, trigger, signal?)` | 按 `pressure` 或 `context-overflow` 策略判断是否压缩。 | `PKG/dsh-compaction/src/index.ts:124-132` |
| `compactNow(agent, sourceCommandId?, signal?)` | 无条件选择一个有用范围并压缩；可在无 open turn 时形成独立维护事务。 | `PKG/dsh-compaction/src/index.ts:133-151` |
| `compactRegion(start, end, agent, signal?)` | 压缩指定 surface 范围。 | `PKG/dsh-compaction/src/index.ts:152-158` |

`SessionController` 自身另有 `command()` 可接受 `/compact` 命令字符串，但这属于命令入口，不是专门的 compact 方法（`PKG/dsh-api-session-controller/src/index.ts:492-556`；`PKG/dsh-api-session-controller/src/commands.ts:109-123,187-198`）。

### 3.3 archive / unarchive：有，但在 WorkspaceRegistry

`SessionController` 的公开面主要是 resolve/list/search/create/fork/selectModel/prompt/wait/page/transcript/command 等，没有直接的 archive、unarchive、close 或 delete 方法（`PKG/dsh-api-session-controller/src/index.ts:271-326,411-444,492-584`）。

归档能力位于 `ctx.workspaceRegistry`：

- `archiveSession(sessionId, options?)`：要求当前非运行状态，或传 `stopActivity: true`；archive 先写入，再请求停止活动（`PKG/dsh-workspace/src/index.ts:101-113,411-465`）。
- `unarchiveSession(sessionId, options?)`：要求目标尚未激活；结果区分 `unarchived`、`already-active`、`unarchiving-active`（`PKG/dsh-workspace/src/index.ts:407-410,468-483`）。
- 对应全局通知为 `workspace/session-archived` 与 `workspace/session-unarchiving`；另有 activity/stop 事件（`PKG/dsh-workspace/src/index.ts:117-171`）。

### 3.4 “关闭”必须区分三种对象

| 对象 | 事实 | 判定与出处 |
|---|---|---|
| live Agent | `AgentHandle.dispose()` 停止 loop、等待退出、注销 Agent、从 store 移除 Session 并 unwind scope。handle 是创建 / resume 者持有的 capability；`ctx.agents.get()` 只返回 bare Agent，不给任意调用者这个 disposer。 | **有，但受所有权限制**；`PKG/dsh-agent/src/index.ts:146-162` |
| SessionPersistence handle | `SessionHandle.close()` 只释放读资源或完成 durability 后释放写所有权，幂等；它不是删除逻辑 Session 的 API。 | **有，但语义仅是句柄释放**；`PKG/dsh-session-persistence/src/handle.ts:99-116` |
| SessionController | 未见通用 close/delete 方法。 | **无（在该 controller 上）**；`PKG/dsh-api-session-controller/src/index.ts:271-584` |

因此第三项总体判为**部分**：压缩观察 / 触发与归档都存在，但“关闭任意会话”不是一个无所有权限定的 SessionController 操作。

---

## 4. 全局事件：有

### 4.1 “全局”的含义

这里的“全局”采用 Cordis 的 dispatch scope 语义：默认监听器只监听当前 context 分支，`ctx.on(name, listener, { global: true })` 则接收所有 scope 的该事件（`PKG/dsh/docs/cordis-tutorial/04-events.zh.md:85-104`）。hub-bot 已实际用这一形式监听 `agent/disposed`（`HUB/src/index.js:261-270`）。

这不是一张独立于 Cordis Events 的“全局事件表”。事件是否实际发生仍取决于对应服务 / bundle 是否加载；并且 `emit`、`serial`、`waterfall` 的监听语义不同，waterfall 监听器可能是会改变流程的 answerer / 扩展点，而不是被动通知。

### 4.2 与 always-on hub 直接相关的事件

| 领域 | 事件 | 出处 |
|---|---|---|
| Agent | `agent/created`、`agent/disposed`、`agent/status`、`agent/inbox/inserted`、`agent/inbox/claimed`、`agent/inbox/discarded`、`agent/pre-step`、`agent/request`（deprecated）、`agent/request-error`、`agent/assistant-stream`、`agent/turn-stopping`、`agent/error` | `PKG/dsh-agent/src/runtime-types.ts:275-430` |
| Session | `session/created`、`session/disposed`、`session/event`、`session/flush` | `PKG/dsh-session/src/index.ts:48-87` |
| API Session 投影 | `api-session/added`、`api-session/removed`、`api-session/status`、`api-session/activity`、`api-session/error` | `PKG/dsh-api-session-controller/src/types.ts:670-713` |
| Workspace | `workspace/session-activity`、`workspace/session-stop`、`workspace/session-archived`、`workspace/session-unarchiving` | `PKG/dsh-workspace/src/index.ts:98-171` |
| Schedule | `schedule/changed`（通知任务集变化）；`schedule/resolve-agent`（waterfall 扩展点） | `PKG/dsh-schedule/src/types.ts:629-634`；`PKG/dsh-schedule/src/index.ts:58-71` |
| Tools | `tools/pre-execute`、`tools/execute`、`tools/post-execute`、`tools/result`、`tools/change` | `PKG/dsh-tools/src/events.ts:1-56` |
| Approval / questions | `approval/request`、`user-questions/request`（均为 waterfall） | `PKG/dsh-user-approval/src/types.ts:78-91`；`PKG/dsh-user-questions/src/types.ts:165-178` |
| Compaction | `compaction/summary-error`（waterfall 恢复扩展点）；正常 start/summary/end/prune 走 `session/event` | `PKG/dsh-compaction/src/index.ts:92-106`；`PKG/dsh-compaction/src/types.ts:17-89` |
| Subagent | `subagent/provider-added`、`subagent/provider-removed`、`subagent/start`、`subagent/end` | `PKG/dsh-subagent/src/index.ts:134-166` |
| Goal / workflow | `goal/changed`、`goal/activation-changed`；`workflow/start`、`workflow/phase`、`workflow/log`、`workflow/agent-start`、`workflow/agent-end`、`workflow/end` | `PKG/dsh-goal/src/domain.ts:114`；`PKG/dsh-goal/src/types.ts:147`；`PKG/dsh-workflow/src/index.ts:35-89` |

### 4.3 其余 Host 侧声明（按包汇总）

以下清单来自本机 `@deepseek-ai/dsh-*` 包 `src` 中的 Cordis `Events` 方法声明；不含 Client 专属事件、`SessionEventMap`、Cordis `internal/*` 与无 slash 的框架自身生命周期事件。它是源码声明清单，不保证每个可选包在当前 profile 已启用。

| 包 | 其他事件 | 出处（均前缀 `PKG/`） |
|---|---|---|
| dsh-skill | `skills/change` | `dsh-skill/src/index.ts:296` |
| dsh-credentials | `credentials/reference-updated`、`credentials/record-updated` | `dsh-credentials/src/types.ts:88,100` |
| dsh-host-webserver | `webserver/index-inject` | `dsh-host-webserver/src/index.ts:44` |
| dsh-client-connection | `connection/request` | `dsh-client-connection/src/index.ts:71` |
| dsh-tool-executor-ptc | `tools/ptc-dispatch-log` | `dsh-tool-executor-ptc/src/runtime-types.ts:46` |
| dsh-working-directory | `working-directory/access` | `dsh-working-directory/src/index.ts:32` |
| dsh-fs | `fs/write-intent`、`fs/edit-intent`、`fs/delete-intent`、`fs/observed` | `dsh-fs/src/index.ts:67-93` |
| dsh-permission-presets | `permission-presets/catalog-changed` | `dsh-permission-presets/src/types.ts:48` |
| dsh-storage-domain | `domain/changed` | `dsh-storage-domain/src/events.ts:46` |
| dsh-hmr | `hmr/change`、`hmr/reload` | `dsh-hmr/src/index.ts:35-40` |
| dsh-cordis-host-runner | `cordis/request-run`、`cordis/request-run-resolved`、`cordis/dynamic-package`、`cordis/dynamic-retract`、`cordis/inspect-query`、`cordis/inspect-query-resolved` | `dsh-cordis-host-runner/src/types.ts:371-401` |
| dsh-deepseek-account | `deepseek-account/signed-out`、`deepseek-account/session-expired`、`deepseek-account/model-sign-in-required` | `dsh-deepseek-account/src/index.ts:29`；`dsh-deepseek-account/src/types.ts:106-110` |
| dsh-agent-loop | `agent-loop/config-start-failed` | `dsh-agent-loop/src/index.ts:198` |
| dsh-system-prompt | `system-prompt/assemble`、`system-prompt/change` | `dsh-system-prompt/src/index.ts:31-37` |
| dsh-app-boot | `app-boot/config-reload` | `dsh-app-boot/src/index.ts:55` |
| dsh-mcp-manager | `mcp-manager/status` | `dsh-mcp-manager/src/types.ts:46` |
| dsh-experimental-worktree | `worktree/cleanup` | `dsh-experimental-worktree/src/archive.ts:25` |
| dsh-web | `web/providers-changed` | `dsh-web/src/types.ts:21` |
| dsh-llm-pi-ai | `llm-pi-ai/request-headers` | `dsh-llm-pi-ai/src/index.ts:114` |
| dsh-session-telemetry | `session-telemetry/record` | `dsh-session-telemetry/src/index.ts:44` |
| dsh-plugin-manager | `plugin-manager/operation`、`plugin-manager/changed`、`plugin-manager/install-log`、`plugin-manager/install-state`、`plugin-manager/update-state` | `dsh-plugin-manager/src/types.ts:447-475` |
| dsh-plugin-market | `plugin-market/changed` | `dsh-plugin-market/src/types.ts:174` |
| dsh-settings | `settings/document-updated` | `dsh-settings/src/types.ts:75` |
| dsh-agent-preset-registry | `agent-preset/selected` | `dsh-agent-preset-registry/src/types.ts:66` |
| dsh-commands | `commands/change` | `dsh-commands/src/types.ts:89` |
| dsh-authorization | `authorization/settled` | `dsh-authorization/src/index.ts:57` |
| dsh-message-feedback | `feedback/committed` | `dsh-message-feedback/src/index.ts:58` |
| dsh-experimental-forge | `forge/providers-changed` | `dsh-experimental-forge/src/index.ts:29` |
| dsh-llm | `llm/stream`、`llm/adapters-updated`、`llm/models-updated` | `dsh-llm/src/index.ts:76`；`dsh-llm/src/types.ts:24-30` |

## 最终事实边界

1. **调度不是缺口**：缺的不是计时 / cron 原语，而是要区分“进程内回调”与“持久化 prompt 任务”两种语义。
2. **审批不是无条件后台弹窗**：服务和 answerer 扩展点都可到达，但 open turn 与 answerer ownership / availability 是硬约束。
3. **生命周期能力分散**：compaction 在 `ctx.compaction` + `session/event`，archive 在 `ctx.workspaceRegistry`，live 关闭在 `AgentHandle`；不能只盯着 `SessionController`。
4. **事件面远大于 agent/disposed**：尤其是 `session/event`、`api-session/*`、`workspace/*`、`schedule/changed` 与 Agent inbox/status 事件；同时必须尊重 emit/serial/waterfall 的不同语义。
