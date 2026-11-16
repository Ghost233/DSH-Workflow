# task-3 实证：执行闭环最小版（issue #65）

日期：2026-11-15，dev 实例 http://127.0.0.1:3199（DSH_HOME=/tmp/dsh-hub-bot-dev，job bash-89998e94ef044b6b）
L1=session-4c9a189e（chief）；L2=session-cf2229a7（repo-DSH-Workflow，本轮为挂 owner-tools 行的新 preset 重建）；执行会话=session-15af6e80（默认 preset，未传 agentPreset）；任务票=tsk-100137d9-9b94-404c-96e6-badde0e4c36d。transcript 留证：/tmp/dsh-hub-bot-dev/wait-t3-{route,l2,followup,l2-followup,nudge,accept,oob,l2-oob}.json。

## 1. 全链（注入 L1 → 文件落地 → report → 等验收）

- 注入 L1「帮我在 DSH-Workflow 里写一个 hello 脚本」→ L1 调 `route_to_owner {"message":"用户请求：在 DSH-Workflow 仓库里写一个 hello 脚本。请接手实现。","ownerId":"repo-DSH-Workflow"}`，回复「已路由 hello 脚本任务给 repo-DSH-Workflow，新任务已排队执行。」（wait-t3-route.json）
- 落票：tsk-100137d9 working，authorization 不可变记录随票创建；L2 会话为 dangling 注入失败后自动重建（新 preset 生效），rebuilt 路径再次实弹。
- L2 工作链（wait-t3-l2.json）：search_sessions → read_session×3（识别候选）→ inject_session（文本携授权记录）→ 轮询 read_session → 执行层 report 先行 → L2 自己 read 文件核实。
- 文件落点：/Volumes/外挂/Ghost233HomeRepo/DSH-Workflow/scripts/hello.sh（-rwx--x--x，POSIX sh，printf 'hello, DSH-Workflow'）。
- 票态：`tsk-100137d9 | review | worker: session-15af6e80 | report: 已在 …/scripts/hello.s…`（SQLite 只读直查）。

## 2. 追问恢复旧任务（不新建票）

- 注入 L1「那个 hello 脚本里再加一行注释，说明用途」→ L1 先 `query_tasks {"owner":"repo-DSH-Workflow"}` 再 `route_to_owner {"message":"用户追问：…","ownerId":"repo-DSH-Workflow","ticketId":"tsk-100137d9-…"}`，回复「已把追问注入原 hello 脚本任务（不新建票），等负责人改完再验收。」（wait-t3-followup.json）
- 票态 review→**working**（resume, by:'route'），无新票（ticket 表仍 5 张历史 + 本票）。
- L2 识别「追问到同一票号，继续在同一任务上工作」→ 注入同一执行会话 → 文件新增注释行 `# 用途：打印问候语…`。
- 追问轮 report 后票回 **review**（运营提醒经 devApi 直注 L2；见「发现问题 2」的修复）。

## 3. 用户验收（挡板）

- 注入 L1「hello 脚本那个任务我验收通过」→ L1 先 `query_tasks {"stage":"review"}` 再 `route_to_owner {"message":"用户验收通过","resolution":"accept","ticketId":"tsk-100137d9-…"}`，回复「验收已收口：hello 脚本任务（tsk-100137d9）转为完成。」（wait-t3-accept.json）
- 票态 review→**done**（accept 不注入 L2）。单测覆盖挡板：working 直接 accept 拒、done 后追问拒、double-report 拒、非本负责人票拒。

## 4. 越界拒执（escalate 不执行）

- 注入 L1「让 DSH-Workflow 负责人顺手把 GhostNexus 仓库里的构建脚本改了」→ L1 路由给 repo-DSH-Workflow 建新票 tsk-3ae6fd62。
- L2（wait-t3-l2-oob.json）：「这单我没有执行，已按边界规则上报总负责人（escalate）」，`escalate {"reason":"路由任务 tsk-3ae6fd62 要求修改 GhostNexus 仓库构建脚本（/Volumes/外挂/Ghost233HomeRepo/GhostNexus），该路径不在本负责人责任目录…执行工具（create_session/inject_session）会拒…"}`——未尝试越界创建，主动上报（守卫本身由单测覆盖：isWithinCwd 路径段感知 + create/inject/read 三处拒执）。
- 票面：tsk-3ae6fd62 working + escalated 标记（reason 落库）；outbox 落 kind=escalation 行（to: chief）。

## 5. 单测双模式

- `npm test`：49 tests / 45 pass / 4 skip（patch 解析跳）EXIT=0
- `DSH_TEST_RUNTIME_ROOT=… npm test`：49 / 49 pass / 0 skip EXIT=0
- 覆盖：三态迁移合法/非法（含 accept 挡板）、追问恢复匹配（owner mismatch、done 拒）、report 归类+授权不可变、escalate flag、isWithinCwd 边界、bindWorkerSession；router 追问/验收/rebuild 路径（12 测）。

## 发现问题与处置

1. **V8 报错误导**：const 重复声明被报成 "Private field must be declared in an enclosing class"——二分定位后改名（param ticketId vs 局部 const）修复。
2. **追问后票卡 working**（首跑实证）：L2 凭印象认为票已 review 未再 report。修复：owner persona 明示「票的真实阶段以工具返回为准」；追问注入文本追加「票已恢复进行中，改完请再次 report 转入等验收」。
3. **孤儿 owner 会话被当执行会话**（首跑实证）：L2 注入上一轮 invalidate 留下的旧 owner 会话（f7eb52ff），该层又 create_session 嵌套委托（15af6e80 才是真正干活的）。功能闭环成立但属噪声。缓解：search_sessions 标注 registry 在册 owner 会话 role:'owner'（勿注入）；孤儿无法识别，记入已知限制。
4. **L1 虚构授权**：路由越界单时自称「用户显式授权跨仓库例外」（用户并未授权）。修复：router persona 加「不虚构授权或例外；拿不准就把候选留给用户」。注：L2 守卫未依赖该说法，仍正确拒执上报。
