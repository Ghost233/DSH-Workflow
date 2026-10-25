# 2026-10-26 依赖更新与兼容检查

本次按 `update-dsh-dependencies` 执行，起点为 `8327ae9506a7672ee4f64f7e1b08edfadfccf6a9`。工作区已有插件清单改动、更新 Skill 和浏览器调研文件。更新以工作区的 11 个插件为范围，保留原有安装来源与启动选择。应用版本保持 0.4.6，不提交、推送或发布。

查询时间为 2026-10-26 01:38 起（Asia/Shanghai），最终本地验收于同日 02:24 完成。

| 组件与来源 | 原固定版本 | 所查最新版本 | 本次采用 |
| --- | --- | --- | --- |
| [dsh-context](https://github.com/bowenliang123/dsh-context) | 0.75.1 | 0.77.0 | 0.77.0 |
| [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) | 1.9.38 | 1.9.40 | 1.9.40 |
| [billion-context](https://github.com/ranxianglei/billion-context) | 0.1.206 | 0.1.208 | 0.1.208 |
| [dsh-provider-hub](https://github.com/DDDMUC/dsh-provider-hub) | 0.4.0 | 0.4.1 | 0.4.1 |
| [Our Free Model](https://github.com/Ebony-Vinyl/dsh-our-free-model) | Git v2.5.9 | Git v2.7.1 | v2.7.1，`f449bbfc46c461e6791cbf175d834ec2c5d38f12` |
| [Matt 派生面板及子模块](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck) | 1.9.0-beta.17.workflow.1 | 1.9.0-beta.18 | 1.9.0-beta.18.workflow.1，基准 `584127b1152ffdf04eeb2363b0a03d7cbdaa1bd2` |
| [dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) | 0.1.7 | 0.1.7 | 保持 |
| [dsh-plugin-notify](https://github.com/GooDAnDReaDY/dsh-plugin-notify) | 0.4.6 | 0.4.6 | 保持 |
| [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 0.28.0 | 0.28.0 | 保持 |
| [ghost-agent-sentinel](https://github.com/Ghost233/GhostAgentSentinel) | 0.1.8 | 0.1.8 | 保持，`1a2fc28c088f9c514cf55bb5a0536c0f523eb711` |
| [dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel) | 2.3.5 | 2.3.5 | 保持 |
| [dsh-ops](https://github.com/T-Auto/dsh-ops) | 0.4.1 | 0.4.1 | 保持 |

DSH 已采用的 npm `next` 仍为 0.2.1-rc.3，正式标签固定提交未变。Browser Harness 主线仍为 `4ced8e0087d2d45ea2d08c00cb62449b2d94a90e`。另外六项插件、两个技能来源目录、日志和更新器依赖均无新的对应发布版本。主线的未发布提交不替代现有发布渠道。

其他固定输入也已逐项核对：

| 输入与来源 | 原版本或提交 | 所查最新版本或提交 | 本次采用 |
| --- | --- | --- | --- |
| [DSH 子模块与运行时](https://github.com/deepseek-ai/deepseek-harness) | 0.2.1-rc.3 | `next` 0.2.1-rc.3 | 保持 `1f81c047fc48fa190a683e469daa699857e9afe8` |
| [Browser Harness 子模块](https://github.com/browser-use/browser-harness) | `4ced8e0087d2d45ea2d08c00cb62449b2d94a90e` | 主线同一提交 | 保持；21 份技能文件摘要全部一致 |
| [Matt 中文技能](https://github.com/Ghost233/ghost-agent-market) | 0.1.6+codex.20261013165125 | 来源提交 `55fcbca4cc807eea5259950f1a9e1639d9f60b4b`，目录树未变 | 保持；目录树 `ba053df3d4a2467a34566395e570f2e7bafd937a` |
| [DSH 技能](https://github.com/Ghost233/ghost-agent-market) | 0.1.6，提交 `8542fe93e62f463162bd813d393de9c713ff0b26` | 来源主线已推进，技能目录树未变 | 保持；目录树 `4185062e37eae1ae45a56e5dd8584a3bebc7be28` |
| [dsh-log](https://www.npmjs.com/package/dsh-log) | 0.4.1 | 0.4.1 | 保持 |
| [dsh-plugin-update](https://www.npmjs.com/package/dsh-plugin-update) | 0.18.39 | 0.18.39 | 保持 |
| 自研 Browser Harness 管理插件 | 0.1.0 | 本仓当前源码 | 保持，真实 Host 活动状态 |
| 自研观测插件 | 0.1.1 | 本仓当前源码 | 保持，保留用户停用选择 |

所有 npm 候选和锁定元数据通过独立 Apple container 内的真实 `npm view` 查询。Git 来源保持原官方仓库，以完整发布提交读取包清单。锁文件由脚本生成并核对清单摘要，查询或生成失败时不替换原文件。Matt 先生成三方提案，合并范围和定制保留见[升级记录](../../matt-skills-panel-plugin/UPGRADE-1.9.0-beta.18.md)。

兼容检查区分版本声明、静态入口、实际 Host 加载和界面观察。候选使用独立输出目录、HOME 和 profile；现有服务、本机 CLI、用户配置及研究文件不参与改写。详细证据保存在 `.build/dependency-update-20261026/`，缺少的运行证据保持“未验证”。

## 已观察到的组合行为

独立签名候选已完成 11 个启动插件的实际加载核对，版本和解析路径均来自候选包。Matt 宿主及工具、Browser 管理插件为活动状态。Skill / MCP 页面与 MCP 页签、上下文页面、Matt 和 Sentinel 侧边栏及现有设置页均已打开。未执行模型任务，未验证全部插件操作或原生执行能力。

`dsh-ops` 官方首启迁移会追加自身文件和 Shell 配置，并将测试 profile 的 JSON 写法重写为 YAML。逐项比较确认原有测试配置值保持不变，新增项均属于清单中的该插件；不宣称配置字节未变。技能面板的 CLI shim 也只写入独立的 npm 前缀目录。

首次 Flutter 完整验收中，启动测试将 `cordis.patch.yml` 直接按 JSON 解析而失败。测试改用候选 DSH 的官方 YAML 加载器，保留加载结果、故障隔离、用户停用、配置值比较和原有 75 秒限时。原失败记录保留，定点复验通过；最终完整结果见证据目录中的验证记录。

候选打包还曾因 Git 临时检出超过原 60 秒限时而失败。保持超时和来源不变重建后成功，未因此修改第三方代码或放宽门禁。Matt 新创建器的 macOS 路径缺口已在派生层用两个真实落盘回归闭环。

## 最终验收与工作区状态

所有下列命令的真实退出码均为 0，执行时记录了源码起点和最终工作区文件摘要；运行期间输入未变。

| 检查 | 命令或入口 | 结果与证据 |
| --- | --- | --- |
| 项目完整 Node 测试 | `node scripts/run-project-tests.mjs`，固定 Node 24.12.0 | 308 项（307 + 包装 Host 1），`project-tests-final.json` |
| Matt 派生版完整测试 | `check-matt.py tests` | 69 项，`matt-tests-verified.json` |
| Matt 类型检查 | `check-matt.py types` | 15 份配置，`matt-types-verified.json` |
| Matt 构建 | 派生版 `npm run build` | 成功，`matt-build-verified.json` |
| 独立候选 App | 标准 `macos-launcher/build.mjs` | 构建成功，`candidate-build-verified.json` |
| 包体与签名 | `verifyPluginPayload`、`codesign --verify --deep --strict` | 11 个插件本体、生产依赖、来源及摘要通过，`candidate-static-verification.json` |
| 完整 Flutter 验收 | `flutter test --no-pub --concurrency=1`，候选资源、随包 Node 无空格路径、临时端口 | 81 项，`flutter-full-verified.json` |
| 真实 Host 与 UI | 独立 HOME/profile 的候选资源验收 | 11 个清单插件实际加载，设置和侧边栏观察通过，`host-acceptance-verified/` |
| 双轴审查 | Standards / Spec 两个独立只读审查 | 剩余问题均为 0，`review.json` |
| 修改格式 | `git diff --check` | 通过 |

候选路径为 `.build/Ghost DSH Station-0.4.6-dsh0.2.1-rc.3-arm64-deps-20261026.app`。Flutter 测试修正不属于包体输入；之后通过 `verifyProjectIntegration` 确认候选仍匹配当前集成源码。模型推理、所有工具能力、原生执行及真实 macOS 重启保持未验证。

最终资源审计确认候选 Host 正常停止，管理连接关闭，本次测试进程和查询容器均无残留。原有 4 份独立 Skill / 研究文件 SHA-256 未变，原先新增的 Skill/MCP 和 dsh-ops 清单项及全部启动选择保留。三个上游子模块源码均干净。

当前分支为 `main`，本地 `main`、跟踪引用和经凭据核验读取的远端 `main` 均为 `8327ae9506a7672ee4f64f7e1b08edfadfccf6a9`，没有落后。本次依赖更新、派生版合并、回归测试和本记录保留为未提交改动；未创建备份、切换服务、安装 App 或发布版本。最终事实记录见 `final-resource-audit.json` 与 `completion.json`。
