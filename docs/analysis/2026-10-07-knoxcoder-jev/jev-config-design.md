# JEV 配置与代理监控：设计访谈

2026-10-07。使用用户明确调用的 grill-with-docs 完成设计访谈。用户在完整设计总结后回复“看起来没问题”，确认共同理解；当前分支的实现代码保持暂停，设计确认不是恢复开发的授权。

## 已确认

- 监控测试阶段只做检测、通知和原因记录，由用户决定后续处理，不自动中止、重试或换模型。
- 单独增加 JEV 引擎配置插件，按 DSH 标准方式配置 URL、凭据和判断模型。
- Q1：暂停指先停止当前分支的开发；设计访谈继续。
- Q2：可以保存多套配置。
- Q3：仅支持 TypeSafe System One / `/v1/systemone` 兼容协议。
- Q4：采用统一 JEV 中心；调用方指定 model 名字，中心选择对应配置发请求并返回结果；多套配置同时启用。没有全局唯一“当前配置”。
- Q5：保存配置不调用模型；独立的“测试连接”按钮发固定小判断题，显示结果、实际返回的模型版本和耗时，不发送代理会话内容。
- Q6：调用模型名默认沿用上游模型名，也可自定义为 quick/full/hard 等名字；上游请求仍使用实际的上游模型标识。
- Q7：配置不可用、超时或鉴权失败返回明确错误，不自动换其他配置。监控记录JEV判断不可用，确定性无输出和异常检测继续，不将JEV失败判断为主代理卡死。
- Q8：已发出的请求按原配置完成或超时；配置修改只影响新请求。
- Q9：已启用配置的调用模型名必须唯一；重名时提示改名，不自动选择第一套。上游模型名可以重复。
- Q10：监控插件在自己的设置中指定一个调用模型名，主代理和子代理共用；中心的其他配置可以同时供其他插件调用。
- Q11：允许停用/删除被引用的配置，明确显示语义检测不可用；确定性检测继续工作，在途请求遵循Q8。删除配置不自动删除DSH凭据。
- Q12：无输出检测改为按检查次数累计。默认每1分钟检查，连续5次无输出触发告警；检查间隔和连续次数均可配置。用户例子为第6分钟计第1次，第10分钟计第5次并告警，第11分钟仍无输出再告警，第12分钟恢复输出后清零。
- Q13：默认记录元数据、判断概率、耗时与错误原因；另提供默认关闭的调试片段记录开关。密钥和认证请求头始终不入日志。
- Q14：同意macOS系统通知、DSH内告警列表和持久日志；恢复只更新状态并记录时间，不再次弹窗。
- Q15：达到无输出阈值后逐检查轮次持续提醒；只去重同一轮内的重复事件，恢复输出后清零并停止提醒。
- Q16：正文、思考文字或工具调用参数新增均清零无输出计数；网络心跳和仅更新token统计不算输出。持续思考是否陷入循环由独立语义检测判断。
- Q17：每套JEV配置的请求超时可调整，默认5秒，不自动重试；超时只表示JEV判断不可用，不中止被监控代理。
- Q18：持续思考3分钟且没有新增正文或工具调用后开始语义检测，之后沿用检查间隔，默认每分钟一次；起始等待时间可配置，仅在请求仍在思考时调用。
- Q19：连续5次明确语义异常才告警，次数单独可配置；明确正常或未知/失败时清零语义计数。未知/失败显示判断不可用，不表示代理恢复；达到异常阈值后逐轮提醒，直到正常或结束。
- Q20：JEV无法调用时，在界面显示红色引擎不可用状态及原因，由用户手动排查；不干预正常代理流程。此要求取代此前“引擎不可用也发系统通知”的建议。普通子代理的可观测性已按Q21事实核验。
- Q21事实核验：用户要求仔细分析“不存在进展事件”的前提。普通DSH spawn/fork、官方Team默认成员均创建原生Agent，即使使用第三方LLM endpoint也发布agent/assistant-stream。撤回把特殊外部后端限制当成当前普通子代理需求的待选分支；本次按DSH原生主/子代理统一监控设计。

