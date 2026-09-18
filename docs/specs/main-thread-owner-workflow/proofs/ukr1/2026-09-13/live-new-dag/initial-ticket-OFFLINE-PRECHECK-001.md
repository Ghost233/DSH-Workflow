---
planning_document: DSH_PLANNING_DOCUMENT_V1
document_kind: ticket
document_id: OFFLINE-PRECHECK-001
document_revision: R1
spec_id: OFFLINE-ACCEPTANCE-PRECHECK
spec_revision: R1
planning_declaration: {"id":"OFFLINE-PRECHECK-001","revision":"R1","spec":{"id":"OFFLINE-ACCEPTANCE-PRECHECK","revision":"R1"},"acceptanceCriteria":[{"id":"AC-01","specId":"OFFLINE-ACCEPTANCE-PRECHECK","specRevision":"R1"},{"id":"AC-02","specId":"OFFLINE-ACCEPTANCE-PRECHECK","specRevision":"R1"},{"id":"AC-03","specId":"OFFLINE-ACCEPTANCE-PRECHECK","specRevision":"R1"},{"id":"AC-04","specId":"OFFLINE-ACCEPTANCE-PRECHECK","specRevision":"R1"}],"contracts":[],"dependsOn":[],"work":{"ready":[{"id":"implementation"}],"blocked":[]}}
---

# OFFLINE-PRECHECK-001：离线验收前置检查器

## 背景

当前工程需要一个不依赖网络、不执行构建的确定性前置检查，以便在实施或验收前确认必需 npm 构建脚本的定义完整性。

## 实施任务

- `build-tooling`：使用现有 Node.js 能力实现 CLI，并在根 `package.json` 提供 npm 入口。默认检查根 `package.json`，接受一个替代路径参数；只读输入，输出稳定 JSON 与准确退出码。
- `quality-automation`：用独立黑盒方式运行实际 CLI/npm 入口，覆盖成功、缺失脚本、空字符串脚本、文件不存在、JSON 损坏和重复执行输出稳定性；断言检查器没有运行被检查的 scripts。
- `product-docs`：记录命令用法、替代路径、JSON 字段与退出码，以及离线/无副作用边界。
- 最终集成：运行新增黑盒测试以及现有 `typecheck`、Web build、扩展 build；不安装依赖或执行外部服务调用。

## 验收映射

- AC-01：默认和自定义输入路径的成功检查。
- AC-02：脚本定义无效时的稳定失败结果。
- AC-03：文件与 JSON 输入错误的稳定失败结果。
- AC-04：独立黑盒覆盖、重复性证明、文档与既有工程门禁。

## 约束

- 只检查 script 定义，绝不执行 `typecheck`、`build` 或 `build:ext`。
- 不访问网络、不使用凭据、不启动服务、不部署、不推送。
- 复用既有长期 Owner Registry，不改 Registry，不覆盖用户已有改动。
