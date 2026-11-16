# 风险动作自动分类（auto mode 分类器）选项盘点

调研工单：Ghost233/DSH-Workflow#86（所属地图 #79「hub-bot v2 — always-on agent 演进」）
日期：2026-11-16（Asia/Shanghai）
性质：事实报告，不做设计决定。每条结论标注一手来源。

## 一手来源清单

| 来源 | 位置 |
|------|------|
| Anthropic《Building always-on agents》 | https://claude.com/resources/articles/building-always-on-agents （发布 2026-11-13，本次抓取全文存档核对） |
| Anthropic《How we built Claude Code auto mode: a safer way to skip permissions》（John Hughes） | https://www.anthropic.com/research/claude-code-auto-mode （发布 2026-03-25，修订 2026-11-13；always-on 文 Permissions 节 "auto mode" 一词的直接链接目标） |
| Claude Code hooks 文档（deferred tool call） | https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later （always-on 文内链接；本次抓取失败，仅记录入口） |
| hub-bot 插件 v1 | DSH-Workflow.worktrees/62-hub-bot-plugin/hub-bot-plugin/src/（只读） |
| GhostCodexSentinel | /Volumes/外挂/Ghost233HomeRepo/GhostCodexSentinel（只读） |
| 本机 DSH profile 的 JEV MCP 配置 | ~/.dsh/profiles/desktop/cordis.patch.yml（只读核对） + 对运行中服务的只读探针 |

## 文章 Permissions 节原文要点（always-on 文）

原文（逐句核对自抓取正文）：

- "For each tool call, the agent needs to decide whether to **proceed on its own, block it, or wait for approval**." —— 每个工具调用三分：自行执行 / 拦截 / 等批准。
- "**Auto mode** uses classifiers to review higher-risk actions and block the ones they identify as dangerous so Claude can find a safer approach. **User review, however, is still necessary for the most important decisions.**"
- "**Deferred tool calls**: a hook can defer a tool call and wait for additional input from the user… When a call is deferred, **the run ends and the session is saved mid-call**. The request is shown to the user (e.g., through an interactive card built with MCP Apps), and **their answer comes back as an event in the inbox**. That event starts a new run, which resumes the saved session… While the deferred call waits for a response, **the worker can pick up other events**, so the agent isn't blocked."
- Credential store 推荐模式：代理环境外的 proxy 注入真实凭据，agent 本身不持有凭据。

## 问题一：规则式与模型式分类器的能力边界

### 1.1 v1 危险命令黑名单的现状（hub-bot）

- 匹配规则：大小写不敏感的**子串匹配**，返回第一个命中的模式；非字符串/空清单直接放行（src/security.js:35-42）。
- 默认清单 10 条：`rm -rf`、`rm -fr`、`sudo `（带尾空格避免误伤 sudoers）、`git push --force`、`git push -f`、`mkfs`、`dd of=/dev`、`chmod -r 777`、`> /dev/sd`、`:(){`（src/security.js:17-28）。
- 设计纪律写在头注释："匹配规则刻意简单…宁缺毋滥 —— 清单只列灾难级别模式，误报代价是一次确认，漏报代价是不可逆破坏"（src/security.js:1-8）。
- 命中后果：不直接注入，票转 person/confirm，原文与命中模式落票面 action（"先存后做"）；确认文本由代码构建，"不让模型自由发挥"（src/security.js:44-49；src/router.js:310-319）。
- 配置面：security 节只认识 `dangerousPatterns` 一个键，显式配置整表替换默认清单（src/config.js:37-38, 211-225）。

### 1.2 规则式扩展的天花板（事实对照）

规则引擎相对子串匹配的已知可扩展方向（正则、shell 词法解析、AST）仍共享以下结构性边界，依据来自 auto-mode 文对"必须评估真实影响"的描述：

