# 整体收敛盘点与交付清单

盘点来源：唯一R4/R4-V03规格、原23张及后续展开后的全部31张工单、progress中的B01–B06及CA01；用户要求安全完成R78后按完整代表场景推进。本文件是现有目标的执行索引，不替代规格、不缩小CA01，也不新增验收目标。R78已收尾，分候选证据见[报告](rounds/round-78/report.md)。

当前工单frontmatter与索引逐项一致：验收通过31、开发完成0、开发中0、待办0、依赖阻塞0，共31（原23张+B01展开4张+B02展开1张+B03展开2张+B06展开1张）。全部工单前置已经解除；R100固定候选完成最终联合验收，F1–F12、B01–B06和AC-01至AC-32均已关闭。

## 全部工单核对

已有证据的具体路径以相应工单及轮次/acceptance链接为准；“待办”不代表缺用户授权，当前持续实施已授权。依赖阻塞只限制有关工作，不要求等待整项工程或再问用户。

| 工单 | 当前状态 | 既有依据 | 进入R100前的关闭判据（现均已满足） | 原依赖 | AC |
| --- | --- | --- | --- | --- | --- |
| [T-01](tickets/t-01-document-root-identity.md) | 验收通过 | 路径身份与别名局部证据已交付 | 在CA01规划文档入口确认适用证据；不重新开发路径修复 | [] | [AC-26, AC-30] |
| [T-02](tickets/t-02-obligation-closure.md) | 验收通过 | 义务身份及真实关闭合同已交付 | 在CA01按真实版本/验证引用关闭业务义务 | [] | [AC-16, AC-32] |
| [T-03](tickets/t-03-verified-progress.md) | 验收通过 | AC15局部独立验收 | CA01复用相关进展规则；全局预算由B04承接 | [T-02] | [AC-15] |
| [T-04](tickets/t-04-decision-classification.md) | 验收通过 | 环境/技术/用户决策分类局部独立验收 | CA01以exitCode 127、真实业务冲突和技术修复验证主线程分流 | [T-02] | [AC-10, AC-14] |
| [T-05](tickets/t-05-planning-references.md) | 验收通过 | R79真实文件协议及40项固定候选通过 | 协议交付已完成；T07/B01消费与生产AC核验尚待 | [] | [AC-03, AC-04, AC-27] |
| [T-06](tickets/t-06-public-owner-request.md) | 验收通过 | R93稳定请求/决定协议、46项固定回归 | T08直接消费同一协议；生产会话和消费者解锁仍待 | [] | [AC-06, AC-29] |
| [T-07](tickets/t-07-planning-transaction-proof.md) | 验收通过 | R80真实Git/阶段恢复与模拟激活技术验证完成 | 技术证据已回填；B01真实入口与生产AC尚未完成 | [T-01, T-05] | [AC-03, AC-12, AC-17, AC-18, AC-27, AC-28] |
| [T-08](tickets/t-08-owner-session-proof.md) | 验收通过 | R94真实Harness会话22项固定候选，确认只读能力与三项生产缺口 | 技术验证已关闭；T28实现结构化提交/持久回执，B03承接统一容量 | [T-06] | [AC-05, AC-06, AC-07, AC-13, AC-29] |
| [T-09](tickets/t-09-durable-budget-proof.md) | 验收通过 | 持久预算缺口的技术验证结论 | 保留否定结论；生产证据由T13–T19及B04交付 | [T-02, T-03, T-04] | [AC-11, AC-20, AC-24, AC-31] |
| [T-10](tickets/t-10-owner-history-recovery.md) | 验收通过 | R98真实Git证明封存失败恢复正向，并确认completed deferred没有摘要重试入口 | 否定结论已由T31生产实现消费；CA01复用联合场景 | [] | [AC-22, AC-23] |
| [T-11](tickets/t-11-acceptance-runner-contract.md) | 验收通过 | R99确认现有Owner验证不能承担集中采集，并固定候选/验证图/分类合同 | 合同已由T12生产实现消费；CA01直接复用 | [] | [AC-19, AC-25] |
| [T-12](tickets/t-12-acceptance-runner-completion.md) | 验收通过 | R99包级Node test入口、候选绑定、独立继续、依赖阻塞及完整分类已交付 | 在CA01固定候选运行，不再搭临时采集平台 | [T-07, T-11] | [AC-19] |
| [T-13](tickets/t-13-recovery-budget-ledger.md) | 验收通过 | 预算账本与重放局部实现及回归 | 在T15/B04/CA01采用当前候选验证；不以单测代替真实调用 | [T-02, T-03, T-04, T-09] | [AC-15, AC-24, AC-31] |
| [T-14](tickets/t-14-durable-recovery-admission-proof.md) | 验收通过 | 存储正向、完整适配否定证据已交付 | 前置已由T20–T23解除；不把旧阻塞文字当当前阻塞 | [T-13] | [AC-22, AC-24, AC-31] |
| [T-15](tickets/t-15-runtime-recovery-budget-admission.md) | 验收通过 | R88关闭索引与固定候选；19套480通过/7既有跳过 | 同版本入口已关闭；在B04/CA01复用，不吸收T17–T19 | [T-13, T-14, T-23] | [AC-11, AC-15, AC-20, AC-24, AC-31] |
| [T-16](tickets/t-16-owner-cancellation-fencing-proof.md) | 验收通过 | 实际取消/fencing接缝和有限停止合同已证明 | 生产hard deadline与安全释放由T17承担 | [T-09] | [AC-21, AC-24, AC-31] |
| [T-17](tickets/t-17-attempt-deadline-settlement.md) | 验收通过 | R89固定hard deadline、持久stopping、terminal结算、generation fencing；9套386通过/7既有跳过 | 在B04/CA01复用；默认启用与代表时长归T19 | [T-13, T-15, T-16] | [AC-21, AC-24, AC-31] |
| [T-18](tickets/t-18-recovery-budget-revision-inheritance.md) | 验收通过 | R91真实版本事务、映射继承和旧attempt结算已交付 | 在B04/CA01复用固定跨版本证据；不重复实现账本迁移 | [T-05, T-07, T-13, T-15, T-27] | [AC-17, AC-18, AC-31] |
| [T-19](tickets/t-19-recovery-budget-config-activation.md) | 验收通过 | R92真实代表链、版本化12/8策略、新Workflow启用与legacy兼容 | 在CA01复用固定候选；不以Mock墙钟或局部回归代替生产验收 | [T-15, T-17, T-18] | [AC-11, AC-20, AC-24, AC-31] |
| [T-20](tickets/t-20-recovery-source-admission.md) | 验收通过 | 权威来源与持久领取局部完成 | 合入T15入口矩阵和CA01；不新增独立重复协议 | [T-13, T-14] | [AC-15, AC-24, AC-31] |
| [T-21](tickets/t-21-session-persistence-contract-proof.md) | 验收通过 | 真实JSONL保守对账合同完成 | 按合同消费，禁止声称同ID重送幂等 | [T-14] | [AC-22, AC-24, AC-31] |
| [T-22](tickets/t-22-recovery-session-reconciliation.md) | 验收通过 | 预留会话/prompt恢复对账完成 | 验证实际入口使用；不以adapter完成代替全链路 | [T-20, T-21] | [AC-22, AC-24, AC-31] |
| [T-23](tickets/t-23-durable-admission-session-proof.md) | 验收通过 | 实际后端联合证据及规格回填完成 | 已解除T15前置，不等于CA01完成 | [T-20, T-22] | [AC-22, AC-24, AC-31] |
| [T-28](tickets/t-28-public-owner-decision-session.md) | 验收通过 | R95专用结构化提交、JSONL持久重放、主线程六类投影和consultation reservation；115项受影响回归零失败 | B02已关闭；B03继续统一公共实现、消费者解锁和资源生命周期 | [T-06, T-08, T-27] | [AC-05, AC-06, AC-13, AC-29] |
| [T-29](tickets/t-29-unified-owner-resource-admission.md) | 验收通过 | R96已交付稳定resource身份、Supervisor/Runtime双重准入及357项受影响回归 | 在T30/CA01复用统一容量、Owner、reservation和资源竞争门禁 | [T-17, T-27, T-28] | [AC-07, AC-08, AC-09, AC-21] |
| [T-30](tickets/t-30-public-change-plan-lifecycle.md) | 验收通过 | R97权威绑定、自治技术PlanRevision、唯一公共实现、消费者合同/顺序依赖和fresh Runtime重放已交付 | 在CA01固定候选复用S/A/B业务验证；不重开B03协议实现 | [T-27, T-28, T-29] | [AC-05, AC-06, AC-09, AC-13, AC-17, AC-18, AC-22, AC-29] |
| [T-31](tickets/t-31-owner-memory-deferred-recovery.md) | 验收通过 | R98封存回执、摘要恢复、代码不重复集成及缺失来源关闭处理已交付 | 在CA01固定候选复用Owner历史故障变体 | [T-10] | [AC-22, AC-23] |

