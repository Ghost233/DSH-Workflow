# task-10 实证：可靠性与并发（issue #72）

日期：2026-11-15（Asia/Shanghai）。dev 实例：DSH_HOME=/tmp/dsh-hub-bot-dev，http://127.0.0.1:3199，token=bede31152c2d4b35a4598d3b91f144e7（dev 一次性）。模型 magpie/zhipu/glm-4.5-air。worktree `DSH-Workflow.worktrees/62-hub-bot-plugin`。

交付：执行槽（同 owner 并发 working 上限，默认 3 可配）+ queued 排队 FIFO + 人的专用槽 + 多入口同 owner 串行化 + 先存后做/幂等键全链审计。配置节 `concurrency.slotsPerOwner`；README 并发节。

## 1. 单元测试（node --test，test/slots.test.js 10 例新增）

- 命令：`cd hub-bot-plugin && npm test`（plain）与 `DSH_TEST_RUNTIME_ROOT=... npm test`（runtime）
- 结果：plain 143 通过 + 4 skipped；runtime 147 通过、0 失败（基线 112 → +35：本任务 10 例 + core-a #70 回收用例）。
- 覆盖矩阵：config 默认 3/校验（0/-1/1.5/字符串/未知键全拒）；槽满第 4 票 queued（trigger+ticket+held 行先存、不投递）；FIFO 提升（report→review 释放后最旧 queued 先提升、其余继续排队）；blocked/done 均释放槽；人的跟进对 queued 票立即提升绕上限且注入保序（原注入先投、跟随后投）；槽按 owner 隔离；崩修（working 票配 held 行→下一 tick 释放并送达）；同 owner 并发 routeToOwner 不过量准入（慢 prompt 下恰一票进槽）；Router 重建后提升不依赖内存（先存后做）；queued 阶段朗读 = 排队中。

## 2. 执行槽与 FIFO（live）

新 scratch 负责人 `scr-528b1851-f96f`（POST owners），默认 slotsPerOwner=3（profile 未配置该节）。02:46:28 连发 5 条 /route（sleep 40 + 写文件任务），**同步回执即证据**：

| 票 | 回执 stage | 终局转移链 |
|---|---|---|
| a tsk-1263b099 | working | idle>working@02:46:28 → working>person/review@02:47:57 |
| b tsk-778c6a6a | working | idle>working@02:46:28 → working>person/review@02:49:09 |
| c tsk-e1326ebc | working | idle>working@02:46:28 → working>person/review@02:50:21 |
| d tsk-3e2c4263 | **queued** | queued>working@**02:47:57**（a 交还的同一秒）→ person/review@02:51:28 |
| e tsk-5cf376fe | **queued** | queued>working@**02:49:09**（b 交还的同一秒）→ person/review@02:52:30 |

- 槽满时刻 outbox：a/b/c 行 `sent:inject`，d/e 行 `held:inject`（先存后做，全文在库不投递）。
- FIFO：d（先入队）先提升、e 次之；d 行 created 02:46:28 → sent 02:47:57，e 行 created 02:46:28 → sent 02:49:09；提升与投递同一 tick，提升者 by=system。
- 每票转移链完整（transitions 审计在票面）。

**人的专用槽（live）**：w/x/y 三票打满槽（02:56:05-21 全 working）、z（tsk-630d696a）queued。02:56:45 对 z 发人为跟进 → 回执 stage 立即 working（queued>working@02:56:45 **by=route**，绕过槽上限）；库内该 owner working 计数 = 4 > 3；注入保序：z 的原注入行（held, created 02:56:21）于 02:56:45 先投、跟进注入紧随其后（同秒）。

## 3. 多入口同刻串行（live）

repo 负责人 `repo-task10multi`（cwd /tmp/task10multi）。preload 两票 sleep-90 占 2 槽后，**同一 shell `&` 并发** POST /route（新任务）与 POST /github/simulate（新 Issue #901，作者 Ghost233 白名单）：

- /route 回执：tsk-25534679 stage **working**（抢到第 3 槽）；
- github/simulate 回执：routed=true，tsk-e6ebe285 —— 库内 stage **queued**，inject 行 held，trigger 稳定键 `github:Ghost233/task10multi:issue:901`；
- 同刻两入口恰一票进槽、一票排队，无超额准入、无交错账本（四条 trigger 各自唯一）；
- 02:52:58 preload p1 交还 → gh901 同秒 promoted（queued>working@02:52:58:system），FIFO 在多入口 owner 上同样成立；
- 附带实证失败纪律：#901 的 ack 回投行（recorded）实投 GitHub 因模拟仓库不存在连败 → 标 failed + system-problem 报 chief（预期行为：仓库是虚构的，恰好走完"失败不假装 sent"纪律）；
- 飞书入口：POST feishu/simulate（om_task10_feishu_multi1）→ trigger 落库 + 注入 L1（requestId `hub-bot-feishu-om_task10_feishu_multi1`），与 GitHub 入口同刻共存无冲突；L1 侧的 route_to_owner 由模型节奏决定（捕获时 L1 在压缩大队列，尚未路由——飞书入口的落库与注入即时性已证，路由时效属模型行为不在本任务范围）。

## 4. 人的 pause 跨重启保持（live）

重启前快照 tsk-1263b099（person/review，updatedAt 02:47:57.776Z，report 四段在票面，transitions 2 条，无 recoveryPending）。kill 实例（PID 70947）→ 同参重启（新 PID 79347，HEALTHY 3s）→ 复查：

