# 公共 Owner 变更请求与决定协议 V1

本协议由三个纯状态合同组成：

- `DSH_PUBLIC_OWNER_CHANGE_REQUEST_V1`
- `DSH_PUBLIC_OWNER_CHANGE_DECISION_V1`
- `DSH_PUBLIC_OWNER_CHANGE_LOG_V1`

它只固定公共模块判断的输入、结果、幂等和过期语义，不创建会话、不修改DAG、不授予写权限、不派发任务。T08消费这些接口验证真实只读Owner判断会话，B02再负责生产接线。

## 权威上下文

Runtime调用协议前提供当前Workflow ID、`planRevision`、`planDigest`、Owner集合、Ticket ID/修订、AC、合同ID/修订/Owner、可核验证据引用、消费者事实和`consumerInventoryComplete`。协议对这些事实形成`contextDigest`。消费者清单为空只有在完整性为`true`时才表示已知无消费者；完整性为`false`时，`capability_sufficient`、兼容扩展和迁移决定全部拒绝，只允许`facts_missing`列出有界调查。

## 请求

请求固定稳定`requestId`和递增`requestVersion`，并包含：

- 请求Owner、目标公共Owner；
- 来源Ticket ID/修订及AC；
- Workflow/Plan执行版本、目标合同ID/修订和`contextDigest`；
- 预期行为、实际不足、已登记证据引用和建议；
- 第2版起对前一版request digest的精确`supersedesRequestDigest`。

同ID同版本同内容重放返回同一digest且不新增记录；同ID同版本不同内容冲突。新版本必须连续递增并精确引用前版digest。Owner、Ticket、AC、合同、证据或执行版本不存在/过期时，在写入日志前拒绝。

## 决定

决定必须由请求指定的目标Owner作出，并绑定请求ID、版本、完整request digest及同一baseline。一个请求版本最多一个决定；相同决定重放，冲突决定不能覆盖。支持六类结果：

| outcome | 必要依据 | 控制投影 |
| --- | --- | --- |
| `capability_sufficient` | 完整消费者事实、能力及验证证据；无人需要更新 | `ready/rebind_consumers` |
| `compatible_extension` | 新合同修订、行为和兼容说明、完整消费者影响 | 等待公共Owner实现 |
| `migration_required` | 新合同修订、完整消费者影响及所有`update_required`消费者的精确迁移顺序 | 等待迁移顺序完成 |
| `rejected` | 违反依据及可行替代，或明确不可行原因 | 主线程在原需求内协调 |
| `facts_missing` | 具体未知、调查Owner和解除条件 | 一次有界调查 |
| `business_decision_required` | 原请求AC、当前/拟议承诺差异和后果 | 主线程向用户取得业务决定 |

决定期间执行版本、目标合同、Owner集合或消费者事实变化，当前投影为`stale/request_new_version`，绝不能继续作为消费者解锁依据。兼容扩展和迁移决定本身只证明判断有效，必须等公共实现/迁移和新执行版本生效；只有“现有能力足够”在完整事实下直接给消费者重绑定就绪信号。

实现位于 `owner-workflow-plugin/src/public-owner-change.mjs`，R93证据见[报告](../rounds/round-93/report.md)。
