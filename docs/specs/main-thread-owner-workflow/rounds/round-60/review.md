# R60 独立只读审查

审查者t21_contract_review，candidate.json固定后只读。结论：关闭R59来源删除P2；新增1个P2，无其他范围内P1/P2。主线程复核认可。正式238通过/7既有skip，零失败/超时/漂移；见test-results.json。

## 已关闭：request_handoff删除恢复来源

applyPlanDelta结果只作为proposal校验/保存，active计划、review/approval、Owner/task/outbox与lease身份保留。真实工具请求后live控制等待，admission拒绝提前领额度；实际Owner completed turn之后才写blocked终态并继承paid root。4个真实测试含免费/付费/报告重复handoff与typed权限门禁，支持此结论。

## 新增P2：pending直接转交后仍可提交completed

受保护Owner保存pending request后可以无视nextAction，提交owner_submit completed且handoffs=[]。owner-submission未检查同源pending请求，会继续验证和commit；finishOwner将task/Owner写completed，但只处理已经planned且目标是当前Owner的handoff，不处理该pending request。

请求仍携带blocked的sourceExecution，控制器随后进入handoff-replan，新入口与completed来源冲突而拒绝，留下无法自动消费的proposal。本轮4例只提交blocked，不能用全绿证明这条路径安全。

R61最小修正：在completed提交关卡前，以当前Owner lease与task/owner/attempt/session检查同源pending request_handoff并拒绝矛盾completed，提示blocked/failed收尾。增加真实completed被拒绝、随后blocked及Planner恢复测试，不人工撤销提案或伪造终态。该发现未在冻结候选上修复。
