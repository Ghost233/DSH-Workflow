# JEV 中心与代理监控交付记录

2026-10-07，用户调用 spec-delivery 并要求开新分支，恢复本规格实施。此前文档中的暂停描述是历史授权状态，本轮以用户的新指令为准。当前运行的 DSH 服务不在本次切换范围内。

- 正式规格：GitHub #12；工单 #13–#18。
- 目标分支：main；集成分支：codex/jev-center-monitor。
- 初始固定基线：2f84551b6a0e292df82a68c4f5948c9c5f66755d。
- 阶段 PR 合入集成分支；最终 PR 面向 main，完成后标记 ready，等待合并。
- 工作区原有未提交改动保留，只提交本规格范围内的内容。共享 checkout 的 Git 操作由唯一 merger 串行执行。

| 阶段 | 工单 | 前置条件 | 状态 | 审查固定点 | PR |
| --- | --- | --- | --- | --- | --- |
| 1 | #13 单套中心、#15 无输出监控 | 无工单阻塞 | 本地门禁通过，复盘完成，最终双轴复审待运行 | 初始固定基线 | 待创建 |
| 2 | #14 多配置、#16 异常结束、#17 语义检测 | 阶段 1 审查并集成 | 待开始 | 待固定 | 待创建 |
| 3 | #18 配置变化下的监控 | #14、#16、#17 完成且阶段 2 集成 | 待开始 | 待固定 | 待创建 |

每阶段依次经过 Standards/Spec 双轴审查、P0/P1/P2 修复、复盘及范围内修复、再次双轴审查。所有必需检查通过后才合并阶段 PR。最终核对整份规格、跨插件行为及完整总 diff，再进行总审查。

测试接缝沿用用户确认的真实 DSH Host、标准 Settings/credentials、公开命名调用与原生 Agent 事件；模拟上游及时间，不调用付费模型。macOS 系统通知提交与实际送达分别记录证据，不用模拟提交代替送达。

## 未完成项

- 阶段 1 最终复审与集成；阶段 2、3 四张工单的实现与验收。
- 阶段 1 最终 Standards/Spec 复审；后续阶段及最终审查、复盘与修复。
- 阶段 PR、集成验证和最终 ready PR。
- macOS 实际通知送达（用户明确暂缓本轮）；实际浏览器截图未取得，见下方环境记录。

阶段 1 已按本轮规格重新完成本地代码验收，尚未合入集成分支；不能以历史原型测试替代本轮证据。

## 阶段 1 验证进度

- T01：12 个真实 Host 测试通过；标准 Settings/credentials、页面保存、固定连接题及错误/超时处理。
- T03：13 个真实 Host/Settings 测试通过；原生主代理、spawn/fork、Agent Team、计数/恢复/日志及通知提交。
- 项目真实 Web Host：Owner 的模拟请求挂起后告警、输出后恢复且原请求未取消；同一 profile 停止重启后保留两插件设置及用户原字段。
- 源 Web 平台分支的无参数日常启动：真实 CLI 启动并正确回收，用户配置保留。测试在隔离 profile 中模拟 shell 平台分支，未启动当前 macOS 应用。
- 客户端产物校验和 Web/Desktop 装配测试通过；最终候选全量检查尚待运行。
- 当前 Node v26.9.0。固定 Harness 5badb15009ae1756c3afe0ae0cef1faafc290ccc 的原构建记录缺失；显式构建首次因 corepack ENOENT 退出 1。临时目录准备 Corepack 0.36.0 后，按原锁文件用 pnpm 11.7.0 完整构建，退出 0，原生构建证明核对通过，上游源码保持干净。
- 原始失败与修复日志保留于主线程的 /private/tmp/jev-stage1-*、/private/tmp/jev-harness-explicit-build*.log；正式审查与提交证据将在固定 SHA 后补充。
- 首轮 Owner 全量 665 项为 647 通过、18 失败，原生 sandbox-exec 被外层 Codex 沙箱拒绝。首个失败用例在外层限制之外通过；六个受影响文件复验 27 项中 26 通过，剩余辅助进程启动前置条件的用例正在定点修复。
- 项目 Host 的 Settings 场景在强制 tsx 运行器中触发原生 ESM 模块实例不一致，现改为独立普通 Node 子进程，单文件验证已通过。并行受影响检查中该子进程触发 25 秒截止，尚未记为通过；需在剔除其他任务 MCP 改动的精确候选中复验。
- 早期进度中的待运行项保留为调试历史；最终候选与当前状态以下方记录为准，完整交付仍未完成。
- 第一阶段候选 tree 14c136408b9ca17ab9ee5447344509045b3b5d28 已验证 Owner 665/665、集成 10/10、客户端产物检查通过，提交 d4ab28190c5b603a9577c8037e808bccaf4d5c6a。首轮 Standards 1 项 P2、Spec 2 项 P2，正在修复和补验。
- 已通过真实监控提交一条 JEV_测试通知，osascript 提交退出 0；用户明确反馈没有看到，实际 macOS 送达尚未通过，不以提交成功代替。
- 用户随后明确要求今天跳过通知送达验收、其他继续。本轮将实际 macOS 显示验收暂缓，保留未验证状态；不修改系统通知设置，不把它作为本轮其余交付的阻塞项。通知提交接缝及代码仍按规格验证。

## 阶段 1 修复与最终候选

- 首轮 Standards 1 项 P2、Spec 2 项 P2 均完成修复：共享 Observation 冲突规则、按既定检查轮次推进、原生 Settings/Plugins 表单与同页 Remote 连接测试。
- 最终代码 tree：afe892d09e06d878abf57b7a018fbda48f4751c4；提交：7e549d4df5bb89f0350917e03f4ddbe651094acd。候选排除用户原有 MCP 等改动，逐项核对 4065 个 tracked blob；工作文件字节保持一致。
- Node v26.9.0；`npm test`：675/675，退出 0，无取消或跳过；日志 `/private/tmp/jev-stage1-final-owner-full.log`。真实 macSandbox 测试在 Codex 外层限制之外执行，未改产品沙箱。
- `node scripts/run-workflow-tests.mjs scripts/kernel-web-host.test.mjs scripts/kernel-launch-composition.test.mjs scripts/daily-workflow-launch.test.mjs scripts/kernel-web-launch.test.mjs macos-launcher/runtime/desktop-profile.test.mjs`：10/10，退出 0；日志 `/private/tmp/jev-stage1-final-integration.log`。
- `npm run check:client`、固定 Harness `checkBuild`、上游源码干净核对及 `git diff --cached --check`：退出 0。固定 Harness 5badb15009ae1756c3afe0ae0cef1faafc290ccc 的真实构建证明有效。
- 原生客户端公开接缝使用真实 Cordis、SlotRegistry、ConfigForms、TypertRegistry 与 ClientGateway；DOM 操作覆盖配置、独立凭据、连接测试、服务迟加载及撤回/恢复。Host Gateway 验证通过公开 RPC 到同一 System One 路径。
- [阶段 1 复盘](stage1-retro.md)：没有待修复的本阶段 P0/P1/P2 项；复审覆盖初始固定点到最新 HEAD 的全部已提交变更。
- 隔离真实 Browser Host 已准备，但用户指定的 IAB 对 127.0.0.1/localhost 返回 ERR_BLOCKED_BY_CLIENT；Chrome 不可用，Safari 未获 Computer Use 许可。实际浏览器截图尚未取得，不把 jsdom 或 HTTP 响应称为实际截图；未绕过浏览器访问策略或公开暴露 Host。
