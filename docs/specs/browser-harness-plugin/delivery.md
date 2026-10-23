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
| Flutter 全套隔离 Host 验收 | 81 项通过，退出码 0；使用当前项目层和既有固定生产运行时 |
| 上游真实技能查询 | fixed 和 latest 同为固定提交，changed 为空；没有推进子模块 |

完整测试日志保留在忽略目录 `.build/browser-harness-delivery/`。正式候选的提交、审查报告和最终门禁结果在完成后补入。

初次在沙箱内运行完整测试时，macOS 文件监听返回 `EMFILE`，导致现有恢复用例失败；该次运行已取消，不计通过。相同定点用例在正常 macOS 环境全部通过，随后完整门禁也通过。一次从错误工作目录启动的 Flutter 分析已停止，不计通过；正确子目录分析结果另行记录。

## 完成前检查清单

- Flutter 全套验收和最终 Node 门禁已完成。
- 对已提交候选执行 Standards 与 Spec 双轴审查，关闭确认的 P0、P1 和 P2。
- 记录最终源码、子模块 hash、本地分支与远端分支状态。
- 本次交付不正式发布、不更新正在运行的应用。
