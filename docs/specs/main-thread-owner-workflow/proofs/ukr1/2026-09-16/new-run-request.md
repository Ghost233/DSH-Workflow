# Coinhub fresh end-to-end request

请在当前 Coinhub_Online_Demo 工作区重新进行一次完整的 Owner Workflow 端到端验收。当前 dev 分支是本轮真实基线；先读取已有 docs/specs/coinhub-critical-journeys/ 与 docs/specs/local-deterministic-journey-acceptance/，核对 Git HEAD、已交付内容和仍未满足的验收项，在主线程总结本轮需求、生成本轮 Spec 和 Ticket，然后编排新的可执行 DAG。不要沿用旧 workflow 的成功状态或恢复额度，也不要把旧的孤立测试通过当作本轮交付。

本轮目标是完成本地确定性的关键用户旅程：共享 Panel 的 Market/Search→Detail→follow/Watchlist 顺序与失败回滚→TradeSheet；API/Worker 的本地 unary/stream、断线重连、WalletConnect 事件和交易 quote/allowance/approve/preflight/submit/status；Web 与扩展宿主的同一消费者路径。仅在本地验收开关下使用 fake，不请求真实上游、钱包或链，默认生产行为保持不变。固定验证必须覆盖实际生产实现及上述行为，而不只是 TypeScript 类型检查或复制一份模型；再运行项目要求的 typecheck、构建与最终旅程验收。

按 Owner 写入边界执行：公共模块修改由对应 Owner 决策；Runner 根据 DAG、Owner 和空闲资源派发，冻结候选后独立验证、审查并集成。对技术失败给出原始错误、候选身份、耗时和明确的局部修复，不无限重试或整图重写；需要产品方向或权限决策才反馈给我。不要修改 DSH/第三方源码、用户配置、密钥、模型、审批或沙箱设置，也不要引入依赖缓存、整树复制或全树摘要的 workflow 辅助机制。记录新 workflow ID、Spec/Ticket/DAG 版本以及每项交付与最终验收证据。请自主推进到完成或明确阻塞。
