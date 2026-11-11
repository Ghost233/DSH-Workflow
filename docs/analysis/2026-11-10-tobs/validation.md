# Tobs 引入与项目协作插件验收

后续更新（2026-11-11）：自研插件新增按仓库使用独立 `ghConfigDir` 的凭据接入，真实核对账号后复用已有 gh 登录，不切换全局账号、不写入 Token。GhostNexus 已完成负责人、岗位模板、Git 本地身份及 GitHub 轮询配置，并通过现有 HMR 在原 Host 生效。项目接入现以“固定账号 → 创建负责人 → 建立或复用项目分组 → 归入成员 → 核对轮询”为标准流程，专业 Bot 自动进入所属仓库分组，总负责人保留全局位置。最新完整 Node 门禁为 400 项通过、0 失败/跳过/取消，退出码 0；真实原生分组与执行链路再次通过。具体本机配置、分组身份、轮询和验收记录见 `.build/project-registry/ghostnexus-setup.json`。下文 392 项结果保留为最初引入时的验收基线。

2026-11-11 完成实现、封装及隔离验收。保留当前 DSH `0.2.2-rc.1`，使用用户批准的官方修正提交构建 Tobs；自研插件承担 GitHub 触发、多层任务拆分、授权、交付证据和逐级汇报。旧 SuperAgent 的启动、打包与运行模块已从当前集成移除。

代码保留在当前 `main` 工作区，未提交、未推送。起始与当前 HEAD 均为 `033b6f7acfe0eff0d82529191d7230f95900b328`；核对时本地 main、origin/main 与远端 main 一致。用户原有未提交改动保持原位。

## 来源与交付物

| 项目 | 已核验内容 |
| --- | --- |
| Tobs 官方提交 | `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab` |
| Tobs 构建版本 | `1.6.1-ghost.20261110.2e0562f` |
| IM Provider 官方提交 | `bb0c7956896f5f5845950a0707837cd7938a11b3` |
| DSH 源码提交 | `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db` |
| 源构建工具链 | Node `24.21.0`、pnpm `12.4.2`，容器内按官方流程构建和 prepare |
| 原生验收运行时 | 候选 App 的 Node `24.12.0`，本仓锁文件安装的隔离测试依赖 |
| 上游源码 | Tobs、Provider、DSH 的受跟踪源码均无修改 |
| 制品集合 SHA-256 | `331882e1333fd46153009cf33eb688f0a1501b54363915b950bf35542cf04697` |
| 插件封存 SHA-256 | `45764fe9fb0525494556c5182369584585d4d1b53ba47f3de07cd0949644dafe` |

最终候选 App 位于 `.build/Ghost DSH Station-0.6.5-dsh0.2.2-rc.1-arm64-tobs-verified-20261111.app`。官方组件与生产依赖已封存，自研项目层与当前源码逐项一致，ad hoc 签名通过 `codesign --verify --deep --strict`。保留已构建且输入未变的 Flutter、SDK 和第三方包组，仅重装配变化的自研层。

`project-plugins.lock.json` 在项目容器中查询真实元数据后由脚本生成，清单 SHA-256 为 `1ded024592323bcd16954b1036ac5e35e239ae2775204198c49318b7fa85890b`，与根清单及封装内容一致。12 个官方制品的身份、摘要和固定来源已核实。日常无参数入口 `./start-dsh-workflow.sh` 的选择逻辑已核实指向最终候选，未启动或切换用户服务。

## 最终门禁

| 检查 | 结果 | 原始记录（均在 `.build/project-registry/`） |
| --- | --- | --- |
| 完整 Node 门禁 | 392 通过，0 失败、跳过、取消；退出码 0 | `node-owner-recovery.log` |
| 完整 Flutter 门禁 | 89 通过，0 跳过；退出码 0 | `flutter-owner-recovery.log` |
| 真实原生 Tobs 链路 | 通过；退出码 0 | `native-owner-recovery.log` |
| 自研定向门禁 | 32 通过；退出码 0；已包含于完整 Node 门禁 | `coordination-all.log` |
| 发布脚本回归 | 26 通过；退出码 0 | `release-tests.log` |
| 客户端构建产物检查 | 通过；退出码 0 | `client-check.log` |
| Flutter 格式与静态分析 | 67 文件格式无变化；摘要一致副本中分析无问题 | `flutter-check.log`、`flutter-ascii.log`、`flutter-inputs.json` |
| 封装、签名、清单与上游源码完整性 | 通过；退出码 0 | `final-integrity.json`、`refresh-owner-recovery.log` |
| 启动脚本与差异空白 | `bash -n`、`git diff --check` 通过 | 本地命令退出码 0 |

