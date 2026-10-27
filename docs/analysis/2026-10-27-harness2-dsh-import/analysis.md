# 原版 Harness² 结果导入 DSH rc.3 的验证

核查日期：2026-10-27，Asia/Shanghai。

## 当前判断

`xisnn/harness2-dsh` 能把原版 Harness² 的 OpenCode 配置树转换成 DSH Agent preset bundle。实际运行原版 demo 后，对应顺序模式的 library entry 已转换成功，导出的 Python 脚本与原产物逐字节相同。[转换实现][converter]

**当前固定源码生成的完整 preset，不能原样在我们的 DSH 0.2.1-rc.3 中激活。** 真实 Host 初始化成功后，preset 注册表把原版产物 preset、组件夹具 preset 和子 preset 都标为 broken。共同原因是转换模板挂载 `dsh-tool-todo` 时，没有提供 rc.3 必填的 `allowParallelInProgress`。[模板][tool-template]、[rc.3 配置要求][todo-config]、[实际 Host 结果](evidence/native-host-result.json)

转换器只导出选定配置中的部分能力文件。它不会导入 `EXPERIENCE.md` 的经验正文、执行证据、采用理由或完整经验库；`LongTermMEMORY.md` 则会拼入 persona。两种文件必须区分。[输入解析][tree]、[常驻文本转换][persona]

本次没有修改第三方源码、转换模板或生成包，也没有创建兼容补丁。现役 DSH 服务、用户 profile、项目插件清单和锁文件均未因本次验证改变。

## 版本与环境

| 对象 | 固定输入 |
|---|---|
| 转换器 | `56e77dccbb33d51ba1063eb5ae8c87fcd74771aa`，源码版本 `0.1.0` |
| Google Harness² | `1cfe254e8d25b15f37048c3730134686abe60335` |
| 工程起点 | `5c0571a2a7f24df6f652b6778ba624183a8488c8` |
| 当前 DSH | `0.2.1-rc.3`，`1f81c047fc48fa190a683e469daa699857e9afe8` |
| Host Node.js | 已安装应用中的 `24.12.0` |
| Python | 现有解释器 `3.12.14` |
| 测试工具 | 临时虚拟环境中的 pytest `9.1.1`、Ruff `0.17.3` |

转换器运行本身没有第三方 Python 依赖。测试环境只在 `/private/tmp/harness2-dsh-import-audit-20261027/` 下准备，没有向项目或 DSH 运行环境安装测试依赖。完整命令、退出码和耗时见[执行记录](evidence/checks.json)，源码身份与摘要见[来源记录](evidence/sources.json)。

当前 PyPI 查询返回 404，不能按 README 的 `pip install harness2-dsh` 当作已发布发行包使用。本次直接从固定提交源码运行 CLI。完整发布状态与源码审计见[源码报告](converter-source-audit.md)、[PyPI 查询结果](evidence/pypi-status.json)。

## 验证过程与真实结果

| 阶段 | 输入与断言 | 结果 |
|---|---|---|
| 原版运行 | 原样执行 Google 无模型 demo，parallel 和 sequential，`k=1` | 退出 0；两个任务完成，失败数为 0；实际执行 14 次 |
| 转换器上游测试 | 当前固定源码的全部 pytest | 退出 0，75 项通过 |
| 上游静态检查 | `ruff check --no-cache .` | 退出 0 |
| 真实结果转换 | 原版 seq library 的 ledger-1 entry | 退出 0，生成提示与脚本 preset |
| 原版 agg 运行目录 | 从真实 summary 定位选定配置 | 退出 0，选中 agg1 |
| 原版 seq 运行目录 | 直接传入 seq 任务运行目录 | 退出 2，无法定位配置树 |
| 原版 seq 具体配置 | 传入 `harnesses/c1` | 退出 0，可识别 |
| Codex 格式输入 | 只有 AGENTS.md 和 .agents/skills 的结构夹具 | 退出 2，不识别该 surface |
| 组件映射 | 上游夹具含两个技能、技能脚本、子代理和 OpenCode 插件 | 退出 0；技能重命名、子 preset 生成，插件被警告跳过 |
| rc.3 实际 Host | 启动独立 SDK Host、加载注册表和原样生成的 bundle | Host 初始化成功；preset 激活失败，验证命令退出 1 |
| 导入脚本独立执行 | 在已移动 bundle 中运行原版学习后的 summarize.py | 退出 0，输出 `Total: 85.15` |

