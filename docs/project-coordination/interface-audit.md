> 实施基准更新（2026-11-11）：用户已授权保持 DSH `0.2.2-rc.1`，采用 Tobs 上游固定提交 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab` 的官方构建。以下历史版本核验保留为决策依据；运行时契约以 `docs/analysis/2026-11-10-tobs/runtime-contracts.md` 和 `vendor/tobs.upstream.json` 为准。

# Tobs 接口核验

## 证据基准

核验日期：2026-11-10。

- 最新公开发布版：[v1.6.1](https://github.com/BotHarness/DeepSeekBot/releases/tag/v1.6.1)，发布时间为 2026-11-02。
- 本轮固定主干：[2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab](https://github.com/BotHarness/DeepSeekBot/tree/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab)。
- 较早缓存基准：6084c49b7c5c6acc844a9fe064a32aa7c5a155bc。只作为检索起点，不与本轮主干混合作为最终证据。
- 核验方式：只读文档和源码对照。没有运行集成测试，没有启动或修改现有 Tobs/DSH 服务。

## 已发现的关键边界

### CLI 消息身份

接入调查确认，CLI `send` 经过 Bridge `channelSend`，把作者固定记为 Human。这条入口不能直接承载任意 GitHub 发起者的请求。定稿方案采用插件队列、系统唤醒和 Agent-local 工具，保留独立来源与授权判断。

### 外部直接派工的版本差异

执行调查已对照主干与 v1.6.1：发布版将 `create_assignment`、`send_assignment_request` 和 `wait_for_assignment` 限定为 Orchestrator Turn 内工具。主干已允许外部直接创建和继续 Assignment，但等待接口仍限于 Turn。

这意味着发布版方案不能依赖外部进程直接调用前两项工具。本方案由插件唤醒负责人，再由负责人的 Orchestrator 调用原生工具派工。

## 稳定版可以使用的接缝

以下结论以 v1.6.1 源码为依据。它们是已发布接口形状的核验，尚未完成实际集成验证。

| 需要的能力 | 接缝与真实边界 | 证据 |
| --- | --- | --- |
| 获取 Tobs 服务 | 插件注入 `botharness`。`BotHarnessCore` 包含 schedules、grants、runtime 和 ownership 等服务。 | [core 定义](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L442)、[提供服务](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L1602) |
| 注入会话工具 | `contributeBotAgentSetup` 覆盖 Orchestrator 和 Assignment。回调获得真实 Agent、botSlug 和 rootRole。Tobs 自己用这个入口注册工具。 | [hook 类型](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L458)、[实际用法](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L1647) |
| 非 Human 唤醒 | `core.schedules.runNow(botSlug, scheduleId)` 产生 system 来源的 Schedule 事件。 | [Schedule 事件](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L432)、[runNow](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L702) |
| Bot 内派工 | 负责人 Orchestrator 使用 `create_assignment` 和 `send_assignment_request`。稳定版禁止外部 direct runner 调用这两项工具。 | [Turn 限制](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L61) |
| 查询真实执行 | `runtime.listAssignments(botSlug)`、`getAssignment(botSlug, sessionId)` 以及 ownership 查询。可核对 Session、Continuity Key、Grant 和原生来源。 | [列表](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/bot-runtime.ts#L4214)、[详情](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/bot-runtime.ts#L4377) |
| 读取原生报告 | `inspect_assignment` 支持报告身份与分页。原生状态只描述当前执行，不包含插件父子任务和验收结构。 | [报告读取](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1461) |
| 管理工作区权限 | `grants.create`、`revoke`、`setOrchestratorWrite`。受信任插件可以在用户预授权范围内调用；上下级关系不会自动继承 Grant。 | [Grant 方法](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/workspaces/grants.ts#L45) |
| 注册 worktree 目录 | 配套 DSH 0.2.1-rc.3 公开 `workspaceRegistry.create/get/list`。create 只规范化现有目录并注册，不安装依赖或改写 Git 文件。 | [Tobs 调用](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L1488)、[发布包契约](https://unpkg.com/@deepseek-ai/dsh-workspace@0.2.1-rc.3/lib/types/index.d.ts) |
| 自动创建成员 | `core.creations.create(input, operationKey)` 提供创建回执和恢复查询。岗位模板、模型计划和目录权限须分别配置。 | [创建服务](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/bots/creation.ts#L128) |
| 暂停成员并保留记忆 | pause 会设置 Bot paused，但不会自动停止全部执行，也不保证成员已交接。插件先完成成员收尾。 | [暂停行为](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/bridge/methods.ts#L4175) |

## 系统 Schedule 作为唤醒信号

可为负责人配置一个禁用周期执行、锁定修改的专用 Schedule，再由插件调用 `runNow`。这是既有接口的组合，不是 Tobs 原生 GitHub Source。

- `tick` 只处理 enabled 的到期记录，因此禁用的专用 Schedule 不产生额外周期唤醒。
- `runNow` 不要求 Schedule 已启用或已到期，但要求 Bot 存在且未暂停。
- `locked` 限制 Bot 修改或删除配置，不是插件接入开关。
- 插件必须有自己的接入启用状态。
- 配置的 creator 描述所有者授权来源；实际触发事件的 author 仍是 system。
- 一次未观察唤醒可以合并。插件先保存事件，再发信号；负责人醒来后分页领取自己的待办。
- 领取未确认、信号失败、剩余分页和重启遗留事件，都由插件重新检查。不能依赖一次 Schedule 对应一个 GitHub 事件。

证据：[配置和方法](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L60)、[tick](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L536)、[创建](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L608)、[runNow](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L702)。

## 派工、报告和恢复的限制

Assignment 只属于一个 Bot，原生报告回到这个 Bot 的 Orchestrator。它不会直接向插件任务树的上级 Bot 汇报。插件需要自己的结构化接单、拆分、进度与验收工具。

进度报告可能在 Inbox 中合并。Activity 实时流没有持久恢复游标，适合提示变化，不适合充当完整业务日志。报告历史正文还受 Session 持久化和清理影响；需要保留的交付证据应由插件独立保存引用和结果。

Continuity Key 不是严格幂等键。忙时会拒绝，闲置时可能再次投递指令。因此超时后不能盲目重发。插件先记录派工 ID，再核对原生 Bot、Session、Key、Grant、Workspace 和来源；多个候选或记录不符时停在待核实状态。

稳定版 Host 恢复时会把原来 working 的 Assignment 标记为 error，清除 Continuity Key，并明确通知未自动恢复。插件必须持久保存派工 ID 与 Bot、Session 的绑定，不能只靠 Key 在重启后查找。回复丢失且尚未绑定 Session 时，需要结合专属 Grant、来源和创建时间对账；无法唯一定位时进入待核实状态。[稳定版恢复证据](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/bot-runtime.ts#L5574)

## 权限和生命周期

原生 Grant 检查授权快照与当前 Workspace 是否一致。插件还必须核对执行根目录、真实路径、Git 仓库归属以及任务授权。变更目录需要新 Workspace 和 Grant；撤销 Grant 不代表已经停止全部执行。

`contributeBotAgentSetup` 注册回调时不会扫描已有 Agent，取消 hook 也不自动撤销旧工具。插件需保留工具注册的清理函数。首版应先加载插件，再建立相关 Agent；对已运行 Bot 的接入要作为受控配置迁移，不得静默中断工作。[hook 生命周期](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L977)

## 真实发布包

已静态核验 npm registry 元数据与公开 tarball。`@botharness/core@1.6.1` 真实发布物提供根 ESM 入口和 `dist/index.d.mts`，声明明确导出 BotHarnessCore。可以从包根引用类型，成员服务的类型可从 core 类型取得。

`@botharness/tobs` 和兼容包 deepseekbot 的根入口没有对应类型接口，不应从它们的未公开子路径导入内部实现。源码工作区清单中的 private 标记不能代替实际发布清单。

证据：[core 发布元数据](https://registry.npmjs.org/@botharness%2Fcore/1.6.1)、[实际发布 tarball](https://registry.npmjs.org/@botharness/core/-/core-1.6.1.tgz)。本轮没有做工具链编译验证。

## DSH Workspace 和真实调用者

Tobs v1.6.1 固定配套 DSH 0.2.1-rc.3 系列。公开 Workspace Registry 的 create 接受已存在绝对目录，执行 realpath 与目录检查；同一规范路径复用现有 Workspace。它会改变 DSH 的注册记录和项目展示顺序，但不会创建目录、安装依赖或执行项目命令。不要混用会创建目录的 initializeDefault。

Agent-local 工具能取得实际 Agent 与 Session。插件应结合 setup 回调给出的 botSlug、rootRole、ownership.resolve 和 getAssignment，核验调用者。原生 parentSession 等字段只表示会话关系，不等于业务父任务或 GitHub 授权来源。

证据：[Tobs 配套版本](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/package.json#L20)、[Workspace 公开类型](https://unpkg.com/@deepseek-ai/dsh-workspace@0.2.1-rc.3/lib/types/index.d.ts)、[持久归属类型](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/sessions/ownership.ts#L5)。官方发布包仅下载、校验并静态阅读，没有安装或运行。

## Bot 创建与模板

创建服务的 operationKey 可以恢复已经保留或创建的身份。同键不同输入会冲突，不能靠重试复活已归档或删除的旧身份。新成员须使用受信任模板，分别配置 Model Plan 和 Grant；模板描述中的 roles 标签不是插件授权角色。

模板导入不会自动复制运行记录、其他成员的 Model Plan、Grant 或密钥库。模板正文仍可能包含作者写入的敏感内容，插件只允许预授权模板。成员归档前先收尾，确认没有未交接任务及活跃执行，再暂停身份并保留记忆。

证据：[创建输入](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/bots/persona-bot.ts#L65)、[创建恢复](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/bots/creation.ts#L295)、[导入行为](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/bots/registry.ts#L583)。

## 不能直接复用的入口

- `channelSend` 固定使用 Human 作者，不能用来提升外部请求权限。
- `admitExternalSource` 要求已有 IM 来源，不能注入任意 GitHub ID。
- IM Provider 的 channel 类型未包含 GitHub，注册 Provider 不等于支持 GitHub 事件。
- 外部 CLI/RPC 是所有者管理入口，凭据不能暴露给 GitHub 来稿方。
- 不写 Tobs 内部数据库，也不导入未公开的源码深层路径。

## 聊天授权的粒度缺口

稳定版 core 暴露 attention、inboxHistory 和 channels。插件可以核实某个来源已准入给实际调用 Bot，属于 Human DM，原始消息仍可读取，并从 Channel Store 取得原文。

这些记录可以包含历史消息。它们不能证明模型给出的某个 source_ref 恰好属于当前工具调用所在 Turn。普通 Bot 没有公开的通用当前 Turn 来源集合；受保护 Tob 的专用授权捕获不能当作普通负责人的接缝。

已接受的替代方案是：插件根据真实 Admission 和原文登记来源，只为近期、未受理来源签发短期、单次接单凭证，绑定 Bot、原文版本和权限。重复受理返回同一任务；历史来源不能独立开启新任务。已受理任务恢复沿用其原授权。

用户已在 Q14 接受这个替代方案。若未来把精确的当前 Turn 绑定改为硬要求，稳定版接口仍不满足该项要求，需重新设计接入方式。

Host 的 Human 类型表示所有者认证通道，不证明真人亲自在键盘输入。持有所有者凭据的脚本可以使用相同通道，插件沿用这一信任边界。

证据：[公开来源服务](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L475)、[Admission 查询](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/attention.ts#L153)、[原始消息方法](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/channels/store.ts#L323)、[受保护 Tob 的专用实现](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/bot-runtime.ts#L3633)。

## 需要隔离原型验证

1. 固定发布包的服务注入、加载顺序和工具注册。
2. 禁用并锁定的 Schedule 能否唤醒空闲及繁忙 Bot，合并时是否仍能处理全部插件待办。
3. Bot 归档、暂停、插件停用、工具卸载与残留调用的处理。
4. 原生派工后插件回执丢失时，能否依据真实目录准确对账。
5. 工作区注册、Grant 授权、真实路径变化和权限撤销。
6. Host 和模型故障后等待、恢复、人工停止保持及重复副作用防护。
7. 三层任务的接单、拒绝、拆分、报告、验收和跨仓库关联。

## 当前判断

在用户已接受的来源凭证规则下，稳定版提供了组合方案所需的主要接缝。方案必须由负责人 Orchestrator 发起原生执行，并由独立插件维护任务业务记录。不能承诺外部确定性直派、原生完整报告事件流、无中断热加载或原生自动恢复。
