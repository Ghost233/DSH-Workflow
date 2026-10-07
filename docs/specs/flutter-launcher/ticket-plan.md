# DSH 启动器 Flutter 迁移 — 工单索引

父项：[正式 Spec](https://github.com/Ghost233/DSH-Workflow/issues/1)

用户已批准本拆分方案，9 张工单已发布。每张票用于验收现有实现并补齐缺口，验收项均保持未勾选。现有统一控制入口可复用，无需单列纯预重构工单。

本次使用 GitHub tracker：工单正文引用父 Spec，阻塞关系使用原生依赖；保留父 Spec 的正文、标签和开放状态，不添加父项评论或改变其执行状态。

## 拆分方案

1. **[T01 — 独立启动 DSH 启动器并从管理端打开窗口](https://github.com/Ghost233/DSH-Workflow/issues/2)**
   被什么阻塞：无，可立即开始。
   交付内容：独立打开 Flutter 管理窗口，管理端发现项目与服务并激活窗口；关闭窗口保留业务，重复打开激活既有启动器。
   用户故事：1、2、3、4、6、9、19、26。

2. **[T02 — 从界面与 SDK 启停 Web 并共享 Desktop 后端](https://github.com/Ghost233/DSH-Workflow/issues/3)**
   被什么阻塞：[T01 — 独立启动 DSH 启动器并从管理端打开窗口](https://github.com/Ghost233/DSH-Workflow/issues/2)。
   交付内容：界面或管理端启动一个认证 Web 入口，连接已有或新打开的官方 Desktop；回收 Web 后 Desktop 与启动器继续运行。
   用户故事：5、10、11、12、14。

3. **[T03 — 通过 SDK 和管理窗口观察真实状态与实例日志](https://github.com/Ghost233/DSH-Workflow/issues/4)**
   被什么阻塞：[T02 — 从界面与 SDK 启停 Web 并共享 Desktop 后端](https://github.com/Ghost233/DSH-Workflow/issues/3)。
   交付内容：使用者通过管理端和日志页面判断真实运行、就绪与实例范围，后端健康查询失败或 Web 换实例时仍得到可信信息。
   用户故事：15、16、26。

4. **[T04 — 在并发、断连与退出中正确结算 Web 生命周期](https://github.com/Ghost233/DSH-Workflow/issues/5)**
   被什么阻塞：[T02 — 从界面与 SDK 启停 Web 并共享 Desktop 后端](https://github.com/Ghost233/DSH-Workflow/issues/3)。
   交付内容：Desktop 失联后恢复 Web，界面与 SDK 冲突操作得到一致结果，启动中或重复退出仍清理全部自有 Web 资源。
   用户故事：5、13、17、18。

5. **[T05 — 保留既有配置并通过管理窗口设置访问与权限](https://github.com/Ghost233/DSH-Workflow/issues/6)**
   被什么阻塞：[T02 — 从界面与 SDK 启停 Web 并共享 Desktop 后端](https://github.com/Ghost233/DSH-Workflow/issues/3)。
   交付内容：保留既有配置和密码，验证管理窗口的认证与局域网设置，以及完整访问权限的保存、持久化、错误和重开提示；验证 Launcher 与自有 Web/SDK 资源释放。独立 Desktop 退出、权限重开及新 Desktop 实际采用权限不纳入本次验收。
   用户故事：20、21、22。

6. **[T06 — 接管入口并在管理端断线后归还原生入口](https://github.com/Ghost233/DSH-Workflow/issues/7)**
   被什么阻塞：[T02 — 从界面与 SDK 启停 Web 并共享 Desktop 后端](https://github.com/Ghost233/DSH-Workflow/issues/3)。
   交付内容：管理端成功接管后隐藏重复菜单，仍可打开管理窗口；管理端退出、断线或迟到动作后自己的入口恢复，业务继续运行。
   用户故事：6、7、8、9。

7. **[T07 — 通过管理窗口管理登录启动与稳定版更新](https://github.com/Ghost233/DSH-Workflow/issues/8)**
   被什么阻塞：[T01 — 独立启动 DSH 启动器并从管理端打开窗口](https://github.com/Ghost233/DSH-Workflow/issues/2)。
   交付内容：使用者管理系统登录项并看到实际批准状态，检查适用的稳定发行版本并打开本项目发行页面。
   用户故事：23、24。

8. **[T08 — 从管理窗口查看和更新插件并明确重新加载](https://github.com/Ghost233/DSH-Workflow/issues/9)**
   被什么阻塞：[T02 — 从界面与 SDK 启停 Web 并共享 Desktop 后端](https://github.com/Ghost233/DSH-Workflow/issues/3)。
   交付内容：使用者查看插件来源、版本和 DSH 兼容信息，执行单项或批量更新，看到真实结果并按提示重新加载 Desktop。
   用户故事：25、26。

9. **[T09 — 交付双架构独立应用并完成用户故事验收收尾](https://github.com/Ghost233/DSH-Workflow/issues/10)**
   被什么阻塞：[T03 — 通过 SDK 和管理窗口观察真实状态与实例日志](https://github.com/Ghost233/DSH-Workflow/issues/4)；[T04 — 在并发、断连与退出中正确结算 Web 生命周期](https://github.com/Ghost233/DSH-Workflow/issues/5)；[T05 — 保留既有配置并通过管理窗口设置访问与权限](https://github.com/Ghost233/DSH-Workflow/issues/6)；[T06 — 接管入口并在管理端断线后归还原生入口](https://github.com/Ghost233/DSH-Workflow/issues/7)；[T07 — 通过管理窗口管理登录启动与稳定版更新](https://github.com/Ghost233/DSH-Workflow/issues/8)；[T08 — 从管理窗口查看和更新插件并明确重新加载](https://github.com/Ghost233/DSH-Workflow/issues/9)。
   交付内容：工具维护者获得可移动的 arm64/x64 应用和 DMG，并用逐故事证据确认统一维护体系与整份规格的交付范围。
   用户故事：1、2、27、28。

## 阻塞依据

- T01 先提供独立应用、管理窗口与正式 SDK 连接的完整路径。T02 和 T07 可随后分别推进。
- T02 提供实际 Web 与 Desktop 后端生命周期；状态日志、生命周期恢复、访问设置、入口接管与插件重新加载的业务观测依赖这条路径。
- T03、T04、T05、T06、T08 之间没有人为顺序；T07 不依赖 Web 生命周期。
- T09 只被各功能末端工单阻塞，T01/T02 已由这些工单的传递依赖覆盖。
- 发布时可领取前沿是 T01；后续前沿以 GitHub 的实际阻塞项状态为准。工单开放且带 ready-for-agent 标签不表示其阻塞项已完成。

## 覆盖与证据

- 2026-10-07 用户调整范围：T05 的独立 Desktop 正常退出、权限重开和新权限实际采用子项标记为“用户调整范围后取消/不纳入本次验收”。CI 隔离资源清理单独记录；历史 FAIL/CANCELLED 不改写为 PASS，T08 已取得的相关成功证据保留。T09 的 28 条故事矩阵须标明这些取消子项与保留验收。

- 28 条用户故事均有对应工单；T09 对整份规格做证据归并。
- 每票验收要求在执行验证前冻结候选和实际验证命令，并记录原始结果。按 to-tickets 约定，正文不嵌入易过时的源码路径或实现片段。
- 本阶段仅形成和发布工单；单票通过需要另行执行场景并取得证据，文档状态不替代 Runner 的执行状态。

## 发布核对

9 张正式工单均已核对正文、Ghost233 作者、开放状态及唯一 ready-for-agent 标签；13 条原生阻塞关系已逐条查询确认。父 Spec 正文、标签和状态保持原样，未直接修改父 issue。
