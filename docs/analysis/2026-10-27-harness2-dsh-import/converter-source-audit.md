# xisnn/harness2-dsh 源码审计

核查日期：2026-10-27，Asia/Shanghai。转换器固定提交为 `56e77dccbb33d51ba1063eb5ae8c87fcd74771aa`，源码包版本为 `0.1.0`。Google Harness² 固定为 `1cfe254e8d25b15f37048c3730134686abe60335`。

本报告只审计源码与发布元数据。没有安装依赖、执行转换、运行模型或操作现役 DSH。原版 demo、上游测试及 rc.3 Host / preset / skill 验证由主报告单独记录。

## 核心判断

转换器可以把 OpenCode 形式的 Harness² 配置树转换成 DSH preset bundle。它不运行原版优化，不验证实验收益，也不迁移完整经验库。支持的主要产物是常驻提示、技能和脚本。子代理需要显式启用，运行时插件不转换。

“导入原版学习结果”应具体理解为导入实验选定配置中的部分能力文件。`EXPERIENCE.md` 的经验正文、证据和采用理由不会进入生成 bundle，也不会自动成为 DSH 可检索的项目经验。

## 1. 输入格式只覆盖 OpenCode surface

转换器硬编码四个常驻文件：`systemprompt.md`、`guardrails.md`、`LongTermMEMORY.md` 和 `tool_descriptions/tool_guidance.md`。至少存在其中一个才被识别为配置树。技能路径硬编码为 `skills/<name>/SKILL.md`。

原版 OpenCode surface 使用这些路径，因此结构相符。原版 Codex surface 则使用 `AGENTS.md`、`.agents/skills` 和 `.codex/hooks.json`。转换器没有对应分支。只有 Codex 文件的树会被拒绝；若另有可识别文件让加载通过，Codex 部分仍不会搬运。

