# Tobs 实施记录

## 授权与范围

用户确认移除旧 SuperAgent 集成和旧方案，保留已定稿的 Tobs 独立插件方案并开始实施。发现发布版 1.6.1 与当前 DSH 不兼容后，用户明确授权采用上游修正后的固定提交，保留 DSH `0.2.2-rc.1`。Q1—Q15 的团队、授权、记录、轮询、恢复和验收边界保持有效。

原设计已保存到 `docs/project-coordination/`。这些文件保留设计审阅时的历史版本说明；当前版本契约见 `runtime-contracts.md` 和 `vendor/tobs.upstream.json`。

起始 HEAD 为 `033b6f7acfe0eff0d82529191d7230f95900b328`，分支 main。开始时已有约 67 个文件的未提交改动，主要是移除 SuperAgent 和用户的插件清单更新；这些改动一直保留。没有创建分支或工作区，没有提交或推送，没有切换现有服务或读取真实聊天、GitHub 凭据。

## 已完成实现

- 修正退出流程对已删除 SuperAgent 模块的残留导入，保留 DSH/Web 的正常停止。
- 引入完整官方 Tobs 包组及 PersonaBot 预设；精确提交为 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab`，构建版本为 `1.6.1-ghost.20261110.2e0562f`，Provider 提交为 `bb0c7956896f5f5845950a0707837cd7938a11b3`。
- `project-coordination-plugin/` 提供自有 SQLite、单 Host 所有权、可信来源接单、任务树、接受/拒绝/重新分派、依赖、结构化报告、上级验收、停止/显式恢复和可恢复等待。
- GitHub 接入包括增量轮询、事件去重、Issue、PR 创建与更新、评审/CI/合并观察和状态回写。写入结果不明时先核对，无法唯一定位则保持待核对，不盲目重发。
- Orchestrator 发起原生 Assignment；插件核实实际 Agent、Session、Continuity Key、Workspace、Grant 与工作目录。Assignment 运行预授权的固定验证命令，并核对验证树与 PR HEAD。
- 专业成员按已批准模板和模型预设创建；归档先排空工作、暂停并保留记忆，归档成员释放活动容量。
- 默认无仓库配置，不自动推断授权。Settings 指向本地 JSON 后才启动项目轮询；示例在 `project-coordination-plugin/configuration.example.json`。

## 构建与锁

OrbStack 端点为 `unix:///Users/ghost233/.orbstack/run/docker.sock`。Docker 镜像与工具链已固定；地址池已满，因此 Compose 使用既有 bridge，不删除其他网络。buildx 使用项目私有 `.build/tobs-buildx`。

官方源码在容器内按原有流程构建和 prepare，产出完整产品 tgz 与平台包。官方二进制通过原摘要核验后供官方 prepare 使用。Tobs、Provider 和本仓 DSH 的受跟踪源码均核实干净，没有第三方补丁或 fork。

制品集合 SHA-256：`331882e1333fd46153009cf33eb688f0a1501b54363915b950bf35542cf04697`。npm 清单项在容器中用实际 `npm view` 查询；锁文件由 `scripts/refresh-project-plugin-lock.mjs` 完整生成，清单摘要一致后才替换根锁。

最终候选：`.build/Ghost DSH Station-0.6.5-dsh0.2.2-rc.1-arm64-tobs-verified-20261111.app`。SDK、Flutter 与第三方包组已完成构建；项目层在最后修正后重新装配、签名并核验。各次旧项目层保留在 `.build/project-registry/workflow-before-*`，里面只有本任务产出的构建源码副本，没有用户业务数据。无参数启动入口已核实选择最终候选，未实际切换服务。

插件封存摘要：`45764fe9fb0525494556c5182369584585d4d1b53ba47f3de07cd0949644dafe`。

## 已通过的验证

- 自研行为、配置、单 Host、GitHub 故障、真实 Git worktree 与命令退出码、装配与制品摘要定向测试：32 项通过，退出码 0，随后纳入完整门禁。
- 真实 Host 中 12 个启动插件全部加载；Tobs 五个组件及 `preset-deepseekbot` 都有真实 active fiber。
- `native-host.acceptance.mjs`：真实 SDK Host、Tobs Orchestrator、Assignment、Workspace 和 Grant，模型传输与 GitHub 用隔离 fixture。实际完成受理、原生派工、固定命令退出码 0、插件结果与原生上行报告；核实原生停止。连续 5 次瞬时模型错误后恢复仍沿用原执行；连续 3 次非瞬时错误触发原生锁止后向上报告，保持人工停止，不绕过锁止。
- 最终完整 Node 门禁为 392 项通过、0 失败、0 跳过、0 取消，退出码 0。
- 发布脚本回归：26 项通过，退出码 0。客户端产物检查、启动脚本语法及 Git diff 空白检查通过。
- Flutter 锁校验和 67 文件格式检查通过。分析器在原中文路径报已知 LSP 长度问题；137 个输入文件逐一核对摘要一致的英文目录中，静态分析通过。最终完整 Flutter 门禁在原项目路径、最终候选资源上执行，89 项通过、0 跳过，退出码 0。分析副本已清理，输入摘要与原始日志保留。

交付证据还覆盖：交接后旧执行无法继续以原负责人身份上报；排空负责人会先排空其下属，先归档下属再归档负责人；验证失败保留命令和真实退出结果，并使旧成功凭证失效；普通进展不能覆盖交付凭证；无需变更需核对干净工作树与原始基准树；最终验收后才关闭对应 Issue。

## 保留的失败证据

- Tobs 最初构建因二进制下载网络错误失败；官方摘要校验后重试 prepare 成功，没有修改上游。
- 最初 Node 检查使用缺少构建产物的源码运行时，另有沙箱文件监听错误。改用按本仓锁文件安装的隔离测试依赖和既有 Node 24.12.0 后完成真实验证。Node 26 的测试解析钩子递归不计通过。
- Flutter 原路径分析退出码 255；只在摘要一致副本中做分析。最初误在这个仅 Flutter 副本中执行完整项目关联测试，因缺少上级工程输入而失败，这次不计通过；完整测试必须回到原项目及最终资源。
- 最初 Host 探针把 profile patches 多嵌套一层，HMR 未停用；修正后真实启动成功。模型 fixture 先缺少模型目录和上下文容量，诊断后补足实际模型契约，才完成真实 Agent 验收。
- 包组首次装配超过原有一分钟准备期限；保留两次中断记录。按数百项依赖的实际准备量设置构建安装期限后成功，业务验证命令和超时保持原配置。

主要原始证据在 `.build/project-registry/`。完整命令、结果和边界见[验证报告](validation.md)，机器可读记录为 `.build/project-registry/validation-receipt.json`。真实 GitHub、生产模型和用户仓库尚未绑定；本轮完成实现、封装与隔离验收。
