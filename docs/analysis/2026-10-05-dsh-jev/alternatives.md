# 更适合减少主 LLM 轮次的 Jev 方案

调研日期：2026-10-05（Asia/Shanghai）。承接用户对“LLM 组织问题 → Jev → LLM 解读”额外开销的质疑，优先核实程序直接判断、复用执行计划和明确的 LLM 升级路径。仅阅读一手文档、源码、论文、作者测试与公开反馈；未安装、执行或改动第三方项目，未调用付费模型。

## 判断标准与结论

本轮把“更好”限定为：能明确说明省掉哪个 LLM 调用，以及主 LLM 何时仍必须参与。功能匹配、作者实测、独立复测、DSH 接入是不同证据。

最值得研究的是 Jive 的执行图，以及 JevLoop 的直接动作路径。两者已有执行框架，超出了 jevcore 提供判断接口的范围，但都是独立 harness。保持 DSH 的局部改进可以看 dsh-jev-prune：其作用是自动压缩上下文和用代码回执替代部分 LLM 摘要，不是接管主 Agent 的所有动作。

## 1. Jive：一次规划，多步执行

主 LLM 提交 `execute_graph`；图内命令、Jev 判断、数据依赖和并行步骤由执行器推进。判断题、选项与中间状态随图复用，避免每步回主 LLM 重新计划。Jev 节点能配置 `accept` 条件，条件不满足时可返回主 LLM；省略 `accept` 会接受 schema 有效的结果，因此低置信度升级不是统一默认策略。[项目与设计](https://github.com/merijjeyn/jive)、[DESIGN.md](https://github.com/merijjeyn/jive/blob/main/DESIGN.md)

作者的 `product_matching` 表中记录 Jive 9 次 LLM + 140 次 Jev，对照 Codex 48 次 LLM、Claude Code 23 次。这是减少主 LLM 往返的具体例子，尚不是独立重复评测。[作者 benchmark](https://github.com/merijjeyn/jive#benchmark-results)

独立账户 bitranox 在 Issue #1 阅读源码后，质疑单次 benchmark、并发运行、缺少成本/成功指标，并要求区分图批处理与 Jev 的收益。这是外部源码评价，不是独立性能复测。[Issue #1](https://github.com/merijjeyn/jive/issues/1)

对当前项目的意义：执行图机制值得参考；若要接入，需要在项目集成层明确需求与验收接缝。它不能作为现成 DSH 插件直接装配，也不要求改动 DSH 或第三方源码。

## 2. JevLoop：有限动作直接走 Jev

程序将工具声明与已观察到的资源编译成候选，Jev 选择动作及已知参数，能构成完整调用时由代码执行；需要任意文本/参数生成或低置信复核时才使用 LLM。它已有共用执行内核与实际 paired 运行比较。[架构与候选绑定](https://github.com/parkavenue9639/jevloop#core-design)、[投影契约](https://github.com/parkavenue9639/jevloop/blob/main/docs/contracts/transcript-projection.md)

作者历史 FastAPI 六轮案例记录 20 次 LLM，对照 52 次；但真正完全绕过 LLM 的 Jev 步骤只有 2/22。该案例是单次手工 session，不证明任意任务或当前版本的收益。[历史测量](https://github.com/parkavenue9639/jevloop/blob/main/docs/evaluation/fastapi-case-study.md)

更后续的公开分支测试没有稳定速度胜利：三个任务族中成功直通仍仅 1 / 1 / 0；一组观察复用任务的估计成本比纯 LLM 高 19.1%。连接失败令实际总时间更长；不能扣掉失败时间再宣称整体更快。作者还区分了功能检查通过与最终文字声明是否有证据。[后续测试](https://github.com/parkavenue9639/jevloop/blob/main/docs/evaluation/fastapi-projection-results.md)

结论：控制流匹配，但不是已经证明稳定提速的 DSH 插件。其公开证据比只有宣传数据的项目更透明；真正收益取决于完整参数能从现有状态得到的比例。

## 3. dsh-jev-prune：DSH 内替代部分摘要调用

程序自动收集历史和工具结果，通过 Jev 判断保留/释放，再由代码生成确定性回执。自动路径由上下文压力触发，无需主 LLM 先组织一次 Jev 工具调用。它保留主 Agent 规划，改善的是上下文输入与部分摘要生成开销。[两层机制](https://github.com/yangyu666/dsh-jev-prune#the-two-layers)

作者在固定 37 步逐文件读取任务中记录：未命中缓存的输入 tokens，原生 DSH 为 75,781–87,872，完整插件为 25,516–45,071。该任务与版本范围有限，不能换算成所有任务速度收益；摘要/裁剪错误仍需检查。[作者实测及曾修复的失败模式](https://github.com/yangyu666/dsh-jev-prune#measured-results)

## 其他范围更窄或证据较弱的候选

| 候选 | 已核实的范围与限制 |
| --- | --- |
| [cydevo202020/dsh-jev](https://github.com/cydevo202020/dsh-jev) | 自动工具门控：规则、Jev，以及可选 LLM 分类升级；省的是附加判定，主规划循环仍在。作者的只读跳过统计是减少 Jev 请求，并非同幅减少主 LLM 调用。 |
| [mastwet/dsh-fast-jev-compaction](https://github.com/mastwet/dsh-fast-jev-compaction) | 用 Jev 保留/释放决策替代 compaction 的 summarizer；失败回原摘要。README 明确尚无 live session 端到端记录，不能按“fast”名称推定性能。 |
| [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) | 浏览器有界动作的快循环；Jev 选操作与目标，只有 TYPE_TEXT 用小 LLM。未发现统一置信度门控或强 LLM 升级；BLOCKED/无变化/预算耗尽会停，适用范围是浏览器。 |
| [prismhq/jev-router](https://github.com/prismhq/jev-router) | 网关直接使用 Jev 选择后续 LLM，省掉专门路由判断，但最终仍调用 LLM。是实验性路由器，不是减少动作循环的执行器。 |

## 论文与研究实现的反证

- [REFLEX](https://arxiv.org/html/2609.26532v1#S5) 支持 Jev 直接动作、必要时升级的设计；外部 τ² 测试中，普通 Flash→Max 级联的成功率数值与成本反而更有利，成功率差异未统计确定。没有核实到公开作者实现，因此它是架构与评测证据。
- [JevSpawn](https://github.com/Hoyant-Su/JevSpawn) 复用 LLM 定义的有限动作空间，但主实验是 GPU 上本地 Qwen 评分，需要可 fork 的环境；改用 TypeSafe Jev API 的变体在论文中反而慢 1.4–2.1 倍。[论文](https://arxiv.org/html/2610.00437v1#S3)
- [Jev-Mem](https://github.com/libingzheren/Jev-Mem) 的代码直接构造固定问题，负责记忆构建/检索控制，最后才交 LLM 综合。范围限于记忆；README 标明默认 mock、示例不直接复现论文完整评估，且默认 best-of-n=3 存在参考答案参与选择的偏倚。[检索源码](https://github.com/libingzheren/Jev-Mem/blob/main/memory/jev_mem_retrieval.py)

## 对当前需求的建议

研究顺序：先看 Jive 如何把一次规划变成可连续执行的图，再看 JevLoop 如何由已有观察产生完整调用；若优先保持当前 DSH 使用方式，则评估 dsh-jev-prune 的局部收益。

后续实验应同时比较原有 LLM、Jev 分工与普通小模型→大模型级联，统计实际完成质量、LLM 调用次数、总耗时与总费用。不要将“少强模型调用”“少未缓存 tokens”“低 Jev 单次延迟”互相替代。
