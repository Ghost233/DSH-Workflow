# 第 9 轮：修复 T-04 的 F-10/F-11

本轮结束，待讨论。**T-04 保持开发中**：F-10 提问错配已修；F-11 执行反馈的生产、恢复、提交门禁已接通，但直接 Owner 结算仍有 F-12 路由缺口。正式回归另有两项兼容断言失败。未启动 T-05/T-09、独立 T-04 验收或 CA-01。

## 范围与固定候选

用户“修复”授权沿用第8轮建议。输入为 R4 5.4/5.10、T-04 / AC-14。主线程先写 F-10 Runtime 问题投影，然后将 runtime/index/agent-policy 写入权交给执行反馈代理；主线程独占 control/plugin 测试、进度与 Git。修改五个源/测试文件，未更改规格或扩大业务授权。

冻结时间：2026-09-10T12:42:43.400752+00:00。主仓 main HEAD `154914064f5ceb2f8eb413865e10a54e8ffbc663`；实际未提交候选由文件摘要与本轮起始内容差分识别。完整原始日志、指纹、命令、输入合同指纹见[证据](evidence.md)。所有源码和测试写入在正式测试前停止。

## 已完成行为

- 受管理 Workflow 的问题由冻结的用户义务生成，不再优先采用 Reviewer 自由文本。首次权限/业务/混合决策/混合技术验证与后续重写回归通过。
- 新增实际 Owner-only 工具 owner_execution_feedback。调用方只提供预期、实际、证据描述和技术事实/业务差异/权限缺口；Runtime 绑定 workflow、plan、task、owner、session、attempt 与 Owner 职责，持有真实 lease 才可接纳。
- 每个 Owner 执行尝试有自己的递增 attempt；同一次报告幂等，不能以技术文本覆盖既有用户依据。恢复前重新校验计划、会话、Owner 职责和 attempt；旧反馈不带入新执行尝试。
- Supervisor 失败与 Owner 恢复入口消费结构化依据；真实待决优先于技术 handoff 策略。集成测试观察实际 T2 create 动作与 canonical mainOutbox 投递，证明这些已测路径保留独立工作。
- 接纳反馈后增加提交门禁：Owner 即使提交 completed，也会得到非成功收据，不进入检查、验证、提交或合并。若固定验证曾实际失败，则使用 failed 收据以免陷入原 blocked 技术修复校验。普通无反馈提交路径保持原行为。
- 原生计划/Registry/权限确认保持。反馈是可追溯的 Owner 观察报告，Runtime 核验其出处与版本；不声称独立验证了外部服务权限事实，更不代表权限已经授予。

## 正式回归

十组一次性采集，**286 通过、2 失败、21 跳过**，共309项；零超时、零取消，候选无漂移。control/security/runner 外层180秒，其余60秒，Node v24.12.0，使用 --test-force-exit。未在正式后重跑整组或修补候选。

| 套件 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- |
| convergence | 24 | 0 | 0 |
| model | 51 | 0 | 0 |
| control | 139 | 0 | 7 |
| security | 25 | 0 | 14 |
| plan-revision | 7 | 0 | 0 |
| workflow-state | 11 | 0 | 0 |
| runner | 8 | 0 | 0 |
| plugin | 12 | 1 | 0 |
| agent-policy | 3 | 1 | 0 |
| owner-submission | 6 | 0 | 0 |

21项跳过为原有旧 Owner/逐写入包装/旧次数 Planner 用例（control7、security14），未计入通过。本轮新增17个控制集成用例和1个工具权限用例全部执行通过；正式失败位于既有注册/提示兼容断言。

开发调试日志不累计进正式计数。开发期失败均保留：Owner scope 夹具一度移除了合法 write 范围；guard 正例一度只设置 role 而没有 activeOwner；恢复夹具一度没有释放已结束 Owner 的 lease，以及模拟新 Owner 返回后误入真实 finish；提交夹具一度缺 DSH_OWNER_RESULT_V1 标记。后续仅在开发期纠正装配，保留了安全拒绝与行为断言。

## 只读审查发现

### F-12 / P2：直接 Owner 的 blocked 收据没有按结构化权限分类完成路由

Runtime runExternalOwner 的 catch 先以 report.status===blocked 或 handoff 标记 blocked，随后使用 `!blocked && recoveryStrategy === 'request_user_authority'` 计算 requiresMainDecision。新增提交门禁正常把权限/业务反馈转换为 blocked 收据，因此走到这里时虽然已经分类为 external_authority，却跳过 canonical mainOutbox，并把 Workflow 写成全局 blocked。

固定候选实际入口探针（review-direct-owner.probe.mjs/.log）通过真实 runExternalOwner → createOwnerEntry → runOwnerEntry → persistOwnerSession → feedback → submit → catch；仅用模拟 runChild 代替模型输出，使用临时真实 Git 工作区和 lease。观察到：提交被正确拦为 blocked；T1 stopped/await_user；T2 pending；恢复策略 request_user_authority；但 Workflow blocked、mainOutbox 空。

后续 Supervisor 失败处理可能补齐路由，但直接执行路径不能依赖另一个尚未保证调用的消费者来修正状态。已有新测试分别验证提交门禁和 Supervisor 失败入口，没有覆盖二者通过原 OwnerReportedError 连接的路径，因此未发现这处组合缺口。

下一轮最小修改：直接 catch 也让当前结构化用户依据优先于普通 blocked/handoff 标签，统一生成待决通知和局部状态；保留没有结构化依据的旧 blocked 处理。把本次实际调用链探针转为回归，覆盖普通 blocked 收据与已有固定验证失败产生的 failed 收据，验证通知投递和独立 T2 调度。

### 正式两项失败：注册顺序与拒绝提示兼容断言

1. plugin 注册测试期望 tools[2] 为 owner_memory_note，新增 owner_execution_feedback 插入在它前面；注册存在性后的断言因此未执行完。不能宣称整个注册合同正式通过。
2. agent-policy 测试期望主线程调用 owner_host_exec 的拒绝包含“主会话不能直接调用”，现在新增 activeOwner-only 分支更早返回另一拒绝文案。拒绝仍发生，没有证据说明权限被放开，但既有测试不通过。

建议下一轮保留既有工具相对顺序，并让旧工具沿原拒绝路径、新工具单独增加 activeOwner 限制；这是最小兼容修复。若要改为仅按名称和拒绝语义测试，应明确取消对应顺序/文案约定，不能本轮正式失败后直接放宽断言。

[独立审查](independent-review.md)确认 F-12，认可 F-10 投影和 F-11 绑定/提交门禁的已测行为，并要求先解决两项正式兼容失败。主线程以真实入口探针核实 F-12，没有将测试不通过直接等同于权限失守。

## 范围限制与收尾

PlanRevision 的纯规划失败没有当前 Owner task 来源，仍按技术失败分类；不借用任意 Owner 反馈为整张计划推定用户权限。完整新旧执行版本切换、运行中取消/恢复和总预算继续归 B-01/T-09，未声称交付级验收通过。

主仓与三个关联仓库 HEAD 不变，diff --check 通过，冻结候选零漂移，起始已有路径未丢失。未提交、推送、stash、reset、切换分支或创建替代项目 worktree。main 对本地 origin/main 引用 ahead/behind 0/0；未 fetch，未声称实时远端同步。

按 ghost-matt-implement“本阶段只给结论，不实施修复”，正式后保留 F-12 和两项失败，下一轮候选只修直接结算连接及兼容问题。本轮结束，待讨论。
