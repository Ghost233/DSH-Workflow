# 第36轮

两独立Owner失败来源作为明确初始fixture，真实Registry/plan/includeIndependentOwner，最后额度1。两个进程各自ready后go，分别真实reserveRecoveryAdmission，不同请求，仅reserved/replayed可进入真实reconcile。两进程退出后父读取state/raw并核对获准者一次执行、拒绝方无会话/模型/Owner记录改变。只写proof，正式boundary5。

## 开发诊断与正式证据

首次新场景失败因子进程 finally 先 disconnect，外层错误回传再次断开掩盖原始错误；统一由 dispatch 在发送成功/失败结果后关闭 IPC。保留 development-first/diagnostic/unmasked.log。

恢复错误可见性后确认失败来自 saveState 的活跃跨进程写锁拒绝。现有 T20 recovery-admission-worker 已明确采用相同不可变请求、只针对 CAS/lease 冲突的有界重试。本 proof 沿用 2500ms/20ms 上限，记录 admissionErrors；不重试 reconcile 或模型执行。development-fixed.log 定向1通过。

正式候选1621文件，boundary5/5，0失败/跳过/取消/超时，drift=[]。原始 artifact 显示 api 获准并执行 create1/followup1/model2，worker 一次写锁冲突后额度拒绝、全部执行计数0。初始两条失败记录为明示 fixture，不冒充真实失败生产过程；实际 reserve/会话/owner_submit/结算均经生产入口。