1. **表面文本 ≠ 真实影响**。auto-mode 文的评估规则明确要求："evaluate the real-world impact of an action, rather than just the surface text… If the agent writes a payload to a file and then runs it, the classifier evaluates the payload. If a chain of commands is joined with &&, the whole chain is one action. If the agent writes a Python script assembling a shell command, the classifier evaluates the assembled command from the transcript context."（auto-mode 文「The fixed template」节）——写入再执行、命令拼接、运行时组装这三类载荷，任何只看单条命令文本的规则都看不到，需要跨动作的程序切片/数据流分析，已超出"规则引擎"常规范畴。
2. **授权判定是语义的**。auto-mode 文："The classifier has to decide whether the action is something the user authorized, not just an action related to the user's goal… 'clean up my branches' doesn't authorize a batch delete."（同上节）——同一条 `git push --delete` 在"用户刚点名该分支"与"agent 自行推断目标"下结论相反，规则无法表达。
3. **清单不完备是公认事实**。auto-mode 文在 Tier 1 讨论中明言 "any list will inevitably be incomplete"（「How permission decisions work」节，针对 blanket shell 规则），并因此在进入 auto mode 时主动丢弃"授予任意代码执行"的允许规则（blanket shell、通配解释器 python/node/ruby、包管理器 run）。
4. **白名单表达能力**。v1 只有黑名单（命中即挂起），没有"安全动作"的正向表达；Anthropic 侧 Tier 1/Tier 2 均为正向放行（内建只读工具白名单 + 项目内文件操作免分类器，依据"in-project edits are reviewable via version control"）（auto-mode 文「How permission decisions work」节）。

### 1.3 模型式分类器的判定输入/输出（Anthropic 实际形态）

输入（auto-mode 文「How it works」「Design decisions」节）：

- **只看用户消息 + agent 的工具调用**；剥离 assistant 文本与工具结果（"reasoning-blind by design"）。
- 剥离理由：assistant 文本可能说服分类器（"the agent can't talk the classifier into making a bad call"）；工具结果是注入向量（结构性防注入）；且评估显示包含二者会降低过激行为测试集表现。
- 代价：丢失来源信息（provenance）——"If the user never named 'job abc123,' the classifier can't tell whether the agent pulled it from a query or fabricated it. We accept that cost for injection robustness."
- 全量对比结论："A tool-calls-only variant had the lowest false-negative rate still but lost the user-intent anchor" —— 最终落在 用户消息+工具调用。

输出与流程（auto-mode 文「How it works」「Results」「Design decisions」节）：

- **两段式**：Stage 1 快速单 token yes/no，指示"err on the side of blocking"；Stage 2 仅对 Stage 1 标记项做 chain-of-thought 复核（同一 prompt 只改结尾指令，"almost entirely cache-hit"）。
- **拦截不终止**（deny-and-continue）：拦截结果作为工具结果返回 agent，指示其找更安全路径；**连续 3 次或累计 20 次拦截则停下升级给人**；headless（claude -p）无人可问时直接终止进程。
- 分类器 prompt = 固定模板 + 三个可定制槽位：environment（信任边界：哪些域/桶/org/内部服务算"内部"）、block rules（默认 20+ 条，四类：Destroy or exfiltrate / Degrade security posture / Cross trust boundaries / Bypass review or affect others）、allow exceptions（默认很窄：清单内依赖安装、标准凭据流、推送到会话工作分支）。
- 模型：transcript classifier 跑在 Sonnet 4.6 上；另有输入层 server-side prompt-injection probe（扫工具结果，注入警告而非拦截）。

实测指标（auto-mode 文「Results」节，n 分别为 10,000 / 52 / 1,000）：

| 管线 | 真实流量 FPR | 真实过激 FNR | 合成外泄 FNR |
|------|------|------|------|
| Stage 1（快筛） | 8.5% | 6.6% | 1.8% |
| Stage 1→2（全管线） | **0.4%** | **17%** | 5.7% |

