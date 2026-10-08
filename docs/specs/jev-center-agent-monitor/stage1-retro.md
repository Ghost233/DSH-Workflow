# 阶段 1 复盘

范围：JEV-T01 #13 与 JEV-T03 #15。输入是一手实施记录、首轮双轴审查、修复的红绿记录及精确候选验收；不把后续阶段或工作区另一任务列为整改项。

## 已关闭的环境与检查缺口

| 优先级 | 发现 | 本轮处置与完成标准 |
| --- | --- | --- |
| P2 | 标准 Settings 存储可用，用户却缺少原生配置入口；HTTP 页面验收不能证明 Desktop 的 file:// + IPC 路径。 | 增加真实 SlotRegistry、ConfigForms、ClientGateway 接缝测试，覆盖原生 Settings/Plugins 入口、配置、凭据及同页连接测试；测试由既有 npm test 自动发现。保留实际浏览器操作为独立证据。 |
| P2 | 按实际回调时间设置下一次截止使轻微定时器抖动漏掉检查轮；整分钟时间线不足以暴露它。 | 真实 Host 回归使用 60001、120000、180000、240000、300000、360000ms，验证次数 1–6、第五/六轮通知与同轮去重；另覆盖运行中改变间隔。 |
| P2 | Web 持久装配与 Desktop 直接装配重复维护 Observation 身份冲突规则。 | 现有 observation-profile 模块导出 missingObservationEntries，两个入口共用同一规则；保留各入口的公开装配验收。 |

## 执行环境结论

- 原生 macSandbox 的 sandbox-exec 在 Codex 外层沙箱中曾被 sandbox_apply EPERM 拒绝。真实测试在已授权的外层限制之外执行，产品沙箱和验收标准保持原样；原始环境失败不记为通过。
- 当前工作区混有用户原有 MCP、Flutter 规格和研究改动。最终验收使用暂存 tree 的只读候选，逐项核对 tracked blob，依赖复用现有固定构建；候选不用于开发或提交，工作文件字节保持一致。
- 真实 ESM Host 装配采用普通 Node 子进程，避免强制 tsx 产生不同的原生模块实例。辅助进程以可观察的启动握手建立前置条件；保留原截止与业务断言。
- 已阅读 CI 和既有检查入口。Owner 全量、客户端产物、相关 Web/Desktop 装配与固定 Harness 构建证明组成当前阶段门禁；现有自动化覆盖上述修复，无需新增全局规则或调整 AGENTS.md。

## 剩余项

没有本阶段待修复的 P0/P1/P2 复盘项。用户已明确暂缓今天的 macOS 通知实际显示验收；代码与通知提交边界照常验证，实际送达保持未验证。多配置、异常结束、语义检测和配置变更下监控属于后续阶段。

来源：首轮审查固定 HEAD d4ab28190c5b603a9577c8037e808bccaf4d5c6a；修复候选 tree afe892d09e06d878abf57b7a018fbda48f4751c4。实施与修复记录保存在 /private/tmp/jev-delivery-t01-notes.md、jev-delivery-t03-notes.md、jev-stage1-native-settings-fix.md、jev-stage1-tick-fix.md；正式复审另记录最新 HEAD。
