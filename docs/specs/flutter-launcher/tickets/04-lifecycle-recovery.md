## 父项

[DSH启动器Flutter迁移与MacLauncher SDK接入](https://github.com/Ghost233/DSH-Workflow/issues/1)

## 要构建什么

Desktop失联/换实例后恢复Web；并发与启动中冲突得到准确结果，正常/重复/暂停/晚到句柄退出结算自有资源。

对应父Spec用户故事：5、13、17、18。本票沿用既有编号，不生成新工单。

## 当前范围与证据规则

本票沿用父Spec的ARM64-only当前范围。旧自研机制及其运行/健康承诺已删除；JEV中心和DSH原生监控迁出为独立自研模块，官方DSH/SDK/第三方来源保持原样。复验使用真实DSH就绪、运行实例和保留模块装配，不能仅删掉旧检查就声称ready。

既有勾选仅保留已取得证据的原候选/架构/工具范围，不自动覆盖当前迁移后的输入。原始历史结果不重标，正式issue状态与受影响子项的当前状态分开；无变化部分仅在实际输入/环境相同且证据充分时复用。

## 正式状态与实际证据

正式状态CLOSED，原并发/退出验收保留；新profile/就绪来源影响Host恢复观察，不据此泛化重跑原未变互斥与退出代码。

## 验收标准

- [x] Desktop 退出或运行实例改变后，可以从管理窗口或 SDK 重新建立 Web 连接；监督进程存活时仍能恢复连接，且不重复占用访问端口。
- [x] 界面与 SDK 共用真实的启动、回收和重连互斥边界；跨 SDK 重连保持同一业务操作的互斥。
- [x] 复现界面启动尚未取得进程句柄时的 SDK 回收冲突，得到准确的忙碌或结算结果，不返回回收成功后又出现正在运行的 Web。
- [x] 并发和重复请求不产生多份 Web 资源或第二个 Desktop 后端，操作结果与最终资源状态一致。
- [x] 正常退出、重复退出与启动未完成时退出均等待同一清理过程，待产生的受控进程也必须结算。
- [x] 受控 Web 子进程暂停或不响应正常终止时，退出完成后该进程和访问端口实际释放；Desktop 后端继续保持独立生命周期。
- [x] 用真实进程与应用/SDK 操作进行故障场景验收，冻结并记录候选、验证命令、退出结果与资源观察证据；保持用户当前服务和数据。

## 当前受影响子项

- [ ] 在新profile/就绪观察下核对Host退出/lease更换后SDK/UI恢复和唯一监听；原互斥、暂停、晚到句柄实现若字节/环境未变，复用对应原证据并说明范围。
- [ ] 新的模块装配不扩大启动器资源范围；自有Web/SDK/日志释放和独立Desktop持续可用仍须满足，辅助清理失败不改写原业务首错。

## 固定验证入口与证据

- `engineering`：在 `macos-launcher/flutter` 执行 `bash check.sh`。锁定解析/格式/零诊断/Flutter适用完整测试；必须对应最终输入。
- `T04`：在 `macos-launcher/flutter` 执行 `dart run tool/application_probe.dart "$VALIDATION_APP_EXECUTABLE" --lifecycle-runtime "$VALIDATION_RUNTIME_RESOURCES" --lifecycle-case recovery-paused-quit`。代表性新profile恢复与自有暂停退出；另两个既有case按实际影响决定。

占位变量必须在执行前冻结为实际ARM64应用/只读runtime/Release路径与完整SHA，连同命令、工具链、退出码及原始输出记录；占位草稿不是已执行证据。系统/默认SDK/外部焦点仅在已授权干净runner，禁止本地伪造CI环境绕过隔离守卫。健康来源迁移时沿用现成公开DSH观察，不新增服务架构。

## 被什么阻塞

- [T02：共享Desktop与Web](https://github.com/Ghost233/DSH-Workflow/issues/3)。

Root不因本草稿自动更改CLOSED状态；当前矩阵先补具体受影响子项。出现该票合同的真实失败或需要继续实现的缺口时再重开，完成定点证据后据实际结果收尾。
