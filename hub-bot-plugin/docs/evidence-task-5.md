# task-5 实证：汇报链（issue #67）

日期：2026-11-15（dev 实例 http://127.0.0.1:3199，DSH_HOME=/tmp/dsh-hub-bot-dev，模型 magpie/zhipu/glm-4.5-air）
代码基线：hub-bot-plugin 80 测试双模式 EXIT=0（plain 76 pass/4 skip；runtime 80/80）。

## E1 · 定时汇总开关默认关（无自动汇报）

- profile 未配 reporting 时 POST /hub-bot/api/deliver 返回 `{"delivered":true,"autoReport":{"skipped":"disabled"}}`。
- 单测：resolveConfig 默认 `{auto:false, intervalMs:60000}`；auto 非 boolean / intervalMs 非正数 / 未知 key 均抛 ConfigError。

## E2 · 单任务链全通（执行 report → L2 归类 → L1 转告用户）

- 路由 tsk-fb025fb0（写 .scratch/task5-probe-a.md）→ L2 执行会话写入 → report 带四段 → 票面转 person/review。
- digest 行（bodyLines=1，四段逐字票面）state=sent，投递到 chief 会话 session-4c9a189e。
- chief transcript（探针B tsk-3d8ce97d 同构链摘录）：
  > [repo-DSH-Workflow] 汇报：tsk-3d8ce97d 已到「等您验收」——探针B已写入 .scratch/task5-probe-b.md（一行 `task-5 probe B`，已独立回验），等您验收，验收通过我再收口。

## E3 · 多任务归类：一次唤醒一条对外汇报，事实不互相污染

- 连续路由两票 tsk-35dc3726（探针C）、tsk-cde420f1（探针D）→ 两票 report 落在同一唤醒 → digest out-9f8e304a **bodyLines=2**，state=sent，attempts=0（postpone 不烧尝试）。
- digest 全文（每票一行，C 的事实归 C、D 的归 D）：

  ```
  - tsk-35dc3726…｜等您验收｜结果：探针C已写入…；变更：.scratch/task5-probe-c.md 新增…；验证：读回验证…；风险：无
  - tsk-cde420f1…｜等您验收｜结果：探针D已写入…；变更：.scratch/task5-probe-d.md 新增…；验证：读回验证…；风险：无
  ```

- chief 一句话归类转告：「两票到『等您验收』——探针C…与探针D…均已写入并独立回验，无风险。连同之前的探针B，三票都等您验收。」
- 唤醒边界机制：digest 行在 owner 会话 running 时由投递器 postpone（nextRetryAt=+2s，不记 attempts），空闲后才发出；行 sent 后下一 report 开新行。

## E4 · 汇报以票面为准（会话叙事夸大不进汇报）

- 向 owner 会话注入夸大叙事（「DSH-Workflow 全仓库 2000 个测试已全绿、文档全部重写完毕」，明确标注无对应票面），随后路由 tsk-308f8c9c（探针E）。
- digest out-fb74353f 只含票面四段（探针E 写入/变更/验证/无风险）；正则 `2000|全仓库|文档全部重写` 零命中。
- 机制：digest/汇总文本由 factLine/buildAutoSummary 从票面（stageText 朗读 + report.sections/summary + escalated/failed 记录）渲染，会话叙事根本不在输入里。

## E5 · 定时汇总自动汇报（开启后）+ 100 词截断 + 去重

- profile 加 `reporting: {auto: true, intervalMs: 10000}` 重启；POST /deliver 返回 `{"autoReport":{"outboxId":"out-39fc22ab…","truncated":true}}`。
- reply 行（state=sent，to=dsh:session:chief）正文：

  ```
  [hub-bot 定时汇总] 11 项任务待您关注：
  - tsk-308f8c9c…｜等您验收｜探针E已写入
  - tsk-cde420f1…｜等您验收｜探针D已写入
  - tsk-35dc3726…｜等您验收｜探针C已写入
  - tsk-3d8ce97d…｜等您验收｜探针B已写入
  - tsk-fb025fb0…｜等您验收｜探针文件已写入
  - tsk-62f340cf…｜被卡住｜路由任务…GhostNexus…（超过 100 词已截断）
  ```

- 只列活跃阶段（等您验收 + 被卡住 + 进行中残余），done 票（tsk-012b2ed7 等）不列；空列表不发声（单测：skipped:'empty'）。
- 100 词截断复用 discipline.js（truncated=true，附「…（超过 100 词已截断）」）。
- **实证抓到的缺陷与修复**：intervalMs=10s 时 chief 收到「第八份重复汇总」——状态未变照发违反消息纪律。已修：autoReportTick 内容与上次相同 → `skipped:'unchanged'`。实证：修复后连续两次 /deliver 均返回 unchanged，无新 reply 行。

## 过程中抓到并修复的实现缺陷（单测已加回归）

1. **digest 行缺 requestId**：recordReportFact 建行未带 requestId，真实 sessionController.prompt 拒绝 → 投递 3 连失败 + system-problem 行（先存后做机制如实记录了故障）。修复：建行带 `hub-bot-digest-<uuid>`；单测断言 requestId 前缀。
2. **queryTasks detail:undefined 破坏 lossless JSON**：chief 收到 digest 后调 query_tasks，工具输出含 undefined 被拒（transcript 实证：`Error: tool "query_tasks" returned invalid output: value is not lossless JSON`）。修复：detail ?? null；单测断言 detail 键存在且为 null。

## 验收标准对照（issue #67）

| 标准 | 证据 |
|---|---|
| 执行完成 → 汇报链到达总负责人统一出口，一句话 | E2：digest→chief，chief 一句话转告 |
| 一次唤醒内 3 个任务完成只产生 1 条对外汇报 | E3：两票一条 digest（单测 3 票 1 行）；唤醒边界=会话 running/postpone |
| DSH 内直接问负责人时负责人自答 | 架构属性：L2 会话用户可直聊，汇报链不拦截（README 记录） |
| 汇报中可追问下钻到具体任务明细 | chief persona：追问用 query_tasks 下钻；query_tasks 每行带 stageText+detail（票面） |
| 汇报遵守消息纪律 | E5：默认关、只列活跃、空不发声、100 词截断、内容不变不重复（unchanged） |

## 测试

- reporting.test.js 6：归类合并（3 报告 1 行）、唤醒边界（sent 开新行）、四段逐字渲染、digest 前缀与票 id、requestId 前缀、autoSummary 活跃过滤+空 null。
- router.test.js +6：digest postpone→idle 一条投递、reply 统一出口（session 投递 / 外部记录）、autoReport 关/开/interval/截断、lossless JSON、unchanged 去重、empty 沉默。
- outbox.test.js +1：postpone 不烧 attempts；tasks.test.js +1：sections 四段全有或全无；config.test.js +2：默认关/解析。
- 双模式：plain 76 pass/4 skip（runtime 相关 patch 测试跳过），runtime 80/80。EXIT=0。
