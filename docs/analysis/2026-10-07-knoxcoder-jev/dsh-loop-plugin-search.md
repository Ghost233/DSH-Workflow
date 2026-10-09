# DSH 已有的 Jev 停滞与进展检测插件

调研日期：2026-10-07。窄范围只读当前作者 README 与固定提交源码，不安装、不运行、不改第三方，不读取 Issues，也不重复技能/上下文模块分析。GitHub 读取使用公开页面与无需认证的公共源码/API，没有执行 gh。

## 结论

**有现成 DSH 插件做 Jev 语义停滞/进展判断，不能把此需求整体说成必须自研。** 已核实两个自动工具结果判断实现，以及一个原生目标监督实现。但“识别停滞”“提醒主 LLM 换思路”和“真正暂停目标”是不同动作；这些代码没有自动生成全新策略或自动切强 LLM。本仓库兼容性、默认装配与是否启用未验证。

| 项目 | 触发与判断 | 代码实际行动 | 关键边界 |
|---|---|---|---|
| [zhangxaochen/dsh-jev](https://github.com/zhangxaochen/dsh-jev)，`typesafe-loop-guard` | `tools/post-execute`；有界轨迹，Jev `has_progress` Noul + `stuck_severity` Score | 注入 `additionalContexts`，提醒检查近期结果、改变计划 | 名为 interrupt 的内部判定也返回 `kind:'accept'`；实际没有 hard stop |
| [xienda/dsh-jev-verify](https://github.com/xienda/dsh-jev-verify)，auto-guard loop | 连续相同工具、足够长结果；比较窗口首尾结果尾部，Jev `stalled` Noul | 注入语义停滞提示，仍 `kind:'accept'` | 直接跳过 `result.isError`，所以不能把它当重复失败命令的完整拦截器 |
| [luobosibing2/deepseek-harness-jev](https://github.com/luobosibing2/deepseek-harness-jev)，旧入口名 `dsh-jev-plugin` | 每若干已完成 model steps 的 drift 检查；goal round 末 progress/completion 判断 | 跑偏时非阻塞提醒；连续无进展或 needs-user 时暂停原生 goal | 十二项功能默认关，需显式启用；针对目标/证据进展，不是每工具回路都拦 |

## 1. zhangxaochen/dsh-jev：近重复轨迹的语义提醒

固定 SHA：`b672902c82f2599b92ad75ecc9f7b9118955f815`，package 0.2.0。[README](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/README.md)、[package](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/package.json)

元数据：Node `^22.19.0 || >=24.0.0`，`engines.dsh >=0.1.5-rc.2`；唯一 peer 是可选 `@deepseek-ai/cordis >=4.0.0`。有 `dsh.bundle.patch=./cordis.patch.yml`，web client 注入 `@deepseek-ai/dsh-client-ui-settings`。README 安装入口为 `dsh plugin --profile <profile_name> add github:zhangxaochen/dsh-jev` 或 `dsh plugin --profile headless add dsh-jev`。这只是作者契约；本次没有安装，也未证实可加载本机 DSH 0.2.1。[package](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/package.json)、[安装说明](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/README.md#install)

入口默认挂载 loop：`if (config.loopGuard !== false)`；bundle 也提供 loopGuard 配置，而不是禁用它。实际 hook 仍先检查全局 `isJevEnabled()`，所以已保存的全局关闭状态可以使其不判断；挂载默认开不等于用户当前 profile 一定在调用 Jev。[入口](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/src/index.ts#L61)、[hook全局开关](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/src/loop-guard.ts#L189)

源码先记录 tool、canonical args、content hash。默认 `deferExactRepeats:true`：同工具、同参数和同输出的精确重复直接交给 DSH 的 `repeat-tool-reminder`，不是用 Jev 多做一次精确去重。其余轨迹经过触发步数/cooldown 规则才向 Jev 求是否有实际新增信息，以及三档停滞 Score。[loop-guard.ts](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/src/loop-guard.ts#L186)

判定要求进展概率低、死循环桶概率高及 Score confidence 足够。bundle 默认 `noProgressThreshold=0.3`、`pLoopThreshold=0.6`、`minConfidence=0.5`、trigger=2、history=8、cooldown=3。[纯判定函数](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/src/loop-guard.ts#L110)、[bundle 配置](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/cordis.patch.yml)

**README 的“blocking”要按实际 hook 解读。** 函数把 `pLoop>=0.85` 命名为 `interrupt`，低一些命名为 `warn`；但两个分支最后都返回 `kind:'accept'` 并附同一种纠偏提示。没有 pause/cancel/deny，也不删除结果或切换模型。不可用回答保持安静，异常继续原流程。[实际返回](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/src/loop-guard.ts#L312)

作者明确公开整个 suite 在20个真实 DeepSWE任务上的 A/B pilot **未显示优势**；还有冷暖延迟/逐turn额外判定开销记录。这使它成为可研究的已实现模块，不是已证明能改善所有任务的加速插件。[README status 与 live turn](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/README.md#dsh-jev)

测试证据分层：README 的 `verify:live` 记录真实 loop `pLoop=0.88/confidence=0.81` 可触发、健康轨迹 `pLoop=0` 不触发；`bench:offline` 是回放已录答案，不是再次真实API测试。CI 描述为 Node22/24 的 build/test/录制答案回放/打包，`verify:dsh` 在无DSH时会 skip并exit0，所以不能把绿色CI等同于本机0.2.1宿主运行验证。本次没有重跑这些检查。[Development](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/README.md#development-and-verification)

## 2. xienda/dsh-jev-verify：相同工具结果的语义停滞检测

固定 SHA：`fef0c9eeb6c77d3be4d0f7c8b14be484e0161315`。[README](https://github.com/xienda/dsh-jev-verify/blob/fef0c9eeb6c77d3be4d0f7c8b14be484e0161315/README.md)

autoGuard 默认禁用，loop 子开关默认 true；默认同工具连续3次，每个结果至少200字符，检查有模型预算与60秒 cooldown。Jev 比较最新与窗口第一个输出各尾部1200字符，问是否无实质进展。[judgeStall](https://github.com/xienda/dsh-jev-verify/blob/fef0c9eeb6c77d3be4d0f7c8b14be484e0161315/lib/guard.js#L63)

概率达阈值就注入改策略提示，仍接受本次已执行结果；失败原样继续。它不是参数 hash 去重，确实调用 Jev 做语义比较；但只看有限同工具窗口，且 `result.isError` 直接跳过，所以对多工具交替尝试、真正失败输出及长跨度策略失败有明显覆盖边界。[post-execute hook](https://github.com/xienda/dsh-jev-verify/blob/fef0c9eeb6c77d3be4d0f7c8b14be484e0161315/lib/guard.js#L169)

## 3. deepseek-harness-jev：目标进展监督与暂停

固定 SHA：`3ee4fb18861715a48f377865df15b5a6e730872e`。读取旧入口 `luobosibing2/dsh-jev-plugin` 时，作者 README 已将项目名列为 deepseek-harness-jev，内部 package/import 仍 `@dsh-jev/plugin`。不要把这两个名称当成两个独立插件。[README](https://github.com/luobosibing2/deepseek-harness-jev/blob/3ee4fb18861715a48f377865df15b5a6e730872e/README.md)

它比局部同工具回路更接近“是否一直做无用调查”：`evidence()` 对当前/前一 goal round 的记录构建状态，typed choice 选 progress/no-progress/needs-user/unknown，并选支持判断的 evidence。规则说明必要调查、排除相关假设也算进展，不把“没照提醒做”自动算停滞。[问题与证据](https://github.com/luobosibing2/deepseek-harness-jev/blob/3ee4fb18861715a48f377865df15b5a6e730872e/packages/jev/src/supervision.ts#L119)

goal active 时，在 `agent/turn-stopping` 判新一轮证据。progress 清零，no-progress 累加；needs-user 或达到配置次数（默认3）调用 `ctx.goals.pause()`，记录原生暂停与原因。未知/不确定并不直接作为 no-progress 加分。drift 默认每6个已完成 model steps 后检查，可给一条非阻塞提醒。[goal round hook](https://github.com/luobosibing2/deepseek-harness-jev/blob/3ee4fb18861715a48f377865df15b5a6e730872e/packages/jev/src/supervision.ts#L299)、[drift调度](https://github.com/luobosibing2/deepseek-harness-jev/blob/3ee4fb18861715a48f377865df15b5a6e730872e/packages/jev/src/supervision.ts#L274)

这是真正暂停原生目标的实现，但不等于给下一次复杂问题选强模型；仍须验证当前 DSH goal/turn接口、人工恢复与权限语义。所有功能默认关，不宜把存在代码当成本项目已经有其行为。

## 与 DSH 精确重复规则的分工

精确同调用、同结果可由本地确定性计数/hash判断，无需 Jev。Jev 的增量是在近重复、多次调查没有新增证据、策略停滞等语义问题上提出有限建议或目标暂停。现成插件已经覆盖部分增量需求，但如果本项目想规定“连续几次失败后换模型/重新规划/请求Owner决策”的完整控制策略，仍需由本项目集成层明确连接，不能把提醒插件当作自动策略执行器。

本次足够证据后结束检索；未读取 Issues，未验证实际安装兼容性或性能，未用目录描述代替上述源码结论。
