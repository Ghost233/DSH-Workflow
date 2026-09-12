# R78：实际计费仲裁与最新审查来源消费

T15开发中。接通arbitratePendingPlanRevision的恢复正向路径：R77逐Owner会诊→独立revision_review预算/session→冻结义务语义校验→原子预算/候选/收敛结算。最新有效Review来源解析同时支持普通Review与仲裁，后继重建继承对应真实前驱，不覆盖历史。T18激活门禁保留。

worker独占runtime.mjs、candidate-recovery-pause.mjs及必要生产helper；主线程独占新candidate-arbitration-metered.test.mjs、共享fixture抽取、R75/R77测试适配、合同与进度。共享工作区，不做Git写操作。

开发验证：直接与driver成功、fresh零模型重放、耗尽及语义失败逐ordinal、未知创建、前驱/来源变化、真实仲裁后local重建。正式范围：新metered arbitration、candidate-owner-consultation、candidate-arbitration-recovery、candidate-rebuild-recovery、candidate-review-recovery、candidate-recovery-pause、handoff-recovery、recovery-budget、recovery-admission、control；每套180秒串行no-bail，冻结后只读审查。

第一正式候选确认两项必须修复的并发重放P2：applied租约内重查和状态写锁释放ENOENT。341通过/1失败/7跳过及范围外launcher外部漂移全部保留，见review-first.md。R78补验窗口仅修这两项（runtime已有归属）及主线程新增的确定性回归（recovery-admission.test.mjs增加为本轮允许测试文件），保持原十套正式范围，候选2与日志另存，不覆盖第一候选。此后执行整体收敛清单。
