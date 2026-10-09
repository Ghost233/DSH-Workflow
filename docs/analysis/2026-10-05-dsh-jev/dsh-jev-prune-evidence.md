# dsh-jev-prune：测量、质量与外部验证证据

调研日期：2026-10-05（Asia/Shanghai）。只读公开仓库、提交历史、Issue/PR 与 GitHub Actions 记录；未安装插件、切换服务、调用模型、修改第三方代码或新增其专用测试。本文件独立覆盖证据可信度；当前 DSH 接口兼容性与算法失效路径由主线程另行评估。

## 核验基准与结论

当前公开 `main`：`7ab713a320802c50e567ce9418a28b4e9eb5fe07`，最后提交时间 2026-09-28T08:55:34Z；包版本仍 `0.1.0`。[固定提交](https://github.com/yangyu666/dsh-jev-prune/commit/7ab713a320802c50e567ce9418a28b4e9eb5fe07)、[package.json](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/package.json)

**作者确实公开描述了一次三臂 37 步测量，但公开产物不足以独立复核。** 当前树没有 benchmark runner、任务完整 prompt、逐 run CSV/JSON、样本 session log、质量评分器或原始模型/API usage。PR #44 说这些由仓库外 measurement harness 保留，讨论可以按需引用；该 PR 当前无评论，也未给出外部原始数据链接。能确认它是作者报告的结果，不能称作已复现的节省或非劣质量。[当前树](https://github.com/yangyu666/dsh-jev-prune/tree/7ab713a320802c50e567ce9418a28b4e9eb5fe07)、[PR #44](https://github.com/yangyu666/dsh-jev-prune/pull/44)

当前 main 的 CI 实际成功，但 CI 证明的是纯逻辑/fake ctx 和对旧版 DSH 依赖树的模块加载，不是原始 37 步任务或长期真实会话测试。[当前 main CI run](https://github.com/yangyu666/dsh-jev-prune/actions/runs/36400293222)、[workflow](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/.github/workflows/ci.yml)

## 37 步实验究竟公开了什么

[README Measured results](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/README.md#measured-results) 与 [PR #44](https://github.com/yangyu666/dsh-jev-prune/pull/44) 给出的结构：

- 任务：`semver@6e05b76`，“读取目录下每一个文件，严格逐个读取”，37 步。
- A：原生 DSH；B：插件但 `compactReceipts:false`，仅 layer 1；C：默认两层。
- 作者说分数取 DSH 日志中 API 返回的 usage，不用启发式 token estimator。
- 只公开范围，没有逐 run 配对表：A uncached input 75,781–87,872；C 25,516–45,071。B 没有对应 usage 数字。
- 插件长任务每 run 裁剪 4–7 个节点；基线 0。短/中/长任务作者都报告回答正确。
- 公开 compaction 数字为基线 31–40、完整插件 15–23，其中 6–8 被代码回执替代。缺少事件表解释总 compaction、真实 model-summary 次数与 receipt 次数的逐 run 对应，不能重新统计。

这些内容主要是摘要性陈述。即使接受作者描述，也不能由两个未配对区间计算严格平均改善、方差或显著性，更不能把“约三分之一”当作每次运行的比例。

### 被删除但仍可从历史核验的实验限制

最初引入测量的提交 [226da9f](https://github.com/yangyu666/dsh-jev-prune/blob/226da9ff737e7d7c4a01ee2402361f29aae83364/README.md#measured-results) 明确写了：**每格 n=1–3**，不是统计结论；三臂 context window 都固定为 **10K**，数字描述这一窗口条件。

随后 [5e0d86a](https://github.com/yangyu666/dsh-jev-prune/commit/5e0d86a1fe5b1b771d4ebcdd243846272ff725ce) 删除英文这段，[a692c13](https://github.com/yangyu666/dsh-jev-prune/commit/a692c13e35edf511db782407d3258dfcb4905fdd) 删除中文这段，提交标题均为 `docs: drop the measurement caveats from the README`。这些限制仍写在 [PR #44 正文](https://github.com/yangyu666/dsh-jev-prune/pull/44)。因此评估必须带上 n 与 10K 条件，不能只看当前 README。这里记录可观察的文本变动，不推测作者动机。

## 任务质量与“正确答案”的证据强度

作者未公开 37 个目标文件的清单、标准答案、逐步覆盖/读取证据、任务完成评分代码、seed/retry 分析、早期承重事实的最后引用探针，也没有完整输入/输出。PR #44 提到 automatic scoring，但没有将评分脚本或结果发布。[PR #44](https://github.com/yangyu666/dsh-jev-prune/pull/44)

在此前 [Issue #37](https://github.com/yangyu666/dsh-jev-prune/issues/37)，作者自己明确列出可信度缺口，并要求至少公开数据、运行命令、重复次数和“早期埋关键事实、最后必须引用”的证据保留探针。Issue 随纯文档 PR #44 关闭，但当前仓库仍没有这些原始产物。这不能证明作者没有测过，只能说明读者不能公开复核。

[PR #43](https://github.com/yangyu666/dsh-jev-prune/pull/43) 的作者记录揭示了实际任务质量风险：压掉 assistant 进度/短结论后，旧版长任务只完成 2/3；加入可见文本摘录后 2/2 完成。当前 README 说修复后全部完成。样本很少，缺每 run 日志，不能证明普遍因果或质量非劣。

另外，README 的 token 范围针对“completed 37-step run”，失败 run 是否计入累计费用与总体成功率没有公开 ITT 表。不能仅以成功 run 的 usage 范围推导失败和恢复都算上后的总收益。[README](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/README.md#measured-results)、[PR #43](https://github.com/yangyu666/dsh-jev-prune/pull/43)

## Tokens、费用与延迟

**作者没有直接混用总 input tokens 与未缓存 input。** README 主动分 uncached 与 cache-hit，报告命中占比 78–94%，并称当时 hit/miss 单价约差 50 倍。这是其测量条件的定价说明，不是本调研核实的当前厂商价格。[README](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/README.md#measured-results)

但它尚不能支持“总费用下降同样比例”，因为缺少每 run 的：

- cache-hit input、uncached input、output/reasoning tokens 与实际 billed cost；
- 模型/provider 的精确版本和计费表；
- Jev 成功请求、重试/失败请求及输入 tokens 的额外费用；
- 未完成 run、恢复/重读成本。

公开 `jev.js` 会累加成功响应的 `input_tokens`/`output_tokens`，另计 HTTP attempts/retries。这是运行时计量能力，当前 37 步测量没有把这些 counter 的逐 run 输出公开。[Jev client](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/jev.js#L261)

**没有公开端到端 latency 对照。** README/PR #44 未给总 wall-clock、主 LLM 请求时延、Jev judging 延迟和 re-read 时间。少一些 LLM 摘要调用是合理的收益机制，但同样新增了 Jev 网络请求；只凭 tokens 降低不能声称任务更快。较早独立读者 [Issue #9](https://github.com/yangyu666/dsh-jev-prune/issues/9) 曾指出 judge 在 pre-step 关键路径上等待网络，相关历史问题已关闭，不能拿旧问题断言当前未修，但它说明延迟本应单独测量。

## 仓库自带脚本不是原始 benchmark

[inspect_session.mjs](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/inspect_session.mjs) 是用户提供 `.jsonl.zstd`/目录后的会话事件取证工具；没有内置 37 步任务、三臂运行或费用/质量评分功能。

[verify_real_shapes.mjs](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/verify_real_shapes.mjs) 对外部真实日志离线检查 toolName index、候选选择与 surface 形状，不调用模型，不能代替任务质量基准。仓库没有提供脚本输入的样本日志。

[check.js](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/check.js) 和 [smoke_apply.mjs](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/smoke_apply.mjs) 用纯逻辑与 synthetic/fake ctx、fakeJudge 验设计；113 smoke checks 不是 113 个真实模型任务。

## CI 的真实边界

公共 Actions API 返回当前 main 对应 [run 36400293222](https://github.com/yangyu666/dsh-jev-prune/actions/runs/36400293222) 在 2026-09-28 completed/success。较新 run 36405274199 对应的是发布准备 PR 分支 SHA `44b873a…`，不能混成 main 的 hash。

当前 [workflow](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/.github/workflows/ci.yml) 有：

- unit：Ubuntu/Windows × Node 22/24 四个组合，执行 `check.js` 与 fake-ctx smoke。
- coverage：仅 `jev.js`、`prune.js`、`receipt.js`、`state.js`，门槛 lines 90%、branches/functions 75%；不包含整个入口 index.js。[coverage 命令](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/package.json#L38)
- integration：安装锁定 DSH 0.1.5-rc.2 fixture；在 fixture 中验证 `freezeMessage`、插件模块可 import 和宿主版本，然后在仓库根依赖树重复纯逻辑/fake ctx 检查。workflow 自己注释解释根检查并未使用那棵完整 fixture。

不覆盖启动真实 host、真实服务 takeover、真实 TypeSafe API、真实会话质量与版本漂移。README 自己也明确这一边界，但“CI 两个 jobs”的描述已经落后于目前三个 job 类型/六个实际 job 的 workflow。[README Testing](https://github.com/yangyu666/dsh-jev-prune/blob/7ab713a320802c50e567ce9418a28b4e9eb5fe07/README.md#testing)

## 外部反馈与发布状态

核到了具名外部读者 kiangyeeo、stlin256 的源码/环境检查：例如 stlin256 在 [Issue #18](https://github.com/yangyu666/dsh-jev-prune/issues/18) 贴出干净目录 smoke 因缺 peers 无法 import 的真实错误；[Issue #20](https://github.com/yangyu666/dsh-jev-prune/issues/20) 指出旧 integration 未使用真正宿主依赖。对应问题后来修复并关闭。[修复 PR #23](https://github.com/yangyu666/dsh-jev-prune/pull/23)

这些是有价值的外部工程反馈，**不是外部用户对 37 步收益/质量的独立复测**。本轮精确项目名搜索 Reddit/HN/Linux.do 及一般网页未找到此类复测；不据此推断无人使用。目录收录与自动转载不算使用评价。

[PR #43 标“独立验证”的评论](https://github.com/yangyu666/dsh-jev-prune/pull/43#issuecomment-5864439363) 仍由 owner `yangyu666` 发布，不能用这个标签认定不同主体独立验证。

截至本次查询，[Issue #35](https://github.com/yangyu666/dsh-jev-prune/issues/35) 与发布准备 [PR #45](https://github.com/yangyu666/dsh-jev-prune/pull/45) 仍 open。PR #45 明说 publish/tag/release 和 bare-npm 安装验证是后续步骤。当前 main 仍文档 local-link 安装；不能拿 open PR 的 npm 命令宣称已发布并安装验证。

## 评估判断

方向值得研究，工程测试与主动记录失败明显优于只有宣传的 demo；最可靠的正向证据是确定性结构、明确测试边界及成功 CI。效果证据仍停留在作者的小样本汇总，且当前 README 删除了关键实验条件。若要判断是否适用于本项目，仍需同版本、同窗口、同任务下记录质量、失败率、cache-hit/miss、output、Jev/retry费用和总耗时；本次没有开展此实测，也没有修改或恢复第三方补丁。
