# T25授权接缝：现有事实与初始入口约束

只读代码核对：现有plan批准通过原生问询，approvePlan核验plan/Registry摘要并持久批准会话；audit的立即实施只驱动preflight/start；Intent/request是工具输入，不是提交授权。T24只证明原生修改来源。当前没有可直接消费的独立持久本地checkpoint grant。

来源：index.js confirmPlanApproval（约530行）、confirmAuditImplementation（约457行），runtime.mjs approvePlan（约11065行）、saveState（约1275行）、startWorkflow（约11525行），workflow-conversation.mjs。行号为核对时位置，以函数名为准。

**不能采用的初始化设计**：要求先有已批准的Workflow，再授予规划文档checkpoint。首次规划文档尚未固定时preflight因脏文档拒绝，Workflow还不能创建；此要求会形成bootstrap环。已存在Workflow的批准记录也不能扩大为任意Git提交授权。

后续事务需要在Workflow之前即可核验的主线程来源授权记录，绑定原始决定来源、项目/主会话、原业务范围及本地提交能力。已有匹配授权应直接消费；只有确实缺少权限才展示具体可审阅的决定，不能每阶段重复问询，不能凭工具传approved。该授权记录与T27真实激活范围合同需要保持一致。

R82先接真实来源准备入口 workflow_planning_prepare：从实际调用身份派生source，校验T24/T05/Git并返回可核对结果，不创建Workflow、不提交、不授予权限，也不谎称preflight可启动。完整授权/commit/index/snapshot事务尚待接通，T25保持开发中；不把缺少已实现接口错误报告为当前用户必须决定的阻塞。
