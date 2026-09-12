# 第15轮独立只读审查

审查者：review_r14（复用上一轮审查者），worker / gpt-5.6-terra / xhigh。只读审查本轮3个冻结文件及规格、T-20、正式证据，三个SHA-256与candidate一致；未改文件或重跑套件。

**结论：F-15在T-20本地持久合同层已解除，未发现新增具体P1/P2。** 主线程复核源链、额度检查、真实Runtime测试调用和原始正式日志后采纳。T-20可标开发完成，未标独立验收通过；T-21/T-22仍未完成。

- recovery-admission.mjs:327-378精确关联当前终态Owner run、task/Owner/plan、run attempt/session与已有source/root/request/T13 attempt及预留身份。完整边参与source ID（:246-265），不能删除或改写后伪装首次失败。
- 导入路径（:542-685）核验源链无环、每个前序request仅一后继、前序intent精确匹配，T-13已有启动回执和failed结算，session/prompt满足本地关联约定。多source沿一个初始root，无法跨root重绑。
- 接纳路径（:740-866）有已核验延续边才继承root；缺失绑定保留continuation_unbound，两级余额仍决定是否可新领取。相同失败source+strategy重放保留原收据，后续新失败可新intent，原始首次原因保持不变。
- 测试（recovery-admission.test.mjs:567-718）覆盖连续同root、重启、逐字段错绑/额外字段、错误回执/不满足终态、额度耗尽、历史边破坏、前序重用、跨进程竞争、义务起源与派生A/B/A。正式8组352通过、0失败、21跳过、0超时，82候选无漂移。

边界：测试helper（:515-548）调用T-13并构造未来T-22生产的ownerRun状态；Runtime/saveState及进程竞争是真实调用，但没有真实session/prompt执行。合同:98-121明确本地消费与未来后端生产/对账边界。不能将F-15局部解除说成真实会话链路已验收；launchAuthorized:false符合范围。

本轮正式后未修改生产、断言或冻结合同，也未自动启动下一轮。
