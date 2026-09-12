---
id: T-16
spec_revision: R4-V03-1
type: 技术验证
status: 验收通过
depends_on: [T-09]
acceptance: [AC-21, AC-24, AC-31]
---

# T-16 验证Owner取消确认和租约隔离的真实接缝

规格：[R4第12节（R4-V03-1）](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：12.4。来源：[T-09证据](../proofs/t-09/report.md)；全局状态与唯一共同场景见[进度索引](../progress.md)。本次只拆解，未分配实际Owner或启动开发。

## 交付行为与范围

用真实可控执行会话确认取消请求、终止信号、旧结果拒绝与资源可释放时点，给T-17一个可实施的有限停止协议。

范围之外：不实现预算账本、不用永不完成Promise替代真实终止证据、不调用真实生产服务、不修改生产取消/租约实现。

## 模块与并行边界

只写proofs/t-16夹具/证据，只读runtime、owner-agent、external-runner和实际Harness会话接缝；与T-13逻辑独立、无共享写入。执行前若需外部凭据或环境另行记录限制。

所列模块是执行前核验的候选范围，不代表已获得写入归属；同一文件同一时间仅一个写入者，主线程独占规格、进度和Git操作。

## 前置与解除条件

逻辑依赖：[T-09](t-09-durable-budget-proof.md)。

T-09已给出取消未结算/lease有效的实际反例；可先核验当前会话与lease能力，无需等T-13账本。若只能mock取消，则结论只能是适配未证明，不解锁T-17。

## 交付要求

- 明确取消返回值与真实停止事件的关系，覆盖执行中取消、已结束后重复取消、取消抛错/延迟、父控制器重启后对账。
- 持有真实Owner租约，证明取消未结算时同Owner不可重入、确认结束后的安全释放和旧结果fencing；独立Owner可继续。
- 给出单调/持久deadline与观察窗口的适配方式、控制器重启后的剩余时间计算，以及无法确认终止时有限返回技术故障的合同。
- 优先使用本地可控子进程/实际Harness会话，记录是否经过真实provider；若能力缺失，列最小实现前置并回填12.4，不写生产补丁。

## 验收映射与正式测试

关联：AC-21、AC-24、AC-31。共同预算场景引用进度中的BUD编号，只在该处维护；CA-01仍是唯一交付级定义。

BUD-07/BUD-08的生命周期验证，时间可注入但执行/取消/终止信号必须真实；逐项有限超时与清理，不依赖30分钟sleep。无法确认资源回收的记录不得标通过。

正式范围由实施轮次按实际影响固定；停止写入后保存源码/依赖摘要，独立项失败继续采集，保留失败/跳过/未运行/超时。缺必要测试适配时先显式登记前置，不能在验收现场暗中补平台。

## 完成与进入集中验收

可靠正向方案或否定报告完成审阅。只有能证明终止/隔离的正向接口和失败出口固定后T-17解除阻塞；不要求本轮已有新预算模块。

## 第46轮后并行验证开始

主线程持续授权下，独立worker只写proofs/t-16，先验证真实Harness执行中cancel返回与实际结束/重复取消，生产源码保持只读。此为首个有界切片，不代表T16全部要求已完成；主线程负责规格和进度回填。

## 首个局部接缝证据

[报告](../proofs/t-16/report.md)与原始JSONL终态摘要、源码归档已审校。cancel同步返回时无turn/end；取消后采样lease仍持有且同Runtime拒绝再入；原Promise结束后采样已释放，持久turn/end为aborted。不能由两个采样证明整个间隙不早释，也不能用“未owner_submit”错误当终止证据。T16仍开发中；第二切片仅写proofs/t-16/round-02，验证取消间隙跨Runtime lease及独立Owner，不修改生产代码。

## 第二证据切片复核

[round-02报告](../proofs/t-16/round-02/report.md)：实际跨Runtime同进程lease拒绝、独立Owner完成及终止后新token，正式1场景通过；主线程复核认可有限结论。跨进程/重启与旧结果fencing未证明，T16保持开发中，不解锁T17；round-03继续仅在独立proof目录验证。

## 第三、第四切片复核

[round03](../proofs/t-16/round-03/report.md)跨OS进程lease拒绝证据经独立复核，报告用语已修正为Owner执行终止（不是进程死亡）。[round04](../proofs/t-16/round-04/report.md)证明旧lease对象/旧child提交拒绝，未证明新attempt结果fencing；runExternalOwner失败拒绝不代表recoverOwner缺失。主线程复核见[R53记录](../rounds/round-53/t16-round-03-04-review.md)。round05走真实恢复入口继续，T16未完成。

## 第五切片复核

[round05报告](../proofs/t-16/round-05/report.md)经主线程核对，真实recoverOwner新attempt运行时旧child提交拒绝且record不变，新attempt随后settled_succeeded；有限同进程结论成立。剩余矩阵和适配合同见[remaining-contract](../proofs/t-16/round-05/remaining-contract.md)，round06联合验证进行中，不将T16或T17标完成。

## 第56轮：技术验证交付完成

六轮真实接缝、SIGKILL重启反例及[停止适配合同](../proofs/t-16/adapter-contract.md)经主线程和独立审查核对，T16标为开发完成。报告中要求先实现T17才能完成T16的循环依赖已纠正。仅解除T17的T16证据前置，T17仍等待T15。

正向接口为实际cancel/terminal、lease隔离及新attempt中的旧child拒绝；未知终止明确有限技术暂停。跨进程旧token结果写入和持久stopping/deadline由T17实现后补验，不以同进程门禁替代，AC-21/24/31与BUD-07/08未验收通过。[审校记录](../rounds/round-56/review.md)。此前各轮“未完成”是当时的局部结论，当前以本回填为准。

## R100 集中验收

状态：验收通过。关联的AC-21, AC-24, AC-31已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。
