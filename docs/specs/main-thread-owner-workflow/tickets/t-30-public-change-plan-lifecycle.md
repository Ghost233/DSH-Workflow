---
id: T-30
spec_revision: R4
type: 实现（B03-2）
status: 验收通过
depends_on: [T-27, T-28, T-29]
acceptance: [AC-05, AC-06, AC-09, AC-13, AC-17, AC-18, AC-22, AC-29]
---

# T-30 将公共 Owner 决定绑定到执行版本与消费者生命周期

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md) 5.2、5.5、5.8。

## 交付行为

- PlanRevision显式引用当前公共请求与决定digest；激活事务从Runtime权威日志核对，不从普通文档文字推断决定。
- 兼容扩展只允许目标公共Owner拥有实现任务；消费者任务必须引用该实现结果和正确合同版本。
- 需要迁移时按决定中的消费者集合和顺序形成可执行依赖；缺失消费者、错误Owner、旧决定或不完整前置拒绝激活。
- 公共实现固定提交、验证和workflow集成成功后才解锁消费者；取消、失败、重启或重复回执不产生双写入者或重复集成。
- 业务决定、拒绝与事实缺失继续停在主线程动作，不自动生成实现节点。

## 验收

使用同一S/A/B固定场景贯通K1判断→K2实现→A/B正确消费，并覆盖K1→K2迟到决定、实现取消、Runtime重启、重复完成回执和消费者引用错误。完成后关闭B-03/F10的生产实现，完整交付仍等待T10/B06、T11/T12/B05和CA-01集中候选。

## R97完成证据

- [实现报告](../rounds/round-97/report.md)与[独立复核](../rounds/round-97/review.md)固定公共决定内部Intent、PlanRevision绑定、合同/消费者/迁移校验和历史重放边界。
- [正式结果](../rounds/round-97/test-results.json)记录379项受影响回归：358通过、21个既有legacy跳过、0失败、0取消。
- T30真实Harness专项覆盖K1权威决定、统一控制器自治批准、唯一K2实现、消费者前置、fresh Runtime重放和缺绑定拒绝；普通提交关卡回归覆盖固定验证、commit、workflow集成及失败/取消不结算completed。
- 本状态仅为开发完成；CA-01集中候选未运行，T10/B06和T11→T12/B05仍待交付。

## R100 集中验收

状态：验收通过。关联的AC-05, AC-06, AC-09, AC-13, AC-17, AC-18, AC-22, AC-29已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。