- tsk-1263b099：**stage 仍 person/review，updatedAt 分毫未动，transitions 仍 2 条，recoveryPending 仍无** —— pause 跨重启原样保持，未被自动恢复；
- 对照：当时 working 的 w/x（tsk-1cc3e351、tsk-0cd34deb）重启后 recoveryPending=true（task-4 重启恢复注记语义，预期）；
- 全库 15 张 person/*/blocked 票 0 张被标 recoveryPending —— 重启清扫只碰 working，自动反馈永不恢复暂停的工作。

## 5. 先存后做全链审计（飞书/GitHub 入口落地后复查）

| 路径 | 对外副作用 | 先存后做 | 幂等键 |
|---|---|---|---|
| 新任务路由（L1 工具 / devApi / GitHub 新 Issue/PR） | 注入 L2 会话 | trigger + ticket + outbox 注入行（槽满时 held）全部先于首次投递 | triggerRef 去重；requestId `hub-bot-route-<uuid>`；outbox 行 `out-<uuid>` |
| 跟进/决议注入（飞书经 L1 / GitHub 评论 / devApi） | 注入既有票 | outbox 行先于投递；票面权威，follow-up 不重绑授权 | 每跟进新 requestId；同一行重投键稳定 |
| queued 票提升 | 注入 L2 | held 行自路由时刻已存全文；提升只改可见性（held→queued） | 同上行内 requestId |
| GitHub ack / reply_source 回投 | 发 GitHub 评论 | outbox recorded 行先于 deliverReplies 实投；成功才标 sent；5 连败 failed + system-problem | `hub-bot-github-ack-<repo>-<n>` |
| 飞书回复回投 | 发飞书消息 | outbox recorded 行先于 deliverReplies；同上失败纪律 | 行 id；unsupported 用 `hub-bot-feishu-unsupported-<messageId>` |
| 飞书入站 → L1 | 注入 L1 chief 会话 | trigger 行先于 prompt（`record()` 在 `sessions.prompt` 之前）；直连 prompt 不经 outbox——由飞书 WS 事件重投 + 稳定 requestId 兜底幂等 | `hub-bot-feishu-<messageId>` |
| L2→L3 inject_session（owner-tools） | 注入执行会话 | 票面（ticket）承载意图；直连 sessionController.prompt，DSH 会话层按 requestId 幂等去重；非对外副作用 | args.requestId ?? `hub-bot-owner-<uuid>` |
| fork 执行（#69） | 创建 fork 会话 | pendingConfirm.action 自 askConfirm 起存票面；confirm 决议后代码执行 | 确认一次性（离开 person/confirm 即不可再触发）。已知间隙：fork 执行与转移之间崩溃 → 重确认会再 fork 一次（窗口为两条同步语句之间，重启后可由人取消多余 fork；记录在案不扩展） |
| 汇报/升级（report/escalate） | 告知 L1/用户 | digest/escalation outbox 行先于投递 | 行内 requestId；reporting digest 每唤醒一条 |

**新漏网副作用复查结论**：飞书（#68）与 GitHub（#71）落地后逐路径复查——两入口的全部对外产出（ack、回复、注入）均经 outbox recorded/queued 行或直连+稳定 requestId 幂等；未发现"先投后存"或裸副作用。唯一不带重投的直连是飞书入站→L1 的 prompt，其幂等由稳定 requestId 与飞书事件重投覆盖。

**幂等键一致性**：triggerRef（路由去重，GitHub `github:<repo>:issue:<n>` / comment `github:<repo>:comment:<id>` 稳定）→ ticket.requestId（首次注入）→ outbox 行 requestId（逐行稳定，重投同键）三层一致；devApi /route 与 L1 工具共用同一路由路径，键规则一致。

## 6. 并发安全确认

- **多入口同 owner 串行化**：routeToOwner（全部四入口）与 tick 提升脉搏均挂在 per-owner promise 链上；槽账本的读-判-写（count→insert→enqueue）为同步序列，不与同 owner 并行调用交错。
- **SQLite 单写者纪律**：node:sqlite DatabaseSync 语句级同步执行，单进程单连接；插件是其 stateDir 库的唯一写者（dev 实例与用户桌面实例各自独立 DSH_HOME/库文件）；WAL 为单写多读配置，无跨进程写假设。提升决策（count→transition→release）全部同步语句，无 await 间隙。

## 7. 规格逐条核对（issue #72 验收框）

- [x] 重启恢复注记（先检查目录与 git 状态再行动）——task-4 已实证（docs/evidence-task-4.md），本任务代码路径未动；pause 跨重启见 §4。
- [x] 人的 pause 跨跟进/跨会话/跨重启保持；自动反馈永不恢复暂停的工作——§4 live 实证；resume 仅由人的 follow-up 触发（router #followUp），tick/提升/自动汇报均不触碰 person/*。
- [x] 槽满新票 queued；人的消息专用槽不被新工作阻塞——§1 单测 + §2 live。
- [x] GitHub 自动任务占普通槽——§3 live（github/simulate 路由进同一槽账本）。
- [x] 模型限流/预算耗尽自动续跑——属 DSH 运行时行为（同 requestId 续跑/重试），插件不感知不干预；票不因运行时重试转 failed。判定依据记录在案。