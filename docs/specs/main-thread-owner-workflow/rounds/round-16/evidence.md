# 第16轮证据范围

范围T-22/R4-V03-1，关联AC-22/24/31局部会话适配。基线承接T-21的1613项指纹及四仓HEAD/既有修改，runtime和T-20模块保存*.before，以区分大量既有未提交改动。仅显式局部接口，不启用全部runner、默认预算或迁移legacy。

实现归属：session_adapter_r16独占recovery-session.mjs、Runtime接缝与接口说明，并获主线程追加授权为T-20提供只读lookup导出，复用原始严格导入校验而非重写预算解析。测试归属：复用session_proof_t21独占新recovery-session.test.mjs与fixtures；主线程独占正式编排和文档/Git。

正式计划：source-plane真实Harness/JSONL的recovery-session测试（仅模型受控），加recovery-admission/recovery-budget/convergence/model/plan-revision/workflow-state/control/security八组回归。真实集成及control/security为180秒外层上限，其余60秒；独立失败继续，冻结后不改源码、断言或合同。

边界：裸Harness fixture仅提供真实session transport/raw存储，不能证明Owner role/sandbox/owner_submit约束已接入。完整T-22开发完成还需核对实际Owner启动保护、当前lease/版本与真实Owner结果结算，不能把原始turn completed说成业务成功。原始JSONL可能包含packed chunk行，完整性校验不能误当每行单事件；其他压缩格式无证据暂停。

开发检查补充：原始JSON每行可解析仍不足以证明readFrom消费了所有存储记录；合法JSON但无效记录也须暂停。首次恢复入口必须保留validateOwnerStartState的计划/Registry/依赖门禁、受控worktree/baseCommit校验以及requireOwnerSubmission，不以裸AgentLoop或普通模型文本绕过。实现者修正这些检查，测试者独立覆盖；均发生在正式冻结前。真实T-13结算与延续生产不在本轮已完成声明之内。

最终开发范围收窄：完整Owner首次启动不能只靠provider setup；现有createOwnerEntry还承担工作区/分支/审计基线，runOwnerEntry与runExternalOwner承担真正提交结算。实现者在冻结前移除不完整首次派发，新Runtime入口经既有validateOwnerStartState后返回owner_execution_adapter_not_ready；未通过门禁返回owner_start_not_authorized。已保留的provider预留身份接缝未被本入口启用。只读投影支持唯一prompt/turn/step；真实启动、resume、T-13结算与延续引用均未交付，不解锁T-23。

开发定向首跑：真实source Harness的5个测试中4通过、1失败；Runtime通过agent.ctx.sessionPersistence读取未注入服务，Cordis在返回暂停前抛错。实现者仅将新增sessionPersistence与sessions读取改为ctx.get(...)，语法检查通过。该修复发生在正式冻结前，首次失败日志由测试者保留。

## 正式测试结果

固定候选1617项，冻结后无漂移；全部9组独立执行，无失败短路。新增适配使用Node24+tsx与真实source Harness/JSONL，仅模型受控。

| 套件 | 通过 | 失败 | 跳过 | 超时 |
| --- | ---: | ---: | ---: | ---: |
| recovery-session | 5 | 0 | 0 | 0 |
| recovery-admission | 43 | 0 | 0 | 0 |
| recovery-budget | 32 | 0 | 0 | 0 |
| convergence | 24 | 0 | 0 | 0 |
| model | 51 | 0 | 0 | 0 |
| plan-revision | 7 | 0 | 0 | 0 |
| workflow-state | 11 | 0 | 0 | 0 |
| control | 159 | 0 | 7 | 0 |
| security | 25 | 0 | 14 | 0 |

合计357通过、0失败、21跳过、0超时。跳过来自原control/security套件，不计为通过；本轮未运行完整Owner生产者、旧真实lease恢复、T13结算或T23联合验收。

开发日志归档在[development](development/)，包含装配调试和首次Cordis注入失败；development-08是冻结前5/5复跑，不与正式数量相加。

Git核查见[git-final.json](git-final.json)：四仓HEAD与基线一致，无提交/推送/fetch。主仓main对本地origin/main为0/0；deepseek-harness master对既有跟踪引用落后1430，vendor main落后4，dsh-synapse为detached HEAD。本轮未更新这些依赖版本或远程分支；已有修改完整保留，不能将该状态说成所有仓库均已同步远端。
