# 2026-10-27 依赖更新与兼容检查

## 更新范围与固定来源

检查从 2026-10-27 13:45（Asia/Shanghai）开始。主仓起点为 `5c0571a2a7f24df6f652b6778ba624183a8488c8`，分支为 `main`，起始工作区干净。本次只更新依赖并验证，应用版本保持 0.4.7，不提交、推送、发布或切换现有服务。

| 组件与来源 | 原版本 | 所查最新版本 | 本次采用 |
| --- | --- | --- | --- |
| [dsh-context](https://github.com/bowenliang123/dsh-context) | 0.77.0 | 0.77.0 | 保持 |
| [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) | 1.9.40 | 1.9.41 | 1.9.41 |
| [dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) | 0.1.7 | 0.1.7 | 保持 |
| [billion-context](https://github.com/ranxianglei/billion-context) | 0.1.208 | 0.1.208 | 保持 |
| [dsh-plugin-notify](https://github.com/GooDAnDReaDY/dsh-plugin-notify) | 0.4.6 | 0.4.7 | 0.4.7 |
| [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 0.28.0 | 0.28.1 | 0.28.1 |
| [ghost-agent-sentinel](https://github.com/Ghost233/GhostAgentSentinel) | 0.1.8 | 0.1.8 | 保持 `1a2fc28c088f9c514cf55bb5a0536c0f523eb711` |
| [dsh-provider-hub](https://github.com/DDDMUC/dsh-provider-hub) | 0.4.1 | 0.4.1 | 保持 |
| [Our Free Model](https://github.com/Ebony-Vinyl/dsh-our-free-model) | Git 2.7.1 | Git 2.7.2 | 2.7.2，`e1b347aec9cc956eda70a766219f028a811078e2` |
| [dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel) | 2.3.5 | 2.3.5 | 保持 |
| [dsh-ops](https://github.com/T-Auto/dsh-ops) | 0.4.1 | 0.4.1 | 保持 |
| [Matt 派生版及子模块](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck) | beta.18.workflow.1 | npm beta.26 | beta.26.workflow.1，`b79bbc4c37eac8f83107bf5321e9cd421b400d2d` |
| [DSH 子模块与运行时](https://github.com/deepseek-ai/deepseek-harness) | 0.2.1-rc.3 | npm `next` 0.2.1-rc.4 | 保留 rc.3，见下方来源缺口 |
| [Browser Harness 子模块](https://github.com/browser-use/browser-harness) | `4ced8e0087d2d45ea2d08c00cb62449b2d94a90e` | 主线同一提交 | 保持，官方版本 0.1.13 |
| [Matt 中文技能](https://github.com/Ghost233/ghost-agent-market) | 0.1.6+codex.20261013165125 | 来源主线推进，目录树未变 | 保持提交 `55fcbca4cc807eea5259950f1a9e1639d9f60b4b`，目录树 `ba053df3d4a2467a34566395e570f2e7bafd937a` |
| [DSH 技能](https://github.com/Ghost233/ghost-agent-market) | 0.1.6 | 来源主线推进，目录树未变 | 保持提交 `8542fe93e62f463162bd813d393de9c713ff0b26`，目录树 `4185062e37eae1ae45a56e5dd8584a3bebc7be28` |
| [dsh-log](https://www.npmjs.com/package/dsh-log) | 0.4.1 | 0.4.1 | 保持 |
| [dsh-plugin-update](https://www.npmjs.com/package/dsh-plugin-update) | 0.18.39 | 0.18.39 | 保持 |
| 自研观测插件 | 0.1.1 | 本仓当前源码 | 保持用户启动选择 |
| 自研 Browser Harness 管理插件 | 0.1.0 | 本仓当前源码 | 保持 |

npm 元数据在独立 Apple container 内通过真实 `npm view` 查询。插件锁文件由脚本生成，核对 11 项来源、启动选择和清单 SHA-256 后才替换原文件。两个 Git 插件的元数据来自精确官方提交，未切换到同名 npm 包。完整查询、原始响应和检查时间保存在 `.build/dependency-update-20261027/`。

DSH 的 npm `next` 已发布 rc.4，但元数据没有 `gitHead`。本次查询时，官方仓库没有 rc.4 tag，主线仍声明 rc.3，无法确定与 npm 包一致的 Desktop 源码。保留 `1f81c047fc48fa190a683e469daa699857e9afe8` 和 rc.3，不猜测来源，也不宣称 rc.4 已完成兼容验证。

Matt 的 GitHub Releases 列表仍显示 beta.18，npm 已发布 beta.26。此次按 npm `gitHead` 获取官方提交，并核对源码清单版本后生成三方提案。合入范围、保留定制和回归见[Matt 升级记录](../../matt-skills-panel-plugin/UPGRADE-1.9.0-beta.26.md)。两个技能来源在 `d3bf3b0c56339bd9a08e87ab54d1daa13506809c` 的目录树均与当前固定目录一致。

## 验证边界与证据

声明检查、签名和包体检查、真实 Host 加载、界面观察分别记录。候选 App 使用未占用的输出目录和独立 HOME/profile。现有 App、服务、CLI、配置及凭据不参与改写；不执行模型任务。

Matt 首轮构建的空值类型错误、生成配置尚未同步时的测试错误和版本清单尚未同步时的身份断言均保留真实失败记录。技能文件预览的重名选择、中文译文和跨技能名单问题均先复现再修复。同一面板切换工作区后旧回包污染缓存的问题也已复现并修复；该红测记录显示执行尾部有源码变化，不作为完整门禁通过证据。定点绿测记录了稳定输入。测试和后续候选的命令、源码摘要及真实退出码保存在证据目录，缺少成功记录的检查保持未验证。

## 最终验收结果

下列检查均取得真实退出码 0，执行期间记录的源码输入未变。

| 检查 | 命令或入口 | 结果与证据 |
| --- | --- | --- |
| 项目完整测试 | `node scripts/run-project-tests.mjs`，固定 Node 24.12.0 | 308 项（307 + 包装 Host 1），`project-tests-final.json` |
| Matt 构建 | `npm run build --prefix matt-skills-panel-plugin` | 成功，`matt-build-final-retry.json` |
| Matt 全部派生测试 | `check-matt.py tests` | 72 项，`matt-tests-final.json` |
| Matt 类型检查 | `check-matt.py types` | 15 份配置，`matt-types-final.json` |
| 隔离候选构建 | 标准 `macos-launcher/build.mjs` | 成功，`candidate-build-http1.json` |
| 严格签名、包体及来源 | `codesign --verify --deep --strict`、`verifyPluginPayload`、`verifyProjectIntegration` | 11 个插件及生产依赖通过，`candidate-static-verification.json` |
| 浏览器技能 | `verifyBrowserHarnessSkills` | 21 份官方文件摘要一致 |
| 真实 Host | 独立 HOME/profile 中使用候选资源 | 11 个清单插件实际版本、解析路径和加载状态正确，Matt 宿主及工具和 Browser 管理插件活动，`host-acceptance/` |
| 界面 | 内置浏览器的临时页面 | 新版 Matt 工具栏与技能目录、Matt/Sentinel 侧栏、8 个插件设置页、Skill/MCP 及上下文页均已打开，`host-acceptance/ui-verification.json` |
| 完整 Flutter 验收 | `flutter test --no-pub --concurrency=1`，候选资源、随包 Node 无空格副本、临时端口 | 81 项，`flutter-full.json` |
| 双轴审查 | Standards / Spec 独立只读审查 | 剩余问题均为 0，`review.json` |

候选 App 为 `.build/Ghost DSH Station-0.4.7-dsh0.2.1-rc.3-arm64-deps-20261027.app`，插件交付摘要为 `d6f1e920ef9d51e499fa59fc4242a64e063e532c6265c95d90d7522dcb4b9083`。候选没有安装到本机应用目录。

首次打包读取陈旧的 npm 元数据缓存，未找到容器已确认的费用插件版本。普通元数据刷新后仍失败；随后在线预取三个更新包，并逐项核对 tarball 完整性与容器元数据一致，恢复标准打包。Git 来源的 Our Free Model 检出还曾两次触发原有 60 秒限时。仅在构建进程中改用 Git HTTP/1.1 后成功；TLS 验证、固定提交与限时均未放宽。原始失败记录全部保留，未修改第三方源码或打包入口来绕过检查。

全新 profile、升级、目录迁移及主动停用由完整项目与 Flutter 业务断言覆盖。真实 Host 还验证了桌面客户端无启动器环境时重连同一实例，关闭客户端不停止服务。`dsh-ops` 的首启迁移将测试配置重写为 YAML 并追加自身条目，原有配置值逐项保持；不宣称配置字节未变。

模型推理、所有插件操作、原生工具能力及真实 macOS 重启保持未验证。DSH rc.4 的对应源码缺口单独保留，不属于本次兼容通过结论。

界面验收页已关闭，候选 Host 正常停止，管理连接关闭。最终审计未发现本次测试进程或容器残留，三个上游子模块源码均干净。本地 main、origin/main 与实际远端 main 仍为 `5c0571a2a7f24df6f652b6778ba624183a8488c8`。本次清单、生成锁文件、Matt 子模块及派生版、回归测试和记录保留为未提交改动；未使用 stash、创建发布 tag 或切换服务。

工作期间另一个任务新增了 `docs/analysis/2026-10-27-kingsley-harness2/` 下的研究资料。本次未改动这些文件，也未将它们纳入依赖更新的审查范围；最终文件摘要另行记录，以便后续提交时区分归属。
