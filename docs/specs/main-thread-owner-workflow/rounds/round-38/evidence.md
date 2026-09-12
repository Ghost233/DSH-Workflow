# 第38轮

领取事务临时文件写入前、写入后rename前两个SIGKILL窗口。生产reducer生成的未提交intent只作为攻击输入，不伪装durable receipt。新进程reconcile必须reservation_not_found且零执行，state/额度/来源不变；保存前temp不存在、保存后temp原文保留。仅proof两文件，预计formal8项。

定向2/2，正式8/8，0失败/跳过/取消/超时。候选1621无漂移。两producer均实际SIGKILL；新Runtime均reservation_not_found且create/resume/followup0、model0。原始证据见restart-artifacts两个admission目录。
