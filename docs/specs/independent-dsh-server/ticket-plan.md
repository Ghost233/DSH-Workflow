# 独立 DSH 服务工单计划

父规格：[GitHub #25](https://github.com/Ghost233/DSH-Workflow/issues/25)。用户已确认拆分和依赖；8 张子工单及原生阻塞关系已发布并回读核验。父 issue 的正文和状态保持原样。

每票覆盖一条可单独验证的用户路径，包含相应管理入口、实际服务行为和测试。现有代码已有局部草稿，尚未验证，不作为工单完成证据。没有发现必须单独发布的准备性机械重构；生命周期拥有关系的调整包含在首票的完整启动路径中。

| 编号 | 标题 | 被什么阻塞 | 可独立验证的交付 |
| --- | --- | --- | --- |
| [01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26) | 从启动器和 SDK 启动并观察独立 DSH 服务 | 无 | 不打开桌面端启动服务，管理端退出重开后观察同一实例和日志。 |
| [02 #27](https://github.com/Ghost233/DSH-Workflow/issues/27) | 桌面端连接独立服务并保留原生能力 | [01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26) | 桌面端连接和退出不影响服务，保留账户、目录、拖拽和 Office。 |
| [03 #28](https://github.com/Ghost233/DSH-Workflow/issues/28) | 独立启停 Web 入口并连接同一服务 | [01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26) | 真实认证访问、Web 独立回收、启动器退出后访问保留。 |
| [04 #29](https://github.com/Ghost233/DSH-Workflow/issues/29) | 检查未完成工作并安全停止或重启服务 | [01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26) | 活动和未知状态先确认，取消保持，手动重启保留持久化数据。 |
| [05 #30](https://github.com/Ghost233/DSH-Workflow/issues/30) | 服务异常退出后通知检查并保持停止 | [01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26) | 实际崩溃后保持停止，关闭启动器仍通知，通知失败如实记录。 |
| [06 #31](https://github.com/Ghost233/DSH-Workflow/issues/31) | 登录后启动服务并保留后台运行 | [01 #26](https://github.com/Ghost233/DSH-Workflow/issues/26) | 登录启动服务且不强制打开桌面窗口，停用不影响当前业务。 |
| [07 #32](https://github.com/Ghost233/DSH-Workflow/issues/32) | 更新只检查本仓库 DMG 并统一组件交付 | [02 #27](https://github.com/Ghost233/DSH-Workflow/issues/27) | 桌面端与启动器只检查本仓库正式 DMG，运行端不直接换上游包。 |
| [08 #33](https://github.com/Ghost233/DSH-Workflow/issues/33) | 构建可复现 ARM64 应用并完成共享实例验收 | 03、04、05、06、07 | 用实际分发产物完成桌面与 Web 共享、后台任务、系统边界和完整门禁。 |

## 依赖与执行前沿

初始前沿只有 01。完成后解锁 02、03、04、05、06；02 完成后解锁 07。08 依赖 03、04、05、06、07，已通过传递关系依赖 01 和 02，不重复声明传递边。

桌面接入和 Web 接入都只依赖真实独立服务，因此相互不设阻塞。任务保护、故障通知和登录启动也不必等全部客户端接入完成。完整产物和跨客户端回归在 08 汇总，不用最终回归票替代前序工单自身的行为验证。

## 发布约定

已按依赖顺序逐票发布，仅添加 ready-for-agent 标签。每票均为 #25 的原生子 issue，阻塞关系使用 GitHub 原生依赖。父 issue 的正文和状态保持原样。

每张本地草稿独立保存在 `.scratch/independent-dsh-server/issues/`。真实编号、database id 和已核验依赖保存在同目录的 published.json。
