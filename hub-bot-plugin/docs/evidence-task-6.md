# 证据：中枢 Bot 06（issue #68 飞书入口：扫码 + 长连接）

日期：2026-11-15。dev 实例：DSH_HOME=/tmp/dsh-hub-bot-dev，URL http://127.0.0.1:3199，profile hub-bot-dev（feishu.enabled=true，openIdAllowlist=['ou_test']）。token=bede31152c2d4b35a4598d3b91f144e7。

## 交付对照（工单 #68）

| 验收 | 实现 | 证据 |
|---|---|---|
| registerApp 扫码建应用，权限一次申请，订阅 im.message.receive_v1 | FeishuSource.register()（src/feishu.js）：createOnly + appPreset + addons（im:message:send_as_bot / im:message / im:chat:readonly + im.message.receive_v1） | E6 真实设备码流程 |
| 长连接订阅模式自动配置（application-config patch） | #configureEventMode()：**未对真实 API 验证**，失败只记 warn（手工降级），不阻断 | 单测 register() 断言 patch 调用一次 |
| 飞书私聊 → 三层链路 → 回复回飞书 | 归一化 → Trigger 落库 → 注入 L1；L1 reply_source to='feishu:chat:oc_…' → recorded 意图 → deliverReplies 实投成功才标 sent | E2/E8 + outbox 行；实投由单测覆盖（无真实凭证） |
| 群聊只有 @bot 算请求；非白名单只记录不处理 | normalize + handleEvent Policy | E4/E7 + trigger dropped 记录 |
| 非文本回复「暂不支持该消息类型」 | recorded 回复行（先存后做） | E3 |
| 凭据失效面板提示重新扫码 | status().credentialState missing/invalid → devApi feishu/status（面板同源） | E1 |
| 来源标记（task-1 遗留） | [hub-bot 飞书 <chatId>/<messageId>] 前缀 + 来源行 + 回投地址 | E8 transcript |

## dev 实证

### E1 状态探针
GET /hub-bot/api/feishu/status → {"enabled":true,"credentialState":"missing","wsState":"off","allowlist":["ou_test"]}。

### E2 私聊文本 → 注入 L1
POST feishu/simulate（p2p text，ou_test）→ {"injected":true,"triggerId":"feishu-om_dev_e2","sessionId":"session-4c9a189e-…(chief)","requestId":"hub-bot-feishu-om_dev_e2"}。
L1 读后主动 reply_source to='feishu:chat:oc_dev1'：outbox 出现 recorded 行「已收到 E2 探针（feishu/oc_dev1）…」（无凭证不实投、不假装 sent）。

### E3 非文本 → 暂不支持
simulate image → {"dropped":"unsupported-type"}；outbox recorded 行 body=暂不支持该消息类型（to feishu:chat:oc_dev1）。

### E4 非白名单 → 只记录
simulate ou_stranger → {"dropped":"not-allowlisted"}；trigger feishu-om_dev_e4 带 dropped 字段，未进任何会话。

### E5 重放去重
同一 message_id 再次 simulate → {"deduped":true}（trigger id feishu-<messageId> 唯一）。

### E6 扫码建应用（真实设备码流程，实证到 QR 为止）
POST feishu/register → {"started":true}；2 秒后 status 出现：
registration=pending，qr.url=https://open.feishu.cn/page/launcher?user_code=JWZH-89QT&…&name=DSH+中枢+Bot&addons=…&createOnly=true，expireIn=3600。
用户手机飞书打开确认后凭据落 stateDir/feishu-credentials.json（0600）并自动连长连接——需用户真机实测收尾。
后台轮询在 dev 实例驻留（过期自动报错记日志）。

### E7 群聊 Policy
群里无 @ → {"dropped":"no-mention"}（trigger 记录）；@bot → injected（mention 占位符 @_user_1 已剥离）。

### E8 transcript 来源标记
chief transcript 含注入原文：hub-bot 飞书 oc_dev1/om_dev_e2（私聊）与 hub-bot 飞书 oc_grp/om_dev_e7b（群聊 @bot），各 2 处（用户消息 + 助手引用）。

## 单测

test/feishu.test.js 11 项：config 校验、归一化+来源标记+授权记录、bot 自消息丢弃、白名单、群聊 @bot、非文本回复、重放去重、deliverReplies 实投才 sent、失败计数/5 次 failed+system-problem、凭证 0600 持久化、register 设备流+事件模式 patch（未验证标注）。

## 测试 EXIT

本任务交付完成时（impl-aux #69 红测试落盘前）双模式全绿：
- plain：node --test → 94 tests，90 pass / 4 skip，EXIT=0
- runtime：DSH_TEST_RUNTIME_ROOT=… npm test → 94/94 pass，EXIT=0

当前共享树上 test/fork.test.js 与 test/tasks.test.js 新增 6 条 #69 确认流程红测试（impl-aux 并行 task-7 的 TDD 红阶段），导致全量 EXIT=1——均非本任务范围。task-6 受影响范围（最小单测纪律）：
- plain：node --test test/{feishu,config,outbox,router,reporting,store,registry,hub,router-tools}.test.js → 74/74，EXIT=0
- runtime：test/{feishu,config}.test.js → 23/23，EXIT=0
