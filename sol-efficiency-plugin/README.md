# dsh-sol-efficiency

为 DeepSeek Harness 移植 SoL-Pi 的 Action Fusion 与 Evidence-Preserving Reducer（EPR）。独立 ESM Profile Bundle，包含 DSH 设置页；两个功能安装后默认关闭。

## 安装与启用

安装一次，之后在 DSH 内勾选启停。启动脚本不临时注入插件，也不提供 SoL 专用环境变量。

当前适配 Harness `0.1.1-rc.2`；完整基线见 [upstream.json](upstream.json)。需要宿主已加载 `tools`；Action Fusion 还需要 `fs` 和原生 `edit`、`write`、`bash` 工具；EPR 需要 `llm`、`fs`、`spillStore`。标准 Web profile 已提供这些能力。安装时 npm peer dependencies 由宿主提供，不能在 Pi 中加载此包。

```bash
dsh plugin --profile web add file:/Volumes/LargeStorage/code/DSH-Workflow/sol-efficiency-plugin
```

使用 `file:` 安装包副本，让宿主依赖按 profile 解析；不要使用指向源码的裸路径软链接。源码升级后重新执行安装命令即可更新。首次安装后重启 DSH，再打开 **设置 → 插件 → 插件配置 → SoL Efficiency**：

- 勾选“动作融合”启用 `edit_then_run` / `write_then_run`。
- 勾选“日志压缩”启用 EPR，默认跟随当前会话已选模型，无需再填供应商或模型。
- 取消勾选即关闭；设置由 DSH 持久化，修改实时生效，无需再次重启。

“已安装插件”列表只展示加载状态；功能开关位于插件配置页。插件保持加载，以便关闭功能后仍可在页面重新开启。界面写入使用 DSH 原生 settings 服务，沿用其本机访问限制、持久化和并发版本检查。日志压缩会产生额外模型调用；可只开动作融合。

reducer 的凭据、base URL 和供应商连接由 Harness 管理，插件不接受 API key。模型必须支持 `reasoningEffort: off`，不支持时保留原始工具输出。下方高级限制只用于特殊部署，不是启动所需参数。

## Action Fusion

新增 `edit_then_run` 和 `write_then_run`，参数沿用原生文件工具，并增加必填 `then_run`。例如：

```json
{
  "file_path": "src/example.ts",
  "old_string": "return false",
  "new_string": "return true",
  "then_run": {
    "command": "npm test",
    "description": "Run tests after the targeted edit",
    "timeoutMs": 120000
  }
}
```

`then_run` 支持 `command`、`description`、`timeoutMs`、`workdir`、`sandbox_permissions` 和 `justification`，不支持后台运行。文件操作和命令的提权参数分别声明，仍由各自原生工具审批和校验。空路径、命令、描述会在文件变更前拒绝。

内部调用 `ctx.tools.execute`，传播 agent、父调用身份、取消信号、附加上下文及终止回合标记，并记录嵌套调用事件。原生 read-before-edit、写入版本检查、工具审批和沙箱仍生效。文件变更失败、取消或终止回合时不启动命令；命令失败时文件变更保留。返回值分别记录 `mutation`、`command`、`commandStatus`，外层成功表示组合结果已生成，不代表命令通过。

插件捕获原生 `fs/observed` 的文件版本，在进入 bash 调度时重新检查，发现版本变化则跳过命令。这个检查不能锁住其他进程，也不保证检查至子进程启动期间文件绝不变化。组合工具按独占调用分类；Code Mode 内仍遵循宿主调度语义。

## EPR

只处理构建、测试、lint 等诊断命令的前台 bash 结果。非零退出码也是可压缩的日志，receipt 会明确标为 failure。取消、超时、未知退出码、工具审批失败、非文本结果，以及已被其他策略替换的结果都会跳过。

流程为：取得完整 stdout/stderr → 检查字节数和常见秘密特征 → 通过 spillStore 归档 → 经 `ctx.llm.stream` 调用指定模型 → 校验 source hash、退出状态和每条原文引用 → 仅当完整 receipt 小于原始内联结果且不超上限时替换 `content`。结构化 `value` 和实际退出码不变。压缩不是证据完整性的证明；receipt 会提示主模型按需读回日志。