## 访谈结论

- 设计树前沿已为空，完整设计已由用户确认，本轮访谈结束。
- 未获恢复开发指令前继续保持代码暂停；未构建新启动器、未切换当前DSH服务。

用户随后调用 to-spec，已将完整设计整理为[正式规格 Issue #12](https://github.com/Ghost233/DSH-Workflow/issues/12)，仅添加 ready-for-agent 标签；[本地规格副本](../../specs/jev-center-agent-monitor/spec.md)保留可查阅文本。发布规格不恢复当前分支开发。

此前Q21对默认DSH子代理提出了不必要的假设性问题，现通过源码与保存配置核验收窄。访谈回答与文档记录不自动恢复代码开发。

## 已核实的本地事实

DSH 的插件 Config/volatile 字段由 Settings 提供配置 schema、读写与持久化，表单由客户端插件实现；`autoGenerate` 是供客户端生成页面的标志，当前 SDK 没有提供自动生成这些页面的已发布客户端。本插件通过原生 Settings/Plugins Slot 实现表单，并使用 `configure({ auto: false }, ctx.fiber)`。普通配置保存密钥引用，实际 key 由 credentials 的 resolve/describe/set/unset 管理。标准 credentials-local 使用权限受限的文件，并非操作系统钥匙串。现成的聊天模型 provider 协议表没有 System One，JEV 配置不能仅当作普通聊天模型新增。

[Settings](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/settings/settings/src/index.ts:302)、[密钥引用示例](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/llm/llm-deepseek-api-key/src/config.ts:14)、[credentials](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/credentials/credentials/src/index.ts:175)、[本地凭据](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/credentials/credentials-local/src/index.ts:609)、[现有 provider 协议表](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/llm/llm-pi-ai/src/provider.ts:47)

### 子代理进展的补充核验

普通spawn/fork进入共享in-process driver，调用parent.ctx.agents.create并返回localAgent；原生AgentLoop读取llm stream的每个chunk并发布assistant-stream。官方Agent Team默认freshProvider=spawn、forkProvider=fork。当前保存的Desktop profile包含这一官方Team bundle，其安装版本0.2.1-alpha.1的patch仍为spawn/fork。没有运行真实子代理任务，也没有查询当前运行Host的动态provider实例；保存配置证据不等于已验证每个当前实例。

[原生child创建](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/subagent/subagent-in-process-driver/src/index.ts:134)、[流事件发布](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/core/agent-loop/src/agent.ts:426)、[Team默认backend](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/experimental/agent-team-profile/cordis.patch.yml:26)

特殊外进程backend有另外的接口事实：ACP模块内部确实收到session updates，但明确不向公共子代理接口转发thoughts/tools/plans；Claude Code backend只取SDK result；DSH SDK backend内部折叠session notifications；这些run返回localAgent=undefined，共享SubagentRun只提供result/dispose等终态接口。限制在DSH适配器公共接线，不能说外部系统本身没有流式信息。这不属于使用第三方LLM地址的普通DSH子代理场景，不作为本轮要求用户决策的预设障碍。

[ACP内部更新处理](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/subagent/subagent-acp/src/run.ts:422)、[Claude Code SDK取结果](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/subagent/subagent-claude-code/src/run.ts:239)、[SDK通知折叠](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/subagent/subagent-dsh-sdk/src/run.ts:302)、[外进程run接口](/Users/ghost233/Ghost233Code/DSH-Workflow/deepseek-harness/packages/subagent/subagent/src/out-of-process.ts:245)

统一中心与多配置同时启用的架构形状已记录为 ADR 0003，完整业务设计已确认，等待恢复开发指令。实现原型当前仍使用固定URL/model与环境变量密钥，且尚未改为检查次数累计等新规则，不是已确认设计的最终实现。
