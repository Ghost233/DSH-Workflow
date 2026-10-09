# KnoxCoder / Jev 官方文档核验

本文件为 2026-10-07 调研的一手文档部分，只读取 `docs.knoxstudio.ai` 的官方博客和 API 教程。没有读取 GitHub、安装或运行 Knox，也没有修改第三方源码。各结论属于官网声明；实际调用链、默认值、阈值和与当前源码一致性由主线程另行核验。

## 文档能确认的主结论

官方将 Jev 定位为 **harness 的若干小判断后端**：Chat / ViewRead 路由、技能提示、上下文与工具门控、引用核对和 `auto` profile 确认。2026-09-24 的更新页明确说它不写代码、不替代 Agent loop。[major-updates：Jev](https://docs.knoxstudio.ai/blog/knox-major-updates/#jev--one-knox-key-same-api-as-chat)

因此，从官网描述看，它仍让生成模型完成 Agent 的推理、工具计划与代码生成，再在周围加入定型判断。官网没有宣称像 Jive 执行图或浏览器直接动作循环那样，Jev 连续执行多步并省掉每一步的主 LLM 轮次。这是对官方范围的分析，不代替源码核验。

## 接入与回退

| 项目 | 官网明确内容 | 限制 |
|---|---|---|
| 开启 | `~/.knox/config.yaml` 中 `jev.enabled:true`，或 Settings 的 Jev harness judgments | 文档未列出显式默认值 `false`；只依据“Enable”不能确认源码默认禁用 |
| 凭据 | 复用 `knoxchat` 模型的 apiKey；YAML 没有 key 时用 OAuth session key；可设置独立 `jev.apiKey` | 不是要求另建 TypeSafe key |
| endpoint | 更新页说固定调用 `https://api.knoxstudio.ai/v1/systemone`，`jev.baseUrl` 被忽略 | 自定义 TypeSafe/proxy endpoint 能否用，应看代码；不能把通用 API 说明套到此 harness 设置 |
| allowlist | key 需允许 `jev-*` | 401/402/403 分别提示无效凭据、余额与模型 allowlist 问题 |
| 失败 | Jev 关闭、无 Knox key 或请求在 800ms 超时后，回到现有 heuristics | 回退到本地既有判断，不是自动改调强 LLM；“fail-open”也不能理解成绕过所有工具权限 |

以上均来自 [2026-09-24 更新页](https://docs.knoxstudio.ai/blog/knox-major-updates/#jev--one-knox-key-same-api-as-chat)。它没有提供每个 gate 的 Noul/Choice/Score 题目、缓存键、概率阈值、失败日志或事件顺序，因此这些细节尚不能仅凭官网回答。

## 判断面分别对应什么

官网将判断面列在同一段，没有逐项 schema 或执行代码。本表区分直接声明与依上下文的解释。

| 判断面 | 官网证据 | 解释边界 |
|---|---|---|
| Chat vs View/Read | 更新页明确列出 | 8月产品页已有 `chat/edit/apply/summarize/viewRead/realTimeSearch` 角色模型，ViewRead 可用便宜模型；可理解成角色选择判断，但官网未写 Jev 直接完成读取任务 |
| Skill hints | 更新页明确列出 | 产品页说 `builtin_skill` 按需载技能；官网没说 Jev 自动载入完整技能或强制 Agent 使用建议 |
| Context gates | 更新页明确列出 | 产品页有上下文/记忆组装；没给 Jev 对具体文本的裁剪规则，也没证明 Jev 完全替代摘要模型 |
| Tool gates | 更新页明确列出 | 产品页另有 Core 的 allow/ask/deny 权限规则；不能推断 Jev 可抬高已有权限 |
| Citation checks | 更新页明确列出 | 官网没公开 citation verifier 的执行动作；不能把模型判“支持”当成真正读取过或引用定位验证通过 |
| `auto` profile confirm | 更新页明确列出 | 没有说明它指自主权限、执行策略、模型成本档还是推理强度；尤其不能仅凭这个词认定动态选强/弱 LLM |

来源：[更新页](https://docs.knoxstudio.ai/blog/knox-major-updates/#jev--one-knox-key-same-api-as-chat)、[8月 Agent / Skills / AI Chat 产品介绍](https://docs.knoxstudio.ai/blog/knoxchat-soul/)。8月产品页把 Ask/Edits/Auto 权限与模型角色路由分别描述；不要把两者和 Jev 的 `auto profile` 混为同一设置。

## 通用 Jev API 的官方契约

[/jev/](https://docs.knoxstudio.ai/jev/) 是 Knox 平台通用 API 教程，而不是 KnoxCoder gate 文档：

- `POST /v1/systemone` 接收 state + typed questions，同 state 的题一起独立求值。Noul 返回是的概率；Choice/Score 另有分布与 confidence。无文字生成、工具调用或 streaming。
- 问题 ID 用于代码匹配，题意放 instructions；官网鼓励拆小问题后代码组合结果，依赖上一步答案时才发第二次请求。
- 例子用 `https://api.knox.chat/v1/systemone`，官方 SDK 使用 Knox key 和 `baseURL:'https://api.knox.chat'`。这与 harness 更新页的固定 `api.knoxstudio.ai` 地址不同，文档没有在这些页面解释二者的实现等价关系。
- 成功调用 input `$0.042/M tokens`、output 免费，但每次成功调用**至少 `$0.0001`**；失败 upstream 不计费。这是官网当时价格，不表示一个微小判断只按几 token 即可无限摊薄费用。
- 64K 为 state 加全部题目，32K 为 state 加最长题；只接收文本。官网说英语最强，中文等语言可用但应单独检验。
- Knox 不自动重试 429/529；官方 TypeSafe SDK 默认可重试。此通用行为不能证明 harness 也使用 SDK 重试。

来源：[Question types](https://docs.knoxstudio.ai/jev/#question-types)、[Models/context/billing](https://docs.knoxstudio.ai/jev/#models-context-and-billing)、[SDK](https://docs.knoxstudio.ai/jev/#sdk)、[Patterns](https://docs.knoxstudio.ai/jev/#patterns)、[Errors](https://docs.knoxstudio.ai/jev/#errors)。

官方把 Choice confidence 描述为分布的峰度、Noul 没有独立 confidence；confidence routing 代码例子是低信心交给 human。它是通用应用模式示例，不能当作 KnoxCoder 实际低信心处理实现。[Choice 与 Patterns](https://docs.knoxstudio.ai/jev/#choice-pick-one)

## KnoxCoder、KnoxChat、KnoxCode 的命名

官网目前混用多个名称，不能仅凭网页认为所有产品和旧代码完全相同：

- [2026-10-01 KnoxCoder Overview](https://docs.knoxstudio.ai/blog/knoxcoder/)：标题为 KnoxCoder，正文仅一句“Agent、Memory、Time Machine”的视频介绍，视频入口为 [官方页所嵌视频](https://www.youtube.com/watch?v=VjjWRXLc1fc)。网页文字没有定义与旧 KnoxChat 的迁移关系。此次没有把视频内容当作已核验运行证据。
- [2026-09-24 major-updates](https://docs.knoxstudio.ai/blog/knox-major-updates/)：Jev/OAuth 段仍叫 KnoxChat，配置 provider 也为 `knoxchat`，列 V1.5.0/1/2 变化。
- [2026-08-16 KnoxChat Extension](https://docs.knoxstudio.ai/blog/knoxchat-soul/)：VS Code 扩展、多模型、Agent/Memory/Checkpoints，仍显示旧 knoxchat 产品标识和配置名。
- [2026-07-13 KnoxCode](https://docs.knoxstudio.ai/blog/knoxcode/)：描述为只用 `knox/knox-ms` 的产品，不带第三方 model picker；含工具的请求走 tool-calling passthrough，后台规划/记忆是平台能力。不能把这个旧 KnoxCode 专用模型介绍用来解释当前 KnoxCoder 的 Jev 集成。

文档所列日期是页面 publication metadata；页面可能后来补更新内容，因此不是固定提交的版本快照。是否存在改名/仓库迁移，应由主线程实际仓库 metadata、README 与提交历史确定。

## 性能证据与可借鉴的部分

这组官网页面未给 KnoxCoder Jev on/off A/B、主 LLM 请求数、任务质量、总耗时、Jev错误/超时比例、总费用或公开原始日志。**800ms 是 fallback deadline，不是测得的 p50/p95，也不是每轮上限**；每轮可有几个判定、是否并行或重试未知。API 的 example usage、宣传“加题几乎不加延迟”也不是这个 Agent 的实测。

文档可支持的借鉴方向是：把小而固定的 harness 判断集中到显式接口，默认/启用策略可控，时间预算到达便回既有路径，代码定义结果含义。若映射 DSH，可按角色路由、技能元数据建议和有限上下文相关性先研究；不能由官网推出“照装即可省主模型多步”或“Jev 替代安全/验证边界”。这是文档范围的分析建议，源码与 DSH 接口可行性需另核实。

## 本次核验方式

网页工具对 major-updates/KnoxCoder 页 direct open 有 cache miss；同站搜索可返回更新页正文，另以标准 HTTPS 只读获取该官方 HTML 对照标题、正文、publication metadata 和嵌入视频。没有经 GitHub/raw/API 获取其源码。本笔记不包含 KnoxCoder 源码默认值、运行状态或测试通过声明。
