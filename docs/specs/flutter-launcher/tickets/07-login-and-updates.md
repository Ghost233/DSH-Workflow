## 父项

[DSH启动器Flutter迁移与MacLauncher SDK接入](https://github.com/Ghost233/DSH-Workflow/issues/1)

## 要构建什么

系统登录项与稳定版更新保持真实结果；常规/登录启动遵循隐藏偏好且不隐藏已有Desktop。

对应父Spec用户故事：5、9、10、11、20、23、24、26、28。本票沿用既有编号，不生成新工单。

## 当前范围与证据规则

本票沿用父Spec的ARM64-only当前范围。旧自研机制及其运行/健康承诺已删除；JEV中心和DSH原生监控迁出为独立自研模块，官方DSH/SDK/第三方来源保持原样。复验使用真实DSH就绪、运行实例和保留模块装配，不能仅删掉旧检查就声称ready。

既有勾选仅保留已取得证据的原候选/架构/工具范围，不自动覆盖当前迁移后的输入。原始历史结果不重标，正式issue状态与受影响子项的当前状态分开；无变化部分仅在实际输入/环境相同且证据充分时复用。

## 正式状态与实际证据

正式状态OPEN。最近Native run的T07成功保留其实际系统/更新范围；启动窗口偏好子项和最终ARM64候选的系统边界继续按实际证据收尾，不能因一个job成功把整Spec改为通过。

## 验收标准

- [x] 管理窗口的登录启动选择与 macOS 实际注册、取消注册结果一致，准确呈现未注册、已启用及需要系统批准等状态。
- [x] 系统拒绝或不支持时显示真实结果，不虚报已启用；系统批准场景记录所用隔离环境与实际观察，不替用户授予权限。
- [x] 更新查询仅选择本项目适用且比已安装版本新的稳定 macos-v 发行，排除草稿、预发布、无效或不匹配标签。
- [x] 覆盖数字主版本/次版本排序、无更新、空列表和请求失败；管理窗口结果与发行响应及已安装版本一致。
- [x] 发现更新后打开正确的本项目发行页面，操作不会自动下载替换当前应用或将 main 构建产物冒充正式发行。
- [x] 在独立应用管理窗口与实际原生登录项边界验收，冻结并记录候选、验证命令与执行证据；使用受控发行响应补充边界场景。

## 当前受影响子项

- [ ] 登录/常规启动遵循持久隐藏偏好，缺值false；已有Desktop保留原窗口状态，显式打开仍显示/聚焦。
- [ ] 保持系统实际注册/取消/批准状态和ARM64稳定版发布筛选，当前有效候选的系统边界按实际记录；未观测批准/拒绝不虚称已出现，受控Widget补充不替代OS观测。

## 固定验证入口与证据

- `engineering`：在 `macos-launcher/flutter` 执行 `bash check.sh`。锁定解析/格式/零诊断/Flutter适用完整测试；必须对应最终输入。
- `T07`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --updates --system-ci`。干净ARM64系统登录项与稳定更新，条件结果如实记录。

- `T05-window-restart`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --desktop-window-restart "$VALIDATION_SAVED_PROFILE_ROOT"`。使用上一实际window-show场景保存的同一私有profile，验证冷隐藏偏好和保留已有可见Desktop的两phase；路径执行前冻结。

占位变量必须在执行前冻结为实际ARM64应用/只读runtime/Release路径与完整SHA，连同命令、工具链、退出码及原始输出记录；占位草稿不是已执行证据。系统/默认SDK/外部焦点仅在已授权干净runner，禁止本地伪造CI环境绕过隔离守卫。健康来源迁移时沿用现成公开DSH观察，不新增服务架构。

## 被什么阻塞

- [T01：独立启动与SDK窗口](https://github.com/Ghost233/DSH-Workflow/issues/2)。
