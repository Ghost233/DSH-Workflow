---
id: T-08
spec_revision: R4
type: 技术验证
status: 验收通过
depends_on: [T-06]
acceptance: [AC-05, AC-06, AC-07, AC-13, AC-29]
---

# T-08 验证公共 Owner 判断会话与过期决定处理

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.8、[公共Owner变更协议V1](../contracts/public-owner-change-v1.md)、第 7 节 S/A/B 场景；V-01。全局边界、状态定义及共同验收见[进度索引](../progress.md)。

## 交付行为与范围

通过真实 Harness 会话适配与可控模型输出，确认 Owner 身份、只读能力、回报和版本检查可以承载公共模块判断。

范围之外：不修改公共业务模块、不新建 Registry、不调用真实钱包或外部服务、不将固定回复当作模型推理能力证明。

## 模块与并行边界

当前实现/测试接缝：[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[agent-policy.mjs](../../../../owner-workflow-plugin/src/agent-policy.mjs)、[control.test.mjs](../../../../owner-workflow-plugin/test/control.test.mjs)、[security.test.mjs](../../../../owner-workflow-plugin/test/security.test.mjs)。这些是执行前需复核的证据位置，不是已经授予的写入清单。

仅在独立测试夹具/临时会话中验证；Harness 子模块不修改，正式 runtime 适配需 B-02 单独落实。

## 前置与解除条件

Blocked by：[T-06 校验公共 Owner 请求和决定引用](t-06-public-owner-request.md)。

T-06已于R93开发完成，请求/决定记录46项固定回归通过；夹具必须直接消费同一协议，不能复制测试格式。

已知阻塞：无。R94已完成真实Harness技术验证；其否定生产结论是可靠交付，不代表B-02/B-03行为已实现。

## 交付要求

- 使用 CA-01 唯一 S/A/B 共同事实，验证 Runtime 绑定正式 Owner，判断者只读，回报能到主线程。
- 回报期间 K1→K2，确认旧决定不会被当当前结果；重复请求、缺消费者事实、超时/取消和身份不匹配均明确返回。
- 检查不同 Owner/容量限制下的会话占用和释放；列出真实适配缺口，回填 Spec 和 B-02/B-03。

## 验收映射与正式测试

关联：AC-05、AC-06、AC-07、AC-13、AC-29。提供设计验证证据；这些 AC 的生产行为仍归阻塞范围和 CA-01 验收。

- 真实 Harness 会话创建/回报/终止证据，模型输出可控；读写能力负例。
- 兼容提案和业务冲突两条回报路径，包含一个迟到决定；不得只验证 JSON 解析。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：报告区分真实适配与模拟判断，所有失败有明确责任与解除条件。 技术验证使用状态“待办→开发中→开发完成→验收通过”跟踪工作交付；最后一项只代表验证任务本身通过审阅。

进入集中验收条件：验证只解除设计未知；B-02 实现后再用 CA-01 验收实际消费者解锁。

## R94交付结论

[R94报告](../rounds/round-94/report.md)用真实Harness创建公共S的只读子会话，并直接消费T06协议。固定模型输出只用于复现适配：Runtime实际施加`read-only`与`approval=never`，越界写入没有落盘；身份不匹配和K1→K2期间迟到决定由T06校验拒绝；超时和父取消均结束会话且不产生决定。

验证同时证明当前通用`runChild`接缝不能直接作为生产B-02：普通文本回报没有专用结构化提交工具，任意一次性会话结束后没有可由fresh Runtime读取的持久决定回执，且只读会诊不占Runner容量或单独的判断资源。上述缺口已冻结为[公共Owner判断会话合同V1](../contracts/public-owner-decision-session-v1.md)，并由[T-28](t-28-public-owner-decision-session.md)承接生产实现。T-08据此标记开发完成；CA-05/07/13/29仍等待B-02/B-03和CA-01。

## R100 集中验收

状态：验收通过。关联的AC-05, AC-06, AC-07, AC-13, AC-29已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。
