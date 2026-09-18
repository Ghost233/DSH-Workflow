# 两个失败 Owner 的修复请求

2026-09-16 重新读取现场并运行既有冻结候选复现：仍为 3 tests / 1 pass / 2 fail，见 before.log。当前 workflow 保留 3 个成功、2 个失败、4 个待执行任务，无在途 action，recoveryUsed=11，原上限=12。

## 修复交付

1. Panel（src/panel/**）：修复连续排序保存的异步交错，保证回滚至最后已确认顺序；覆盖 A 成功、B 失败及连续操作。可采用串行保存或等价的明确状态模型。交付真实逻辑回归测试。补齐显式本地 acceptance 适配器，将确定性场景接到现有 API/Panel 消费者；维持生产默认行为与共享 Panel，不越界修改 API 或 quality-owned tests。
2. Worker（worker/**、wrangler.local.jsonc）：替换 stream:true JSON 标记为现有消费者可解码的 AA-BB/protobuf 流，包含确定性断线与重连；按既有 schema 实现本地 quote、allowance/approval、preflight、submission、status 语义。用真实解码器和状态断言验证；保留生产代理及安全边界，不调用真实上游、钱包或链。

每个任务一次正式 workflow_retry_task，使用现有候选和绑定失败证据。固定验证、独立审查、集成全部经过 Runner。业务结果不得以 typecheck 通过替代。不修改来源、既有成功任务、计数或 live state。

## 恢复授权

现有 workflow_authorize_recovery(attempts=2) 经原生决策批准后，将本轮共用上限设为 used 11 + 2 = 13；历史已使用次数仍为 11。这里包含原来剩余的 1 次，总上限净增加 1 次，不是清零或增加两次到 14。批准本身不派发工作；随后分别修复 Panel、Worker。

自动审批审查拒绝了向 DSH 主线程提交上述两次恢复请求：用户明确要求修复，但没有明确批准超出剩余额度的方案。请求未发送，未创建新恢复决策或派发 Owner，计数不变。需要用户明确允许本轮两次恢复、上限 12→13 后继续；不能绕过审查。

DSH 原来未运行，已通过无参数 ./start-owner-workflow.sh 正常启动并在原浏览器标签页打开已有会话，配置与历史未清理。
