# 规划文档来源链 V1

T25 的前置消费合同，沿用 R4 §5.7、T05 和 T24。来源链验证只确认本次规划文档与真实原生调用、Git 基线相符，不授权提交或创建 DAG。

`validatePlanningSourceChain({root,cwd,manifest,baseline:{branch,head},source:{agentId,sessionId,chains:[{path,callIds}]}})`：

- 读取 T05 实际 Spec/Ticket 文件，不用调用者声明替代内容。每个选中文档恰好一条按执行顺序排列的来源链，不允许重复文档/调用身份、跨文件或跨主会话借用。
- 读取 T24 原始 prepared/terminal，独立检查记录合同、文件键与 callId 摘要、项目/路径、prepared-terminal 同一调用配对、实际 native-observed、完整原始字节证据和版本约束。诊断 reader 返回了 JSON 不等于来源合法。
- 首次 before 与预期 Git HEAD 的原始文件字节一致（缺文件为 null）；逐次 before/after 的原始摘要及原生版本连续；最后 after 与 T05 当前文件摘要一致。未知、不完整、断链和外部修改拒绝，不自动修复来源。
- 当前分支/HEAD 必须仍是输入基线；已有暂存更改拒绝且原样保留。读取 Git 不刷新索引、不创建 commit，不改任何用户文件。完整清单外工作区保护、后续并发重查由实际 checkpoint 事务承担。
- 返回深冻结的真实引用、基线、选择的原始记录；调用方仍需在事务开始及关键写入阶段重检，返回对象不是跨进程锁或提交授权。

生产只读入口 `workflow_planning_prepare` 仅接收 manifest、baseline 和 chains；Runtime 从真实主线程 agent/session 取得身份，不接收调用者自报 source 身份或 approved。拒绝有角色绑定的子代理、Owner 和非根会话。结果 `DSH_PLANNING_CHECKPOINT_PREPARATION_V1` 的 phase 为 source-validated，带 sourceDigest；checkpointCreated 与 executionAuthorized 始终 false。不得拿此结果代替 workflow_preflight 的 baseDigest。

T25 仍需接入独立真实授权、持久 checkpoint/index/snapshot 事务与中断恢复；T27 负责实际版本激活。本合同/定向检查通过均不表示这些行为已经完成。
