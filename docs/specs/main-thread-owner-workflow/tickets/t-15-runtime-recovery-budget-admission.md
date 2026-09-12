---
id: T-15
spec_revision: R4-V03-1
type: 实现
status: 验收通过
depends_on: [T-13, T-14, T-23]
acceptance: [AC-11, AC-15, AC-20, AC-24, AC-31]
---

# T-15 把同版本恢复入口接入一次性预算领取

规格：[R4第12节（R4-V03-1）](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：12.2、12.3、12.5、12.6。来源：[T-09证据](../proofs/t-09/report.md)；全局状态与唯一共同场景见[进度索引](../progress.md)。本次只拆解，未分配实际Owner或启动开发。

## 交付行为与范围

在显式新协议、固定执行版本的局部工作流中，让Supervisor与Owner恢复共用持久领取，拒绝无余额的外部恢复启动；有限技术修复按合同继续，真实用户待决仍交主线程。

范围之外：不启用生产默认值、不迁移legacy现场、不承诺跨版本继承、不实现硬deadline资源结算，也不在验证方案未就绪时自行猜锁/ID语义。

## 模块与并行边界

预算持久适配模块（名称由T-14确认）、runtime.mjs及必要control测试；必要index/model/shared契约由主线程统一写入归属。同文件与T-17/T-18/T-19串行。

所列模块是执行前核验的候选范围，不代表已获得写入归属；同一文件同一时间仅一个写入者，主线程独占规格、进度和Git操作。

## 前置与解除条件

逻辑依赖：[T-13](t-13-recovery-budget-ledger.md)、[T-14](t-14-durable-recovery-admission-proof.md)。

T-13接口稳定，T-14提供持久领取、并发、根问题身份及启动对账的正向证据并回填12.2。如果T-14提出额外存储/会话实现前置，应先登记完成，不能以报告存在解锁。

## 交付要求

- 接入Supervisor派发、直接Owner、普通/重复恢复、自动超时恢复及确实会启动外部恢复工作的局部重规划；外层与内层不得双扣。
- Runtime固定首次根问题及当前未解决映射，结合T-02有效关闭及T-03相关证据维护；T-04用户依据优先规则保持，不把预算失败转成用户授权。
- 已领取未启动attempt可恢复，同一次交付结果重放不二次扣/退；启动不确定先按T-14对账。相同候选新建Runtime继续读同一账本。
- 所有新协议启动需显式有限配置；缺失/无效拒绝，不能回落到无限额或legacy。旧active Workflow原行为/审批保持，生产默认启用留T-19。
- 问题耗尽与Workflow恢复总额耗尽的适用范围不同；主控制投影、Supervisor和直接Owner输出一致，独立初次任务仍可实际启动。

## 验收映射与正式测试

关联：AC-11、AC-15、AC-20、AC-24、AC-31。共同预算场景引用进度中的BUD编号，只在该处维护；CA-01仍是唯一交付级定义。

BUD-01至BUD-05、BUD-09的实际同版本Runtime入口。复用T-09代表事实重现旧缺口，再断言账本/派发次数；模拟模型回合允许，但持久领取/恢复入口不得被stub替代。定向覆盖现有convergence/control/plugin/security/runner相关路径，正式范围实施前确定。

正式范围由实施轮次按实际影响固定；停止写入后保存源码/依赖摘要，独立项失败继续采集，保留失败/跳过/未运行/超时。缺必要测试适配时先显式登记前置，不能在验收现场暗中补平台。

## 完成与进入集中验收

同版本预算门禁及兼容反例通过；每个实际启动可追溯同一领取。只开发完成局部入口，T-17/T-18/T-19和CA-01未完成前不能称B-04已交付。

## 当前关闭边界（整体盘点后）

以[整体收敛清单C1–C6](../convergence-checklist.md#t15关闭矩阵与边界)集中核对同版本实际入口、根问题/控制投影、预留与未知会话、局部replan、显式配置/legacy兼容和BUD证据。R78正在正式验证实际仲裁→最新有效Review→后继局部重建；正式完成后再更新该项证据，不凭局部数量标整单完成。

T15只做一次有限入口关闭审计并补真实必须缺口。新hard deadline/取消结算归T17，执行版本激活与跨版本继承归T18，代表测量/生产默认启用归T19，完整调度及Spec/Ticket执行版本分别归B03/B01。这些其他工单未完成不应成为T15无限吸收新范围的理由，也不能因T15完成而标B04/CA01通过。

本节和frontmatter表示当前状态；以下T14阻塞及逐轮记录为历史，P14前置已在T23/R41解除。

## T-14验证后的明确阻塞

T-14已开发完成但只证明存储可用基础，完整适配尚未成立。需先细化并交付P14-A（Runtime权威根问题/来源与持久领取）、P14-B（预留会话/prompt身份及对账），经P14-C真实持久后端联合复验后再解除。本工单保持阻塞，不能仅因T-14状态完成解锁。证据：[T-14报告](../proofs/t-14/report.md)及[拟议合同](../proofs/t-14/proposed-contract.md)。

## 实现前置的工单映射

P14-A由[T-20](t-20-recovery-source-admission.md)承接；P14-B先由[T-21](t-21-session-persistence-contract-proof.md)核验真实合同，再由[T-22](t-22-recovery-session-reconciliation.md)实施；P14-C由[T-23](t-23-durable-admission-session-proof.md)联合复验。T-23正向证据是新增直接依赖，负向完成不解除阻塞。

本工单消费前置的领取/会话适配，负责Supervisor、Owner、恢复和局部重规划入口接线及投影一致性；不重复实现T-20来源事务或T-22会话协议。

## 第41轮：P14前置解除

T20/T22已交付局部适配，T23[联合报告](../proofs/t-23/report.md)正向且规格已回填，P14-A/B/C前置闭合。本工单从阻塞转待办，在持续推进授权下可进入实施。上述历史阻塞保留供追溯，不表示当前仍受P14阻塞；本工单尚未开发完成。

## 第42轮实施中

直接recoverOwner已接持久领取，普通failed runExternalOwner拒绝绕过；正式311通过/7既有跳过。但独立审查2P1+1P2未修，见[报告](../rounds/round-42/report.md)。第43轮先修原恢复前置/分流回退；Supervisor/outbox/timeout、外部重规划和完整投影仍待接线，本工单未开发完成。

## 第43轮

稳定态前置回退已修，正式318通过/7既有跳过。独立审查发现authority同源terminal与领取拒绝通知竞态；第44轮继续技术修复。详[报告](../rounds/round-43/report.md)。

## 第44轮

R43 authority竞态P1已关闭，正式92/92及独立审查无新增P1/P2。详[报告](../rounds/round-44/report.md)。直接恢复切片稳定，后续继续Supervisor/outbox、timeout、局部replan和完整控制投影，整体仍开发中。

## 第45—46轮

Supervisor真实控制链已接预算、失败来源保留和暂停投影，耗尽后独立Owner实际成功。R45正式316通过/7旧跳过，审查所见占槽超时循环经R46正式31/31关闭，无新增P1/P2。whole-workflow、timeout/replan及整体投影仍未闭合，保持开发中。见[R46报告](../rounds/round-46/report.md)。

## 第47—48轮

whole-workflow恢复已保留失败来源并交实际Supervisor扣预算；用户待决优先、未结算回执对账、未知来源/缺配置拒绝。R47产品回归通过，唯一control夹具读写竞态经R48原子发布关闭；当前证据323通过/7旧跳过（含hash复用）。后续timeout/replan与完整主控制投影未完成，保持开发中。见[R48报告](../rounds/round-48/report.md)。

## 第49—50轮

探针保留Owner失败身份和预算，缺配置拒绝、真实用户依据优先。R49正式110通过但审查发现record incident无效重排；R50保持技术暂停关闭该入口，正式111/111且独立审查无新增P1/P2。见[R50报告](../rounds/round-50/report.md)。其他Supervisor技术拒绝重复排队、timeout/replan和统一控制投影继续待办，不标记本工单完成。

## 第51轮

同一来源的领取/校验拒绝不再自动重排，实际新增失败仍按额度恢复；独立T2真实完成。正式271通过/7既有跳过、无漂移，独立审查无新增P1/P2。[报告](../rounds/round-51/report.md)。统一技术暂停/后继/主控制、timeout和外部replan仍未完成。

## 第52—53轮

技术暂停/必要后继不转用户决定，独立任务继续；报告及主等待投影接入。R52发现批准残留策略、投递目标和混合用户待决3项P2，R53真实批准和混合态补验关闭，正式319通过/7既有跳过、无漂移。[报告](../rounds/round-53/report.md)。自动超时、外部replan与完整联合一致性仍待，不标记T15完成。

## 第54轮

现有空闲超时改为持久取消请求，不提前重排；实际终态后进入预算链。正式337通过/7既有跳过，无漂移，独立审查无新增P1/P2。[报告](../rounds/round-54/report.md)。外部replan同一预算的非Owner执行绑定尚未实现，固定hard deadline属于T17，保持开发中。

## 第55—56轮

纯预算账本已接受互斥的replan_operation执行绑定，与Owner共用两级额度且保留严格重放/回执/关闭约束。正式118/118；R55公开合同遗漏经R56文档修正及独立审查关闭，源码不变。[报告](../rounds/round-56/report.md)。T20 mixed admission、权威来源映射、实际外部调用的持久启动和输出对账仍待接线，不将纯协议支持视为本工单完成。

## 第57轮

Owner/replan mixed intent接入实际saveState当前状态事务，首次失败直接操作/付费失败继承root、序号与回执门禁、跨进程重放和最后额度竞争正式180/180，无漂移，独立审查无P1/P2。[报告](../rounds/round-57/report.md)。内部operationId不是启动授权；实际cycle/handoff provenance、candidate义务来源、每次runChild与输出对账尚未完成。

## 第58轮

通用replan会话已连接真实provider与持久JSONL提交对账；预留身份、创建前固定、未知不重发、系统提示输入固定、多step及aborted成功提交均验证。正式154/154、无漂移，独立审查无P1/P2。[报告](../rounds/round-58/report.md)。成功提交仍未结算语义成功；实际cycle/handoff入口与咨询逐次计费、候选结果应用待续，保持开发中。

## 第59轮

失败报告handoff按固定执行来源分组，真实Planner逐次计费、最新状态候选与T13结算原子写入，active版本未激活。正式280通过/7既有skip，无漂移。独立审查1个P2：直接requestHandoff的applyPlanDelta删除source Owner并清空审批，使新来源无法校验；需R60保留source/active版本、冻结proposal并等待真实终态。参见[报告](../rounds/round-59/report.md)。候选Review/咨询与版本激活仍未完成。

## 第60轮

修复直接requestHandoff删除来源：active状态保留、proposal单独固定、实际Owner终态前不领取；技术blocked/报告重复handoff按原paid root结算，typed用户权限不豁免。正式238通过/7既有skip，无漂移，独立审查关闭R59 P2；新增completed提交未拒绝同源pending直接请求的P2，R61优先修复。[报告](../rounds/round-60/report.md)。Review独立计费、候选重建与版本激活仍未完成。

## 第61轮

R60 P2关闭：pending直接handoff在检查/验证/commit前拒绝completed，纠正blocked后继续；反向提交窗口也拒绝新handoff。正式228通过/7既有跳过，零失败/超时/漂移，独立审查无新增P1/P2。[报告](../rounds/round-61/report.md)。同类审计发现request_subgraph仍会删除活跃source，需处理结构性入口保护及版本事务边界。T15仍开发中，Review逐次计费等尚未完成。

## 第62轮

恢复保护的request_subgraph在delta前拒绝在线版本激活，保留当前计划、来源和预算；所有模式拒绝提交中/已有回执后的展开。正式186通过/7既有跳过，零失败/超时/漂移，独立审查无新增P1/P2。[报告](../rounds/round-62/report.md)。这是能力门禁，完整子图候选消费及T18继承尚未实现；T15仍开发中，下一优先为候选Review实际调用逐次计费与来源继承。

## 第63轮

恢复handoff候选的workflow_revision_review已接真实revision_review会话，固定active A来源与候选C、与Planner共用root预算；锁外child、最新状态原子写入预算/session/Review/convergence。合法needs_revision成功结算，语义错误下一ordinal计费，未知/来源变化不重发，重开Harness复核原始回执零模型。正式181通过/7既有跳过，零失败/超时/漂移，独立审查无新增P1/P2。[报告](../rounds/round-63/report.md)。开发夹具错误/超时日志保留。T15仍开发中，discard/rebuild根继承、咨询与剩余控制投影待续，T18尚未激活。

## 第64轮

实际Runner的恢复候选local_subgraph_rewrite已绕过破坏来源的通用discard/Intent路径；旧候选+Review作为前驱保留，新的计费Planner成功才原子替换，再由计费Review审查。新逻辑操作与原问题共用预算，cycleId及未关义务继承。语义失败/耗尽/并发变化不丢前驱。正式178通过/7既有跳过，零失败/超时/漂移，独立审查无新增P1/P2。[报告](../rounds/round-64/report.md)。T15仍开发中；手工discard、其他策略/会诊、技术错误主控制投影待续。恢复候选激活暂拒绝，T18未实现。

## 第65轮：候选恢复持久暂停

正式186通过/7既有跳过，无失败/超时/漂移；真实socket通知、daemon发现和新Harness重开不重复同源执行。独立审查发现1项P2：candidateRecoveryIdentity未覆盖完整候选，失败与暂停事务之间parent/review/content并发变化可能把旧错误写入新候选。下一轮修复完整候选身份，允许本次操作/session正常推进。 T15仍开发中。

## 第66轮：暂停事务候选并发隔离

R65 P2已关闭，完整候选改写拒绝旧错误pause/outbox；真实Reviewer创建丢响应仍首次持久暂停。正式190通过/7既有跳过，零失败/超时/漂移，独立审查无新增P1/P2。T15仍开发中，后续独立调度审计已记录，本轮未实现。

## 第67轮：独立任务选择与确认边界

选择器/target补丁与真实暂停状态集成已实现，正式49/49，无失败/跳过/漂移。P2：reserved/launching reservation对应stopped/completed任务时没有计入全局槽位，需在选择前拒绝矛盾持久状态。 Runtime派发尚未接线，T15仍开发中。

## 第68轮：未终态占用状态一致性

R67槽位漏算P2已关闭：occupied对应任务必须pending/running，否则拒绝；running reservation不重复计槽。正式54/54，零失败/跳过/超时/漂移，独立审查无新增P1/P2。T15仍开发中；下一步Runtime持久reservation与Owner生命周期绑定接线。

## 第69轮：独立任务持久领取

最新状态事务原子写target补丁和source绑定reservation，重放与新Harness复用，正式217通过/7既有跳过，无失败/超时/漂移。审查发现直接Owner入口门禁绕过P1及重放掩盖task终态P2，下一轮合并修复。Owner生命周期仍未接线，T15仍开发中。

R70真实socket更正：公开owner-sync/run-owner已被既有V2前置守卫拒绝，原公共入口P1判断错误；确认范围仅为内部Runtime方法门禁缺口（P2）。R70保留失败日志并补内部方法/锁内竞态测试。

## 第70轮：Owner入口与重放一致性修复

内部Owner方法及锁内最新读取检查reservation，重放先核验真实任务状态。公开V2 socket原有守卫已阻止调用，R69公开P1误判已更正。正式221通过/7既有跳过，零失败/超时/漂移，独立审查无新增P1/P2。实际Owner生命周期尚未接线，T15仍开发中，接缝审计已记录。


## 第71轮：独立 Owner 实际执行

正式275通过/7跳过，无失败/超时/漂移。真实执行、固定验证、集成、Memory、技术失败、权限等待与来源变化围栏已验证；独立审查有终态reservation配对P2，下一轮修复。daemon尚未接线，T15仍开发中。[报告](../rounds/round-71/report.md)。


## 第72轮：终态 reservation 配对

R71 P2已关闭；真实lease/两类重放拒绝矛盾终态，无验证/commit/HEAD推进，保留launching合法结算过渡。正式200通过/7既有跳过，无失败/超时/漂移，独立审查无新增P1/P2。T15仍开发中，daemon接线审计已记录、尚未实施。[报告](../rounds/round-72/report.md)。


## 第73轮：daemon独立任务派发

真实discovery/socket→Owner验证/集成及fresh reserved恢复完成，launching/未知历史不重发。正式242通过/7跳过，零失败/超时/漂移。审查P2：旧审查摘要仍可领取，启动前失败错误结算failed导致终态配对矛盾；下一轮同根修复。T15仍开发中。[报告](../rounds/round-73/report.md)。


## 第74轮：共同准入与启动前拒绝

R73 P2关闭；最新资格拒绝零目标写入，真实Registry启动前拒绝不伪造failed receipt并稳定暂停。正式224通过/7既有跳过，无失败/超时/漂移，独立审查无新增P1/P2。T15仍开发中，下一优先核验并接入仲裁有限预算。[报告](../rounds/round-74/report.md)。


## 第75轮：恢复仲裁未计费启动门禁

真实旧入口预算1/1后仍新增3次模型调用，已封堵。直接/driver/剥离副本拒绝及初始会诊正向通过；正式199通过/7跳过，零失败/超时/漂移。初审并发P2经实际生产/接纳路径核对撤回，最终无确认P1/P2。此仅临时门禁，T15和正向计费仲裁未完成；下一步逐OwnerAdvice持久预算/session/回执接线。[报告](../rounds/round-75/report.md)。


## 第76轮：逐 Owner 会诊持久计费会话

内部 owner_consultation 已接同根预算、只读角色、固定 Owner/session/prompt 和结构化原始回执；真实重开零模型重放、预算耗尽、错误 Owner、无提交及创建后丢响应均已验证。正式322通过/21既有跳过，零失败/取消/超时/漂移，独立审查无确认P1/P2。submission_observed仍未语义采纳或成功结算，实际仲裁生产者与计费Review待接，R75门禁保留，T15仍开发中。[报告](../rounds/round-76/report.md)。


## 第77轮：实际恢复候选 Owner 会诊生产与采纳

真实前驱Planner/Review认证→逐Owner同根计费→原始建议回执→最新状态原子采纳/预算结算已实现。多Owner部分失败仅重试失败者，fresh重放零新模型，未知创建不重发，完整候选/Owner/Registry来源围栏及未结算applied拒绝已验证。正式332通过/7既有跳过，零失败/取消/超时/漂移，独立审查无新增P1/P2。T15仍开发中；R75仲裁门禁保留，下一步paid arbitration Review必须同步接通后继重建的最新审查来源消费。[报告](../rounds/round-77/report.md)。

## R78：计费仲裁与最新Review来源已接通

实际会诊→Arbiter→后继局部重建→新Review路径，以及已采纳仲裁的重放、预算耗尽和未知创建处理已验证；原始来源记录保留。两项并发P2经确定性回归和只读复审关闭。[完整分候选证据](../rounds/round-78/report.md)。T15保留开发中，下一步按[有限关闭矩阵C1–C6](../convergence-checklist.md)核对真实入口；不继续扩张为T17/T18/T19整合工单。

## R88：C1–C6 有界关闭完成

[关闭索引](../rounds/round-88/closure-index.md)已把全部同版本实际入口、根问题/控制投影、预留与未知会话、局部replan、显式配置和BUD-01/02/03/04/05/09映射到固定候选。正式19套480通过、7个既有legacy跳过、0失败；一项R29测试断言已按R60的固定来源handoff失败结算合同修正，生产Runtime未改。

T15开发完成，解除T17前置。hard deadline/停止结算归T17，跨版本继承归T18，默认配置启用归T19；B04和CA01仍未完成。

## R100 集中验收

状态：验收通过。关联的AC-11, AC-15, AC-20, AC-24, AC-31已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。
