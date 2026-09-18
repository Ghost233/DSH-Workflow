# R7 失联验证的有界恢复

完整 Coinhub 验收仍未完成。本记录补充依赖复用证明之后的恢复问题；不会把旧未知命令描述为停止或通过。

## 原因与决定

R7 的 Owner 已提交并关闭源码写入，候选已经密封。旧宿主在第二次依赖安装期间退出，命令 `cmd-95e578cb65c810d7e7ef86c10c8ecb08982bc827` 缺失受管进程范围终止凭据。原实现把未知安装目录与整个 Owner/项目占用合并，既不能结算旧命令，也不能在独立目录恢复。

独立 sol/high 分析后选择在**同一 Workflow、Ticket 和 DAG** 中恢复，不另建 Workflow。主线程调用 `workflow_retire_isolated_attempt`，Runtime 只读核验持久 Owner/Reviewer 停止凭据、候选内容、全部未知命令绑定与原生沙箱可写根，持有原动作 OS 锁和命令 admission 锁后提交一个引擎事件。模型不能提供证明、路径或替换控制状态。

只释放旧 attempt 的 `project:*` 锁。保留旧失败状态、quarantine、命令意图、候选、历史、issue、预算和一个执行槽位；host/global 锁不释放。之后普通 `workflow_retry_task` 继续负责新 generation/authority、候选恢复和预算扣减。`parallel=1` 或剩余槽位耗尽时仍不能推进。

旧非 stop 动作在 dueActions、action.claim 及取得 action OS lock 后的 adapter 入口三处被禁止重入，避免 observe 再次准备或清理目录。仅精确绑定原 attempt/authority/stop action 的迟到真实停止凭据可以结算旧执行；不能改变新 attempt。

## 文件与依赖隔离

旧命令原生 workspace-write 的可写范围为私有安装目录及平台临时目录；它与项目源码、Git common dir、候选和控制文件分离。共享临时目录、网络及进程副作用仍为未知，不声称整个系统静止。证明只接受根 package 的 npm ci 安装；嵌套 workspace 安装及其他命令保守拒绝。

新命令 dispatch 和依赖准备都检查保留目录。相同 canonical dependency key 若有已退役安装目录，则选择 `key/generations/<退休命令集合摘要>`，保留输入身份，隔离物理存储。多个任务共享同一代，只冷安装一次；再次出现未知安装则换下一代。历史退休标记在真实迟到停止后仍参与 generation 选择，避免悄悄回到遗留 staging；指标显式记录 cacheGeneration。暂不跨代复用旧 base。

客户端将终态失败和隔离旧执行放入遗留事项，保留原始结果，不再计为主动等待。

## 证据与限制

- 修改范围仅自研插件与项目验收脚本。未修改 DSH/第三方源码、用户配置、凭据或权限。
- 真实 R7 只读证明已确认唯一未知安装命令、原 Owner 与 Reviewer 的已结算原生记录及未变化候选。
- 状态/路径/原生回归与最终浏览器恢复结果另记本目录 status.json；未取得完整业务验收证据前不得声明目标完成。

## 22:47 首次浏览器恢复被安全拒绝

正式工具首次执行返回 `Isolation proof is incomplete or stale`。已发布的 proof 完整，现场未追加退休 marker，也未重派 Owner。独立分析确认：原 stateBinding 把 observation lease/token/count/nextWakeAt 一并作为隔离事实，而 Runner 在取 action OS lock 前先提交 observation claim；因此持有动作锁仍可能遇到这些调度字段变化。

修复为专门的安全摘要，保留原 task/attempt、候选、Owner 写闭合、action identity/input/status/stopRequested/quarantine/execution/evidence/result/termination，排除观察租约与唤醒时钟。没有改变锁序或清除 lease。确定性回归在 proof 后注入 observation claim/续期仍可提交；修改候选、输入、任务定义、写闭合或真实停止状态则拒绝且不改变控制状态。过期证明使用独立 `ISOLATION_PROOF_STALE` 诊断，旧 proof 保留作审计。

最终冻结源码 `a57d65459c784a80d3983da7156655a0af602267389cd3188294a9b040c12a50`：Kernel 378/378、默认全量 583/583。语义摘要采用完整 action 仅减 observation、observationCount、nextWakeAt；独立增量复核通过。原浏览器恢复尚待验证。

## 23:04 第二次浏览器恢复遇到旧动作锁竞争

加载 a57d6545 后，正式工具返回 `Control lock acquisition timed out`，未生成新 proof/退休 marker/新 attempt。现场进程持有旧 verify action lock。独立 sol/high 分析确认：stopRequested 的原验证动作仍进入 due/observe，Pipeline 在无 receipt 时重入完整验证和依赖准备；其业务结果本来已经被 engine 禁止发布，却持续占用锁。

修复落在统一调度边界：已停止的非 stop action 不再 due、claim 或进入 adapter，也不贡献 Runner / view 的唤醒时间；原 stop_execution 独占实际结算。retirement 只锁非 stop 动作，保留全局 command admission；stop 自身可以继续收敛，真实结算若并发改变隔离事实，原 safety binding 和 quarantine 校验会拒绝旧 proof。无需延长超时或反复重试。

三条确定性失败用例复现了重入、锁内竞态及过期唤醒，修复后通过；真实 OS 锁测试确认持有 stop 自身锁允许退休、持有 verify 锁仍拒绝。合并针对性测试93/93通过。新的完整冻结回归和原浏览器结果待记录。

## 23:18 原浏览器恢复成功

最终源码 ebfa2eefa3cf39d6d1a9b5cb45ff27b3577d5ce9eb16e28496af578c4605c05c：Kernel383/383；本轮默认全量588/588，随后最后任务卡片wake投影调整通过72项定向与完整Kernel复验。正式 retirement 与 task retry 均成功，同一R7恢复running，recoveryUsed=2，旧执行仍隔离。第67个Owner（build-tooling）已在原标签逐项核对：不修改恢复候选，命令契约成功、未知suite实际exit=1、原生进程范围已结算，owner_submit accepted。Runner独立验证尚未完成；完整12节点业务验收仍未完成。

## 23:45 — 业务推进与自动返修

Foundation 经独立 Reviewer 发现脱敏与嵌套冻结缺陷后，由主线程自动返修，复审通过并集成至 `52706c79adcb52ff0ee7be8a45269610a4377e7e`。当前真实进度为 2/12 集成。API 与 Worker 并行且修改文件不重叠；两者 Runtime typecheck 均通过，但独立 Reviewer 拒绝了行为缺口，主线程自动创建同任务返修。观察到 Worker 尝试修改其范围外的 `wrangler.local.jsonc` 被 Owner guard 拒绝，正在独立核对跨节点责任是否错配。未改动插件源码、未重复全量回归、未重启运行宿主。

### 责任错配诊断

独立全局分析确认：API 与 Worker 节点只写实现目录，固定验证为 typecheck；`prove_network_worker_contracts` 已承担 `tests/**` 场景证明。Reviewer 看不到后继责任，而上游 done 又含有 prove 场景的措辞，造成测试义务前移。真实代码缺陷仍须修复，不能直接放行。已通过原浏览器主线程说明：范围内修复继续；若仅因后继证据不足再次被拒，使用同 R7、保留任务 ID 的正规 replan 澄清责任，不重复 retry，不扩权限，不降低最终验收要求。Worker 使用 `owner_execution_feedback` 上报越界；主线程错误的公共 Owner 请求被身份校验拒绝，未扩权。
