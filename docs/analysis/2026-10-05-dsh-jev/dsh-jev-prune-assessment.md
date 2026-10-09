# dsh-jev-prune 评估：思路、实现与当前 DSH 接入条件

评估日期：2026-10-05。上游基准 `7ab713a320802c50e567ce9418a28b4e9eb5fe07`（插件 0.1.0）；本地 DSH `0.2.1-alpha.1`、源码提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。本轮只读取源码、公开测量/CI/反馈，并执行一次不调用模型、不写会话的选择函数计算；没有安装插件、改配置、重启服务或修改第三方代码。

## 结论

**设计值得借鉴，尤其适合长时间读源码和搜索的任务；原版当前不适合直接挂到本机日常主会话。** 它确实把判断和内容生成分开，能够从机制上减少部分 LLM 摘要和后续重复输入。公开效果证据仍是作者小样本汇总；当前依赖版本范围和服务作用域都需要核对。默认第二层还存在“相对低优先级不等于可以丢弃”的边界，第一层更适合作为优先验证的对象。

这里的“值得借鉴”是架构判断，不是对本机总费用、速度或任务质量的实测结论。[上游 README](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/README.md)、[公开证据评估](./dsh-jev-prune-evidence.md)

## 它确实绕过了不必要的主 LLM 调用

插件在 `agent/pre-step` 中读取真实会话、构造固定问题，批量调用 Jev，并将结果按会话/事件 seq 缓存；随后同步的 `pruneSession` 直接消费缓存。主 LLM 不需要为每次裁剪临时组织问题或解释答案。[judgePass 与挂钩](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L810)

两层的作用应分开理解：

| 层 | 判断 | 实际动作 | 收益范围 |
|---|---|---|---|
| 第一层 | 工具结果后续是否还要用；按压力缺口确定裁剪预算 | 保留重要结果；其他结果变为头部、标记、尾部 | 后续 LLM 少读旧输出；不接管主规划 |
| 第二层 | 结果与调用发生过的事实是否仍必要；再经过配对、工具、证据等规则 | 合格的旧只读步骤变为代码回执；混合并行批次可仅替换部分结果正文 | 替代部分 LLM 摘要；不是替代所有压缩或主模型调用 |

原始事件留在日志，回执记录路径、工具、参数摘录和 seq；`jev_restore` 能读出某些 checkpoint 的原始历史。这提供了追溯手段，但“日志还在”不保证模型主动发现自己遗漏了信息，也不保证重读/重跑没有额外成本。[第一层](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/prune.js)、[第二层及回执](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/receipt.js)

## 正向工程设计

