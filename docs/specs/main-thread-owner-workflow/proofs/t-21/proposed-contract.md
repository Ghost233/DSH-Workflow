# T-21 → T-22 保守会话对账合同

范围：当前source-plane Harness与真实JSONL后端、独占受控session中的单份恢复prompt。T-21提供接口和边界证据；T-22实现投影、调用接线和持久结算。它不要求底层followup本身具备全历史幂等，也不新增Harness实现前置。T-22只有在本文件对应正式证据与审查成立后才可领取。

## 身份与首次调用

消费T-20同事务保存的Workflow/plan/task/Owner/root/request/attempt及预留sessionId/promptId。每个恢复attempt使用独立session与单一受控prompt，不允许其他入口在该session里steer、inject或追加第二份prompt；消息使用预留id，内容及来源与持久执行包绑定。若观察到不满足此约束的历史，拒绝自动对账，不能用“最后一条assistant”猜结果。

真实入口：`ctx.agents.create({sessionId,agentOptions,setup?})`，已有会话需要`ctx.agents.resume({resumeSessionId,agentOptions,setup?})`，返回owned handle。`agent.followup(message)`返回void，没有持久接纳收据。`await ctx.sessions.flush(agent.session)`返回true且无异常才表明参与的durability listener均完成；失败或没有参与者不记已持久接纳。所有状态转移仍需T-20/Runtime正确的版本与Owner绑定，不在两处重复扣费。

创建/首次提交是T-22自身的受保护状态机操作，外部调用前先持久登记意图；不能凭“没看到文件”把重启后的操作当首次调用。create后仍保留先persistOwnerSession再followup的现有等待与失败清理。进程内受控第一次调用可以提交一次；恢复路径永不因为查询不到消息而盲目重送。

## 对账规则

优先`sessionPersistence.readFrom(sessionId, 0)`读取实际存储的连续有效前缀；它不合成或提交closers。保存原始事件/seq与查询时身份，验证session、prompt内容/来源与当前执行包。未知格式、损坏、torn尾、读取错误或并发变更不能降级为“未执行”。inspect是逻辑视图；load/prepare可能修复cold日志，不得以它们补出的interrupted当旧执行者提交的真实失败。

| 原始证据 | T-22可做的事 |
| --- | --- |
| 仅T-20 reserved、无可确认的session/prompt持久事实 | 不退款、不重建、不重送；技术暂停并保留不确定原因 |
| 有pending inbox记录，尚无该prompt进入执行的事实 | 记录已持久排队；未知跨进程所有权时不恢复/不重送。当前resume不会自动唤醒，pending同ID重送会拒绝；本合同允许技术暂停 |
| 唯一绑定prompt已进入一个唯一turn/step，但原始turn仍未结束 | 记录执行已被接纳但结果未知；不重送。后端合成interrupted只说明需恢复处理，不等于Owner failed |
| 唯一prompt、唯一turn且原始真实turn/end存在，关联assistant/message携带相同turn/step | 可以提取该段客观执行结果作后续结算依据；不得再次followup同ID |
| 已重复promptID、多prompt、额外输入、错身份/版本/Owner、历史不一致或仍有外部写者 | 暂停并报告具体冲突，不选一个结果覆盖其他历史 |

`turn/end.completed`只证明该模型turn结束，不等于业务验收、代码成功或T-13 succeeded。T-22必须结合Runtime实际Owner结果生成失败/成功判定，并保存能回查的原始session、prompt、turn、事件seq等依据。同一事实重放保持同一结算；未知结果不伪造failed。T-20要求的本地`executionRef={id:sessionId,version:promptId}`与反向失败结果reference是适配层关联格式，不是后端直接签发的收据；T-22只有核验真实事实后才能写入该格式及recoveryContinuation。

## 所有权与限制

T-20领取写锁只保护账本事务，不等于session在整个执行期间跨进程独占。T-22必须结合现有Owner执行所有权与版本控制；无法证明本调用拥有当前session时，仅做非变异读取并暂停，不用PID死亡或文件不存在释放/抢占。不会在T-21声称跨进程session lease/fencing已验证；T-16/T-17的取消与释放门禁保持原边界。需要运行中的精确恢复能力时先出证据，不能让重派替代对账。

同ID重送在completed后再次执行，是明确否定证据。它否定“固定ID天然幂等”，但不否定T-22实现上述查询/不重送/未知暂停的保守路径。T-22自身测试必须覆盖这些分支，T-23仍需验证真实领取与session的联合崩溃、重放与状态投影；本报告不解除T-23/T-15/T-19前置。

未证明：多prompt通用归因、任意崩溃点全自动续跑、跨进程session fencing、真实供应商请求幂等、业务语义完成、物理断电。无已证明安全动作时技术暂停是本合同要求，不冒充用户业务决定，也不阻塞无关任务。
