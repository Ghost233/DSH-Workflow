# R82：T25 来源消费与 DAG 前准备入口

上一目标轮R81属于有效进展：真实原生日志已交付。本轮进一步连接“主线程真实write/edit → T24日志 → T05实际Spec/Ticket → 当前Git基线 → 主线程来源准备结果”。T25仍开发中，未将这段准备冒充完整checkpoint或规划快照事务。

## 实际交付

新增 `planning-source-chain.mjs`，独立复核选中原始prepared/terminal的合同、主会话/调用/路径配对、原生成功和完整字节证据；首项对应baseline blob，逐项原始摘要及版本连续，尾项对应T05当前文档。当前分支/完整HEAD或暂存状态不符时拒绝，不改用户现场。

`workflow_planning_prepare` 已实际注册，由Runtime从调用者取得主会话身份，不接收自报approved/授权/来源agent。入口可在DAG创建前调用；拒绝Owner、有角色的子代理及包括meta.parentSession在内的讨论fork。返回source-validated与来源摘要，checkpointCreated/executionAuthorized均false，不替代preflight。

两种真实基线均验证：首次原生创建尚未进入HEAD的Spec/Ticket；已有一次提交、保留旧日志后，只选择新基线上的新调用。历史保留不再导致每次重规划都被旧记录阻断。

## 发现与修正

- 原生provider的targetKey/displayPath为不透明表示，不能强制等于canonical path；核验记录器实际绑定的target.path并保留原始provider字段。开发失败日志保留。
- 不得要求同文档全部历史记录都进入本次链；按本轮基线及连续版本核验选中链。否则第二次checkpoint无法继续。
- 主线程判断原先漏掉meta.parentSession的fork形式，已补齐并以无角色绑定的meta-only子会话验证拒绝。
- 初次正式候选漏测了新增文档：cat-file -e对缺失HEAD:path返回128。候选2改为精确literal ls-tree查询，仅空条目判缺失；其他Git/I/O错误继续拒绝，补真实首次create回归。未将64项通过当作没有缺陷的证明。

授权调查还否定了“必须先有已批准Workflow，再授权首次文档checkpoint”的初始化方案：脏文档会先阻断preflight/start，造成循环依赖。真实授权记录必须能在Workflow之前存在、绑定原始来源，并复用已有匹配授权；不能让工具自己填approved，也不能无条件增加逐阶段问询。详见[接缝结论](authorization-seam.md)。这项后续实现尚未完成，不是要求当前用户重复确认。

## 固定候选与结果

- [候选1](candidate.json)：六套正式64/64，零失败/跳过/取消/超时/漂移。[原始结果](test-results.json)。随后只读审查发现上述新增文档P2。
- [候选2](candidate-2.json)：修改baseline查询并新增首次创建用例后，受影响真实来源套件定向5/5，零失败/跳过/取消/超时/漂移。[原始结果](test-results-2.json)。其他五套未重复；不把两个候选的数字合并成一次整轮通过。
- 开发日志单独保留，包括目标表示假设的失败与后续修正；不替代正式候选证据。
- 独立复审关闭新增文档P2及主会话谱系P2，无新增确认P1/P2，见[审查](review.md)。

## 剩余交付

T25下一步仍是：DAG前真实来源授权记录→受锁保护的本地checkpoint→实际index一致→不可变规划快照及阶段恢复。准备返回值不是持久锁，不对之后文件变化提供保证；真正事务必须在关键阶段重检来源、用户改动、授权和有效基线。T26/T27及T17/T18/T19、B02–B06、CA01仍按原范围推进。

本轮没有提交或推送，保留原有未提交和未跟踪文件。测试Git写入仅在本轮临时项目；[Git核对](git-final-evidence.json)记录当前本地与缓存远端引用，未联网刷新，不宣称无关子仓库已同步。
