# 第42轮：T15直接恢复接线首轮

recoverOwner已先经持久预算领取，再进入受保护Owner路径；保留失败来源，连续真实失败沿同根问题扣减，额度耗尽停止。普通runExternalOwner不能绕过新协议失败恢复门禁；未知协议、缺失/非法配置失败关闭，legacy路径保留。

定向首轮5/6失败原因是failed workflow不能领取；只对owner_failure放行后新增8项通过。正式六套共318项：311通过、7旧control占位跳过、0失败/取消/超时/警告，候选1622文件无漂移。原始结果见test-results.json。

独立审查仍找到2个P1和1个P2：首次用户决策未持久化、未处理handoff可绕过、普通finish-only与revision-abort被误导入预算。共同原因是新分支未共享旧恢复前置/分流。第43轮先修这些回退，再继续Supervisor；T15保持开发中，未就绪上线或整体验收。见review-findings.md及remaining.md。

主线程独占3个源码/测试文件，既有修改保留。四仓HEAD不变，无提交/推送/fetch；依赖tracking仍behind1430/4，未同步。持续授权有效，不需用户决定这些技术修复。
