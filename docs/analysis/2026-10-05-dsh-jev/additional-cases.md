# JEV 的其他使用案例：直接执行、批量判断与异常升级

调研日期：2026-10-05。补充此前的 jevcore、Jive、JevLoop、jev-ultrafast 和 DSH 插件调研。本轮检查公开源码、开发者原始记录及框架作者的示例；未配置真实 API key、未运行这些项目。性能数字均按作者测量标注，不能作为独立复测或长期生产可靠性证据。

## 1. Browserbase Stagehand：先走有界决策，必要时回 LLM

这是与“快速判断交给 Jev，复杂情况交给 LLM”最贴近的浏览器实现之一，但截至调研时 [PR #2953](https://github.com/browserbase/stagehand/pull/2953) 仍为 open、未合并，且默认关闭。它属于一组堆叠的实验 PR，不能理解为安装当前主分支就默认具备的能力。通过 GitHub API 核验的 PR head 为 `d06be1695c68bc02098eccf51550b11ec4db24a0`。

实际流程是代码收到 `act()` 指令后，先让决策模型判断动作类型；代码解析可提取的参数并从页面构造候选；Jev 选择目标并作匹配检查；满足接受条件时，原有执行器直接执行动作并读回验证。无法接受时转原 LLM 流程。无引号的自由文本参数可能先调用一个仅提取参数的小 LLM，组合按键等情况也直接走 LLM，因此不是所有路径都完全绕过 LLM。[Browserbase 作者说明](https://www.browserbase.com/blog/what-is-jev)、[该版本流程及配置](https://github.com/browserbase/stagehand/blob/d06be1695c68bc02098eccf51550b11ec4db24a0/packages/extension/services/decisions/README.md)

该版本默认 `actConfidence=0.7`、`llmFallback=true`、`argumentLlm=true`。这些阈值是在作者所用测试套件内调出来的，不是适用于所有任务的正确率保证。作者在 40 项 act 任务上报告：纯 LLM 39/40，混合方案三轮 118/120；动作中位耗时 1.97s→0.46s，147 次动作中 4 次需要 LLM。关掉 LLM 后该套件只有 27/40 通过。广度测试和报告脚本没有随 PR 完整公开，作者也注明部分功能仅有单元测试。[原始结果与限制](https://github.com/browserbase/stagehand/pull/2953)

可借鉴点：让代码在现有操作接口内部选择便宜路径，直接消费 Jev 的结果；LLM 只处理该路径无法完成的部分。实际替换掉了一些原 LLM 请求，省的不只是一次判断的生成 tokens。

## 2. LangGraph 文档审阅：分类批量执行，需要修改文本时才调用 LLM

框架作者的示例对每页文档固定询问相关性、是否含个人信息、是否可能属于需特殊审查的内容。代码根据结果决定搁置、通过、用 LLM 脱敏，或通过 LangGraph interrupt 交人工审阅。`review.py` 中代码直接用 `{protocol, page}` 和常量 `QUESTIONS` 调用 classifier，`route()` 直接消费 Score/Noul，无需主 LLM 每页先生成分类题。[LangChain 作者介绍](https://www.langchain.com/blog/building-prod-with-jev-and-langgraph)、[完整示例及路由代码](https://gist.github.com/sydney-runkle/a632ba4ea0b2b72501dfa4b6ab2a7d8a)

必须区分接线测试与效果测试：gist 的语料是六页合成文档，14 项测试不访问真实 API；作者另提供真实 classifier 对比脚本和测量表，表中每页为 Jev 0.34s、Sonnet 3.80s，路由一致为 4–5/6。博客记载另一组试验分类步骤快 5–6 倍，不能把两个记录拼成统一生产收益。LangSmith 链接存在，但本轮网页读取未能展开 trace 内容。默认 `demo.py` 现在使用 SemIf；对比脚本另外包含真实 TypeSafe Jev 通道，因此不应把所有默认运行都称为 Jev。[gist 的 corpus、Measured、compare.py、demo.py](https://gist.github.com/sydney-runkle/a632ba4ea0b2b72501dfa4b6ab2a7d8a)

可借鉴点：用固定工作流处理大量对象，仅把真正需要生成或人工介入的对象升级。精确分流策略在代码中定义，而不是每页让 LLM 重新规划。

## 3. pg-jev：SQL 直接按语义过滤、排序、分类

PostgreSQL 扩展把 `jev(row, condition)` 做成普通布尔谓词，并提供 `jev_prob`、`jev_choice`、`jev_score`。例如筛选“客户威胁取消服务”的工单，或按生气程度排序。数据库执行器直接调用模型并消费结果，全程不需要 LLM 做请求生成或结果解释。[项目与 SQL 用例](https://github.com/realZachi/pg-jev)

源码按行构造 Noul/Choice/Score 问题，把一批行放进共享 state；实现预读、并发、长连接和会话答案缓存。精确日期、算术和普通条件仍由 SQL 完成。作者在欧洲网络的 2,000 行表上记录首轮约 3.5s、100 次请求、296k 输入 tokens、约 $0.012；再次相同查询约 50ms 属于缓存命中，不能当模型推断耗时。[README 的 How it works](https://github.com/realZachi/pg-jev#how-it-works)、[请求构造源码](https://github.com/realZachi/pg-jev/blob/master/sql/jev--0.2.1.sql)

作者也记录了批量大小的失败边界：其结构化真值样本中 1–20 行一批正确率为 100%，40 行为 92–98%，80 行为 77–94%；这里涉及共享 state 中按位置引用行，不等于所有形式的多问题调用都有相同上限。回归测试使用 mock、不访问真实 API；未找到独立生产准确率报告。[同一 README 的 Why 20 rows per request 与 Development](https://github.com/realZachi/pg-jev)

可借鉴点：Jev 是程序里的语义函数；先用确定性条件减少输入，再进行有界判断，并复用相同判断结果。

## 4. Pokémon Red：代码承担状态读取、计算与按键，Jev 选行动

Christian Mathiesen 的项目从游戏 RAM 读取位置、队伍、战斗等状态，代码提供合法候选与事实，Jev 选择目的地、对话/菜单选项、战斗动作。A* 路径寻找、伤害估计、菜单操作和按键执行由代码处理。游戏循环直接调用 Jev，不要求主 LLM 逐步组织问题或解释答案。[README](https://github.com/christianmat/jev-pokemon)、[真实 Gateway 调用](https://github.com/christianmat/jev-pokemon/blob/main/src/jev/gateway.ts)、[运行循环](https://github.com/christianmat/jev-pokemon/blob/main/src/agent/agent.ts)

作者记录 2026-09-25 至 09-26 的直播通关：37h40m、16,150 次决策、约 $1.65 Jev 费用、中位决策约 0.4s，期间 16 次全队失败。项目包含视频集锦与公开落地页；这些是作者运行记录，不能与观察条件不同的其他 LLM 游戏项目直接比较能力或速度。默认 `JEV_MODE=mock`，复跑真实版本要切换 gateway 并配置 key。[结果表](https://github.com/christianmat/jev-pokemon#result)、[集锦页面](https://jev-pokemon.vercel.app/)

另一个由 Andrew Boyd 做的运行展示了不同分工：公开页面记载 Jev 在 2026-09-23 通关，Jev 负责游戏，Opus 5 监控日志并在运行时改写外围 harness。该页面支持这种“LLM 改善执行器，Jev 持续选择动作”的分工，但没有在本轮核实到完整引擎源码或可复现的自动升级策略，不应称为每次异常自动交 LLM 的固定协议。直播已经结束。[作者原始页面](https://jev-plays-pokemon.standardagents.ai/)

## 5. Vercel eve：推理开始前由 Jev 选模型

`auto` 从开发者配置的允许列表中选择 agent 模型，默认评估器为 `typesafe-ai/jev`。选择发生在推理前；同时也允许应用或工具代码直接调用 `evaluate` 获取类型化判断。它为简单请求选择便宜 LLM、复杂请求选择能力更强的 LLM，而不是自己完成原任务。[当前 evaluate 指南](https://github.com/vercel/eve/blob/main/docs/guides/evaluate.md)

本轮未找到这条路由本身的独立质量/费用对比，AI SDK evaluation 规范也仍被标记为 experimental。可借鉴点是控制推理预算；与直接用 Jev 完成某个操作的方案应分别理解。

## 独立业务案例补充

Home Assistant、邮件分类及语义表单校验等源码与作者测量见 [additional-cases-independent.md](./additional-cases-independent.md)。

## 对 DSH 创造模式的启发

以上实现支持优先考虑三类需求：已有固定处理函数之间的语义分流；大量对象的筛选/排序/评分；候选动作及参数已足够明确的执行步骤。共同点是程序预定义问题并从实际状态构造输入，代码直接消费结果。需要任意新内容、参数无法绑定或问题范围不明确时，再让 LLM 接手。这个判断是本轮源码对比后的归纳，不是已对 DSH 执行循环做出的性能验证。

本轮只补充调研笔记，没有安装案例、接入真实 Jev 或修改 DSH 服务。
