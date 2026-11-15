# task-7 验收证据：fork 路径与确认流程（issue #69）

日期：2026-11-15（dev 实例 http://127.0.0.1:3199，DSH_HOME=/tmp/dsh-hub-bot-dev，模型 magpie/zhipu/glm-4.5-air，实例 job bash-2e03fb4ae0244d6a 由本轮启动）。
代码：hub-bot-plugin/（link: 装载，实例启动时载入本轮全部改动）。

## 1. 单测双模式全绿

- plain：`npm test` → tests 112 / pass 108 / fail 0 / skipped 4（4 个 runtime-root patch 用例按约定跳过）。
- runtime：`DSH_TEST_RUNTIME_ROOT="…/Resources" npm test` → 112/112 pass / 0 fail / 0 skip。
- 本任务新增：test/fork.test.js 13 个用例（action 校验矩阵、确认文本代码生成、confirmTicketFork 成功/atSeq 透传/失败保持/端口缺失/空返回、resolution confirm/reject/cancel 接线、resolution 守卫、24h 超时清扫、互不干扰）+ test/tasks.test.js 5 个 confirm 转换用例（askConfirm action 载荷、confirm/rejectConfirm/cancel 审计、bindWorkerSession mechanism）。

## 2. 活实例全链：确认路径（模型驱动的生产侧 + 代码执行侧）

链：路由任务 → L2 完成 v1 → 真实污染执行会话 → 追问释放 → **L2 按四场景纪律自主选 fork_session** → 票转等您确认 → 确认文本经 digest 到 L1 → devApi /route resolution:"confirm" → **真实 sessionController.fork()** → 票绑新会话回进行中 → 唤醒 L2 → 续作注入**新会话**完成 v2 → report → 等您验收 → accept → done。

- 任务票：tsk-1c67b39a-35a8-4ffd-b068-5f835c6c8ce3（triggerRef task7-fork-live-1），L1=session-4c9a189e，L2=session-cf2229a7（repo-DSH-Workflow），执行会话=session-3fc70cbe（复用既有）。
- 基线：scripts/fork-demo-task7.txt 写入 `v1`，票转 person/review（report「task-7 基线文件已写入（v1）」）。
- 真实污染：向 session-3fc70cbe 注入两条无关闲聊（世界杯、科幻电影），各跑完一个回合（wait reason=idle）。
- 追问释放（resumed:true，票回 working），消息注明上下文已污染。
- **L2 生产侧（模型判断实证）**：L2 本轮唤醒的最后一个工具调用即 fork_session，随后停手（transcript：「污染现场确认…按场景纪律发起 fork（重操作，需您确认后才执行）」；fork_session 为该唤醒 records 里最新一条）。票面 pendingConfirm：
  - text（代码生成，含对象+预期结果+原因+原会话保留可查）：「确认 fork：把会话 session-3fc70cbe-e04a-456d-b126-768af2054445（cwd=/Volumes/外挂/Ghost233HomeRepo/DSH-Workflow） fork 出一个新会话，继续任务 tsk-1c67b39a…——执行会话 …被误注入两条无关闲聊…任务上下文已污染…。预期结果：任务在新会话续作，原会话保留可查、不再注入。确认后执行。」
  - action：`{type:'fork', sessionId:'session-3fc70cbe-…', cwd, reason:'…'}`（先存后做，结构化意图落票面）。
  - 确认请求经汇报链 digest 送达 L1（chief transcript 含「确认 fork：把会话 session-3fc70cbe」原文）。
- **确认执行**：POST /route resolution:"confirm" → 回执 `{confirmed:true, stage:'working', fork:{fromSessionId:'session-3fc70cbe-…', sessionId:'session-1aafa7ec-2e47-4628-97bd-8461fbb1513c'}}`。票面：mechanism='fork'、workerSession=新会话、assignments 追加 running 条目、confirmOutcome={kind:'confirmed', by:'user', result:{fork:{…}}}，transitions 含 person/confirm→working。
- **续作在新会话完成**：L2 收到「用户已确认 fork」唤醒（outbox inject 行 sent，携授权记录与新旧会话 id）→ inject_session 把续作指令注入 **session-1aafa7ec** → scripts/fork-demo-task7.txt 变为两行 `v1`/`v2` → L2 独立核实后 report「fork 续作完成：fork-demo-task7.txt 追加 v2」→ 票转等您验收 → resolution:"accept" → done。
- **互不干扰**：fork 时新会话 transcript 245 事件（含 v1 工作与污染尾部——未传 atSeq，按缺省取最近完成回合前缀）；原会话 219 事件，尾部仍是两条污染闲聊、之后再无任何注入（原会话保留可查、不再注入）。两会话均可独立打开查看。
- **默认注入不改变拓扑**：本轮 inject_session 注入只走既有会话，未新建/分叉任何会话（acceptance 第 5 条）。

