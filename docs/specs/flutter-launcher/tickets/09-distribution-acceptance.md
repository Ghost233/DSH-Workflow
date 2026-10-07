## 父项

[DSH 启动器 Flutter 迁移与 MacLauncher SDK 接入（补录）](https://github.com/Ghost233/DSH-Workflow/issues/1)

## 要构建什么

工具维护者获得可移动的 arm64/x64 应用和 DMG，并用逐故事证据确认统一维护体系与整份规格的交付范围。

对应父 Spec 用户故事：1、2、27、28。针对现有实现核对并补齐此端到端行为；既有测试和 CI 只作为可核对的证据，不自动勾选验收项。

## 验收标准

- [ ] 保持同 Flutter、官方 SDK 和工程规范体系以及两个独立仓库的构建分发边界，真实依赖锁定、格式、零诊断静态分析和测试均有对应证据。
- [ ] arm64 和 x64 分别构建 Flutter Release、独立 Node、官方 Desktop 和项目集成资源，应用不依赖开发者源码 checkout 或系统安装的业务依赖。
- [ ] 两个架构的应用签名及 DMG 校验均实际通过，产物非空且与被验收候选对应；DMG 命令保留可诊断输出。
- [ ] 移动应用到独立临时位置，实际通过 Host、前端、DOCX/XLSX/PPTX 转换、Owner 就绪和 Matt 面板装配验收。
- [ ] 分发后的应用关联信息仍正确指向可移动应用，独立运行、SDK 发现和管理窗口的关键路径继续通过。
- [ ] 形成父 Spec 全部 28 条用户故事的证据矩阵，逐项链接对应工单、场景、冻结命令、候选提交与原始退出证据；未执行、失败和需人工授权的场景如实标注，不能以已有 CI 概括为全通过。
- [ ] 只处理本规格范围与自研要求；保持上游来源、用户当前数据和服务及其他未提交改动，不发布新 Release、不自动安装切换运行应用。

## 新增窗口子项的交付证据（待验收）

- [ ] 原 28 故事矩阵中纳入 Desktop 四行为与默认 false 持久化偏好的受影响子项，分别记录本地 ARM 与最终 Intel/干净 runner/双架构分发的实际来源。
- [ ] 真实窗口观测区分后端启动、Host 就绪与窗口首次显示；冷启动隐藏与 Web UI 可用、显示/聚焦、运行中隐藏/显示同 Host、保存后重启、自动启动不隐藏已有窗口、显式打开找回均有原始证据。
- [ ] 按用户确认的最终状态与焦点恢复条件验收后台冷启动：最终同一物理 Desktop hidden=true、onscreen=0，真实 Host/Web/SDK ready，并恢复原焦点；如实记录首次 window.show 的短暂显示与 activation。约 155 ms 的窗口观测采样跨度不等于精确持续时间，不承诺整个启动绝对零激活或未来不闪。不以 OpenConfiguration 或 SDK 成功返回概括为通过，不使用 hidesOthers，不改 DSH 上游或增加 server 架构。

用户明确接受上述记录限制，验收最终状态与焦点恢复。历史冷启动 FvWnnn/source `1fcc` 按当时严格焦点条件实际 CLI 255，结果原样保留。更新后的条件须由同一 writer 在后续实机重验取得原始 CLI 0；本次需求同步不将旧 run 或当前 `4d2` 候选改算通过。

新的 SDK/窗口/入口 seam 按新最终候选执行；修改前 cf285 的 Full T05/T08 成功范围保留，不能替代新窗口功能验收。Command+Q/退出快捷键暂不扩展本次需求。

## 被什么阻塞

- [T03 — 通过 SDK 和管理窗口观察真实状态与实例日志](https://github.com/Ghost233/DSH-Workflow/issues/4)
- [T04 — 在并发、断连与退出中正确结算 Web 生命周期](https://github.com/Ghost233/DSH-Workflow/issues/5)
- [T05 — 保留既有配置并通过管理窗口设置访问与权限](https://github.com/Ghost233/DSH-Workflow/issues/6)
- [T06 — 接管入口并在管理端断线后归还原生入口](https://github.com/Ghost233/DSH-Workflow/issues/7)
- [T07 — 通过管理窗口管理登录启动与稳定版更新](https://github.com/Ghost233/DSH-Workflow/issues/8)
- [T08 — 从管理窗口查看和更新插件并明确重新加载](https://github.com/Ghost233/DSH-Workflow/issues/9)
