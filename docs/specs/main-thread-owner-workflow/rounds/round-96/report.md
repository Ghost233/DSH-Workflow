# R96 T29统一Owner与资源准入实现报告

## 结论

T29/B03-1开发完成。V2 task现在可以显式声明稳定`resources`身份，Supervisor选择与Runtime实际Owner启动共用相同的容量、Owner、持久reservation和资源排他语义。直接control调用不能越过DAG调度门禁；竞争失败发生在模型调用和Owner运行记录建立之前，任务保持pending。

## 行为

- 计划规范化拒绝重复或不稳定资源身份；资源变化进入PlanRevision语义失效比较。
- 旧计划没有`resources`时不注入默认字段，保留既有plan digest和Supervisor action ID兼容。
- Supervisor在已有running、外部公共判断reservation和同批候选之间核对Owner及资源；恢复状态出现重复资源占用时关闭处理。
- Runtime在Workflow锁内重新读取running及`reserved/launching` outbox，排除本任务自身reservation后再次核对全局槽位、Owner和资源。
- 公共Owner只读判断与同Owner写任务互斥并占用同一全局容量；终态后由T28合同释放。
- 代码路径继续由Registry scope、单Owner lease、task.write和提交关卡约束，不把worktree隔离误当作共享路径可并发依据。

## 固定证据

纯模型与Supervisor定向79/79通过。真实Harness专项4/4通过，覆盖活跃公共判断、同资源直接竞争、`parallel=1`容量和磁盘Supervisor reservation。最终受影响回归串行执行11套，共357项：336通过、21个既有legacy跳过、0失败、0取消，耗时146709.930833ms。

一次错误测试命令未加载项目既定tsx入口，Node在夹具初始化时拒绝vendored TypeScript参数属性；改用R95同一`TSX_TSCONFIG_PATH`和tsx loader后，专项与正式回归通过。该次失败没有进入产品断言，也未通过修改实现规避。

## 保留边界

T29只关闭统一准入。公共决定绑定PlanRevision、仅目标公共Owner实施K2、消费者按正确合同解锁及重启/重复集成幂等由T30承接；CA-01和集中验收未运行。
