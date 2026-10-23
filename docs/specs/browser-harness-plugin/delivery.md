# Browser Harness 内部插件交付记录

## 范围与候选

基准为 main 上的 `19cad95ef6714a33ccf034f987d859c4fdfcfbac`。交付范围见[规格](spec.md)。实现维护主仓库，官方 Browser Harness 子模块固定为 `c6a941287424f32e2d20c7b7b892c8493f46808d`，没有修改其源码、安装软件或切换现有 DSH 服务。

内部插件版本为 `0.1.0`。技能通过项目加载入口提供，官方资料由正常项目资源封装流程复制并记录 SHA-256。版本查询通过认证的 DSH Remote 和实际默认 Shell 执行；启动器只使用这份证据，不探测自己的 PATH 作为替代。

## 验证记录

验证环境为 macOS ARM64。Node 项目测试使用本机 Node `v26.9.0`；Flutter 实机隔离验收使用已有应用固定的 Node `v24.12.0` 和当前源码项目层。

| 命令或验证入口 | 当前结果 |
| --- | --- |
| `node scripts/run-project-tests.mjs` | 正常 macOS 环境通过 305 项，零失败、零跳过，退出码 0 |
| 真实 Host 装配与搬迁测试 | 已通过，技能唯一可见、独立插件版本为 0.1.0、认证 Remote 查询成功、搬迁后官方资料字节保持一致 |
| `node agent-observation-plugin/scripts/build-client.mjs --check` | 退出码 0 |
| `python3 -B scripts/test_release.py` | 23 项通过，退出码 0 |
| Dart 格式检查 | 66 个文件通过，退出码 0 |
| `flutter analyze --no-pub`（Flutter 子目录） | 无问题，退出码 0 |
| `flutter test --no-pub test/launcher_ui_test.dart` | 3 项通过，退出码 0，包含新增安装状态及最小窗口布局 |
| Flutter 全套隔离 Host 验收 | 首审和修复后各 81 项通过，退出码均为 0；使用当前项目层和既有固定生产运行时 |
| 上游真实技能查询 | fixed 和 latest 同为固定提交，changed 为空；没有推进子模块 |

完整测试日志保留在忽略目录 `.build/browser-harness-delivery/`。首个已提交候选为 `fdd27121b94a16248c9daf102bae2b47fd131d6c`，修复候选为 `207ab35e2c6e9af4ffd79864b9f466c2b31b908e`。[双轴审查](review.md)确认 Spec 0 发现，Standards 唯一的 P2 已关闭；没有剩余 P0、P1 或 P2。后续提交只补交付证据，不改变产品实现。

初次在沙箱内运行完整测试时，macOS 文件监听返回 `EMFILE`，导致现有恢复用例失败；该次运行已取消，不计通过。相同定点用例在正常 macOS 环境全部通过，随后完整门禁也通过。一次从错误工作目录启动的 Flutter 分析已停止，不计通过；正确子目录分析结果另行记录。

## 最终产物与分支

首份候选 App 已实际构建、签名并验证，包含 21 份固定官方资料、独立插件版本及真实的未验证状态。最终源码按 `.build/Ghost DSH Station-0.4.1-dsh0.2.1-rc.2-arm64-browser-harness-reviewed.app` 构建与核验，日志和摘要保留在 `.build/browser-harness-delivery/`。

完成核验包括包内项目层与当前源码一致、技能摘要通过、插件固定版本正确，以及签名验证成功。运行端未安装或升级 Browser Harness，没有启动 Chrome，也没有切换既有 DSH 服务。

本次按 implement 流程提交当前 main，不创建分支、worktree、PR 或正式发布。没有约定远程推送，origin/main 保留原提交；本地提交待用户安排推送。完成时核对 main 不落后于 origin/main，并保留完整本地候选。

## 集中复盘

本次复盘沿用 writing-for-agents 指引，核对当前会话、项目测试入口与发布工作流。可复用的执行改进是直接使用 Flutter 工程中的检查入口，避免从仓库根扩大分析范围；文件监听用例需要正常 macOS 环境，沙箱结果必须单独记录。既有检查和工作目录约定已经覆盖这些要求，无需增加代理规则文件。

审查发现的状态文案问题已在本次范围内修复。没有确认的额外环境缺陷需要扩展本次插件范围；普通 PR 不跑远端测试属于仓库明确的本地门禁、发布构建边界，本次不修改这一策略。
