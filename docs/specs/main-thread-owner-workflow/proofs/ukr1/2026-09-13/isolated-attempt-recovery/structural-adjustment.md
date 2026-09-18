# 本次失败链的结构调整

> 2026-09-14 后续验收：此前 168 个定向场景已通过；随后修复 PATH 过度失效，最终相关 44 项检查和真实规模 13 项场景通过，跨进程不重复安装。详见 [定向验收](targeted-tests-20260914/README.md) 和 [PATH 修复验收](path-identity-fix-20260914/README.md)。未加载当前实机宿主、未消耗原工作流恢复额度，业务验收仍未完成。


2026-09-14。用户要求先调整结构，暂停新增测试、业务 retry 和 DAG 执行。原 Coinhub 完整验收目标不变；以下是代码调整及之后的验证合同，不是通过报告。

## 保留、合并、删除、修改

| 边界 | 保留 | 删除或合并 | 修改后的责任 |
| --- | --- | --- | --- |
| 任务身份 | Spec/Ticket/checkpoint、完整来源绑定、Owner 写入隔离、独立计划审核、递归依赖失效 | 执行摘要不再包含整份 Ticket 的文档版本和 Owner 无关元数据；不再拿新版摘要与历史 generation 摘要直接比较 | 以两个已审核 DAG 的执行合同判断任务是否变化；实际 task、write、ownerId、片段选择、公共合同版本、验证命令及输入依赖变化才传播 |
| 在途执行 | 原 attempt、authority、候选、原始测试和来源包 | 删除以当前全局 planVersion/来源重解释旧 attempt 的路径 | attempt 的 dispatchContract 冻结 task/owner/verifications/taskPackage/planVersion/directConsumers；等价任务继续原执行包，变化任务按既有停止流程替换 |
| 规划来源 | 原生文档观察链、授权、检查点、短控制锁、现有 commit→detached tree 能力 | 报告验证不再调用 live checkout 的准入检查；只读规划/审核不再占用后继文档写入窗口 | 外部准入检查当前工作区；持久 Action 从其 exact commit 准备固定源码和 Registry；单一不可变 admission receipt 绑定其来源；报告只验证这份绑定及 Action 是否仍有效 |
| 会话结算 | 原生终态、managed command range、写入屏障、正式 stop_execution | 删除成功路径里重复的 live.delete；不再让抛错 execute 留在 live map | live 只表示本机 Promise 正在执行。binding 保留到正式停止/挂起，以拒绝迟到工具；未知执行仍隔离，不能把“模型结束”当作全部命令停止 |
| Registry 恢复 | 具体提案审批、来源链、治理 commit、同一 Workflow 和预算 | 删除 pendingPlanning 备份/清空/拒绝恢复分支；删除“审批后必须再升一版 Spec/Ticket”指示 | 提案期间原规划指针不变；批准后才推进编译来源并清旧失败指针。相同 checkpoint + approved executionBaseline 即可重规划 |
| 依赖准备 | 安装输入身份、完整封存、只读共享 base、私有可写 overlay、命令隔离、安装中断恢复 | 完整封存命中不再依赖 installer 历史；移除跨进程命中的整树重复摘要，合并冷封存遍历；修正漏记的 overlay 摘要成本 | 完整 base 按封存身份复用；未完成安装仍走原恢复路径。分别记录 base/overlay 处理字节、扫描、完整复制与耗时；后续阶段失败仍保留此前累计成本，不复用候选不匹配的验证结果 |

## 执行等价与来源追溯是两个问题

`taskExecutionDigest` 表示“已审定执行合同相同”，不证明任意自然语言片段内容相同。目前 fragment 仅有 id，不能虚构按片段文本的机械等价证据。Planner 和独立 Reviewer 仍必须逐项核对新来源中的需求是否完整进入 task.done、依赖和固定测试。

未受影响的旧成果可以继续满足相同执行合同，但它的原 Ticket 版本、package、candidate 和测试证据保持原值，不能改写成新版验收。最终集成验证仍针对当前完整计划和最终集成代码执行。

