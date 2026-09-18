# DSH 0.1.5 升级与插件适配评估

> 2026-09-12 维护范围更新：第三方插件修复已取消，补丁及专用测试已删除。本文此前的第三方适配计划不再执行；仅继续自研插件迁移与验收，规则见根目录 CLAUDE.md。

日期：2026-09-12。目标：使用官方 DSH，不修改其源码；工作流定制全部保留在外部插件与项目启动配置中。

当前总览：Owner Team、V3 会话读取、主线程问询、三个项目适配层和固定版本启动入口均已有实施与定向证据；第三轮完整 CA01 已通过：11 组全部通过，1217 项通过、21 项历史跳过，0 失败/超时/阻塞。外部 11 个扩展的适配与真实装配尚未完成。下文保留各批次的历史结论，其中“待办”以最新 CA01 小节和本总览为准，不应把早期定向通过解读为整体完成。

后续外部适配已开始：Better Sidebar 0.19.1 的覆盖包含客户端依赖修正与工具注册失败回滚，该批回归 22/22；EasyRewrite 2.5.0 的依赖覆盖也已生成。新增官方 Web 图测试 1/1 通过，验证两个覆盖的服务提供方均为实际插件节点，未加载外部插件。两者都尚未启用；Better Sidebar 的终端隔离和侧栏交互、EasyRewrite 的附件和历史会话行为仍待迁移验收，外部整体为 0/11。当前覆盖层属于 CA01 run-03 之后的变更，run-03 保留为其绑定源码的历史通过证据，不自动覆盖本批改动。下一次完整候选已配置纳入覆盖配方与相关测试。详见 `dsh-0.1.5-external-plugin-review.md`。

## 本轮已完成

- DSH 子模块从 `5ea51e6737db61c6eae3c03c6c195e400f785163` 切换到官方最新发布标签 `dsh-v0.1.5-rc.2`，完整提交为 `fb2c4b9e698e30edb738bca4cf0618587db7d203`。这里的“最新”指发布版本，不是额外包含未发布变更的 master。
- 原自定义提交只修改旧 APIProxy 的 `session.prompt`、`/api/respond` 超时策略，以及对应两项测试。当前官方版本已移除该模块，因此直接采用官方提交，不移植补丁。
- 未重写旧本地 master 历史，子模块以 detached HEAD 固定官方提交；父仓库记录该 gitlink。未推送。
- 当前 DSH 工作树与上述官方提交无差异。已按官方锁文件安装依赖，完成官方 `pnpm run clean` 和 `pnpm run build`。第一次构建发现已删除 SQLite 包的旧 `lib/` 仍被扫描，官方清理后重建通过。插件整体适配尚未验收，不能将原版本验收结果用于证明新版兼容。

## Owner Team 实施进度

已经实现插件侧 `src/owner-team.mjs` 的会话执行层：显式主线程归属、固定成员/会话/工作目录绑定、创建与恢复、活跃成员复用、单 Owner 互斥、取消收敛后释放占用、已接收 prompt 拒绝重投，以及仅返回本次任务 turn 的证据。成员长期记录、跨进程租约、文件范围和结果验收仍由 Runner 负责，不能把这个进程内执行层当作完整隔离与验收系统。

`src/dsh-execution.mjs` 提供新版快照读取和受管理 read handle 读取。现有临时 provider 已改为显式 `setup(ctx, agent)`、`parentAgent`、`agentOptions` 能力声明与 `snapshotEvents()`；角色沙箱缺少新版 API 时明确报错；Persona 字段已改为 `prefix`。

2026-09-12 本轮证据：

- `node --test owner-workflow-plugin/test/owner-team.test.mjs owner-workflow-plugin/test/agent-policy.test.mjs`：9/9 通过，其中 3 项使用本次官方源码构建的真实 AgentLoop、AgentRegistry、SessionStore 与 JSONL 持久化，模型响应为测试适配器，无外部模型请求。
- 上述真实运行时测试覆盖同一会话两次派发、释放后恢复第三次派发、旧任务证据隔离、已接收请求重投拒绝、读句柄与活跃写会话共存、恢复时 cwd 不匹配拒绝、双 Owner 不同 cwd 并发、同 Owner 互斥、取消和接收回执失败。
- `control.test.mjs` 的“只读子代理继承完整工具集并只设置”与 `operation-runtime.test.mjs` 的“主代理启动低成本后台 Operator”两项定向回归：2/2 通过。这两项仍是业务服务替身测试，不作为新版完整 Operation 集成证明。
- 官方完整构建通过，`git -C deepseek-harness diff --exit-code` 通过、工作树干净。

**已接通 Runner 的 Owner 执行路径，整体升级仍未完成。** `runChild(role: owner)` 现在调用 `owner-team-runtime.mjs`，复用原有 Owner lease、attempt、计划摘要和提交/结算关卡。Workflow 状态新增 `ownerTeam.members/history` 与每次 Owner run 的 `teamDispatch`，记录成员会话代次、固定 prompt 身份、基线、接收和终态；规划/审查角色仍使用一次性 provider。成员恢复失败不会静默改为另一个会话重投。恢复预算预留不同 sessionId，或父会话/worktree/权限发生变化时，记录退役原因并显式换代。

空闲成员保留 Owner 角色，工具和文件写入均拒绝；激活任务时重绑当前 active Owner，pre-step 检查当前租约，结束后移除任务绑定。Runtime 退出会取消并等待成员收敛，工作区清理前释放空闲会话。按 promptId 读取所属 turn 的终态，避免同一会话的后续任务替代旧任务证据。

新增 `owner-team-runner.test.mjs` 三项真实集成测试通过：

1. 同一 Owner 连续执行两个任务、释放后恢复第三个任务；三次实际修改、固定 `node --check` 验证、真实 `owner_submit` 和不同 Git SHA；前两次经真实 `finishOwner` 与 Curator/Reviewer 调用。验证空闲工具/写入拒绝、历史任务终态关联和主线程收到带任务身份的进度。
2. 两个 Owner 在编辑工具中用同步屏障证明执行重叠，绑定不同 worktree；对方工作区的写入请求被拒绝，两项合法修改各自通过验证提交。
3. 越出 Owner scope/task.write 的修改被真实提交关卡拒绝，未产生结果并保留现场，主仓库文件不受影响。沿用现有 Runner 的 Workflow 失败策略：一个 Owner 失败会使重叠验证也可能停止结算，不把这解释为 Owner 目录隔离失败。

测试只替换模型响应与确定性编辑传输，Runner、Git worktree、租约、提交验证、AgentLoop、持久化和 Memory 流程均使用实际实现。DSH 的 macOS sandbox-exec 无法在 Codex 默认沙箱中嵌套，因此该集成命令在外层沙箱之外运行，保留 DSH 原生沙箱，全部业务文件位于临时仓库：`node --import ./deepseek-harness/node_modules/tsx/dist/esm/index.mjs --test --test-force-exit owner-workflow-plugin/test/owner-team-runner.test.mjs`。

Owner Team 不是正式 continuable provider 的驻留成员，官方 `subagents.sendMessage` 明确拒绝这类成员向父线程发信。Owner 进度因此使用公开 `Agent.send` 和插件来源的消息，校验真实父子归属、按内容及派发身份去重、持久化确认，普通进度不唤醒新的模型轮次。Operation/规划等官方 continuable 路径单独使用 `sendMessage`；其后续迁移证据见下节，不能机械替换 Owner Team 通信。

后续进度见下节。剩余工作：更广泛的历史日志副本验收；真实用户问题与答案回流；Operation/规划通信和 setup 接口；前端、外部插件、启动入口与版本一致性；新版完整候选验收。上述定向测试不是整套 Workflow 验收，旧 CA01 候选不能继承到本轮。

