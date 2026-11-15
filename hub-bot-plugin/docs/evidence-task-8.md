# task-8 / issue #70 实证：三类负责人语义与 scratch 回收

日期：2026-11-15 ｜ 实例：hub-bot-dev @ http://127.0.0.1:3199（DSH_HOME=/tmp/dsh-hub-bot-dev，新代码 job bash-df65d21d70bc4aa8）

## issue #70 验收标准逐条对照

| 验收 | 实现 | 证据 |
| --- | --- | --- |
| "给 <path> 建个负责人"→目录 bot；已是 git 仓库则利用、不强制 init | registry.create(kind:'dir') 按目录身份建常驻 owner（task-2）；git 利用/不 init 为 L1 纪律 | persona.js routerPersona 反问节；代码无任何 init 路径 |
| 路由不到仓库→反问"要建目录 bot 吗？目录是？" | L1 persona 显式反问纪律，落点由用户给，不自猜 | persona.js :23 行（routerPersona 第二条） |
| "搜一下 X"→临时 bot 在 scratch 执行→等验收→验收通过即删 | 全链实证见 E1-E5 | 下方 |
| 回收前报告列目录内容清单；注册表保留 recycled 记录；会话历史保留可查 | persona 回收纪律（report 必带清单）+ Recycler 审计行含清单 + 注册表行保留（recycled:true, sessionId 不抹除） | E4 / 单测 1、5 |
| 产物经飞书或持久目录带出；未带出的随目录删除 | persona 产物带出纪律 + 审计行明示"未带出的产物已随目录删除" | persona.js ownerPersona 回收纪律节；E4 审计行 |

## dev 全链实证（修复后代码）

- **E0 注册**：POST /hub-bot/api/owners {kind:"scratch"} → scr-af2eb692-…，cwd=state/scratch/<id> 自动分配，transient:true, recycled:false。
- **E1 不早产回收**：注册后 4s（sweep 已跑 4 轮）recycled=false、目录在——修复实证：零票 owner 不回收（旧代码曾 1s 内把零票 owner 回收，见"事故与修复"）。
- **E2 路由+懒创建+执行**：POST /route → createdSession:true, stage:working（session-c13e1694）；L2 真实写 hello2.txt（"recycle-evidence"）并 report → 票 tsk-318490c1 转 person/review。
- **E3 验收**：POST /route {ticketId, resolution:"accept"} → accepted:true, stage:done；回收前目录清单：hello2.txt。
- **E4 自动回收（accept 即时触发，不等 sweep）**：accept 后 2.5s 验证——目录已删；注册表 recycled:true, recycledAt 02:41:46（在任务完成之后），sessionId 保留可查；outbox 审计行（to dsh，kind reply）："[hub-bot 回收 scr-af2eb692…] 临时目录 …已删除（共 1 项：hello2.txt）；注册表保留 recycled 记录；会话 session-c13e1694… 历史保留可查。未带出的产物已随目录删除。"
- **E5 已回收拒路由（开新任务）**：再 POST /route 到同一 owner → 400 {code:"owner-recycled"}（spec「已结束任务的跟进」例外：物理无法恢复则开新任务）。

## 单测（test/recycle.test.js，11 项全绿）

1. scratch 全链 done→回收（目录删/recycled/审计含清单/会话保留）
2. 回收安全：同 owner 有进行中票时 done 一票不回收；全部终态后才回收
3. failed（终止）同样触发回收
4. dir 与 repo 负责人永不回收
5. 已回收幂等；非终态票不触发
6. 回收失败不阻断（注入 rm 抛错→warn+不标 recycled+返回 failed）
7. 清单上限（60 文件→审计行截断+总数）
8. sweep 兜底只回收满足条件者
9. Router 回收触发段：accept/cancel 终态转移即时触发 onTicketTerminal；直调 tasks.fail 不触发（sweep 兜底，设计注明）
10. 端到端：router accept 触发即真回收
11. 零票不早产回收 + 已回收 owner 拒路由

## 回收安全与分工

- 触发点：Router 终态转移（accept/cancel/确认超时取消/授权缺失 fail）即时调用 onTicketTerminal；index.js 1s tick 挂 sweep 兜底不经 Router 的终止（owner-tools report-failure、github 源头终止）。
- 失败纪律：回收失败只记 warn，票态不受影响；下轮 sweep 重试。
- 双模式：plain 147 tests 143 pass 4 skip EXIT=0；runtime 147/147 EXIT=0（/tmp/rc-plain.log、/tmp/rc-runtime.log）。

## 事故与修复（实证抓获）

旧逻辑 sweep 只查"无进行中票"→ 零票的新注册 scratch owner 在注册后 ~1s 被早产回收（首个 owner scr-f7a17d8c 的 recycledAt 02:24:06 比其首个票还早，审计"共 0 项/会话（未建）"），随后路由又把目录写活、注册表却标已回收——不一致。修复：回收资格要求"至少有一张票且全部终态"；router 增加 owner-recycled 拒路由守卫。两条都有单测（11）与实证（E1/E5）。

## 并行协调

- impl-aux（task-10）并行重构 router.js queued 执行槽段与测试文件（hub.test.js/owner-tools.test.js 拆分为 discipline/fork/slots 等）：我的落点仅限回收触发段（constructor :71、#notifyTerminal :336 及 :140/:271/:280/:356 调用点），与其无重叠；一次半编辑语法断裂通过 send_message 协调，对方即时补全。
- dev 实例当前由本实证占用（job bash-df65d21d70bc4aa8），跑完已交 impl-aux 重启做 queued/pause 实证。

## 范围边界

- 未动 tasks.js、outbox.js、queued/执行槽段（impl-aux 任务域）；github.js 终止路径的回收由 sweep 兜底覆盖，无需改 github.js。
- 新 dev 探针 POST owners 仅 devApi（token 保护），供 #73 面板复用。
