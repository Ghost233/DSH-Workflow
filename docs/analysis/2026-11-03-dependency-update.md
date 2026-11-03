# 2026-11-03 依赖更新

本轮以 `985a8912b7288bc8e8b6269e810967baddc08728` 为源码基线，保留工作区已有的窗口和进程生命周期修改。应用版本保持 0.5.7；本轮不发布、不替换已安装 App、不切换正在运行的服务。

## 容器工作流

按用户要求，本机容器统一使用 OrbStack 的 Docker 引擎与标准 Docker Compose。维护规则、依赖更新技能、README 和六份历史报告已同步文案。历史报告保留原验收结果，现行约定统一指向 [AGENTS.md](../../AGENTS.md#本机容器工作流)。第三方源码及生成的历史构建证据不做文本替换。

本轮核验 Docker context 为 `orbstack`，服务端为 OrbStack，Docker 29.8.2、Compose 5.5.0。查询容器使用 Node 24.12.0 ARM64 镜像，固定镜像摘要 `sha256:7326fb2dbdce998edd72140946851be64ef4a643e8715e138ca467e8e9d92c99`，未挂载用户目录或 GitHub 凭据。macOS 原生编译、测试和签名继续在宿主执行。

## 固定输入

检查时间：2026-11-03 05:25–05:30 UTC。npm 包在容器中以清单指定的 `https://registry.npmjs.org/` 执行真实 `npm view`；GitHub 查询核验 Ghost233 身份，Git 读取另核验实际凭据。

| 组件与来源 | 原版本 | 所查最新候选 | 本轮采用 |
| --- | --- | --- | --- |
| [DSH](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5)，npm `next` | 0.2.1-rc.5 | 0.2.1-rc.5 | 保持 |
| [上下文洞察](https://github.com/bowenliang123/dsh-context)，npm `latest` | 0.79.0 | 0.80.2 | 0.80.2 |
| [费用](https://github.com/Han-1413141/dsh-cost-meter)，npm `latest` | 1.9.48 | 1.9.50 | 1.9.50 |
| [可视化](https://github.com/Nagi-ovo/dsh-visualize)，npm `latest` | 0.1.7 | 0.1.7 | 保持 |
| [通知](https://github.com/GooDAnDReaDY/dsh-plugin-notify)，npm `latest` | 0.4.7 | 0.4.8 | 0.4.8 |
| [侧边栏](https://github.com/omdsh-dev/DSH-better-sidebar)，npm `latest` | 0.28.2 | 0.28.2 | 保持 |
| [Sentinel](https://github.com/Ghost233/GhostAgentSentinel/commit/5deeaa49cfc9f2fffe793eb2afb8e483c9ffd47c)，Git `main` | 0.2.4 | 0.2.4，同一提交 | 保持 |
| [模型提供商](https://github.com/DDDMUC/dsh-provider-hub)，npm `latest` | 0.4.2 | 0.4.3 | 0.4.3 |
| [Skill / MCP 面板](https://github.com/Fishquito7/dsh-skill-mcp-panel)，npm `latest` | 2.3.6 | 2.3.6 | 保持 |
| [自动化任务](https://github.com/T-Auto/dsh-ops)，npm `latest` | 0.4.4 | 0.4.4 | 保持 |
| [Matt 面板](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck/tree/0e957cf46dbacdef8c1bcc119189e38e1080d956)，npm `beta` | 1.9.0-beta.33.workflow.1 | 发布版 1.9.0-beta.33 | 保持 |
| [Browser Harness](https://github.com/browser-use/browser-harness/compare/a83c0be1fe1eddd8da5d440ee4a9324910ee6f7c...6e69c7fbe97edded9934e3fb305d9af3536f941f)，Git `main` | 0.1.13 / a83c0be | 0.1.13 / 6e69c7f | 固定新提交 |
| [Superagent](https://github.com/deepseek-ai/dsh-superagent-prototype/commit/6337fc823ce20251c8de8085948165c81aaa701e)，Git `main` | 0.1.0 | 0.1.0，同一提交 | 保持 |
| [中文 Matt 技能](https://github.com/Ghost233/ghost-agent-market/tree/c7a8f9694424e61052c93e4f19d1b86ff887a017/codex-market/plugins/mattpocock-skills-zh) | 0.1.8+codex.20261027155632 | 内容树未变 | 保持 |
| [DSH 技能](https://github.com/Ghost233/ghost-agent-market/tree/c7a8f9694424e61052c93e4f19d1b86ff887a017/dsh-market/skills) | 0.1.6 | 内容树未变 | 保持 |
| [飞书 CLI](https://github.com/larksuite/cli/releases/tag/v1.0.98)，正式发布 | 1.0.90 | 1.0.98 | 1.0.98 |
| Matt 依赖 `dsh-log` / `dsh-plugin-update`，npm `latest` | 0.4.1 / 0.18.39 | 0.4.1 / 0.18.39 | 保持 |

DSH 官方 rc.5 标签核验为完整提交 `b830ec950faba0a46dda564be3e2d854afed94f1`，未切换到 `alpha`。Matt 主线 `c75af2a6a55710c44f85552ee94096a5e98f73c3` 已标为 beta.34，但 npm 尚未发布，沿用已发布 beta.33。beta.33 的 npm `gitHead` `34d26637d84febf5f977cc4008267ca0d0282310` 与当前基准 `0e957cf46dbacdef8c1bcc119189e38e1080d956` 仅发布工作流不同，插件源码一致，故无需合并派生版源码。

Browser Harness 固定为完整提交 `6e69c7fbe97edded9934e3fb305d9af3536f941f`。本轮主线变化为站点技能及维护文件，既有交付范围中的 `SKILL.md`、`install.md`、许可证和 `interaction-skills/*.md` 字节未变；不扩大交付范围。两组技能在已核实的市场主线 `c7a8f9694424e61052c93e4f19d1b86ff887a017` 中分别仍为内容树 `63525b68a74d00856e4e4d07b9ed5303b9169e78` 和 `4185062e37eae1ae45a56e5dd8584a3bebc7be28`。

插件锁文件在 Docker 容器内由脚本使用实际 npm 元数据及固定 Git 提交元数据生成，清单 SHA-256 为 `41a79c1cf56d904390a16b3f72f88c25c39fc0b8e48e6bbb1152b6f12871cf85`。飞书 CLI 的官方 v1.0.98 标签提交为 `ac81f5056ab88f37d581d25916f3dab85abfca76`，从官方 ARM64 发布包取得，压缩包 SHA-256 为 `ee4a3209bbf8b74ea5c00a07d0da89b79f5e7f6abfd518a8b2d78a7a4f7e3f40`，可执行文件 SHA-256 为 `558a4b3db4beb63ab71f2d2dbc42506846535bc1276f707764ff94809e8441a0`。

新采用的 npm 包元数据中，上下文洞察的 `gitHead` 为 `f8e576b8ddc19153b424bc73d4327892d0a5e5f7`，通知为 `90abe95d16b7f0342772a021c8b734c1968e68a8`，模型提供商为 `44a90827dad6044c822f49dfa35e0eea816a62b8`。费用包的 npm 元数据未提供 `gitHead`，以实际发布版本、`dist.integrity` 和候选交付摘要核验，不推测对应提交。完整元数据与查询时间保存在证据目录的 `dependency-inventory.json`。

## 验证记录

隔离候选为 `.build/Ghost DSH Station-0.5.7-dsh0.2.1-rc.5-arm64-deps-20261103.app`。构建退出码 0；App 的 `codesign --verify --deep --strict`、完整项目资源、Superagent 和全部 9 个启动插件包体及生产依赖摘要校验通过。DSH 与 Desktop 官方输入保持 rc.5，不修改上游源码。

- 最终 `node scripts/run-project-tests.mjs` 使用候选资源执行，387 项通过，0 项跳过，退出码 0。
- `node agent-observation-plugin/scripts/build-client.mjs --check` 退出码 0。Flutter 锁文件准备、74 份 Dart 文件格式检查和静态分析通过，退出码均为 0。
- 真实 Host 报告 9 个启动插件全部 `loaded`，实际版本与清单一致，解析路径全部来自候选包。全新 profile、旧测试链接迁移、应用目录迁移和用户主动停用由项目及 Flutter 业务断言覆盖。
- 浏览器实际打开模型、内置插件、Matt、Agent 预设、费用、Sentinel、可视化和侧边卡片设置页；打开技能、MCP、自动化任务和上下文洞察页面，以及 Matt 与 Sentinel 侧边栏。临时 HOME 中没有 GitHub/飞书账号，也未发送模型任务。
- 飞书 CLI 实际输出版本 1.0.98；事件订阅、群与成员列表、群历史消息、扫码配置、严格机器人模式、身份状态及 profile 列表共 8 个命令入口的兼容检查通过。真实飞书消息端到端验证未执行，不能据此断言线上收消息故障已修复。
- 最终完整 Flutter 验收 98 项全部通过，0 项跳过，退出码 0；使用候选随包资源、Node 24.12.0 无空格路径和临时 Web 端口，串行执行。

首次完整项目测试有 1 项 Web 就绪测试在原有 2 秒窗口内超时；当时并行执行签名校验。未修改代码、超时或断言，最小文件 6 项原样通过，之后完整 387 项原样通过。并行负载是可能原因，未将其认定为已确认根因；原始失败保留在 `project-tests.log`。

首次 Flutter 验收的 ASCII 临时镜像仍有旧插件清单，触发 `Plugin delivery input mismatch`。该轮在失败后取消，不计通过；中断时编译器出现的 `output.dill` 清理错误也保留。之后将镜像内项目交付成员与候选包逐文件对齐，核验摘要，并更新镜像中的项目装配脚本。首个失败用例通过后，7 份受影响文件的 8 项业务测试全部通过，再执行完整门禁；仓库产品代码和完整性校验未作修改。

隔离浏览器标签和 Host 正常关闭，记录的 3 个 UI 进程全部退出；取消的 Flutter 运行器及记录的子进程已退出。Docker 查询容器和专用网络已清理，保留可复用镜像，不改其他项目的容器。工作区原有修改逐文件哈希核对保持完整，README 仅新增本轮容器说明。

原始查询、构建和测试证据位于 `.build/dependency-update-20261103-rkx6xiu7/`。首次沙箱内 GitHub 认证因无法访问钥匙串而失败，重新在允许钥匙串访问的环境核验身份后，所有官方来源查询成功；首次失败输出保留在会话记录，成功复查日志保存在证据目录。
