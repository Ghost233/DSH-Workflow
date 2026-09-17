# Owner Workflow 统一 Kernel 迁移说明

本文用于把当前项目的使用方式收敛到统一 Kernel。历史 Spec、讨论记录和 proof 保留原文作为审计证据；其中出现的旧入口、旧工具顺序或旧进程模型不再用于当前运行。

## 已生效的终态

- 日常启动只有无参数 `./start-owner-workflow.sh`。
- 公开 package root 和项目 `index.js` 都导出 `src/kernel-entry.mjs`。
- 公开 Dashboard host 导出 `src/kernel-dashboard-host.mjs`。
- `owner-workflow-plugin/kernel-presets/` 是唯一当前 preset 目录。
- Owner 工具、Dashboard、Store、Engine、effects 和 Runner 在同一 Cordis 宿主组合中工作。
- Runner 随宿主自动启动和关闭，不需要调用者维护另一个进程。
- 项目启动组合自动加载 Owner、SoL 和自研审批适配层。
- 用户 profile、凭据、模型、审批、沙箱、Git 身份和缓存保持原样。

## 操作者迁移

### 启动

从要作为 catalog root 的项目目录运行：

```sh
./start-owner-workflow.sh
```

不要附加版本、profile、插件或 Runner 参数。启动器使用现有 Web profile 生成项目内临时 patch，核验固定 DSH 构建和端口，然后启动同一 Web host。它不会自动打开浏览器。

### Preset

部署或检查 preset 时只看：

```text
owner-workflow-plugin/kernel-presets/owner-workflow/
```

该 preset 的 plugin 和 agent 配置都绑定当前 Kernel entry。不要从历史资料恢复第二套 preset root，也不要让 profile 同时加载多个 Owner host。

### 项目数据

运行态数据位于当前 catalog 的 `.dsh-workflow/`。迁移不通过清空该目录来制造“干净状态”，也不修改用户工作区内容。

历史控制记录若需要读取，由专门的兼容导入和恢复守卫处理。无法证明执行已经停止、源码写入已经关闭或 Git 身份仍匹配的记录必须保持阻塞；不能直接创建新 Workflow 绕过它。

## 主线程调用迁移

当前实施流程是：

1. 在主线程讨论需求并维护 Spec/Ticket。
2. 责任域需要建立或变更时调用 `workflow_registry_change`。
3. 用户明确授权实施后调用 `workflow_planning_finalize`，冻结文档、代码、Registry 和授权来源。
4. 调用 `workflow_start` 创建持久 Workflow。
5. 等待宿主内 Planner、Reviewer、Runner 和 Owner Team 自动推进。
6. 用户查询或中断诊断时调用 `workflow_status`。
7. 技术恢复按场景调用 `workflow_retry_task`、`workflow_retry_action` 或 `workflow_replan`。
8. 跨模块公开合同请求调用 `workflow_public_owner_request`。
9. 用户决定放弃时调用 `workflow_cancel`，等待全部停止证据结算。

不再由主线程逐步构造计划、手工驱动每个任务或启动独立 Runner。工具调用成功只表示请求已持久受理；完成、失败或取消以 Store/Engine 的终态 view 和原生持久通知为准。

## 计划与授权迁移

旧计划不能只因为 JSON 结构可解析就进入执行。当前计划必须绑定：

- `workflow_planning_finalize` 生成的 checkpoint；
- 当前文档 snapshot digest；
- 当前代码和 Git baseline；
- 当前 Registry digest；
- 用户实施授权；
- 独立 Reviewer 的 plan digest 与 evidence reference。

Planner 的 `owners` 只包含 Registry 中的 Owner ID。完整 scope、exclude、长期指令和固定验证由 Kernel 从正式 Registry 注入。Registry 变化后，受影响执行必须先停止并关闭源码写入，再在新摘要上重新规划。

## 执行与恢复迁移

每个任务 action 都绑定持久 ID、input digest、authority 和资源锁。候选提交之后还必须经过源码关闭确认、候选封存、候选验证、集成、最终验证和 checkout 交付。

取消和超时采用先停止、后结算的语义：

- 发出取消请求时状态可以是 `stopping`。
- 所有相关 action/attempt 取得真实停止回执且没有 quarantine 后才是 `cancelled`。
- 停止失败或超时保持 `failed` 和隔离，不伪报普通执行错误。
- 迟到的有效停止回执可产生一次带 supersedes 的 `cancelled` 纠正通知。
- 同一终态的重复回执不产生重复通知。

技术恢复继承原 issue、证据义务和预算。失败的 Workflow 继续保留项目 reservation；恢复或完整取消之前不能另起一个同项目 Workflow 绕过现场。

## 通知和 Dashboard 迁移

主线程只认绑定 root session 且已经持久化的原生通知。canonical 终态通知提供 workflow ID、status、revision、任务计数、attention、recovery issues、主要 failure，以及 Registry、交付或取消 outcome。

Dashboard 位于 `/owner-workflow`，并与主线程通知读取相同的 Store/Engine view。它是只读观测面，不创建、修复或推进 Workflow。浏览器页面状态不能替代 action receipt、Git 证据或主线程持久通知。

## 配置保护

迁移和日常启动必须保持：

- 用户真实 profile 与 patch；
- credentials、provider/model 与 reasoning 配置；
- approval policy 与 sandbox；
- Git user、当前分支、未提交和未跟踪文件；
- npm 缓存和已经存在的用户数据。

不得为迁移自动 stash、reset、rebase、clean、覆盖或重写提交。项目自研适配只修改自研插件和集成层；DSH 与第三方上游源码保持原样。

## 核对清单

- [ ] 使用无参数 `./start-owner-workflow.sh`。
- [ ] 公开 root 与 Dashboard export 都指向 Kernel 实现。
- [ ] 当前组合只使用 `kernel-presets/`。
- [ ] 同一宿主内只有一份 Owner Kernel、Store 和 Runner。
- [ ] Planner 来源链包含授权、文档、代码和 Registry 摘要。
- [ ] Owner 写入范围、依赖、资源和验证都来自受审查计划。
- [ ] 停止证据不完整时仍保留锁、容量和 quarantine。
- [ ] terminal notice 包含可解释原因或具体 outcome，并按状态边缘去重。
- [ ] Dashboard 只读，不能代替控制面。
- [ ] 用户配置、Git 状态和第三方源码未被迁移改写。

## 验收边界

确定性回归可运行：

```sh
node scripts/run-kernel-regression.mjs
```

真实 Web host、系统沙箱和浏览器链路仍需在对应环境完成验收。新版浏览器全流程验收目前仍在进行中，不能把定向测试或历史 proof 描述成已经完成的全程验收。