完整 Node 门禁从仓库根目录运行：

```sh
DSH_TEST_RUNTIME_ROOT="$PWD/.build/tobs-test-runtime" \
DSH_SERVICE_TEST_RESOURCES="$PWD/.build/Ghost DSH Station-0.6.5-dsh0.2.2-rc.1-arm64-tobs-verified-20261111.app/Contents/Resources" \
DSH_LAUNCHER_TEST_PORT=0 \
.build/tobs-node24 scripts/run-project-tests.mjs
```

真实原生验收使用相同的 `DSH_SERVICE_TEST_RESOURCES`，运行 `.build/tobs-node24 project-coordination-plugin/test/native-host.acceptance.mjs`。Flutter 从 `macos-launcher/flutter` 运行 `flutter test --no-pub --concurrency=1`，设置最终候选资源的绝对路径、`DSH_TEST_NODE`、`DSH_TEST_NODE24` 与随机端口。完整环境、退出码、日志 SHA-256 和输入封存摘要见 `.build/project-registry/validation-receipt.json`。

原路径的 Flutter 分析器因 LSP 长度问题退出 255；仅静态分析采用 137 个输入逐一核对 SHA-256 的英文路径副本，输出为 `No issues found`。该副本随后执行完整项目测试时，因缺少上级项目文件失败；这次失败保留在原日志中，不计通过。最终 89 项完整测试回到原工作区与最终候选资源执行。静态分析副本已清理，源文件摘要再次核对无变化。

## 验收覆盖

自研测试覆盖来源白名单、近期真实 Human 消息凭证、任务与副作用去重、多层分派及拒绝、依赖阶段、单一负责人、交接后的旧执行隔离、专业成员模板与容量、递归排空与归档顺序、停止和显式恢复。工作区测试使用真实 Git 仓库与 worktree，记录实际命令的退出结果；验证失败会保存证据、向上报告并使旧成功凭证失效。

GitHub API 使用隔离 HTTP fixture，覆盖轮询恢复、丢失写入响应后核对、PR 更新、同一 HEAD 的合并观察、向上汇报与状态回写、验收完成后关闭 Issue。无需变更需有基准树和干净工作树证据；普通进展不能替换交付证据，父任务必须经过上级验收。

原生验收使用真实 SDK Host、Tobs Core、Orchestrator、Assignment、Workspace、Grant 和 Session。模型传输使用确定性 fixture，GitHub 写入使用隔离替身。测试实际执行受理、准备、原生派工、固定命令验证、插件上报与原生 `report_to_orchestrator`，核实原生停止；5 次连续 `SERVER` 故障后沿用原任务和原执行恢复，停止仍有效；3 次连续 `MODEL_UNAVAILABLE` 后核实原生锁止并向上报告。

## 运行边界与启用准备

当前插件默认等待配置。尚未绑定真实仓库、真实 GitHub 凭据或生产模型，也未切换用户服务。本轮结果证明隔离环境中的接口组合与插件行为；真实远端开发交付仍需配置后验收。

配置入口见 [插件说明](../../../project-coordination-plugin/README.md)与 [配置示例](../../../project-coordination-plugin/configuration.example.json)。使用者需明确负责人和成员 Bot slug、仓库、发起者白名单、工程 checkout、执行根目录、固定验证命令、模型预设与凭据环境变量。Tobs 继续管理 Bot 的原生记忆和模型，插件不安装业务工程依赖。

瞬时网络或模型错误采用持久退避、等待恢复和副作用核对。上游 Tobs 对连续非瞬时错误的 `failures` 锁止没有公开系统解锁接口；插件会向直接上级报告并等待真实 Human 在原生界面恢复。人工停止需要符合授权的显式恢复，两类状态均不会被自动重试绕过。该边界详见 [运行时接口核验](runtime-contracts.md)。
