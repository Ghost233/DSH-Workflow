# 暂停期间独立Owner调度：只读审计，尚未实现

Hilbert审计：目前delivered候选pause返回command:null，daemon不再发现；不能直接恢复普通execute。普通supervisor-ack/stop会把reduced.tasks整表写回，将筛选视图的合成来源状态污染真实任务。

最小后续切片为候选pause专用单次调度。对active A计算来源/目标Owner及task的依赖、反向依赖、parent/child闭包，排除现存Owner run和未终态reservation；只选择闭包外pending leaf。全局槽位和Owner去重必须仍按全量running计算。

selector/actionId绑定candidate_pause scope（pauseSource、activePlanDigest、eligibleTaskIds），仅create/wait，禁止notify/stop。ack仅写实际target patch，普通ack拒绝candidate action。reservation持久绑定pause source、A、task/owner、scope digest；ack、execute、start、成功/失败收尾都在锁内复核，失配只停止自身reservation。

blocked例外仅限带绑定的reservation；独立任务结果不能重置候选pause/status/error及来源。测试应真实完成独立I并证明S/T来源、候选、handoff、Review/session/budget不变；execute前source变化应拒绝旧reservation。该范围涉及Supervisor到Owner生命周期，不能只改控制器放行便宣称完成。
