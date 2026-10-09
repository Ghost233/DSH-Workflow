# KnoxCoder 的 harness / Jev 接线与 DSH 可借鉴点

调研日期：2026-10-07（Asia/Shanghai）。固定源码提交：`9c95ed54481068a23aaf0d05a496d6addcda2b42`（GitHub main 查询时提交时间 2026-10-07T06:22:39Z）。本轮使用 Ghost233 身份只读获取源码，并对照项目官方文档；未安装、运行 KnoxCoder，未调用 Jev，未修改 DSH 或第三方代码。[固定提交](https://github.com/knoxchat/knoxcoder/commit/9c95ed54481068a23aaf0d05a496d6addcda2b42)

## 结论

**可以参考它把 Jev 做成 harness 内部的可选判断组件，尤其是语义防循环、超预算历史评分、超时和熔断。它没有把连续代码生成/工具规划交给 Jev。** 主 LLM 仍在每个工具轮次生成下一步，Jev 用于外围有限判断。不同入口的接线范围不同，不能把所有 `core/jev/` 模块都当成当前普通 Agent 会话中必然生效的能力。

与之前 dsh-jev-prune 相比，KnoxCoder 的历史方案是在现有预算/保护规则下混合语义评分，没有提供同样的“整段历史换确定性回执”机制。结构值得学习，真实质量、总费用和耗时收益仍需单独验证。

## 1. 首先区分两条产品入口

### 普通原生 Agent 模式：共享循环

GUI 的 `sharedLoopEligible()` 要求 Agent 模式、模型支持工具且不是旧 slash 命令。满足时调用 `knox/runChatTurn`；宿主转 `runSharedChatTurn()`，从用户选定的 `modelTitle` 解析 LLM，构建请求后调用共享 `runAgentLoop()`。[GUI 分支](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/src/vs/workbench/contrib/knox/browser/gui/controller/sharedTurn.ts#L41)、[宿主 RPC](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/host/extension/VsCodeMessenger.ts#L1012)、[共享执行入口](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/host/extension/sharedChatTurn.ts#L154)

`collectAssistantTurn()` 直接调用 `llm.streamChat(messages, signal, {tools})`；模型产生工具调用，执行器处理权限与实际执行，记录结果并开始下一轮。这条循环接入 `detectDoomLoopWithJev()` 和异步 compaction；没有在所追踪的入口调用 `evaluateAgentTurn()`、输出引用检查或输入 guardrail。流失败后的 fallback LLM 是重试机制，与 Jev 低置信升级不是同一件事。[LLM 轮次](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/agent/loop.ts#L502)、[循环与语义检查](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/agent/loop.ts#L689)

### 普通流式聊天 / 旧入口：Jev 回合判断

不满足共享循环条件时，GUI 调用 `llm/streamChat`。这个 backend 的 `llmStreamChat()` 在最后一条消息为 user 时自动调用 `evaluateAgentTurn()`，并接入路由、技能提示及输出检查。[GUI 的入口选择](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/src/vs/workbench/contrib/knox/browser/gui/controller/stream.ts#L484)、[流式聊天接线](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/llm/streamChat.ts#L146)

因此“仓库有模型路由”成立，“当前普通 Agent 开发模式每次都让 Jev 路由模型”不成立。未来版本可能调整，结论限定于上述固定提交。

## 2. 回合判断如何构造与消费

这是程序直接调用 Jev，不要求主 LLM 先输出一次 Jev 工具请求。

代码构造 state：用户消息最多 8,000 字符；最近四条 user/assistant 文本每条最多 600 字符；auto profile 需要确认时加工作区线索。第一次请求把以下固定问题合并：

- Choice `route`：`view_read / chat / chat_high / clarify`。
- Noul `needs_mutation`：是否需要修改文件、生成测试或执行命令。
- Score `difficulty`：查阅、局部修改、复杂系统工作三个级别。
- 如果有技能目录，加技能 Choice 与三项技能适用 Noul。
- 输入 guardrail 的判断；工作区线索含糊/冲突时加 profile Choice。

[批量问题与 state](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/turn.ts#L228)、[集中维护的问题定义](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/questions.ts)

结果由代码解释：route confidence <0.55 留在 Chat；需要修改的概率 >=0.6 时阻止路由到只读/澄清；难度较高时保持 Chat。`view_read` 选择预先配置的 View/Read LLM；`chat_high` 在当前流式入口提升 reasoningEffort，不自动查找一个更强型号；`clarify` 注入先澄清提示，但 Chat LLM 仍运行。该入口也会按 route 移除工具 schemas。[路由组合](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/turn.ts#L145)、[实际模型/推理配置变化](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/llm/streamChat.ts#L193)

这主要调节后续 LLM 的配置和提示，不能据此声称跳过了原任务的 LLM 调用。阈值也不是跨模型通用正确率。

## 3. 最适合参考的两个开发循环机制

### 语义防循环：确定性规则先检查，Jev 补充语义判断

`detectDoomLoopWithJev()` 先执行原有调用指纹检测；命中就直接处理，不调用模型。未命中时，低成本预筛只在近期调用足够多且出现同名重复或至少两次失败时放行。Jev 对截断的近期工具名、参数、成功状态、输出头部回答两项 Noul：是否重复失败策略、是否有进展。两项达到对应条件时返回 `same_strategy`。[完整判断模块](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/doomSemantic.ts)

共享 Agent 循环在启动/工具批次完成后调用检测。命中后阻止剩余循环动作，注入结束说明并再调用一次 LLM 汇报，最终返回 `doom_loop`。它没有让 Jev 创造修复方案，也没有在命中后自动升级强模型继续修复。Jev 出错默认返回无语义命中，原有规则仍有效。[循环中的消费路径](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/agent/loop.ts#L670)、[工具批次后的检测](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/agent/loop.ts#L996)

对 DSH 的可借鉴点：首先用退出码、重复调用和状态变化过滤；只有规则无法区分“有效尝试”和“换说法重复失败”时才问 Jev。是否只是提醒主 LLM重新规划，还是终止循环，属于我们的产品决策；不能把 Knox 的停止策略当成必然正确的开发策略。

### 历史评分：在超预算时混合模型评分，保留代码规则

现有 compaction 顺序是去重、摘要、相关性裁剪、最终截断。异步路径只有仍超预算时才进入 Jev 相关性重评分；默认 `useLlmSummarization=false`，但启用它仍会调用独立 LLM 摘要，Jev 不负责生成摘要。[compaction 管线](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/compaction/index.ts#L516)、[默认配置](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/compaction/types.ts#L35)

代码先做启发式评分，Jev 最多重评八条非保护消息，每条只发前 1,500 字符。Score 为 0–2，confidence <0.55 时不更新；有效结果按 `0.5*原 relevanceScore + 0.5*(Jev score/2)` 混合。失败保留原分数。系统消息、最近消息等保护标记不交给 Jev 改写。[Jev 重评分](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/compactionScore.ts)、[超预算触发与最终消费](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/compaction/contextPruner.ts#L250)

值得保留的是“模型只辅助排序，代码仍管预算和保护”。但这是有损选择，不是证据完备保证：正文截断可能漏掉中间错误，强制缩到预算仍会删相对低分内容。该模块注释说仅替代关键词部分，实际表达式混合的是整体 relevanceScore，不应把注释读成仅改变一小部分权重。

## 4. 其他模块的实际范围

| 模块 | 实际作用 | 接线/限制 |
|---|---|---|
| 技能建议 | 第一次批量请求初选技能，第二次只看 top 3 的短正文再确认；注入技能提示，不自动执行技能 | `llmStreamChat` 入口；第二次失败默认用初选。普通共享 Agent 入口没有这段回合调用。 |
| 工具 gate | `shouldGateTool()` 恒 false，`gateToolCall()` 恒 allow，且不调用 Jev | 当前已撤去 Jev 的逐工具准入。仍保留接口与清除旧拒绝记忆的函数。 |
| 引用与输出检查 | 文本生成完成后，对引用与输出做判断，追加提示/记录 | 流式聊天入口；内容已逐块 yield，不能称为生成前拦截或未泄露保证。 |
| auto profile | 工作区线索含糊/冲突时辅助选择 default/rust/systems；显式选择不覆盖 | 各入口覆盖不同；这会影响项目相关工具与验证策略，属于 Knox 的语言特定设计。 |
| trace 评分 | 标注工具是否相关、忽略失败验证、削弱测试、最终结果 | 手动/离线诊断，官方 eval 文档要求不要作为 CI golden 的真实模型评判。 |
| Memory Brain | 本地记忆、检索与上下文注入 | 本轮追踪的 ContextBuilder 对 Jev 只引用旧工具拒绝内容过滤；不能据此认定整个记忆系统由 Jev 实现。 |

[技能两阶段](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/skillSuggest.ts)、[工具 gate 的当前实现](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/toolGate.ts)、[流后检查](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/llm/streamChat.ts#L425)、[trace 说明](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/eval/README.md#optional-jev-trace-scoring-not-ci)、[Memory ContextBuilder](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/context/memory/brain/ContextBuilder.ts#L1089)

## 5. 故障与耗时控制，比单个接口更值得参考

默认关闭，默认失败回到原有规则；固定模型 `jev-1.13.0`。harness 使用 `api.knoxstudio.ai/v1/systemone` 和 Knox 凭据，忽略自定义 baseUrl，不能把它当成随意切换供应商的通用接入包。[运行配置](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/config.ts#L113)、[HTTP 传输](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/client.ts#L246)

耗时有两层：配置默认值是 8,000ms，HTTP client 重试共用一次调用的剩余时间；真实生产 `resolveJevClient()` 还包一层 `wrapJevClientWithGuard()`，将 gate 请求限制到 800ms，其他/未指定用途限制到 2,000ms，使用 abort 与 Promise.race。连续三次失败开启五分钟熔断，并记录用途、题目 ID、耗时、结果和异常。技能二次确认等多个调用仍可能串行累计，2s 不是整个用户回合的总额外延迟。[默认值](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/questions.ts#L18)、[真实包装路径](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/client.ts#L383)、[预算/熔断](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/guard.ts)

guard 文件注释称没有发送文件内容，但 compactionScore 实际发送消息前缀、citation 发送源文本，这些可能包含代码/工具结果。应按真实请求内容判断数据边界，不能照搬该注释。这里是接线事实，未检查服务器实际存储行为。[重评分 state](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/compactionScore.ts#L81)、[引用 state](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/citation.ts)

## 6. 公开效果证据

公开代码可以核实结构和规则，但没有从本轮官方资料与相关测试中核到 Jev 开/关的真实开发任务 A/B、总费用、总耗时、成功率及原始会话记录。`labeledTurns.test.ts` 使用预置模型答案，不访问网络；guard 测试使用 fake client 验证超时和熔断。Agent golden eval 使用 scripted LLM，证明执行与权限合同，不能当作模型实际能力或 Jev 节省轮次的证据。[预置答案回归](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/labeledTurns.test.ts)、[guard 测试](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/jev/guard.test.ts)、[eval 的边界](https://github.com/knoxchat/knoxcoder/blob/9c95ed54481068a23aaf0d05a496d6addcda2b42/extensions/knox/src/core/eval/README.md)

官方通用 Jev API 文档还标注每次成功请求最低收费 $0.0001，因此不能只用 token 单价推算这个 gateway 的大量短调用费用。本文没有对当前账单做复测。[官方 API 文档](https://docs.knoxstudio.ai/jev/)、[文档侧核验](./official-docs.md)

## 7. 与我们的 DSH 结合，建议参考什么

以下是设计建议，不是本轮实施或已启用功能：

1. 在自研插件中建立一个小的 Jev 判断服务。集中维护固定问题、类型验证、短超时、取消、失败回原规则、熔断和计量。避免各处分别调用、分别重试。
2. 优先考虑语义重复失败提示。DSH 的 `tools/post-execute` 可以记录结果，`agent/pre-step` 可以读取当前步骤并决定是否提示重新规划。先做提醒/观察，实际退出码、权限、验证结果仍由代码和执行证据决定。
3. 上下文评分限定为已有确定性保护后的候选，模型仅提供额外信号。接线放在当前 Agent preset 的 compaction 服务作用域，不能让根插件误接管所有会话；不从 Knox 的任意消息数组删除直接复制成 DSH 的 durable surface 操作。
4. 技能建议可从当前 `ctx.skills.list()` 的目录初选，只给出少量提示，正文仍按需读取。请求范围不包含隐藏/用户禁用技能。
5. 模型与 reasoning 配置可使用 DSH 的 `agent/request` 扩展点，但应按回合锁定并尊重用户模型选择，另测切换造成的缓存影响。不是所有轻任务都值得多发一次 Jev 请求。

[DSH post-execute 扩展点](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/core/tools/src/index.ts:176)、[pre-step](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/core/agent-loop/src/agent.ts:267)、[模型调用配置扩展点](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/core/agent-loop/src/agent.ts:577)、[技能目录](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/skill/skill/src/index.ts:470)

不照搬其 Rust/Cargo/Make 项目识别和自动环境处理；当前 Workflow 的工程环境边界由 Spec/Ticket 固定验证命令和实际退出证据定义。Jev 判断也不能替代 Owner 候选封存、验证、集成或用户授权的权威状态。[仓库约束](/Users/ghost233/Ghost233Code/DSH-Workflow/AGENTS.md)、[领域边界 ADR](/Users/ghost233/Ghost233Code/DSH-Workflow/docs/adr/0002-independent-dynamic-workflow-plugin.md)

**优先顺序：先借鉴调用预算/回退与可观测性，再验证语义防循环，随后验证非关键上下文评分。** 这比直接启用一个让模型替全部旧历史判去留的默认方案更容易把质量和收益分开测量。验证仍须比较同模型、同任务下的完成质量、无效轮次、总耗时、重读次数及真实费用，不能由源码设计推定通用提速倍数。