原版 demo 使用确定性编辑器和真实 Python 任务执行，不调用付费模型。这里的“真实原版产物”指原版核心实际运行后选定、写入 library 的文件，不表示已经验证了真实模型学习收益。[原版 demo][google-demo]

组件夹具只验证转换器对技能、名称和子代理的结构映射，不把人工夹具称为原版模型学出的技能。真实原版 demo 的选定配置没有技能文件，只有常驻提示和 Python helper。

## rc.3 激活失败的原因

转换模板固定包含如下基础工具行：

```yaml
- id: tool-todo
  name: '@deepseek-ai/dsh-tool-todo'
```

DSH rc.3 的工具配置声明则要求：

```ts
allowParallelInProgress: z.boolean().required()
```

因此，真实 registry 诊断为：

```text
tool-todo (@deepseek-ai/dsh-tool-todo): invalid config:
  - $.allowParallelInProgress missing required value
```

错误发生在 preset 激活阶段。SDK 初始化成功、包目录存在和 YAML 被解析，都不能代替 preset 可用性。生成的子 preset 使用同一份基础工具清单，所以也受到影响。[转换模板][tool-template]、[子 preset 生成][subagents]、[rc.3 schema][todo-config]

实际测了两类父 preset：一类来自原版实际运行产物，另一类来自转换器上游组件夹具。新会话复验时，两者均被同一错误拒绝；注册表中第三个子 preset 也报告相同错误。详见[最终诊断](evidence/native-host-result.json)、[协议记录](evidence/native-host.protocol.jsonl)。

本次没有补写该配置，也没有删除 Todo 行后继续试跑。修改这一处后是否还存在其他兼容问题，仍需新的上游版本或后续验证建立证据。

## 已确认可以搬运的内容

