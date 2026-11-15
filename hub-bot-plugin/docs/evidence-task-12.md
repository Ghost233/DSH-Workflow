# task-12 验收证据：整体验收 13 条逐项实证（issue #74）

日期：2026-11-15（dev 实例 http://127.0.0.1:3199，DSH_HOME=/tmp/dsh-hub-bot-dev，模型 magpie/zhipu/glm-4.5-air）。
实例代码版本：ad7d9ae（GET /hub-bot/panel → 200 实证含 task-11 面板；本轮发现监听器已被重启加载最新码，PID 19511）。
判定口径：逐条对 spec docs/specs/hub-bot-plugin.md L429-441；边界在案项按 Lead 裁定判「达成（边界在案）」。

## 总表

| # | 条目 | 判定 | 证据 |
|---|------|------|------|
| 1 | 飞书扫码建凭据 | 达成（边界在案） | §1 |
| 2 | 双入口同路径 | 达成（边界在案） | §2 |
| 3 | 飞书"继续某功能"链路 | 达成 | §3 |
| 4 | 状态模型朗读 + 逐任务展开 | 达成 | §4 |
| 5 | fork 确认 + 原会话事件流不变 | 达成 | §5 |
| 6 | 非授权丢弃 / 群聊未@不任务 | 达成 | §6 |
| 7 | 负责人无长等待、仍可收消息 | 达成 | §7 |
| 8 | 确认一次后安静执行、一句回报 | 达成 | §8 |
| 9 | 重启恢复注记恰好一次、不丢不重有序 | 达成 | §9 |
| 10 | 槽满时跟进进行中任务立即送达 | 达成 | §10 |
| 11 | 谁授权/何时/基于哪条消息 | 达成 | §11 |
| 12 | GitHub 白名单闭环（真实仓库） | 达成 | §12 |
| 13 | c 类临时 bot 回收 | 达成 | §13 |

**本轮新发现不符合项（源码未动，待 Lead 裁定）**：P1-A 回复投递可重入致重复外发（§12.4）；P1-B reply_source 输出 schema 缺 truncated 字段（§3.3）。P0 无。

## 测试基线（双模式 EXIT 留证）

- plain：`npm test` → tests 160 / pass 156 / skipped 4（runtime-root patch 用例按约定跳过）/ fail 0，PLAIN_EXIT=0。
- runtime：`DSH_TEST_RUNTIME_ROOT="/Applications/Ghost DSH Station.app/Contents/Resources" npm test` → 160/160 pass / 0 skip / fail 0，RUNTIME_EXIT=0。

## §1 飞书扫码建凭据（第 1 条）— 达成（边界在案）

- 活实证：POST /feishu/register → 202 {started:true}；feishu/status → registration:"pending" + QR url（user_code UUXZ-VDVX，expireIn 3600，应用名「DSH 中枢 Bot」、描述与权限插件均预填在 url 参数里——用户全程不进开发者控制台）。
- 可重触发：registering 守卫下重复调用返回 {started:false, registration:'pending', qr}（index.js:428），与 Lead 在案口径「QR 重触发即可」一致。
- 扫码后自动化（凭据写入 + 长连接自动建立）：evidence-task-6.md E1-E3（credentialState missing→凭据写入→wsState 路径）+ feishu.js register/connect 代码路径在案。
- 边界在案：真机扫码需用户手机参与（Lead 裁定，不算缺口）。本轮 QR 已挂起待扫，有效期 1 小时。

## §2 双入口同路径（第 2 条）— 达成（边界在案）

- 同一 chief 会话（session-4c9a189e）transcript 内两种来源并列、处理无异：
  - seq1556 user/message：`[hub-bot 飞书 oc_task12/om_task12_continue1] 继续 DSH-Workflow 里那个登录功能 来源：feishu 用户 ou_test…`（飞书入口，经归一化/策略/先存后做，见 §3）。
  - seq1589 user/message：`总结一下 DSH-Workflow 仓库的进展`（DSH 侧注入，经 devApi /inject 进入同一会话）。
  - 两条记录同类型同会话，后续处理（assistant 回复 + 工具调用）同一管线。
- 边界在案：DSH 界面里亲手打字属用户桌面动作；会话本身是普通 DSH 会话、用户可直接打开聊天（限制在案：注入与手打消息 source kind 有别，README 已声明）。

## §3 飞书"继续某功能"链路（第 3 条）— 达成

