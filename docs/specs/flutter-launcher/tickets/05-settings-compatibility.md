## 父项

[DSH启动器Flutter迁移与MacLauncher SDK接入](https://github.com/Ghost233/DSH-Workflow/issues/1)

## 要构建什么

保留应用身份、旧配置/密码，管理认证、LAN、完整权限和默认false隐藏偏好，通过正常Desktop重开验证权限实际生效。

对应父Spec用户故事：5、9、10、11、20、21、22、23、26、28。本票沿用既有编号，不生成新工单。

## 当前范围与证据规则

本票沿用父Spec的ARM64-only当前范围。旧自研机制及其运行/健康承诺已删除；JEV中心和DSH原生监控迁出为独立自研模块，官方DSH/SDK/第三方来源保持原样。复验使用真实DSH就绪、运行实例和保留模块装配，不能仅删掉旧检查就声称ready。

既有勾选仅保留已取得证据的原候选/架构/工具范围，不自动覆盖当前迁移后的输入。原始历史结果不重标，正式issue状态与受影响子项的当前状态分开；无变化部分仅在实际输入/环境相同且证据充分时复用。

## 正式状态与实际证据

正式状态OPEN。最近run37756215880的T05实际architecture.log=x86_64、application.exit=255；该架构不再维护，新的ARM64正式manager连接与完整设置仍未取得当前范围通过证据。历史失败、权限重开和正常退出标准均保留。

## 验收标准

- [x] 用隔离的迁移前数据验证应用身份、数据位置、偏好键、内网密码及旧钥匙串只读迁移兼容，原有配置和历史数据不丢失。
- [x] 管理窗口设置与修改内网密码后，认证 Web 访问使用正确密码；错误或无效输入可见，密码按既有受限存储规则保存。
- [x] 密码变更按当前应用生命周期作用到实际 Web 访问；SDK 声明、状态与日志不读取或传递内网密码。
- [x] 局域网设置保持既有认证与设置修改边界，管理窗口明确其生效时机；按提示重连 Web 后，允许与禁止的客户端行为符合所选设置。
- [ ] 完整访问权限保存并呈现真实选择，实际持久化正确且界面明确重开提示；隔离 Desktop 正常退出、重新打开后，新实例实际采用权限。
- [x] 设置操作或持久化失败如实呈现，不把失败显示成已保存，也不自动关闭用户正在使用的 Desktop 后端。
- [x] 用隔离凭据、配置和实际业务请求记录迁移及更改前后的候选、固定验证命令与原始证据，不对用户当前配置做验收性写入。
- [ ] 完整恢复场景命令退出 0，并取得 Desktop 原始正常退出/重开/权限采用证据和 Launcher 自身原始正常退出、owned Web、SDK、客户端及日志资源释放；隔离清理另外记录。

## 当前受影响子项

- [ ] ARM64完整设置先建立正式manager连接再完成密码/LAN/权限与原始正常退出；旧x86_64执行取消不取消这些功能要求。
- [ ] 默认false隐藏偏好持久化并在常规/保存profile重启后生效，已有Desktop保留窗口状态，显式打开DSH优先显示；错误如实可见。
- [ ] 正常Desktop退出/重开后，新Host实际采用保存权限；迁移不得借删除旧权限注入点丢失该能力，也不得以强制/晚到清理替代正常结果。
- [ ] JEV/原生监控迁址保留标准配置/凭据引用与用户记录，不自动删除用户现有数据。

## 固定验证入口与证据

- `engineering`：在 `macos-launcher/flutter` 执行 `bash check.sh`。锁定解析/格式/零诊断/Flutter适用完整测试；必须对应最终输入。
- `T05`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --settings-runtime "$VALIDATION_RUNTIME_RESOURCES" --web-backend desktop --web-port 33080 --legacy-keychain-ci`。干净ARM64 runner真实manager/配置/密码/LAN/权限正常重开与只读迁移。

- `T02-window-show`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --desktop-window-runtime "$VALIDATION_RUNTIME_RESOURCES" --window-start show --web-port 33080`。真实冷显示、运行中hide/show同Host、偏好保存和显式打开；输出实际保存profile root供同profile重启。
- `T05-window-restart`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --desktop-window-restart "$VALIDATION_SAVED_PROFILE_ROOT"`。使用上一实际window-show场景保存的同一私有profile，验证冷隐藏偏好和保留已有可见Desktop的两phase；路径执行前冻结。

占位变量必须在执行前冻结为实际ARM64应用/只读runtime/Release路径与完整SHA，连同命令、工具链、退出码及原始输出记录；占位草稿不是已执行证据。系统/默认SDK/外部焦点仅在已授权干净runner，禁止本地伪造CI环境绕过隔离守卫。健康来源迁移时沿用现成公开DSH观察，不新增服务架构。

## 被什么阻塞

- [T02：共享Desktop与Web](https://github.com/Ghost233/DSH-Workflow/issues/3)。
