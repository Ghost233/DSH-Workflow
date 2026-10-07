# 阶段 2 复盘

范围：#14 多套 JEV 配置、#16 异常结束、#17 语义检测，以及阶段 1 暴露的自研 Desktop/Owner health 回归。输入为实施红绿记录、真实浏览器操作、原始 CI 日志、紧凑 Host 诊断和固定候选门禁；#18 的跨配置监控集成留在阶段 3。

## 已关闭的检查缺口

| 优先级 | 一手发现 | 本轮处置与完成标准 |
| --- | --- | --- |
| P1 | 首轮 Spec 用隔离真实 Host 证实 debug journal 会保留非 JEV 标准凭据裸值；仅已选 JEV refs 和常见环境变量后缀不足。 | 通过标准 LocalCredentialProvider 公开配置和官方 document parser 收集全目录 refs、key/env/grant 材料，并用官方 resolve 获取同名环境覆盖后的有效值；存储 A 与有效 B、Bearer 裸重复均脱敏，安全文字仍保留。提供者缺席、读取或解析失败只留元数据。定点先红后绿，监控模块 37/37；修复候选另跑完整门禁。 |
| P2 | 函数式配置 transform 在真实 Settings Remote 序列化后丢失回调，直接 Host 存取和手造客户端 schema 未暴露错误。 | 保留普通可序列化数组 schema，在标准校验 face 共用命名冲突规则；实际 Host SettingsController/TypertGateway 与 ClientGateway/ConfigForms 经 JSON wire 读、写、再读，浏览器读回和重名拒绝也通过。 |
| P2 | 源工作区可解析自研包名，封装 Desktop active-profile 没有本地映射，Owner component ready 但 dashboard 路由缺失；慢 CI 到 health JSON 解析才报错。 | 紧凑资源 Host 两次复现 404/空体，单变量加入 Owner 映射即恢复 200 JSON。产品补 Owner/Matt 的 active-profile file 依赖与链接；回归验证真实 health/工具/服务、旧缓存迁移、幂等和用户字段保留。 |
| P2 | 原型会把含认证内容的错误 code 直接记录，且只有正常 stop 标记的空结果未告警。 | 原生 LlmError 流回归保留安全结构化事实、拒绝非机器代码形状；空结果、无正常标记 EOF、输出限制、主/子代理真实错误与正常完成/工具/取消分别由公开 Host 断言。 |

## 执行环境与证据

- 已阅读既有 CI 和检查入口。Owner 全量自动发现新增公开回归；本阶段相关装配门禁包含新的紧凑资源 Host 回归。原始完整 macOS verifier 保留，没有降低健康要求或延长截止。
- 隐私模块直接 Node 37/37 后，正式完整门禁仍为 711/713、退出 1：SDK 的 ESM/CJS 公开入口在正式 loader 下有不同构造器身份，真实标准提供者被误拒绝。通过公开品牌 Probe 确认后，兼容两种 canonical exports 的真实 instanceof；同名/同 config 的非标准提供者仍失败关闭。正式和普通 Node 模块均 38/38，原失败与新候选分开保存，没有放宽断言或改运行器。
- 原完整 macOS CI 的失败是真实自研装配回归；固定基线同一步骤双架构成功。SDK/资源接缝让原因可在秒级健康响应处确认，但不替代完整 `.app`、codesign、DMG 或双架构构建，后者由新 CI 另行记录。
- 语义监控中曾把 TypeSafe 的“text only”误读为 string-only。对照一手契约后撤回限制及错误断言，保留既有结构化 state；误设的红态不算产品修复证据。
- 隐私核对中也曾误把 ApiKeyRecord.env 的实际材料值当作变量名；SDK 原文纠正后，回归收敛到 LocalCredentialProvider.resolve(ref) 的同名 process.env 优先规则。仅确证的 A/B 泄漏红态作为产品证据，没有猜测 env spec 或穷举无关变量。
- 真实浏览器的 release 工具首次因非 TTY stdin 关闭而失败，记录为测试准备问题；干净 TTY 重跑后才确认实际原生请求恢复。原请求未取消、默认日志无片段/凭据，临时 Host 正常清理。
- 精确候选剔除了原有 MCP hunks，逐项核对 tracked blob；完整 gate 使用现有固定编译 SDK 和依赖，不改上游。所有工作文件保持冻结字节，profile 的原有 foreign 片段留在工作区。

## 收尾边界

没有新增全局代理规则或泛化工程依赖处理。上述缺口已在本次范围内由行为回归关闭；新的审查整改项如有，须在最终复审前关闭。操作系统实际通知显示仍按用户明确授权暂缓，通知提交与送达分开记录。

来源：`/private/tmp/jev-stage2-t02-notes.md`、`jev-stage2-t04-notes.md`、`jev-stage2-t05-notes.md`、`jev-stage2-t05-client-notes.md`、`jev-stage2-browser-notes.md`、`jev-stage2-ci-preflight.md`、`jev-stage2-packaged-health-fix.md`、`jev-stage2-privacy-fix.md`。原始候选 tree `d88d77eca65073336010dfb81ac86b63e982d89e`，提交 `269b513ef8d046c3ba132c8e7610efc7b74aafcb`，Owner 708/708、相关集成 12/12 的真实绿态不作为隐私修复后的证据。中间候选 `b5697a39cbe1206e89925a558d300a3e13ce0f92` 的失败保留；最终修复候选 tree `4331d1a2b4a53afee8d0678867ecee42bd098264`，新门禁在交付记录单独绑定。
