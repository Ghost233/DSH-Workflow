# T-14 正式证据

候选：[candidate.json](candidate.json)，2026-09-11T01:50:32.347310+00:00，78项指纹（70项生产/测试/依赖来源、6个验证脚本、2份审计/拟议合同）。[基线](baseline.json)与[结束检查](final-checks.json)证明既有生产候选未变。T-13第13轮125项测试是输入证据，本轮未重复运行，也不计入本轮验证数量。

[编排器](collect-formal.py)依次采集storage/session/identity，外层分别90/35/15秒；独立组失败继续。全部退出0、无超时、无stderr或未解析输出。[顶层结果](formal-results.json)保存命令、时间、退出码与观察；存储详细IPC/状态/进程退出码见[storage/formal-results.json](storage/formal-results.json)。

## 存储：九组可复现观察

| 场景 | 实际结果 | 证明范围 |
| --- | --- | --- |
| 正常领取 | totalUsed=1，一个模拟启动标记 | 真实saveState保存后才到夹具标记 |
| 读取前SIGKILL | 保存值0，重启后1 | 真子进程重启，不是内存Runtime重建 |
| 内存扣减后、保存前SIGKILL | 保存值仍0；立即重启被写锁拒绝；真实等待30302ms后恢复为1 | 30秒陈旧锁保护与进程中断恢复，不含断电 |
| 保存后、启动前SIGKILL | 保留一个reserved和used=1；重启输出replayed、零启动标记 | 夹具选择停止对账；尚未证明自动恢复执行 |
| 不同请求跨进程并发 | reserved/rejected，used=1、一个attempt、一个启动标记 | 写锁内current快照上的最后额度竞争 |
| 同请求跨进程并发 | reserved/replayed，used=1、一个attempt、一个启动标记 | 同一显式绑定的跨进程重放 |
| 同请求顺序重启 | reserved/replayed，只扣一次，第二次不提交标记 | 幂等持久输入；不是会话幂等 |
| 损坏JSON/缺账本/保存失败 | 三个子场景均未提交启动标记 | 保存失败通过临时夹具将目标换目录造成真实rename错误；不模拟断电/磁盘写满 |
| 普通revision CAS | 旧快照保存拒绝，保留writer-won和revision=1 | 现有普通saveState防止旧版本覆盖 |

存储探针使用真实writeJsonAtomic/saveState/readJson/statePath私有实现：完整源文件临时副本仅改静态相对import定位并追加export，函数体不改，原/副本hash留档。使用probe-only状态外壳，不经过真实readState、完整执行入口或Owner lease；current.recoveryBudget调用真实T-13纯模块。1秒内20ms间隔的有限锁重试、遇replayed停止对账及IPC模拟启动是**验证适配代码**，不声称已存在于生产Runtime。临时状态/模块副本均清理，未触碰真实Workflow。

## 会话与身份：五组观察

[会话原始JSONL](formal-session.log)含两组负向适配观察、两组错误保护正例。真实runChild/provider经过模拟agents.create、persistOwnerSession和child，父进程在确定barrier后SIGKILL，重启为不同PID。

- create已接纳但尚未返回：两次底层调用分配不同sessionId，零prompt。不能把会话创建等同模型已工作。
- 会话绑定已返回且prompt接纳：直接重放产生新session和新prompt；夹具绕过runExternalOwner/lease/恢复决策，**不证明生产会自动双启动**。
- create拒绝：零prompt；persistOwnerSession拒绝：零prompt且dispose一次。故障为服务边界注入，非真实会话后端。

[身份原始JSONL](formal-identity.log)调用真实ownerRecoveryFingerprint与reviewIssueObligation：路径归一会合并摘要，planDigest改变会改变摘要；显式义务来源可保留。只证明旧摘要不能作为新合同根问题身份，不把其旧用途判为缺陷。

总共9组存储＋4组会话＋1组身份观察，所有夹具断言完成；其中负向适配结论不计作生产AC通过。[来源审计](session/source-audit.md)列出真实代码顺序和未覆盖项。开发阶段的生命周期失败、修正与接管见[development-notes.md](development-notes.md)；首次失败记录保留，没有删除失败断言或改写旧结果。