Runner 接入后的回归：`control.test.mjs` 与 `operation-runtime.test.mjs` 合计 184 通过、7 项既有跳过、0 失败；`owner-team.test.mjs` 与 `agent-policy.test.mjs` 合计 10/10，包含成员释放失败时仍清理其他 Runtime 状态的回归；上述 Runner 集成 3/3。Operation 的这些业务回归使用服务替身，不能代替真实新版装配测试。插件依赖声明已加入 `sessions` 与 `sessionPersistence`；缺少持久化 API 会明确报兼容性错误。DSH 仍固定官方 `fb2c4b9e698e30edb738bca4cf0618587db7d203`，工作树干净。

## V3 恢复适配进度（2026-09-12）

已将恢复、Replan 和公共 Owner 决定入口的 `readRaw/readFrom/listSnapshots` 依赖替换为公开 `SessionPersistence.stat/open` 与只读 `SessionHandle`。插件不再复制 schema-17 解码器，也不按类名和 `compression:none` 限制后端。继续核对会话身份、头信息、连续 seq、稳定 revision、唯一 prompt、工具调用/回执与正式终态；缺失、损坏、不支持格式、读取竞态和普通读取失败分别返回明确的暂停原因。读取不能合成中断终态、改写日志或授权重投。

修复 Owner Team 创建后的绑定失败清理：`persistOwnerSession` 失败时释放已激活成员，保留原 reservation 和派发身份；不发送 prompt，不退款，不另建会话掩盖失败。正常成功成员仍按设计复用。

本轮定向验证 **72/72 通过，0 失败、0 跳过**，包括真实官方 DSH 上的 Owner 提交、固定 SHA 结算、重复对账不调用模型，Planner/Reviewer/Owner advice 结构化回执，公共 Owner 容量、超时、取消与业务决定 outbox，双 Owner Runner，以及 SIGKILL 后从新进程读取创建/接收/结算状态。新增读取竞态与取消的服务边界测试。普通和 zstd V3、受控 V2 格式副本、未知新格式、损坏记录、截断终态和完整终态后的残余尾部均已覆盖。

证据：[测试日志](proofs/dsh-0.1.5-recovery/integration.log)、[命令、版本与源码摘要](proofs/dsh-0.1.5-recovery/evidence.json)。这是该轮源码摘要对应的未提交工作区开发验证，模型使用测试适配器；V2 用例不是所有历史用户日志的兼容证明。尚未执行新版完整 CA01 候选验收。

追加业务回归：`control.test.mjs` 与 `operation-runtime.test.mjs` **184 通过、0 失败、7 项既有跳过**，见[回归日志](proofs/dsh-0.1.5-recovery/control-regression.log)。本轮合计 256 通过；这些 Operation 服务替身测试仍不能证明原生新版 Operation 接入完成。官方 DSH 工作树检查保持干净。

Operation/规划入口的后续迁移见下节。剩余包括完整规划修订验收、真实用户问询和答案回流、前端/启动入口/SoL/Synapse 接入及整套 workflow 验收。公共 Owner 的业务决定已验证进入主线程 outbox；这不能代替真实用户问答服务的端到端验证。

## Operation 与规划入口适配（2026-09-12）

生产代码已移除 `registerContinuableSetup`、`reportFrom`、`subagents.followup`。新版 `prepareContinuable` 只提供种子历史，不能接管 setup。原生可续接会话使用公开、同步的 `agent/created` 事件，在模型循环启动前按插件持有的真实子会话 ID 和父会话绑定设置角色、只读沙箱及提示词。该监听器保持原有作用域，优先执行；同步配置失败触发官方创建回滚。Owner Team 的显式 `setup(ctx, agent)` 路径继续保留。

Operation 启动核对 `startContinuable/sendMessage` 能力。主线程续接、需要输入/授权、完成和失败回报使用正式 `sendMessage(sender, targetId, content, { signal })`，传入真实 Agent；返回的 messageId 仅说明消息接收，不代表任务完成。普通进度和 finding 使用带插件来源的 `Agent.send(..., 'next-step', false)`，校验真实父子归属，并经 `sessions.flush` 确认；空闲主模型不会因这些进度启动。规划通知优先使用真实驻留子会话；子会话已释放时由 Runtime 发系统通知，不再构造 `{id: childId}` 冒充子代理。

新装配测试使用官方 AgentLoop、continuation manager、spawn provider、SessionQuery SQLite、JSONL 与沙箱，模型响应受控。验证：Operator 在第一条模型请求时已有只读权限；提出问题后主线程收到消息；释放驻留后使用原 childId 冷恢复；补充信息只投递一次；完成结果回主线程并回收成员；静默进度不启动主模型；伪造 sender 与跨父会话消息拒绝；配置失败时零模型请求并回滚。规划测试覆盖原生创建、只读配置、真实消息归属及成员释放后的系统通知。

与 Owner Team Runner 和公共 Owner 决定链路合跑 **16/16 通过，0 失败、0 跳过**。证据：[集成日志](proofs/dsh-0.1.5-operation/integration.log)、[命令、版本与源码摘要](proofs/dsh-0.1.5-operation/evidence.json)。这不是完整 preset 启动、真实用户问答 UI 或完整规划修订流程的验收，测试中的用户补充信息由测试调用方提供。

业务回归 `control.test.mjs` 与 `operation-runtime.test.mjs` 184 通过、0 失败、7 项既有跳过，见[回归日志](proofs/dsh-0.1.5-operation/control-regression.log)。本轮合计 200 通过。

原生问询服务与答案回流的后续验证见下节。该轮日志绑定该轮源码摘要，不能单独证明后续变更。

## 原生用户问询、取消与审批上下文

Owner / Operator / Planner 不直接调用 `ask_user_question`。角色工具门禁会返回具体的回报路径：Owner 使用已有的 `owner_execution_feedback` 事实与任务绑定；Operator 使用 `operation_report(need_input)`；规划与审查角色将问题留在结构化报告或最终结果，由主线程决定。没有省略 Agent 参数，也没有按 session header 猜测根 Agent；原生服务继续校验真实运行时身份和根归属。宿主工具授权仍遵守其单独合同。

新增 `askNativeQuestion` 只负责显式 Agent 与可取消等待，根身份校验仍由官方 `UserQuestionService` 执行。工作流决定、Intent、义务确认、计划修订额度和 Operation 人工审批均接入。等待中止后及时释放本地调用，即使 answerer 没有响应 AbortSignal 也不会让 Runtime 一直等待；迟到回答不能进入决定结算。计划修订额度还检查 Runtime/问题生命周期，退出后不追加修订预算。

Operation 的相同根 Agent、相同 approvalId、相同精确命令与展示内容共享一次问询。有效答案在本次主会话内按不可变 approvalId 保留，防止持久结算前持有旧 pending 快照的并发调用重新打开卡片；实际授权仍只能通过持久状态锁应用一次。继续、改向、取消、主会话关闭和插件停止都会释放相应等待。原有持久状态锁再次校验 pending approval，重复回答只能应用一次；已经失效的调用明确返回 `applied: false` / `approvalOutcome: stale`，不声称已授予权限。

本轮发现并修复 `operation-approval.mjs` 仍读取已移除的 `session.events`，导致模型复核拿到空用户约束。现在通过公开 `session.surface.nodes` / `session.eventAt(seq)` 读取当前有效的用户与开发者消息；已被 surface 替换的历史消息、插件通知和其他 Agent 消息不会被提升为可信指令。接口不可用或 surface 引用缺失事件时关闭模型自动审批，交人工处理。正式 surface API 与 `requestHeader()` 在本次官方版本仍然存在，无需自行重建投影。

