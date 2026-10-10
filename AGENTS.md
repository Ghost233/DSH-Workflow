# 维护范围

本项目维护自研独立模块 `agent-observation-plugin/`，用户授权的本地派生版 `matt-skills-panel-plugin/`，以及项目侧启动、编排和验收代码。

- 修改或升级 Matt 面板时，先读 `matt-skills-panel-plugin/README.md`。派生版源码与验收在主仓库维护；`vendor/dsh-mattpocock-skills-deck` 保持上游源码原样，用于对照更新。基准由 `upstream.json` 记录，升级先生成三方合并提案，再审查、验证并更新基准。构建只写派生目录；服务切换单独取得用户授权。

- 其余第三方插件保持上游原样。遇到报错、接口不兼容或测试失败，记录事实后继续自研插件工作；不修改、不修复、不创建或恢复第三方补丁、覆盖包、fork 或专用修复测试。
- DSH 和其他上游源码保持原样。自研兼容修改落在上述自研插件或项目集成层。
- 自研验收只以自研需求为完成标准。第三方插件的错误不列为自研待修复项，也不作为继续修补第三方的理由；若影响整体启动，报告具体影响，不把失败描述为通过。
- 安装清单中出现某个包不代表我们维护它。判断归属不明确时先核对来源，再确定修改范围。
- 新增或更新 `project-plugins.lock.json` 时，在容器内用 `npm view <包>@<版本或标签> --json --registry <清单中的 registry>` 查询实际发布版本和元数据，再由脚本生成锁文件并校验清单摘要；禁止手写或猜测锁定条目。npm 命令或生成流程失败时保留原锁文件并报告原因。
- 旧 Spec、Ticket、报告或测试清单中关于第三方适配的计划已取消，不能据此恢复第三方修复工作。
- 日常启动入口固定为无参数 `./start-dsh-workflow.sh`。脚本内部装配自研插件，并逐个尝试 `project-plugins.json` 中标记 `startup: true` 的第三方插件；单个第三方插件失败时记录原因并继续。调用者无需拼接环境变量或插件范围参数；完成标准是该命令能够启动 DSH Web 与保留的 JEV/原生监控模块，并如实报告每个启动插件的结果。

SoL 和 Synapse 已移除；历史文档中的接入和验收要求不再适用，不得据此恢复。

`AGENTS.md` 是本仓库代理约束的唯一文件。

# 工程环境边界

- Workflow 不识别工程语言或包管理器，不安装依赖，不创建依赖缓存，不复制或摘要依赖树，也不向工作区注入依赖目录。
- 多个 worktree 如何共享工具链、依赖和构建缓存，由工程初始化流程自行决定。Workflow 只消费 Spec/Ticket 中固定的验证命令及其退出证据。
- 工程环境缺失时记录真实的验证执行失败并反馈主线程；不得通过 Workflow 内部下载、安装、改写配置或延长超时来掩盖初始化问题。
- 工程准备与验证结果绑定分别记录，不以语言生态假设改变职责。

## Agent skills

### Issue 跟踪器

使用工程类 skills 读取、发布或推进 issue 时，先读 `docs/agents/issue-tracker.md`；本项目使用 GitHub Issues。

### 分类标签

对 issue 分类时，使用 `docs/agents/triage-labels.md` 中的角色与标签映射。

### 领域文档

编写规格或开展设计、诊断、审查前，按 `docs/agents/domain.md` 读取单上下文的术语表与相关 ADR。

### 发布流程

正式发布或修改发布入口前，读取 `docs/agents/release.md`；统一入口为 `scripts/release.sh`，标签发布沿用 `macos-release` skill。
