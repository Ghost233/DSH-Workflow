# Kingsley dsh-plugin-harness2 与 Google Harness² 的算法比较

调研日期：2026-10-27。本文是源码审计，未安装依赖，未调用付费模型，未运行测试。当前工程兼容性和运行验证见同目录的 analysis.md。

固定版本：

- Kingsley：`d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40`，包版本 `0.2.0`。
- Google：`1cfe254e8d25b15f37048c3730134686abe60335`。

## 判断

Kingsley 保留了原版方法的主要阶段：参考执行、INV/DOM 两类提案、实际 Probe、Compose、最终产物选择和跨任务经验。每次执行确实由独立 DSH SDK 进程完成，支持真实工具和产物。

它是 JavaScript 重写。它没有调用 Google 的 Python 核心，也没有完全保留原版的编辑器、选择器、失败恢复和经验库契约。因此，可以把它视为 DSH 原生的同类实验实现，不能把论文的效果和完整契约直接归给它。

来源：[Kingsley 引擎导入与本地实现](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L1-L16)、[作者设计定位](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/DESIGN.md#L1-L20)。

## 实验调度

| 项目 | Google 原版 | Kingsley |
|---|---|---|
| parallel | `k` 次 Base、`2k` 次候选 Probe、`k` 次组合执行，共 `4k` 次任务执行 | 数量相同；每个提案生成后立即在同一个并发槽执行 Probe，然后处理下一个候选 |
| sequential | 起始 `k` 次 Base，随后 `k` 轮，每轮两次候选 Probe、一次组合执行，共 `4k` 次 | 起始 `k` 次 Base；第二轮起，每轮额外执行一次当前配置参考，共 `5k−1` 次 |
| k=1 | 一次 Base、INV、DOM、Compose；不启动最终选择器 | 一致 |
| k>1 选择池 | 只包含 `k` 个组合最终结果，不包含 Base 和中间候选 | 一致 |
| 继续深化 | 后续 Propose 和 Compose 都能查看累计历史与前面决策 | Propose 有累计执行历史；Compose 只获得当轮参考、候选和经验，没有此前轮次的提案/组合决策 |

来源：[Google 并行](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/recursion.py#L343-L449)、[Google 顺序](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/recursion.py#L452-L565)、[Google 最终选择池](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py#L93-L111)、[Kingsley 调度](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L176-L218)。

这里的次数是任务执行次数，不能当作 API 请求次数。一段执行可能包括多轮模型和工具调用。此外，还要计算提案、组合、反思，以及 k>1 时的选择会话。作者也记录了 sequential k=2 是 9 次执行，parallel k=2 是 8 次。[验证记录](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/VALIDATION.md#L3-L10)。

## 编辑器和证据

原版把任务、原始输入、参考执行、候选配置、配置差异、决策和经验库放在文件树中，让编辑器使用自己的 Agent 工具按需阅读。Kingsley 把配置和执行事件序列化进单条提示，由无工具的编辑会话返回 JSON。前者编辑真实文件，后者返回替换整个组件的 `edits` 对象。

来源：[Google context.build](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/context.py#L105-L188)、[Google 文件编辑契约](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/prompts.py#L179-L193)、[Kingsley 编辑调用](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L169-L171)、[Kingsley 禁用编辑器工具](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/worker.mjs#L95-L100)、[Kingsley 整组件替换](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/harness.mjs#L74-L84)。

Kingsley 的 Propose、Compose、Reflect 提示没有直接提供原始输入文件。编辑会话的 workspace 是新建空目录。它能看到 task.prompt 和执行事件，因此只能通过此前执行读取到的内容间接了解源材料。原版则复制 task source 供编辑器读取。这对需要重新核对原文件、查看未读输入的任务有实际影响。[Kingsley 创建试跑和编辑目录](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L161-L171)、[提示构建](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L192-L218)、[Google 源材料复制](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/context.py#L129-L136)。

Kingsley 检查单条轨迹序列化后不超过 300,000 字符，但会把多条轨迹直接拼接到提示中。代码没有对应的聚合提示长度检查，runner 固定 `DSH_CONTEXT_WINDOW=65536`。因此，大 k 或工具输出很多时仍可能超过模型窗口。这是源码推断，未做压力测试。[单轨迹检查](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L18-L21)、[轨迹聚合](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L192-L218)、[上下文窗口](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/runner.mjs#L75-L84)。

## 选择器

两者都隐藏候选配置，只在组合结果中选择。原版把候选标识按固定随机种子打乱，提供 task source 和适配器生成的文本、图片或其他可读资产。Kingsley 按组合产生顺序编号为 output-0、output-1，没有打乱顺序，也没有把原始未修改输入提供给选择器。

Kingsley 只把最终回复、改动或新增文件的 UTF-8 正文，以及删除文件名放入选择提示。未改输入根据 path/hash 被排除。单文件大于 150,000 字节，或 UTF-8 解码出现替换字符时，选择阶段直接失败。因此，k>1 对 DOCX、XLSX、图片等新二进制产物需要额外渲染适配；k=1 因跳过选择器而不触发这项检查。

来源：[Google 匿名打乱](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py#L71-L76)、[Google source 与资产](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py#L298-L325)、[Kingsley 产物视图](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L24-L36)、[Kingsley 选择](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L209-L215)。

没有打乱顺序会减少匿名设计对位置偏好的防护，但不能仅凭源码断言模型一定偏选某个结果。

## 无效提案和失败

原版无效编辑会反馈错误并重试一次，仍失败时回退当前配置。执行异常会保存为失败 RunView，其他候选仍能继续。最终选择器异常有标记为 fallback 的已有结果，且保留失败状态。

Kingsley 支持合法的空 edits，等价于保留当前配置。但 JSON 解析、组件校验、执行、选择或反思失败，会直接进入实验级 catch，状态为 failed、cancelled 或 budget_exhausted。没有原版编辑重试一次和候选失败继续执行的策略。续跑会校验并复用 completed 阶段，从失败阶段建立新的 attempt。

来源：[Google 编辑重试/回退](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/recursion.py#L135-L250)、[Google 失败执行记录](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/recursion.py#L260-L300)、[Google 选择回退](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py#L237-L252)、[Kingsley 缓存和阶段失败](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L135-L159)、[Kingsley 整体终态](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L247-L257)。

因此，它对结构化输出可靠性的要求更高；一次反思 JSON 失败也会把已经交付的任务实验标为 failed。应区分任务产物是否生成和整个实验是否完成。

## 八组件的实际映射

| 组件 | Kingsley 映射 | 与原版的关系 |
|---|---|---|
| system_prompt、guardrails、tool_guidance | 追加到 DSH SystemPrompt section | 保留可编辑文本作用，但不是替换 DSH 自身全部系统提示 |
| memory | DSH systemPrompt.context | 作为试跑上下文，不等同于日常项目经验采用 |
| skills | scoped.skills.register，运行时 Skill | 独立于原版 SKILL.md 文件树；有 description/body |
| scripts | h2_script 工具，生成 ES module，Node permission，15 秒限时 | 原版以 Python helper 为主；脚本格式不可直接互换 |
| subagents | h2_delegate 新建独立 DSH SDK 会话，最多一层，分享试跑 workspace | 有独立会话，但未继承冻结 baseline/profile |
| plugins | 可编辑 JS ES module，beforeTool/afterTool/beforeStep/beforeTurnEnd，常驻子进程执行 | 是 DSH Hook 映射，不是原版 OpenCode TypeScript Plugin 或 Codex hooks.json 的直接加载 |

来源：[文本/技能/脚本/委派](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/worker.mjs#L40-L100)、[Hook 接入实际生命周期](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/worker.mjs#L106-L192)、[Hook 子进程](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/hooks.mjs#L25-L52)、[Google editable surface](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/prompts.py#L95-L193)。

原版有 always-on 字符预算、Skill 触发声明、脚本引用和 Python 编译等验证。Kingsley 主要校验 JSON 类型、命名、禁止列表和 Hook 返回协议；没有相同的配置树校验。因此，“八组件都有”不等于配置与执行语义逐项一致。[原版校验](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/tree.py#L336-L375)、[Kingsley 组件校验](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/config.mjs#L25-L55)。

## 模型、任务和环境

Host 启动实验必须提供 sourceRun.sessionId 和 turn。sourceRun 读取原请求头，固定 provider、model、reasoningEffort、maxTokens、temperature 和 stop；它不恢复原聊天全文，也不自动生成原任务 prompt 或当时输入文件。task.prompt 和 inputDir 仍须另行提供。[Host 入口](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/index.mjs#L38-L65)、[来源参数提取](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/source-run.mjs#L1-L35)、[输入快照](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L48-L63)。

执行侧使用来源模型；编辑、组合、选择和反思使用独立 editor 配置，默认 deepseek-official/deepseek-flash。编辑器并不继承来源模型，这是有意的配置契约。[配置](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/config.mjs#L58-L84)。

默认 baseline 是 sdk-minimal。可以通过 sourceHome/profile/patches 捕获 SDK profile，并固定已解析插件入口和输入文件，但不会自动克隆现役 Web 会话全部状态。环境只转发白名单变量，包含 DEEPSEEK_API_KEY/BASE_URL，未复制用户凭据存储。[profile 捕获](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/harness.mjs#L26-L67)、[进程配置](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/runner.mjs#L40-L84)。

代码推断：编辑会话不传 baseline，委派子代理也不传 baseline，因此均退回默认 sdk-minimal。委派子代理还退回 workspace 工具策略。若来源 provider 只由父试跑冻结 profile 中的插件注册，子代理不会自动取得同一个路由和原生工具。该场景未实测，不应宣称可直接复用所有现役模型入口。[编辑器调用](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L169-L171)、[子代理调用](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/worker.mjs#L77-L89)、[runner 回退](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/runner.mjs#L54-L84)。

## 经验入库和后续复用

原版把整棵采用配置树、经验和采用原因按领域/实验设置存储，后续编辑会话按需查看。它不是把上一任务配置直接变成下一任务基础配置。[原版存储](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/library.py#L106-L180)、[原版领域任务调度](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/schedule.py#L669-L713)。

Kingsley 的入库规则要求：选定配置的组件确有修改、该组件可编辑、反思中存在该组件的 helped 行；经验还须引用至少两个实际 trial 的实际事件。相比原版主要解析 cue/lesson/evidence 的方式，多了结构检查。但代码只检查引用是否存在，没有验证两次试跑是否只差这一处改动，也不独立验证 helped 的语义，因此仍是模型判断的行为对比。[Kingsley 入库](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L218-L236)、[原版反思解析](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py#L454-L505)。

规则满足后直接入库。下一个实验按 domain、runtimeVersion、禁止组件筛选，按 cue 与任务词重合排序，默认取六条。profile/model/组件完全匹配时提供配置资产；不匹配时去掉 harness，只提供待重验经验。同一个 dataDir 没有按 workspace、tenant 或项目路径隔离，也没有项目采用、学习开关或经验使用开关。[经验库实现](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/library.mjs#L6-L46)、[默认上限](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/config.mjs#L80-L84)。

另一个方法差异：Kingsley 只允许给选定结果确实改动的组件记录经验。原版反思提示允许从被拒绝候选中提取有效经验。Kingsley Reflect 没有收到 Propose hypotheses 或 Compose decisions 的记录，只收到基线、选定 trial ID 和全部执行；原版反思包含决策与完整配置对照。[Kingsley 反思输入和入库门槛](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L218-L235)、[原版反思证据](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/selection.py#L402-L448)、[原版经验要求](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/prompts.py#L1105-L1160)。

确定性 obligations 在反思和入库之后才评估。它支持 file-exists、file-contains、json-equals，结果分 met/unmet/unknown。它没有以全部验收通过作为经验入库前提，也始终把 qualityEvaluated 标为 false。这不等于偷偷给编辑器答案，但也不能把 supported 当作经过业务验收。[执行次序](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L224-L246)、[确定性检查](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/evaluate.mjs#L4-L30)。

## 可直接影响采用决定的事实

1. 版本硬门槛：freezeBaseline 明确只接受 DSH 0.2.1-rc.2。rc.3 会在实验创建时被拒绝。这是源码硬限制，不只是 package.json 声明。[版本检查](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/harness.mjs#L26-L31)。
2. 真实任务由 DSH SDK 执行，满足“以 DSH 作为执行端”的方向；它不需要 Google Python 服务，但也没有复用原版核心。
3. 原版论文的收益不能迁移：调度、提示、源材料可见性、组件运行时、失败处理和经验策略都变了。作者也明确只证明流程和参数传递可运行，未复现 benchmark 或长期收益。[作者验证边界](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/VALIDATION.md#L28-L37)。
4. 它没有把结果自动写回日常 profile、AGENTS 或全局 Skills；经验主要影响后续 Harness² 实验。独立实验成功和日常 DSH 已使用改进，应分别验收。[作者数据边界](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/DESIGN.md#L18-L22)、[经验只送给改进阶段](https://github.com/Kingsleyyyyyyy/dsh-plugin-harness2/blob/d9b71bf5e065c8c7c0e8b18e02b25f86d1f42c40/src/engine.mjs#L192-L200)。

本文没有修复第三方代码，也没有为它创建补丁或修复测试。运行结果、当前 DSH 兼容性和项目 ADR 差异见同目录的 analysis.md。
