# R48 修fixture原子写入

唯一写入生产树文件为control.test.mjs，主线程独占，其他源码完全冻结。只将完整Workflow用例stub的state writeFile改为同目录临时文件后rename，读侧JSON解析仍直接失败，不吞坏数据。正式完整control一遍，保留R47首次失败与有限补验。R47 runtime/admission/session/resilience无需因这个夹具改动重跑，按源码hash绑定原证据，不能把旧失败删掉。
