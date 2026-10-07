# JEV 中心与代理监控交付记录

2026-10-07，用户调用 spec-delivery 并要求开新分支，恢复本规格实施。此前文档中的暂停描述是历史授权状态，本轮以用户的新指令为准。当前运行的 DSH 服务不在本次切换范围内。

- 正式规格：GitHub #12；工单 #13–#18。
- 目标分支：main；集成分支：codex/jev-center-monitor。
- 初始固定基线：2f84551b6a0e292df82a68c4f5948c9c5f66755d。
- 阶段 PR 合入集成分支；最终 PR 面向 main，完成后标记 ready，等待合并。
- 总 PR：[#20](https://github.com/Ghost233/DSH-Workflow/pull/20)，当前为草稿；完整验收和总审查尚未完成。
- 工作区原有未提交改动保留，只提交本规格范围内的内容。共享 checkout 的 Git 操作由唯一 merger 串行执行。

| 阶段 | 工单 | 前置条件 | 状态 | 审查固定点 | PR |
| --- | --- | --- | --- | --- | --- |
| 1 | #13 单套中心、#15 无输出监控 | 无工单阻塞 | 双轴复审 0 P0/P1/P2，已集成；#13、#15 已关闭 | 初始固定基线 | [#19](https://github.com/Ghost233/DSH-Workflow/pull/19)，已合并 |
| 2 | #14 多配置、#16 异常结束、#17 语义检测 | 阶段 1 审查并集成 | 完整本地门禁通过，隐私 P1 已修复，复盘及最终双轴复审 0 P0/P1/P2；已集成 | e4692d73a9030a70d0890652bc655933591e52c4 | [#21](https://github.com/Ghost233/DSH-Workflow/pull/21)，已合并 |
| 3 | #18 配置变化下的监控 | #14、#16、#17 完成且阶段 2 集成 | 同 Host 生命周期与无参数日常启动交叉验收进行中 | b0bdc3377e22ae635a5100ce90e4b1f13b2f1598 | 待创建 |

每阶段依次经过 Standards/Spec 双轴审查、P0/P1/P2 修复、复盘及范围内修复、再次双轴审查。所有必需检查通过后才合并阶段 PR。最终核对整份规格、跨插件行为及完整总 diff，再进行总审查。

测试接缝沿用用户确认的真实 DSH Host、标准 Settings/credentials、公开命名调用与原生 Agent 事件；模拟上游及时间，不调用付费模型。macOS 系统通知提交与实际送达分别记录证据，不用模拟提交代替送达。

## 未完成项

- 阶段 3 的 #18 实现、交叉验收、双轴审查与复盘。
- 阶段 3 PR、集成验证以及完整总 diff 和跨规格审计。
- 最终双轴审查及总 PR #20 标为 ready。
- macOS 实际通知送达（用户明确暂缓本轮）；最终阶段的完整浏览器复验尚待完成。

阶段 1、2 已按本轮规格完成本地代码验收并合入集成分支；不能以历史原型测试替代本轮证据。阶段 2 合并后集成分支本地与远端同为 b0bdc3377e22ae635a5100ce90e4b1f13b2f1598；阶段 2 分支同为 d83fea60e809336d054a0aca31192da434433e54，阶段 1 分支同为 067d166fd2928178fc7d7f7f37988e88ecab74fa。阶段 3 在同一 checkout 从集成提交创建，未创建额外 worktree，也未移动或暂存用户原有工作。

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

## 阶段 2 进度

- 阶段 1 Standards 与 Spec 最终复审均为 0 P0/P1/P2，PR #19 已合并并完成本地同步。Owner verify 与 Matt 远端检查已成功；合并时两架构 macOS 检查仍运行，未记为已通过。
- 工单 #14、#16、#17、#18 的正式正文、标签和评论已刷新。#14 与 #16 并行；#17 与 #16 共用监控文件，由同一实现者依次实施，客户端文件在 #14 完成后交还，工单依赖不变。
- 内置浏览器后续可达隔离实例，使用标准 connection.authenticatedUrl 登录后进入原生 Settings。未修改浏览器安全设置、上游源码或当前 DSH 服务。
- 实际表单操作发现阶段 2 开发中的配置读取缺陷：新增重名校验的函数转换不能经 Settings Remote 序列化，客户端收到 schema 后加载失败；保存后提示成功但仍显示默认配置，测试连接提示先保存。问题已交 JEV 配置实现者修复，真实 Host/ConfigForms 接缝已形成红绿回归；截图证据为 /private/tmp/jev-browser-settings-before.jpg。现场使用未提交的阶段 2 实现，不能据此归因于已审阶段 1。旧访问限制记录保留为历史，不再表示当前浏览器验收被阻塞。
- 修复后干净重启隔离实例，真实浏览器确认读回、quick/full 同时启用、重名拒绝、停用原因、删除后另一配置及共用凭据仍可调用，连接结果含实际返回模型和耗时。截图 /private/tmp/jev-browser-settings-after.jpg；完整操作证据 /private/tmp/jev-stage2-browser-notes.md。仍待最终阶段门禁与审查，未宣称完整交付已通过。
- T02 中心 Host 23/23 通过，T04 监控相关模块 20/20 通过，均退出 0。T05 为并行收尾拆分归属：监控实现者独占 core/plugin/Host 测试，已完成 T02 的客户端实现者接管原生监控表单、只读 snapshot Remote 和客户端构建；交还确认后才开始，保留双方已写改动。
- T05 最终服务端/Host 模块 32/32、原生客户端相关模块 21/21，均退出 0，已停止写入；客户端构建及产物校验通过。功能性红绿记录见 /private/tmp/jev-stage2-t05-notes.md 和 /private/tmp/jev-stage2-t05-client-notes.md。
- 真实浏览器复验通过监控参数保存、停用/缺失红色原因与保留引用；公开 LlmAdapter 模拟的实际原生请求逐轮告警进入同页列表，输出后记录恢复时间，原请求未被取消，没有恢复系统通知。默认持久日志没有输入、输出片段或凭据；临时 Host 已正常退出并清理。截图 /private/tmp/jev-browser-monitor-recovered.jpg，操作记录 /private/tmp/jev-stage2-browser-notes.md；未把它称为 macOS 实际送达证明。
- 后续 CI 预检确认 PR #19 和总草稿 #20 的 Owner/Matt 检查成功，macOS 两架构均在打包后读取 Owner health JSON 时失败。#20 当前仍只含阶段 1 集成提交 e4692d7；固定基线 main 的同一步骤双架构成功。尚未证实具体根因，已安排按公开健康检查与封装解析接缝建立本地复现；不归为既有第三方故障，不降低原验收。完整原始步骤证据见 /private/tmp/jev-stage2-ci-preflight.md。
- 封装 Host 紧凑反馈连续两次复现 health 404/空体。只补 Owner 本地包名映射即变为 200 JSON；正常登录303/cookie及原生RPC200排除认证原因，Owner component原已ready，实际exports存在。修复落在项目 Desktop profile 的 Owner/Matt 本地依赖和链接及迁移标记，旧用户deps/patch/meta保留、重复准备字节幂等。定点 Host 验证健康及两观察服务/Matt工具真实提供；这项 SDK/资源装配验收不等于完整.app或DMG构建成功。

## 阶段 2 候选、首审修复与复盘

- 初始阶段候选提交 `269b513ef8d046c3ba132c8e7610efc7b74aafcb`，tree `d88d77eca65073336010dfb81ac86b63e982d89e`；Owner 708/708、相关集成 12/12、客户端与固定 Harness 检查退出 0。首轮审查从 e469 固定点覆盖完整阶段 diff：Standards 0 项，Spec 1 项 P1。
- 首轮 P1 用隔离真实 Host 证实：开启 debug 时，其他标准凭据的无标签密钥能落入 journal；公开状态不含该值。复现仅使用虚拟凭据，无用户密钥读取或付费调用。不能用初始绿测替代该隐私验收。
- 修复通过标准 LocalCredentialProvider 的公开配置、官方 document parser 与 resolver 收集全部已管理 refs/record key/env/grant 材料；文件值 A 与同名环境覆盖值 B、Bearer 裸重复都脱敏，安全文字仍保留。读取/解析/提供者缺席或未知只舍弃片段，元数据和正常观察流程保留。
- 中间修复 tree `b5697a39cbe1206e89925a558d300a3e13ce0f92` 在正式门禁实际 711/713、退出 1。正式 loader 的 SDK ESM/CJS 构造器身份不同，使标准提供者被误拒绝。修复保留两个 canonical SDK exports 的真实 instanceof 品牌；伪同名、同 config 的未知提供者仍失败关闭。正式与普通 Node 模块均 38/38；未改运行器或降低断言。
- 最终代码提交 `58d2702bf0aaf038d46e7ad55e850c8d9e9307b5`，tree `4331d1a2b4a53afee8d0678867ecee42bd098264`；4068 个 tracked blob 逐项核对，用户原有 MCP hunks 未进入候选，工作文件字节保留。
- Node v26.9.0；`npm test`：714/714，退出 0，无取消或跳过。日志 `/private/tmp/jev-stage2-final2-owner-full.log`。相关 Web/Desktop、profile 迁移和资源 Host health 的六文件集成门禁：12/12，退出 0；日志 `/private/tmp/jev-stage2-final2-integration.log`。客户端产物、固定 Harness 构建证明、SDK/上游源码干净核对与 diff 检查均退出 0。
- [阶段 2 复盘](stage2-retro.md) 没有新增未关闭的范围内整改项；随后最终两轴复审仍覆盖 e469 固定点到最新 HEAD。Browser 的真实 Settings、公开 RPC 和原生请求告警/恢复证据已保存于本次任务；实际 OS 显示仍按用户授权暂缓。完整 `.app`、codesign、DMG 双架构不在本地 SDK health 绿态的证明范围，旧 CI 失败与后续自动 CI 分别保留。

## 阶段 2 环境独立凭据闭环

- 在 `78ff7ed72890edd1da49b06c68efeb9d82903a8b` 上，Standards 复审 0 项，Spec 仍证实同类 P1：标准提供者可解析仅存在于环境的合法引用，managed 文档没有条目；隔离 Native Adapter 经标准 resolve 消费测试模型 key 后，该裸值进入 journal。公开状态无值、无付费调用，没有额外声称网络认证头验签。
- 最小修复仅在调试片段子树保守替换当前非空环境值，不把环境名称或值写入记录；普通元数据仍按已知凭据材料脱敏。catalog、有效 A/B、grant、header 与未知提供者失败关闭保持。正式与普通 Node 模块均 39/39、退出 0。
- 中间 tree `da0dc5804db106df3b32945eb66c19a6d78cbb0a` 的完整门禁为 714/715、退出 1：npm 环境材料与 fixture 安全尾句碰撞。真实中心首尾交付已确认；只调整 fixture 安全文案、增加交付断言，未改产品、期限或安全断言。
- 阶段 2 最终代码提交 `015f3380df95e985b94b07599c8a9aeff47ab990`，tree `38b149341ab6f6babb7ad570f59f12ae2f63d54d`；4069 个 tracked blob 核对，用户原有工作文件与 foreign hunks 保留。`npm test` 715/715、相关六文件集成 12/12、客户端产物、固定 Harness、SDK/上游与 diff 检查均退出 0，无取消或跳过。日志 `/private/tmp/jev-stage2-final4-owner-full.log`、`/private/tmp/jev-stage2-final4-integration.log`。714 旧绿态不作为此次证明。
- 复盘已更新；最终全阶段两轴在 `d83fea60e809336d054a0aca31192da434433e54` 上均为 0 P0/P1/P2，覆盖固定 e469 之后全部 19 个变更文件。报告 `/private/tmp/jev-stage2-standards-final2-review.md`、`/private/tmp/jev-stage2-spec-final2-review.md`；PR #21 已合入集成提交 b0bdc3377e22ae635a5100ce90e4b1f13b2f1598 并核对本地同步。#18 在此后才开始，总 PR #20 保持草稿；完整 `.app`/codesign/DMG 双架构结果与本地 SDK health 证明继续分开记录。

## 阶段 3 交叉验收进度

- #14、#16、#17 已逐项评论并关闭，#12 保持开放并追加阶段摘要；刷新后的 #18 仍开放且无评论。阶段 3 从 b0bdc337 固定点开始，同 Host 监控生命周期与日常启动验收按文件归属并行，Git 操作由主线程串行。
- 内置浏览器在阶段 2 精确干净候选上再次验证原生设置、真实 Agent reasoning、中心判断和可见状态：逐轮语义告警后，401、503、200ms 超时分别显示具体原因。重新取得有效判断只改变引擎可用性，不为代理记录恢复；正文和正常 stop 后才更新恢复时间。原请求未取消、无恢复弹窗，默认 journal154条只含元数据，未含 fake 密钥或会话片段。临时 Host 退出0并清理；实际 OS 显示仍暂缓。
- 浏览器操作、截图与完整记录见 `/private/tmp/jev-stage3-browser-notes.md`；最终恢复截图 `/private/tmp/jev-browser-final-agent-recovered.jpg`。76 个运行时文件的 SHA256 已保存，阶段 3 最终候选需核对这些产品字节一致，受改行为必须复验。
- 最新 PR21 远端 Owner verify/Matt 已成功；双架构 macOS run37698543437 仍运行，尚不记为完整打包通过。阶段 3 完整门禁、双轴审查、复盘及集成尚未完成。
- T06 同 Host 五组公开验收全部通过：主/子代理所选 quick 与另一个消费插件 full 并行；监控在途修改、停用、删除及原200ms截止；准确错误与引擎重新可用；未知/失败不恢复代理；故障期间无输出及真实子代理错误仍告警，主请求继续完成。正式 npm 受影响两监控文件50/50、退出0，无取消或跳过；没有产品 runtime 缺口，只补公共交叉回归。笔记 `/private/tmp/jev-stage3-t06-notes.md`。
- 真实无参数日常入口的隔离验收1/1、退出0：公开 Loader 中两观察插件实际激活，JEV/monitor HTTP均200，Owner/Web健康就绪、正常终止退出0，保留原45s/30s期限。context与cost-meter使用固定原样产物并激活；visualize明确因缺少React peer跳过；billion-context在该隔离实例故意不提供固定产物，安装禁止边界返回77，明确跳过而其余继续。未安装依赖、修改第三方或当前用户服务；这些隔离结果不能替代用户当前实例的插件状态。测试探针404与编译擦除enum的读取错误已修复，不归因于产品。笔记 `/private/tmp/jev-stage3-daily-notes.md`。
