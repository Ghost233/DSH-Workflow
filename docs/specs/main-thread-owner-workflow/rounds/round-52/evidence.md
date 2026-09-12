# R52 技术依赖暂停与主控制

T15：保护协议下无可执行任务且有技术stopped来源时，Supervisor停止并持久技术报告，不走decision_required。独立ready仍优先；主投影对未改变的技术暂停等待，对待投递报告允许Runner交付；计划/来源变化失效。真实用户待决仍优先，legacy原调度保持。主线程独占runtime/supervisor/workflow-state/external-runner及runtime恢复测试，T16只proof。正式覆盖runtime/admission/session/supervisor/workflow-state/control/runner。
