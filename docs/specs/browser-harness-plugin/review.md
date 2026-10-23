# Browser Harness 插件双轴审查

基准：`19cad95ef6714a33ccf034f987d859c4fdfcfbac`。首审候选：`fdd27121b94a16248c9daf102bae2b47fd131d6c`。比较命令为 `git diff 19cad95ef6714a33ccf034f987d859c4fdfcfbac...fdd27121b94a16248c9daf102bae2b47fd131d6c`。

## Standards

1 项 P2，0 项坏味道判断。

通用安装状态误报可调用证据：`main.dart` 将所有 `installed` 行显示为“已安装（DSH 可调用）”。已有 profile 插件行只依据包清单设置此状态，没有验证 DSH 调用成功。这违反真实结果要求。通用文案应恢复“已安装”，DSH 可调用信息保留在 Browser Harness 专属来源和说明。

其余固定 gitlink、原文封装、构建时上游检查、运行端只读查询、超时和取消、用户停用选择及独立版本管理，未发现可行动问题。

## Spec

0 项发现，无 P0、P1 或 P2。

已逐项核对[规格](spec.md)中的固定子模块与原文资料、打包差异报告、Skill 发现、默认 DSH Shell 的路径版本、启动器原有列表、错误和不可达状态、真实 Host 装配及搬迁。审查者独立使用项目标准入口运行新增两份测试，7 项通过，退出码 0。

## 修复与复审

通用文案已改为“已安装”，Browser Harness 专属来源和说明继续保留实际 DSH Shell 查询证据。正在验证修复后的候选，复审结果尚未结算。