- 活实证（feishu/simulate om_task12_continue1「继续 DSH-Workflow 里那个登录功能」，05:09:41Z）：
  1. 触发先存后做：triggerId feishu-om_task12_continue1，注入 chief（seq1556，来源标记齐全）。
  2. L1 确认仓库并路由：seq1561 tool/call route_to_owner(ownerId=repo-DSH-Workflow, message 携完整来源上下文「飞书用户 ou_test（私聊，chat oc_task12，消息 om_task12_continue1）」) → seq1562 已路由，新票 tsk-7031ccbd。
  3. L2（session-cf2229a7）选中会话注入续作；负责人审理后回问（票转等您回复，seq1604 L1 朗读「负责人已回问，票在等答复」）——仓库无既有「登录功能」任务，建新票并回问属正确处置。
  4. 事件流与直接发消息无异：全链只有普通 user/message 注入与 tool/call 记录，无特殊通道事件（对照 §2 seq1589 的 DSH 侧消息处理形态一致）。
- 注：L1 对明确可匹配的仓库直接路由（spec「L1 确认仓库」由 L1 自主完成，无需往返用户）；匹配不明时反问的路径在 router persona L23 在案。

### §3.3 发现 P1-B：reply_source 输出 schema 缺 truncated

- 活实证：seq1559 L1 调 reply_source 回复飞书 → seq1560 工具报错 `"value.truncated" is not a declared property (additionalProperties: false)`。
- 根因：router.js:611 replySource 返回 {outboxId, state, truncated}，router-tools.js:144 输出 schema 只声明 {outboxId, state} 且 additionalProperties:false → **每次调用都模型侧报错**。
- 危害放大：副作用已发生（outbox 行 recorded，正文完整），但模型看到的是失败——L1 据此向用户声称「未送达」（seq1576），实际行已记录、凭据就绪后会投递。模型认知与真实状态背离，可能诱发重复回复。
- 修复建议（供 Lead 裁定）：schema properties 补 truncated（一行改动）。

## §4 状态模型朗读 + 逐任务展开（第 4 条）— 达成

- 活实证：注入「总结一下 DSH-Workflow 仓库的进展」→ L1 seq1604 答：`存储核实（repo-DSH-Workflow，24 票）：等您确认 1（tsk-4e3c1f78…fork 新会话续作 #63 收尾）/ 等您回复 1 / 被卡住 3 / 失败 1 / 等您验收 11（逐票列 id 与票面事实）/ 进行中 1`；seq1632 全量 48 票分桶重读。九态词汇逐票朗读 = 状态模型朗读 ✓。
- 逐任务展开历史：面板 overview API（GET /hub-bot/api/overview）每票携 trigger（原始消息）+ authorization（授权三要素）+ assignments + question/pendingConfirm/report（Trigger→当前的票面轨迹）；三问视图实证见 evidence-task-11.md。面板视觉呈现属用户桌面边界。

## §5 fork 确认 + 原会话事件流不变（第 5 条）— 达成

- 引用 evidence-task-7.md §2 全链实证：真实 sessionController.fork()（session-3fc70cbe → session-1aafa7ec），**互不干扰**：fork 时原会话 219 事件、尾部两条污染闲聊、之后零注入（原会话保留可查）；新会话 245 事件续作完成 v2。§2 末行：默认注入不改变会话拓扑。
- 确认纪律：fork 先转等您确认（pendingConfirm 票面含对象/预期/原因），用户 confirm 后代码执行，reject 保持原会话（§3 拒绝路径亦实证）。

## §6 非授权丢弃 / 群聊未@（第 6 条）— 达成

- 活实证（本轮重跑）：ou_stranger 私聊 → {dropped:"not-allowlisted"}；ou_test 群聊未@ → {dropped:"no-mention"}。
- 存储核验：两条 trigger 行 dropped 记录在案，**均未建任务票**（ticket 查询 false）。与 evidence-task-6.md E4 一致。

## §7 负责人无长等待、仍可收消息（第 7 条）— 达成

- 结构性保证（代码层面无法 sleep/长等待）：owner 会话工具面 = search_sessions / read_session / create_session / inject_session / report / fork_session / escalate（owner-tools.js 注册清单）——无 bash、无写文件、无任何执行工具；persona L72「你没有写文件和命令执行工具…工具即权限边界」。
- 活实证（与 §10 同轮）：执行会话跑 sleep 180 期间，负责人会话照常接收并处理追问注入（05:15:23 同秒送达，见 §10）——长命令在 L3 执行会话由 DSH 运行时转后台管理，不阻塞 L2 收消息。
- 说明：「5 秒转后台」常数属 DSH 运行时 bash 工具行为，本插件不持有该常数；插件侧的可验收承诺（负责人不被长命令拖住）已结构性达成并实证。

