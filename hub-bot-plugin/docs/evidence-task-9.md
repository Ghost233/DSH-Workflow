# task-9 实证（#71 GitHub 自动处理闭环）

scope: src/github.js（新）、src/config.js（github 节）、src/index.js（挂载+探针）、test/github.test.js、README.md、docs/dev-profile.patch.yml。
环境：dev 实例 http://127.0.0.1:3199（DSH_HOME=/tmp/dsh-hub-bot-dev，job 见会话）；state /tmp/dsh-hub-bot-dev/state/hub-bot.sqlite；profile 含 github:{enabled:true, loginAllowlist:['Ghost233'], repos:[Ghost233/DSH-Workflow]}。

## 验收标准逐条（gh issue view 71）

| 标准 | 落点 | 证据 |
| --- | --- | --- |
| 首次轮询只记水位线，存量不触发 | pollRepo 未初始化分支只写 watermark | E1（真实仓库 74 个存量 → triggered 0，watermark maxNumber=74 落盘） |
| 本人新 Issue 自动受理，全程无需确认 | handleIssueEvent → ack 意图 + routeToOwner（无 confirm 节点） | E2 + 单测 new-issue 用例 |
| bot 产出带 dsh-badge | ack 落库即带 badge；deliverReplies 对缺 badge 的 body 代码级补上；注入文本要求 L2/L3 产出带 badge | E2（outbox body 含 shields 徽标）、E3、单测 deliverReplies |
| bot:ignore 只记录不处理 | handleIssueEvent labels 检查 → github-dropped 行 | 单测 bot-ignore 用例 |
| 回复「停」即终止任务 | handleCommentEvent body==='停' → tasks.fail + chief 通知 | E4（ticket failed + dsh 通知行） |
| Issue 关/PR 合并关闭 → 任务自动终止并通知 | checkClosures 逐活跃票重查，closed/merged → 终止+通知 | 单测 closures 用例（fake gh）；真实仓库无已关闭 Issue 可安全闭环（只读约束，见下） |
| 非白名单 login 只记录不处理 | loginAllowlist（空=启动时 gh api user 解析本人）→ not-allowlisted drop | 单测；E0 gh api user 返回 Ghost233 |
| 永不直推主分支；合并永远由人 | 注入文本携带链路指令；插件无任何 push/merge 通道 | E3（L2 transcript 含指令原文） |
| 逐仓库监听开关默认全开 | config github.repos[].enabled 缺省 true；pollAll 只跑 enabled | 单测 config 用例 |

## 实证记录

- E0 真实 gh 只读探测（形状验证）：gh api user → {"login":"Ghost233"}；issues?state=all 返回 [{number,title,state,user.login,labels[].name,pull_request?,created_at}]；issues/comments 返回 [{id,issue_url(尾部即 issue 号),user.login}] — 与 normalizeIssue/handleCommentEvent 的字段消费逐键吻合。
- E1 首轮只记水位线：POST github/poll → {triggered:0,dropped:0,terminated:0}；github-watermarks.json 落盘 {initialized:true,maxNumber:74,commentsSince:…}（真实最新 issue=#74，存量 0 触发）。
- E2 mock 新 Issue #999 全链：POST github/simulate → {routed:true,ticketId:tsk-f7dc…,ownerId:repo-DSH-Workflow}；重复 simulate → {deduped:true} 同 ticket（triggerRef 幂等）。SQLite：trigger 行 authorization {source:github,actor:Ghost233,addressing:direct}；ticket stage=working、triggerId=github:Ghost233/DSH-Workflow:issue:999；ack outbox 行 body 含「已受理，处理中。」+ powered-by-dsh 徽标。
- E2b ack 实投失败纪律（真实 gh，不假装发了）：#999 不存在 → gh POST 404；recorded 行连错 5 次（githubAttempts=5）→ failed + system-problem 行生成。与 feishu/OutboxRunner 同一纪律。
- E3 L2 注入文本（repo-DSH-Workflow 会话 transcript，2.7MB）：含 [hub-bot github Ghost233/DSH-Workflow#999] 标记、「永不直推主分支；合并永远由人」链路指令、reply_source to='github:Ghost233/DSH-Workflow:999' 回投地址、徽标要求、授权行「授权：Ghost233 经 github 于 …」。
- E4 喊停：simulate comment body=停 → {terminated:tsk-f7dc…}；ticket stage=failed（让位于人，人可再用消息释放）；outbox 增 to=dsh 通知行「源头评论喊停，任务 … 已终止（让位于人）」。
- E6 重启不重放：重启 dev 实例（新 job）→ status 显示 watermark 从磁盘恢复（maxNumber:74, initialized:true）→ POST github/poll → {triggered:0}；ticket 表仍 1 行（#999 未重放、未重建票）。
- E7 GET github/status：逐仓库 enabled/workspace/initialized/maxNumber/maxCommentId/lastError + 全局 intervalMs/loginAllowlist/mentionHandle（面板三问的 GitHub 侧数据面）。

## 单测

test/github.test.js 14 项全绿：config 校验与默认（含逐仓库开关默认全开）、首轮水位线、新 Issue 全链（标记/授权/ack/badge/triggerRef 幂等/重轮询去重）、非白名单、bot:ignore、PR 初审指令、停 终止+通知、评论跟进归属、mention 新 Trigger、源头关闭/合并终止、deliverReplies 实投+badge 补齐、5 连败 failed+system-problem、重启水位线恢复、status 形状。

## 范围与边界

- 只读约束：真实 GitHub 侧未创建任何 issue/评论/PR（spec 与 lead 均限定真实 gh 只读探测）；源头关闭的**真实**闭环由单测 fake gh 覆盖（逐活跃票重查 → closed/merged → 终止+通知），live 侧 E6 轮询跑了 checkClosures 全路径（活跃票集空，terminated:0，无异常）。
- 写范围外小改：test/config.test.js 全对象断言补 github 默认键（与 task-6 feishu 同样性质）。
- mentionHandle 约定 '@hub-bot'（gh auth 身份=用户本人，@本人会淹没在普通提及里；真实 handle 定名留给 #74 整体验收）。
- 遗留：task-6 飞书真机扫码收尾（与本任务无关，另行触发）。
