# T16 round-02 主线程只读复核

已核对 report.md、probe.mjs 的实际 barrier、第二 Runtime 创建与 lease/事件采样。认可正式1场景的有限证据：同进程跨Runtime拒绝未终止同Owner重入，独立Owner实际完成，终止后新token。模型传输受控，cancel/lease/JSONL/运行入口未替换。

旧候选runtime cfdf4af…归档且正式无漂移，不将结果推广到当前R50版本。取消返回不等于终止；离散采样不证明任意时段连续租约持有。未验证跨OS进程、旧结果fencing和完整deadline协议，T16仍开发中。round-03已派同worker独占新proof子目录推进跨进程验证，不改生产或本轮候选。