## §8 确认一次后安静执行（第 8 条）— 达成

- 归类批处理活实证：outbox digest 行 05:18:08 一条消息并 3 票（m1/m2/m3，bodyLines 数组）；03:56:48 一条并 18 票——「同仓库多任务只产生一条对外汇报」。
- 无进度刷屏：任务开始→完成之间，对外通道（dsh:session:chief / feishu / github）无进度类 outbox 行；任务期只有 inject（入执行会话）与 digest（唤醒结束一条）。
- 确认一次：fork 类确认只呈一次（pendingConfirm 单条，persona L51「用户确认前不重复发起」；24h 超时自动取消见 evidence-task-7 §4）。

## §9 重启恢复恰好一次、不丢不重有序（第 9 条）— 达成

- 引用 evidence-task-10.md §4 活实证：注入暂停跨重启恢复（recoveryPending 设置/恢复注记随首次注入携带/注记恰好一次/追问不再携带）；§6 顺序与幂等（per-ticket FIFO、triggerRef 去重不重复建任务、重启后补投）。
- 引用 evidence-task-4.md：恢复注记恰好一次（grep 计数 0 实证）。
- 关联新发现：对外回复通道（feishu/github deliverRecordedReplies）存在并发重复发送风险，本轮在 GitHub 真实投递观察到一次（见 §12.4，P1-A）——不影响本条目既有重启语义证据，单列为不符合项待裁定。

## §10 槽满时跟进进行中任务立即送达（第 10 条）— 达成

- 活实证：scr 负责人 3 槽全满（tsk-371c05ed/76e0f309/fb5d9aec working，各 sleep 180）：
  - 跟进进行中票 tsk-371c05ed → 回执 stage:working，outbox 追问行 created 05:15:23 = sent 05:15:23（**同秒送达**，跟进不走槽位）。
  - 对照：同时刻第 4 个新任务 → stage:queued（新工作排队，人的消息不排队）。
- 相关：queued 票的人审专用槽证据见 evidence-task-10.md §3。

## §11 授权三要素（第 11 条）— 达成

- 存储核验：全库 42→48 票（本轮多次采样，期间新建 6 票），authorization 缺失 0。分源抽样：
  - dsh 源：{actor:"user", source:"dsh", at:"2026-11-14T21:54:12Z"}，trigger 行存原始消息全文（「继续 DSH-Workflow 的工单 63 收尾…」）。
  - github 源：{actor:"Ghost233", source:"github", at, messageId:"https://github.com/Ghost233/DSH-Workflow/issues/76"}，trigger 存 Issue 标题正文。
  - 飞书路由票（tsk-7031ccbd，person/answer）：authorization {actor:user, source:dsh, at}（记录 L1 路由行为），triggerId 即飞书消息 id om_task12_continue1，trigger 行存原始正文与完整来源上下文（「来源：飞书用户 ou_test（私聊，chat oc_task12，消息 om_task12_continue1，时间戳）」）——可追溯至飞书原始消息。
- 三要素齐备：谁授权（actor）、什么时候（at）、基于哪条消息（messageId/trigger 原文）。

## §12 GitHub 白名单闭环（第 12 条）— 达成（真实仓库全链）

### §12.1 真实仓库全链（Ghost233/DSH-Workflow）

- 05:09:37Z 建真实 Issue #76（gh CLI，作者 Ghost233 ∈ 白名单，探针内容：package.json 补 repository 字段——修复目标真实存在）。
- 05:09:38Z 强制轮询（自然周期 300s = spec 的 5 分钟上限；强制只缩短等待）→ triggered:1 → 票 tsk-a6388b4c（working，授权三要素齐）。
- 05:09:39Z **ack 真实落在 Issue 评论区**：「已受理，处理中。」+ powered-by-dsh 徽标（创建→ack ≈2s，远优于 5 分钟上限）。
- L2 → L3 修复链：worktree 修复 → **05:17:12Z 真实 PR #77 开启**（fix(hub-bot-plugin): add repository field (issue #76)）。
- 05:19:59Z **汇报链回投 Issue 评论**：「修复已提 PR：https://github.com/Ghost233/DSH-Workflow/pull/77 ——」；票转等您验收（05:20:18）。
- 遗留用户动作：审 PR #77（合并或关闭）、关 Issue #76。二者为真实仓库验收产物，按约不由代理擅自关闭。

### §12.2 bot:ignore 与非白名单（模拟源重跑）

