# Tobs 开发协作插件的运行时接口

## 核验范围

本文供实现独立协作插件时查阅。只核实接口形状和调用限制，没有运行 Tobs，也没有修改应用代码、插件清单、锁文件或第三方源码。

Tobs 接口以真实发布包 `@botharness/core@1.6.1` 为准。公开声明位于 `dist/index.d.mts`，实现位于 `dist/index.mjs`。发布包缓存为 `/private/tmp/tobs-ingress-audit/package-metadata/`。不要把当前主干新增能力写成这个版本已有的接口。[Tobs 发布包元数据](https://registry.npmjs.org/@botharness%2fcore/1.6.1)

前 6 节保留稳定版基线。2026 年 11 月 11 日的实现复核采用官方固定提交 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab` 的本地构建，结论见第 7 节。固定提交已放开部分外部派工入口，不能与稳定版限制混用。

DSH 接口以本机已安装的 `0.2.2-rc.1` SDK 为准。核验根目录为 `/Volumes/外挂/Ghost233Code/DSH-Workflow/.build/Ghost DSH Station-0.6.5-dsh0.2.2-rc.1-arm64.app/Contents/Resources/node_modules/`。其中 `dsh-tools`、`dsh-agent`、`dsh-session` 和 `dsh-workspace` 的实际 `package.json` 均为 `0.2.2-rc.1`。`macos-launcher/node_modules` 仍有 `0.2.1-alpha.1`，不作为本次 SDK 依据。

以下代码块是调用形状示例。它们没有作为应用代码写入或执行。

## 1. 注册 Agent 局部工具

`core.contributeBotAgentSetup(callback)` 接收同步回调，返回取消贡献的函数。回调参数为 `agentCtx`、真实 `Agent` 和 `{ botSlug, rootRole }`。`rootRole` 只有 `orchestrator` 和 `assignment`。这个回调没有返回工具清理函数的约定。插件需要保留每次 `tools.register` 返回的 disposer，并在自身卸载时清理。[发布声明：BotHarnessCore](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L14812)

```ts
const removeTools = new Set<() => void>();
const removeSetup = core.contributeBotAgentSetup((agentCtx, agent, info) => {
  const remove = agentCtx.tools.register(defineTool({
    name: 'project_task_report',
    description: 'Submit a report for an assigned development task.',
    parameters: {
      task_id: { type: 'string', required: true },
      state: { type: 'string', required: true },
      summary: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (exec.agent?.session.id !== agent.session.id) {
        throw new Error('Calling Agent does not match this tool scope');
      }
      const owner = core.ownership.resolve(agent.session.id);
      if (!owner || owner.botSlug !== info.botSlug || owner.rootRole !== info.rootRole) {
        throw new Error('Bot ownership changed or is unavailable');
      }
      // Validate task ownership and write the plugin's report record here.
      return JSON.stringify({ accepted: true });
    },
  }));
  removeTools.add(remove);
});

ctx.effect(() => () => {
  removeSetup();
  for (const remove of removeTools) remove();
  removeTools.clear();
});
```

`defineTool` 从 `@deepseek-ai/dsh-tools` 导入。`parameters` 是字段表，不是完整的 JSON Schema 根对象。必填写在每个字段的 `required: true` 上。嵌套或输出对象需明确 `additionalProperties`。`output.schema` 和纯函数 `output.render` 都是必需项。返回值必须匹配声明的输出类型。[DSH 工具声明](https://unpkg.com/@deepseek-ai/dsh-tools@0.2.2-rc.1/lib/types/schema.d.ts)

`ToolRunContext` 提供 `callId`、`rootCallId`、`name`、`arguments`、`agent?`、`toolSet?`、`parent?`、`signal`、执行器生成的 `token`，以及 `deferContext` 和 `concludeTurn`。Token 是执行器身份，插件不能自行伪造。异步工作必须传递或遵守 `exec.signal`。[DSH 执行上下文](https://unpkg.com/@deepseek-ai/dsh-tools@0.2.2-rc.1/lib/types/contracts.d.ts)

局部注册只影响对应 Agent。插件还应在自己的工具执行入口检查任务所属 Bot、角色、授权范围和当前派工版本。工具参数中的 `botSlug`、`sessionId` 或父任务 ID 不构成调用者身份。

## 2. Bot 唤醒与定时任务

发布声明中的方法为：

```ts
core.schedules.list(botSlug);
core.schedules.create(botSlug, input, creator);
core.schedules.update(botSlug, scheduleId, change, actor);
core.schedules.remove(botSlug, scheduleId, actor);
core.schedules.runNow(botSlug, scheduleId);
core.schedules.history(botSlug, scheduleId);
```

`creator` 和 `actor` 均为 `human | personabot`。`input` 包含 `title`、`prompt`、`trigger`，可选 `enabled` 和 `locked`。`trigger` 支持以下形状：[发布声明：Schedules](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L12930)

```ts
{ kind: 'every', everySeconds: 60 }
{ kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }
{ kind: 'weekly', time: '09:00', timeZone: 'Asia/Shanghai', weekdays: [1] }
{ kind: 'once', date: '2026-11-11', time: '09:00', timeZone: 'Asia/Shanghai' }
{ kind: 'cron', expression: '0 9 * * 1', timeZone: 'Asia/Shanghai' }
```

自动创建的协调唤醒可使用 `creator: 'personabot'`。此时应完全省略 `locked`；即使显式传 `false`，发布实现也会拒绝。周期最短 60 秒；每个 Bot 最多同时启用 20 个定时任务。`title` 最多 120 个字符，`prompt` 最多 4,000 个字符。创建定时任务不会立即执行负责人工作。[定时任务实现](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L69114)

```ts
const schedule = core.schedules.create(botSlug, {
  title: 'Check assigned development work',
  prompt: 'Use the project task tool to check pending work for this Bot.',
  trigger: { kind: 'every', everySeconds: 60 },
  enabled: false,
}, 'personabot');
const firing = core.schedules.runNow(botSlug, schedule.id);
```

这个形状可用于受控唤醒：先保存插件队列中的实际事件，再触发负责人读取队列。`runNow` 返回 `BotScheduleFiring`，字段为 `id`、`scheduleId`、`trigger`、`occurrenceAt`、`firedAt`、`state`，可选 `sourceEventId` 和 `sessionId`。暂停或不可用的 Bot 会拒绝 `runNow`。`runNow` 不要求定时任务处于 enabled 状态。[立即触发实现](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L69178)

同一定时任务已有未观察 firing 时，Host 会合并唤醒，不保证每次调用产生一个独立负责人轮次。插件必须保留自己的事件队列和消费位置。`runNow` 在原生记录中标记为 `manual`；这个标记和提示词中的人类措辞都不能用作 Human 授权凭证。真实发起者、GitHub delivery 和任务权限由插件登记。

## 3. 真实 Human DM 的来源核验

`core.attention.list({ botSlug, limit?, cursor?, state? })` 返回 `{ items, nextCursor? }`。`limit` 为 1 到 100，默认 30。游标是已有 Source Event ID，不是数字偏移。查询不会自动产生人类授权。[发布声明：Attention](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L12324)

每项可用的证据字段包括：`id`、`botSlug`、`reason`、`state`、`createdAt`、`sourceKind`、`sourceChannelId?`、`sourceMessageId?`、`sourceAvailable`、`authorKind`、`authorBotSlug?`。`summary` 仅保留前 240 个字符，不能据此判断完整授权文字。[Attention 查询实现](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L128447)

核验管理指令时，插件需要逐页寻找明确指定的 Source Event，再核对：

1. 当前工具提交者确实是目标 Bot 的 Orchestrator。
2. Attention 项属于同一个 Bot，来源可用，`sourceKind` 为 `human-message`，`authorKind` 为 `human`，且是 Human DM 的接收原因。
3. `core.channels.get(sourceChannelId)` 返回当前有效的 `dm`，`channel.botSlug` 等于目标 Bot，并且没有 `remoteBot`。
4. `core.channels.message(channelId, sourceMessageId)` 返回真实消息，`message.author.kind` 为 `human`，ID 与来源一致。
5. 阅读完整 `message.body`，按插件保存的授权范围核验动作、仓库和配置。保留决定与来源的关联。

```ts
const channel = core.channels.get(item.sourceChannelId!);
const message = core.channels.message(channel.id, item.sourceMessageId!);
```

以上只是来源核验的调用形状，省略的空值和范围判断必须在实现中保留。`channels.get`、`channels.message` 均为同步查询。`ChannelMessageAuthor` 分为 `human`、`bot`、`remote-bot`、`bridged` 和 `system`。`channels.getOrCreateDm` 只创建会话容器，不构成人类同意。[ChannelStore 与作者类型](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L3476)

旧 Human 消息也不能自动授权任何新动作。插件需要把接受的来源绑定到具体授权记录，禁止把一条无关历史 DM 当作持续扩权凭证。

## 4. Assignment、会话身份与报告绑定

```ts
const assignments = core.runtime.listAssignments(botSlug);
const assignment = core.runtime.getAssignment(botSlug, sessionId);
const owner = core.ownership.resolve(sessionId);
```

`listAssignments` 返回真实持久记录，包括 `sessionId`、`continuityKey?`、`permission?`、`activity`、`latestReport?`、`openAsk?`、`createdAt` 和 `updatedAt`。`getAssignment` 额外返回 `botSlug` 和原始 `sourceEventId`，按 Bot 和 Session 同时查询。`ownership.resolve` 返回 `sessionId`、`botSlug`、`rootRole`、`provenance`、`parentSessionId`、`cwdReference` 和 `createdAt`。[发布声明：Runtime](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L13540)、[发布声明：Ownership](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L3612)

工具闭包中的 `agent.session.id` 和 hook 的 `info` 是 Host 提供的身份。DSH 还提供 `agent.id`、`agent.status`、`agent.ctx` 和 `agent.session.header`。Header 的 `parentSession` 是会话派生关系，不能充当业务任务的上下级关系。[DSH Agent](https://unpkg.com/@deepseek-ai/dsh-agent@0.2.2-rc.1/lib/types/runtime-types.d.ts)

插件应先保存 `dispatchId`、预期 Bot、Grant 和 worktree，再让负责人派工。绑定时读取原生 Assignment，核对来源、所属 Bot、Continuity Key、Grant、路径和状态。v1.6.1 在恢复未完成执行时会把 Assignment 标为 error，并清除 Continuity Key，因此插件必须持久保存 Session ID，不能只靠 Key 恢复。[稳定版恢复实现](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/bot-runtime.ts#L5574)

原生报告只承载 `state`、`summary` 和可选 `expectsReply`。状态为 `progress`、`completed`、`blocked`、`waiting-human` 和 `failed`。插件自己的验收报告应另有结构化工具，按真实调用者和派工版本检查。原生 completed 不等于 PR 已合并或父任务通过验收。

报告来源可以由 Attention 项的 `assignmentSessionId`、`assignmentReportState` 和 `id` 绑定。读取全文可使用已允许的只读 direct 工具：

```ts
const response = await core.runtime.runDirectBotTool!(
  botSlug,
  'inspect_assignment',
  { session_id: sessionId, report_offset: 0 },
  signal,
);
```

返回 `response.result` 内的 `reportPage.reportSourceEventId` 后，续页传入 `report_source_event_id` 和 `report_offset`。新报告不会改变已经选定的报告。原生分页依赖 Session Query 和 Spill；内容清除、缺失或不匹配会拒绝。[报告读取与分页](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1461)

可以在 Agent 局部监听 DSH 的 `tools/result`，捕获 `create_assignment` 的真实最终结果。回调参数是冻结的 `exec` 和 `result`，`result.isError === false` 时才有 canonical `value`。Tobs 创建工具的 value 是 JSON 字符串，需要解析后再用 `getAssignment` 核对。监听器是同步观察接口，不能把返回的 Promise 当成 Host 已等待的事务。插件写入失败后应依靠原生查询修复关联。[DSH 最终工具结果事件](https://unpkg.com/@deepseek-ai/dsh-tools@0.2.2-rc.1/lib/types/events.d.ts)

## 5. 创建 Bot、模型计划、暂停与工作区

Bot 创建服务和底层 Registry 的返回值不同。`core.creations.create(input, operationKey?)` 成功时直接返回 `{ record, channelId, receipt? }`，失败时抛错。`core.registry.create` 返回 `{ ok: true, record } | { ok: false, reason, detail? }`。协作插件应使用带 operation key 的创建服务，保留恢复回执。[发布声明：Creation](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L11585)

```ts
const input = {
  displayName: 'Repository maintainer',
  description: 'Owns development requests for the configured repository.',
  persona: 'Repository-specific standing instructions.',
  coreMemory: 'Long-lived project context.',
  roles: ['repository-maintainer'],
};
const prior = core.creations.lookup(operationKey, input);
const result = core.creations.create(input, operationKey);
```

`BotCreationInput` 是去掉 slug 的 `CreatePersonaBotInput`。slug 由服务生成。`lookup` 返回 `operationKey`、`botSlug`、`status: reserved | created` 和可选 `channelId`。相同 key 使用不同输入会拒绝。带 key 创建时不能指定 `memoryDir` 或 `memoryLocation`。原身份暂停或删除后，旧 key 不能用来重新创建另一个身份。[创建幂等实现](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L11127)

新 Bot 不会从上级自动继承模型计划或 Grant。可查询 `core.registry.get(slug)`，再使用 `applyModelPreset(slug, preset)` 或 `setModelPlan(slug, routes, expectedRevision)`。后者的 routes 为 `{ orchestrator, assignmentDefault, assignmentModels }`；路由为 `{ provider, model, reasoningEffort? }`。Assignment 备选项为 `{ provider, model, allowedEfforts, defaultEffort, note? }`。[发布声明：Registry](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L9505)

`setModelPlan` 的 expectedRevision 应读取 `record.modelPlan?.revision ?? record.modelPlanRevision ?? 0`，冲突返回 `ok: false`。直接调用 Registry 不代替模型目录和用户允许模型集合的核验。优先复用已保存、已允许的 Model Preset。[模型计划实现](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L40510)

`core.registry.setPaused(slug, true)` 保存暂停状态，不等于已经停止其活跃执行。需要停止时，应调用 runtime 的停止接口并核对结果。Tob 是受保护身份，不能归档。插件自己的总负责人应使用独立普通 Bot。[暂停实现](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L40242)

执行目录先由插件准备，再调用 DSH `workspaceRegistry.create(path, title?)`。这是现有目录注册 API，不安装依赖、不执行 Git，也不创建 worktree。`get(id)` 和 `list()` 提供注册事实。Grant 创建形状如下：[DSH Workspace 公开声明](https://unpkg.com/@deepseek-ai/dsh-workspace@0.2.2-rc.1/lib/types/index.d.ts)

```ts
const workspace = await ctx.workspaceRegistry.create(worktreePath, title);
const grant = await core.grants.create(botSlug, workspace.id, {
  validate() {
    // Recheck the plugin's preauthorization and the canonical worktree path.
  },
  onCreated() {
    // Record that this plugin created the grant.
  },
});
core.grants.requireActive(botSlug, grant.id);
core.grants.setOrchestratorWrite(botSlug, grant.id, true);
core.grants.revoke(botSlug, grant.id);
```

`setOrchestratorWrite` 只在确实需要负责人直接写目录时启用。Assignment 使用 Grant 本身，不要求负责人写权限。Grant 创建需要插件先验证预授权根目录、Git 仓库归属和目标 Bot；Tobs 不会自动派生父目录授权。撤销 Grant 后仍应显式停止相关执行，不能把权限撤销当作进程已终止的证据。[发布声明：Grant Store](https://unpkg.com/@botharness/core@1.6.1/dist/index.d.mts#L11808)

## 6. 原生派工和后续要求的受支持入口

真实发布包 v1.6.1 的 direct runner 明确拒绝 `create_assignment`、`send_assignment_request` 和 `wait_for_assignment`。独立后台服务不能经 `runDirectBotTool` 调用这三项。`stop_assignment` 和 `inspect_assignment` 不在这个禁用集合中。[发布实现：禁用集合](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L156993)

自定义工具回调若正在真实 Orchestrator Turn 内，可以通过 DSH 的公开工具分发接口调用该 Agent 可见的原生工具。DSH `0.2.2-rc.1` 的 `tools.execute` 是 batch API：

```ts
const batch = await agentCtx.tools.execute({
  agent,
  signal: exec.signal,
  toolSet: exec.toolSet,
  calls: [{
    type: 'tool-call',
    id: ToolCallId(`${String(exec.callId)}:continue`),
    name: 'send_assignment_request',
    arguments: JSON.stringify({
      session_id: ownedAssignmentId,
      text: requestText,
      mode: 'next-turn',
    }),
  }],
});
const settled = batch.results[0]?.result;
```

`ToolCallId` 从 `@deepseek-ai/dsh-llm` 导入。`settled.isError` 为 false 时读取 canonical `value`；错误时读取 `error`。返回的 additional contexts 和 concluded 状态属于复合工具的结果处理，不能静默丢弃需要保留的上下文。[DSH batch 输入和结果](https://unpkg.com/@deepseek-ai/dsh-tools@0.2.2-rc.1/lib/types/executor.d.ts)

此形状适用于当前 Agent 选择 Native executor 的场景。PTC executor 对原生名称的分发有自己的 SDK 和父执行 Token 约定，不能假定同一 batch 在任意 executor 下都可用。`@deepseek-ai/dsh-tools/pipeline` 也公开共享策略阶段 `prepare`、`dispatch` 和 `complete`，并支持真实父 Token。复合工具需要选择一致的调用方式并通过集成测试验证，不能直接调用 `tools.get(name).execute` 绕过策略、取消和结果处理。[共享工具分发阶段](https://unpkg.com/@deepseek-ai/dsh-tools@0.2.2-rc.1/lib/types/pipeline.d.ts)

原生工具仍按当前 Orchestrator 检查 Assignment 归属。不能让 A Bot 的回调以 B Bot 身份发送原生后续请求。跨 Bot 的后续要求应先放入插件队列并唤醒 B，让 B 的真实 Turn 执行；后台停止可以在插件核验任务树权限后使用已允许的 direct `stop_assignment`。

```ts
await core.runtime.runDirectBotTool!(
  targetBotSlug,
  'stop_assignment',
  { session_id: ownedAssignmentId },
  signal,
);
```

停止后重新查询 Assignment，确认 `stopped`。原生工具说明和持久状态都要求核对结果；超时或错误不能宣称已经停止。[稳定版停止工具](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1666)

## 版本兼容与验证边界

发布包 `dist/index.mjs:160124` 的某个 private-tool/subagent direct 分支仍调用旧的 `tools.execute({ callId, name, arguments, agent, signal })`。本机 DSH `0.2.2-rc.1` 的公开入口要求 `{ calls, agent, signal, toolSet? }`，返回 batch。这个静态差异说明旧分支不能作为新 SDK 的调用模板；它不等于整个 Tobs 已经运行失败。[Tobs 旧调用分支](https://unpkg.com/@botharness/core@1.6.1/dist/index.mjs#L160124)

后续验证应覆盖：Tobs 的实际装载、工具局部注册和卸载、真实 Human DM 来源读取、定时唤醒合并、真实原生派工与后续分发、报告绑定、取消后的停止确认，以及 Host 重启后的原生事实恢复。第三方兼容失败应如实记录，按项目边界处理，不修改 Tobs 或 DSH 源码来掩盖结果。

## 7. 固定提交构建的实现复核

本次只读核对 `project-coordination-plugin/src/execution.mjs` 和 `runtime.mjs`。上游代码为 `.build/tobs-upstream/source`，已核对 Git HEAD 为 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab`。构建产物位于 `.build/tobs-upstream/artifacts/1.6.1-ghost.20261110.2e0562f/packages/core/dist/`。没有运行上游测试或修改实现。

### 调用形状与停止语义

首次复核发现 `execution.mjs` 第 51、52 行返回 `continue_assignment` 和参数 `message`。这个工具不存在。准确名称是 `send_assignment_request`，必填参数是 `session_id` 和 `text`，可选 `mode: next-turn | next-step`。主线程收到反馈后已修正工具名和参数。[固定提交的真实工具定义](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1824)

`execution.mjs` 首次复核的第 93 至 98 行，仅在 working 或 stopping 时调用原生停止，再把 idle 和 error 也登记为 stopped。idle 和 error 只说明当前执行活动状态，不证明原生已停止。原生 `stop_assignment` 还会清理待处理输入，并持久禁止后续请求。若产品状态要求这些保证，就应对所有非 stopped 的执行调用原生停止，再确认查询结果为 stopped。[原生停止实现](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L9470)

同一 Session 已停止时，直接 `send_assignment_request` 会拒绝。主线程应在核验新的明确恢复授权后，调用 `unarchive_assignment`：

```ts
{ session_id: existingSessionId, message: resumeInstruction, mode: 'next-turn' }
```

这个工具的参数确实叫 `message`。它会把同一 Session 的 stop_state 恢复为 running，再通过普通 Assignment Request 投递要求，不会新建执行。Continuity Key 不恢复。结果中只有 `delivery: followup | steer` 才表示已经投递。`outcome: unarchived` 仍可能伴随 `code: request-not-delivered`，例如容量不足。[恢复工具及投递结果](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1672)、[同一 Session 的恢复](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L9650)

公开的 `core.runtime.setAssignmentArchived(botSlug, sessionId, false)` 也会解除停止，但它不投递恢复消息。两次操作之间需要保留结果；不能把解除停止登记成已收到恢复要求。[公开 Runtime 入口](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L5027)

其余调用形状与固定构建一致：

| 实现位置 | 调用 | 已核对的契约 |
| --- | --- | --- |
| execution.mjs：Workspace 准备 | `workspaceRegistry.list()`、`create(path, title)` | 列表元素有 `id` 和规范路径 `path`；SDK create 返回 Workspace，不是 HTTP 包装结果 |
| execution.mjs：Grant 准备 | `grants.list(bot)`、`create(bot, workspace.id, { validate, onCreated })`、`requireActive(bot, id)` | 形状正确。插件仍负责预授权根目录和任务范围检查 |
| execution.mjs：创建建议 | `create_assignment({ title, description, instructions, grant_id, key })` | 与官方工具参数一致 |
| execution.mjs：停止 | `runtime.runDirectBotTool(bot, 'stop_assignment', { session_id }, signal)` | 形状正确；前后应读取原生 Assignment 核对身份和 stopped 状态 |
| runtime.mjs：成员模型 | `modelPresets.get(id)`、`registry.applyModelPreset(slug, preset)` | 方法存在；后者返回带 `ok` 的结果 |
| runtime.mjs：成员创建 | `creations.create(input, operationKey)` | 同步返回 `{ record, channelId, receipt? }`；输入的 displayName、persona、description 和 workspaces 有效 |
| runtime.mjs：唤醒 | `schedules.create(bot, input, 'human')`、`runNow(bot, id)` | enabled=false、locked=true 和 cron 输入形状有效；human 作者应对应已保存的用户授权，不能把定时来源当成新的 Human DM |
| runtime.mjs：归档 | `registry.setPaused(bot, true)` | 返回带 `ok` 的结果；暂停本身不证明所有原生执行已停止 |

参数依据为固定产物 `index.d.mts` 的 ModelPresetStore（第 7748 行）、BotScheduleStore（第 14691 行），以及官方 [Creation 实现](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/bots/creation.ts#L288)、[Schedule 创建和唤醒](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/schedules/bot-schedules.ts#L608)。这些结论仅表示接口和静态语义吻合，不表示真实 Host 验收已经通过。

### 最小真实 Host 和 Agent 验收来源

Tobs 的 `packages/core/test/dsh-agent-host-fixture.ts` 第 61 行定义 `FakeAgentHost`。其中 followup、turn/start 和工具调用都是测试替身。它适合验证适配器的参数和状态，不能证明真实 DSH Agent、工具作用域或取消行为。[官方 FakeAgentHost](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/test/dsh-agent-host-fixture.ts#L61)

真实 SDK 的最小组合在本仓 DSH 子模块 `deepseek-harness/packages/core/agent-loop/tests/tool-executors.spec.ts` 第 66 至 83 行。已核对该子模块 HEAD 为 `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`，agent-loop 包版本为 `0.2.2-rc.1`。它挂载真实 Context、LlmRuntime、SessionStore、SessionProjections、SystemPrompt、Tools、NativeToolExecutor、AgentRegistry 和 AgentLoop，仅模型传输使用脚本化适配器。[官方真实 Agent 组合](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/agent-loop/tests/tool-executors.spec.ts#L66)

同目录 `mock-adapter.ts` 的 `toolCallResponse` 和 `MockAdapter` 可以产生确定的工具调用和流式结果。使用这个传输替身可以测试真实 Agent，不需要调用外部付费模型。验收时应保留真实 Tobs core、真实 adapter、真实贡献回调和原生 Assignment，只替换模型传输。[官方脚本化模型传输](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/agent-loop/tests/mock-adapter.ts#L30)

Tobs 自己的真实 Host 验收参考为 `scripts/e2e-assignment-report-harvest.mjs` 第 48 至 108 行。它连接已启动的隔离 Host，创建 Bot、模型预设、Workspace 和 Grant，发送真实 DM，再查询原生 Assignment 和报告。HTTP 调用格式在 `scripts/e2e-assignment-probe.mjs` 第 26 至 54 行；原生 Session 通过 remote.mux 读取。[官方真实 Assignment 场景](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/e2e-assignment-report-harvest.mjs#L48)

`scripts/e2e-assignment-report-proof.mjs` 第 3 至 26 行核对真实 tool/call、对应成功 tool/result，以及完成回复晚于原生报告的时间关系。这些断言可用于插件验收；仅检查输出文本含某个标记不足以证明真实 Assignment 已完成。[报告与回复的证据断言](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/e2e-assignment-report-proof.mjs#L3)

固定 Tobs 提交没有现成的一文件测试能同时替代完整 Host 装载、贡献工具注册和原生 Assignment。可组合上述官方真实 SDK fixture 与 Tobs core/adapter，在隔离临时目录验收。验收至少要观察两个 rootRole 的贡献、真实 Session ownership、原生派工和报告、跨 Bot 隔离，以及插件卸载后局部工具移除。

## 8. 系统 Schedule 失败后的公开恢复边界

2026-11-11 再次只读核对固定提交 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab`。本节是源码事实与接口可达性结论，未执行模型、修改 Tobs 源码或写入其数据库。

### 同一 Schedule 的 runNow 不等于失败重试

Schedule 失败时，Runtime 的 `#setObserved(ids, null, bot)` 同时清空 Source Event 和 admission 的观察时间，并把未产生副作用的 admission 置为 `retryable`。[失败后的状态写入](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L10560)

同一 Schedule 的后续 firing 会查询尚未观察、状态为 `pending` 或 `retryable` 的旧 firing，并更新原 Source Event 的载荷、返回 `coalesced: true`。`runNow` 对 coalesced firing 不调用 `onAdmitted`。因此失败后重复 `runNow` 可以返回 firing，却没有重新唤醒 Orchestrator。[合并条件](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/schedules/bot-schedules.ts#L451)、[runNow 唤醒条件](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/schedules/bot-schedules.ts#L702)

公开的 `runtime.admitScheduleFiring(botSlug)` 只调用 `#checkHarvestReadiness`；后者只以 `attempt_state = 'pending'` 的 Schedule 触发 harvest，不能把旧 `retryable` Schedule 重排。[公开入口](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L2433)、[就绪判断](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L3276)

在 Bot 未暂停且 `heldCause(botSlug) === undefined` 时，创建不同 ID 的新 Schedule 再 `runNow` 可以产生新的 pending admission，经过现有公开入口唤醒。这个结论由上述调用链得出，仍须真实 Host 验收。修改原 Schedule 的 prompt 或 trigger 不改变 Schedule ID，因此不能解决同源合并。

`schedules.remove` 仅删除 `bot_schedule_firings` 和 `bot_schedules`，没有取消或删除 Source Event、admission。Runtime 收集旧 Schedule 来源时只检查 `source_kind` 和 `observed_at IS NULL`，不连接 `bot_schedules`，也不检查 admission 的状态。因此轮换 Schedule 能产生新唤醒，但不等于撤销旧失败事件；插件必须按自己的任务和派发 ID 去重，不能将 remove 记录为取消旧任务。[删除语义](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/schedules/bot-schedules.ts#L672)、[Inbox 收集条件](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L10231)

### 连续故障的 hold 没有公开系统解除接口

Tobs 把 `TRANSPORT`、`TIMEOUT`、`SERVER`、`RATE_LIMIT`、`EMPTY_RESPONSE` 视为 transient；这些错误会清空连续故障计数。`MODEL_UNAVAILABLE` 不在集合中。连续 3 个有错误码且非 transient 的自动运行失败会设置 `heldCause = 'failures'`，并发出“Send it a message to try again”的系统通知。[错误码和阈值](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L1501)、[连续故障处理](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L5605)

`#hold` 会取消自动唤醒定时器；`#scheduleHarvest`、`#checkHarvestReadiness` 均拒绝 held Bot。创建新的 Schedule 仍不能越过此门禁。[hold 与私有 release](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L5565)、[harvest 门禁](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L3241)

公开 `BotRuntime` 提供 `heldCause` 查询，没有 release/reset hold 方法。`BotHarnessCore` 也没有其他系统恢复服务。私有 `#release` 的调用点仅有 `recoverDmMessage`、`admitDmMessage`、真实 Human 群消息路径，以及已有 Human DM/mention 来源的 external admission。`admitDmMessage` 本身没有完整的作者校验，不代表系统插件可以合法将 Schedule 当成 Human DM；那会改变来源并绕过相同的 human-stop 门禁。[Runtime 契约](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L846)、[Core 契约](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/plugin.ts#L511)、[DM 释放调用](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L2318)、[群消息释放调用](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L2371)、[external 释放条件](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L2438)

所以在不改源码、不写内部表、不伪造 Human 来源、不绕过 human-stop 的约束下：插件可在尚未 hold 时用新 Schedule 产生合法系统唤醒；进入 `failures` hold 后，应向上汇报并等待真实 Human 信号。连续 `MODEL_UNAVAILABLE` 后全自动解除 hold 不是现有公开接口支持的能力。

### 其他恢复入口不能替代 Schedule 重试

| 入口 | 已确认的效果 | 对系统 Schedule 的限制 |
| --- | --- | --- |
| `startFreshOrchestrator(bot)` | 归档、释放当前 Orchestrator 或替换未保存 Session | 不调用 release，不重置 admission，不投递任务；只换 Session 不恢复 Schedule |
| `recoverDmMessage` | 根据原 Bot 失败卡执行 continue、retry 或换 Session 后重试 | 要求原 failure 带 `requestMessageId`，且引用真实可继续或可重试的 Human DM；Schedule harvest 的失败卡没有该字段 |
| `retryDmMessage` | 重试没有副作用的原 Human DM | 查询条件要求 `human-message`、`human-dm` 和原作者为 Human，不接受 Schedule |
| `resumePendingDigests` | 恢复普通群消息 digest | 只查询 `group-ordinary`，且 digest 同样受 hold 门禁约束 |

来源：[换 Session 实现](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L5052)、[DM 恢复前置条件](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L2162)、[Human DM 重试查询](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L2002)、[Schedule 失败卡](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L3524)、[digest 恢复查询](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/bot-runtime.ts#L3122)。