| 原版内容 | 当前转换行为 | 本次证据范围 |
|---|---|---|
| systemprompt、guardrails、LongTermMEMORY、tool guidance | 按顺序拼入 DSH persona prefix | 生成文件已检查；模型请求中的实际注入未验证 |
| skills/SKILL.md | 重写 name 和 description，保留正文 | 两个技能夹具转换成功；DSH 运行时发现和加载未验证 |
| 技能内 scripts | 按 UTF-8 文件复制 | 输出文件存在；未由 DSH 技能工具执行 |
| 顶层 scripts/*.py | 复制进生成包，并在 persona 中提示所在包 | 真实原版脚本字节一致，独立 Python 执行正确 |
| sub_agents | 显式启用后生成 child preset 和 subagent 工具 | 子 preset 可被注册表列出，但激活失败 |
| OpenCode plugin/*.ts | 警告后跳过 | 夹具明确报告一个插件未转换 |
| EXPERIENCE.md | 只检查文件是否存在，用于定位 library entry | 生成文件清单中没有该文件，正文也未搬运 |
| Codex AGENTS/.agents/.codex | 没有对应读取分支 | Codex 格式夹具被拒绝 |

详细映射、文件名规范化和元数据损失见[源码审计](converter-source-audit.md)。

## 使用边界

### 优先指定选定配置目录或 library entry

原版 parallel 与 sequential 的命名空间不同，summary 固定写在 agg 命名空间。转换器只在 summary 同级寻找 harnesses，不会自动跳到 seq 命名空间。both 模式会优先按排序找到 agg，CLI 也没有选定 seq 的参数。[入口解析][resolve]、[原版 summary 位置][google-summary]

本次已复现：真实 seq 任务目录无法识别，而对应的 library entry 和具体 `harnesses/c1` 可以识别。要导出顺序模式结果，应明确指定后两种入口，并另外核对原实验是否完成、是否发生 fallback、实际选定配置是哪一个。转换器本身不完成实验验收。

### 包目录可移动不等于路径已经全部适配

默认的 package 路径表达式按生成包名解析 skills 目录。测试中先把两个 bundle 移到新目录，再把包链接放到隔离 profile 的模块解析位置，原生成目录已经不存在。[包路径表达式][package-path]

Host 依然能加载定义并返回 preset 诊断，但激活被 Todo 配置阻断。因此，本次不把“移动后技能目录实际可用”记为通过。生成 README 中的源目录绝对路径、原提示中的脚本相对路径和旧工具名，也不会自动改写。

复制 helper 文件只保证文件在包内。原版提示可能仍写 `python scripts/summarize.py`，而任务当前目录没有该路径。是否能正确找到包内脚本、是否具备解释器和脚本依赖，必须另行验证。此次独立脚本执行明确指定了包内脚本路径，不能冒充 Agent 自行定位和调用通过。

### 导出配置不等于导入项目经验管理

`LongTermMEMORY.md` 和 `EXPERIENCE.md` 分别表示配置内的记忆文本与实验经验记录。前者进入 persona，后者不会导入。生成 bundle 也不记录完整原版 commit、实验 ID、选定 run ID 或配置指纹，只在 README 中留下源目录文字。

这套工具可以作为显式导出的候选环节，但没有项目采用、经验使用开关、工作区隔离或撤回管理。它不能替代本项目的[项目采用决定](../../adr/0006-separate-learning-adoption-and-use.md)、[显式导出边界](../../adr/0008-plugin-managed-project-experience.md)和[工作区隔离](../../adr/0010-isolate-learning-by-workspace.md)。

## 未通过与未验证项

- 当前生成 preset 的 rc.3 激活未通过。
- 提示进入真实模型请求、技能目录发现、skill 工具加载和 DSH bash 执行 helper，均未到达。
- 未调用外部模型，没有真实模型任务成功率、质量或成本 A/B。
- 未打开 Web/桌面界面，也未执行现役 profile 的插件安装。
- 未证明完整项目环境、任意代码任务或二进制技能资产能够迁移。

Host 使用官方 SDK profile，加上 rc.3 原生 preset 注册表，所有操作在独立 home、工作目录和会话中完成。确定性测试 provider 已准备，但 preset 激活失败前没有进入模型推理。最终 Host 通过 shutdown 正常退出，退出码 0，没有强制清理。验证命令退出 1 表示导入使用未通过，不把 Host 正常退出写成测试通过。

一次诊断复用首次失败留下的测试 Session ID，因会话已存在而失败。随后改用新的测试 Session ID 复验，两个父 preset 均复现 Todo 配置错误。此前记录保留在 evidence 中，测试会话冲突不作为转换器缺陷。

## 建议

当前可以确认：OpenCode 形式的原版选定配置能够转换和搬运；当前转换器生成的完整 preset 尚不能直接用于我们的 rc.3。

下一步应由上游适配 rc.3 的基础工具配置，再重新验证 preset 激活、提示注入、技能加载、脚本定位和实际任务。不能只补一个字段就宣布全部兼容。原版 Codex surface、EXPERIENCE 正文迁移和 OpenCode 插件映射是另外的能力缺口，不能归入同一个配置修复。

本仓第三方源码保持上游原样。本次只保存报告、生成样例与验证证据，没有安装到现役服务，没有修改工程清单、锁文件或并行依赖升级的改动。

[converter]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py
[tool-template]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L49-L66
[todo-config]: https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/todo/tool-todo/src/index.ts#L28-L43
[tree]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py
[persona]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L130-L172
[subagents]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L319-L360
[resolve]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L246-L305
[package-path]: https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L417-L433
[google-demo]: https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/cli/demo.py
[google-summary]: https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/schedule.py#L600-L609
