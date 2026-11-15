# 危险命令黑名单实证（#73 补足 / spec「Policy」L260 安全兜底）

> 活实例：DSH_HOME=/tmp/dsh-hub-bot-dev，profile hub-bot-dev，端口 3199，devApi token 见 profile。
> 实证时间 2026-11-15。所有探针票面标注【合成探针】。

## 代码与测试

- `src/security.js`（新）：`DEFAULT_DANGEROUS_PATTERNS`（rm -rf / rm -fr / sudo / git push --force / git push -f / mkfs / dd of=/dev / chmod -r 777 / > /dev/sd / :(){）、`findDangerousPattern`（大小写不敏感子串，返回命中模式或 null）、`dangerousConfirmText`（代码构建确认文本，指明模式与原文）、`DANGEROUS_INJECT_ACTION='dangerous-inject'`、`validateDangerousPatterns`（config 与面板共用，错误类型由调用方决定）。
- `src/config.js`：`security` 节进 KNOWN_KEYS，`{ dangerousPatterns }` 默认内置清单、显式配置整表替换、非字符串数组 ConfigError 拒绝。
- `src/router.js`：`#holdDangerous`（命中 → tasks.askConfirm 挂起，action={type,entry,message[,sessionId,text]} 落票面）；新票路径在 `#insertTicket` 之后、enqueue 之前检查（命中不入队任何注入）；追问路径在 recovery-note 消费之前检查（挂起期间票保持 recoveryPending，恰好一次语义不破）；`resolution:'confirm'` 按 `pendingConfirm.action.type` 分派——dangerous-inject → `#confirmDangerousInject`（route/follow-up 重构建携授权注入文本经 outbox 投递；owner-inject 按票面存储文本直投执行会话；均先 confirm 转 working 再注入，缺授权记录 escalate 拒执——票面权威同 fork 路径纪律）。
- `src/owner-tools.js`：`inject_session` 在 prompt 之前对拼装后的完整文本（含授权行）匹配；命中且带 ticketId → askConfirm 挂起 + 工具抛错（指引 L2 停手等待）；无 ticketId → 直接拒绝。
- `src/tasks.js`：TRANSITIONS 增 idle/queued → person/confirm 边（黑名单在注入前挂起，票未投递先转等确认；audit 忠实记录）。
- `src/panel.js`：SETTABLE 增 `security: ['dangerousPatterns']`；`buildSettingsView` 返回 security 节。
- `panel/app.js`：设置页新增「安全」块（每行一个模式的 textarea + 保存条，仅变更时出现；留空 = 关闭兜底提示）。
- `test/security.test.js`（新，12 例）：匹配矩阵（8 命中 / 4 未命中 / 空清单放行 / 自定义模式 / null 容错）；config 默认/自定义/校验；路由新票命中挂起（person/confirm + action 落票面 + 0 注入 + trigger 先存）；确认放行（恰好一条注入 + 携授权 + confirmOutcome）；拒绝阻断（blocked + 0 注入）；干净消息对照直投；追问命中同护；GitHub 自动入口同护（含 sudo mention → person/confirm）；inject_session 命中挂起→确认按票面原文投递执行会话；inject_session 无票直接拒绝 + 干净文本照常；SETTABLE 编辑/拒绝；确认文本指明对象。
- 全量：**175 tests / 171 pass / 0 fail / 4 skip**（plain）。runtime 见末节。

## 活实例实证（dev 3199）

### E1 路由入口：命中 → 挂起 → 面板确认 → 注入执行

1. `POST /route {ownerId: repo-DSH-Workflow, message: "【合成探针·危险黑名单】请执行 rm -rf /tmp/hub-bot-probe-build 清理构建产物"}`
   → receipt `stage: "person/confirm"`（ticketId tsk-ffe6ab3c…）。
2. SQLite 票面：`stage=person/confirm`，`pendingConfirm.action.type=dangerous-inject`，确认文本=「命中危险命令黑名单（模式 "rm -rf"）：「…原文…」——注入会话无人值守执行命令, 确认后才注入」；该票 **outbox 0 行**（未注入）。
3. `POST /tickets/resolve {ticketId, resolution:"confirm"}`（面板按钮同一路径）→ `{confirmed:true, stage:"working"}`。
4. 票面 `confirmOutcome={kind:"confirmed", by:"user"}`；outbox 新增 `inject|sent`，body = 原消息 + 「授权：user 经 dsh 于 …」。

### E2 GitHub 自动入口同护

- `POST /github/simulate {kind:"issue", repo:"Ghost233/DSH-Workflow", item:{…, body:"请 sudo rm -rf /var/tmp/hub-bot-probe 清理后重新部署 @hub-bot"}}`
  → `{routed:true}`，票 tsk-1a9a0e6a… `stage=person/confirm`、action=dangerous-inject、授权记录 `{actor:Ghost233, source:github}` 仍在票面、outbox 0 行（自动入口命中同样不注入）。

### E3 设置页读写与名单热更新

1. `GET /settings` → `security.dangerousPatterns` = 默认 10 项。
2. `POST /settings {security:{dangerousPatterns:["rm -rf","DROP TABLE","自定义危险词"]}}` → 200 回显；`hub-bot.settings.json` 0600 含 security 节（overlay 累积合并，重启回放机制同其他节——applySettingsOverlay 通用回放，task-11 已实证）。
3. **热更即时生效**：此后 `sudo ls /tmp` 消息 → `stage:"working"` 直投（sudo 已不在清单）；`DROP TABLE sessions` 消息 → `stage:"person/confirm"` 挂起（新清单命中）。
4. 非法值 `{security:{dangerousPatterns:[123]}}` → **HTTP 400** `security.dangerousPatterns must be an array of non-empty strings`，GET 复核清单未被破坏。
5. 实证后已恢复默认 10 项清单（overlay 现为默认等价值）。

### E4 拒绝阻断

- 对 E2/E3 两张挂起票 `resolution:"reject"` → 均 `{stage:"blocked", rejected:true}`；两票 outbox **0 注入行**（永不注入）。

## 双模式测试

- plain：`npm test` → **EXIT=0**，175 tests / 171 pass / 0 fail / 4 skip。
- runtime：`DSH_TEST_RUNTIME_ROOT=... npm test` → **EXIT=0**，175 tests / 175 pass / 0 fail / 0 skip。