验证使用官方 AgentLoop、原生 userQuestions 服务、实际 `ask_user_question` / `operation_continue` 工具、Agent 作用域 answerer 和持久化：

- Operator 直接问询被阻止，结构化输入请求回主线程；主线程原生工具等待答案，回答后续接原 childId，冷恢复后完成并回收。真实服务同时拒绝 delegated / 伪造根 Agent；等待中没有主模型轮询。
- 重复授权只呈现一次，并且只产生一个持久决定；取消后在途问询收到 abort，迟到“允许此前缀”不创建前缀权限。
- 工作流决定在 answerer 无响应时仍可中止；计划修订问询去重，拒绝或 Runtime 退出不增加预算，退出后的迟到同意不会被结算。
- 真实 Session 的替换历史和来源边界验证通过；模型复核上下文缺失时不调用审批模型；主会话/插件停止会释放未完成的人工审批等待。

本轮合计 **222 通过、0 失败、7 项既有跳过**：原生集成 23/23，Operation/角色/审批回归 40/40，控制回归 159 通过与 7 项跳过。命令和源码摘要见 [问询验证证据](proofs/dsh-0.1.5-user-questions/evidence.json)。这是原生服务与工具调用链的集成验证：模型响应和人的答案受测试控制，尚不包含浏览器卡片渲染、真实人点击、完整 preset 启动或完整规划修订运行。公共 Owner 反馈进入主线程 outbox 的现有回归通过，完整 Owner 业务决定回到新 DAG 的跨组件验收仍属于新版候选测试。

后续的 preset 和 Owner 前端验证见下节。内置 Operation 审批修复不代表独立 approve-for-me 插件已完成迁移；其 vendored 入口仍有旧 Session 读取，需要单独适配。DSH 源码继续保持官方版本零修改。

## 官方 Web preset 与 Owner 前端（2026-09-12）

在官方 `base + web-app` 装配中加载 Owner bundle、用户 preset 和标准 preset，启用真实 HTTP host、Dashboard、Session Controller 与浏览器模块图。测试改用当前异步 `healProfilesModuleFallback({ installAnchor, home })`、`ToolCallId` 和显式的 `setup(ctx, agent)` / `parentAgent`，不再靠关闭一批官方工具模拟 Web 装配。

实际启动发现并修复三类问题：

- 根包与 Owner 包仍声明已移除的 `dsh-client-runtime`。现在统一依赖新版 UI Session、Layout、Conversation、Sidebar 和 Workspace；HTTP 测试检查两份清单的浏览器依赖都存在于实际模块图。
- 会话列表已不提供旧 `pendingInteraction` 字段。三个状态入口改为订阅官方 `useSessionPendingInteraction`，按请求 key 标识原生问询、授权和计划审查，并与 Runtime 等待项去重。原生问题的头部摘要显示“待回答 1”等实际数量，修复有问题时仍显示“当前没有等待事项”的误导。
- 官方新版没有此前由项目修改 DSH 增加的 `sidebar.workspace.action`。移除失效的注册、组件和样式，工作区状态统一由侧栏“运行状态”提供；只保留官方会话头部、侧栏底部和全屏覆盖层三个插槽。没有恢复 DSH 源码补丁，也没有操作原生工作区行的 DOM 来注入按钮。

本轮 **41/41 通过，0 失败、0 跳过**：官方 Web/preset 集成 10 项，客户端和 Dashboard 回归 31 项。集成覆盖真实认证重定向与 cookie、首页和 Dashboard HTTP 响应、preset 工具隔离和角色沙箱，以及 Chrome 中三个 Owner 入口的渲染、主线程原生问题提交后的答案回流、回答与取消后卡片及等待提示消失。浏览器没有脚本、控制台或 Slot 错误。证据见 [日志与源码摘要](proofs/dsh-0.1.5-web-preset/evidence.json) 和 [原生问题页面截图](proofs/dsh-0.1.5-web-preset/owner-web-question.png)。

边界：浏览器测试通过公开 Session API 写入确定性的展示记录，直接调用生产问询适配器与真实 UserQuestionService，答案由浏览器自动化输入；没有真实模型调用或人工点击。这验证了 Web 与问询服务的实际通路，不代替完整 Spec/Ticket/DAG 编排、规划修订、跨 Owner 业务决定或 Owner 子会话授权跳转。测试需要已构建的官方 DSH 和 Playwright Chromium；若其浏览器未安装，会使用独立资料目录启动本机 Chrome。

原生初版规划与修订，以及 Owner 子会话导航/授权 UI 的后续验证见下方专项记录。后续仍包括 Spec/Ticket checkpoint 到执行候选的完整装配、启动器与版本固定、SoL/Synapse 和独立 approve-for-me 插件适配，以及新版完整候选验收。当前证据不能作为所有外部插件已兼容或全流程已验收的结论。

## Planner 原生续接与审查闭环（2026-09-12）

移除正常规划状态跃迁每次新建 Planner 的旧兼容策略。`continueContinuablePlanning` 现在先等待上一模型轮次结束，再准备 Owner 会诊、基线与修订合同，最后通过 `sendMessage` 续接同一持久 Planner 会话；这避免上一轮尚未结束就提前开放新一轮的提交阶段。官方服务可以在驻留释放后冷恢复同一 childId。只有 Runtime 明确对账为 `plannerUnavailable` 的恢复绑定才走重建路径；没有把一次消息调用失败自动解释为需要新建会话。

新增两项真实 DSH 流程测试，分别覆盖 Planner 保持驻留和首次审查后由官方 API 释放驻留的情况。两者均经过真实 Owner 会诊、`workflow_plan_submit`、独立 `workflow_plan_review_submit`、修订消息、再次结构化提交与复审，最终到达持久化的 `awaiting_plan_approval` 并向主线程报告。初版与修订使用同一 Planner sessionId；每轮独立 Reviewer、只读策略、当前 planDigest、关闭义务与修订次数均核验。模型回复受控，测试没有跳过实际工具或把 `messageId` 当作完成证明。

收敛合同保持不变：Reviewer 必须为已修复问题提交匹配当前 planDigest 的 `obligationClosures`，Runtime 再检查实际计划绑定。仅返回 `passed` 不会抹去未关闭义务。正常测试中只修订一次、两次独立审查后关闭问题；不以放宽验收换取通过。

本段原生联合验证 **25/25 通过**（新增 Planner 2 项，Operation、Owner Team Runner 和公共 Owner 决定 23 项）；控制与恢复回归 **159 通过、7 项既有跳过、0 失败**。同时重新运行上一节 10 项 Web/preset 验证，更新其源码摘要。记录见 [Planner 验证证据](proofs/dsh-0.1.5-planning/evidence.json)。本段验证初版规划与单次修订，不代表 Spec/Ticket checkpoint、完整 DAG 执行/集成、长期 Memory 和跨进程 Runner 恢复已经完成新版整体候选验收。

## Owner Team 会话目录、导航与原生授权（2026-09-12）

原先通过公开 AgentRegistry 创建 Owner 并设置 `origin: subagent`，不足以接入新版界面：原生目录和历史地址还要求子会话的身份投影。现在插件在首次执行、模型请求之前追加公开的 `subagent/descriptor` V3 与父会话 `subagent/catalog` V0 事件并确认持久化；后续任务和恢复复用同一身份，不重复追加。新会话头保留真实父级 preset。正式目录测试同时覆盖驻留和冷态，验证显示相同 Owner 名称、会话 ID 和可续接类型。

