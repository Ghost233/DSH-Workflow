# 公共 Owner 判断会话合同 V1

合同标识：`DSH_PUBLIC_OWNER_DECISION_SESSION_V1`。来源：R4 5.8、T06协议、T08/R94真实Harness验证。该合同规定B-02生产接线的最低边界，不把R94固定模型回复当成Owner推理质量证明。

## 输入绑定

每个判断会话必须绑定Workflow、当前PlanRevision与`planDigest`、公共Owner、T06请求ID/版本/digest、目标合同版本、消费者上下文digest和创建它的主线程协调记录。会话只接受已由`registerPublicOwnerChangeRequest`验证并登记的请求；普通提示文本不是授权来源。

## 权限与身份

- Runtime以Registry中的目标公共Owner身份创建会话，工作目录使用固定执行版本对应的项目现场。
- 判断会话固定为只读且`approval=never`，不能写公共模块、Registry、DAG、Workflow状态或Git。
- 回报必须通过专用结构化提交入口提交`DSH_PUBLIC_OWNER_CHANGE_DECISION_V1`。Runtime从会话绑定取得Owner身份；模型不能用payload改写身份。
- Runtime使用T06协议重新校验请求、决定及当前权威上下文。身份、请求或上下文不匹配时保留原始回报并关闭处理，不生成可消费决定。

## 持久状态与重放

在发送prompt前持久记录会话reservation、固定prompt digest及请求绑定。结构化提交先写原始回执，再由Runtime原子登记T06决定及会话终态。fresh Runtime必须能够区分：尚未发送、已发送结果未知、已提交待登记、已接受、已拒绝、超时、取消和终止状态未知。

相同session/request/version的同内容回放不得重复建立决定或消耗第二次资源；冲突内容关闭处理。会话已经终止但没有结构化提交时结果为明确的`no_submit`，不能从assistant普通文本猜测决定。

## 版本门禁与协调结果

登记前重新读取当前Workflow/Plan、合同和消费者上下文。K1→K2或消费者事实变化使旧回报成为可查的stale历史，不解锁节点；主线程据当前上下文创建下一请求版本。

T06投影映射为主线程动作：

- `capability_sufficient`：允许在当前合同引用下重编排消费者。
- `compatible_extension`：创建仅属于公共Owner的实现工作；完成、验证并激活新合同后才解锁消费者。
- `migration_required`：按决定的完整消费者顺序形成阶段计划。
- `rejected`、`facts_missing`：回到主线程修订技术方案或有界调查。
- `business_decision_required`：只阻塞受影响范围并请求用户决定，无关工作保持可执行。

决定登记本身不直接改DAG、授予写权限或派发实现。

## 容量、取消与释放

公共判断使用独立且持久的consultation reservation，并计入Runner全局容量；它不冒充写Owner的`activeOwners`租约。相同公共Owner的决定会话默认串行，不同Owner在容量允许时可并行。取消或deadline先阻止新提交，再要求真实会话终态；确认终止后释放reservation。终止未知时保持占用或隔离标记，不能静默开放同一资源。

## R94验证边界

R94实际证明了Harness可创建注册Owner的真实只读子会话、拒绝写入、返回受控模型文本、终止超时/取消，并由T06在主线程适配器侧拒绝身份错误和过期结果。R94也实际观察到通用接缝的三项缺口：没有专用结构化提交、结束后`readRaw(sessionId)`没有持久材料、并发会诊时`activeOwners`与Runner reservation均未占用。T-28必须关闭这些缺口后，B-02才可进入CA-01。
