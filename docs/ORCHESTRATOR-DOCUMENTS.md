# 主线程 Matt 文档权限

2026-09-10，R3 收窄默认路径。适用：启用 Owner 模式的主编排会话。

主线程使用 Harness 原生 `write` / `edit` 整理讨论、术语、ADR、Spec、Ticket 和进度。保存这些文档不需要先创建 Workflow、分配 Owner 或创建 Operation，也不额外询问是否实施。编辑现有文件前仍须读取；原生观察策略负责避免盲写和过期版本覆盖。

## 路径范围

路径相对于绑定项目根目录；非 Git 项目使用会话工作目录。目录模式包括直属文件和下级目录中的 Markdown 文件。

| 路径 | 用途 |
| --- | --- |
| `CONTEXT.md`、`CONTEXT-MAP.md` | 领域术语与上下文索引 |
| `docs/adr/**/*.md` | 设计决定 |
| `docs/specs/**/*.md` | Ghost Matt 默认 Spec、Ticket、进度及相关记录 |

按当前使用的技能链核对：

| 阶段 | 技能明确使用的文件 |
| --- | --- |
| Matt `grilling` | 没有固定文件或目录；设计树在讨论中推进 |
| Matt `grill-with-docs` | 组合 grilling 与 domain-modeling，不另设目录 |
| Matt `domain-modeling` | 根 `CONTEXT.md`；`docs/adr/<编号>-<主题>.md`；多上下文时另有根 `CONTEXT-MAP.md` |
| `ghost-matt-spec` | 默认 `docs/specs/<主题>/spec.md` |
| `ghost-matt-ticket` | 同主题的 `tickets/<编号>-<标题>.md` 与 `progress.md` |

domain-modeling 还支持由 `CONTEXT-MAP.md` 指向各模块中的 `CONTEXT.md` 和 `docs/adr/`；这属于项目特定的多上下文布局，不默认放开任意源码子目录。

根据用户后续要求，默认权限已移除 Superpowers 两个目录、`docs/analysis/` 和原版 to-tickets 的 `.scratch/` 路径。当前 Spec/Ticket 使用 Ghost Matt 约定。既有文件保留可读；技能“沿用项目约定”不会自动扩大权限，也不会删除或迁移旧文档。

不开放整个 `docs/` 或任意 Markdown。上述目录中的 `AGENTS.md`、`CLAUDE.md`、`SKILL.md` 和隐藏治理目录也不在范围内。图像、脚本、JSON、业务代码、Owner Registry 和 `.dsh-workflow/` 状态不属于这项权限。原生 `write` 会创建目标文档所需的父目录，无需额外 Shell 权限；没有增加通用删除或重命名能力。

## 实现与边界

- [路径策略与共享提示](../owner-workflow-plugin/src/orchestrator-documents.mjs)作为代码中的唯一范围定义，工具守卫先检查调用参数，原生文件事件再核对实际目标及其与请求的一致性。
- 目标必须落在绑定项目内，拒绝 `..` 遍历、符号链接、硬链接及非普通文件。项目根目录自身的合法路径别名可以使用。
- 只放行原生 `write` / `edit`；Shell、补丁工具、其他写入工具和沙箱升级参数沿用限制。底层 Harness 沙箱继续生效。
- Planner、Reviewer、Operator 等子代理不获得这项例外；Owner 沿用自己的隔离工作区与提交检查。
- 允许的文件事件继续调用原生观察策略，不用插件的允许决定替代版本检查。

这次只实现主线程的文档落盘权限。完整 Spec → Ticket → DAG 自动编排仍以[目标规格](superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)为后续设计依据。文档的 Git 固定、引用版本激活、运行中修订与 Owner 工作区的同步尚未随本次改动实现；保存文档产生普通未提交修改，现有 Workflow 启动/合并检查继续生效。文档进度不直接修改 Runner 状态。

项目插件源码已更新；正在运行的 Harness 需要重新加载插件后才会使用新守卫。未替用户重启进程或提交/推送 Git。

R4 规格补查时发现一个组合缺陷：Git 预检把绑定 root 规范为真实路径，而会话继续使用同项目的原路径别名时，允许文档的别名绝对路径会被拒绝；真实绝对路径/相对路径在夹具中可用。原有测试未覆盖预检后的这条链，根别名支持不能视为全场景完成。该观察保留在 R4 作为历史反例。后续 T-01 第 1 轮已修复当前插件源码：核验根别名与真实 root 的身份后，保留内部路径片段继续检查，三种路径写法均通过真实 Git 预检＋Harness 回归。见[实施报告](specs/main-thread-owner-workflow/rounds/round-01/report.md)。文档落盘后的脏工作区检查仍生效，规划版本事务仍待 T-07。

## 验证

T-01 第 1 轮固定候选的四组定向测试为 25 通过、0 失败、0 跳过；完整源码摘要与原始日志见[轮次证据](specs/main-thread-owner-workflow/rounds/round-01/evidence.md)。只读审查另记录一个非阻塞的测试初始化清理问题 F-01/P3；后续[第 2 轮](specs/main-thread-owner-workflow/rounds/round-02/report.md)已修复并通过故障注入与原生文档回归。第 2 轮其他 T-02 改动尚未通过验收，不能把清理修复当作整份候选通过。以下为此前 R3 的历史测试结果，未在本轮重复运行。

R3 收窄路径后，权限、真实 Harness 工具集成、角色策略和插件注册四组定向测试共 21 项通过、0 失败、0 跳过。已验证被移除的四类路径在工具参数与文件目标两层均被拒绝。

定向回归：`orchestrator-documents`、`agent-policy`、`plugin`、`control`、`operation-runtime`，147 通过、0 失败、7 个原有遗留用例跳过。另一个真实 Harness 集成用例通过原生工具链验证新建目录/文档、读取后编辑、拒绝未读覆盖、拒绝过期编辑、拒绝写入代码；没有调用模型。

测试文件：[权限与角色边界](../owner-workflow-plugin/test/orchestrator-documents.test.mjs)、[真实 Harness 工具集成](../owner-workflow-plugin/test/orchestrator-documents-native.test.mjs)。后者需要已构建的 Harness 子模块，缺少构建产物时明确跳过。
