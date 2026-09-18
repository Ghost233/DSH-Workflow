---
planning_document: DSH_PLANNING_DOCUMENT_V1
document_kind: spec
document_id: OFFLINE-ACCEPTANCE-PRECHECK
document_revision: R1
planning_declaration: {"id":"OFFLINE-ACCEPTANCE-PRECHECK","revision":"R1","acceptanceCriteria":["AC-01","AC-02","AC-03","AC-04"],"contracts":[]}
---

# 离线验收前置检查器 Spec

## 需求总结

为 Coinhub_Online_Demo 提供一个离线、确定性的命令行验收前置检查器。它只读取指定的 `package.json`，验证 `typecheck`、`build`、`build:ext` 三个 npm script 都存在且为非空字符串；不执行这些脚本，不启动服务，不访问网络，也不读取或使用凭据。

## 行为

1. 默认读取项目根目录 `package.json`；npm 入口允许传入另一份 `package.json` 路径，以支持确定性黑盒测试。
2. 每次执行输出稳定 JSON，包含目标路径、三个脚本各自的状态、错误分类（如适用）与总体 `ready` 布尔值。
3. 三个脚本全部为非空字符串时，输出 `ready: true` 并以退出码 `0` 结束。
4. 任一脚本缺失、不是字符串或为空/全空白字符串时，输出 `ready: false`、准确列出具体项，并以非零退出码结束。
5. 输入文件不存在、无法读取或 JSON 损坏时，输出 `ready: false`、明确的输入错误分类与非零退出码；不得伪装为就绪。
6. 对相同输入重复运行必须产生相同 JSON 内容和退出码。

## 范围与边界

- 仅实现检查器、npm 入口、独立黑盒测试与用户说明。
- 不安装依赖；只使用现有 Node.js 能力。
- 不实际运行构建、类型检查或任何开发服务；不访问网络、不部署、不推送。
- 不改 DSH、第三方源码、模型/Provider/API key/HOME、权限/审批/沙箱、Git 身份或缓存配置。
- 不覆盖或清理用户已有改动。

## Owner 与 DAG 约束

- 沿用既有 Registry 且严格遵守 scope：`build-tooling` 负责 CLI 与 npm 入口，`quality-automation` 负责独立黑盒测试，`product-docs` 负责用户说明。
- 黑盒测试必须依赖 CLI/npm 入口实际完成，不能把尚未创建的测试命令当作当前前置条件。
- 文档、实现、测试与最终集成按实际依赖顺序编排；重复性验证必须在测试实现后执行。

## 验收标准

- **AC-01**：npm 入口默认检查根 `package.json`，并接受替代 `package.json` 路径；成功情况输出稳定 JSON 和退出码 0。
- **AC-02**：缺失脚本、空/空白字符串脚本与非字符串脚本均以非零退出，JSON 明确标识受影响脚本，且绝不执行目标 scripts。
- **AC-03**：不存在、不可读或 JSON 损坏的输入均以非零退出和明确输入错误 JSON 失败，绝不报告 `ready: true`。
- **AC-04**：独立黑盒测试覆盖成功、缺失、空字符串、文件不存在、损坏 JSON 与重复运行稳定性；用户说明记录离线边界、输入参数、JSON/退出码语义；现有 typecheck、Web build 与扩展 build 通过。
