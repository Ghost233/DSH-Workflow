# R77：恢复候选 Owner 会诊的实际生产与采纳

T-15 的本轮子范围为内部 consultRecoveryCandidateOwners：真实计费 Planner/Review 作为前驱，逐 Owner 领取同根预算并采纳结构化建议。T-15 仍开发中；独立计费仲裁 Review、driver 正向接线与 T-18 候选激活未完成，R75 仲裁门禁保留。

## 本轮交付

会诊请求固定完整候选、前驱 Review/收敛、来源问题根、Owner 定义/Registry digest 与有限 selection。先认证实际前驱原始回执，再启动只读 owner-advisor。每个 Owner 有独立 operation、ordinal、request、session 和 prompt；记忆仅作为非可信上下文。

有效建议经过语义校验后，最新状态事务原子写入 operation.result、session applied 和预算 succeeded。已知失败消耗本次预算，下一次仅失败 Owner 递增 ordinal；已采纳 Owner 保留并核验原始回执，不能被整批重跑。unknown/丢响应保留 reserved session，不重发、不退费。已观察到原始提交但尚未结算的会话不能冒充已采纳。

完整候选/前驱变化拒绝过期结果，独立任务更新可以保留。批次返回前复查全部采纳 operation/session/attempt；candidateRecoverySource 纳入相关会诊进度。未新增 OwnerRun，也未修改活跃 DAG。

沿用 maxPlanningOwnerConsultations 上限，持久记录全部相关 Owner 与实际选中 Owner。返回值表示本次有限会诊，不保证超出上限的 Owner 均已咨询；后继仲裁消费者必须检查该覆盖范围。

## 证据与状态

候选指纹见 [candidate.json](candidate.json)，本轮相对改动见 [round.diff](round.diff)。测试使用真实 Harness、Registry、持久 JSONL 与内部沙箱，模型传输由 MockAdapter 提供；不等于真实模型质量或全项目验收。

开发期前驱夹具 1/1，会诊矩阵 17/17，追加未结算 applied 边界 1/1，均通过。前驱夹具只在实际付费 Review 前注入受控的既有有限策略历史，Review 接受后不改 convergence；Planner/Review raw 损坏测试直接改实际文件并使用 fresh Harness 验证拒绝。

正式九套共332通过、7既有跳过、0失败、0取消、0超时，候选无漂移。明细见 [test-results.json](test-results.json)，独立只读审查未发现新增P1/P2，见 [review.md](review.md)。

| 套件 | 通过 | 跳过 |
| --- | ---: | ---: |
| candidate-owner-consultation | 18 | 0 |
| owner-advice-session | 6 | 0 |
| candidate-review-recovery | 6 | 0 |
| candidate-arbitration-recovery | 4 | 0 |
| candidate-recovery-pause | 24 | 0 |
| replan-session | 9 | 0 |
| recovery-budget | 49 | 0 |
| recovery-admission | 57 | 0 |
| control | 159 | 7 |

7项跳过均来自control的既有显式跳过，不计为通过。

## 下一步与 Git

[后继仲裁接线分析](next-arbitration-integration.md) 已记录：仲裁更新 candidate.review/convergence 后，后继重建必须认证最新的仲裁来源，不能继续只按旧普通 Review 结果判断漂移。下一子范围需要同时接 paid arbitration Review、重放及后继消费者。

未提交、未推送、未查询实时远端。根 main HEAD 仍为 `154914064f5ceb2f8eb413865e10a54e8ffbc663`，预先存在的修改和暂存内容保留。缓存跟踪显示 deepseek-harness master 落后3364、approve vendor main落后4；dsh-synapse当前detached，其本地main缓存落后15，均未同步。详细工作区/分支/缓存远端指纹见 [git-final-evidence.json](git-final-evidence.json)。
