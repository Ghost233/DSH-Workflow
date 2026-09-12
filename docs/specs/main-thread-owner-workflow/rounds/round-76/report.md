# R76：逐 Owner 会诊持久计费会话

本轮 T-15 子范围开发与正式测试完成，T-15 仍开发中。恢复仲裁的正向生产与采纳尚未接线，R75 未计费调用门禁保留。

## 交付行为

新增内部 `owner_consultation`，与恢复 Planner/Review 共用同一问题根预算。请求、持久 session、只读 owner-advisor 角色、结构化提交和原始 JSONL 接受回执绑定同一 Owner；首次创建检查实际 Registry，不创建假的 OwnerRun。共享 advice normalizer 保留初始非恢复会诊行为。

`workflow_owner_advice_submit` 仅接受绑定角色的一次有效提交。错误 Owner、普通文本 JSON、身份变化和未知会话不能被当作有效建议；重开 Harness 根据原始回执恢复，不能重复创建、重复发送或退还已预留预算。会话创建后响应丢失保持 creating/paused，不猜测成功。

`submission_observed` 只代表观察到提交，预算仍 running。本轮没有实现将建议采纳为仲裁结果或将预算结算为成功，也没有激活候选 DAG。

## 固定候选与验证

版本以 [candidate.json](candidate.json) 的逐文件 SHA-256 为准；本轮差异见 [round.diff](round.diff)。Runtime SHA-256：`cd5c43d164b815a6d98a6683d292470e0e8eebdfd46ee0269175cba088358edf`。

正式 8 套件：322 通过、21 跳过、0 失败、0 取消、0 超时；测试后与归档前均无候选漂移。逐命令、时间、环境及计数见 [test-results.json](test-results.json)。真实 Harness、Registry、session/JSONL 和内部只读沙箱均参与，模型传输由 MockAdapter 提供；不等于真实模型质量或全项目验收。

| 套件 | 通过 | 跳过 |
| --- | ---: | ---: |
| owner-advice-session | 6 | 0 |
| candidate-arbitration-recovery | 4 | 0 |
| replan-session | 9 | 0 |
| recovery-budget | 49 | 0 |
| recovery-admission | 57 | 0 |
| security | 25 | 14 |
| plugin | 13 | 0 |
| control | 159 | 7 |

跳过是既有测试显式跳过，其中 security 包含旧文本 Owner 回执、旧写入包装和 Shell 白名单用例；不计作通过或新能力证据。

开发期夹具修正保留于 development-advice.log：同步 guard 应使用 assert.throws；agents.create 返回不保证 JSONL 已落盘，丢响应场景改为实际创建并显式 sessions.flush 后注入丢失。最终 6/6，并在冻结候选正式重验。不得将上述失败归为产品逻辑缺陷或声称创建即持久化。

## 审查与后续

独立只读审查没有确认的 P1/P2，详见 [review.md](review.md)。下一子范围是实际候选仲裁会诊生产者：固定候选、前驱 Review、来源问题根、Owner 和 prompt，校验建议语义后原子结算 operation/session/预算；之后接独立计费仲裁 Review。仅完成这些正向路径后才能替换 R75 门禁。

未提交、未推送、未查询实时远端。当前根 main HEAD 为 `154914064f5ceb2f8eb413865e10a54e8ffbc663`。原有未提交/暂存文件均保留。缓存跟踪显示 deepseek-harness master 落后 3364、vendor approve main 落后 4；dsh-synapse 当前 detached，其本地 main 缓存落后 15。未进行同步，完整证据见 [git-final-evidence.json](git-final-evidence.json)。