## 3. 活实例：拒绝路径（resolution:"reject"）

生产侧与 §2 同码（已实证），本段用合成待确认票直写 SQLite（票面标注「合成探针」，resolution 执行链全真）：

- 合成票 tsk-task7-reject-probe01（person/confirm + fork action + 真实授权与绑定）。
- POST /route resolution:"reject"（message「不用 fork，原会话继续」）→ 回执 `{rejected:true, stage:'blocked'}`；票面：confirmOutcome={kind:'rejected', reason:'不用 fork，原会话继续', by:'user'}，**workerSession/targetSession 保持原会话**、mechanism 仍 inject、未执行任何 fork。
- 追问释放（人的消息直接释放）：POST /route 无 resolution → `{resumed:true, stage:'working'}`，票面 blocked→working by route。
- 附带纪律实证：L2 醒来审理这张无真实工作历史的合成票，主动 escalate（转 blocked）：「…与刚完成的 fork 确认指令『原会话保留可查，勿再注入』直接矛盾…故不执行，请裁决。」——票面权威与 fork 纪律在异常票上同样成立。该探针票留 blocked 待裁决（合成票无真实交付物，属预期）。

## 4. 活实例：24h 确认超时自动取消

- 合成票 tsk-task7-timeout-probe01：person/confirm + fork action，pendingConfirm.at 直写前移 26h（24h 无法实等，时间戳前移模拟超时；清扫/取消/告知链全真）。
- POST /deliver（触发一次 tick）→ 票面：stage=done，confirmOutcome={kind:'timeout', by:'system', reason:'确认超过 24 小时未回应，自动取消'}，transitions 含 person/confirm→done by system。
- 告知经统一出口实投：outbox reply 行 `to='dsh:session:chief'`、state=sent、body「已取消：任务 tsk-task7-timeout-probe01 的确认请求超过 24 小时未回应（确认 fork：…）」；chief transcript 含该原文。重复 tick 不重复告知（单测覆盖幂等，活实例 outbox 仅一行）。

## 5. 接线与工具面（授权范围内）

- src/index.js sessions 端口新增 4 行 fork 方法（Lead 授权，sessionController.fork + flush，30s deadline）；其余行未动。
- src/router-tools.js route_to_owner 的 resolution 枚举扩为 `['accept','cancel','confirm','reject']` 并更新 description（Lead 授权，L1 模型经工具 schema 可达新值）。
- L1 persona 增「确认呈递」三分支段（confirm/reject/cancel + 24h 自动取消告知）；L2 persona 增四场景判断段与 fork 纪律段（确认前停手、确认后注入新会话、原会话勿再注入、独立开发按 scripts/create-worktree.sh 约定建 worktree——复用 Home Repo 既有约定，acceptance 第 3 条）。

## 6. 验收对照（issue #69）

| 验收点 | 证据 |
| --- | --- |
| 四场景路由判断按规格 | §2：污染场景 L2 自主选 fork；persona 四场景段（中断恢复→注入、状态摘要→只读、简单修改→注入、独立开发/污染→fork） |
| fork 先确认、确认后执行 | §2：fork_session 只发起确认；resolution:"confirm" 后真实 fork 执行；失败保持等您确认（单测 fork-failed） |
| 24h 超时自动取消并告知 | §4：done + timeout 审计 + 「已取消」送达 L1 |
| worktree 沿用 Home Repo 约定 | §5：L2 persona 指明 scripts/create-worktree.sh <repo> <issue> <slug> 约定（复用既有脚本，不另造） |
| fork 与原会话互不干扰、都可打开 | §2：原会话尾部无新注入；新会话继承前缀独立续作 |
| 默认注入不改变会话拓扑 | §2：inject 路径全程未新建/分叉会话 |

## 7. 遗留与建议（不属本任务收口）

- **atSeq 可操作性**：read_session 返回消息不含事件 seq，L2 无法精确选切点（本轮 L2 的理由写明"切点取 v1 汇报后、污染前"但拿不出 seq，只能缺省 fork）。建议后续让 read_session 附带事件 seq，或 fork_session 支持按"最近 N 条消息/某条 marker"表达切点。
- dev store 留有两张合成探针票（tsk-task7-reject-probe01 blocked / tsk-task7-timeout-probe01 done）与演示文件 scripts/fork-demo-task7.txt（内容 v1/v2，本证据 §2 引用），dev 实例专用、不影响生产。
- 实例 job bash-2e03fb4ae0244d6a 仍在跑（共享 dev 实例，留给 impl-core-a/Lead 继续使用）。