- 带 bot:ignore 标签 Issue → {dropped:"bot-ignore"}，不触发。
- 非白名单作者 Issue → {dropped:"not-allowlisted"}，只记录不动作。

### §12.3 「停」终止（模拟源，进行中票）

- Issue #904 路由 → 票 tsk-2a23d1ef（working，sleep 300 中）→ 评论「停」→ {terminated}；票面链 idle>working:system → working>failed:system。
- （旁证：对已完成的票喊停被正确拒绝：person/review→failed 非法转换报错。）

### §12.4 发现 P1-A：回复投递可重入，同一 recorded 行可被重复外发

- 活实证：Issue #76 评论区出现**两条相同 ack**（05:09:39 与 05:09:40，相差 1 秒）；outbox 仅 1 行（sent@05:09:38）、trigger 1 行、票 1 张——同一 recorded 行被投递两次。
- 根因：outbox.js deliverRecordedReplies 扫描 state='recorded' → await send（gh api 约 1-2s）→ 标 sent；**无在投标记/重入守卫**。1 秒 tick 不等待上次完成，重叠调用在 send 未回时重扫到同一行 → 再投一次。feishu 通道共用该驱动，同样暴露（spec 第 9 条「不重复」的对外面）。
- 复现条件：任一 recorded 行投递耗时 >1s（gh 实投常态满足）。
- 修复建议（供 Lead 裁定）：通道级在投守卫（delivering 标志/模块级 in-flight Set），或投递前先把行原子翻转为扫描不可见的中间态。

## §13 c 类临时 bot 回收（第 13 条）— 达成（本轮全链活实证）

- scr-528b1851-f96f-4a30-9426-02d6852ea16c（scratch 负责人，cwd /tmp/.../scratch/scr-528b1851）：13 张票（task-10 槽位证据 a-e/w-z + 本轮 m1-m4）全部完成并逐票验收（resolution:"accept" → done，含 m1-m3 一条批量 digest 汇报）。
- 末票终态 → recycle 判定 → **自动回收**：owner.recycled=true；临时目录已删除（ls 验证 DIR-DELETED）；会话历史保留（sessionId session-22baaa5d 保留可查）；回收审计行已入 outbox（[hub-bot 回收 scr-528b1851…] 携目录内容清单，发 L1 统一出口）。
- 安全侧在案：有进行中票时不回收（本轮 m4 working 期间回收未触发，验收完成后才触发）；evidence-task-8.md 另有 core-a 的全链实证。

## 附：本轮新增探针残留

- Issue #76 开放 + PR #77 开放（真实仓库验收产物，待用户审处）；feishu 注册 QR 挂起（1 小时过期自动失效）；task10multi 模拟票 tsk-2a23d1ef failed（停 探针，预期态）；outbox 内 feishu 回复行 recorded 待凭据（凭据缺失时通道挂起不报错）。

## 修复记录（P1-A / P1-B，Lead 派回，TDD）

### P1-A outbox 回复投递重入复投 — 已修

- 改：src/outbox.js — deliverRecordedReplies 加**通道级在投守卫**（模块级 Set，按 channel 隔离）：重入调用立即返回 {delivered:0, skipped:'in-flight'}；纯进程内状态、不落盘，崩溃后下一 tick 自然重试仍为 'recorded' 的行（无卡死态）。feishu/github 共用该驱动，两通道同护。
- 测：test/outbox.test.js 新增 2 例——慢 send 跨 tick 重入断言只投一次（red：未修时 sends=2 复现复投）；守卫按通道隔离（github 在投时 feishu 不被阻塞）。
- 注：修复需实例重启后生效（当前 dev 实例仍运行 ad7d9ae）。

### P1-B reply_source 输出 schema 缺 truncated — 已修

- 改：src/router-tools.js — output schema properties 补 truncated:{type:'boolean'}；render 在截断时明示「正文超 100 词已截断」（模型可见，消除认知背离）。
- 测：test/router-tools.test.js（新文件）——注册面夹具下逐属性校验 execute 返回 ⊆ schema 声明（red：truncated 未声明时失败，复现运行时校验报错）。

### 修复后测试基线

- plain：npm test → tests 163 / pass 159 / skipped 4 / fail 0，PLAIN_EXIT=0。
- runtime：DSH_TEST_RUNTIME_ROOT="…/Resources" npm test → 163/163 pass / fail 0，RUNTIME_EXIT=0。

### 遗留观察（不阻塞，记录在案）

- OutboxRunner.tick（注入泵）同样无重入守卫；注入侧有 requestId 幂等与先存后做，风险面不同，未在本轮授权范围内改动——若后续观察到注入重复再单独立项。
