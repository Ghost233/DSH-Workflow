# task-2 验收证据：中枢 Bot 02 — 总负责人与路由链路（issue #64）

时间：2026-11-15 05:35–06:05 +08:00。实例：DSH_HOME=/tmp/dsh-hub-bot-dev，http://127.0.0.1:3199，token=bede31152c2d4b35a4598d3b91f144e7（dev 一次性）。
插件代码：hub-bot-plugin/（link: 装入 profile hub-bot-dev）。dev 实例后台任务：bash-32d4b8ee12c241ee（验收时仍在跑）。

## 1. 启动只懒创建总负责人（pending，无会话）
- 命令：`curl -H "x-hub-bot-token: …" http://127.0.0.1:3199/hub-bot/api/owners`（启动后立查）
- 证据：owners-boot.json —— 仅 chief 一行：kind=repo，cwd=/Volumes/外挂/Ghost233HomeRepo，workspace=Ghost233HomeRepo（basename 推导），sessionId=null，status=pending。无任何会话被创建。

## 2. L1 会话建立（router preset + 注册表绑定）
- `POST /hub-bot/api/sessions {"owner":"chief"}` → l1-create.json：sessionId=session-4c9a189e-bc82-496f-8791-03abf907f01c
- 注册表随后：chief status=created、sessionId 已绑（owners-after-route.json 之 chief 行）。

## 3. 路由链路：L1 注入 → 路由 → L2 懒创建 → 注入 → L2 回应
- `POST /inject {sessionId: chief, text:"继续 DSH-Workflow 的工单 63 收尾"}` → accepted，wait reason=idle（wait-route1.json）
- L1 transcript（transcript-l1-route.json）工具链：
  1. `list_owners {}`（只见 chief）
  2. `create_owner {"cwd":"/Volumes/外挂/Ghost233HomeRepo/DSH-Workflow","kind":"repo","workspace":"DSH-Workflow"}`（persona 惯例 homeRepo/<仓库名>）
  3. `route_to_owner {"ownerId":"repo-DSH-Workflow","message":"用户请求：继续 DSH-Workflow 的工单 63 收尾。请接手处理工单 #63 的收尾事项。"}`
  4. L1 回用户："已建 DSH-Workflow 负责人并路由工单 63 收尾，任务已在其会话排队。"（19 词 ≤30）
- 注册表新增 repo-DSH-Workflow：status=created，sessionId=session-17598df1-2224-4b7b-89f1-6f3099c100ca（owners-after-route.json）
- L2 transcript（transcript-l2-injected.json，46 records）：
  - user/message（rpcId=hub-bot-route-…）：`[hub-bot 路由 tsk-4e3c1f78-…] 用户请求：…\n\n授权：user 经 dsh 于 2026-11-14T21:54:12.634Z；任务 tsk-4e3c1f78-…`（含授权记录）
  - 会话上下文 cwd=/Volumes/外挂/Ghost233HomeRepo/DSH-Workflow（working_directory 工具输出一致）
  - L2 只用 read / working_directory 两个只读工具，实质阅读 AGENTS.md、docs/agents/issue-tracker.md 等并开始处理
  - L2 系统提示词不含 router persona（persona 正确限域于 router preset）

## 4. 歧义输入 → 候选列表 + "其他"，不猜
- `POST /inject {sessionId: chief, text:"继续那个事情"}` → wait reason=idle（wait-ambig.json）
- L1 行为：仅 `query_tasks {}`，随后回复："指代不明确，候选如下：1. DSH-Workflow 工单 63 收尾（刚路由，进行中）2. 其他。请选择，我确认后执行。"
- 本轮**未**调用 route_to_owner。

## 5. 被删会话自动重建 + 注册表更新
- `POST /owners/invalidate-session {"ownerId":"repo-DSH-Workflow"}` → 行指向 session-dangling-5a2a…（status 保持 created，模拟手动删除后的悬挂状态；invalidate.json）
- `POST /route {"ownerId":"repo-DSH-Workflow","message":"重建验证：…"}` → route-rebuild.json：`rebuilt:true`，新 sessionId=session-f7eb52ff-ee71-4b5a-beb2-97f623c9ad1b，ticket=tsk-e67fe797…
- 注册表随即更新为新 sessionId、status=created。
- 新 L2 会话 transcript（transcript-l2-rebuilt.json）含注入原文（[hub-bot 路由 tsk-e67fe797-…] 重建验证…授权…）。
- 注：首跑发现运行时对删除会话的报错是普通 Error('session "<id>" not found')，与契约文档的 ApiSessionNotFound 不符；router.js 的 isMissingSession 已按实测消息模式放宽，并补对应单测。

## 6. 幂等：同一来源重复注入不重复建任务
- `POST /route {…, "triggerRef":"proof:om_1"}` 第一次 → route-idem-1.json：ticket=tsk-4dc489d6…，deduped:false
- 同 triggerRef 第二次 → route-idem-2.json：**同一 ticketId、同一 requestId**，deduped:true
- L2 transcript 只出现"首次投递"一条注入消息，无重复投递文本。

## 7. 单测（TDD：registry/router 均先红后绿）
- `npm test`（无运行时）：35 tests，31 pass / 4 skip（patch 结构测试无解析器时按约定 skip），EXIT=0
- `DSH_TEST_RUNTIME_ROOT="/Applications/Ghost DSH Station.app/Contents/Resources" npm test`：35 pass / 0 skip，EXIT=0
- 覆盖：config 11（含 homeRepo 必填）、store、registry 7（chief 引导幂等/kind 校验/create 幂等/dir 身份/bind→created/markMissing→pending/invalidate/chief 排首）、router 7（懒创建+先存后做/拒路由 chief/Trigger 幂等/删除重建两种报错形态/非缺失故障不重建/queryTasks+replySource）、patch 4（完全只读无 shell 与 jobs、无面向人工具、router-tools 仅在 router preset）。

## 过程中确立的关键机制事实（超出既有认知）
1. preset 挂载子树是**独立模块 realm**：模块单例与 globalThis 均不可达（实测）。
2. 跨 realm 通道实证可用组合：根插件 `ctx.root.reflect.provide('hubBot', hub)` + 子树行 `inject` 声明根组合服务（sessionController/sessionPersistence，承重但不调用）；缺后者则 `ctx.reflect.get` 解析不到、工具行静默 pending。
3. 工具 output schema 不支持 type 数组（['string','null'] 注册期即被拒）。
4. 会话删除对 prompt 的报错形态为普通 Error('session "<id>" not found')。
