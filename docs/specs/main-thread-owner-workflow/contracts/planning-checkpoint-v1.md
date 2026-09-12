# 规划授权、Git checkpoint 与固定快照 v1

关联 T25、R4 AC-03/27/28 的本项范围；上游为 planning-references-v1、planning-write-journal-v1、planning-source-chain-v1。执行包与版本激活分别由 T26/T27 承担，本合同不改变原 CA01。

## 真实入口与授权

`workflow_planning_checkpoint` 由实际 Owner 模式根主线程调用，参数仅包含事务 `id`、T05 `manifest`、预期 `baseline {branch,head}`、T24 `chains`、`reason`、可选 `parentSnapshotId`。调用者身份来自活跃 AgentRegistry，不能由参数声明 Owner、session 或 approved。已有活跃 Workflow 拒绝进入这个 bootstrap 入口。

缺少授权时使用实际 UserQuestionService，展示原始完整 Spec、本地分支、当前文件和后续规划文档提交范围。明确同意同时形成实施范围与局部文档提交能力；拒绝或自定义回复不创建授权、不提交 Git。grant 在 Git 事务前持久，记录原始问题/回答、真实调用与会话身份、完整 Spec、初始来源与基线、校验值。

`DSH_PLANNING_AUTHORITY_V1` 保存于 `.dsh-workflow/planning-authority/`。同项目/根会话/Spec 身份与路径/分支的匹配授权复用；`docs/specs/<topic>/` 的规划 Markdown 属于明确展示的局部范围，其他允许文档按精确路径授权。复用文档提交能力不会更改原始 implementationScope，未来改变业务承诺须由 T27 核验并取得必要决定。恢复只读取原 grant，丢失或不匹配拒绝，不通过重新询问替换原授权。

当前 bootstrap 要求 `runtimeDirectory=.dsh-workflow`，与 T24 来源目录一致。自定义目录明确拒绝，不静默接受，也不将任意未跟踪目录视为可忽略文件。该限制不改变 legacy 配置能力。

## 固定与恢复

生产 Runtime 的 `planning-checkpoint` Owner lease 同时保护 checkpoint 与旧 Workflow 初始化。每个事务边界复核租约、原授权及相关来源；原生问询使用租约取消信号。内核不产生权限，只消费上述实际回调。

内核边界在等待物理租约检查前后都核验合成取消信号；Runtime 和授权发布也检查取消。取消不撤销已完成的 Git 或已持久的原始同意，但必须阻止后续阶段，留下可辨认的原事务，由同一编号恢复；不能因为取消而删除现场或换新编号绕过 pending。

`DSH_PLANNING_CHECKPOINT_JOURNAL_V1` 保存于 Git 元数据的 `dsh-planning-checkpoints/journals/`，固定完整原始 request、T05/T24 来源、选中文件、原授权、实际 index 哈希、提交输入、commit OID 和阶段。提交仅包含本次显式选中的有来源规划文档。未知来源、断链、非预期分支/HEAD、已有暂存、无关工作区变化及选中文档外部编辑均拒绝，保留原文件/index。

采用 alternate index 构造固定 tree 与 commit，分支通过预期旧 HEAD 的 CAS 推进，然后同步真实 index，最后发布不可变快照。固定提交输入支持同一事务重开；已完成调用返回同一快照，不重复提交。实际 index.lock 必须证明属于本事务，未知锁不删除。Git 与日志写入之间的中断须依据精确提交、来源、实际 index 和自有锁证据对账，不能仅凭相同事务名猜测成功。

父快照在新事务建立前须有匹配的完整已完成 journal/snapshot，发布子快照前再次核验。Git tree 的每个选中文档必须为常规 blob，原始字节哈希与固定来源一致；Git clean filter 改写内容也拒绝。任何其他 pending 事务阻止新编号，恢复必须使用原编号。进程 SIGKILL 证据覆盖 ref 更新、真实 index rename、snapshot 发布各自与后续 journal 更新之间的窗口；不宣称任意指令或断电恢复。

`DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1` 内容包括完整 Spec/Ticket/AC、全部所选原始写入记录、来源摘要、原代码 HEAD、checkpoint commit/tree、原授权、原因与父快照引用。快照发布后不可覆盖；重复读取核验固定内容。`DSH_PLANNING_CHECKPOINT_RESULT_V1` 返回该固定快照及 checkpoint 身份。

来源摘要统一使用递归排序对象键、保留数组顺序的 canonical JSON 的 UTF-8 SHA-256；prepare、初次 grant.initialSourceDigest、checkpoint/snapshot.sourceDigest 对同一来源必须一致。后续复用 grant 仍保留其初始摘要，不用新来源覆盖原实施授权。

preflight 读取持久 pending 事务并纳入 baseDigest。即使 Git/index 已干净，只要快照事务未完成，canStart 仍为 false；旧 start 使用同一 lease 并复核预检。未知或损坏状态拒绝派发。仅 checkpoint 完成不会创建 DAG、调用模型、启动 Owner 或执行远程推送。

## 证据分层

R83 主线程测试使用真实 Harness AgentRegistry、UserQuestionService、原生 read/edit 来源、生产 Runtime lease 及临时 Git 仓库；UI provider 只模拟人的选项回复。内核故障测试使用明确标注的授权/lease 回调夹具，证明 Git/index/快照恢复，不单独证明生产权限。两层结果分别保留，所有 Git 写入限于拥有的临时测试项目。
