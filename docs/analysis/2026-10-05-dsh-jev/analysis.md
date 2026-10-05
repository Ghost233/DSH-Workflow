# DSH 与 Jev 的快速判断 / LLM 复杂判断组合调研

调研日期：2026-10-05（Asia/Shanghai）。范围：公开的一手文档与源码，以及当前项目的插件清单。未安装插件、未调用付费模型、未做本项目的兼容性或性能实测。

## 结论

有现成的 DSH 接入组件。最值得继续评估的是 `PerryLink/jevcore` 中的 `jevcore-dsh`：它提供可由其他插件直接调用的 `jev` 服务，适合把明确、有限选项的小判断交给 Jev，复杂判断留给主 LLM。但它提供的是判断接口与可选 gate，具体哪些判断直接结束、哪些升级到 LLM，仍要由调用方代码定义；没有核实到一个安装后就能替任意任务自动完成这套分工的通用插件。[jevcore README](https://github.com/PerryLink/jevcore)

这符合 TypeSafe 官方的 intent routing 模式：先做分类，再由代码选择普通处理函数、专用 LLM 或人工处理。Jev 接收 state 和 typed questions，返回 Choice、Score、Noul 等结构化值；文本生成与开放式推理仍使用 LLM。[Intent routing](https://docs.typesafe.ai/patterns/intent-routing)、[Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents)

## 当前可选组件

| 组件 | 已核实的行为 | 对本需求的意义与边界 |
| --- | --- | --- |
| [PerryLink/jevcore](https://github.com/PerryLink/jevcore) / `jevcore-dsh` | `ctx.get('jev').ask(...)` 可由其他插件直接调用；也提供 `jev_ask`、`jev_rank`、`jev_check`；有可选的 safety/context gate | 最接近构建直接判断路径的接入底座。服务调用省掉“先请主 LLM 决定调用判断工具”的环节；简单/复杂分流与 LLM 升级规则仍由消费代码实现。默认 provider 是离线 mock，须选择真实 provider 并配置对应凭据。 |
| [HorusJiang/dsh-jev-tools](https://github.com/HorusJiang/dsh-jev-tools) | 自动精简较长工具输出、筛查抓取正文中的注入、推荐技能；也提供 `jev_ask` 和完成声明核对 `jev_gate` | 适合让 Jev 做上下文与技能筛选，主 LLM 继续推理和生成。精简/筛查失败会原样放行；`jev_gate` 的含糊或失败路径返回 escalate，不等于已经执行 LLM 复核。 |
| [CSlawyer1985/dsh-jev-router](https://github.com/CSlawyer1985/dsh-jev-router) | 根据用户消息选择推理强度，在 `agent/request` 改写调用配置；自动模型路由默认关闭 | 适合让简单请求少思考、复杂请求多思考。每次仍有 LLM 调用，Jev 没有直接回答原任务。低置信度时弃权；无 key、超时、限流等失败回落关键词判断。 |
| [cyberofficial/dsh-plugin-jev](https://github.com/cyberofficial/dsh-plugin-jev) | 主模型及子代理可以调用 `jev_ask`；其他插件可调用 `ctx.get('jev').ask` | 可作为另一种接入层。工具方式仍需 LLM 发起调用；服务方式才允许消费插件直接处理小判断。没有核实到内置的通用“低置信度自动转强 LLM”流程。 |
| [buberlo/dsh-jev](https://github.com/buberlo/dsh-jev) | 工具筛选、调用评估、技能与模型路由 | 已于 2026-10-03 归档，作者停止发布并推荐 jevcore。最后版本 0.1.4，仅验证过 DSH 0.1.6-alpha.x。现有模型路由只选后续 LLM，不跳过 LLM；失败或路由不明确时保留当前模型，不能当作自动升级强模型。 |
| [BetterZflyee/dsh-jev-adapter](https://github.com/BetterZflyee/dsh-jev-adapter) | `jev_decide` 接口同时支持普通 OpenAI 兼容 LLM 与真实 TypeSafe Jev | 默认 openai 通道是普通 LLM 模拟决策接口，概率为自述值。不能据此获得真实 Jev 的性能；真实 Jev 要选择 typesafe 通道。 |

## 推荐的分工

以下是基于接口能力的接入建议，尚未实现或验证：

- 精确、固定的规则由代码处理，例如退出码、验证命令是否运行、分支 hash 是否一致。
- Jev 处理有限候选中的语义判断，例如选哪个技能、哪个工具类别相关、某段工具结果是否相关、当前步骤是否需要继续收集信息。
- 每个判断预先定义答案空间和“不确定”路径。结果满足本问题经过验证的条件时，代码消费结构化结果；不确定、缺少证据、请求失败时交回主 LLM。
- 架构选择、跨文件根因分析、复杂计划、写代码和生成最终解释仍交给 LLM；已经明确属于这些类型的工作可以直接走 LLM。

关键是让插件代码直接调用判断服务。如果所有小判断都先由 LLM 生成一次工具调用，再等待 Jev，再由 LLM 解读，仍然保留这些 LLM 轮次；判断本身快，不代表任务整体一定快。[jevcore 服务示例](https://github.com/PerryLink/jevcore#using-it)

## 性能与判断质量的实际边界

TypeSafe 支持同一 state 下多个问题并行评估，适合批量判断；问题彼此独立，不能直接使用同批其他问题的答案。[Introduction](https://docs.typesafe.ai/introduction)

`confidence` 是概率分布集中程度的摘要，不等同于“正确率”。阈值应按具体问题与真实样本验证，不应照搬某个固定数字；Noul 返回 yes 概率，没有单独的 confidence 字段。[Confidence](https://docs.typesafe.ai/confidence)

官方列出了多跳推理、数值精度、无关上下文过多等限制。这支持把 Jev 用在范围小的语义判断，精确计算留给代码、复杂推理留给 LLM。[Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

插件 hook 若只是在每个原有 LLM 步骤前增加 Jev 请求，也可能增加总耗时。buberlo 的作者在 live + shadow 场景实测中，两次工具筛选和一次调用评估增加了约 4.6 秒/turn；这是该插件与场景的测量，不是所有 Jev 集成的固定成本。[buberlo benchmark](https://github.com/buberlo/dsh-jev/blob/830a14dc58917aa83928a79996dd078bfc1dc5be/docs/benchmark.md)

后续验证应比较同一组任务的整体耗时、主 LLM 调用次数、token 用量、判断错误和升级比例，而非只比较 Jev 单次请求的耗时。本文不将厂商宣传倍数当成本项目的加速收益。

## 本项目状态

当前 `project-plugins.json` / `project-plugins.lock.json` 未列出上述 Jev 插件。DSH 来源为 `.gitmodules` 声明的官方 `deepseek-ai/deepseek-harness`；本地子模块 HEAD 为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。这只能说明项目清单没有装配这些插件，不能据此判断用户其他 DSH profile 是否已安装。

若后续授权接入，修改范围应是项目集成层或自研插件，保持第三方源码原样。Owner 的候选封存、写入隔离和验证执行证据继续由 Workflow 与确定性代码负责，Jev 判断不代替验证命令的实际退出证据。依据：本仓库 `AGENTS.md`。

## 来源核验记录

- buberlo/dsh-jev：调研时 HEAD `830a14dc58917aa83928a79996dd078bfc1dc5be`。归档状态由 GitHub 仓库页与 README 核实；模型路由行为见固定版本的[适配器](https://github.com/buberlo/dsh-jev/blob/830a14dc58917aa83928a79996dd078bfc1dc5be/packages/dsh-jev/src/adapters/model-routing.ts#L35)与[路由函数](https://github.com/buberlo/dsh-jev/blob/830a14dc58917aa83928a79996dd078bfc1dc5be/packages/jev-core/src/routing.ts#L203)。
- cyberofficial/dsh-plugin-jev：调研时 master HEAD `16ac7b48d8ecf19757eeb9d8033ec53e9a3ccd0b`。工具/服务区别由[工具实现](https://github.com/cyberofficial/dsh-plugin-jev/blob/16ac7b48d8ecf19757eeb9d8033ec53e9a3ccd0b/lib/tool.js#L34)与[服务实现](https://github.com/cyberofficial/dsh-plugin-jev/blob/16ac7b48d8ecf19757eeb9d8033ec53e9a3ccd0b/lib/service.js#L140)核实；[package.json](https://github.com/cyberofficial/dsh-plugin-jev/blob/16ac7b48d8ecf19757eeb9d8033ec53e9a3ccd0b/package.json) 为 private，因此不将同名 npm 包发布视为已验证事实。
- 其余组件：以链接指向的当前作者 README / 官方文档为依据；README 中的作者测试结果不表示本项目已通过兼容性或性能验证。
