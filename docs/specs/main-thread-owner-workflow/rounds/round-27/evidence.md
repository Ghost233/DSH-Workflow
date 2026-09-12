# 第27轮范围

T22关闭矩阵L1两个故障：create API抛错、真实create返回后persistOwnerSession抛错。保留真实Owner前置/账本/后端，注入明确故障，不要求失败时无raw；证明无followup/model/结算、reservation保持，后者真实handle释放。主线程独占recovery-session.test.mjs及文档。正式session13+restart5，每组180秒；生产合同不变。

开发定向2/2，formal restart5/5+session13/13，合计18/18，零失败/跳过/超时，无补验；命令、时限、退出码及计数见test-results.json。1619候选无漂移。create故障是API边界注入，bind故障在真实create成功后、实际绑定写入前注入；不声称证明create内部任意部分写入或磁盘原子保存中断。计数透明委托真实followup/dispose，bind用例检查实际agents registry去注册。预算整对象保持，Owner诊断记录允许变更；后续同request返回pause且state/raw保持。未修改生产与合同。
