# 下一次恢复的进入条件

本记录补充并修正 planning-source-recovery.md；不代表 Coinhub 全流程通过。

## 2026-09-14 实机核对

原工作流仍为 `wf-90bbced7a68641494bb651e73f3c22d6ba4b3354`，激活版本 2，16 项任务中 1 成功、2 失败、13 待执行。恢复额度已用 8/12。本次核查没有发起 retry、replan、Registry 变更，也没有清空记录。

### “30 分钟审核”的时间分解

依据：当前 control-state.json 的 review_plan / stop_execution 动作，以及现有浏览器第 94 个子会话 `owner-741497e9c9ed391f8e1d8ad957a445d77945e1e8` 的完整工具序列与用时。

- 00:12:35 接纳审核；00:12:37 开始执行。
- 原生会话显示执行用时 2 分 50 秒，00:15 已结束。17 次实际工具调用：1 次 Git/工作目录检查、8 次文件读取、4 次 Glob、2 次 Grep、2 次报告提交。另有 2 项上下文注入，不计入 17 次工具调用。
- 读取的是 Spec、Ticket、package.json、wrangler.local.jsonc、tsconfig.json、API service、Worker、progress；工具列表中没有循环重复读同一文件，没有安装、构建或长期执行命令。
- 两次提交分别被“Planning baseline contains uncheckpointed user changes”和“Planning code baseline changed”拒绝：审核期间主线程已经编辑并 finalize R10。Reviewer 的文字报告还将 R10 的 `.npmrc` 细节归给 R9，说明读取可变工作区导致来源混用。
- 00:15 后会话没有进一步工作；旧宿主仍将已抛错 execute 留在 live map，未及时走持久化终止流程。动作被观察 45 次，到 00:42:35 硬期限才触发停止，00:42:48 已确认 managed range 停止和 executionSettled。
- 因此约 2 分 50 秒是模型及工具工作，约 27 分钟是错误状态收尾等待。不能精确分解每个模型思考与工具耗时，UI 没有提供逐调用时间；但没有证据表明某个工具阻塞了 30 分钟。

针对修复：execute 的 finally 移除 live 占用，保留 binding 到持久化停止及写入屏障确认；规划 Action 使用冻结源码与单一 admission receipt，后继文档写入不再改变审核来源。暂停前的 7 项原生收尾测试通过（/private/tmp/planning-native-cleanup-final.log），包括无报告 Reviewer 在硬期限前进入正式停止。代码尚未加载进实机，真实回归仍待完成。

## 两个失败任务：一次性补齐的合同与测试

| 任务 | 当前证据缺口 | 下一次必须交付并由固定测试覆盖 |
| --- | --- | --- |
| provision_browser_ui_harness | 只有版本验证；共享 runner 没有浏览器调用；network guard 需要未来测试主动安装；浏览器来源缺失；依赖 seal 超时 | 锁定一致的 Playwright/helper 依赖和项目级 `.npmrc`；首个 Playwright import 前设置 hermetic browser path；共享 runner 实际调用统一 fixture/入口；默认强制拦截非本地请求；真实启动 Chromium、加载本地 DOM、验证外部请求未抵达外部服务、正常关闭；增加负向用例证明消费者未手动调用 guard 仍被隔离。Owner 范围须经正式 Registry 流程包含 `.npmrc`。 |
| build_deterministic_foundation | 现有 4/4 测试只覆盖冻结/脱敏/基础控制；unary/stream 脚本只内联在测试中；无可复用版本化场景包 | 在 tests/** 导出命名、版本化、深度不可变的 unary/stream 场景 producer；由公共 API 导入并执行成功、401、网络中断/重连、终态失败场景；用两个独立实例验证确定性、实例隔离、无真实网络；保留敏感字段脱敏、嵌套数组冻结和未知路由 fail-closed 回归。通用 transport 默认 maps 为空仍应 fail-closed，不以默认填充掩盖遗漏。 |

API/Worker 的下游既有缺口也必须随对应任务执行包保留：fake 模式不得调用真实凭据提供者；匿名 401 stream 必须终止；Worker fake 分支仍经过正常路由 gate；后继契约测试承担跨模块场景验证。不能只用 typecheck 当作这些行为的证据。

## 不消耗恢复额度的准入检查

1. 局部变更边界外的任务定义、验证 ID/命令和有效成果保持；依赖发生实质变化的消费者按依赖闭包重验。
2. 旧实现中，同一 Ticket revision 会无差别改变所有任务 digest。此问题现已通过执行合同投影与不可变 dispatchContract 调整，尚未运行新测试；不得把 affected_task_ids 填全图来掩盖它。
3. 确认正式来源、Registry、计划的相互绑定可校验；不伪造旧绑定、不直接改控制状态。
4. 两个失败任务的上述交付与固定测试进入同一明确执行合同，再进行有变化的尝试；不原样 retry，不增加或重置 4 次剩余额度。
5. 新依赖复用约束按真实规模验证：缓存命中减少安装、整树复制和重复摘要，隔离构建输出与可写缓存；固定候选测试结果仍重新执行。单纯分配阶段超时不是复用验收完成。
