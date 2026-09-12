# R98 T10验证与T31 Owner摘要恢复实现报告

## 结论

T-10开发完成，并得到一正一负的可复现结论。现有封存失败路径正确保留已经合入的Owner fixed SHA和`awaiting_finish`记录，fresh Runtime可继续结算且不会新增第二次代码merge；现有长期摘要降级虽把任务安全结算为completed，却清除恢复事务，completed快速路径只返回旧结果，摘要在重启/重复回执后不会重试。

该否定结论已按B-06拆为T-31并完成生产实现。B06/F5生产切片关闭，AC-22/23继续由CA-01固定候选进行联合验收。

## 最终行为

- `sealOwnerWorklog`把原始临时记录转为`sealed`，并产生Git来源提交、规范化worklog digest和源文件digest；completed结果同时保存fixed SHA和原始changed files。
- 摘要编译失败继续保持代码completed和sealed worklog，不把模型摘要作为代码有效性的前置。
- fresh Runtime重收同一`owner-finish`时，先按原完成记录重新验证，再核对Owner/任务、sealed worklog digest、来源路径、来源提交祖先关系、当前blob、源digest和fixed SHA祖先关系；全部一致才只重试Memory编译。
- 成功恢复只更新Memory提交、摘要和workflow HEAD，清理短期worklog。再次重复回执直接返回同一结果，不新增提交或写入者。
- 来源缺失、被替换、回执不全或离开当前workflow历史时，记录`memory.recovery-failed`和有界attempt信息，保持代码与任务completed，不生成替代来源。
- Memory写入提交现在先检查实际dirty路径；没有变化时复用当前HEAD，因此“Memory已经提交、完成状态尚未保存”的进程中断也可幂等恢复。

## 真实Git证据

三条专项用例分别覆盖：封存介质失败后fresh Runtime恢复；Memory提交后、完成结果保存前中断，再由重复`owner-finish`恢复；来源文件被Git提交删除后的关闭处理。断言包含fixed SHA祖先关系、merge commit数量、sealed状态、来源内容/提交/digest、最终Memory提交和无补造文件。

专项3/3通过。最终受影响回归结果见`test-results.json`。

## 保留边界

本轮没有运行真实模型或CA-01 S/A/B业务链；fallback Curator仅验证确定性恢复事务。T-31开发完成不等于AC-22/23交付级验收通过。下一路径是T-11确定集中验收采集合同，随后T-12关闭B-05并运行CA-01。
