# 第14轮证据索引

范围：T-20 / R4-V03-1，关联 AC-15/24/31 的局部来源与领取，以及 BUD-01/02/03/05 局部场景。不是完整生产 AC 或 CA-01 验收。

- [基线](baseline.json)：78 项前置指纹与四仓 HEAD/原有修改；[Runtime 起点](runtime.mjs.before)用于区分本轮与既有未提交代码。
- [候选](candidate.json)：2026-09-11T02:28:58.011069+00:00，82 项 SHA-256；[本轮差异](round.diff)只包含 Runtime 接缝及新模块、测试、夹具、接口说明。
- [开发首次失败](development-first-actual-failure.log)：测试临时根的 `/var` 与 `/private/var` 规范化差异导致绑定拒绝；开发阶段修正夹具使用 realpath。[开发最终定向结果](development-final-targeted.log)：10/10。开发日志不计作正式结果。
- [正式执行脚本](test-runner.py)、[首次正式结果](test-results.json)：8 组独立串行，每组 60 秒，记录命令、目录、起止、退出码、计数和候选漂移；原始日志为 formal-*.log。
- [有限补验脚本](supplemental-runner.py)：仅 control，保持原冻结候选，不修改源码/断言/规格。首次 60 秒超时属于本轮编排遗漏既有 180 秒预算；第11轮 test-results.json 记录 control 用 180 秒预算、实际约 109.57 秒。因此沿既有预算补验一次，保留首跑，不重新运行其他套件。[补验结果](supplemental-results.json)，原始日志 supplemental-control.log。
- [工作区核对](workspace-final.json)：四仓 HEAD 均不变，候选无漂移；main 与本地 origin/main 跟踪引用相同，未 fetch，未声称实时远端一致。未提交、推送、stash、切分支或新建 worktree，原有修改保留。

## 证据层级与限制

新增 10 项测试调用真实 Runtime.reserveRecoveryAdmission 和真实 saveState，使用独立临时 Git 工作区及真实子进程竞争。覆盖首次持久领取、新 Runtime 重放、A/B/A、原始失败原因保存、非法字段/来源/状态、有效义务与用户依据、审批/版本/取消/坏状态/缺配置、改变上限、写失败、同请求与不同请求跨进程竞争。不会创建真实模型会话，executionIdentity 仅占位，launchAuthorized 始终 false。

首次写失败场景通过目录权限阻止写入，能证明失败不返回领取结果，不能等价为任意崩溃点均已验证。T-14 的真进程中断是前置证据，本轮没有重跑，也不冒充新增入口的完整崩溃验收。后续真实 session/prompt、取消释放、跨版本和全入口门禁仍未运行。

当前同一原始 attempt/session + strategy 的幂等测试不能证明下一真实失败的延续。此项按未完成合同记录，不因测试全绿判为已满足。独立审查报告负责列出进一步确认的问题。
