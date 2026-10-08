## 父项

[DSH启动器Flutter迁移与MacLauncher SDK接入](https://github.com/Ghost233/DSH-Workflow/issues/1)

## 要构建什么

UI与正式SDK启动/回收一个认证Web入口，连接同一官方Desktop，保留四种Desktop窗口动作和真实焦点恢复。

对应父Spec用户故事：5、9、10、11、12、14、20、23、26、28。本票沿用既有编号，不生成新工单。

## 当前范围与证据规则

本票沿用父Spec的ARM64-only当前范围。旧自研机制及其运行/健康承诺已删除；JEV中心和DSH原生监控迁出为独立自研模块，官方DSH/SDK/第三方来源保持原样。复验使用真实DSH就绪、运行实例和保留模块装配，不能仅删掉旧检查就声称ready。

既有勾选仅保留已取得证据的原候选/架构/工具范围，不自动覆盖当前迁移后的输入。原始历史结果不重标，正式issue状态与受影响子项的当前状态分开；无变化部分仅在实际输入/环境相同且证据充分时复用。

## 正式状态与实际证据

正式状态OPEN。最近run37756215880的arm64常规application.exit=0；额外external-sdk-cold=255，Desktop已hidden/window0但原前台未恢复。保留该失败，当前范围仍需有效ARM64焦点及新就绪来源证据。

## 验收标准

- [x] 使用预置的隔离凭据，分别从管理窗口与正式 SDK 启动 Web 访问服务，实际通过稳定端口 33080 完成认证访问。
- [x] 已有 Desktop 后端时，Web 连接同一运行实例，桌面端和浏览器共享配置、会话、工作区与插件，不新增独立 DSH 业务后端。
- [x] 缺少可用 Desktop 后端时打开官方桌面端并等待就绪；Web 未真实就绪时不报告 ready=true。
- [x] 顺序重复启动复用正在运行的 Web 访问资源，不创建重复端口或重复后端。
- [x] 从界面与 SDK 回收 Web 均释放它拥有的访问资源；启动器仍可管理，Desktop 后端及其业务仍可使用。
- [x] SDK 声明与真实回调一致：Web 支持启动、回收、状态和日志；Desktop 只支持状态，对其启动、回收和日志请求明确返回不支持。
- [x] 用真实应用、SDK 与可观察的 Web/后端资源验收，记录候选、固定验证命令和退出证据；声明原生依赖或环境缺失造成的真实失败。

## 当前受影响子项

- [ ] 使用迁移后的真实DSH就绪来源及保留模块装配，重新验证ARM64常规UI/SDK启动、认证共享与Web回收，不以被删健康接口或固定“ready”代替。
- [ ] 四行为：后台启动未运行则隐藏、已运行复用且不隐藏；启动后显示/聚焦；仅隐藏窗口业务继续；仅显示已运行窗口不隐式启动。
- [ ] 最终同一物理Desktop hidden=true/onscreen=0且Host/Web/SDKready，恢复真实原焦点；如实记录短暂window.show/activation和采样限制，不使用hidesOthers。
- [ ] 外部前台经正式SDK冷启动，当前OS输入计数、原生新读、物理身份和最终前台与真实baseline一致；未知/干扰失败、不强夺新选择，无recovery事件可合法成功。

## 固定验证入口与证据

- `engineering`：在 `macos-launcher/flutter` 执行 `bash check.sh`。锁定解析/格式/零诊断/Flutter适用完整测试；必须对应最终输入。
- `T02`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --web-runtime "$VALIDATION_RUNTIME_RESOURCES" --web-backend desktop --web-port 33080`。干净ARM64 runner，真实官方Desktop与认证共享Web。
- `T02-focus`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --desktop-window-runtime "$VALIDATION_RUNTIME_RESOURCES" --window-start sdk-hidden --web-port 33080`。干净ARM64 runner，正式SDK唯一冷触发/外部原前台/当前无干扰输入。

- `T02-window-show`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --desktop-window-runtime "$VALIDATION_RUNTIME_RESOURCES" --window-start show --web-port 33080`。真实冷显示、运行中hide/show同Host、偏好保存和显式打开；输出实际保存profile root供同profile重启。
- `T02-window-hidden`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --desktop-window-runtime "$VALIDATION_RUNTIME_RESOURCES" --window-start hidden --web-port 33080`。真实后台冷启动最终hidden/window0、ready、原焦点和原始退出；不作全程零activation承诺。

占位变量必须在执行前冻结为实际ARM64应用/只读runtime/Release路径与完整SHA，连同命令、工具链、退出码及原始输出记录；占位草稿不是已执行证据。系统/默认SDK/外部焦点仅在已授权干净runner，禁止本地伪造CI环境绕过隔离守卫。健康来源迁移时沿用现成公开DSH观察，不新增服务架构。

## 被什么阻塞

- [T01：独立启动与SDK窗口](https://github.com/Ghost233/DSH-Workflow/issues/2)。