## 有限交付清单

以下12组完整承接既有范围。它们是交付检查项，不是凭空新增的执行Ticket；R100已在同一固定候选上完成F1–F12联合验收。新增发现只能补原有要求的真实缺口，必须记录对本表的影响。

| 项 | 对应范围与现有证据 | 真正缺口及完成判据 | 依赖 |
| --- | --- | --- | --- |
| F1 | T05协议已完成；R79证据，生产消费归F2 | Spec/Ticket/AC/合同引用与就绪范围的稳定协议，错误输入零派发 | 无 |
| F2 | T07→B01；R79–R90已交付并关闭T24–T27 | 已完成：真实文档checkpoint、不可变代码/规划基线、执行包编排、原子版本激活、同父竞争、权限停止及跨进程迟到回执 | F1、T01已满足 |
| F3 | T06；R93协议合同及固定候选 | 已完成：请求/决定引用、连续版本、消费者完整性、过期与冲突拒绝 | 无 |
| F4 | T08→T28/B02；R95已交付专用只读决定会话、持久回执、主线程投影与consultation reservation | 已完成：S独立提交版本化影响决定，普通文本/错误Owner/过期回报不解锁，超时/取消释放判断槽位；公共实现和消费者解锁归F10/B03 | F2/F3已满足 |
| F5 | T10→T31/B06；R98真实Git恢复与封存回执证据 | 已完成：原始原因、封存版本、固定SHA可靠绑定；摘要失败延后，fresh Runtime只重试Memory，重复回执不重复集成；缺失来源不补造 | F2/F10已满足；CA01复用 |
| F6 | T11→T12/B05；R99真实Node组合入口与合同 | 已完成：固定集中候选、独立失败继续、依赖阻塞、超时/取消/零用例/未运行/计数不明/漂移完整分类 | F2/T07已满足；CA01直接消费 |
| F7 | T15；R88已按C1–C6关闭，19套480通过/7既有跳过 | 已完成；在B04/CA01复用固定同版本恢复证据 | T13/14/20–23前置已解除 |
| F8 | T17；R89正式候选9套386通过/7既有跳过 | 已完成：固定hard deadline、stopping、terminal/fencing、迟到结果拒绝及独立Owner继续 | F7、T13/T16已满足 |
| F9 | T18；R91固定候选和执行版本继承合同 | 已完成：真实版本激活原子继承根问题/预算/旧attempt；split/rename/Owner移交/同父竞争不重置额度 | F1/F2/F7、T13已满足 |
| F10 | B03→T29/T30；R96统一准入与R97公共决定/PlanRevision/消费者生命周期均已完成 | 已完成：权威决定绑定、唯一公共实现、正确合同/迁移依赖、提交后解锁及重启幂等；在CA01复用业务验证 | F2/F4/F8/T29已满足 |
| F11 | T19；R92策略合同、代表测量及固定候选 | 已完成：12/8两级限额、批准任务deadline、30秒观察窗口、新Workflow启用与legacy现场/旧审批兼容 | F7/F8/F9已满足 |
| F12 | CA01及AC01–AC32；R100固定候选 | 已完成：完整S/A/B正向链路和故障变体在10/10项中通过；1114个Node test中1093通过、21个明确旧版替代用例跳过、0失败/取消/阻塞/漂移；32项AC全部通过 | F1–F11均已满足 |

