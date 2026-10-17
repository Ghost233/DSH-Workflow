# 阶段 1：独立服务启动与观察

范围为 [S01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26)。实现提交：`aae8b1b1fbbb89b7d1e47914cb831b70f58730da`，阶段基准：`e9748ebb468aea0adb93148c1a78218857ca3133`。

本阶段打通启动器、正式 MacLauncher SDK、本机控制接口和真实 Host。管理端退出重开后发现同一业务租约，保留既有 `desktop` 服务标识，显示名称改为“DSH 服务”。服务停止和重启尚未对外声明可用，桌面接入、Web 独立生命周期和其他后续工单不在本阶段的完成范围内。

## 行为与证据

- 正式公开接口红色测试：`03-red-desktop-start` 返回 start not supported，实际退出 1。早先使用新 service 标识的失败只保留为接口探索记录。
- 正式 SDK 绿色测试：启动真实 Host，并在管理端退出重开后观察相同实例。Host 标识直接采用插件发布的租约，检查 PID、地址和官方认证后的真实插件状态。
- UI 和原生验收：`36-native-final-service` 通过真实语义按钮、正式 SDK、实际进程身份和私有记录证明完整路径，实际退出 0。最终 Host PID 为 83419、manager PID 为 83388，租约为 `478a1aaa-9ffc-4e9e-a224-52339be9aef3`；截图和 JSON 位于 `.build/independent-dsh-server/s01/native-final/`。
- 登录 shell：复用固定上游的纯模块，单独打入项目资源。真实 Host 的 MCP 子进程验证原有工具路径及环境恢复，保留启动器拥有的环境值。
- 权限更新：保持同一 manager，下一次明确启动时消费当前权限选择；28 红、29 绿证明实际 Host 的权限发生改变。提示改为下次启动 DSH 服务时生效。
- 并发和旧实例：重复与并发请求保持一个业务 Host；已有旧实例时明确报告冲突，不结束或替换旧 Host。

## 最终本地检查

| 入口 | 实际结果 | 证据 |
| --- | --- | --- |
| 固定 Node 24.12.0 下的根项目完整测试 | 217 通过、0 失败、0 跳过，退出 0 | `33-root-final-tests` |
| Flutter 3.47.7 统一检查入口 | 59 通过，格式无变更、分析无问题，退出 0 | `34-flutter-frozen-check` |
| 最终 Debug 应用构建 | 退出 0 | `35-debug-final-build` |
| 真实窗口和 SDK 的独立服务验收 | 退出 0，自有 manager 和 Host 已回收 | `36-native-final-service` |

上述记录位于 `.build/independent-dsh-server/s01/`。18 个实现文件的内容与提交、实现 worktree 和主验证 checkout 逐一相同；34、35、36 记录了验前和验后的逐文件摘要。最终清单为 `final-source-manifest.json`。

用户另行指定工具链统一为 Flutter 3.47.7。当前 CI 固定值与说明同步更新，历史验证记录保持原版本。CI 在实际 Wrapper 构建后明确提供冻结资源运行 SDK 验收，缺少资源时失败，不用默认跳过替代该检查。相关 YAML 解析、20 项 Debug artifact 边界测试、3 项 ARM64 CI 配置测试及 11 项输入判定测试已通过。

## 结果限制与后续门禁

- `32-flutter-final-check` 虽然业务断言通过，但输入绑定未证实，未计作最终通过；34 的完整逐文件证据用于最终检查。
- 原生 fixture 中未创建的隔离 HOME 导致官方 shell reader 回退继承环境。该场景只证明 UI 和实例生命周期；正向 shell 恢复由另一个具有隔离 HOME 的真实 MCP 场景证明。
- 最小旧产物预检中的 Host 自然退出未证实，仍由 S04 跟踪。测试回收不能代替服务正常停止验收。
- 当前本地结果不代替阶段首审、复盘、复审和实际生产 Wrapper 构建；远端阶段 PR 通过并集成前不关闭 S01。

当前审查、有效作业与下一动作以交付入口及 `.build/independent-dsh-server/controller-state.json` 为准，不把本阶段结果扩展为完整规格已经完成。
