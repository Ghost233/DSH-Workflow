# 2026-11-06 依赖更新

本轮以 `main` 的 `40e10e601c147b2e49e5a0869e5630a68f7ad125` 为源码基线，保留此前加入 Worktree 插件和共享客户端模块检查的改动。应用版本保持 0.6.3，DSH 保持 0.2.2-rc.1。更新仅用于隔离候选，未安装 App、切换现有服务、提交、推送或发布。

## 版本与来源

本轮 npm 查询时间为 2026-11-06 02:55（北京时间），GitHub 查询约为 02:56。每项的精确时间和原始元数据保存在证据目录。查询沿用现有发布渠道；npm 包通过 OrbStack 容器执行真实 `npm view`。GitHub 身份及 Git 实际凭据均核验为 Ghost233。

| 组件与渠道 | 原版本或提交 | 所查最新候选 | 本轮采用与兼容结论 |
| --- | --- | --- | --- |
| [DSH](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1)，npm `next` | 0.2.2-rc.1 | 0.2.2-rc.1 | 保持；候选 Host 和完整测试验证 |
| [上下文洞察](https://github.com/bowenliang123/dsh-context)，npm `latest` | 0.81.2 | 0.82.0 | 升级；声明、真实加载和界面验证 |
| [费用](https://github.com/Han-1413141/dsh-cost-meter)，npm `latest` | 1.9.58 | 1.9.58 | 无新版；真实加载和设置页验证 |
| [可视化](https://github.com/Nagi-ovo/dsh-visualize)，npm `latest` | 0.1.7 | 0.1.7 | 无新版；真实加载和设置页验证 |
| [通知](https://github.com/GooDAnDReaDY/dsh-plugin-notify)，npm `latest` | 0.4.8 | 0.4.8 | 无新版；真实加载，未触发模型完成通知 |
| [侧边栏](https://github.com/omdsh-dev/DSH-better-sidebar)，npm `latest` | 0.30.1 | 0.30.1 | 无新版；真实加载、设置和侧栏验证 |
| [Sentinel](https://github.com/Ghost233/GhostAgentSentinel/commit/5deeaa49cfc9f2fffe793eb2afb8e483c9ffd47c)，Git `main` | 0.2.4 / `5deeaa49` | 同版本、同提交 | 保持；设置和全局总览验证，未调用分析模型 |
| [模型提供商](https://github.com/DDDMUC/dsh-provider-hub)，npm `latest` | 0.4.3 | 0.4.3 | 无新版；真实加载和模型设置页验证 |
| [Skill / MCP](https://github.com/Fishquito7/dsh-skill-mcp-panel)，npm `latest` | 2.3.7 | 2.3.7 | 无新版；真实加载、技能和 MCP 页面验证 |
| [流式折叠](https://github.com/rezon-aki/dsh-streamfold)，npm `latest` | 0.7.12 | 0.7.12 | 无新版；真实加载和设置页验证 |
| [Worktree](https://github.com/zhang-guo-wen/dsh-worktree)，npm `latest` | 2.4.0 | 2.4.0 | 保持此前新增项；新会话入口、文件备份设置、Git 账号和变更记录页验证 |
| [自动化任务](https://github.com/T-Auto/dsh-ops)，npm `latest` | 0.4.4，未设日常启动 | 0.4.4 | 无新版；保持未启用，仅核对声明，界面入口不代表此包已加载 |
| [Live Compact](https://github.com/MerkyorLynn/dsh-live-compact/commit/c50c58b00cf8545c6524272563f99bc7f2779384)，Git `HEAD` | 1.0.7 / `866a9db7` | 1.0.7 / `c50c58b0` | 更新提交，保持未启用；声明兼容，未运行压缩任务 |
| [Matt 派生面板](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck/tree/0e957cf46dbacdef8c1bcc119189e38e1080d956)，npm `beta` | 1.9.0-beta.33.workflow.1 | 发布版 1.9.0-beta.33 | 保持派生源码和基准；设置、展开面板与右侧页验证 |
| [Browser Harness](https://github.com/browser-use/browser-harness/compare/b5202aefe2cff511208d5303e09670b5740c99f9...be26283ee9c3dd089aefa70ffb04cf71dc6f59e1)，Git `main` | 0.1.13 / `b5202aef` | 0.1.13 / `be26283e` | 更新子模块提交；所选交付文件字节不变，包体和摘要验证 |
| [Superagent](https://github.com/Ghost233/dsh-superagent-prototype/commit/8c32a9dc5d72c033816c6a8110b37f40cf94fba4)，Git `ghost` | 0.1.0 / `8c32a9dc` | 同版本、同提交 | 保持；原仓 `main` 也指向此提交，候选包体验证 |
| [中文 Matt 技能](https://github.com/Ghost233/ghost-agent-market/tree/cd29de78be377945ec163da4ca4516fd95e20300/codex-market/plugins/mattpocock-skills-zh) | 0.1.8+codex.20261027155632 | 所选内容树未变 | 保持版本和既有基准，候选技能可见 |
| [DSH 技能](https://github.com/Ghost233/ghost-agent-market/tree/cd29de78be377945ec163da4ca4516fd95e20300/dsh-market/skills) | 0.1.6 | 所选内容树未变 | 保持版本和既有基准 |
| [飞书 CLI](https://github.com/larksuite/cli/releases/tag/v1.0.99)，正式发布 | 1.0.99 | 1.0.99 | 无新版；来源记录未改，未做真实飞书消息端到端验证 |
| Matt 依赖 `dsh-log` / `dsh-plugin-update`，npm `latest` | 0.4.1 / 0.18.39 | 0.4.1 / 0.18.39 | 无新版，保持 |
| [归档管理器](https://github.com/MichengAI/dsh-archive-manager)，另一会话追加 | 未安装 | 1.2.8 | 保留另一会话新增的启动项，纳入最终组合复验 |

DSH 官方标签核验为完整提交 `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`。主线 `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` 不属于本轮采用的发布渠道。Matt 主线 `4b0c5596972f47f1e03377bd1752e44a12076782` 已标为 beta.34，npm `beta` 仍为 beta.33，因此未合并派生版源码。

本轮采用的完整提交：上下文洞察 npm `gitHead` 为 `addc2d125ab1ecccfda0bc098f51fddd3cc51625`；Live Compact 为 `c50c58b00cf8545c6524272563f99bc7f2779384`；Browser Harness 为 `be26283ee9c3dd089aefa70ffb04cf71dc6f59e1`。归档管理器的 npm `gitHead` 为 `0663b5efc4bbe94e5d98cf3e8b266396f8f23950`。npm 未提供 `gitHead` 的既有包继续以精确版本、`dist.integrity` 和候选包体摘要核验。

技能市场主线为 `cd29de78be377945ec163da4ca4516fd95e20300`。中文 Matt 技能内容树仍为 `63525b68a74d00856e4e4d07b9ed5303b9169e78`；DSH 技能内容树仍为 `4185062e37eae1ae45a56e5dd8584a3bebc7be28`。既有 `vendor/*.upstream.json` 均保留。

## 固定输入与候选

OrbStack 查询容器使用 Node 24.12.0 ARM64，镜像固定为 `sha256:7326fb2dbdce998edd72140946851be64ef4a643e8715e138ca467e8e9d92c99`。核验的 Docker context 为 `orbstack`，服务端为 OrbStack；Docker 29.8.2、Compose 5.5.0。锁文件由脚本读取容器内实际 npm 元数据及精确 Git 提交元数据生成。

本轮最初完成的 10 插件组合清单 SHA-256 为 `4bdba3d85e0ebd37f5058e0d8426788144195f4a80d2268e5eb39ab18fea3d23`。对应候选为 `.build/Ghost DSH Station-0.6.3-dsh0.2.2-rc.1-arm64-deps-20261106.app`。项目测试 406 项、Flutter 测试 93 项均在该组合通过，真实 Host 报告 10 个启动插件全部加载。

用户随后要求与[“评估适用的 DSH 插件”会话](codex://threads/01a1aa3e-bf16-70a0-8e60-dc174fcde9a9)沟通。该会话新增归档管理器，用户明确要求保留其改动。两边已协调：该会话负责归档插件专项验证，本会话负责最终组合的完整门禁。

最终组合候选为 `.build/Ghost DSH Station-0.6.3-dsh0.2.2-rc.1-arm64-archive-20261106.app`。11 个启动插件的包体、生产依赖和来源摘要，以及项目交付层、Superagent、Browser Harness 技能和 App 签名均已复验。最终清单 SHA-256 为 `57ad5f9dd30b1b9d170a29a45f6553f5acf5a8404fec8f10055f158be3e5722c`；锁文件 SHA-256 为 `8df0e2367b6a5f79257cffddb4dd3133f60643598d48dfa99b5cf21ef020ca52`。

## 本地验证

完整项目测试使用随包 Node 24.12.0 的无空格路径副本，隔离测试依赖按锁文件安装。命令为 `DSH_TEST_RUNTIME_ROOT=<隔离依赖> DSH_SERVICE_TEST_RESOURCES=<候选 Resources> <Node> scripts/run-project-tests.mjs`。Flutter 使用仓库指定的 3.47.7 SDK、随包 Node、临时 Web 端口，执行 `flutter test --no-pub --concurrency=1`。

最终 11 插件组合的完整项目门禁为 406 项通过、0 项跳过，退出码 0。完整 Flutter 验收为 93 项全部通过，退出码 0。10 插件组合的成功记录单独保留，不代替最终组合验收。

发布脚本回归 `python3 -B scripts/test_release.py` 为 27 项通过，退出码 0。自研客户端产物 `build-client.mjs --check` 和启动脚本语法检查退出码均为 0。Flutter 锁文件校验通过；格式检查覆盖 71 个文件，0 个变化。

原中文路径的 `flutter analyze --no-pub` 可重复报 `FormatException: Unexpected end of input`，退出码 255。Flutter 工具以 `message.length` 填写 LSP 的 `Content-Length`，工作区名称含非 ASCII 字符时长度不符。在纯英文路径复制 101 个分析输入文件，逐文件 SHA-256 与原目录相同；使用同一锁文件准备环境后，分析结果为 `No issues found`，退出码 0。未修改 Flutter SDK 或项目源码。

本轮最初的完整项目测试发现 Browser Harness 预期提交仍为旧值，以及 Worktree 加入后启动数量仍为 9。只更新这些输入预期，保留业务断言，定点通过后完整复验。另一会话加入归档管理器后，继续用旧候选执行当前清单，完整性门禁正确拒绝并报 `Plugin delivery input mismatch: project-plugins.json`；该次不计通过，随后改用匹配最终输入的候选。

## 界面和边界

独立 HOME/profile 中实际打开模型、内置插件、Matt、Agent 预设、费用、文件备份、流式折叠、Sentinel、可视化和侧边卡片设置。技能、MCP、自动化任务、上下文洞察、Git 账号页面，以及 Matt、Sentinel 和变更记录侧栏也已打开。设置页和新会话显示 Worktree 控件，未更改用户真实账号或发送模型任务。

Worktree 的多子模块建分支、并行开发及归档回收尚未做端到端验收。Live Compact 和 `dsh-ops` 继续保持未设日常启动，只核对声明，不宣称实际加载。自动化任务页面可见，也不据此推定未启用的同名包已加载。

归档管理器专项结果由另一会话提供：11 个插件全部实际加载，“已归档”和“未归档”页面可打开，预置工作区仍显示，并成功创建第二个隔离工作区。原生接口归档测试会话后，“已归档”列表显示条目；点击插件的“恢复”后条目消失，持久化记录确认会话仍属于原工作区。空白测试会话未出现在“未归档”列表，不把这项列表展示记为通过。该会话的隔离 Host 和浏览器已清理。

## 清理与工作区

本会话创建的隔离 Host 经控制接口确认无活动工作后正常停止，Chrome 经 CDP 正常关闭。UI 管理脚本的 stdin 已关闭，无法用原等待方式退出；在 Host 正常停止后，仅向该空闲脚本发送 SIGTERM，退出码 143。记录的 Host、Sentinel 和管理脚本 PID 均已核实退出。专属 Docker 网络已清理，未触碰其他项目容器。候选、查询元数据和测试日志保留供复核。

此前 `scripts/project-plugins.mjs` 与对应测试的内容保留；本轮未改 DSH 或其他第三方源码。Browser Harness 子模块指针已暂存，保持 Git 索引与候选固定输入一致。其余修改及新增报告留在工作区，未提交。

交付前核对本地 `main`、`origin/main` 和实际远端 `main`，三者均为 `40e10e601c147b2e49e5a0869e5630a68f7ad125`，当前分支未落后。4 个子模块源码目录均干净。最终测试后只更新了文档，产品输入未再变化。

原始证据目录为 `.build/dependency-update-20261106-gcx__mug/`；归档管理器专项证据由另一会话保存在 `/private/tmp/dsh-archive-20261106/`。主要文件包括 `before.json`、`npm-metadata.json`、`github-inventory.json`、`combined-candidate-verification.json`、`project-tests-combined.log`、`flutter-tests-combined.log`、`flutter-analysis-inputs.json` 和 `cleanup.json`。首次沙箱内 GitHub 认证无法读取钥匙串，在允许访问钥匙串后重新核验成功；未把查询失败记为无新版。