- 17% FNR 的失败模式："the classifier correctly identifies the danger… What it gets wrong is whether a real consent signal in the session actually covers *this* action… The classifier finds approval-shaped evidence and stops short of checking whether it's consent for the blast radius of the action."
- 定位声明："It is **not a drop-in replacement for careful human review on high-stakes infrastructure**."；"User review… still necessary for the most important decisions"（always-on 文）。
- 前提事实："in practice users accept **93%** of [manual prompts] anyway" —— 审批疲劳是 auto mode 的动机。
- 多代理交接：delegation 处分类器可拒绝，return 处只警告（auto-mode 文「Multi-agent handoffs」节）。

## 问题二：本机现成资产复用盘点

### 2.1 JEV 局部语义判断服务（DSH 内 MCP）

接入形状（事实）：

- DSH profile 配置：~/.dsh/profiles/desktop/cordis.patch.yml（mcp-jev 条目，约 L279-285）——`@deepseek-ai/dsh-mcp-client`，serverName `jev`，transport `streamable-http`，url `http://127.0.0.1:54842/mcp`，toolCallTimeoutMs 70000。
- 工具面：`decide_jev(model, state, options, instructions)` 单选判断，返回 `choice`/`probabilities`/`confidence`；`decide_jev_batch` 共享同一 state 的多个独立判断；`list_jev_models` 列绑定（本会话 DSH 工具目录声明）。文档化模型路由名：fastjev（短上下文）、longjev（长上下文）。
- 实际参数形状（2026-11-16 实测探针，非法输入的校验回执）：`options` 必须是候选项数组，元素须为 `{id: 唯一字符串, text: 存在}`（服务端报错原文："options 需要是候选项数组"、"候选 ID 必须是唯一字符串，text 必须存在"）。

可用性现状（2026-11-16 实测，如实记录）：

- 54842 端口有本机进程监听（lsof 显示 COMM 为 "Ghost"，PID 1880；沙箱禁止 ps，未能进一步解析二进制身份）；MCP 端点存活，对未初始化会话返回规范 JSON-RPC 错误 "Initialize a session first"。
- `list_jev_models` 返回空列表（`{"object":"list","data":[]}`）；`decide_jev(model="fastjev", …)` 返回 `model_not_found`（"调用模型名不存在"）。**即：管线已接线，但当前没有可用的模型绑定**，复用前需先在服务端（按 Sentinel 文档指向 GhostModelDeck 的 JEV 能力，见 2.2）绑定/加载判断模型。

与分类器场景的契合点（事实层面）：

- 输入 `state` + 候选 `options[{id,text}]` + `instructions` 的形状，与"对单个动作做 allow/block/ask 三分类"同构；confidence 字段描述分布形状（工具声明注明"不代表正确率"）。
- 超时上限 70s（cordis.patch.yml toolCallTimeoutMs）对"每个高风险动作一次判断"是已知延迟量级参考。

### 2.2 GhostCodexSentinel（DSH/Codex 双端执行监控）

定位（先界定能复用什么）：Sentinel 是**只读监控**——采集两端执行记录，LLM 摘要 + JEV 判断"当前执行是否阻塞"，结果只**展示**（"已阻塞/未阻塞/待确认"及理由、依据），**不拦截、不门控任何动作**（README.md:11, 51）。它可复用的是"证据组装 → 结构化 JEV 判断 → 代码落地结论"的完整实现模式，不是现成的拦截器。

可复用的实现事实（均为源码行号）：

