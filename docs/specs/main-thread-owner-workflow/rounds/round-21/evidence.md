# 第21轮：F-18观察型fixture装配隔离

用户“继续”授权F-18最小修复。主线程独占recovery-session-fixture.mjs及本轮记录，无其他源码/测试断言/合同改动。mountHarness仅在executable:true时挂载真实Sandbox/Policy/Subprocess/Bash服务；初次mount和restart传同一创建选项，观察型保持原唯一预留输入，实际Owner仍真实运行固定验证。

正式范围是受影响recovery-session全部11项，不重复无改动产品套件。source Harness、JSONL、真实沙箱及固定验证，仅模型Mock。使用Node24+source tsx/TSX_TSCONFIG_PATH；外层工具沙箱外执行，项目自身Owner沙箱保持启用，180秒硬上限、TAP/no-bail。1617项指纹冻结后不改源码、断言或合同，收齐结果后独立只读审查。未授权提交/推送。

## 正式结果

recovery-session 11/11通过，0失败、跳过、取消、超时。原始TAP顶层名单与源码全部11项完全一致；无补验或重复整组。真实Owner执行型仍挂载实际沙箱和固定验证，旧观察型单prompt/raw检查恢复通过；原断言未修改，产品唯一输入规则未放宽。1617候选无漂移，无延迟拒绝/未处理拒绝警告。

restart开关继承通过同一闭包传参静态核验，本轮没有新增进程重启故障证明，不能借该修复宣称T-22重启能力已验收。上一轮2项失败保留为历史，不改写其记录。本轮未重复无改动的其他产品回归。