- 默认由上下文压力触发，使用批量问题和缓存，避免每步重复判断所有历史。[配置与 judgePass](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L167)
- 第二层默认限定只读工具，排除 shell 和写入/编辑工具；检查调用与结果配对，保护最近节点和较长的可见结论。[只读/保护清单](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/receipt.js#L54)
- 第二层错误关键词守卫沿 `sourceEventSeqs` 扫描原文，避免先截断再失去错误证据。[来源链证据扫描](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/receipt.js#L86)
- 回执由代码生成，不让模型补写事实；当前 CI 成功，有真实外部源码/安装诊断反馈。CI 的范围是纯逻辑、fake ctx 与旧依赖树模块加载。[证据报告](./dsh-jev-prune-evidence.md)

这几项保护让它比“对旧历史随便写一段摘要”更容易追溯。但当前实现没有证明所有重要开发证据都能保留下来。

## 主要边界与风险

### 1. 第二层相对排序缺少绝对保留保证

默认 `compactMode=relative`，对 result/effect 两个轴各取最低分位并求交集。`computeEligibleSeqs` 的相对分支没有“result 概率已经很高就绝不选”的保护条件。全体资料都重要时，仍会有相对最低的一条。[选择函数](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/receipt.js#L354)

本轮直接调用该固定版本的纯函数，输入四个候选的 result 概率 `0.90, 0.91, 0.92, 0.93`，effect 概率 `0.01, 0.02, 0.03, 0.04`，配置 `quantile=0.34, minCandidates=4`，返回 `selectedSeqs=[1]`。这个计算没有模型、宿主或会话写入。

这只证明选择器会将高“仍需保留”概率的结果列为候选，不是完整会话删除的复现；后续还有工具、最近区、文字长度、证据和收益门。它仍说明相对优先级不能单独用作“可以释放”的证据。

### 2. 第一层与第二层的保护范围不同

第二层的错误关键词保护明确允许第一层继续截断。第一层默认只黑名单保护 Write/NotebookEdit；测试/shell 输出等可能只留下 600 字符头部与 200 字符尾部。中间的失败断言、调用栈或修改依据仍可能离开模型的活动上下文。[默认保护说明](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/receipt.js#L118)、[截断与裁决](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/prune.js#L236)

Jev 默认只看每个结果约 240 字符的摘录，而不是完整正文；源码记录此前看不到正文时曾误判后续修 bug 所需的结果。这说明判断质量需要单独验证，不能由合法的结构化输出推出。[摘录配置](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L211)

### 3. 缓存没有绑定任务目标的变化

判断题依赖最近用户目标，但 `fresh` 只检查 seq 是否已有 result/effect 概率；缓存条目不包含目标版本、时间或状态哈希。完整缓存不会因新用户目标自动重评。这是静态阅读发现的风险：先前无用的结果后来可能变重要；本轮没有进行真实会话复现。[fresh 判断](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L886)、[任务目标与缓存写入](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L984)、[目标相关问题](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/state.js#L345)

### 4. 慢请求会阻塞开发步骤

judge 位于 pre-step 必经等待路径。默认每次 HTTP 尝试超时 60s、最多两次重试，共三次尝试；批次依次执行。因此持续超时时一批就可能等约三分钟再回退，多批可能更长；取消信号可中断。这里是默认配置与控制流推导的异常等待上界，不是实测延迟。[默认超时与 pre-step](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L224)、[请求与重试](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/jev.js#L184)

### 5. dryRun 不等于完全不改变原生行为

即使 `dryRun=true`，插件仍会替换原生 `pruneSession`；计算出裁剪后跳过写入，并没有再执行原生 `pruneSession`。因此它能够暂时抑制原生工具结果裁剪，改变后续原生摘要压力。不能把它当成对主会话没有影响的 shadow 模式。[接管方法](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L1162)、[dryRun 分支](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/prune.js#L344)

## 效果证据支持到哪里

作者报告长读文件任务的 uncached input 为原生 75,781–87,872、两层插件 25,516–45,071。历史原始文档与 PR #44 还限定了每格 n=1–3、三臂窗口固定 10K；当前 README 已删去这段限制。没有公开逐 run 日志、runner、评分器、完整费用和端到端耗时，尚不能独立复核，也没有证明复杂修改/调试质量非劣。[PR #44](https://github.com/yangyu666/dsh-jev-prune/pull/44)、[详细证据核验](./dsh-jev-prune-evidence.md)

三臂是原生、Jev 第一层、Jev 两层，缺少同一预算/回执架构但使用简单规则的对照。因此当前数字不能分离“更早裁剪与确定性回执”的收益和“Jev 语义判断本身”的额外收益。这个区分是本轮评估的推论。

## 与本机 DSH 的静态兼容性

### 明确的版本范围不匹配

上游 peer `@deepseek-ai/dsh-tools:^0.1.5-rc.2`，本地该包 `0.2.1-alpha.1`，不满足该范围。项目启动器逐个校验宿主 peers，startup 第三方不匹配会被跳过。这不是“装完自动就能用”。本轮没有实际执行安装。[上游 manifest](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/package.json)、[本地工具包](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/core/tools/package.json:3)、[项目 peer 校验](/Users/ghost233/Ghost233Code/DSH-Workflow/scripts/project-plugins.mjs:321)

### 新版服务作用域不同

上游 bundle 只在根配置插入插件。当前 DSH Web 根配置把 compaction-basic 和 tool-result-pruner 禁用，改为在每个 Agent preset 的隔离 compaction group 内提供服务。上游 `inject` 要求 toolResultPruner，根插件不能据此直接接管预设内隔离实例。真正接入需要核对该作用域，不能仅向项目安装清单添加一行。[上游根插入](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/cordis.patch.yml)、[上游注入要求](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/index.js#L135)、[根服务禁用](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/bundle/web-app/cordis.patch.yml:527)、[创造模式隔离组](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/bundle/web-app/presets/cordis.patch.yml:66)

正向的一面：当前 native `pruneSession` 仍是同步方法，`summarize` 仍是动态分发的自定义钩子，`compactRegion` 的核心入参保持一致；回执结果的 summary/provider/model 也符合当前类型的未标记生成分支。这支持“原理可以迁移”，不构成加载、配对、恢复和实际调用的运行时验收。[当前 pruner](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/compaction/compaction-tool-result-pruner/src/index.ts:136)、[summarize 钩子](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:247)、[compactRegion](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:358)、[SummaryResult](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/compaction/compaction-basic/src/summarizer.ts:87)

### 当前两个上下文插件不能一概判为冲突

实际 Desktop profile 已安装 dsh-context 0.63.0 与 billion-context 0.1.184，安装存在仍不等于当前全部功能已激活。读取当前安装源码后，dsh-context 注册上下文投影及消息身份守卫，没有接管 pruneSession/summarize；billion-context 的 DSH 入口走代理启动/附着路径，没有直接改这两个方法。不能仅凭名称断言重复裁剪。若代理路径实际处理模型请求，仍需核对它与 native tokenMeter 计量、实际模型请求及重读的关系；本轮没有 live trace 证明联用安全或冲突。[dsh-context 入口](</Users/ghost233/.dsh/profiles/desktop/node_modules/dsh-context/lib/index.js:3904>)、[billion-context 入口](</Users/ghost233/.dsh/profiles/desktop/node_modules/billion-context/dist/agent/dsh-native.js>)

## 建议的后续验证标准

以下是后续实验建议，本轮没有执行：

1. 先满足版本与 preset 服务作用域，再确认真实服务已挂载。保持第三方源码原样；需要上游兼容版本或明确的自研集成方案，不以忽略 peer 或修改第三方凑版本作为验证。
2. 使用独立实验会话，第一层先观察/验证、第二层关闭；把 dryRun 对原生裁剪的影响也记入实验条件。
3. 同模型、同窗口测三类任务：长读源码、失败测试定位、修改后回头引用早期证据。成功率与最终证据优先于 token 数。
4. 对比原生、规则预算/回执方案、Jev 预算/回执方案，区分架构收益与模型收益；同一任务做重复运行，失败也纳入费用/耗时。
5. 记录 cache-hit/uncached input、output、真实 Jev 请求/重试费、总耗时、重读次数、恢复后的日志有效性。第二层必须单独验证高重要性资料不会因相对排名被选走。

本轮推荐的是“先验证第一层价值，暂缓默认启用第二层”，不是直接在日常服务里安装默认两层配置。
