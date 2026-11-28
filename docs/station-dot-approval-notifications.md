# Station 的 Dot 通知

全局配对的 MCP 入口支持两类通知。Dot 分别订阅，用户在 DSH 客户端处理请求。

| 事件 | `data.kind` | 触发条件 |
| --- | --- | --- |
| `dsh.approval.pending` | `approval` | DSH 已记录工具审批请求，且同一会话仍有工具审批等候 |
| `dsh.interaction.pending` | `question` | DSH 客户端正在等待普通问题的答复 |
| `dsh.interaction.pending` | `plan_review` | DSH 客户端正在等待计划审核 |
| `dsh.interaction.pending` | `access_approval` | DSH 客户端正在等待应用访问授权 |

通知附带事件 ID 和时间。事件内容只有 `data.kind` 和 `data.session`。同一配对下，同一会话的两类通知使用相同的匿名会话别名。Station 只发仍在等待的请求。重启后重新观察新请求。

## 配对和订阅

新版 MCP 用 `server/discover` 发现 `events` 能力。旧版使用 `initialize`。两版都通过 `events/list` 读取当前可用的事件，再分别用 `events/subscribe` 订阅。旧试点配置继续使用原有的会话查询范围。

默认接收端是 OpenAI 订阅服务的官方 HTTPS 回调。Station 校验域名、公网地址和 TLS。接收端须在 10 秒内回答签名挑战。两类订阅分别加密保存，绑定当前配对和接收端。单个事件来源或订阅记录不可用时，其余事件和只读查询仍可使用。

固定接收端沿用 Station 私有回执目录中的 `station-dot-approval-receiver.json`，权限为 `0600`。文件结构为 `{"url":"<完整 HTTPS 回调地址>","address":"<已核验的公网 IPv4>"}`。订阅密钥和真实回调地址留在本机私有配置中。

## Dot 验收

在独立候选上检查 `events/list`，再用 DSH Dot Pilot 分别订阅两类事件。新增注册项为 `dsh.interaction.pending`，使用上表三个 `kind` 值。分别触发旧工具审批和三种互动，按事件 ID 核对发送与 Dot 收件。每类保留注册、签名挑战、回调状态和收件证据。
