# R100 CA01固定候选集中验收报告

## 结论

CA01最终通过。候选`CA01-R100-fac087e62075`绑定Git基线`154914064f5ceb2f8eb413865e10a54e8ffbc663`、源码内容摘要`0b2dda26cb40ac22b2e7a3f9f768f2bd89b7e8c94bfc85415d36d0a860081ad4`、R4 Spec、31张验收通过的Ticket、全部AC映射、规划快照摘要和集中验证图摘要。候选ID由这些摘要共同派生，规划文档变化不会复用同一ID。工作区已有未提交源码没有被清理或伪装成Git提交；10431个实际文件由内容摘要固定，每项运行前后复核HEAD和内容。

十个集中验证项全部`passed`，共1114个Node test：1093通过、21个明确的旧版替代用例跳过、0失败、0取消。没有验证项被阻塞、超时、标为零用例、未运行、证据不完整或候选漂移。S/A/B代表项在规划激活、公共Owner协议、调度/资源生命周期三个真实前置通过后实际运行，证明S基于K1形成兼容K2、只有S实现公共变更、A在集成后消费K2、B继续使用兼容K1，fresh Runtime重放不重复创建版本。

AC-01至AC-32的逐项依据见[`ac-matrix.md`](ac-matrix.md)。原始固定argv、stdout/stderr、用例汇总、exit code和候选绑定见[`test-results.json`](test-results.json)，验证图见[`acceptance-plan.json`](acceptance-plan.json)。

## CA01发现并关闭的问题

1. 真实Harness启动测试用`instanceof Context`跨物理模块副本判断启动结果，导致有效Context被误拒绝。现在核对实际使用的fiber、agentPresets和agents服务，完整Harness装载8项通过。
2. T29统一准入把“任务投影仍为running”同时当作容量和Owner/资源排他，已提交待结算或正在停止的Owner因此冻结无关Owner。现在执行容量只统计仍在实际执行/等待授权的attempt；Owner和资源排他继续保持到结算。相关Harness、hard deadline、RecoverySession和统一准入47项通过。
3. 公共Owner子会话已由当前Runtime超时中止时，持久日志收尾可暂时呈现`prompt_not_unique`并覆盖已知超时。现在只有完整认证提交能覆盖当前Runtime持有的超时事实；否则持久结算为`settled_timeout/deadline_exceeded`并释放判断槽位。公共Owner及S/A/B 21项通过。
4. hard-deadline真实子进程终态测试使用200ms观察窗，在整套高负载下偶尔进入设计允许的`technical_pause`。测试夹具改为1秒，仍远低于生产30秒边界，避免把调度延迟当产品失败；8项终止/隔离行为通过。
5. 首次完成审计发现Spec仍标为草稿、29张Ticket仍停在开发完成、AC-10没有Ticket frontmatter承接，且候选ID只取源码摘要。现在Spec和31张Ticket状态已回填，T-04明确承接环境错误分类的AC-10，Runner在启动前要求Ticket覆盖AC-01至AC-32，并用Git、源码、规划快照及验证图摘要共同派生候选ID。修正后的完整候选重新运行并通过。

## 运行环境边界

完整验收在Codex默认文件沙箱外运行，因为真实Harness会再启动自己的macOS`sandbox-exec`；嵌套沙箱会由系统返回`Operation not permitted`。第一次嵌套运行的失败被保留在会话工具日志，但最终证据文件只保存当前候选的正式非嵌套运行。未使用网络、真实钱包、生产凭据或外部服务。

本轮没有提交、推送、发布、清理或覆盖用户工作区。CA01的通过表示本规格定义的本地实现与固定夹具验收完成；远程发布仍需单独授权。