来源：[转换器路径定义](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L35-L41)、[树识别与技能读取](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L144-L192)、[原版 OpenCode surface](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/substrate/opencode.py#L42-L63)、[原版 Codex surface](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/substrate/codex.py#L39-L74)。

转换器也没有调用原版 `read_tree` / `validate`，而是独立按目录和扩展名读取。它不会继承原版完整的合法路径、常驻字符预算、技能触发、脚本引用和插件验证。

## 2. library entry 可定位，run summary 解析有范围限制

它接受四种入口：直接配置目录；带 `EXPERIENCE.md` 的 library entry；有 `summary.json` 的任务目录；恰好只有一个条目的领域库。

对 run summary，它按 `selections` 的 mode 名排序，寻找 `summary 同目录/harnesses/<chosen_label>`。没有选择记录时，回退到 `modes.*.finals` 中最后一个存在的目录。它不检查 summary 的成功状态、selection.ok、fallback、配置指纹或原执行产物是否完整。因此，定位成功不表示这是已完成、无回退或已验证收益的实验。

原版把 summary 固定写在 agg 命名空间目录中，但 seq 配置写在独立 seq 命名空间。转换器不根据 mode 推导另一目录，也不读取 `chosen_run_dir`。因此，原版 seq-only 的 summary 入口不能按此逻辑找到选定配置；both 模式通常先拿 agg，无法通过 CLI 指定 seq。直接给出 seq 的配置目录，或给出相应 library entry，可绕过这一定位限制。这是两边目录代码对照所得的静态结论，实际输入验证见主报告。

来源：[输入解析](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L246-L305)、[原版命名空间](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/schedule.py#L84-L102)、[原版 summary 位置](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/schedule.py#L600-L609)、[各模式配置目录](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/schedule.py#L480-L510)。

转换器的目录解析测试使用手写简化目录，没有从真实原版运行输出创建 fixture。这解释了源码测试覆盖入口名称，却没有建立真实所有命名空间布局都兼容的证据。

来源：[简化布局测试](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/tests/test_resolve.py#L33-L104)。

## 3. EXPERIENCE.md 不搬运，出处只有文本路径

`EXPERIENCE.md` 只在定位 library entry 时用 `.is_file()` 检查。加载器没有读取它；转换结果也没有写出它。原版经验中的 cue、lesson、evidence、confidence、配置改动解释和采用原因，都不会自动保留到新 preset。

输出文件是 `package.json`、`cordis.patch.yml`、`README.md`、技能及脚本。生成 README 记录原配置目录路径和入口类别，但不记录上游完整 commit、配置指纹、实验 ID、选定执行 ID、证据副本或原经验正文。搬迁后，原目录路径可能已经不可用。若只保留转换 bundle，无法用它重建原版实验的证据链。

来源：[EXPERIENCE 仅作定位](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L265-L268)、[转换输出文件集](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L379-L405)、[生成 README](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L446-L492)、[原版经验内容](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/library.py#L106-L151)。

`LongTermMEMORY.md` 会进入 persona 中的 MEMORY 段。它与 library entry 外侧的 `EXPERIENCE.md` 是不同文件，不能把这两种情况混为一谈。

## 4. 组件怎样映射

| 输入 | 输出与限制 |
|---|---|
| 四个常驻文件 | 按原顺序拼成 persona prefix；默认 append，replace 设置 persona.complete=true；不是一对一保留原文件 |
| skills | 重写为 name/description 两个 frontmatter 字段，正文保留；缺 description 时从正文生成；其他 frontmatter 字段不保留 |
| skill scripts | 复制 scripts 子目录中的文件，按 UTF-8 文本读写；不安装脚本运行依赖 |
| 顶层 scripts | 只读 scripts/ 直接子级的 *.py，复制到生成包；提示说明所在位置；不执行、不检查环境 |
| sub_agents | 默认不转换；启用后生成 child preset 和 subagent 工具；子 preset 只挂自己的 persona 与基础工具，不共享父 preset 的技能目录 |
| plugin/*.ts | 只列出文件名并警告，不复制或注册 |
| 其他文件 | 不自动搬运；不是通用目录镜像 |

来源：[常驻提示拼接](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L130-L172)、[技能输出](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L175-L196)、[组件读取](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L162-L230)、[脚本复制](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L210-L217)、[子代理转换](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L319-L360)、[插件跳过](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L220-L228)。

默认工具集合是转换器自己的固定清单，包括 agent instructions、time context、bash/pwsh、fs、search、jobs 和 todo。它不复刻原版工具 schemas，也不自动继承我们现役 Agent 全部插件与工具。脚本和提示中的原工具名、相对路径和调用约定也不被改写。配置内容能加载，仍需在 DSH 中验证它引用的工具和资源实际可用。

来源：[固定基础工具](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L49-L66)、[常驻提示拼接](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L130-L172)。

### 技能重命名的两个限制

下划线会归一化为连字符，并重写 SKILL.md 的 name。原正文和原常驻提示中的旧名称、旧路径不会同步改写。转换器会额外增加使用新名称的 AVAILABLE SKILLS 提示，但旧引用仍在。

名称归一化也没有碰撞检查。原版允许 `a_b` 和 `a-b` 这两个不同名称，两者会被转换成同一 `a-b` 目录；写入函数按规范化名称输出，后写内容可能覆盖先写内容。子代理 ID 也可能产生相同归一化问题。这是代码推断，本报告未创建专用复现或修改测试。

来源：[名称规范化](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L50-L64)、[技能输出](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L175-L196)、[原版名称规则](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/harness2/core/tree.py#L37-L70)。

frontmatter 解析器只处理平面的 `key: value`，不是完整 YAML parser。多行 description 或复杂元数据不应按字节等价迁移理解。

来源：[简单 frontmatter 解析](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/tree.py#L75-L86)。

## 5. 路径搬迁和依赖

main 的默认 `skill_path_mode` 是 package。生成的 `!!js` 表达式通过 Loader 的 `baseUrl` 创建 Node resolver，按自身包名找到 package.json，再找到 skills/。它避免把转换输出位置固定进启动 patch，但要求 profile 的模块解析能够找到生成包。

absolute 模式直接写当前绝对路径，只适合同一位置。dsh-home 模式从输出路径推导相对目录，要求部署位置符合该规则，不适用于任意路径搬迁。

来源：[路径模式](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L71-L95)、[技能目录表达式](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L296-L317)、[包名解析表达式](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L417-L433)、[dsh-home 路径推导](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L408-L414)。

“可搬迁”只针对加载表达式。生成 README 仍写安装时输出目录和原输入目录的绝对路径；原输入文本中已有的绝对路径也原样保留。因此 README 所称“bundle 不含任何机器路径”比实现范围宽。实际应说：默认技能加载位置不依赖生成机器的输出路径。

来源：[生成 README](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L446-L492)、[常驻提示拼接](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L130-L172)。

Python 工具本身没有运行时依赖，要求 Python 3.10+。生成 bundle 没有 dependencies / peerDependencies，也没有 Node / DSH 版本声明。它依靠宿主提供 preset、persona、文件技能、shell 等插件，并不会自动补齐 Python 或辅助脚本依赖。

来源：[Python 包声明](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/pyproject.toml#L1-L25)、[生成 bundle manifest](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L387-L398)、[固定基础工具](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L49-L66)。

## 6. preset 的发现和切换

bundle 注册 `@deepseek-ai/dsh-agent-preset`，不直接修改当前 Agent。生成 README 要求安装后在新会话选择 preset。作者特别注明 preset 服务存在于 Web profile，headless 不能直接挂载。使用 SDK/headless 测试时，需要显式准备支持 agentPresets 的 profile，不能把 bundle 的 YAML 解析成功当作 preset 已对 Agent 生效。

来源：[preset 注册](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L362-L377)、[新会话选择提示](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L454-L461)、[profile 前提](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/README.md#L130-L132)。

可选子代理由 `dsh-tool-subagent` 注册，使用 `spawn` provider 与限定 child preset ID。这证明它生成的是 DSH 的子代理配置；尚需当前宿主的 provider 和对应注册服务满足契约。原版 OpenCode 的 task 工具调用描述不会自动改成 DSH 的 subagent 调用描述。

来源：[子代理转换](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L319-L360)、[固定基础工具](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/src/harness2_dsh/convert.py#L49-L66)。

## 7. 测试和发布状态

源码测试覆盖 YAML emitter、组件解析、转换目录、名称、输入入口和 CLI。CI 定义了 Ubuntu、Windows、macOS 以及 Python 3.10、3.12、3.13 的矩阵，还构建 wheel 并测试 CLI。CI 本身不安装或运行 DSH，所以这些测试不能证明 rc.3 的 preset、persona 或技能实际生效。

CHANGELOG 写 0.1.0 有 72 项测试，同时把默认 package 路径和可搬迁行为列在 Unreleased。主报告应使用本地实际运行的测试总数，而不是把 CHANGELOG 数字当作当前实测。

来源：[CI 测试范围](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/.github/workflows/ci.yml#L9-L51)、[转换测试](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/tests/test_convert.py#L45-L169)、[简化布局测试](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/tests/test_resolve.py#L33-L104)、[发布与未发布记录](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/CHANGELOG.md#L7-L40)。

本次只读发布查询结果：

| 查询 | 返回 |
|---|---|
| GitHub releases collection | 空数组 |
| GitHub refs/tags/v0.1.0 | 404 |
| PyPI harness2-dsh JSON API | 404 |

因此，目前查到的是可从固定提交运行的源码，不能根据 README 的 `pip install harness2-dsh` 宣称存在可下载的 PyPI 发布。源码 version=0.1.0 和 CHANGELOG 标记不是发布证据。

查询来源：[GitHub releases](https://api.github.com/repos/xisnn/harness2-dsh/releases)、[GitHub tag ref](https://api.github.com/repos/xisnn/harness2-dsh/git/ref/tags/v0.1.0)、[PyPI API](https://pypi.org/pypi/harness2-dsh/json)。

## 结论适用范围

从源码判断，OpenCode 形式的配置、技能和部分脚本具备进入 DSH preset 的明确映射。原版 Codex 树、完整经验库、运行时插件和任意工具语义没有直接覆盖。是否能在当前 rc.3 真正加载并使用，应以主报告的实际 Host、preset、提示和技能证据为准。

转换成功只证明文件生成。原版实验收益也需要在 DSH 中重新验证；本转换器没有质量评估、项目采用、经验使用开关或按工作区管理经验的功能。
