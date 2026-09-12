# 第17轮：F-16修复

基线承接第16轮1617指纹，四仓HEAD及已有修改见baseline.json。主线程独占runtime、合同说明与进度/Git；session_proof_t21独占recovery-session测试及同名前缀fixtures。只修复确定Owner lease占用的错误分类，不启用首次启动/resume/T13结算。

完成条件：同进程、独立Runtime磁盘占用与初始化中lease返回结构化技术暂停；不释放其他调用持有的lease，不改变Workflow/额度，不创建或重送会话。取消和非冲突IO错误继续传递。开发后冻结，正式沿用9组回归，各组无失败短路。

开发定向：recovery-session 8/8通过，日志保留development/。新3个测试组覆盖同进程不同task、同stage owned:false、独立Runtime实例共享真实磁盘lease、仅lease目录初始化、实际普通文件路径IO失败及预取消信号。独立Runtime竞争发生于同一OS进程，未声称真实跨进程复验。无预算、lease或持久后端stub。正式冻结前生产与测试均停写。

## 正式测试及有限补验

| 套件 | 通过 | 失败 | 跳过 | 超时 |
| --- | ---: | ---: | ---: | ---: |
| recovery-session | 8 | 0 | 0 | 0 |
| recovery-admission | 43 | 0 | 0 | 0 |
| recovery-budget | 32 | 0 | 0 | 0 |
| convergence | 24 | 0 | 0 | 0 |
| model | 51 | 0 | 0 | 0 |
| plan-revision | 7 | 0 | 0 | 0 |
| workflow-state | 11 | 0 | 0 | 0 |
| control | 未完成汇总 | 未完成汇总 | 未完成汇总 | 1 |
| security | 25 | 0 | 14 | 0 |

control在180秒上限被终止，原始日志明确记录130个通过及7个跳过，未输出最终汇总，未见断言失败。与上轮相同的137条输出按顺序完全匹配；剩余29个未报告用例使用精确test-name-pattern在同候选下补验，29/29通过，仍受180秒上限。没有重复运行已通过用例或提高预算。原始超时不被覆盖。

合并去重观察：360通过、0断言失败、21既有跳过，保留1次control套件超时。control全部用例分别有结果，但不宣称单次完整control通过或0超时。首跑日志、test-results.json、control-supplement.json、选择器与补验日志均保留。

匹配的130个通过用例相对上轮耗时中位比3.44，其他Git集成套件也变慢；这仅是时序观察，未做基线性能对照，不认定为环境原因或排除回归。无新增性能门槛。

固定1617项候选，首跑及补验无漂移。测试过程中未改生产、断言或合同。此次补验用于完成超时后未报告用例的覆盖，不计新开发轮次。

Git状态见git-final.json：四仓HEAD未变，无提交/推送/fetch。主仓main对本地origin/main为0/0；deepseek-harness master原有behind1430、vendor main原有behind4，dsh-synapse detached，未更改依赖版本或强行同步。既有工作区修改完整保留。