原生日志已截断时，通过挂载的 `fs` 服务读取 `spillPath`，不会直接访问宿主文件路径。如果完整日志不可读或超过上限则跳过，不会把尾部预览描述成完整日志。stdout/stderr 以标签分段归档，不重建两条流的时间交错。校验后的引用具有原文行号和独立 SHA-256。原文与审计文件都交给宿主 spillStore，生命周期遵循该存储后端；审计包含 reducer 请求、响应、用量和校验结果。

| EPR 配置 | 默认值 | 含义 |
|---|---:|---|
| `enabled` | `false` | 是否启用 |
| `provider` / `model` | 跟随会话 | 高级覆盖时两项一起填写，使用宿主已有连接 |
| `reasoningEffort` | `off` | 必须被所选模型支持 |
| `minBytes` | 4096 | 源日志和当前内联结果的最低 UTF-8 字节数 |
| `maxBytes` | 600000 | 完整源日志上限，含 stdout/stderr 标签 |
| `maxOutputTokens` | 2048 | reducer 输出 token 预算 |
| `maxResponseBytes` | 32768 | reducer 流所有 JSON chunk 的累计字节上限 |
| `maxReceiptBytes` | 12000 | 完整 receipt（含元数据和定位符）上限 |
| `timeoutMs` | 90000 | 归档读取、reducer 与存储阶段的协作式截止时间 |

最多接受 12 条证据，每条引用最多 600 个 JavaScript 字符。引用必须逐字存在；失败日志中的失败证据还必须包含失败信号。不可验证、存储失败、供应商错误或超时都会保留原始结果。卸载插件会取消并等待正在进行的工作；宿主服务需遵循 AbortSignal。

启用 EPR 会把符合条件的完整日志发给所配置的 reducer。秘密检测是启发式过滤，不保证识别所有敏感内容。请为当前代码和日志选择合适的供应商。每次尝试都可能产生 reducer 费用，即使最终未采用 receipt；成功 receipt 与审计中记录供应商返回的用量。

## 与现有 Harness 能力的关系

继续使用原有 spill-policy、tool-result-pruner、compaction-basic 和 todo/goal；这一版不移植 ObservationPack 或 OCC，不增加第二套会话压缩控制器。

原生工具模式下 Action Fusion 可省去编辑与验证之间一次模型往返。Code Mode 已能连续调用工具，所以增量价值较小。普通 Code Mode bash 子调用不触发 EPR，因为程序读取的是原始结构化值；融合工具内部的 bash 可以压缩它的呈现内容。Code Mode 调用方若打印整个融合返回值，仍会打印其中完整的 canonical value，应只输出所需字段。

上下文和 KV-cache 的收益取决于实际工作负载；本插件没有做 DeepSeek 付费 A/B 测试，不承诺上游相同的成本下降。建议分别启用两个开关，对比任务完成率、模型往返次数、主模型 token/cache-read、reducer 用量和总耗时。

## 上游版本追踪

SoL-Pi 位于仓库级 Git submodule `vendor/SoL-Pi`，当前固定为 `22277b7e0c3c46ba1259a6687f31fe39ade421a5`。插件运行和 npm 包不依赖该目录；它用于源码对照和升级审查。MIT 归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

```bash
# 在 DSH-Workflow 根目录初始化已固定的上游
git submodule update --init vendor/SoL-Pi

# 在 sol-efficiency-plugin 中核对 checkout、父仓库 gitlink 和移植基线
npm run check:upstream
```

升级时先 fetch 上游，再比较 `upstream.json` 记录的 commit 与候选 commit。显式检出审核后的 SHA，完成相关移植和测试后，更新 `upstream.json`，将新 gitlink 与插件变更一起提交。不要直接把 metadata 改成最新 SHA 来消除检查错误。

## 开发验证

测试需要相邻 `deepseek-harness` 的依赖与构建产物。测试专用模块解析器只在测试进程中映射这些产物，不影响插件的安装和运行。

```bash
cd sol-efficiency-plugin
npm test
npm run demo
npm run check:upstream
npm pack --dry-run
```

测试通过真实 Cordis Loader 读取临时 YAML，装配原生文件、bash、spill、LLM runtime 和 agent loop；仅远程模型响应采用固定 fixture。包含错误与证据校验、原生观察策略、拒绝执行、文件竞争、取消/超时、卸载、Code Mode 及完整 agent 回合快照。`demo` 使用真实文件和命令但无需 API key，不验证供应商网络行为。
