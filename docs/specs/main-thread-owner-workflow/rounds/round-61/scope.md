# R61 pending直接handoff的completed提交门禁

关闭R60 P2。主线程独占runtime/owner-submission及对应测试/合同。completed在inspect/固定验证/commit之前用实际Owner lease+workflow短锁核验当前source，并拒绝该task/Owner尚未消费的直接请求；来源失配同样不静默完成。提交执行中或已接纳结果后不再接受新的request_handoff，封闭并发反向窗口。拒绝不写active.submission，允许同一真实child改报blocked/failed并按既有预算路径推进。实际Harness测试覆盖错误completed先拒绝→blocked→Planner，既有完成/权限/转交回归；单套180秒上限，冻结后只读审查。随后继续Review计费，不把本切片视为T15完成。

正式套件固定为direct-handoff-recovery、owner-submission、handoff-recovery、runtime-recovery-budget、control；开发最终14/14，正式开始前停止源码写入。
