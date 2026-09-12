# 第35轮

T23同receipt的双独立进程竞争真实启动。两child构建各自Runtime后ready，父进程等两者ready统一go，不用时间sleep制造重叠。等待两child退出后读原始state/raw，必须总create/followup1、model2、同identity、账本totalUsed1、实际owner_submit唯一。仅proof改动，正式boundary4。

定向1/1，正式boundary4/4，零失败/跳过/超时/警告，1621无漂移。同步ready/go后两个独立进程竞争同一已领取intent，合计1create/1followup/2model，实际tool/call owner_submit一条，totalUsed1；第三进程只读重放核验。completions在正式前补退出竞争，避免第二条IPC缺失时无界等待。父容器回收。仍未验证两个不同请求争最后额度后与真实启动的组合。
