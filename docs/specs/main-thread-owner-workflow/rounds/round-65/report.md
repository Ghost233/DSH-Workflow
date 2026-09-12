# R65：候选恢复拒绝不再依赖daemon内存退避

实际workflow-drive捕获候选不可重试的恢复错误，持久保存来源绑定的candidateRecoveryPause与mainOutbox技术报告。控制器先通过现有plan-revision-drive投递指定通知，然后明确wait；daemon的实际discoverRunnableWorkflows不再选择同源候选。公有Review/rebuild也不能覆盖当前pause。真实外部等待投影优先，不把技术问题转成产品决定。

已结算失败的Planner/Review使用RecoverySemanticFailure返回retry-ready，保留同root有限后继ordinal；预算拒绝才暂停，不能把所有错误都误停。来源含active A、候选C、相关操作/session/attempt回执及来源Owner/task；排除daemon retry/时钟、投递标记、无关Owner/task与观察时间字段。状态/回执变化会使旧pause失效；失败期间换了候选身份则不把旧暂停套到新候选。

开发4/4，增加时钟投影排除后4/4。一次编辑产生的逗号语法错误由node --check即时发现并修正，未进入正式候选。实际socket覆盖admission拒绝、父Agent真实raw通知、重复drive、daemon磁盘发现、fresh Harness/控制桥、有限语义失败后耗尽、候选变化重新对账。用户等待用例验证既有持久投影优先级，不声称重新验证了权限事实生产链。

正式186通过/7既有跳过，无失败/超时/漂移。独立只读审查发现1项P2：candidateRecoveryIdentity未覆盖完整候选，失败与暂停事务之间parent/review/content并发变化可能把旧错误写入新候选。下一轮修复完整候选身份，允许本次操作/session正常推进。

剩余：raw JSONL更新而Workflow回执未变化时的主动观察、无候选初始handoff拒绝、暂停期间新的独立Owner调度。已运行Owner/active task现场未重置，但本轮不证明独立任务的新调度能力。T15仍开发中，不视为整套无人值守完成。

未commit/push/fetch或同步分支；保留原修改。main与缓存tracking一致；Harness缓存落后3364、vendor落后4，Synapse detached，实时远端未查询。见git-evidence.json。
