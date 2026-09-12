# 第 9 轮独立只读审查

审查者：review_r08（沿用 worker / gpt-5.6-terra / xhigh），冻结后只读检查起始内容到候选的差分、R4 5.4/5.10、正式日志和直接 Owner 探针。未修改代码或执行 Git 写入。

确认 F-12 / P2：submitOwnerResult 依结构化权限/业务依据强制 blocked 收据，runOwnerEntry 抛出 OwnerReportedError；runExternalOwner 随后把它判为普通 blocked，`!blocked && request_user_authority` 排除了局部待决路由，mainOutbox 为空而 Workflow 进入 blocked。真实直接 Owner 探针证实该链。应让当前有效的结构化用户依据先于普通 blocked/handoff 分类，再保留普通旧流程；新增真实生产与结算连接测试。

审查者将两项正式兼容失败也判为 P2 发布阻塞：新增工具插入导致原固定工具位置不匹配；宽泛 OWNER_ONLY_TOOLS 分支改变原 owner_host_exec 主会话拒绝路径。建议保留旧顺序/旧入口拒绝行为，为新反馈工具单独加 Owner 限制。

主线程复核：两项失败必须修复后才可完成本轮工单，但当前证据仅表明顺序/提示断言不兼容，没有证明权限被放开。F-12 是已通过真实调用链确认的功能缺口。

其余 F-10 问题投影与 F-11 结构化绑定、来源有效性、尝试轮换、lease 和不提交门禁未发现新增确认问题，仍受 F-12 限制。正式286通过、2失败、21跳过，无超时/漂移。
