## 父项

[DSH启动器Flutter迁移与MacLauncher SDK接入](https://github.com/Ghost233/DSH-Workflow/issues/1)

## 要构建什么

交付仅支持 macOS ARM64 的可移动独立应用/DMG，移除项目维护的其他平台入口、运行兼容分支与所有非 macOS ARM64 CI job，验证当前分发、默认SDK/public窗口/Entry和保留模块，并形成完整28故事矩阵。

对应父Spec用户故事：1、2、5、9、10、11、20、23、26、27、28。本票沿用既有编号，不生成新工单。

## 当前范围与证据规则

本票沿用父Spec的ARM64-only当前范围。旧自研机制及其运行/健康承诺已删除；JEV中心和DSH原生监控迁出为独立自研模块，官方DSH/SDK/第三方来源保持原样。复验使用真实DSH就绪、运行实例和保留模块装配，不能仅删掉旧检查就声称ready。

既有勾选仅保留已取得证据的原候选/架构/工具范围，不自动覆盖当前迁移后的输入。原始历史结果不重标，正式issue状态与受影响子项的当前状态分开；无变化部分仅在实际输入/环境相同且证据充分时复用。

## 正式状态与实际证据

正式状态 OPEN。此前完整 Release run37836123095 已成功，产品260fdbb与验证器3804401的原来源及原始失败均保留。2026-10-09新增仅macOS ARM64平台收敛由本票承接，PR #24 承接当前平台与 Matt 派生版清理；新 Matt 物料仍待本地完整必需检查、审查、当前产物 CI 与最终同步，不冒称旧结果覆盖新输入。

## 验收标准

- [ ] ARM64统一工具链、官方SDK锁定、格式、零诊断分析、适用完整自研测试/客户端构建检查均有最终源码与真实退出证据。
- [ ] ARM64 Flutter Release、独立Node24.12.0、官方Desktop与项目保留资源在实际包内齐全，不依赖checkout或系统业务依赖；不构建已取消架构。
- [ ] ARM64签名、非空DMG、真实hdiutil校验及包内可执行架构/版本通过，产物绑定最终候选。
- [ ] 移动应用后验证真实Host、前端、DOCX/XLSX/PPTX转换、Matt派生面板及独立JEV/原生监控装配。
- [ ] 当前源码、包内、注册/导出/profile、客户端/预设、CI/测试及当前说明不存在被删除系统的运行入口或依赖；不删除用户历史/配置。
- [ ] 独立模块从新目录加载，固定ID/配置/凭据兼容；原生设置/插件入口、代表性命名调用和原生主/子代理观察保持可用且只检测/记录/通知。
- [ ] 实际未修改Release应用通过默认用户级SDK发现、正式服务能力、公开关闭准确存活管理窗口、同SDK响应、SDK窗口恢复和关联Entry同实例；actor编译/dry/初始化失败不算UI成功。
- [ ] 同一SHA的ARM64 producer、artifact、DMG、移位应用和新main CI均有对应成功证据；原branch/其他SHA不替代新main。
- [ ] 形成全部28故事/当前删除与保留子项矩阵，链接既有票、冻结命令、源码/产物/工具链和原始结果；失败、未执行、未知、取消如实区分。

## 当前受影响子项

- [ ] 维护版 Matt 的 Windows/Linux 实现、路径/命令/错误兼容、安装与发布提示及当前说明全部清理；导出/注册/专用测试完整核对，规范构建重建生成 JS、开发产物与 package/lib，macOS 功能不退化。
- [ ] 本地开发/编译/测试入口限制 macOS ARM64；负面拒绝测试、普通窗口变量、第三方锁元数据和历史证据按明确边界保留。

- [ ] 仅 macOS ARM64：无其他平台的项目启动入口、构建目标、运行兼容回退或 CI runner；所有 job 实际核对 Darwin/arm64，工程测试保留，Linux sandbox 准备删除。官方上游不修改，历史结果保留真实来源。

- [ ] Desktop四行为、默认false持久偏好、物理最终隐藏/ready/原焦点、保存重启、已有窗口保留和显式找回继续纳入受影响故事；ARM64真正受影响路径取得实际证据。
- [ ] 关闭票的具体输入变化子项在本票矩阵补验；功能回归需对应票继续实现时再重开，不泛化撤销全部历史成功。

## 固定验证入口与证据

- `engineering`：在 `macos-launcher/flutter` 执行 `bash check.sh`。锁定解析/格式/零诊断/Flutter适用完整测试；必须对应最终输入。
- `matt-engineering`：在 `repo root` 以固定 Node 24.12.0 执行 `npm ci --prefix matt-skills-panel-plugin --ignore-scripts --no-audit --no-fund`、`npm run build --prefix matt-skills-panel-plugin`、`npm test --prefix matt-skills-panel-plugin`；在 Matt 根执行 `node scripts/build.mjs --dev-only`，并执行 `npm test --prefix matt-skills-panel-plugin/packages/dsh-log`。锁文件、生成 JS、开发产物与 package/lib 均绑定最终输入。
- `project-tests`：在 `repo root` 执行 `node scripts/run-project-tests.mjs`。剩余自研观察模块与项目集成；由源码writer封存实际测试清单。
- `client-check`：在 `repo root` 执行 `node agent-observation-plugin/scripts/build-client.mjs --check`。独立客户端构建一致性。
- `T09`：在 `macos-launcher/flutter` 执行 `dart run tool/release_distribution_probe.dart --release "$VALIDATION_RELEASE_APP"`。真实当前SHA ARM64 producer的未修改/moved Release；正式no-AUT actor输入由workflow生成，默认用户SDK保护/公开关闭/恢复/Entry。
- `jev-monitor-migration`：真实Host公开配置/凭据/命名调用/原生Agent事件及pluginManager装配；具体高层命令由writer封存后绑定，不发明新API/server。

占位变量必须在执行前冻结为实际ARM64应用/只读runtime/Release路径与完整SHA，连同命令、工具链、退出码及原始输出记录；占位草稿不是已执行证据。系统/默认SDK/外部焦点仅在已授权干净runner，禁止本地伪造CI环境绕过隔离守卫。健康来源迁移时沿用现成公开DSH观察，不新增服务架构。

## 被什么阻塞

- [T03：通过 SDK 和管理窗口观察真实状态与实例日志](https://github.com/Ghost233/DSH-Workflow/issues/4)。
- [T04：在并发、断连与退出中正确结算 Web 生命周期](https://github.com/Ghost233/DSH-Workflow/issues/5)。
- [T05：保留既有配置并通过管理窗口设置访问与权限](https://github.com/Ghost233/DSH-Workflow/issues/6)。
- [T06：接管入口并在管理端断线后归还原生入口](https://github.com/Ghost233/DSH-Workflow/issues/7)。
- [T07：通过管理窗口管理登录启动与稳定版更新](https://github.com/Ghost233/DSH-Workflow/issues/8)。
- [T08：从管理窗口查看和更新插件并明确重新加载](https://github.com/Ghost233/DSH-Workflow/issues/9)。
