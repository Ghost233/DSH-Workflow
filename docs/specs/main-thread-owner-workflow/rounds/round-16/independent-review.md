# 第16轮独立只读审查

审查者：t21_contract_review，复用既有独立审查代理。范围为baseline.json到candidate.json/round.diff，不以整个脏工作区冒充本轮改动。正式9组357通过、0失败、21跳过、0超时；审查未修改或重跑候选。

## F-16：Owner lease占用未转换为技术暂停

独立审查原评级P1；主线程复核定为P2。reconcileRecoverySession直接使用withOwnerLease（runtime.mjs:9841）。同进程同Owner已有lease时acquireOwnerLease返回owned:false，withOwnerLease抛异常；另一存活进程持有lease时acquireOwnerLease直接抛占用错误。入口未将确定的lease冲突转换为协议约定的paused。

影响：调用者在普通并发/未知所有权场景得不到结构化暂停，不能按约定稳定分类。当前该入口未接runner，且路径不会create/resume/followup/settle，不产生重复执行或账本损害，因此主线程不采用紧急P1评级；接线前仍必须修复。

主线程[最小复现](lease-conflict-probe.mjs)使用本轮真实source Harness fixture及真实acquireOwnerLease；[结果](lease-conflict-probe.log)为“资源 api 已在本进程的另一个临界区中运行”异常。Workflow状态完全未变，无预留session artifact，模型请求0。复现仅验证同进程占用；跨进程与初始化中分支基于实际源码调用链审查，未声称本轮动态复验。此检查不计入正式357项。

建议：为lease-conflict提供可辨識结果或错误码，在新入口只将确定的占用/初始化/竞争不可用转换为technical_pause/owner_lease_unavailable；保留取消与非冲突IO错误的语义，不把所有异常吞掉，不接管旧session。补实际持有lease的定向用例。

## 其余结论与限制

独立审查未提出其余具体P1/P2。T20 lookup使用完整导入校验再克隆；raw全量展开与readFrom逐项一致，并核对前后revision；读取不调用load/inspect，不把turn终态当作T13业务结算。首次启动、resume、真实Owner结算与continuation尚未交付，属于已披露范围缺口，不能用5个适配测试或357项回归覆盖它们。

正式测试后未修源码、断言或冻结合同。按ghost-matt-implement“本阶段只给结论，不实施修复”，F-16留给下一轮；T-22保持开发中，T-23/T-15不解锁。
