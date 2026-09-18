# 新一轮真实验收：跨主线程项目占用

本轮真实验收尚未完成。已修复并在原浏览器标签验证“旧流程阻止新一轮启动，但新主线程查不到阻塞者”的框架缺陷。

## 复现与原因

新会话“Coinhub 完整 Owner 验收工作流”形成并正式提交 R11 Spec/Ticket，获得 checkpoint `planning-finalize-108c1a48c688020cfd21c603`。调用 `workflow_start` 报 `Project already has an active or unresolved workflow`，`workflow_status` 却返回空列表。

状态查询按 `rootSessionId` 过滤，而项目排他按项目根判断。另有两种不同判断：Runtime 启动预检只看是否 terminal，内核还保留失败但可恢复流程的项目占用。故旧失败流程对新线程不可见，但仍会被真正创建事务拦截。该现象与 Key、模型配置及浏览器是否能够加载无关。

## 修复

- 启动预检与状态诊断复用内核原有 `reservesProject` 判定。
- 无 ID 的状态查询增加同项目 `projectBlockers` 摘要，包括确切 workflow ID、原主线程、状态和阻塞原因；不向新线程授予旧流程的执行权限。
- 原有取消工具允许同项目另一主线程通过明确原生问询取消旧流程。其他项目拒绝；拒绝、跳过或非明确同意不改变旧状态。批准证据持久化，正常取消保留历史、计数及未确认占用。
- 原有重试、重新规划、Owner 控制仍要求原主线程；普通修复不能用新建流程绕过预算。

## 证据

`kernel-root-scope.test.mjs` 新增原生多主线程回归，修复前因缺少阻塞列表失败，修复后通过；覆盖同项目发现、跨项目拒绝、取消拒绝不变、批准取消、禁止执行接管与历史保留。

- 定向回归：101/101 通过。
- 完整框架回归：415/415 通过，两个自研插件前端构建检查通过，见 `framework-acceptance.json`、`framework-report.json`、`framework-tests.log`。整体 AC/KAC 仍是 incomplete，不能代替业务端到端验收。
- `cancellation-diagnostic.json` 是旧状态的纯内存取消模拟，确认释放项目占用且保留隔离事实；它不是实际取消凭据。
- `restart.json` 记录正常启动后的健康状态，以及配置、原 DAG、任务、尝试、恢复计数和集成基线均未被重启改变。
- `native-cancellation.json` 记录真实页面确认后的旧流程取消凭据，旧恢复次数仍为 17，隔离尝试仍为 quarantined，项目占用已经解除。
- `new-workflow.json` 记录真实新工作流 `wf-03d397fffe12a1d0e9726a73ccb53ba315e3d7eb`，主线程 `session-b2249c70-f3d5-4432-bd7e-c342bf6d302b`。沿用 R11 checkpoint，源码基线 `799d708fd45b9cfe83744c17a9a5555e38af7e1d`，规划提交 `897642d0ef31570fecbc94417be6e080d5ae29f7`。

新流程已进入 Runner 的 DAG 编译；后续仍需独立审查、Owner 实现、冻结验证、集成和最终业务验收。未删除旧 `.dsh-workflow`、历史、候选或缓存，未修改 DSH 上游和第三方插件，未改变用户凭据、模型、权限或沙箱。

## 首次 DAG 审查与当前阻塞

初次编译成功，产出 18 个任务、16 项验证。独立 Reviewer 返回 needs_revision：AC-07 的持久验收记录缺少具体生产任务和固定验证，详见 first-plan-review.json。主线程接到正式通知后开始补充为 R12，但两次错误传入 implementation_request，在已有授权复用之前被原生来源校验拒绝；随后自行发起了一个确认问题。当前恢复计数仍为 0，尚未激活 DAG 或派发业务 Owner。

下一步应纠正主线程调用：技术修订沿用已有同范围授权，以空参数调用 workflow_planning_finalize，再对当前 workflow 进行有依据的重规划；不得清空状态、重复新建流程或放宽原生授权来源校验。当前原浏览器标签在地图视图出现大量历史节点后控制连接失效，刷新请求待用户处理。未确认地图渲染与连接失效的根因，不将其归咎于 DSH 配置。
