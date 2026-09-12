# 第22轮：T-22真实重启的安全暂停与失败回执重放

用户“继续”授权下一最小故障序列。遵循T21→T22既有合同：无法证明旧session所有权时允许技术暂停，禁止凭PID死亡或未看到日志重派。两场景：真实Owner prompt已提交并持久确认但Runtime未结算时SIGKILL；真实failed结算回执已持久时SIGKILL。分别在独立新进程构造新Runtime/真实JSONL上下文对账，证明不重发/不重新执行、不改变预算/身份，以及已结算失败只读重放。

测试不得stub预算/backend/lease/提交事实；可在真实persist提交完成之后阻塞作为确定性kill检查点。保留原state及reserved session原始字节作为前后对照，实际kill/退出码、child/replay PID、model请求与持久绑定记录为证据。不以同进程restartHarness或构造状态代替真实进程死亡，不据本轮宣称自动resume、成功重启、任意崩溃点或T23联合验收完成。

success_tests_r20独占新recovery-session-restart.test.mjs、fixtures/recovery-session-restart-child.mjs及现有recovery-session-fixture.mjs的必要重开helper；主线程独占本轮文档/采集/Git。无生产源码/合同改动计划。正式范围新跨进程场景及完整旧11项recovery-session回归，固定候选后不改代码/断言/合同，进程有界、独立组继续、只读审查后停止。无提交推送授权。

## 开发与冻结前审阅

首次2/2真实跨进程定向通过。主线程冻结前要求：child收到IPC后仍保留生存超时，IPC/断言失败也必须kill+await自己的child；postkill基线在新Context初始化前由父进程直接读取物理state/JSONL。首次补强因已完成会话不在live ctx.sessions导致path缺失而失败，改为真实readRaw.meta→persistence.locate(meta)查持久路径后2/2通过，失败/成功开发记录归档development/。未为日志重复执行已通过命令。

检查点只证明真实状态已经持久，kill前仍可追加；不要求checkpoint字节等于postkill。父进程确认SIGKILL exit后读取postkill，重开前/后均须等于postkill字节。新parent初始化发生在API计数之前，但其初始化前后亦有物理字节对照；透明create/resume/followup计数与模型请求分别断言零。正式开始前测试者停写。

## 正式结果及主线程原始证据核验

| 组 | 通过 | 失败 | 跳过 | 超时 |
| --- | ---: | ---: | ---: | ---: |
| recovery-session-restart | 2 | 0 | 0 | 0 |
| recovery-session | 11 | 0 | 0 | 0 |

正式13/13通过，无补验或重跑，1619候选无漂移。主线程另直接读取restart-artifacts核对SIGKILL exit与不同PID、透明API计数及模型计数均0、postkill/replay-before/replay-after物理state与reserved JSONL字节完全相等，独立核对结果见restart-artifact-audit.json。

submitted producer 46330被SIGKILL后replayer47050返回paused/extra_or_wrong_input；本例完整执行型stack有sandbox:policy插件user消息，命中额外输入安全暂停。不能把它说成已动态覆盖纯单prompt旧lease分支或精确fencing。settled_failed producer47087被SIGKILL后replayer47820返回settled_failed，原回执/预算不变。

只有new parent初始化在计数之前；postkill物理字节在初始化之前读取，证明初始化没有改目标会话/state。两producer的failed路径不执行成功所需固定验证，本轮不新增外部真实供应商或成功重启证据；旧11项仍含真实成功固定验证回归。
