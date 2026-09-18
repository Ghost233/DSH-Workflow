# Owner Workflow 中文使用说明

Owner Workflow 把主线程中的需求讨论、文档授权、长期 Owner 分工、隔离执行、验证和交付连成一条可恢复的持久流程。用户仍在原来的主线程表达目标和做必须由人决定的选择；Kernel 负责把已经授权的实施工作推进到可验证终态。

## 当前入口

在本项目目录运行（也可从其他工作目录调用同一脚本）：

```sh
./start-owner-workflow.sh
```

这是唯一的日常启动入口，并且不接受参数。源码启动固定以本仓库的父目录作为 Workflow catalog，不随调用者当前目录改变；macOS 启动器使用其已配置的 catalog。项目已有其他 catalog 绑定时，Registry 工具会在审批前报告两个目录，不会改写绑定或清除历史。脚本直接启动项目的 Kernel Web 宿主；公开插件入口和 Dashboard 都已经指向新实现。当前唯一的 preset 目录是 `owner-workflow-plugin/kernel-presets/`。

启动器会：

- 核验项目固定的官方 DSH 构建。
- 读取现有 Web profile 和用户已有 patch。
- 在调用项目的 `.dsh-workflow/` 生成临时组合与日志目录。
- 在一个 Cordis 宿主中加载 Owner surface、Dashboard、SoL 和自研审批适配层。
- 自动启动宿主内 Runner，并在宿主退出时等待其有序停止。
- 发现目标端口已被占用时在准备项目组合之前失败。

启动器不会重置或改写用户 profile、凭据、模型选择、审批策略、沙箱、Git 身份、npm 缓存，也不会自动打开浏览器。它不会启动需要单独管理的后台执行服务。

## 什么时候使用 Workflow

适合 Workflow 的工作具有明确项目根目录、需要修改或交付项目成果，并且能写成 Spec/Ticket 和验证条件。主线程先完成需求澄清；不能从模糊意图直接推导实施授权。

只读分析由主线程按原生能力完成。需要 Owner 执行和验收的项目工作进入 Spec/Ticket、DAG 和 Workflow。

一次明确的非 Owner 任务可以留在原会话处理。主线程使用 `workflow_exec_task` 提交任务、预计步骤和理由，原生卡片由用户手动“允许一次”后，DSH 创建一条专用的一次性 Exec 子会话。Exec 可在同一任务中多次使用读写、命令等获准工具；不能调用 Owner 控制工具、再委派代理或向用户追加授权，且仍受现有 DSH 沙箱约束。执行结束后子会话释放，结果回到主线程；新的任务须重新授权。相同调用恢复时不会自动重跑不明状态的操作。

Web 中这项 Exec 授权会自动打开右侧的“Exec 授权”页，以 Markdown 显示任务、理由、步骤和工具范围，并提供“拒绝”和“允许一次”按钮。底部保留简要提醒与相同操作按钮，也可展开完整内容。关闭右侧栏后仍可从底部重新打开；两处操作的是同一项待审批请求。其他 DSH 审批仍使用原生显示方式。

## 标准流程

### 1. 讨论和写入文档

主线程和用户确定范围、非目标、验收条件与风险，把它们写入项目的 Spec/Ticket。文档写入仍遵守当前会话的文件权限和 Git 边界。

如果项目没有正式 Registry，或长期 Owner 的责任域确实需要变化，使用 `workflow_registry_change`。Registry 变更是一项独立治理操作，必须绑定提案摘要、基线和证据；正在执行且尚未安全停止的工作不会被新责任域绕过。

Registry 审批使用 DSH 原生问题卡，但正文只展示本次受影响 Owner 的字段变化、未变化的 Owner 数量和完整提案校验值；`scope` 与 `exclude` 的 glob 用行内代码显示，避免 Markdown 吞掉 `**`。完整前后快照仍由持久 Action 与摘要绑定，不把整棵 Registry JSON 放进审批卡。

其他自研原生问题卡也按同一方式显示 Markdown：规划审查和公共 Owner 的业务变更展示当前承诺、建议承诺及影响；实施授权展示文件范围和完整 Spec；跨会话取消与恢复授权展示实际作用范围和额度。新问题出现时会打开 DSH 右侧“工作流决定”页，展示同一份 Markdown 和选择按钮；底部原生问题卡仍可作答，补充说明或跳过也在底部完成。关闭右侧后可用会话标题旁的“右侧查看决定”重新打开。右侧与底部共用同一项待回答请求。Markdown 仅用于新问题的展示；机器读取的提案、决策绑定和证据仍保留原值，已持久化的旧问题继续复用原卡片。Exec 使用 DSH 原生 Approval 与右侧专用详情页，不依赖问题卡的 Markdown 渲染。

### 2. 冻结实施授权

用户明确要求实施后，调用 `workflow_planning_finalize`。该步骤冻结：

- 用户授权的来源和范围；
- Spec/Ticket 文档快照；
- 当前代码与 Registry 基线；
- 规划所需的支持材料。

冻结结果是 Planner、Reviewer、Owner 和最终交付共同使用的来源链。修改了实质需求或基线后，应建立新的受审查版本，不能静默复用旧授权。

### 3. 启动和规划

调用 `workflow_start` 创建持久 Workflow。Kernel 让 Planner 从正式 Registry 选择 Owner ID，生成一份任务级 DAG，再由独立 Reviewer 检查：

- 任务依赖是否成环；
- Owner 路由和写入范围是否匹配 Registry；
- 共享资源是否声明；
- 每个叶子是否有独立可验收结果；
- 验证是否绑定到对应 Ticket 和产物；
- 当前计划是否仍绑定冻结的文档、代码和 Registry 摘要。