可续接身份不代表允许原生控制接管 Owner。插件通过同步 `agent/created` 门禁，核对持久 provider 标识与插件闭包中获准激活的真实 Agent。没有经过 Owner Team 激活流程的恢复会以 `OWNER_TEAM_RUNNER_REQUIRED` 拒绝，由官方创建事务回滚；Web 根入口在主线程 preset 尚未恢复时也安装此门禁。描述记录中的无任务工具组合为 `allow: []`，实际 Owner 权限仍由 Runner 的 scoped setup、lease、attempt 和 planDigest 决定。没有修改原生对象、伪造 one-shot 身份或把原生消息回执当成任务完成。

浏览器适配补齐三处断点：

1. 未选中的子会话可能只出现在父目录中；等待列表和谱系查询合并正式目录与 Session 摘要，不能因缺少 `byId` 行就丢弃授权。
2. 主线程头部显示自身和下游的等待项。由事项跳转后关闭状态浮层，原始授权详情完整可见。
3. 增加官方 `conversation.composer` 中的 Owner 任务提示区，直接需求调整回到主线程。只在没有原生待处理交互时接管，避免遮挡授权面板。

本段合计 **267 通过、21 项既有跳过、0 失败**：Web/preset 10 项，Owner 会话/客户端/Dashboard 20 项，真实 Owner Runner/Planner/Operation 16 项，控制、安全、提交、Operation 和跨进程恢复回归 221 通过与 21 跳过。浏览器使用 Chrome 152，覆盖主线程问题回答/取消、进入 Owner、返回主线程后仍显示授权、从事项回到同一 Owner、允许一次、拒绝与取消的真实服务结果和 UI 清理；同时确认原生直接冷恢复被拒绝、Owner Team 可恢复原 ID。浏览器无脚本、控制台或 Slot 错误。并发单测修复了用请求抵达顺序选择取消屏障的偶发测试死锁，改为按任务消息绑定屏障，没有降低并发或取消断言。

证据见 [命令、源码摘要与结果](proofs/dsh-0.1.5-owner-navigation/evidence.json) 和 [Owner 原生授权截图](proofs/dsh-0.1.5-owner-navigation/owner-web-child-approval.png)。模型输出和用户点击由测试控制；浏览器授权用真实 Owner Agent、开放回合、原生 ApprovalService 和原始作用域，但不实际执行宿主命令。Runner 的真实提交和隔离、固定验证的精确授权合同由独立集成/安全回归验证；这组证据仍不能替代完整 Spec/Ticket/DAG、共享模块变更、集成与长期 Memory 的新版候选验收。之前各 proof 的源码摘要保留为当时快照，本段证据对应本次代码。

后续仍需完成 Spec/Ticket checkpoint 到执行候选的完整装配、启动器与版本固定、SoL/Synapse 和独立 approve-for-me 适配，以及整体验收。Owner 业务决定返回新 DAG 的全链路仍在候选验收范围。

## SoL 与 Owner Team 接入（2026-09-12）

SoL 外部插件已迁移到固定 DSH `0.1.5-rc.2`，未修改 DSH 或 SoL-Pi 上游源码。移除了失效的 `CallId`、Settings 安装入口和客户端 runtime 依赖；使用公开的 `ToolCallId`、`settings.installSection` 与当前 UI 模块。

Action Fusion 通过原生 `tools.execute` 保留真实 Agent、根调用和父调用身份，嵌套日志改为 V3 `tool/ptc-dispatch*`，日志展示经过官方公开策略。日志策略异常不改变 canonical value；编辑失败、编辑后取消、文件版本变化和终止回合均阻止后续命令。真实回合日志经公共 SessionHandle 关闭后重读一致。

EPR 使用公开 `llm.prepareCall`，解析参数和流式请求绑定同一适配器代际。默认 `reasoningEffort: auto` 使用模型声明的默认值，没有推理控制时省略；已显式配置的 `off` 等值保持原样，不支持则在模型请求前回退原始输出。审计记录实际解析的请求和模型默认参数标记。原始日志、退出码、结构化 value 和现有压缩回退规则保持生效；功能仍默认关闭，未验证付费供应商成本收益。

本轮 **50/50 通过，0 失败、0 取消、0 跳过**：SoL 标准 `npm test` 40 项，真实 Web/preset 10 项。另通过实际 demo、上游基线检查和打包清单检查。

- 真实 Owner Runner 中，跨 worktree 写入和直接提权被拒绝；允许的编辑和命令经过固定验证及 `owner_submit` 产生实际 Git 提交。空闲 Owner 再次调用被拒绝。
- 隔离测试使用原生 `fs-sandbox` 和 macOS sandbox，测试仓库放在项目内后自动清理。官方 `workspace-write` 同时允许系统临时目录，因此在系统临时目录中测试“越界必须拒绝”不能代表真实隔离边界。
- 真实浏览器通过设置页启停两项功能，等待服务端确认与界面快照更新；主线程借复合工具写代码仍被阻止。Owner 待处理导航、允许/拒绝/取消和冷恢复继续通过，浏览器无 Slot 或控制台错误。
- 覆盖模型默认推理参数、无推理模型、显式不支持参数、适配器热替换、取消、超时、卸载、存储失败和错误摘要回退。模型响应均由测试控制，不宣称真实远程供应商兼容性已全部验收。

证据见 [命令、源码摘要与结果](proofs/dsh-0.1.5-sol/evidence.json) 和 [SoL 原生设置截图](proofs/dsh-0.1.5-sol/sol-web-settings.png)。旧 proof 保留为对应源码的历史快照。本轮未替代完整 Spec/Ticket/DAG 候选验收；启动器、外部版本固定、Synapse、独立 approve-for-me 及整套共享 Owner/集成/Memory 流程仍待完成。

## Spec/Ticket checkpoint 与原生 DAG 候选接入（2026-09-12）

本轮迁移规划链路的集成 fixture：使用官方 AgentRegistry 创建真实 Agent、V3 Session 与持久化 handle，替换手工 Agent 对象；原生问询改为 Agent 作用域的 `user-questions/request`，移除已删除的 `registerProvider`。原有测试首次运行是 **51 项中 30 通过、21 失败**，21 项失败均发生在旧问询注册入口，不能据此判断规划状态机不收敛。

迁移并新增原生组合验收后，最终 **52/52 通过，0 失败、0 取消、0 跳过**：

- 主线程通过原生 read/edit 形成 Spec/Ticket 写入来源，经真实问询固定原始实施授权，建立 Git checkpoint 和不可变快照。
- 新增组合用例将该快照交给实际创建的 Planner 和独立 Reviewer，两者通过原生工具提交计划与审查结果；随后激活同一个候选，生成含 3 个单 Owner 任务的 Workflow。编译、审查和激活复用原始授权，只问一次。
- 两个执行会话使用不同身份，持久日志保留真实父 Agent、只读沙箱声明和对应提交工具调用；结束后释放 Agent，再用公共 SessionHandle 读取日志核验。
- 保留固定来源与完整 Ticket 的校验、缺少映射和调用来源的有限重试、候选竞争、错配审查拒绝、半激活恢复、活跃版本修订与迟到结果拒绝。
- 文档 checkpoint 覆盖 8 个子进程 SIGKILL 注入位置，以及取消、租约、未知 Git index 锁、篡改快照、原生 CAS 和写入来源不完整时拒绝消费。

证据见 [命令、源码摘要与结果](proofs/dsh-0.1.5-checkpoint/evidence.json)。这一组使用实际 DSH 服务及工具；部分负向测试仍明确采用受控 Subagent 后端，新增组合测试使用真实 Agent/provider，远程模型响应由 fixture 控制。完整 Web preset 的装配由独立 Web 集成验证；本组不会自动启动 Runner，尚不等于包含共享 Owner 决策、执行、集成和长期 Memory 的整套 CA01 新候选已完成。DSH 跟踪源码保持无差异。

