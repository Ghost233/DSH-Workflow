---
id: T-17
spec_revision: R4-V03-1
type: 实现
status: 验收通过
depends_on: [T-13, T-15, T-16]
acceptance: [AC-21, AC-24, AC-31]
---

# T-17 实现固定截止和取消结算后再派发

规格：[R4第12节（R4-V03-1）](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：12.4、12.5。来源：[T-09证据](../proofs/t-09/report.md)；全局状态与唯一共同场景见[进度索引](../progress.md)。本次只拆解，未分配实际Owner或启动开发。

## 交付行为与范围

新流程每个执行尝试（包括初次执行）有不可被心跳延长的deadline；截止后保留stopping直到旧执行终止或被安全隔离，才释放资源及允许同Owner下一次执行。

范围之外：不改旧空闲超时含义、不在取消不确定时删除现场或强行放租约、不用延长重试代替终止证明、不处理跨版本身份继承。

## 模块与并行边界

runtime及T-16确认的会话/lease适配，必要workflow-state/supervisor/控制回归；与T-15/T-18共享文件单写入者。初次执行deadline无需恢复扣费，但使用同一安全结算语义。

所列模块是执行前核验的候选范围，不代表已获得写入归属；同一文件同一时间仅一个写入者，主线程独占规格、进度和Git操作。

## 前置与解除条件

逻辑依赖：[T-13](t-13-recovery-budget-ledger.md)、[T-15](t-15-runtime-recovery-budget-admission.md)、[T-16](t-16-owner-cancellation-fencing-proof.md)。

T-15提供当前attempt绑定和持久恢复接缝，T-16必须给出正向终止/隔离证明及有限错误出口；T-13状态协议稳定。T-16仅报告发现缺陷不足以解锁。

## 交付要求

- 在实际开始前固定deadline与attempt/版本，观察、心跳、控制器重启均不能延长。区分idle timeout与hard deadline，使用T-16经验证时间适配。
- 到期持久stopping再请求取消，等待可核验终止或fencing；重复取消/结果回执幂等且不改变used。
- 无法确认终止时停止该Owner再入，有限返回故障和证据；不占住主线程无限等待。旧结果不能在新attempt开始后提交。
- 确认安全结算再释放可释放租约/槽位，保留代码现场；不共享该Owner/资源的T2能实际启动。

## 验收映射与正式测试

关联：AC-21、AC-24、AC-31。共同预算场景引用进度中的BUD编号，只在该处维护；CA-01仍是唯一交付级定义。

BUD-07/BUD-08/BUD-09实际生命周期，覆盖硬截止同时伴随心跳、重启、取消延迟/失败、旧回执、租约失效、独立任务继续。继续运行旧空闲超时正例，不能修改为无差别杀长任务。

正式范围由实施轮次按实际影响固定；停止写入后保存源码/依赖摘要，独立项失败继续采集，保留失败/跳过/未运行/超时。缺必要测试适配时先显式登记前置，不能在验收现场暗中补平台。

## 完成与进入集中验收

硬截止和安全结算闭环通过，原审批/隔离与既有空闲策略不退化；跨版本由T-18、默认启用由T-19、最终交付由CA-01承接。

## 第56轮前置回填

T16已交付经独立审查的真实正向平台接缝、可靠SIGKILL反例及[有限停止适配合同](../proofs/t-16/adapter-contract.md)，其证据前置解除。T13纯账本已就绪；T15完整当前版本恢复接线未完成，故本工单仍阻塞。

本工单负责实现持久stopping、固定deadline/观察窗口、未知终止有限暂停及跨进程结果写入的attempt/session/token/generation检查，并补真实联合验收；不反向要求T16先实现这些生产状态。现有active-session拒绝不是跨进程写入fencing证明。

## R88 前置解除

T15已按C1–C6完成同版本入口关闭，T13/T15/T16全部具备实际可消费产物。本工单解除阻塞转待办，可在持续实施授权下开始；完成条件保持不变。

## R89 实施完成

生产 Runtime 已实现显式配置的固定 hard deadline、只减不增时间状态、持久 `stopping`、真实取消后读取持久 terminal、有限未知终止暂停，以及 attempt/session/token/generation 结果门禁。恢复 attempt 的 T13 debit 仅在匹配 terminal 后结算一次；取消尚未终止时同 Owner 不能再入，不共享 Owner 的任务可实际完成。

正式候选见 [R89报告](../rounds/round-89/report.md)、[实现复核](../rounds/round-89/review.md)与[测试结果](../rounds/round-89/test-results.json)：9套386通过、7个既有legacy跳过、0失败。既有 idle timeout 行为保持；生产默认时长和新 Workflow 默认启用仍归 T19，跨版本继承仍归 T18。本工单标记开发完成，等待B04/CA01集中验收。

## R100 集中验收

状态：验收通过。关联的AC-21, AC-24, AC-31已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。
