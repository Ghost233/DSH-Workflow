# Owner Workflow

Owner Workflow 是本项目的主线程编排内核。主线程负责和用户澄清目标、维护 Spec/Ticket、取得实施授权并接收结果；Kernel 把已授权工作变成持久化 DAG，由长期 Owner 在隔离工作区执行、验证和交付。

当前公开入口已经统一到新 Kernel：

- `owner-workflow-plugin/index.js` 导出 `src/kernel-entry.mjs`。
- `owner-workflow-plugin/dashboard-host.mjs` 导出 `src/kernel-dashboard-host.mjs`。
- `owner-workflow-plugin/kernel-presets/` 是当前唯一的 Owner preset 目录。
- Runner 在同一 Cordis 宿主内自动运行，不需要单独启动或维护执行进程。

## 启动

在要作为工作目录的项目中只运行：

```sh
./start-owner-workflow.sh
```

脚本不接受参数。它使用现有 DSH Web profile，生成项目内的临时组合并在同一宿主加载 Owner、Dashboard、SoL 和自研审批适配层。启动前检查固定的官方 DSH 构建和端口占用；不会重置用户 profile、改写凭据、模型、审批策略、沙箱或 Git 身份，也不会自动打开浏览器。

临时组合、控制状态和日志位于调用项目的 `.dsh-workflow/`。正式 Owner 定义与长期知识仍由项目内受 Git 管理的 Registry 和 Owner 目录承载。

## 主线程使用流程

1. 在主线程和用户讨论需求，把可执行约束写入 Spec/Ticket。
2. 新项目或责任域确需变化时，通过 `workflow_registry_change` 提交一份受审查的 Registry 变更。
3. 用户明确要求实施后，调用 `workflow_planning_finalize` 冻结文档、代码基线和授权证据。
4. 调用 `workflow_start`。Kernel 的 Planner 和独立 Reviewer 生成并审查当前 Registry 约束下的 DAG。
5. 内置 Runner 自动派发 Owner、收集提交回执、执行候选验证、串行集成、最终验证和 fast-forward 交付。
6. 主线程等待持久通知。只有用户查询状态或需要诊断中断时才调用 `workflow_status`，不要轮询。

技术故障使用 `workflow_retry_task`、`workflow_retry_action` 或 `workflow_replan` 恢复。跨公开 Owner 合同的请求使用 `workflow_public_owner_request`。用户要求停止时使用 `workflow_cancel`。

## 权威边界

- Registry 是长期 Owner 身份、责任范围和排除范围的真源。Planner 只能选择已登记的 Owner ID。
- 计划是一份任务级 DAG；依赖、写入范围、资源锁和验证义务都被固化到当前计划版本。
- Owner 在独立 worktree 和 Owner 分支完成任务提交。验证、集成和最终交付以任务提交 SHA 与 Git 树为依据；每项固定验证在该提交的独立 worktree 运行。
- Git 集成只接受当前 authority 与预期基线；交付只做 fast-forward，不覆盖用户未提交内容。
- 用户审批、真实设备、凭据、费用、发布及其他必须由用户决定的事项仍回到原生主线程。
- Dashboard 和通知读取同一份 Store/Engine 权威状态，不能驱动、修复或伪造进展。

取消只有在全部执行停止回执确认、源码写入已关闭且没有隔离资源后才成为 `cancelled`。停止无法确认时状态保持可见失败和 quarantine；迟到的有效回执若把权威状态修正为 `cancelled`，主线程会收到一次带 `supersedes` 的纠正通知。同一终态的重复回执不会重复通知。

终态通知包含 workflow ID、状态、revision、任务计数、待处理原因、恢复问题和有界的结果摘要，因此 `completed`、`failed`、`cancelled` 都能由主线程解释，而不是只有一个状态标签。

## Dashboard

同一 Web 宿主提供只读页面 `/owner-workflow`。页面展示 Workflow、等待项、任务状态、恢复问题和交付结果；API 只从持久状态投影，不初始化或推进工作流。

## 验证状态

确定性 Kernel、Runner、Dashboard 和通知回归可以通过项目测试运行。新版浏览器全流程验收仍在进行中；历史证明报告和 Spec 讨论记录是审计材料，不应当作为当前启动或操作指南。

更完整的实现边界见：

- [中文使用说明](README.zh.md)
- [技术路线](../docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md)
- [统一 Kernel 迁移说明](../docs/OWNER-WORKFLOW-V2-MIGRATION.md)