主线程无需逐项调用计划构造工具，也无需手工启动 Runner。

### 4. 自动执行和交付

宿主内 Runner 读取 Store 中到期的 action，依序执行效果并提交持久回执。独立任务可以在 catalog 与 workflow 容量允许时并行；同一 Owner、相同文件范围或相同主机资源会被锁序列化。

每个 Owner 只接收其任务、依赖输入、责任范围、authority 和固定验证。Owner 提交候选后，Kernel 会确认源码写入关闭、封存候选、运行候选验证、按预期基线集成，再执行最终验证。交付仅在用户工作区分支和预期 HEAD 未变化、工作区没有待覆盖内容时执行 fast-forward。

### 5. 等待结果

主线程通过持久原生通知接收需要用户决定的事项、可恢复故障和最终结果。正常运行中不要轮询；用户主动询问或需要定位中断时使用 `workflow_status`。

终态由 Store 和 Engine 的同一权威 view 推导：

- `completed`：最终验证通过，并且 Workflow 已产生确认的交付结果；已应用的 Registry 变更也使用此状态。
- `failed`：存在已结算失败、耗尽的恢复义务、无法确认的停止或隔离资源。通知包含待处理原因、恢复 issue 和有界结果摘要。
- `cancelled`：取消请求涉及的所有执行都已停止，源码写入已关闭，而且没有 quarantine。Registry 拒绝也以已结算取消结果呈现。

每个非终态到终态的权威边缘只生成一次 canonical 通知。迟到的有效停止回执可能把先前的 `failed` 修正为 `cancelled`；纠正通知会指出被替代的 notice、旧状态和 revision。同一状态的重复回执不再通知。

## 当前工具

| 工具 | 用途 |
|---|---|
| `workflow_exec_task` | 为一次非 Owner 任务请求授权，并交由一次性 Exec 会话完成多个步骤 |
| `workflow_registry_change` | 创建或变更正式 Owner Registry |
| `workflow_planning_finalize` | 冻结文档、基线与实施授权 |
| `workflow_start` | 从冻结 checkpoint 创建持久 Workflow |
| `workflow_status` | 按需读取权威状态，不用于轮询 |
| `workflow_retry_task` | 在原 issue 和恢复预算内重试任务 |
| `workflow_retry_action` | 重试可恢复的基础 action |
| `workflow_replan` | 基于现有来源链和问题证据修订计划 |
| `workflow_public_owner_request` | 请求公开 Owner 评估跨模块合同变化 |
| `workflow_cancel` | 请求停止并等待全部终止证据结算 |

工具返回的是请求受理、持久身份或当前 view。成功调用不等于任务已交付；最终结果以权威终态和持久通知为准。

## Owner、授权与恢复原则

Registry 是长期责任边界的真源，不从单次 Workflow 临时创造 Owner。Owner 的 `scope` 和 `exclude` 限制可写文件；共享端口、设备、数据库或构建缓存通过资源锁保护。

技术故障优先使用 `workflow_retry_task`、`workflow_retry_action` 或 `workflow_replan`，并继承原 issue 的恢复预算和证据义务。工程分歧由相关 Owner 和 Reviewer 处理；凭据、费用、真实设备、不可逆操作、生产发布以及改变用户目标的产品选择必须回到原生主线程。

跨 Owner 的公开合同变化先走 `workflow_public_owner_request`。结论必须和当前计划版本、请求摘要及消费者影响绑定；需要改变业务承诺时由主线程取得用户决定。

停止或超时不会凭进程消失就释放写入权。只有匹配 authority 的执行结算和源码写入关闭证据才能解除锁与隔离。停止失败保持可见，不能通过新 Workflow 绕过。

## Dashboard

同一 Web 宿主提供 `/owner-workflow`。它是只读投影，展示 Workflow、任务、等待事项、恢复问题和结果。

公开 GET API 包括：

- `/owner-workflow/api/health`
- `/owner-workflow/api/waits`
- `/owner-workflow/api/waits/events`
- `/owner-workflow/api/workspaces`
- `/owner-workflow/api/workflows`
- `/owner-workflow/api/operations`
- `/owner-workflow/api/snapshot`
- `/owner-workflow/api/snapshot/events`
- `/owner-workflow/api/operation`

Dashboard 不初始化、修复或推进 Workflow。页面和主线程通知都来自同一 Store/Engine view；页面刷新频率不构成工作流进度证明。

## 数据与配置保护

项目运行数据位于调用项目的 `.dsh-workflow/`，包括控制状态、效果回执、临时组合和日志。长期 Owner 定义、项目文档及需要版本控制的知识位于项目的正式 Git 内容中。

启动和执行遵守以下保护边界：

- 不修改 DSH 或第三方上游源码。
- 不覆盖用户未提交或未跟踪文件。
- 不为制造一致状态执行 reset、rebase、自动 stash 或 clean。
- 不修改用户真实 profile、凭据、模型、审批和沙箱设置。
- 不以测试 fixture、Dashboard 状态或通知文本代替执行回执与 Git 证据。

## 验证

Kernel 的确定性回归入口是：

```sh
node scripts/run-kernel-regression.mjs
```

也可以按变更范围运行 `owner-workflow-plugin/test/` 中的定向 Node 测试。系统沙箱、原生浏览器和真实 Web 宿主依赖当前机器环境。

新版浏览器全流程验收仍在进行中。单元、集成或受控 fixture 通过只证明其覆盖的合同；历史 proof、旧 Spec 和讨论记录继续保留作为审计资料，不是当前操作说明。
