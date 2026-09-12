# R78：实际计费仲裁与后继审查来源

已接通恢复候选的 **Owner会诊→计费Arbiter→最新有效Review→局部重建→新Review**。实际driver与控制socket消费此路径；原Planner、普通Review、会诊及仲裁回执分别保留，未知创建不重发、预算耗尽不越过领取、重放不重复计费。T15仍开发中，T18实际跨版本激活未完成。

修复了两项确认的并发P2：状态写锁检查期间消失，以及迟到仲裁调用者误按旧Review校验。后者覆盖认证前、认证后和会诊后多个窗口；修复前两个确定性场景均失败，修复后通过，完整raw/source认证仍保留。[只读审查](review.md)无未解决P1/P2。

| 证据候选 | 范围 | 结果 | 指纹 |
| --- | --- | --- | --- |
| [首次](test-results.json) | 十套 | 341通过、1失败、7跳过 | 范围外launcher测试发生外部漂移，原证据保留 |
| [候选2](test-results-2.json) | 十套 | 345通过、0失败、7跳过 | 范围内无漂移 |
| [最终候选3](test-results-3.json) | 五套直接受影响候选流程 | 49通过、0失败、0跳过 | 无漂移 |

没有把候选2十套结果归到候选3，也没有合并不同版本计数。候选3修改范围与补验理由见[supplemental-scope.md](supplemental-scope.md)，固定源码指纹见[candidate-3.json](candidate-3.json)。各次原始formal日志、修复前失败和差异均保留；无超时。范围外launcher.test.mjs编辑未覆盖。

已完成[整体收敛盘点](../../convergence-checklist.md)：23工单、B01–B06、CA01及全部适用AC映射为12组有限交付条件。下一生产路径是T05→T07→B01；T15仅做C1–C6有界关闭核对，T17/T18/T19分别承担deadline、跨版本继承和配置启用，不再把所有后续工作吸入T15。

未提交、未推送。主仓main与缓存origin/main同hash；依赖仓缓存仍显示behind（3364/15/4），dsh-synapse为detached；未查询远端，不宣称已同步。原有未提交和未跟踪文件保留，详见[Git现场](git-final-evidence.json)。