## Synapse 项目侧适配与真实 Web 验证（2026-09-12）

新增 `synapse-workflow-plugin/`，加载固定 Synapse `97f8c432de875d97bf7a5e4d675f8010f7b34556` 的 WorkspaceStore 和画布资源。宿主接入、浏览器桥接与局部视图衔接属于本项目；DSH 和 Synapse 上游跟踪文件均未修改。

本轮修复的可复现问题：

- 原生 Session 已无旧 `events` 读取面；恢复分支时用 `firstLiveSeq` 还会跳过分支在重启前的自有历史。适配使用公开快照和持久化 `inheritedEventCount`，旧 `seedLength` 仅为 Store 输入数据，不修改原生 Session。
- Skill 等插件消息在 V3 中也使用 `user/message`。它们保留在原生日志中，但不再被地图误画成用户的新问题。
- Owner 不属于普通根会话列表；目录地址缺少 `mode` 会被原生导航拒绝。地图按目录发现成员，携带完整地址，按父会话工作区展示 Owner，并订阅官方 trajectory 的流式文本。
- 断线期间的临时空列表不代表删除。只用 ready 的根列表计算移除，关闭地图释放实时订阅，重新打开发布当前快照，迟到的 iframe ready 不重新打开已关闭地图。
- 原始详情页“创建分支”只创建草稿而没有切到画布。项目侧 `canvas.js` 调用已有视图按钮，使草稿可见；不改写上游脚本或私有状态。分支失败回报补齐请求 ID，及时结束画布等待。

启动器现在将 `dsh-synapse-workflow` 链接到项目适配层，仍验证上游 gitlink、工作树与所用文件 SHA-256；保留 `DSH_SYNAPSE_DIR` 同版本 checkout 覆盖。根包清单包含适配层和六个固定上游文件，非 Git 安装也校验文件摘要。异向链接或普通包目录不会被覆盖，退出只删除本次创建的临时链接与 patch。

最终 **25/25 通过，0 失败、0 取消、0 跳过**：

- 5 项适配测试：实际 AgentRegistry、V3 Session、JSONL 的实时投影/卸载/冷恢复；没有 Git 的同版本上游副本加载及篡改拒绝；受控客户端观察源的断线移除基线、目录地址、流订阅释放和迟到消息。
- 9 项启动器回归：验证实际启动脚本生成正确适配配置、加载固定上游路径并清理自己创建的链接。外部插件安装与宿主启动程序由 fixture 替代，不作为完整生产启动验收。
- 11 项真实 Web/preset 组合：实际 Chrome 152 和 DSH Web。普通会话追问、流式文本、关闭重开、新建、从详情创建分支均经原生服务；核对同一工作目录、父会话、继承边界和只执行一次的分支问题。活跃及休眠 Owner 的地图发送均被原生准入拒绝，没有新任务消息进入队列/日志，没有冷恢复成员；Runner 后续仍能恢复同一 ID。Owner 原生问题/授权、SoL 设置及角色权限回归继续通过。

另通过上游摘要验证、语法检查、`git diff --check` 与根包打包清单核对（10 个适配文件、6 个上游文件）。证据见 [命令、源码摘要与日志](proofs/dsh-0.1.5-synapse/evidence.json)、[Owner 实时地图](proofs/dsh-0.1.5-synapse/owner-live.png) 和 [原生新建/分支](proofs/dsh-0.1.5-synapse/native-fork.png)。此前 proof 保留为当时源码快照。

浏览器模型响应由 fixture 控制，自动标题模型在测试配置中关闭以隔离会话调用计数；不代表真实远程模型或完整 Workflow 验收。**整体升级仍在进行**：npm/源码启动版本及构建对应性、外部插件版本固定、独立 approve-for-me、新版完整 Spec/Ticket/DAG→共享 Owner 决策→集成/Memory 与取消重启候选尚待完成。不得把本轮 25 项当作 CA01 新候选通过。

## 独立 Approve for Me 项目适配（2026-09-12）

新增 `approve-for-me-workflow-plugin/`，包名 `dsh-approve-for-me-workflow`，保留 `approve-for-me` 设置命名空间。固定复用只读上游 v0.2.2（`a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b`）的风险策略、前缀规则、复核提示和表单数据规则；DSH、Synapse 和审批上游工作树均没有受跟踪修改。

本轮修复的接入点：

- 移除旧 `installSettingsSection`、`settingsNamespace` 和客户端 RPC；使用 `settings.installSection`、原生 SettingsScope 与模型目录服务。V3 历史通过 `session.eventAt` 读取，权限判定传入真实 Session。
- 实际工具调用与审批按 Agent、callId、工具名、精确升级理由绑定。模型复核走当前原生 spawn/结构化输出；仅显式允许、成功收尾且配置与权限未变化时单次放行。取消、超时、卸载、设置撤销和权限切换不会留下有效的允许结果。
- 前端保留规则编辑、复核模型选择与补充说明；保存携带原 revision，核对原生恢复后的实际值。冲突保留草稿，既有不可用模型路线及隐藏 timeout/limits 不会因编辑规则而丢失。设置页不切换会话权限。
- 真实 Web 测试发现 Cordis 整体替换 config：只添加新预设会覆盖默认权限表。标准 bundle 已保留完整官方预设及顺序；另提供 `composeApprovalPatches`，针对定制 profile 保留原权限表、默认值、旧插件配置及禁用状态，拒绝冲突策略和重复宿主。该函数已经过原生 patch 合成测试，但启动器尚未调用，不能宣称自动迁移完成。

验证 **32/32 通过，0 失败、0 取消、0 跳过**：20 项审批/设置/合成测试，以及 12 项实际 Web/preset 组合测试。原生 AgentLoop 确实经历 Bash → 无工具复核者的结构化结果 → 单次授权 → 主会话继续；复核者父会话关联正确并释放。浏览器验证设置写盘、刷新、不可用路线保留、无效规则拒绝、其他编辑者冲突和默认恢复，实际 Bash 放行/拒绝均写入 V3 审批事件。

Web 组合同时回归 Owner 导航与问询、SoL 设置、Synapse 流式文本和分支；将 Owner 权限选为 Approve for me 后，`owner_submit` 授权仍由原生人工面板决定。没有用标准 Bash 审批链路替代工作流授权。构建摘要核验、生成产物一致性、根包与独立包打包清单检查通过。证据见 [日志、版本与源码摘要](proofs/dsh-0.1.5-approval/evidence.json)、[审批设置](proofs/dsh-0.1.5-approval/settings.png)、[设置冲突](proofs/dsh-0.1.5-approval/conflict.png) 和 [原生人工审批](proofs/dsh-0.1.5-approval/manual.png)。之前的 proof 保留为对应当时源码的历史快照。

模型由测试适配器控制，测试在 macOS/Chrome 152 与临时 profile 执行；不代表真实付费模型表现或 Windows PowerShell 执行器验收。未修改用户真实 profile，启动入口统一、版本固定、旧审批插件自动切换与定制 profile 合并仍待完成。新版完整 Spec/Ticket/DAG→公共 Owner 决策→集成/Memory、取消和重启的 CA01 候选也仍未完成，整体升级目标保持进行中。

## 启动入口、固定版本与最终 Web 回归（2026-09-12）

本轮将 npm、源码及 source-runtime 入口统一到 `0.1.5-rc.2`。`dsh-runtime.json` 记录宿主包、版本与官方 SHA；源码构建核对 tracked 工作树、锁文件、Node/平台，以及 CLI、Web、各包 lib 与原生二进制的内容摘要。构建缺失或陈旧时走官方 frozen install → clean → build，构建锁防止两个启动器同时清理。构建失败或源码中途改变不发布成功标记。本轮实际官方构建成功，上游受跟踪源码未改动。

