---
id: T-22
spec_revision: R4-V03-1
type: 实现
status: 验收通过
depends_on: [T-20, T-21]
acceptance: [AC-22, AC-24, AC-31]
---

# T-22 实现预留会话与prompt恢复对账

规格：[R4第12.2节及T-14回填](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。来源：[T-14报告](../proofs/t-14/report.md)、[P14前置](../proofs/t-14/proposed-contract.md)。T-21保守真实后端合同已回填，本工单转待办，未启动开发。

## 交付行为与范围

交付P14-B：消费持久领取的执行身份，通过已验证API区分未创建、已创建未提交、运行中、已终态和不确定状态；重启接回同一执行或安全停止相关启动。

不接入全部调度入口（T-15），不实现取消/fencing/硬截止（T-16/T-17），不改变legacy行为。

## 模块与写入归属

候选为恢复会话适配模块、runtime.mjs的runChild/provider和定向集成测试。主线程统一runtime.mjs写入归属，消费T-20发布的接口，不并行修改T-20同一文件。若T-21证明必须修改Harness共享模块，先登记明确实现前置及归属，不能由本工单临场扩展跨仓合同。

候选路径不等于已派发写入权；实施前核验当前文件和既有修改，一个文件同一时间仅一名写入者，主线程独占规格/进度/Git。

## 前置与解除条件

逻辑依赖：T-20, T-21。

T-20须交付稳定领取/身份协议及持久反例；T-21须有真实持久后端正向API合同并回填规格。任一缺失保持阻塞，不能仅依据“开发完成”状态启动。

## 交付要求

- 传递并核验Workflow/plan/task/Owner/request/attempt与预留session/prompt身份；外部调用前必须持久保存，重放不得再随机生成身份。
- 保留create返回后先persistOwnerSession再followup的等待与失败清理；已有session通过T-21证明的查询/resume收集结果，不在新会话重复发送原prompt。
- 对不存在、活跃、已终态与不确定结果按真实日志/回执/lease证据判断；无文件或PID死亡不能单独授权重派。
- 对账不确定时保留账本/身份和已用额度，返回结构化技术暂停，不退款、不阻塞无关任务或冒充用户授权；旧版本/旧lease结果不能结算新attempt。
- 持久结算与T-13完整绑定及回执唯一归属一致，结果重放不重复扣减或覆盖原回执。

## 验收映射与正式证据

关联：AC-22, AC-24, AC-31。共同场景：[进度矩阵](../progress.md)；CA-01仍为唯一交付级定义。

BUD-02/03/09的受控会话适配部分：旧/错身份、已启动无结算、结算重放、未知状态停止、创建/绑定失败不提交prompt、无关调用可继续。消费真实T-20适配与T-21后端，模型可受控；不能stub预算领取或持久后端。

## 完成与后续边界

局部适配及正常/故障序列通过后开发完成，交给T-23联合验证；全入口调度及生产启用仍由T-15/T-19承接。

## T-20 第15轮延续接口承接

消费[恢复接纳合同](../contracts/recovery-admission-v1.md)中的 `DSH_RECOVERY_CONTINUATION_V1`。T-20负责读取和核验，T-22负责在真实执行创建/对账中产生与ownerRun绑定的持久引用；引用不得来自模型自报。前序source/root/request/attempt、task/Owner/plan、预留session/prompt、Owner实际attempt/session必须一致。只有真实后端支持并核验的执行与失败结算事实才能转成T-20约定的本地T-13回执；不能把构造测试状态当成生产者已实现。

后续失败沿原root派生，缺失或错误引用拒绝，不以新root替代对账。T-20的局部测试不解除T-21真实后端合同前置，本工单仍阻塞；未启动实施。

## T-21放行条件（当前）

T-20接口及T-21[真实证据](../proofs/t-21/report.md)、[保守消费合同](../proofs/t-21/proposed-contract.md)已具备，本工单转待办。此前等待T-21的记录为历史状态。

仅支持本次验证的JSONL compression:none、独占受控单prompt session。底层followup不具全历史幂等；不得重新发送已消费/未知prompt。原始终态须先由supportsRawArtifacts/readRaw检查完整JSONL，再与readFrom和listSnapshots前后revision核对；读取异常、torn尾、revision变化、额外输入或所有权不明均暂停。其他后端/压缩格式无专项证据则暂停。组合读取/投影与所有权控制由本工单实施并测试，不宣称T-21已验证全部适配。

不以load/inspect合成的interrupted生成真实失败，不以turn completed代替Owner业务结果。真实结算事实才允许转换T-13本地引用与recoveryContinuation。测试须区分新首次调用、已完成复用、pending、运行中/中断、无日志、冲突/坏记录；所有未知分支保持已用额度且不阻塞无关调用。T-23/T-15仍未解锁，本轮未开始实施。

## 第16轮实施范围与当前缺口

当前状态以本节及frontmatter为准：开发中。此前“待办/未启动/阻塞”表述是阶段历史。第16轮交付只读JSONL对账、T-20持久意图读取和Runtime保守暂停入口；首次Owner启动及resume没有启用。普通模型turn终态仅是观测事实，不能代替Owner业务结算。

正式9组357通过、0失败、21跳过、0超时，1617项候选无漂移。新5个测试覆盖真实source Harness/JSONL的单prompt终态、pending、无artifact、重复输入、合法JSON坏记录/截断尾、压缩拒绝与Runtime错绑定/最小根门禁暂停；未覆盖真实旧lease、完整Owner生产者或T-13结算。独立审查结论以[本轮报告](../rounds/round-16/report.md)为准。

剩余实施须将预留身份接到现有runExternalOwner/runOwnerEntry/createOwnerEntry流程，复用当前计划/Registry/依赖、受控工作区/分支/审计基线及owner_submit；不能直接构造不完整activeOwner并运行裸会话。随后接实际启动和Owner失败的T-13回执与recoveryContinuation，补联合正常/故障序列，才可评估解除T-23前置。

第16轮审查确认F-16/P2：已占用Owner lease使新入口抛异常，未返回约定技术暂停。真实最小复现已保存；接线前需修复并增加实际lease竞争用例。正式后未修复。

## 第17轮：F-16修复

F-16已修复，定向8/8通过，独立审查无新增P1/P2。正式control单次超时后仅补验29项未报告用例，通过；完整去重观察360通过/0断言失败/21既有跳过，保留1次超时。详见[报告](../rounds/round-17/report.md)。本工单继续开发中，后续首次启动及真实结算前置未被此修复替代。

## 第18轮：受保护首次启动与真实failed结算

当前状态仍为开发中。预留session/prompt已沿既有Owner链路执行，真实failed的T13回执与continuation同事务保存，同请求可只读重放；定向9/9通过。首次failed仍抛出OwnerReportedError，后续同request对账返回settled_failed。完整提示词及恢复指令先冻结，普通入口不能复用旧恢复身份。

正式及有限补验420通过、1原始失败、21跳过、2原始超时；失败单项诊断通过，不覆盖原记录。独立审查无新增产品P1/P2；F-17测试拒绝处理时序问题留下一轮。详情见[第18轮报告](../rounds/round-18/report.md)。

剩余为成功/其他结果结算、旧会话resume/重启组合故障、正式状态恢复与调度接线。既有T-21证明不能替代这些T-22行为。T-23/T-15仍不解锁；此前“真实失败生产者未实现”的记录仅为历史阶段，本节为当前进度。

## 第19轮：F-17测试稳定性修复

F-17关闭，独立审查无新增P1/P2；原有回滚断言保留，resilience事先分组完整60/60通过、0失败/跳过/超时。见[报告](../rounds/round-19/report.md)。本轮未扩展产品实现，工单仍开发中；下一候选为真实成功结果T13结算与重放，其余已记录缺口保留。

## 第20轮：真实成功完成与幂等重放

真实finishOwner完成事务中的T13 succeeded/成功receipt及只读重放已接通，绑定固定提交、当前有效task及实际Owner身份。已修复实际完成链路的lease提前释放；新增成功/awaiting_finish负向均通过。此前“成功结果未实现”的表述为历史阶段。

正式421通过、2失败、21跳过、0超时；F-18是新增沙箱服务影响旧观察fixture输入形态，需仅对executable路径（含restart）装配，不放宽产品唯一输入规则。独立审查无新增产品P1/P2，详[第20轮报告](../rounds/round-20/report.md)。

本工单保持开发中：F-18待修，其他结果、旧session/resume、重启组合故障与正式调度仍不具备完整证据。T-23/T-15仍不解锁。

## 第21轮：F-18关闭

仅可执行fixture挂载四个真实沙箱执行服务，restart继承同一选项。产品与原断言不变，完整recovery-session 11/11通过、零失败/跳过/超时，独立审查无新增P1/P2；[报告](../rounds/round-21/report.md)。本工单仍开发中，其他结果、旧会话/重启组合故障与正式调度缺口保留，T-23/T-15未解锁。

## 第22轮：submitted与failed的真实进程重启证据

真实SIGKILL后新进程对submitted未结算返回安全暂停，对settled_failed只读重放；postkill原始state/raw到新进程初始化后/对账后均不变，create/resume/followup/model均0。正式13/13通过，详[报告](../rounds/round-22/report.md)。submitted实际命中额外插件输入拒绝，不宣称所有旧lease/未知单prompt分支已验证。

F-19测试checkpoint前故障时的临时目录清理缺口待修，生产无新增P1/P2。成功重启、创建未提交窗口、其他结果与全runner等边界仍未完整覆盖；本工单继续开发中，T-23/T-15不解锁。


## 第23轮：F-19关闭

父进程预持专属临时容器，checkpoint前真实故障后也能等待child结束并清理Git/worktree。正式14/14通过，1619候选无漂移，独立审查无新增P1/P2；详[报告](../rounds/round-23/report.md)。timeout未动态注入，不扩大覆盖结论。本工单仍开发中，成功重启、创建未提交窗口、其他结果及完整runner缺口保留，T-23/T-15未解锁。


## 第24轮：成功结算后的真实重启证据

真实finishOwner成功结算后SIGKILL，新进程只读返回原successReceipt，保留有效task固定提交及预算绑定；物理state/JSONL未变，agent/model调用0。正式15/15通过，1619候选无漂移，无新增P1/P2，详[报告](../rounds/round-24/report.md)。此前成功重启缺口在这一明确故障点已补齐，不宣称任意结算写点中断均覆盖。

当前仍开发中；下一候选创建会话/绑定后followup前窗口，其他结果与局部故障序列待核对。完整入口接线由T-15承接；T-23/T-15不解锁。


## 第25轮：绑定后发送前的真实重启证据

persistOwnerSession成功返回后、followup前SIGKILL。真实日志尚未物化，重开raw_artifact_missing安全暂停，原身份/预算不变，agent/model0。正式16/16，1619无漂移，无新增P1/P2，详[报告](../rounds/round-25/report.md)。首次定向旧capture假设失败已保留，生产规则不变。

此故障点已有证据，不能外推到create后尚未绑定或所有中断窗口。当前仍开发中，下一轮对照验收映射收敛剩余局部项；T-23/T-15仍未解锁，完整入口接线属于T-15。


## 第26轮：当前关闭条件（取代历史笼统缺口口径）

以[关闭矩阵L1-L4](../rounds/round-26/closure-matrix.md)为剩余局部范围：启动失败不发送、其他Owner结果不误结算、Runtime未结算/错绑定反例、同Runtime同账本独立Owner可继续。四组证据与受影响回归/独立审查具备后评估开发完成。完整跨进程联合矩阵归T-23，正式入口归T-15，不作为本工单完成前置；无需新增自动resume。

本轮只审计，未新跑测试或修改实现；沿用第25轮1619候选及16/16证据。当前仍开发中，不提前解锁T-23/T-15。下一轮优先L1。详[独立审查](../rounds/round-26/independent-review.md)。


## 第27轮：L1已关闭，剩L2-L4

创建API失败、真实创建后绑定失败均无发送/模型请求/结算/退款；真实已创建handle释放，后续同request只暂停。[正式18/18与独立审查](../rounds/round-27/report.md)通过，生产合同未改。T22仍开发中，剩关闭矩阵L2/L3/L4，下一轮优先L2；T23/T15未解锁。


## 第28轮：L2暂不关闭，F-20待修

四类已写真实局部用例；blocked/handoff/no_submit正式通过。pending组合状态的最后reason断言期望错误，实际在旧admissionConfig版本校验即返回reservation_invalid，非后续reservation_binding_mismatch。正式21通过1失败，零跳过/超时，独立审查无新增产品P1/P2；详[报告](../rounds/round-28/report.md)。冻结后未修，下一轮修F20并跑session17。L1关闭、L2待复验、L3/L4待补，T22仍开发中，T23/T15阻塞。


## 第29轮：L2关闭，剩L3/L4

F20期望修正为reservation_invalid，正式session17/17，独立审查无新增P1/P2，L2四类局部不误结算证据齐备，详[报告](../rounds/round-29/report.md)。pending保留版本迁移组合限制；原失败记录保留。T22仍开发中，下一轮L3，L4待补；T23/T15未解锁。

## 第30/31轮：L3关闭

九个L3反例通过；第30轮旧L1基线竞态F21留证后，第31轮以只读inspect等待初次落盘完成，正式26/26，独立审查通过。L1/L2/L3已关，剩L4。持续推进授权下直接执行。

## 第32轮：开发完成

L4真实独立Owner执行及32/32正式回归、独立审查通过，关闭矩阵L1-L4齐备，局部开发完成。交T23联合验证，不标验收通过。

## R88：与 T15 固定来源 handoff 结算对齐

R29 的 L2 结论继续适用于普通 blocked、no-submit、错绑定和未确认 handoff：这些结果不能结算恢复attempt。R60以后，若 handoff 已由 Runtime 固定为当前 plan/task/Owner/attempt/session 的 `sourceExecution`，它是当前恢复执行的确认技术失败；该 RecoverySession 结算为 `settled_failed`，后续 replan 必须另行领取同根额度。旧测试已拆分这两种语义并在R88正式候选27/27通过。此补充不改变T22开发完成状态。

## R100 集中验收

状态：验收通过。关联的AC-22, AC-24, AC-31已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。