B01=F2，B02=F4，B03=F10，B04=F7/F8/F9/F11，B05=F6，B06=F5。CA01已按[进度中的唯一共同定义](progress.md#ca-01-共同验收唯一交付级定义)和唯一规格通过；最终证据见[R100报告](rounds/round-100/report.md)与[AC矩阵](rounds/round-100/ac-matrix.md)。

## T15关闭矩阵与边界（历史判据，已完成）

T15只负责**显式有限配置、同一活跃执行版本**中的实际恢复领取与结果结算。一次有界入口审计须把下表逐行映射到现有源码入口和真实证据；已满足项复用证据，缺口写明具体调用路径，不自动吸收所有生命周期增强。

| 关闭条件 | 已有事实/证据位置 | 进入R88前尚需确认（现已满足） |
| --- | --- | --- |
| C1 所有会实际启动恢复的入口共用领取，无外内双扣 | runtime-recovery-budget、recovery-admission/session及control测试；T15历次报告 | Supervisor、直接Owner、普通/重复恢复、现有idle-timeout、局部replan的有限入口表及当前候选覆盖；被拒绝的未支持入口不能宣称正向能力 |
| C2 根问题/关闭/真实进展/用户依据正确，主控制一致，无关初次工作可执行 | T02/T03/T04；R65–R74持久暂停与独立实际执行 | 对BUD01–05/09逐项链接真实账本、控制/outbox和调用证据，区分问题耗尽与Workflow总额耗尽 |
| C3 预留、未知启动、回执与重放不重复调用或退费 | T21–T23；R55以后真实session/JSONL；R76/R77会诊 | 入口覆盖使用真实适配，无stub成功；未知状态不因错误摘要变成成功 |
| C4 会实际启动的局部replan同根计费、语义结算和后继消费 | R63普通Review、R64重建、R77会诊；R78仲裁及最新审查来源已验证 | R78已确认Planner→Review→advice→Arbiter→后继重建证据，归入有界关闭索引；不能把旧R75门禁当正向完成 |
| C5 新协议显式有限配置，缺失/无效拒绝；旧active/审批不静默迁移 | T13/T20配置和compat回归，T15历次记录 | 当前候选上的适用正反例；生产默认值不在本项决定 |
| C6 固定候选覆盖上述入口与BUD01–05/09 | 各轮candidate/test-results及原始日志已有 | 建一次有限的关闭证据索引，明确未运行/不适用/真实缺口；不是再按局部疑点无限展开 |

C1–C6通过后T15可标“开发完成”，无需等待以下其他工单完成才结束T15；这不代表B04或CA01通过：

- T17承担新hard deadline、取消后资源结算、fencing和迟到结果门禁；保留既有idle-timeout。
- T18承担真实执行版本激活、跨版本根问题/预算继承及旧回执失效；当前拒绝激活不算实现。
- T19承担代表测量、版本化默认配置、正式启用与legacy兼容迁移策略；不从测试常量推导生产值。
- B03承担跨模块的完整调度/资源生命周期集成；B01承担Spec/Ticket→执行版本。T15不替代这些生产入口。

R88已完成上述C1–C6核对，详见[关闭索引](rounds/round-88/closure-index.md)与[正式结果](rounds/round-88/test-results.json)。T15现为开发完成，T17前置解除；本节继续作为证据边界，不重复扩张T15。

R89已完成F8/T17，详见[实现报告](rounds/round-89/report.md)与[正式结果](rounds/round-89/test-results.json)。hard deadline 只在显式配置时启用，固定期限、stopping、terminal结算、同Owner隔离、独立Owner继续和迟到结果generation门禁均有实际证据；代表时长及默认激活仍由F11/T19决定。

## CA01集成里程碑与完成顺序

沿用公共会话Owner S、界面Owner A、恢复消费者Owner B；K1承诺B可缓存恢复，A取消后可重连。以下是同一CA01的分步可观察结果，不是降低验收门槛：

1. 主线程Spec/Ticket就绪 → F1/F2输出不可变规划、代码基线及各Owner执行包。
2. A请求公共修改 → F3/F4让S独立核对B承诺与消费者事实，形成兼容K2或回报真实业务冲突。
3. 仅S修改公共模块 → F2/F8/F9/F10保障实际版本、资源和取消边界；A/B只消费已生效正确版本。
4. 固定集成候选 → F6采集验证，证明A可重连、B缓存恢复仍成立，技术失败在有限授权范围恢复。
5. F5封存原始原因/版本/SHA/交付记录；F11验证新Workflow配置；F12按原AC矩阵完成正向与故障变体。

R78收尾及R79协议已完成，T07技术验证、B01/T24–T27生产入口、T18跨版本继承、T19恢复策略启用、T06公共Owner协议、T28/B02生产判断、T29/T30 B03生命周期、T10/T31 B06历史恢复及T11/T12 B05集中采集均已完成。R100已完成CA01固定候选，当前没有剩余关键路径。

## 新发现准入与报告规则

每个新发现记录原要求/实际失败路径、是否阻断上述里程碑或违反必须的安全正确性约束、最小处理和验证。只有这两类进入当前关键路径；非阻断增强、性能优化、可恢复显示问题等登记为后续项，不默认成为下一轮前置。证据不足的猜测不能直接升级为P1/P2；也不能为赶进度跳过原要求。

后续报告使用：本次关闭的交付条件、贯通的场景步骤、剩余F项/具体缺口、新发现造成的范围变化。用例数仅是验证附件。R100已经关闭T15、B01–B06和CA01；当前没有用户业务决策、权限阻塞或既有范围内剩余F项。

## R79更新

F1/T05协议交付条件已完成：[固定候选40项及只读审查](rounds/round-79/report.md)。F2/T07前置解除，下一生产关键路径为T07→B01；F1的生产引用集成仍在B01/CA01核验，不能用协议通过代替。其余有限交付条件保留。

## R80更新

F2的T07技术验证及证据回填完成，选择有持久日志的checkpoint/snapshot/最终激活路线；[报告](proofs/t-07/report.md)明确阶段覆盖与生产限制。F2仍未整体交付：B01原生来源/CAS链、快照→单Owner执行包、生产授权/版本激活和旧结果处理待实施。后续不再把T07原型测试当作B01已完成。


## R81：F2/B01执行拆分

T24→T25→T26→T27分别交付原生来源、checkpoint/快照、单Owner执行包、真实激活。原23张工单与F1–F12全部保留；这是原B01范围细化，不增加全局完成条件。T24开发完成、T25待办、T26/T27依赖阻塞，详见[索引](progress.md)。T27提供T18的真实受控入口；T18未完成前恢复激活继续拒绝，不形成循环依赖或提前启用T19。


## R82：F2来源消费

T25开发中：T24真实多次原生修改来源与T05、Git基线关联，主线程DAG前准备入口接线中。独立授权记录不能依赖先创建Workflow，否则会与脏文档预检形成环；实际checkpoint/index/snapshot事务继续待交付，来源核验通过不代表F2完成。


## R83：F2 checkpoint生产路径完成

T25开发完成：真实原生授权与来源固定、Git/index同步、不可变快照及八处进程中断恢复已具备固定候选和独立复审证据。[报告](rounds/round-83/report.md)。T26前置解除转待办；实际Planner/Owner执行包与T27版本激活仍待交付，因此F2/B01及CA01不标完成。当前计数以本文件开头和工单frontmatter为准，以上R81/R82段落保留历史状态。

## R84状态更新

T26开发完成，T27前置解除转待办：[报告](rounds/round-84/report.md)。固定快照经实际工具/生产Planner提交生成单Owner执行包与持久候选，完整共同AC不丢失；真实模型、版本激活和派发尚未联合验收，F2/B01/CA01不标完成。以上旧轮次状态保留历史含义。

## R85状态更新

T27开发中：独立审查来源及任务引用语义比较已交付，provider接线P2已关闭。原子激活与活跃版本修订仍未完成，[完整剩余审计](rounds/round-85/t27-remaining.md)。正式control首次超时已保留，同候选有界补验通过但含7个既有legacy跳过，不称全绿。

## R86状态更新

T27 的首次固定候选激活与真实 Runner/Supervisor 接线已交付，[报告](rounds/round-86/report.md)。活跃 Workflow 的文档 checkpoint、预期父版本竞争、旧 attempt 权限/迟到回执迁移及 T18 接缝仍是 F2/T27 原要求；T27、F2、B01 和 CA01 均不标完成。

## R87状态更新

T27 的活跃父版本文档 checkpoint、固定候选与 PlanRevision 迁移已交付，[报告](rounds/round-87/report.md)。F2 已覆盖首次与活跃技术版本的完整输入固定、独立审查、同父竞争及可恢复切换；权限失效 attempt 的跨进程停止/隔离、迟到回执和 T18 恢复预算继承仍待完成，因此 T27、F2、B01 和 CA01 继续不标完成。

## R90状态更新

T27/F2/B01生产入口已关闭：[报告](rounds/round-90/report.md)。带T17控制的旧attempt在活跃PlanRevision中先停止后结算；两个并存OS进程证明旧Owner迟到提交在副作用前失权，fresh Runtime可消费terminal并归档删除任务而不复建。T27开发完成，T18/F9前置解除；恢复预算继承、B03–B06和CA01继续未完成。

## R91状态更新

T18/F9已完成：[报告](rounds/round-91/report.md)。真实 PlanRevision 现在原子追加恢复执行版本边；拆分、改名、跨Owner目标、连续两轮版本和独立Runtime并发领取均继承同一开放root与两级used，旧运行attempt按原身份结算一次。T19逻辑前置解除并转为待办，下一步先做代表测量和启用合同。

## R92状态更新

T19/F11已完成：[报告](rounds/round-92/report.md)。代表恢复链六次领取与独立初次Owner场景已记录；新Workflow冻结12/8两级限额、批准任务deadline和30秒终态观察窗口，策略缺失/未知/漂移关闭处理，旧active不静默迁移。B04实现切片就绪但仍等待CA01联合验收；当前推进T06→T08→B03，可同时推进T10和T11。

## R93状态更新

T06/F3已完成：[报告](rounds/round-93/report.md)。公共Owner请求/决定协议固定来源、版本、证据、消费者完整性和六类结果，重复幂等，冲突与过期关闭处理，且不产生调度副作用。T08前置解除转待办；当前推进T08真实Harness会话验证，再进入B02/B03，同时可推进T10和T11。

## R94状态更新

T08技术验证已完成：[报告](rounds/round-94/report.md)。真实Harness证明Registry公共Owner的只读/永不审批会话、写入拒绝、主线程回报、身份/过期门禁和超时/取消终止可复用；也证明通用`runChild`没有专用结构化提交、fresh Runtime持久回执或Runner consultation reservation。

R95已完成T28/B02：[报告](rounds/round-95/report.md)。专用结构化提交、原始JSONL回执/fresh Runtime重放、当前执行重验、六类主线程投影、consultation槽位和Owner排他、超时/父取消结算均已接入。下一关键路径为B03/F10；T10/T11仍可独立推进。

## R96–R99状态更新

R96/T29完成统一容量、Owner、持久reservation和`resources`双重准入。[报告](rounds/round-96/report.md)。R97/T30完成权威公共决定内部Intent、自治PlanRevision、唯一公共实现、完整消费者合同/迁移依赖及fresh Runtime历史重放。[报告](rounds/round-97/report.md)。R98/T10验证并由T31实现Owner原始历史与摘要恢复：[报告](rounds/round-98/report.md)。R99/T11固定集中验收合同，T12实现Node test采集入口：[报告](rounds/round-99/report.md)。F1–F11生产切片均已关闭，下一步运行F12/CA01固定候选。

## R100状态更新

F12/CA01已完成：[报告](rounds/round-100/report.md)。最终候选`CA01-R100-fac087e62075`绑定Git基线、10431个实际源码文件内容摘要、R4 Spec、31张Ticket、规划快照和集中验证图；10/10项通过，1114个Node test中1093通过、21个明确旧版替代用例跳过，0失败、0取消、0阻塞、0漂移。AC-01至AC-32全部通过，有限剩余必做项为0。
