# DSH 现成插件与需要自研的部分

调研日期：2026-10-07。补充 KnoxCoder 分析，回答“上下文评分、语义重复失败和技能建议已有插件吗”。本轮只读源码与 npm registry 元数据；没有安装、改清单/锁文件、启用功能、重启服务或运行真实模型。

## 结论

**有现成插件，不能把需求整体说成必须自研。** 最接近组合需求的是 zhangxaochen/dsh-jev 0.2.0；工具输出精简与技能推荐还可以看 HorusJiang/dsh-jev-tools；长期历史回收可看 dsh-jev-prune 0.1.1。优先做已有插件的当前宿主兼容与小范围效果验证，再决定有没有缺失的项目策略需要自研。

## 当前候选

| 项目 | 已核实的相关功能 | 仍需核实/补充 |
|---|---|---|
| [zhangxaochen/dsh-jev](https://github.com/zhangxaochen/dsh-jev) 0.2.0 | 自动语义停滞提醒；技能提示；按任务筛工具目录；可选工具结果 shaper | 本机 DSH 0.2.1 加载未验证；result-shaper 默认关闭；整个 suite 的真实 A/B 未显示稳定收益 |
| [HorusJiang/dsh-jev-tools](https://github.com/HorusJiang/dsh-jev-tools) 0.1.13 | 长工具结果分段相关性排序与精简；每轮技能提示；prune.shadow 观察模式 | 兼容元数据只列 DSH 0.1.6-alpha.2，依赖旧 dsh-skills 名称；不能据 wildcard peers认定新版已可用 |
| [yangyu666/dsh-jev-prune](https://github.com/yangyu666/dsh-jev-prune) 0.1.1 | 自动旧工具结果裁剪与确定性回执；新版支持根和 Agent preset 内服务 | 作者验证安装/激活至 DSH 0.2.0-rc.2；真实 Jev 判断质量、长任务收益与本机0.2.1仍需验证 |
| [PerryLink/jevcore](https://github.com/PerryLink/jevcore) / jevcore-dsh | 给插件直接调用的 Jev 服务与通用 ask/rank/check 工具 | 业务触发与控制策略仍需调用方写；本次 registry latest 0.4.1 的 peers 仍排除 DSH0.2，不将源码中的更新当成已发布可安装版本 |

本轮通过 registry JSON 确认 `dsh-jev latest=0.2.0`、`dsh-jev-tools latest=0.1.13`、`dsh-jev-prune latest=0.1.1`、`jevcore-dsh latest=0.4.1`。这是版本存在和元数据检查，不是安装验证。`dsh-jev` 名称也有 buberlo 的归档项目，本轮推荐对象明确为 zhangxaochen 仓库；npm latest 的 repository 元数据指向该仓库。[npm dsh-jev](https://www.npmjs.com/package/dsh-jev)、[npm dsh-jev-tools](https://www.npmjs.com/package/dsh-jev-tools)、[npm dsh-jev-prune](https://www.npmjs.com/package/dsh-jev-prune)、[npm jevcore-dsh](https://www.npmjs.com/package/jevcore-dsh)

## 语义停滞已经有实现

zhangxaochen 固定提交 `b672902c82f2599b92ad75ecc9f7b9118955f815` 的 loop-guard 监听 `tools/post-execute`，问 `has_progress` Noul 与 `stuck_severity` Score，并注入纠偏提示。精确同工具/参数/输出重复默认留给 DSH 的本地规则。

要按源码理解其 README 的“blocking”：内部名为 interrupt 的结果仍返回 `kind:'accept'` + additionalContexts，不真正 cancel/暂停/切强LLM。因此它已经实现“提醒主模型换思路”，尚不是自动重新规划或升级模型的控制器。[实际 hook](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/src/loop-guard.ts#L312)、[独立调研笔记](./dsh-loop-plugin-search.md)

README 明确披露20个真实 DeepSWE 任务的全套插件开关 A/B：没有稳定整体优势，也没有净 token 节省。这个实验没有单独隔离 loop-guard 的贡献，不等于证明该模块无效；它足以阻止把完整 suite 推荐为已验证的通用加速器。[作者报告与复现入口](https://github.com/zhangxaochen/dsh-jev/blob/b672902c82f2599b92ad75ecc9f7b9118955f815/README.md)

## 工具输出精简与技能推荐也不需要从零写

HorusJiang 固定提交 `10ea6068fc15db7d8bf86efd151e82d55e83c376` 的入口注册 `tools/post-execute` 的 prune listener 与 `agent/pre-step` 的 skill-suggest listener；这些路径由代码自动调用后端，不要求主 LLM先生成 Jev 工具请求。[入口](https://github.com/HorusJiang/dsh-jev-tools/blob/10ea6068fc15db7d8bf86efd151e82d55e83c376/src/index.ts#L159)

长结果分段评分后按预算保留，首尾和高分段有确定性保底；shadow 仅报告原本会裁多少。技能建议按最新任务、可见技能目录、会话预算和 confidence 决定是否注入一条提示。它是返回原始结果之外的新判断路径，仍需验证格式、证据保留和真实额外延迟。[prune](https://github.com/HorusJiang/dsh-jev-tools/blob/10ea6068fc15db7d8bf86efd151e82d55e83c376/src/features/prune.ts)、[skill-suggest](https://github.com/HorusJiang/dsh-jev-tools/blob/10ea6068fc15db7d8bf86efd151e82d55e83c376/src/features/skill-suggest.ts)

版本0.1.13的 manifest兼容表仅列0.1.6-alpha.2；peers 中包含 `@deepseek-ai/dsh-skills`，当前本地源码技能包为 `@deepseek-ai/dsh-skill`。模块可以软注入并降级，不表示新版技能能力一定工作。本文不把未实际加载的兼容性猜测写成已通过。[manifest](https://github.com/HorusJiang/dsh-jev-tools/blob/10ea6068fc15db7d8bf86efd151e82d55e83c376/package.json)

## dsh-jev-prune 的兼容性结论已更新

之前评估基于0.1.0/`7ab713a…`，那时旧peer范围和根服务装配是明确障碍。现在 main `c00e6b8382449bb437a4a8bf5ed579f807362ccd`、已发布0.1.1的tools peer为 `^0.1.5-rc.2 || ^0.2.0-rc.2`，增加通过 `serviceForAgent` 解析预设内实例的逻辑。不能继续用旧版结论断言新版必然拒绝。

作者compatibility记录2026-10-06真实CLI档案安装、Web启动、创建空standard Agent并确认服务接管。验证不发送任务、不调用真实模型，因此支持安装/装配声明，不支持判断质量或长任务速度。已检查registry0.1.1存在；没有在本机复跑。[新版manifest](https://github.com/yangyu666/dsh-jev-prune/blob/c00e6b8382449bb437a4a8bf5ed579f807362ccd/package.json)、[新版兼容证据](https://github.com/yangyu666/dsh-jev-prune/blob/c00e6b8382449bb437a4a8bf5ed579f807362ccd/docs/compatibility.md)

之前对0.1.0具体选择器和缓存的发现只针对那个版本。新版已调整部分事务归属机制；本文没有重新审计其所有算法，不能自动宣称所有旧问题仍在或全部修复。

## 是否要自研

目前建议先验证现成插件，按需求选择功能，避免几个插件同时修改同一段工具结果。项目特定的“命中停滞后如何重新规划、哪些开发证据永不释放、是否改变模型”仍可能需要一个小的自研集成层；不需要把整个JeV客户端、技能建议与循环检测重写一遍。

现有仓库约束要求第三方源码保持原样。兼容验证失败时如实记录，采用上游兼容版本或独立自研集成方案，不借此修改、恢复第三方修复补丁。本文没有开展安装或服务切换。[维护范围](/Users/ghost233/Ghost233Code/DSH-Workflow/AGENTS.md)