正常启动只读取 `project-plugins.lock.json` 的固定 npm 版本和 Git SHA，复用一致的已安装版本；`--update-plugins` 才解析更新渠道。预检在任何安装动作之前检查宿主版本、清单摘要和客户端依赖。当前 11 个扩展已形成固定候选，但多个仍引用新版客户端图不提供的模块，**整套外部扩展尚不能启动或标记为已验收**；启动器会明确报出这些缺口。保留完整插件清单，没有通过禁用或删除扩展来制造通过结果。候选锁文件的归档摘要来自静态核查，安装器目前没有做归档字节校验，不能将固定版本等同于供应链完整性验证。

启动器已接入 `composeApprovalPatches` 和项目本地包解析。真实临时 profile 测试证明旧审批宿主被禁用、新适配层唯一装配，自定义权限表、默认值和审批配置保留，原 `cordis.patch.yml` 字节不变。旧审批 fixture 若被加载会立即抛错，本轮并未执行旧宿主。标准默认权限仍为 workspace-write；新增自动审批预设不改变用户当前权限选择。

最终 Web 回归暴露了 Synapse 的两个真实时序缺陷，并在项目侧修复：

1. 画布先取工作空间列表、再分别取详情；空会话清理可能在中间删除工作空间，导致“工作空间不存在”。项目访问层将列表与完整投影合为同一次串行快照，画布只读该快照，下一次刷新收敛到删除后的状态。画布适配副本保存在 `synapse-workflow-plugin/app.js`，不改写上游文件、原型或运行时私有状态。
2. 浏览器同步原先允许多个请求同时在途，旧状态可能晚到。现在仅一个请求在途，合并等待中的最新列表；回执丢失后保留可能已写入的会话 ID，下一次同步仍能清除它。失败没有自动重试循环。轮询真正失败时显示错误，过期快照不能覆盖新状态。

本轮组合验证 **70/70 通过，0 失败、0 取消、0 跳过**：启动构建与插件预检 19、启动脚本及真实 profile 装配 11、Synapse 7、真实 Web/preset 13、审批原生/设置/合成 20。两个缺陷均先运行失败用例，再验证修复；这些红灯日志单独保存，不计入通过数。浏览器与原生模型响应使用固定测试适配器，未调用付费模型，外部扩展未参与这 70 项。官方构建、生成产物一致性和打包清单另外记录。

证据见 [本轮日志、版本与源码摘要](proofs/dsh-0.1.5-startup/evidence.json)。之前各 proof 保留为当时源码的历史快照，不能用其旧摘要证明当前源码。

外部扩展的批量安装执行被自动审批审查拒绝，理由是沙箱外运行未经验证的第三方插件及生命周期脚本可能访问环境或凭据；该操作未执行，也没有绕过限制。后续只下载归档并读取源码和元数据，详见 [11 个固定候选的静态检查](dsh-0.1.5-external-plugin-review.md)。需要先完成这些扩展的新版适配，再处理真实运行验证所需的外部执行授权。

**整体升级仍未完成。** 剩余包括外部扩展适配与真实装配、新版 Spec/Ticket/checkpoint → DAG → Runner → 公共 Owner 决策 → 集成/Memory，以及取消和重启的完整 CA01 候选。当前 70 项不是完整 CA01 通过证据。

## 新版 CA01 证据补强与运行时修复（2026-09-12）

本轮核对发现旧 `run-ca01.mjs` 没有绑定 SoL、Synapse、独立审批、启动版本与原生构建产物，且候选名称仍带 R100。已补齐这些源码范围及 Spec/Ticket 文档摘要，将 Owner Team 放入调度验收组，并加入三个项目适配层测试。每组进程结果独立保存；默认使用新目录，拒绝覆盖已有候选。

第一轮新版候选已中止，不能报告通过：规划基础 96/98、公共 Owner 协议 23/29。原因经单变量对照确认，CA01 强制 `TSX_TSCONFIG_PATH` 指向上游源码别名，导致构建 JS 与 TS 源码的工具调度 Symbol 不同；模型发出工具调用后出现 `Cannot read properties of undefined (reading 'prepare')`。移除该覆盖后 Planner 与公共 Owner 原生用例 11/11 通过。旧失败记录保存在 `proofs/dsh-0.1.5-ca01/run-01/`，其余未完成分组不算通过。

验收进程现在隔离 POSIX 进程组；超时与取消先终止、再有界强制清理整组，避免 Node 测试子进程继续占住输出管道。正常输出、环境隔离、超时、取消与预先取消共 5 项测试通过。这个进程组保证只在 POSIX 验证，Windows 后代清理不在本轮证明范围内。

补强了两个原生用例：

- Spec/Ticket 原生写入 → checkpoint → Planner/Reviewer 工具提交 → 候选激活 → 三个 Owner 的原生 write/owner_submit → 固定行为验证 → Git 集成及 Memory → Supervisor 收尾 → 独立实现审查 → 合并回临时启动分支。单一候选和初始一次实施授权贯穿全链；1/1 通过。
- 公共 Owner K1→K2 判断后，经已审查的修订激活唯一 K2 实现者。原先伪造完成状态及 SHA 的步骤替换为真实修改、行为验证、Git 提交/集成和 Memory 结算；下游只有集成后才执行，未受影响的 B 不派发，重开 Runtime 不重复产生决定或修订。2/2 通过。该用例的修订计划和审查输入仍由 fixture 提供，不能宣称单个用例覆盖了模型自动重编排。

取消回归另外发现两项运行时缺陷：保存截止观察推进 revision 后仍确认旧 actionId；停止中的 Owner 缺失持久日志时直接抛错。前者现在基于保存后的同一锁内状态重新生成 receipt；后者仅将明确的 `SessionPersistenceNotFoundError` 当作尚无终态证据，继续现有观察期限，最终进入 termination-unknown 技术暂停。损坏及其他读取错误仍抛出，不伪造终态或释放 Owner。截止与取消原生用例 9/9 通过。

上述定向通过不替代完整 CA01。第二轮已结束：5 组通过、4 组失败、1 组超时、1 组因前置失败阻塞，没有候选漂移。规划基础 98/98、公共 Owner 协议 29/29、历史/Git 110/110、规划激活 14/14、验收分类 4/4 通过。失败组的计数在旧分类器中未投影进最终汇总，必须查阅对应 `*.process.json`；旧证据保留原状，不回填为通过。外部 11 个扩展的兼容适配与真实装配仍另行待办。

第二轮诊断补充：规划激活组按依赖层排序，先执行所有无依赖组，再执行激活组，并非被跳过。已复现的测试缺陷包括旧 `sessionPersistence.readFrom`/`Session.events` 调用，以及在 Owner 派发仍为 `reserved` 时取样或修改超时时钟。后者会与正常的 `accepted` 落盘竞争：子图拒绝测试误认为工具修改了状态，超时测试的人工时钟则可能被启动写入覆盖。在临时诊断副本中等待 `accepted` 后，保持全部原断言，子图 4/4、超时恢复 1/1 通过。

Operation 问询测试还错误要求等待输入的子会话继续驻留内存；新版正常回收后，断言失败，未回答的主线程问题又阻塞清理。将委派调用者拒绝校验移到真实子会话存活期间后，原生问询、同一持久身份恢复及完成 1/1 通过。完整第二轮在收敛组的 600 秒上限退出并继续独立组；后续修复需同时补齐失败清理和文件级测试上限。这些临时对照结果用于确认原因，不冒充已修复候选的集中验收。

