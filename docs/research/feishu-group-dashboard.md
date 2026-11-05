# 飞书 / Lark 群总览卡片调研

关联：[Issue #60](https://github.com/Ghost233/DSH-Workflow/issues/60)。文档核验日期：2026-11-05。这里的“已核验”仅指查阅官方文档，并非在实际租户调用验证。仓库未发现既有 research 命名约定，故存放于 docs/research。

## 结论

飞书官方文档支持向指定群发送共享交互卡片并按消息 ID 更新，但更新不是无限期：必须在原消息发送后 14 天内、以相同发送身份更新，且原卡和新卡均明确设置 `config.update_multi=true`。因此长期总览必须考虑换发新卡；群 Pin API 分别提供添加、移除、查询，但所查页面没有证明原子替换能力，不应承诺替换过程中始终恰好一个 Pin。[发送](https://open.feishu.cn/document/server-docs/im-v1/message/create.md)；[更新](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/patch.md)；[Pin](https://open.feishu.cn/document/server-docs/im-v1/pin/create.md)；[移除](https://open.feishu.cn/document/server-docs/im-v1/pin/delete.md)。

## 凭据、权限和群选择（飞书官方文档已核验）

- 创建消息 `POST /open-apis/im/v1/messages?receive_id_type=chat_id`，请求 `receive_id` 为群 ID、`msg_type=interactive`，`content` 为卡片 JSON 序列化字符串；成功响应包含 `message_id` 和 `create_time`，应持久化用于后续更新与计算期限。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create.md)
- 此 API 支持 `tenant_access_token` 或 `user_access_token`；应用身份发送所列权限三选一：`im:message`、`im:message:send_as_bot`、`im:message:send`；用户身份有不同组合要求。必须启用机器人能力并发布应用版本，机器人须加入目标群且有发言权；此接口不支持群自定义机器人。外部群可能需开启对外共享，私有互通群不支持部分消息类型包括卡片，密聊不支持发送。[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create.md)
- 群选择以明确 `chat_id` 为准；其获取方法参见[群 ID 说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/chat-id-description)。未验证本项目的群发现、授权 UI 或凭据存储方式；不能仅凭群名保证唯一或可访问。

## 更新与频率（飞书官方文档已核验）

- `PATCH /open-apis/im/v1/messages/:message_id` 仅用于未撤回的交互卡；token 身份须与发送卡片的身份相同。原卡与更新卡都必须显式 `update_multi=true`；批量消息及仅部分人可见的卡片不受支持。14 天从发送算起，不是最后更新起算；超期错误 230031。卡片更新内容最大 30 KB，样式标签可能增加实际大小。[更新卡片](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/patch.md)
- 更新权限可用 `im:message`、`im:message:send_as_bot` 或 `im:message:update` 之一。单条消息更新 5 QPS，接口总体标示 1000 次/分钟、50 次/秒；发送同一群为群内机器人共享 5 QPS，发送接口总体同为 1000 次/分钟、50 次/秒。发送可用 `uuid` 去重：相同值 1 小时内至多成功发送一条；不同内容应换值。[更新](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/patch.md)；[发送](https://open.feishu.cn/document/server-docs/im-v1/message/create.md)

## Pin 和替换（飞书官方文档已核验）

- [添加](https://open.feishu.cn/document/server-docs/im-v1/pin/create.md) `POST /open-apis/im/v1/pins` 以 message_id 操作；[移除](https://open.feishu.cn/document/server-docs/im-v1/pin/delete.md) `DELETE /open-apis/im/v1/pins/:message_id`；[查询](https://open.feishu.cn/document/server-docs/im-v1/pin/list.md) `GET /open-apis/im/v1/pins?chat_id=...`，按 Pin 创建时间倒序分页。机器人需在会话中，操作者需能看到消息；群设置可能限制仅群主/管理员 Pin。添加和移除权限各可使用 `im:message`、`im:message.pins:write_only` 或 `im:message:send_as_bot`；查询权限为 `im:message`、`im:message.pins:read` 或 `im:message:readonly` 之一。
- 同一消息 Pin/Unpin 各有 5 QPS 限制；各 API 标示 1000 次/分钟、50 次/秒。已 Pin 再添加返回 Pin 信息；未 Pin 或撤回后移除返回成功。[添加](https://open.feishu.cn/document/server-docs/im-v1/pin/create.md)；[移除](https://open.feishu.cn/document/server-docs/im-v1/pin/delete.md)；[查询](https://open.feishu.cn/document/server-docs/im-v1/pin/list.md)
- 建议在到期前发送新卡、确认返回 ID、尝试 Pin 新卡后再移除旧卡 Pin，并持久记录步骤以便失败后核对和恢复。这是工程建议，不是平台原子保证：中途可能同时存在两个 Pin 或由于失败无法完成；是否存在其他原子替换 API **未验证**。不得误删不属于本总览的 Pin。

## 既有凭据复用与群选择（源码与官方文档）

- 本仓 [机器人发现逻辑](../../macos-launcher/runtime/superagent-feishu-setup.mjs)扫描用户 CLI 配置、Station 管理目录和项目配置目录，通过 profile list、bot strict-mode 和 auth status 判定候选；[账号入口](../../macos-launcher/runtime/superagent-accounts.mjs)绑定所选配置目录与 profile，清理可能覆盖身份的环境变量，并检查 bot ready。可考虑复用该入口而非复制密钥，但这只是源码路径，不证明授权包含群列表、发卡或 Pin 权限；未读取任何真实凭据。
- [Lark 官方群列表](https://open.larksuite.com/document/server-docs/group/chat/list.md)支持 tenant/user token，返回对应机器人/用户所在群而非全部租户群，不含单聊；需启用机器人能力及所列群读取权限之一。结果包含 chat_id、name、状态，支持分页（最大 100），按活跃度排序分页可能漏项。建议选择并保存明确 chat_id，不以名称作为唯一标识；可见不等于有发消息或 Pin 的权限。
- [CLI 上游 README](https://github.com/larksuite/cli/blob/main/README.md)声明支持 bot/user 身份、结构化输出、raw API 和权限检查，同时建议将此工具集成机器人作为私人对话助手使用时不要加入群聊或让其他用户交互，避免权限滥用与泄露。若总览机器人也暴露 AI 对话能力，方案与该安全建议存在张力，必须先确定隔离、权限与交互边界；README 的 main 版本不保证等同仓库锁定的 [1.0.98](../../vendor/lark-cli.upstream.json)，具体命令兼容性未核验。

## 未验证与后续验收

- Lark 国际版：本次取得上文群列表官方正文；但发送、更新及 Pin 正文仍未独立核验，不能假定与飞书完全一致。
- 未取得测试租户、应用凭据和目标群，未进行真实发送、共享更新、过期、群管理员权限、Pin 容量或并发替换试验；无证据证明特定租户可用。需在授权测试群验证并记录响应码、创建时间、身份、限流和重试/恢复结果，不记录密钥。14 天边界需真实经过时间或经官方确认，不以模拟时钟代替服务端验证。
- 浏览器守护进程启动受沙箱限制；搜索服务缺少 API key。本次以公开官方 Markdown 直接读取替代，未进行租户操作。
