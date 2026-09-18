# R8–R10 实机验收记录

> 后续修正：本文是 00:43 的历史记录。关于整份 Ticket revision 导致全图失效、审批后必须新增 R11、以及只读审核期间禁止后继文档写入的结论，已由 [结构调整](structural-adjustment.md) 和 [恢复进入条件](recovery-entry-checks.md) 取代。新结构尚未测试或加载。

更新时间：2026-09-14 00:43（Asia/Shanghai）。完整 Coinhub 目标尚未完成。

## 当前结果

- 同一 Workflow `wf-90bbced7a68641494bb651e73f3c22d6ba4b3354`，激活版本 2，16 个任务中 1 个成功、2 个失败、13 个待执行。
- 已读取主线程及第 1–95 个 Owner/native 子会话。第 94 个 R9 规划审核两次提交被 dirty/changed baseline 拒绝；第 95 个浏览器候选审核正式收据为拒绝。
- R8 seed 复用已有代码通过并集成；当前集成头 `1ef4949a3ba76a77d68db7613c72624438a97d8c`。
- foundation 的 4 个测试通过，但 R8 新要求的可复用版本化 unary/stream 场景包缺失。浏览器候选缺少共享调用入口，网络拦截仍需未来测试手动调用；版本命令不能证明 Chromium 实际可启动。

## 已证实的编排问题

1. R9 只要求修订浏览器节点，Planner 实际重写了全部 16 个任务定义，并改了 seed 验证 ID。原有递归 taskDigest 正确地使这些任务失效。
2. R9 Reviewer 执行时，主线程写入并 finalize R10，导致旧审核的来源基线不再有效。第 94 个会话没有成功提交结构化报告，动作进入 uncertain。
3. 16 个任务共享同一张 Ticket 和无内容摘要的 `implementation` fragment。Ticket revision 变化会令所有任务的来源绑定失效；不能声称跨 revision 的复用已有等价证据。
4. 依赖安装已成功，后续 promotion、hardlink normalization、seal 共用同一个 300 秒预算。2.4 GiB 基础目录提升阶段约耗 155 秒，最终 cache_seal 超时。安装收据和已提升目录仍在，缺少最终 seal 收据；没有 ENOSPC 证据。

## 本轮自研修改与验证

- workflow_replan 必须声明 affected_task_ids、affected_verification_ids。沿用递归 taskDigest，在预提交和正式结果中拒绝边界外修改，不静默改回旧对象。边界外新审核义务持久化后返回主线程，避免在原边界下自动循环修复。
- 根线程原生 write/edit 与 checkpoint 写入使用现有 control-state.lock；规划/审核/来源准备未结算时拒绝写入。Workflow 接纳在同一锁内最后校验可变来源，消除检查到接纳的竞态。
- 保留严格来源失效规则。本次单 Ticket R10 必须诚实进行全量重新验证；后续技术修复沿用冻结来源。未加入来源兼容豁免或第二种执行身份协议。
- promotion、normalization、seal 各自使用现有固定 300 秒阶段时限，继续受外层 action deadline 约束。失败耗时按实际阶段记录。测试证明只读基础目录封存中断后能继续恢复且不再运行 npm。
- 针对性原生测试 110/110；新增边界审核回归后 engine 75/75；依赖和原生授权 39/39。
- 当前候选 `ad182aa656f106ce558daf63684ca7c2390af15e519fc16ad52ca0e0fdfda3c7` 内核回归 388/388。首次外层沙箱内执行原生测试遭遇 `sandbox_apply: Operation not permitted`，随后在外层沙箱外按相同 DSH 配置运行通过。另一次全量回归的唯一失败是测试替身缺少新准入方法，已修正替身后通过。

## 仍需验证

- 上述新代码尚未加载进实机宿主。主线程已确认保持等待，未取消或重建 Workflow。
- R9 审核在原截止时间 00:42:35 后进入现有 stop_execution 正式结算路径；不能仅凭会话结束或 PID 不存在宣称终止。
- 失败 pendingPlanning 与 Registry 范围变更之间的恢复顺序仍在独立核对。R10 检查点、现有候选与全部历史保留。
- Web/扩展构建、完整 Panel 旅程、公共 Owner 与下游重新验收、最终用户工作区交付仍未通过，不能用插件回归替代。
- `~/.dsh`、用户凭据/模型/审批/沙箱/缓存配置、上游源码均未修改；浏览器始终复用 tab 1。