多验证任务允许全局定义顺序与 task.verify 顺序不同。执行摘要按 task.verify 解析定义；读取旧执行包时按验证 ID 比较完整定义并拒绝重复或缺失，保留原 action 数组顺序，避免仅重排全局定义就造成失效。单任务消费者上下文也冻结在原 dispatch，避免旧来源包配上新版消费者需求。

旧 generation 的 definitionDigest 也不重写。首次升级比较旧 plan 与新 plan 的相同执行投影；保留时维持原 record/attempt/authority。旧 attempt 只有在其唯一 execute_owner action 与旧 plan 能严格相互证明时才回填 dispatchContract；无法证明则明确报错，不猜测历史。

## 来源与动作的边界

- `workflow.activation.sources` 是当前执行来源；attempt.dispatchContract 是该次派发来源。
- `workflow.planningSources` 保留原持久字段名，含义限制为编译/文档谱系头，可能领先于当前执行版本；不再用于 Owner 执行包选择。
- 尚未接纳的外部请求检查 live HEAD、dirty、Registry、授权和来源链；已经接纳的 Action 不再因后继文档变化而失去冻结输入。
- 规划与审核复用现有不可变 commit source，不增加第二个规划恢复状态机。旧已 dispatch Session 按原 intent 恢复，不替换其 worktree。
- 会修改用户 checkout 的 prepare_workflow、prepare_revision、change_registry、deliver_workflow 仍与原生文档写入互斥；只读 plan、review_plan、verify_workflow 不阻止编写下一版。

## 恢复后需要执行的定向场景

1. 同一 Ticket R8→后继版本，Registry 只增加不属于 Seed.task.write 的 `.npmrc`：Seed 的成功证据、独立失败任务及待执行任务保持；Browser 和真实消费者按变化重验。
2. 保留执行中的 Owner、待封存候选、待审核候选：都能按旧派发来源正常收尾；修改 package、Owner、验证命令或 authority 必须拒绝。
3. 修改 task.write/ownerId/公共合同/验证定义/上游输入：按依赖闭包失效；Owner 排除项与任务写范围相交时规范化直接拒绝。
4. 在规划接纳后、派发前和报告前分别编辑后继文档：角色始终读取冻结源码；报告不受 live HEAD 变化影响。新计划激活仍需正常准入和 Git 冲突检查。
5. Reviewer 自然结束无报告、报告被拒、命令未停止、旧宿主未知四类情况分别结算；只有实际未知执行保留隔离，已知模型结束不能空等 30 分钟。
6. Registry 拒绝时旧来源及规划指针不变；批准后同一 R10 checkpoint 可沿治理 commit 重规划，不制造 R11。
7. 真实规模依赖：新进程第一次命中、多个验证、失败重试、业务代码变化和并行验证均不重复安装/完整复制/全量 base 摘要；安装输入变化失效，私有 overlay 污染和共享 base 写入禁止有明确证据。

依赖命中的信任边界是完整封存、只读共享 base 和命令沙箱限制；热路径不重新扫描整个 base，不能据此声称可检测同一用户或管理员绕过沙箱后修改其深层文件。私有 overlay 内容、根路径类型/别名、只读状态与封存身份仍校验。真实规模证明脚本已增加独立准备实例、安装输入失效、私有 overlay 污染拒绝与回到原候选复用场景；合法冷安装和热复用成本分开汇总。

以上场景已准备或更新，但本轮结构改动后尚未运行。静态语法检查通过；用户暂停前启动的 7 项原生收尾和 93 项规划/Registry 检查已通过，不代表本次所有结构代码通过。

## 业务交付仍待执行

两个失败任务的完整缺口、对应 Owner/交付与固定测试见 [恢复进入条件](recovery-entry-checks.md)。本轮没有让 Owner 开始业务修复，也没有运行 Coinhub typecheck、Web/扩展 build 或完整 Panel 旅程。原工作流保持 1/16 已完成，恢复额度保留 4/12。上游、用户配置、旧隔离证据和已有成果均保留。

## 工作区核对

本地 main 为 `aac638899edb3f4e028d01dfd44e555847aceded`；实际远端 main 与本地 origin/main 均为 `154914064f5ceb2f8eb413865e10a54e8ffbc663`。本地 ahead 1、behind 0；本轮未提交或推送，已有未提交/未跟踪内容保留。DSH 上游受跟踪源码无改动。