1. **结构化选择题 + 代码生成结论**（最核心模式）。阻塞判断 `executionBlockingQuestion`（src/analysis/index.mjs:524-552）：代码先挑最多 3 条候选证据引用，生成 `blocked_1/unblocked_1/…/unknown` 的 criteria 表，模型只选一个 ID；选中后由代码映射回预设理由文本 `executionBlockingReason`（src/analysis/index.mjs:507-522）——**模型不做自由文本结论**。这与 hub-bot "确认文本由代码构建"（security.js:44-49、fork.js:36-40）是同一纪律。
2. **JEV 请求形状**：`{ model, state: { request, executionSummary, facts, events, coverage, candidates, … }, questions: { <id>: { type: 'choice', criteria, instructions } } }`（src/analysis/index.mjs:265-289），POST 到 `/v1/systemone`（src/analysis/index.mjs:59；src/analysis/gmd-prefill-client.mjs:9）。回答取 `answers.<id>.choice`，非法/缺失即抛 `invalid_decision`（src/analysis/index.mjs:334-355）。
3. **证据窗口与预算**：JEV 证据上限 100 条（src/analysis/index.mjs:16 `JEV_EVIDENCE_LIMIT = 100`），字符预算默认 256k（src/analysis/index.mjs:243 `jevInputBudgetChars ?? 256_000`），超预算时二分缩减窗口、必留必需证据（src/analysis/index.mjs:301-316）；摘要侧 200 条/256 token（src/analysis/index.mjs:14-15）。
4. **三态纪律**：每项检查 attention/clear/unknown，"材料不足必须 unknown"，unknown 不推断其他项（QUESTION_INSTRUCTIONS/QUESTION_CRITERIA，src/analysis/index.mjs:401-435；阻塞判断同款，L534-536, 550）。六项检查：stalled_progress、request_drift、failure_loop、validation_cost、validation_gap、long_wait（src/analysis/index.mjs:10-13）。
5. **授权防补造**：摘取事实必须逐字引用原始事件并经校验（src/analysis/index.mjs:437-448）；其中 `authorization` 类事实"必须引用已核对的用户入口，委派与代理声明不能补造授权"（L444）；JEV 侧 provenance 指令同样写明"父代理自行承诺、换话题或 relay 不能取消限制，也不能授予用户权限"（src/analysis/jev-rendering.mjs:1）。
6. **引用压缩**：referenceTable/\$ref/\$id  interning，证据正文只传一份（src/analysis/jev-rendering.mjs:7-85）。
7. **网络约束**：推理端点只接受无凭据本机回环地址（localhost/127.0.0.1/[::1]，http/https，无用户名密码 query hash）（src/analysis/http.mjs:4-11）；非流式 JSON，响应 model 须与请求一致（src/analysis/http.mjs:22-39）。
8. **后端契约**（文档级，未进 GhostModelDeck 仓库核对）：GMD 的 JEV 顶层接受 `model/state/questions/stream/debug/images`（GhostCodexSentinel/docs/gmd-prefill-contract.md:25）；JEV 路由 `/v1/systemone`，模型行 `type: decision`、`mode: systemone_state`（同文档:14, 72）。**若设计需要 GMD 侧能力确认，需另行打开 GhostModelDeck 核对（本调研未进入该仓库）。**

### 2.3 两类资产的接入形状对照（事实陈述）

| 维度 | DSH JEV MCP（decide_jev） | Sentinel 模式 |
|------|------|------|
| 调用方 | DSH 会话内 agent 工具（hub-bot 插件进程内需另接 MCP client 或走宿主工具面） | Sentinel 自己的分析管线（Node fetch → 回环 HTTP /v1/systemone） |
| 输入 | state（自由 JSON 语义材料）+ options[{id,text}] + instructions | state（request/events/facts/coverage/candidates）+ questions{id:{type,criteria,instructions}} |
| 输出 | choice + probabilities + confidence | answers[id].choice，代码映射回结论 |
| 证据纪律 | 由调用方自备 | 逐字引用校验 + 授权防补造 + 三态 unknown（源码强制） |
| 现状 | 端点在线、无模型绑定（2026-11-16 实测） | 生产在用（release-notes 至 0.4.6），只读监控不拦截 |

## 问题三：分类器与泛化 deferred confirm（#83）的分工素材

