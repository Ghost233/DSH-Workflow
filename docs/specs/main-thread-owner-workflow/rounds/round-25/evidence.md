# 第25轮范围

T-22 会话创建且persistOwnerSession完成、followup之前SIGKILL；新进程对账保留身份与预算，不盲目重复执行。主线程独占restart child/test与轮次文档，生产/合同不改。定向新增1项，正式restart5+session11，每组180秒，真实Owner沙箱不关闭。

首次开发定向1失败：旧capture强制raw存在，而真实JSONL后端create到首次append前不物化文件。原始失败见development-first-failure.log；源码已有session-persistence-jsonl/tests/jsonl.spec.ts:271懒物化用例佐证。修改只限证据采集：从真实create返回header计算物理目标，created允许缺失；父进程在kill后、replay后直接确认ENOENT。正式artifact中的null是缺失标记，kill.json的rawArtifactPresent=false明确说明，不当真实JSONL内容。其他场景仍要求真实raw。

修后定向1/1。正式冻结1619项，restart5+session11=16/16，零失败/取消/跳过/超时/警告，无补验。四个SIGKILL场景不同PID，state/raw或缺失标记保持；新增created预算仍reserved、模型0，重放raw_artifact_missing，agent/model0。五个正式容器已清理，原始复核见restart-artifact-audit.json。

仅覆盖persistOwnerSession成功返回后、followup前。不覆盖create后尚未绑定、绑定写入中断、全部取消或未知旧lease组合。不自动开启resume。
