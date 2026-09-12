# 第39轮

首次真实appendBatch(isMaterialized=false)完成后、调用方尚未获得完成通知时SIGKILL。透传真实backend，直接读物理文件避免coordinator回入；新Runtime只读pause，不重复执行/结算/退额。仅proof两文件，预计formal9项。

定向1/1，正式9/9，0失败/跳过/取消/超时，1621无漂移。首次raw567字节仅header+sandbox/mode+approval/policy；checkpoint phase=created，模型已开始1次但prompt尚未出现在物理日志。SIGKILL后新Runtime reason=prompt_not_observed，create/resume/followup/model0且账本/日志不变。该事实说明“磁盘未见prompt”不能证明执行没开始，必须保守暂停；不称prompt已落盘或可自动重发。