修复现已应用到正式文件。付费恢复还需等待 `recoverySession.phase=submitted`：已捕获 `accepted` 后第二次启动写入把恢复阶段从 `created` 改为 `submitted` 的确切差异。子图测试等待两次启动写入完成后才截取全状态，保留拒绝工具不得改变状态的原断言；正常与提交后拒绝共 4 项通过，付费恢复另重复 5 次全部通过。超时测试仅在启动落盘后修改人工时钟；Session 读取 mock 改为只读 handle 并验证关闭；Web 宿主 mock 验证真实存在的全局创建守卫。

Operation 测试在 fixture 释放前清理未回答的问题。故障注入确认：故意在主线程问询待答时断言失败，约 1 秒退出，未触发进程超时。CA01 每个文件额外设置 180 秒上限，仍保留整个验证组的独立进程超时。项目适配组使用已有的官方构建产物解析器，补齐与各插件 `npm test` 相同的入口；不恢复 TS 源码别名，也不安装外部扩展。分类器现保留失败/取消/超时组已有的用例计数，仍按失败或中断分类，不将部分成功视为验收通过。

正式定向复验：相关 fixtures 34/34、超时恢复 1/1、执行器及分类 10/10、三个项目适配层 67/67，另有付费恢复重复 5/5 和预期失败清理检查。证据与源码摘要位于 `proofs/dsh-0.1.5-ca01-repairs/`。第三轮固定候选 `CA01-DSH015-ced3970c5f00` 已完成：11 组全部通过，1238 项中 1217 通过、21 项历史跳过，0 失败、0 取消、0 组超时、0 阻塞、0 候选漂移，耗时约 15.31 分钟。21 个跳过分别来自 control 的 7 个和 security 的 14 个既有旧模式测试，本轮未新增跳过。详细分组、绑定和边界见 `proofs/dsh-0.1.5-ca01/run-03/README.md` 与 `test-results.json`。这是新版完整候选的证据，不再借用旧 R100 的通过状态；外部扩展尚未装配，整体升级仍未完成。

## 源码边界

允许修改 `owner-workflow-plugin/`、`sol-efficiency-plugin/`、项目启动脚本、插件清单及相应测试和文档。Synapse 的适配应在其外部插件仓库或项目侧适配模块完成，不放入 DSH。

禁止修改 `deepseek-harness/` 下受 Git 跟踪的源码、配置、测试、依赖清单和锁文件。依照官方构建流程产生忽略的依赖与构建输出不属于源码补丁。每轮适配结束检查 `git -C deepseek-harness diff --exit-code` 和 `git -C deepseek-harness status --short`。

不得以修改官方对象原型、伪造 `ctx.agent`、跳过权限校验、覆盖官方源码文件或安装时注入源码补丁的方式满足“插件化”。公开 API 不足时明确记录能力缺口，不能用静默降级掩盖。

## 必须修改的接入点

当前决定：用户澄清此前“保持现状”源于混淆名称，现在采用我们自定义的 **Owner Team**。它是插件管理的稳定模块 Owner、独立 worktree、可续接执行会话与版本化 Memory，不是官方 Agent Teams。Runner 继续负责 DAG 调度、Owner 占用和验收。执行适配使用官方公开 Agent 创建、恢复和投递接口，不修改 DSH 源码。

Owner 身份、会话与任务分别建模：Owner 跨任务稳定；会话可按需激活、休眠和恢复；每次派发必须绑定 task、attempt、计划版本和工作区基线。会话空闲不等于任务验收完成，历史提交不能用于结算新任务。不同 Owner 可并行，同一个 Owner 的执行必须串行。公共模块变更仍通过结构化请求交由公共 Owner 独立判断；业务歧义由主线程向用户确认。

| 范围 | 当前代码 | 新版接入与验证要求 |
| --- | --- | --- |
| Agent 创建和角色绑定 | `runtime.mjs` 的 `ownerWorkflowChildProvider`、`setupContinuableChild`；`agent-policy.mjs` 的 `configureChildSandbox` | Owner Team 与一次性 provider 使用 `setup(agentCtx, agent)` 和正确的 `parentAgent`；原生 continuable 会话使用同步创建事件在模型启动前核验父子绑定并配置角色，失败由官方创建事务回滚。 |
| Provider 能力 | 自定义 provider 的 `capabilities` | 按新版能力声明补齐 `agentOptions`，验证角色模型参数与真实支持能力一致，不用缺字段绕过检查。 |
| 消息投递 | `runtime.mjs` 的 `subagents.followup`、`reportFrom` | 官方 continuable 路径转为 `sendMessage(sender, targetId, content, { signal })`；自定义 Owner Team 使用经真实归属校验的公开 Agent 消息接口。区分消息接收、执行结束、结果验收；不重发已接收消息。取消已接收调用不会自动取消成员，停止流程必须单独执行。 |
| 终态读取 | `inspectOwnerSessionTerminal`、`recovery-session.mjs` | 转为 `sessionPersistence.open(id, 'read')` 与 handle 的逻辑事件读取，读后释放 handle。观察不获取写锁，不直接恢复/驱动 Agent。 |
| 恢复证据 | `readRecoverySessionArtifact`、依赖它的 Replan 与公共 Owner 会话判定 | 重新设计 V3 完整性证据，保留身份、唯一 prompt、调用与结果关联、终态和版本绑定。当前 raw JSONL 与逻辑事件逐项相等检查不能机械迁移。验证截断日志不会产生假终态。 |
| 历史与状态读取 | `child.session.events`、Synapse 的 `session.events` | 当前状态优先使用正式投影；历史证据通过受管理读取接口取得。迁移格式失败、读失败和没有终态必须是不同结果。 |
| 用户问题 | `userQuestions.ask` 的各调用方 | 新版要求指定的 Agent 是真实运行时根 Agent；子代理问询必须携带 task/attempt/plan 绑定反馈到主线程，再将答案投递回对应执行。不得省略 Agent 参数绕过归属检查。工具宿主权限审批另按其正式服务合同验证。 |
| Persona 与工具 | `agent-presets/owner-workflow/agent.cordis.yml` | 将 `persona.text` 改为 `prefix`，按需使用 `suffix`；明确角色模型与工具集合，验证完整 preset 的实际加载。 |
| 前端 | 根清单、Owner、SoL、Synapse 清单的 `dsh-client-runtime`，会话跳转和各 Slot | 用新版实际提供 sessions/slots 等能力的客户端模块接入，验证 Dashboard、行动收件箱、子会话跳转与设置界面。不能仅替换清单包名。 |
| 启动与测试装配 | `start-owner-workflow-submodule.sh`、`harness-integration.test.mjs`、恢复会话 fixtures | 依据新 CLI、profile、构建输出与持久化装配更新。禁止用旧 `lib/` 或旧 node_modules 的偶然通过声称新版兼容。 |

## 适配模块的职责

在 Owner 插件内建立单一 DSH 执行适配模块，集中处理 Owner Team 成员的创建、投递、观察、取消和恢复，不向业务状态机暴露 DSH 版本差异。临时规划与审查角色保留独立执行生命周期。适配模块不得为缺失的旧接口返回正常的 `false` 或 `undefined`；这些情况应报告可识别的兼容性错误。Owner 身份、可续接会话、任务执行与长期 Memory 分别绑定，避免把会话历史当作已验收知识。

业务层继续掌握 Owner Registry、scope、worktree、Spec/Ticket 绑定、DAG、恢复预算、结果有效性、集成和 Memory 提交。DSH Session 写锁不能代替 Owner 文件隔离；可继续对话的 Agent 不能代替版本化的长期 Owner Memory。

执行反馈至少区分：未创建、创建失败、消息未接收、消息已接收、执行中、等待业务决定、已终止、读取失败、待验收和已验收。只有新证据或明确的恢复策略才能推动下一次尝试；接口缺失与技术暂停不能进入无限重试。

