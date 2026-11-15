# dsh-hub-bot (hub-bot-plugin)

中枢 Bot 插件：三层负责人架构的个人 Bot 体系（规格：DSH-Workflow docs/specs/hub-bot-plugin.md；跟踪 issue #62；#63 交付存储与管理面，#64 交付总负责人与路由链路）。

本目录是一个 DSH cordis bundle：

- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`；bundle 层只插入插件条目（无配置）与两个负责人 preset（`hub-bot-router` L1 路由 / `hub-bot-owner` L2 执行管理，名称与说明均标"负责人专用，不供手动选择"）。**两个 preset 完全只读：无写文件、无命令执行工具**（一切动手只发生在 L3 执行会话）；router preset 另含静态插件行 `dsh-hub-bot/router-tools`，把 L1 五个工具与路由 persona 挂进 preset 的挂载子树。
- `src/index.js` 是插件入口（`name`/`inject`/`apply`）：校验 `stateDir` 与 `homeRepo`（均必填、绝对路径，否则拒绝启动），打开版本化 SQLite 存储（`src/store.js`），引导总负责人注册（`src/registry.js`，懒创建：启动只落 `chief` 行、status `pending`），装配 `Hub`（`src/hub.js` = store + registry + `src/router.js`）并把 `hubBot` 服务提供到根作用域。
- `src/router-tools.js` 是 L1 工具插件（cordis 插件形态，静态列进 router preset）：注册 `list_owners` / `create_owner` / `route_to_owner` / `query_tasks` / `reply_source` 五个工具，并以 `deployment:persona-prefix` 同名 section 把路由 persona（`src/persona.js`，≤30 词路由备注、歧义回候选列表+"其他"不猜）挂成 preset 作用域的部署 persona 遮蔽。
- **管理 API 默认关闭**：它能向本 profile 任意会话注入消息，与 #62 Policy 同级敏感，因此仅当配置显式给出 `devApi: { token: "..." }` 时才注册 `/hub-bot/api/*` 路由；请求须带 `x-hub-bot-token: <token>` 头（sha256 后常量时间比对，不符 401），且仍限 loopback。未配置 `devApi` 时插件正常装载、不注册任何路由。路由：`state` 健康检查、`owners` 读负责人注册表、`sessions` 建会话（带 `owner` 字段则按注册表 cwd/preset 建并绑定）、`route` 直接路由一条消息（与 L1 工具同核心）、`owners/invalidate-session` 把行指向悬挂会话 id（被删重建验收探针）、`inject` 经 `sessionController.prompt()` 注入既有会话（可带幂等 `requestId`）、`decorate` 注册 `hub_bot_ping` 工具（会话关闭经 `agent/disposed` 自动注销）、`wait` 等空闲、`transcript` 读持久 transcript。

## 开发期装载（独立 DSH_HOME，不触碰正在运行的 DSH）

DSH 从 `$DSH_HOME/profiles/<name>` 装载 profile（缺省 `DSH_HOME=~/.dsh`）。把 `DSH_HOME` 指到独立目录即可启动一个完全隔离的开发实例——与 superagent 的 "dedicated profile" 形态相同，但不占用户默认目录、不重启用户服务：

```sh
export DSH=/Applications/Ghost\ DSH\ Station.app/Contents/Resources
export DSH_HOME=/tmp/dsh-hub-bot-dev          # 任意独立目录
export MAGPIE_GATEWAY_KEY=placeholder         # 本地网关不校验，provider 只要求变量存在

# 1. 从 web 模板建 profile
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" hub-bot-dev --from-default-profile web --dump-config > /dev/null

# 2. 以 link: 装载开发中的插件（实时反映本目录改动，重启实例生效）
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile hub-bot-dev add "link:$PWD"

# 3. 编辑 $DSH_HOME/profiles/hub-bot-dev/cordis.patch.yml（完整样本：docs/dev-profile.patch.yml）：
#    webserver 端口、LLM provider、默认 model、permission 默认 preset，以及 hub-bot 条目：
HUB_BOT_TOKEN=$(openssl rand -hex 16)   # 开发实例启动时生成随机 token
#   - id: hub-bot
#     config:
#       stateDir: $DSH_HOME/state
#       homeRepo: /Volumes/外挂/Ghost233HomeRepo   # 总负责人 cwd（L1 落点）
#       devApi: { token: $HUB_BOT_TOKEN }        # 不配 devApi 则管理面整体关闭
#    注意：profile 层同 id 条目是替换语义——stateDir/homeRepo/devApi 必须写在同一条目内，
#    拆成两个 "- id: hub-bot" 会让后一条覆盖前一条的 config。

# 4. 启动（独立端口；停止只需 Ctrl-C，用户的 DSH 不受影响）
node "$DSH/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile hub-bot-dev --no-open

# 调用管理面：curl -H "x-hub-bot-token: $HUB_BOT_TOKEN" http://127.0.0.1:3199/hub-bot/api/state
```

生产装载（与 superagent 相同形态）：在用户自己的 profile 里 `dsh plugin --profile <name> add link:<本目录>`（或安装打包后的 tgz），在该 profile 的 `cordis.patch.yml` 里给 `hub-bot` 条目加 `config.stateDir` 与 `config.homeRepo`（生产不建议开 `devApi`），重启该 profile 生效。重启用户正在运行的 DSH 需由交付 Lead 协调时机。

## 测试

```sh
npm test    # node --test：config 校验、SQLite schema、负责人注册表、路由核心（懒创建/重建/幂等）、patch 结构
```

patch 结构测试复用仓内先例 `scripts/test-runtime.mjs` 的解析链：`DSH_TEST_RUNTIME_ROOT` 指向一份装好依赖的 DSH 运行时（如 Station 的 Resources 目录），缺省回退仓内 `deepseek-harness/` 源码检出。两者都不可用时 patch 测试 **skip 而非 fail**（其余测试不受影响）；本仓 CI/验收用 `DSH_TEST_RUNTIME_ROOT="/Applications/Ghost DSH Station.app/Contents/Resources" npm test` 获得真实 cordis include 解析器的全量校验。

## 设计决定记录

- **store.js 的 schema v1 即建全 trigger/ticket/owner/outbox 四张表**：它们由规格「数据模型」章节定义，是三层架构的既有数据契约；schema v1 建全后，后续工单只追加迁移不改历史迁移，保证已部署 stateDir 的升级路径单调可测。
- **两个 preset 在 cordis.patch.yml 中保持展开**：preset 是给人读的声明式配置，两份各自完整可比 YAML 锚点更易审阅；L1/L2 的分化已经发生（router 多一行 router-tools）。
- **preset 完全只读成立后才在措辞中宣称"完全只读"**：#64 去掉了 shell/jobs 工具行，无写文件、无命令执行工具，工具面即权限边界；此前 5 秒转后台的 shell 语义只是时延约束，不构成只读。
- **负责人注册表与路由核心是纯领域模块**（registry.js / router.js）：Router 经窄 Sessions 端口（create/prompt）驱动 sessionController，单测用假端口覆盖懒创建、被删重建、triggerRef 幂等，无需 DSH 运行时。先存后做：Trigger→Ticket 先落库再注入，崩溃后可追。
- **preset 挂载子树是独立模块 realm，跨 realm 通道用"根服务 + inject 链"**（2026-11-15 实测）：子树行的模块实例与根插件不共享（模块单例 ✗、globalThis ✗）；插件作用域 `reflect.provide` ✗、`ctx.root.reflect.provide` 单独使用也 ✗。**实证可用组合**：根插件在 `ctx.root` 提供 `hubBot` 服务，且子树行的 `inject` 声明若干根组合服务（`sessionController`/`sessionPersistence`——只起解析链作用，不被调用），子树内 `ctx.reflect.get('hubBot', false)` 即可解析。去掉这两个 inject 项，工具行会静默 pending（mount 审计容忍 pending），因此 inject 列表是承重的，注释必须保留。
- **工具 output schema 不支持 type 数组**：`{ type: ['string','null'] }` 在注册期即被拒绝；可空字段改为单类型 + 不列入 `required`。
- **管理面默认关闭 + token 把守**：注入能力与 #62 Policy 同级，宁可每次开发实例生成一次性 token，不留"静态头即可注入任意会话"的本机面。

## 任务三态与 L2 执行闭环（#65）

- **三态机（src/tasks.js）**：`working → review → done`；review 是挡板，done 只能由 review 经用户验收（resolution:"accept"）到达。追问把 review 恢复为 working（resume, by:'route'），验收 by:'user'；非法迁移拒绝（如 working 直接 accept、done 后追问、double-report）。全部迁移记 transitions 审计数组。
- **L2 六工具（src/owner-tools.js，owner preset 静态行）**：search_sessions / read_session / inject_session / create_session / report / escalate。身份解析：工具执行的 exec.agent 经 workingDirectory.ensure 拿会话 cwd，须等于注册表某 owner 的 cwd，否则拒执。
- **越界拒执**：create/inject/read 的目标会话（或 create_session 的目标 cwd）必须落在 owner 责任子树内（isWithinCwd 路径段感知，`/a/b` 不含 `/a/bc`）；越界抛错并指向 escalate。escalate 不改票阶段、打 escalated 标记并写 outbox(kind=escalation)，L1 经 query_tasks 可见。
- **执行会话保持用户 preset**：create_session 不传 agentPreset（部署默认），插件永不改写执行会话配置。
- **授权不可变**：Ticket 创建时记 authorization{actor,source,at}，注入执行会话的文本自动携带它；追问注入文本带"改完请再次 report"提示（首跑实证：L2 追问后忘了再次 report，票卡在 working）。
- **report 归类**：report{summary,evidence,at} 存票面，stage 转 review；L1 用 query_tasks 看到摘要。完整汇报链（任务外广播）属 task-5/#67。
- **追问/验收从 L1 走 route_to_owner**：ticketId=追问（review→working 并注入，working→原样注入，done→拒），ticketId+resolution:"accept"=用户验收（review→done 不注入；working accept 拒——挡板）。

## 等待状态模型与可靠性硬化（#66）

- **九态一票**（src/tasks.js）：待触发 idle、排队中 queued、进行中 working、等您回复 person/answer、等您确认 person/confirm、等您验收 person/review、被卡住 blocked、失败 failed、完成 done。任何时刻恰处一个阶段；全部迁移经 TRANSITIONS 守卫并记 transitions 审计（含 by/at）。等您验收是挡板：done 只能由 person/review（验收）或 person/confirm（取消）到达；人的追问把 person/*、blocked、failed 释放回 working（spec：人的消息直接释放）。#65 旧票 stage 'review' 读出时归一为 person/review，不做迁移。
- **状态摘要 = 状态朗读**：STAGE_TEXT 逐字文案（进行中/等您验收/被卡住/…），query_tasks 每行带 stageText，summarize 只回 朗读 + 票面既有事实（report 摘要/escalation 原因等），LLM 不即兴总结。
- **先存后做（src/outbox.js OutboxRunner）**：建票先存 idle（待触发），注入先落 outbox 行再投递；投递成功才转 working。失败 2 秒首次重试、指数退避、上限注入 5 分钟/回复 1 分钟；同一任务的注入严格保序（前一条未送达后一条等待）；连续失败 3 次才记 system-problem 行并绕过（一次性错误不惊动人）；重试沿用行内稳定 requestId。permanent 失败（如票面授权缺失）立即终判不重试。插件启动时 markRestart（working/idle/queued 票的 running assignment 以 "host restarted" 结束、打 recoveryPending）并自动恢复投递，另有 1 秒 tick 定时器；devApi 增 POST /deliver 手动驱动（实证用）。
- **触发与授权不可变（票面权威）**：追问不绑定新 Trigger；追问带 authorization 参数直接拒绝（authorization-immutable）；票面授权缺失的票拒绝执行——路由侧转 blocked 并拒注入，投递侧 permanent fail 转 failed；会话叙事声称的授权不扩展权限（owner persona 明文 + L2 工具硬约束）。
- **消息纪律代码化（src/discipline.js）**：对外回复超 100 词由代码截断并附「…（超过 100 词已截断）」；CJK 一字一词、西文一连串一词。
- **重启恢复注记恰好一次**：恢复后首条注入以「（重启恢复：先检查目录与 git 状态，再重复任何对外动作）」开头，送达即清 recoveryPending。
- **report 三形态（owner-tools）**：summary→等您验收 / question→等您回复 / failure→失败；escalate→被卡住（原"只打标不改阶段"语义废止）。

## 汇报链（#67）

- **每次唤醒至多一条对外汇报**（src/reporting.js）：L2 每次 report/escalate 的事实并入该负责人唯一一条 queued digest 行（先存后做）；digest 等负责人会话转空闲（唤醒结束）才由 OutboxRunner 投递到总负责人会话——同仓库 3 个任务一次唤醒只产生 1 条对外汇报。postpone 不烧 attempts（非失败），2 秒后重看；行 sent 后下一 report 开新行（唤醒边界）。
- **结构化报告四段**：report 的 summary 形态可带 result/changes/verification/risks（结果/变更/验证/风险），四段要么全给要么不给（sections-incomplete），票面存储，digest 逐字渲染（汇报以票面为准，不按会话叙事虚构）。
- **统一出口接通（不假装送达）**：digest 与 to=dsh:session:chief / session:<id> 的 reply 行经 OutboxRunner 实际投递到目标会话（被删自动重建沿用 #promptOwner）；实际投递成功才标 sent。feishu: 等尚无通道的外部目标标 **recorded**（先存后做的持久意图，终态不重试），等真实通道落地后扫描 recorded 行外投。
- **定时汇总自动汇报（默认关）**：config.reporting.auto=true 开启后，1 秒 tick 顺带 autoReportTick（intervalMs 间隔闸门，默认 60s）；汇总只列活跃阶段（进行中/排队中/等您回复/等您确认/等您验收/被卡住），done/failed 不列，空列表不发声（只在结果可用或需要行动时说话）；文本经 100 词截断；**内容与上次相同则不重复发**（unchanged，dev 实证曾刷出「第八份重复汇总」后修复）。devApi POST /deliver 返回 autoReport 字段（force 触发一次，实证用）。
- **DSH 内直接问负责人例外**：谁被问谁答，不绕总负责人（L2 会话本来就是用户可直聊的会话）。
- **下钻**：总负责人收到 digest 后按票面答复；用户追问明细时 query_tasks 下钻到具体票（stageText 朗读 + 票面 detail）。

## 飞书入口（#68）

- **扫码一键建应用**：`POST /hub-bot/api/feishu/register` 启动 `lark.registerApp()` 设备授权流程（RFC 8628）；`GET /hub-bot/api/feishu/status` 轮询拿 `qr.url`（面板可渲染二维码），用户手机飞书确认后 `client_id/client_secret` 写入 `stateDir/feishu-credentials.json`（**0600**）并自动建立长连接。权限一次申请：im:message:send_as_bot / im:message / im:chat:readonly + 事件 im.message.receive_v1。
- **长连接自动配置**：凭证落地后插件调一次 application-config patch OpenAPI 设长连接模式——**未对真实 API 验证**；失败只记日志（手工降级：开发者后台设一次），不阻断。
- **消息归一化与来源标记**：im.message.receive_v1 → Trigger（id `feishu-<messageId>`，重启/重连重放去重）→ 注入 L1 总负责人会话，文本带插件自有标记 `[hub-bot 飞书 <chatId>/<messageId>]` 与回投地址（`reply_source to='feishu:chat:<chatId>'`），与人手输入可区分（task-1 遗留修复）。
- **Policy 代码强制**：bot 自己的消息丢弃；`config.feishu.openIdAllowlist`（默认空=全部只记录不处理，配本人 open_id 即白名单）；群聊只有 @bot 的消息成请求（botOpenId 缺省时任何 @ 宽松算）；非文本消息回「暂不支持该消息类型」。
- **回复回投**：L1 `reply_source to='feishu:chat:oc_…'` 的行是 recorded 持久意图（阶段 2 诚实语义）；FeishuSource.deliverReplies 每秒 tick 扫描、经 im.message.create 实投成功才标 sent；连续失败 5 次标 failed 并报 system-problem。
- **凭据失效**：`status().credentialState` 为 missing/invalid 时面板提示重新扫码（devApi `feishu/status` 同源）。
- dev 实证探针：`POST /hub-bot/api/feishu/simulate` 注入 mock 事件走真实归一化/Policy/注入路径（无真实飞书时实证全链）。

## fork 路径与确认流程（#69）

- **fork 是重操作，永远先确认**：L2 用 `fork_session` 工具只发起**确认**——意图以结构化 action 落票面 `pendingConfirm`（先存后做），票转「等您确认」，确认文本由代码生成（src/fork.js：对象+预期结果+原因，原样呈用户）；确认请求随汇报链 digest 到 L1。确认前 L2 停手，不重复发起、不注入。
- **确认后由代码执行，不靠模型自觉**：L1 `route_to_owner(ticketId, resolution:"confirm")` → Router 调 sessionController `fork()`（缺省取最近完成回合前缀；`atSeq` 可指定含边界切点，丢掉污染的尾巴）→ 票回进行中、`mechanism:'fork'`、绑新会话（新 Assignment）→ 唤醒 L2 注入续作。fork 失败票保持「等您确认」，可重试/拒绝/取消。
- **否定与取消**：`resolution:"reject"` 票转被卡住、**保持原会话**，等用户下一句释放；`resolution:"cancel"` 是终态（票转完成）。两种决议与确认一样记 `confirmOutcome` 于票面供审计。
- **24h 确认超时自动取消**（spec「错误场景」）：1 秒 tick 顺带清扫超时的「等您确认」票——自动取消（by system）并经 L1 统一出口回复「已取消」（先存后做、恰好一次）。
- **互不干扰**：fork 只读源会话事件切前缀，原会话保留可查、全程不再注入；两个会话用户都可打开。默认注入（inject_session）不改变会话拓扑。
- **独立开发的代码隔离**：worktree 创建沿用 Home Repo 约定 `scripts/create-worktree.sh <repo> <issue> <slug>`（worktree 落在 `<repo>.worktrees/<issue>-<slug>`，分支 `fix/<issue>-<slug>`），由执行会话在续作中完成。

## GitHub 自动处理闭环（#71）

- **轮询**：逐仓库 REST 轮询复用本机 `gh auth`（认证限额 5000 次/小时，`config.github.intervalMs` 默认 5min，下限 30s）。**首轮只记水位线**（stateDir/github-watermarks.json），历史存量不触发；之后只处理编号更大的新 Issue/PR，重启不重放。
- **自动处理闭环**：本人新 Issue = 显式请求豁免（无确认）——插件先记 ack 回复意图（先存后做，deliverReplies 实投并强制 dsh-badge）→ 路由进 L2 仓库负责人（triggerRef `github:<repo>:issue:<n>` 幂等）→ 注入文本携带完整链路指令（worktree 修复 → 提 PR → 汇报链通知审核；**永不直推主分支，合并永远由人**）。新 PR 路由初审指令（摘要+风险点）。
- **Policy**：`loginAllowlist` 默认空 = 启动时经 `gh api user` 解析为本人；非白名单作者与 `bot:ignore` 标签只记录不处理（github-dropped 行）。
- **喊停与关闭**：白名单评论「停」→ 任务终止（让位于人，人的消息仍可释放）+ chief 通知；普通评论归入已有任务（follow-up 不产生新 Trigger）；`mentionHandle` 提及 → 新 Trigger（mention 寻址）；轮询发现源头关闭/合并 → 自动终止 + 通知。
- **回复回投**：`reply_source to='github:<repo>:<n>'` 的 recorded 行经 deliverReplies 用 `gh api` 实投为评论——body 缺 badge 由代码补上——实投成功才标 sent；连续 5 次失败标 failed 并报 system-problem。
- **dsh-badge**：bot 在 GitHub 的一切产出结尾带 powered-by-dsh 徽标（ack/回复由代码强制；PR 描述等 L2/L3 自然产出由注入文本与 persona 约束）。
- dev 实证探针：`GET github/status`（逐仓库开关/水位线/错误）、`POST github/poll {repo?}`（立即一轮）、`POST github/simulate {kind, repo, item}`（mock 事件走真实归一化/Policy/路由）。

## 已知限制

- `sessionController.prompt()` 注入的消息 source.kind 为 "user"，与人手输入不可区分；Source/Trigger 层需按 superagent AgentDelivery 模式打插件自有 source 标记（幂等 requestId 已由插件生成 `hub-bot-<uuid>`，路由注入为 `hub-bot-route-<uuid>`）。
- 会话的 permission/sandbox 记录显示 `danger-full-access`（dev profile 默认值）；负责人的只读保证来自 **preset 工具面**（无写/执行工具可调用），不来自会话沙箱模式。收紧沙箱 preset 属 profile 配置，不在本插件范围。
- 插件配置校验为手写 resolveConfig，未引 schemastery——零运行时依赖的取舍；后续若接 DSH 设置 UI 再评估。
- 被删重建依赖"注入失败"这一信号：`session "<id>" not found` 与 `ApiSessionNotFound` 之外的删除表现（如静默丢弃）不会被识别为重建触发。
- **owner 重建后的孤儿会话**（#65 首跑实证）：负责人会话被删重建后，旧会话仍在且保持 owner preset；它出现在 search_sessions 结果里（registry 已指向新会话，无法标记 role:'owner'），可能被 L2 误当执行会话注入，形成嵌套委托。功能上闭环仍成立（嵌套层也是 owner，最终完成并 report），但属噪声；后续可考虑按会话的 preset 名或启动侧写登记来识别孤儿。
