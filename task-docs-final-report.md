# 文档同步最终报告

## 已完成

- 更新 `owner-workflow-plugin/README.md`：补充 V2、Registry 审批、任务 DAG、固定 SHA 合入、Supervisor、只读 Dashboard、取消保留现场和子模块零修改边界。
- 重写 `owner-workflow-plugin/README.zh.md`：同步安装、标准流程、V2 计划形态、Registry、固定分支/worktree、必需验证、Supervisor、Dashboard、取消和恢复说明。
- 新建 `docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md`：记录运行时边界、持久化、Registry 审批、V2 DAG、固定现场、验证、Supervisor、恢复、Dashboard 和最终集成路线。
- 新建 `docs/OWNER-WORKFLOW-V2-MIGRATION.md`：规定旧计划只读导出、重新建立 Registry 和 V2 DAG 的迁移步骤，并把历史阶段合并与 Registry 直写说法替换为 V2 规则。

## 事实同步

文档已统一为：纯 `DSH_PLAN_V2`、无 Quick；旧 V1 仅查询导出；Registry 变化必须审批；任务 DAG 必须绑定验证；Owner 固定 branch/worktree；任务 finish 固定 SHA 后合入 workflow；Supervisor 只处理 `create`、`wait`、`notify`、`inspect`、`stop`；runner 不解释计划；Dashboard `127.0.0.1:57357` 只读；cancel 保留现场；全中文且不修改 `deepseek-harness/`。

## 检查

文档写完后仅运行了 `rg` 检查旧 V1、stage、merge-stage 和 owner 直写名称。命中内容全部位于“只读/禁止执行”约束或迁移对照表中，没有作为可执行流程保留。

按本次要求未运行测试、构建或其他额外验证命令。