## 实施顺序与验收

先验证一个 Owner 创建、续接和恢复，再验证两个 Owner 的隔离与并行，然后接入完整 DAG。全部验证使用固定的、未修改的官方 DSH。

1. 固定官方版本并重新装配运行环境，增加插件启动兼容性检查。验证不支持的宿主会明确失败，DSH 源码无差异。
2. 完成 Agent、Provider、Persona 适配与 Owner Team 执行层。通过官方运行时验证一个 Owner 连续执行两个任务、休眠后恢复，以及两个 Owner 独立工作区并行；同 Owner 并发派发被拒绝，旧任务结果不污染新任务，主线程与成员权限、运行时归属正确。
3. 完成消息与用户问题适配。覆盖忙碌/空闲目标、消息接收前后取消、用户长时间未回答、答案回流、重复投递抑制。
4. 完成持久化与恢复适配。用 V3 新日志及旧日志副本测试恢复；覆盖创建后崩溃、接收后崩溃、提交后崩溃、截断尾部、锁竞争和不支持的迁移。不能自动改写现有用户日志来做测试。
5. 完成前端、启动器及外部插件接入。验证实际构建产物，不仅验证 mock；验证主线程可以发现并处理待决事项。
6. 运行完整 workflow 组合验收：两个 Owner 并行、同一 Owner 串行、公共模块变更、DAG 修订、取消与重启、长任务和长时间用户等待。此前的 CA01 证据只对应旧候选，需生成新版候选与报告。

## 本次顺带优化的范围

下表是静态检查后的实施建议，不代表已经修改代码或通过运行验证。P0 是新版可用前必须处理的问题；P1 是应随迁移验证的可靠性改进；P2 在兼容性通过后按效果选择。

| 优先级 | 项目与证据 | 调整与验收 |
| --- | --- | --- |
| P0 | 启动版本不一致：`start-owner-workflow.sh:19`、`start-owner-workflow-npm.sh:7` 仍默认 `0.1.0-rc.8` | 统一 npm 与源码入口的目标版本，输出实际宿主版本、提交与插件版本。源码模式检查构建产物对应的 revision；安装依赖、构建后不允许复用旧产物的测试结论。启动器切换需与插件兼容迁移一同交付，不能只改版本字符串。 |
| P0 | SoL Action Fusion 仍在 `src/action-fusion.mjs:82`、`:87` 写 `tool/code-dispatch-start` / `tool/code-dispatch`；V3 使用 `tool/ptc-dispatch*` | 核对正式嵌套工具执行与事件合同，按新合同适配并验证日志重开。不能仅替换字符串忽略父调用关联、失败、取消与上下文回传。该功能当前默认关闭，不把未适配的可选功能默认为已可用。 |
| P0 | 缺少 `reportFrom`、`readFrom` 时旧分支返回无结果；真实宿主 API 与 mock 可不同步 | 在插件装配和真实集成测试中尽早拒绝不兼容宿主，避免旧接口缺失进入等待/恢复状态。固定版本只是前置条件，必须以一次真实工具调用及恢复检查验证行为。 |
| P1 | 项目插件安装器 `prepare()` 每次启动会解析插件配置的 latest / Git 分支 | 记录并固定一组已验收的宿主、外部插件版本与 Git SHA，更新动作与正常启动分开。避免 DSH 固定而其他插件每次启动变化；保留已有用户配置，不自动卸载插件。 |
| P1 | 新版投递只保证 inbox 接收，后续取消与执行生命周期分开 | 沿用现有任务/attempt/plan 绑定，明确已接收、执行终态、结果验收三种证据。断线后先对账；消息已接收不能因请求失败被重复派发。验证取消确认前不释放 Owner 占用、用户等待不触发普通失败重试。 |
| P1 | Runtime、Dashboard、Synapse 都消费执行状态与历史 | 保持现有 `deriveWorkflowControl` 为工作流控制判定入口，DSH 实时事实通过投影与带游标的事件订阅汇入。缺口时重建所需快照，不反复扫描整段历史；不因 UI 断线或慢刷新新建任务。现有 UI 本地计时刷新不等同于模型轮询，无需为了升级全部重写。 |
| P1 | 主线程、Owner、Planner、Reviewer、Operation 的工具授权不同；复合工具会嵌套调用 edit/write/bash | 用实际加载的 preset 做角色能力矩阵验收，验证主线程文档写入范围、只读角色、Owner worktree、嵌套工具权限与原生审批。保留既有 scope 最终提交校验，不以提示词替代。 |
| P2 | Persona 拆为 prefix/suffix，Owner 长期约束与本次执行信息生命周期不同 | 稳定角色规则使用稳定段落；每次任务只注入当前合同、基线、前置结果与必要 Memory。先保持任务信息完整，再比较 token 和缓存指标；动态系统提示词只在所选模型明确支持时采用。 |
| P2 | SoL EPR 会调用模型压缩工具输出，并保存完整证据与摘要 | 保持原始证据回读与失败回退，验证新版工具值、spill、LLM 请求及原生压缩顺序；衡量总模型调用耗时和净 token 成本。不能以摘要取代验收证据，不因功能可用而默认开启。 |
| P2 | 新版 Sidebar 和显式文件交付提供更多原生展示能力 | 评估用原生预览打开 Spec、Ticket、验证报告和交付文件；Dashboard 专注 DAG、Owner 与阻塞原因。链接必须解析到正确会话/worktree，尤其验证子代理文件与断线重连后的打开行为。 |

### 验收方式调整

旧候选的通过状态仍是历史事实，不自动继承到新版本。优先进行少量真实装配测试：启动加载、单 Owner 修改提交、双 Owner 隔离、长时间业务等待、接收后断线、终态后崩溃恢复、取消与资源回收。通过这些关键链路再运行完整候选验收。纯业务逻辑测试继续复用；涉及旧 Session 事件、旧 boot API 的 fixture 必须更新到真实新版合同，不能只修改 mock 让调用通过。

### 保留的工作流约束

保留主线程的需求讨论 → Spec → Ticket → DAG，以及模块 Owner、独立 worktree、公共 Owner 判断、Runner 收敛控制与版本化 Memory。执行部分由逐任务一次性 Owner 子会话调整为自定义 Owner Team 管理，用户仅参与需求和执行中的业务决定。官方 Agent Teams 不作为本轮执行后端；其共享 checkout 和告警式写范围不能替代现有隔离关卡。这个决定已确认，不再重复征求团队模式选择。

## 官方依据

- [固定目标发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)
- [Agent 创建接口](../../../deepseek-harness/packages/core/agent/src/index.ts)
- [子代理消息服务](../../../deepseek-harness/packages/subagent/subagent/src/index.ts)
- [持久化服务](../../../deepseek-harness/packages/session/session-persistence/src/index.ts) 与 [SessionHandle](../../../deepseek-harness/packages/session/session-persistence/src/handle.ts)
- [用户问题归属校验](../../../deepseek-harness/packages/interaction/user-questions/src/index.ts)
- [Persona 配置](../../../deepseek-harness/packages/preset/persona/src/index.ts)
- [V3 迁移限制](../../../deepseek-harness/packages/session/session-format-v2-to-v3/README.md)
- [Agent Teams 能力与限制](../../../deepseek-harness/packages/experimental/agent-team/README.md)
- [Team 成员创建实现](../../../deepseek-harness/packages/experimental/agent-team/src/roster.ts)
- [Team 请求类型](../../../deepseek-harness/packages/experimental/agent-team/src/types.ts) 与 [continuable provider 合同](../../../deepseek-harness/packages/subagent/subagent/src/types.ts)

本清单基于已切换到目标发布提交的实际源码检查。它是后续实施依据，不是兼容性通过报告。