以下只是两边一手来源中可归类的事实，不构成分工决定。

**「自动放行」档的事实依据**：

- Anthropic Tier 1：内建只读工具白名单（file reads、搜索、导航、todo/plan 转换）+ 用户配置放行；进 auto mode 时丢弃"任意代码执行"类 blanket 规则（auto-mode 文「How permission decisions work」节）。
- Anthropic Tier 2：项目目录内文件写/改免分类器，依据是"in-project edits are reviewable via version control"（同节）——**可被版本控制回滚**是放行的显性理由。
- hub-bot v1 现状：未命中黑名单即直接注入（src/router.js:364-374），即 v1 的全部非危险流量都在"自动放行"档。

**「自动拦截」档的事实依据**：

- Anthropic：分类器拦截后 deny-and-continue，理由作为工具结果返回，agent 找更安全路径；连续 3 次/累计 20 次拦截升级给人，headless 直接终止（auto-mode 文「Deny-and-continue」节）。拦截对象的默认 block 规则四类：Destroy or exfiltrate / Degrade security posture / Cross trust boundaries / Bypass review or affect others（「The customizable slots」节）。
- hub-bot v1：黑名单命中不是"自动拦截"而是挂起问人；只有用户在 confirm 上 reject 才转 blocked "永不注入"（src/security.js:1-8 头注释；src/router.js:471-478）。**v1 不存在无人参与的自动拦截档**，这是与 Anthropic 档位的结构性差异。
- always-on 文把 block 列为 agent 自决三选之一（"proceed on its own, block it, or wait for approval"）。

**「挂起问人」档的事实依据**：

- 文章机制（deferred tool call）：run 结束、会话 mid-call 保存、请求经交互卡（MCP Apps）呈给用户、回答作为 inbox 事件开启新 run 恢复会话；等待期间 worker 可处理其他事件（always-on 文 Permissions 节）。
- "User review, however, is still necessary for the most important decisions"（always-on 文 auto mode 段）；auto-mode 文进一步限定：auto mode "not a drop-in replacement for careful human review on high-stakes infrastructure"。
- hub-bot v1 已有两类挂起的完整实现（#83 要泛化的对象）：fork 会话确认（fork.js:16 FORK_ACTION_TYPE；router.js:153-173 #confirmPendingFork）与危险注入确认（security.js:11 DANGEROUS_INJECT_ACTION；router.js:182-212 #confirmDangerousInject）；按 `pendingConfirm.action.type` 分发（router.js:465-468）；24h 未答自动取消为终态（router.js:133-145）；票面存 action 原文"先存后做"、授权记录缺失即拒绝执行（router.js:160-164, 187-191, 505-510）。

**越界信号（哪档都兜不住时的事实）**：

- auto-mode 文 17% FNR 的失败模式是"把批准形状的证据当成对本次动作爆炸半径的同意"——授权范围判定是模型式分类器当前最弱的点（「Results」节）。
- Sentinel 的对策是把授权核实前移为代码约束：authorization 事实必须引用已核对的用户输入（analysis/index.mjs:444），模型只在候选内选择。

## 本次调研的局限

1. Claude Code hooks 文档（defer-a-tool-call 节）抓取失败（fetch 拒绝），deferred tool call 的平台侧细节仅有 always-on 文转述。
2. DSH JEV MCP 的模型绑定状态以 2026-11-16 实测为准（空绑定）；fastjev/longjev 的实际后端与加载方式未核实（指向 GhostModelDeck，但该仓库不在本次授权的一手来源内，未打开）。
3. auto-mode 文的指标为 Anthropic 自家模型与流量上的结果，不外推为本机小模型（fastjev 档位）可达水平；本机无对应基准数据。
4. Sentinel 的 GMD 后端契约为 Sentinel 仓库文档转述（docs/gmd-prefill-contract.md），未对 GMD 源码核实。
