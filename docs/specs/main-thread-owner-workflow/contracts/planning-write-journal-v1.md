# 原生规划文档来源日志 V1

来源：唯一 R4 §5.7/AC26/27/30、R80 技术证据及 T24。日志为后续 T25 提供来源事实，不代替本地提交授权、原需求授权、规划快照或执行版本。

## 入口与身份

仅为 Runtime 已识别的 Owner 模式主线程、既有允许路径的原生 `write`/`edit` 登记。Owner 和有角色绑定的子代理不进入此日志。继续使用 `orchestratorDocumentPath` 与现有工具/文件守卫；不扩展默认目录、治理文件、Shell 或沙箱权限。

每次记录绑定真实工具 registry 提供的 `callId`、`rootCallId`、agent/session 身份、工具名、项目根和解析后的目标路径。callId 的摘要作为不可覆盖记录键。同一会话多次调用必须有不同调用身份；重复身份拒绝，不能覆盖历史或再执行一次写入。

## 持久事实与未知

记录目录：项目 `.dsh-workflow/planning-write-journal/{prepared,terminal}/`。创建路径拒绝链接和非目录；发布使用临时文件、文件同步和独占链接，不覆盖已有记录。此方式提供有限的进程中断保守处理，不声称与 native write 构成原子事务或覆盖任意断电窗口。

- `DSH_PLANNING_WRITE_JOURNAL_PREPARED_V1`：已取得最终原生 CAS 约束，并对其版本做 stat/read/stat 核验后，在 native mutation 前持久化。保存真实修改前摘要/版本、工具身份、目标和最终意图。create 的原内容以 null 表示。写前准备失败阻止本次 native mutation。
- `DSH_PLANNING_WRITE_JOURNAL_TERMINAL_V1`：等待原生工具执行后，存在同次调用、同目标的成功 `fs/observed` 时记录 `native-observed`。再核验 provider 的实际版本和文件内容，与实际工具结果的修改前后值交叉检查；可靠值齐全时 `completeness=complete`，否则 `incomplete` 并带原因。
- 没有同次成功观察时记录 `unknown`。不能从 `isError` 推断文件未修改。工具/监听器异常或记录持久化失败后，已存在的 prepared 仍是不完整事实；不回滚原生文件，不补造成功。

原始内容摘要与展示层换行归一化摘要分别记录，不能互相替代。原生 read-before-write/CAS 仍由原来的 policy/provider 执行，日志额外读取不替调用者生成已观察授权。两次编辑的来源链由实际前后原始摘要关联，不仅凭时间、同一会话或自然语言解释判断。

## 消费边界

所有记录的 `checkpointEligible` 均为 false：日志不授予任何 Git 操作。`readPlanningWriteJournal({root})` 是只读诊断入口，返回 `DSH_PLANNING_WRITE_JOURNAL_V1`，不推进恢复状态。

T25 必须独立核验原授权/显式文件清单、所有记录身份和完整性、首次 before 与预期 Git HEAD、逐次前后摘要链及当前文件字节。未知、不完整、丢失、断裂或与用户修改混合的来源必须拒绝，不自动从当前文件“修复”为完成。即使日志 complete，也不代表代码基线/快照/独立审查已就绪。

临时文件残留、无效记录、未知目录内容或读到不完整状态须明确拒绝或报告未知；不删除用户状态继续。生产激活、公共 Owner 判断、停止、预算继承分别由后续工单承担。本合同的局部验证不能替代 CA01。
