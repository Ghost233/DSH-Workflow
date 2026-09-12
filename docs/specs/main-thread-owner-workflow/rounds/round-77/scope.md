# R77：实际候选仲裁 Owner 会诊生产与采纳

T15开发中。依赖R76会话协议，本轮实现内部consultRecoveryCandidateOwners：认证实际已结算前驱Review与Planner，冻结候选/active A/Owner/来源，逐Owner独立预算与持久操作，原始回执重放、语义验证、原子结算。普通仲裁门禁保留，独立计费仲裁Review与最终消费为后继范围，不宣称端到端完成。

worker独占runtime.mjs与candidate-recovery-pause.mjs及必要新helper；主线程独占新candidate-owner-consultation.test.mjs、合同和轮次/进度。共享工作区保留他人修改，不做Git写操作。

开发先验证真实Planner→Review前驱，再验证正向会诊、重开重放、耗尽、错误Owner/无提交、前驱或候选变化、已创建丢响应。正式范围：新consultation、owner-advice-session、candidate-review-recovery、candidate-arbitration-recovery、candidate-recovery-pause、replan-session、recovery-budget、recovery-admission、control；每套180秒，串行no-bail，固定候选后只读审查。

开发验证补充：多Owner分别计费及部分批次耗尽重放，独立任务并发更新保留，已采纳结果篡改拒绝。前驱夹具已真实运行1/1：只在付费Review之前注入受控的既有有限策略历史；Review接受后不编辑convergence，实际replayOnly认证通过。
