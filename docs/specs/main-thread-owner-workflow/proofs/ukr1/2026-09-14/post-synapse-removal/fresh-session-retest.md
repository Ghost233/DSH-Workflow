# 新会话从头复验（进行中）

用户要求重新启动新会话，从头测试。沿用 `http://127.0.0.1:3080/` 的既有浏览器标签页；启动入口为无参数 `./start-owner-workflow.sh`。未清空用户配置、密钥、历史或测试项目。

## 新的真实执行

- 主会话：`Coinhub 本地验收流程重启`，`session-357c433f-0c49-4cfd-a594-fdfa816bd31f`。
- 项目：`/Volumes/LargeStorage/code/Coinhub_Online_Demo`。
- 旧工作流 `wf-03d397fffe12a1d0e9726a73ccb53ba315e3d7eb` 通过原生 `workflow_cancel` 和 UI 确认正式取消；保留历史，未直接修改状态。
- 主线程生成 `docs/specs/local-deterministic-journey-acceptance/spec.md`、T-01 至 T-05 和同目录 `progress.md`。
- 冻结来源：`planning-finalize-9fcd3e802db5f0401914bfff`。
- 新工作流：`wf-13331145b1376e2eb664d2876ac6e576aac57af3`。
- Planner：`owner-69ceb87f129d85587b3a75a3346c4a13ce944497`；已通过原生子代理会话入口读取其实际对话，而非仅观察根会话。

## 已发现并验证的主线程问题

1. 无工作流时 `workflow_status` 没有直接返回已有 Registry，主线程误尝试建立重叠 Owner。原冲突守卫正确拒绝。已复用既有 Registry 读取模块，使无 workflow_id 的状态返回 Registry 及 exists；缺失 Registry 时不创建目录。
2. 编排指导推荐根目录 `tickets/` 和 `progress.md`，与实际文档写入守卫矛盾，造成连续拒绝。已统一指导中的默认路径至 `docs/specs/<主题>/`，未放宽根目录写权限。测试实际提取指导示例并通过真实路径守卫校验。
3. 上述两项经独立诊断后修复。22 项针对性集成检查通过，包含完整 preset；全回归 434/434 通过。回归期间候选摘要保持 `b09c43172e6edc516622355abea95e088504e9793f090c41d668a5fd169a1d7b`，证据在 `fresh-session-regression/`。

Registry/路径指导修改尚未通过重启加载到当前运行中的主机；真实主线程本次通过明确的会话指导纠正路径并复用现有 Owner。不能将本次人工指导后的推进描述成新版指导已通过无人干预验证。

## Planner 当前结果

17:38 起 Planner 读取包清单、网络层、Worker、宿主入口与构建脚本并提交计划。

- 第一次拒绝：`MISSING_CONTRACT_BINDING (task(record_acceptance_evidence).contracts)`。
- 随后提交重复拒绝：`TICKET_DEPENDENCY_UNSATISFIED (task(worker_local_routing).dependsOn: T-03)`。
- 现场输入已观察到 `worker_local_routing` 依赖 `api_local_transport`；后续整体验收任务也绑定了 T-03。需独立诊断 Ticket 工作归属与后续验收引用是否混淆；尚不能认定是框架错误或模型能力问题。

真实项目的业务 Owner 执行、完整验收和最终交付仍未完成。框架回归通过不代表端到端验收通过。

### 17:48 独立复现与终止结果

独立 `gpt-5.6-sol/high` 诊断在真实 `compilePlanningPackages` 接缝复现：

- fixtures(T-01) → Panel(T-02 dependsOn T-01)：通过。
- 下游 journey_tests 依赖 fixtures/Panel，同时也绑定 T-01：同样的 `TICKET_DEPENDENCY_UNSATISFIED`。
- 让 Panel 反向依赖 journey_tests：`TASK_DEPENDENCY_CYCLE`。
- 两个真实上游共同交付 T-01：Panel 依赖二者通过，缺少任一生产者仍拒绝。
- 把 journey_tests 移到独立末端验收 Ticket，声明依赖前置 Ticket：保持编译规则原样即通过。

因此保留“等待依赖 Ticket 的全部工作贡献者”的规则，修正本轮来源拆解。已通过主会话明确要求 T-01 只交付前置环境，新增 T-06 承担末端验收与证据，并在原工作流正式修订来源和重规划。不得仅改任务名、添加反向边或移除验收要求。

Planner 最终于 17:48 自然返回无法发布有效计划的文本，原生 UI 显示当前未运行，活跃耗时 9 分 38 秒。随后 Runtime 将 `act-c3822278920f9781581e56deddd61b483df44465` 标记为 `uncertain`，错误为 `Role finished without a structured report`；主线程因此等待正式结算证据，尚未写入 T-06。已开展独立终止语义诊断：必须区分已结束但缺交付报告与真实终止不明，不能仅凭 UI 未运行放行。

### 终止结算修复

独立诊断通过真实 Native Host 测试证明：DSH 已完成当前 prompt 的 `turn/end`、受控命令范围已停止、写许可屏障已排空，但缺少结构化报告的路径仍返回 `unknown`。这属于自研插件的终止分类错误。

修复复用既有 `action.failed` 事件携带 Runtime 生成的终止证据；完整证据允许结算为 failed，缺少证据仍保留 uncertain。新宿主的 Runner 通过现有 pump/observe 处理旧 uncertain，不依赖修改历史或内部状态。

最终审阅补齐了恢复观察分支的写许可屏障，并将 report 读取放在屏障内，保证等待中的提交落盘后读取最新结果。已结算失败使用独立的稳定通知身份，避免被先前 uncertain 的失败通知去重吞掉。

真实回归覆盖：旧 uncertain 通过新宿主 Runner 观察后 failed、原工作流可重规划；不完整终止证据继续 uncertain；持锁期间不结算；迟到的有效报告被正确读取；结算通知在先前失败通知完成后投递且不重复。针对性三文件共 118/118 通过，日志为 `planner-terminal-settlement-tests.log`。

一次中间全回归虽 439/439 通过，但执行期间代码继续修改，报告为 `stale_candidate`，不作为最终候选验收；其状态保存在 `recovery-regression-stale-candidate.log`。

最终稳定候选回归为 440/440，通过且前后摘要均为 `03ae5bdc99265980e253730df6fef4ca43ee6eecbe61ee52093eb7d1cf8f891d`，证据在 `fresh-session-recovery-final/`。随后正常停止已核实的启动器，并通过无参数入口重启为主机 `0e9cb813-eb88-47c8-8c68-fc39f6a86546`，刷新原标签页。

### 重启后的真实恢复

18:12 主线程只读查询确认原 Planner 已 `failed` 且 `quarantined:false`；正式 `stop_execution` 动作 `act-b1e40e0b87bb8a39f80418a59381760884168327` 已 `succeeded`。当前可恢复条件为 `bound_action_repair`，不是 `writers_stopped_evidence`。更早的主线程说明仍引用未结算时的通知，不能当作最新状态。

独立复现进一步确认：晚到 stop 将 failed/quarantined 变为 failed/clean 时，原有终态通知去重没有唤醒主线程。已沿同一个 `execution_settled` 通知机制补充 stop 完成后的通知；119/119 定向回归通过。此补充在 440 项候选之后完成，尚未加载到运行中的主机，不能混用候选验证结果。

主线程读到最新状态后已继续：T-01 收窄为前置生产交付，新增 `T-06-final-journey-acceptance-and-evidence.md`。首次空参数 finalize 因未包含未修改的 Spec 报 `INVALID_MANIFEST ... exactly one Spec is required`；主线程正在处理，自动来源清单的延续行为另行独立诊断。业务执行仍未开始。

18:19 主线程为满足当前仅从脏文件构建 manifest 的限制，升级并改写了整套 Spec/Ticket 引用；经原生规格决策确认后，生成 checkpoint `planning-finalize-8d48494d5cfd052969069362`。已在原工作流调用 `workflow_replan`，新 Planner action 为 `act-987d8fde5f2d8d03c37d8ea3706a2f045255f798`，恢复额度 1/12。随后原生会话入口出现第二个子代理、其中一个正在运行。第二轮 Planner 为 `owner-6ddf057f3d12a7a74a325ab4d476eb527eecbcc3`，已进入其原生对话查看执行。

独立复现确认局部修订不能继承未变来源是自研缺陷：finalize 先从 git status 的脏路径生成完整 manifest，之后才读取父 snapshot。重启不是必要条件。修复将使用同一 root/session/project 绑定的父 checkpoint 精确路径闭包，并保留未变文件的 hash/版本和父 provenance；实际变更仍要求当轮原生 journal。不以 glob 全 docs 或重复写入未变文档作为正式方案。该修复正在实现中，未加载现场。

### 18:28–18:37 独立审查与局部边界缺口

第二 Planner 在 4 分 13 秒、156K token 后一次提交成功，形成 8 个任务，候选摘要 `a6f8d5cd8058c88be23ffeecbe8d5a2d8579d0c7cae432683e6fa6a3fd824129`。独立 Reviewer `owner-de725af5ee88c952a4092ced1111df6bfdcdd9c2` 运行 1 分 33 秒、93.8K token，指出 Worker 路由变更发生在 API 影响审查之后，需增加 Worker Owner 独立影响评估和下游验证证据。接受的义务为 `OBL-WORKER-PUBLIC-IMPACT-REVIEW`。

主线程自动发起局部重规划，恢复额度 2/12，边界为 `worker_transport`、`worker_impact_review`、`final_acceptance`。第三 Planner `owner-51e869e71ed312af64c797fbd438f24976f2b8b4`（action `act-7220e8d6e427ecef374f138dc543a7f1cb087521`）在 1 分 32 秒、90.2K token 后结束。实际提交拒绝：`TICKET_DEPENDENCY_UNSATISFIED`，`task(web_host_parity).dependsOn` 缺少 T-04 producer `worker_impact_review`。

Planner 文字结果明确指出应将 `web_host_parity` 与 `extension_host_parity` 加入修订边界，两者必须等待新增 T-04 producer。但缺少有效结构化报告时，主线程仅得到笼统 `Role finished without a structured report`，误判只能修复报告协议后重试。Runtime 本轮已正确确认自然结束并结算 failed，没有再次卡在终止不明。

18:37 通过现有根会话反馈实际提交证据，要求同一 workflow 扩大至上述五个实际受影响任务、保持无关任务和固定验证，正式 replan，不修改来源或原样 retry。反馈传递缺口已交独立 sol/high 诊断，尚未更改协议代码。

父来源继承修复已冻结：覆盖两代局部修订、重新构建 runtime、未变来源 hash/revision 保留、历史 Spec 排除、多父歧义/跨项目/篡改/删除拒绝；父继承与晚到 stop 通知的合并候选正在执行完整回归，尚未重启加载现场。

18:38 主线程按证据正式扩大至五任务边界，恢复额度 3/12，action 为 act-cab6239d33f7ac5552849c991b9ba7c08c0a2f9d。第四 Planner owner-25682af8965da5aa6a68c77d06c61b1d632f15f2 于 18:40 开始，1 分 47 秒、95.1K token 后提交被接受，未再出现依赖编译拒绝。18:44 派发第二位独立 Reviewer owner-e7b90622581fa946688db762cb0c708fe61f06c0，已进入原生会话查看。

合并候选 ebe028caedacfad2c128264bff43bb8a05ad66036171e5f3295784c2477941c6 的完整回归为 441/442 通过，证据在 parent-inheritance-regression-failed/。失败源于旧 public Owner 测试夹具初始 checkpoint 使用 main-checkpoint-agent，而后续 runtime root 使用 kernel-main。正式 startWorkflow 与 planning admission 明确拒绝这种跨 root 来源，因此保留生产身份守卫，修正夹具使用同一稳定 kernel-main，显式断言父来源与当前 root 身份一致。修正后 native-public-owner 全部 7/7、多代父继承场景 1/1 通过；跨 session 父来源继续拒绝。最终合并回归待 Planner 负面报告反馈修复冻结后统一执行。

第二 Reviewer 的首次 passed 因未能核验 OBL-WORKER-PUBLIC-IMPACT-REVIEW 的 obligationClosures 被拒绝。其最终 accepted 报告实际为 needs_revision，不是通过：worker_impact_review 的 write/verify 均为空，缺少明确影响记录生产者及受影响消费者验证绑定。当前候选摘要为 8372aba3b6f3d8b7efd6fb1e91b889f6974c94bdd5f81872224971af4c42ba46，审查 action 为 act-09c90ea7d823b13eeddb71edce40bfa1b06d7c94，耗时 3 分 11 秒、105K token。
18:48 主线程自动按反馈重规划，将 worker_transport、worker_impact_review、panel_journeys、web_host_parity、extension_host_parity、final_acceptance 六任务与 journey-suite/typecheck/extension-typecheck/web-build/extension-build 五项既有验证纳入修订边界，action act-4014d222b4473f8895845bb7a9d053aa74d16f4c，恢复额度 4/12。没有改来源。该审查要求的必要性正在对照只读 Owner 报告持久化和实际 closure 检查独立核验，尚不把审查意见直接认定成新的框架缺陷。

### 18:54–18:56 不收敛的语义根因

第五 Planner owner-f6ccae6dd8b739e92e1231258a16d40deab407f4 运行 4 分 47 秒、173K token 后文本结束。按顺序出现：新增 api_worker_consumer_validation/panel_worker_consumer_validation 超出边界；保持原末端验证又被 Planning repair did not change required verification commands or bindings: extension-build, extension-typecheck, journey-suite, web-build 拒绝；修改上游验证绑定后再被 api_transport/api_impact_review 越界守卫拒绝。现场已 failed/settled，恢复额度 4/12，未扩大 API 边界。

独立 sol/high 对照真实第四版计划和冻结来源确认：
- AC-08 要求公共 Owner 评估变更，并重验受影响消费者；T-06 明确为唯一末端全量验收生产者。
- 第四版 Worker review 已在 worker_transport 之后，Web/扩展等待 review，final_acceptance 等待 review 和全部业务生产者，再跑五项全量验证。Panel 可先实现，之后的终端验证仍属于 review 后的复验。
- 普通只读 Owner 的报告会持久进入 submission.json、attempt.submission、Git 内 Owner history 及 immutable worklog；write:[] 不表示没有审计记录。summary 内记录影响清单足够满足当前 AC，并未要求新的机器动态派发契约。
- plan_task_executable 却隐含要求 verify.length > 0，误判无需独立代码测试的只读 review。
- targetVerificationIds 又被解释成每一项命令或绑定都必须改变，形成 closeWhen 未声明的第二闭包条件，逼迫已有正确末端验证进行无意义变更、增加晚期 producer 并不断扩大 DAG。

已决定保留第四版依赖结构、Owner 隔离与固定命令，修正上述语义；不增加业务任务、不改来源、不清空义务/状态或恢复预算。负面 Planner 报告修复同时让该类真实阻塞经原有 review/issue 通道到达主线程，避免只剩笼统缺报告错误。代码正在修改，不能视为已通过现场验收。

修复实现的验证边界：
- plan_task_executable 只校验已经规范化的叶任务、Owner 及合法 write/verify 数组，允许只读审查的空数组。
- targetVerificationIds 继续作为关注范围和允许修改的边界；不再隐式强制全部命令/绑定发生变化。显式 plan_verification_binding 若缺少目标绑定仍不能关闭。
- 保留 planning_no_progress、无关任务定义和既有验证边界守卫。现场下一轮将明确只读报告的影响清单与现有末端验证映射，作为有意义的 done 澄清，不做空白/版本号式变更。
- 负面 Planner 报告复用 DSH_PLAN_REVIEW_V1 与同一提交工具，只携带具体问题；不允许 passed 或伪造关闭声明，不生成可执行候选。Runtime 独立记录编译拒绝证据并绑定 action/input/snapshot。
- 首次规划没有 previousPlan 的来源拆分失败也必须可通过这一正式负面通道反馈；不能只覆盖已有 DAG 的局部修订。

当前定向证据：closure 相关 workflow-engine 100/100；只读 Owner 报告 Git 持久集成 1/1。尚待整体候选冻结与完整回归，现场仍停在原失败记录。

### 合并候选回归与正常重载

最终合并回归为 451/451 通过，候选前后摘要均为 c3573675de910062c219a6b54bdd153cb02d04a354de409ed7391eb9714e5290；完整报告与日志位于 convergence-semantics-regression/。原运行会话的7个子代理均未运行后，核实启动器PID 59514并正常SIGTERM；原启动进程退出0。随后仅通过无参数 ./start-owner-workflow.sh 启动新宿主 83c9a59b-b93c-43cd-9043-55c5d6f8e793，3080 ready；原标签页已刷新。未修改 ~/.dsh 或任何密钥/模型/权限配置，未清理项目状态、历史或额度。真实续跑尚待该宿主验收，451项回归不能代替业务Owner及最终旅程验收。

19:14 在原生浏览器中恢复同一根会话，向主线程提供已验证的语义修复依据。19:15 主线程正式 replan，action act-6fa75924c69178011ec4dda392184926f6221c01，恢复额度 5/12；沿最后有效第四版结构，只澄清 worker_impact_review.done 与 final_acceptance.done 中的持久报告/验证映射，不改来源、固定命令或已有验证绑定。下一轮 Planner 和独立 Reviewer 的真实结果待观察。

### 19:16–19:19 新负面反馈通道的现场验证

新宿主 Planner owner-73bc3398343b097fbf4b52620dda9ef8d4d04d5c 的首 patch 被 Web/扩展边界守卫拒绝：只澄清上游 task.done 也会改变递归执行身份，Web/扩展是实际下游，不属于无关模块。该 patch 同时额外给 worker_impact_review 加了 typecheck，原 previousPlan 的 verify 实为 []，需在后续审查继续核对不必要绑定。

Planner 通过同一提交工具提交了负面 review（经历分类字段及不可变 obligation 身份的纠正后 accepted），没有文本结束丢失原因。Runtime 将真实边界错误和具体 targets 自动通知根会话，主线程无需测试操作者转述，正式扩大到 Web/扩展后重规划。新 action act-6a3666988565e662dc95d74d228cdd2ebf9284b2，恢复额度 6/12。说明负面报告→Runtime证据→主线程定向replan链路已在真实模型现场走通；整个业务Owner与最终验收仍未开始，不能扩大该结论。

### 19:22–19:27 提交接收与最终结算不一致

后续 Planner owner-c83f4e0812a85f8f7b2e2471b9a789c690fc94c4 耗时1分20秒、76.5K token，工具返回 accepted；实际提交保留 worker_impact_review.write=[]/verify=[] 和五项终端验证。该 accepted 不等于规划结算成功。只读核对 control-state.json 后确认：act-6a3666988565e662dc95d74d228cdd2ebf9284b2 最终于19:22 failed(planning_no_progress)，没有派发新 Reviewer，根线程已暂停，额度6/12。

此前“等待审查”的观察仅基于工具回执，已更正为未通过最终结算。原因是新提交与 previousPlan 相同：已有第四版计划足以满足修正后的审查语义，但无变化守卫在独立审查前拦截；preflightPlanningResult 又忽略 applyPlanningResult 的 planning_no_progress 返回，仅回 true，使有效性预检与最终结算结果不一致。正在进行新的独立诊断，目标是不靠无意义改done/命令制造hash差异，允许正确计划重新审查并保留防空转约束；尚未改动该守卫。

### 相同有效计划的有限复核修复

独立诊断与修复已冻结。相同计划仅在当前全部阻塞审查义务的 closeWhen 已有 Runtime 可核验事实时，允许一次独立 Reviewer 复核；资格探测不写入 closure，仍由 Reviewer 显式声明并经 verifiedClosure 核验。相同 snapshot/plan/完整义务身份集合已有负面 closure-only 审查时，重复提交继续拒绝。无开放义务、缺少真实绑定等仍立即 planning_no_progress。native preflight 同步返回该拒绝，并经既有 artifact 通道保存，避免“accepted 后才失败”。

定向测试 Workflow Engine 103/103、native planning package 3/3 通过，日志同目录 no-progress-*.log。模型 schema 中 targetVerificationIds 描述也已同步为关注范围与允许修订范围，不能暗示所有验证必须改变。完整回归正在执行；现场尚未加载该修复。

完整回归 454/454 通过，无跳过、取消；候选前后摘要一致：4cc5ca2f47e24a1c6bfd4be940cfe7e282a01cbefa068af8edac0054bd5effc5。证据 closure-review-regression/。该结果仅证明自研固定回归，不能代替真实业务 Owner 与最终旅程验收。

454项回归后，核实所有9个子会话停稳，正常停止启动器66370，旧启动退出0；仅用 ./start-owner-workflow.sh 启动宿主6c18a364-e399-4024-8f5e-590958298c3d，3080 ready。刷新原标签页，无配置或状态清理。

19:46 主线程正式 workflow_retry_action，恢复 action act-8d59671c408faf0d16a3feafcfa0be70758e86ab。Planner owner-88af81f364b8deb01fc92b3243a2c7e88f2f1376 运行1分27秒、78.6K token，一次提交 accepted；随后只读 Runtime 状态确认 action 已 succeeded，正式派发独立 review_plan act-5a62ffaf9a5720dcfcbcf5fd0f8a8180cc16fdb1。此次不仅回执接收，最终规划结算也通过；Reviewer及业务执行仍待验收。

19:52 独立 Reviewer owner-1c0085ee8d0b3d12121762c0646364a6c77c3524 实际阅读冻结 Spec、T01–T06、progress、package 及 API/Panel 接缝后，一次提交 passed，显式提交原两项 OBL 的 plan_task_executable closure，绑定同一8372计划摘要。Runtime确认 review action succeeded、两OBL closed、activation.review passed；prepare_revision succeeded，fixtures 与 api_transport 两业务任务进入 dispatching。恢复累计7/12，原来源保持不变。只读审查语义和相同有效计划复核路径已通过真实模型验证；业务交付尚未完成。

首批业务Owner：fixtures会话owner-f0e0f37bc9335c800bc5b6bfb0708a91fdeab812，5分11秒、146K token，写tests/local-acceptance/fixtures.mjs与fixtures.test.mjs，本地node测试报告4/4通过，Runtime execute_owner succeeded后进入seal_candidate。API会话owner-2b6c93e7c63d36417f5ff2b1d704e9b02dd03216，写src/api/network/local-acceptance-transport.ts及service.ts；首次仅pwd/列目录的Bash发生Control lock acquisition timed out，后续工具继续成功。其npm run typecheck实际exit127，sh: tsc: command not found，Owner完成报告如实记录未通过，不能算验证成功。两项环境/锁事实已发独立诊断，尚未认定根因或修改。

Runtime固定验证产物已落盘（action尚待完整结算）：fixtures-suite实际4/4通过；API typecheck实际exit2，local-acceptance-transport.ts:105 TS2366缺少末尾return。两项均命中相同依赖key9e278926...，每项installRuns=0/fullTreeCopies=0/baseHashedBytes=0；逻辑依赖1761456007字节，分别overlay25.498秒/18.487秒，安装环境信息处理52.617秒/48.773秒。证据first-owner-fixed-verification.json。API此时失败属于真实业务类型错误，已成功区分此前Owner诊断环境缺tsc；待正式反馈与定向修复。

20:12–20:14 夹具Reviewer owner-37a2661f1b1c31da4b717745589331bb09588079（2分38秒、143K token）通过，固定verify action succeeded，候选进入集成。API Reviewer owner-aa5d1eac9c4d53a8718ecb0a83a147374c7fd920（1分52秒、98.1K token）拒绝：TS2366、main-route missingSession在本地transport前受真实credential短路、缺本地transport API自动化引用证据、公开配置缺测试环境约束。Runtime verify action failed(verification_failed)并notify_main，主线程自行workflow_retry_task，完整传递全部缺口，同task修复action act-f5592d49359604cf2fe72ad96e56d0dd3647f8f3，恢复8/12；未改DAG或来源。

独立锁诊断已确认自研NativeCommandEffects使用catalog全局admission锁，持锁顺序扫描355个历史命令，fixtures命令在真正spawn前约29秒，API等10秒超时。不是stale锁或pwd自身慢；正在修改按action隔离与历史定位方式，尚未加载。Owner工作树不准备依赖是当前明确契约，固定验证才负责准备，因此此前tsc127不需要改变配置或给Owner共享node_modules。

命令准入根因修复已冻结并完整回归456/456通过，候选前后一致5b4664ff7bd5516e5ee15d404cf5dd72b556ce5dc1c7561a19c08a7d498e0d1e，证据action-admission-regression/。按action锁与action-intents持久定位，旧flat只在宿主接管时建一次索引；host生命周期executor锁防合法旧版writer并存。scoped intent先原子持久化，旧flat alias同inode，alias缺失/冲突失败关闭，不会先spawn后记录。定向红绿覆盖异action并发、同action未结算拦截、200历史扫描、旧flat恢复和alias异常。当前现场仍加载454项候选，活跃Owner/集成未停稳，因此尚未重载，不算已通过该修复的现场验收。

20:23 fixtures正式succeeded，Owner memory结算。独立性能诊断：integrate总726471ms（20:11:23.608→20:23:30.079）；真实integrations目录candidate.index于20:14:54以65B出现，前置authority+snapshot约198s；至20:23:20变147721B，约506s对应1223项逐文件git hash-object循环，Git objects持续增加、宿主CPU约97%，尾段worklog/prepared/result约6s。不是死锁。正在以有界多文件argv批量hash替换逐文件进程，完整manifest/Owner范围/ref原子更新检查保留。

API repair Owner已完成提交，但只改两个实现文件，没有新增明确要求的接缝自动化测试；已通过UI实际初始prompt核对repair.instructions完整包含全部测试要求，属于执行遗漏，不是反馈丢失。该prompt还包含完整1222项candidate manifest，记录为上下文负担观察，不据此宣称遗漏因果。

20:24新的错误分类：repair Owner将诊断typecheck exit127经owner_execution_feedback报告，Runtime生成issue-958d47d64d6b4273d8db5ed8f4b67fb1a2682dfd/source_revision_required，主线程打算修改Spec/T03加入TypeScript契约。测试操作者已在原浏览器根线程说明Owner无依赖是现有设计，Runtime固定验证已正常运行tsc，要求暂停该无根据来源修改，保留issue等正式修复；未直接删改状态。反馈分类独立诊断开始。

批量Git hash修复已冻结，仅workflow-git-effects及测试。真实1223项夹具旧实现1224次hash-object/29.7秒，批量后10个regular批次+symlink/history stdin共12次；大场景3.76秒。每批<=128路径及<=128KiB路径字节，严格核对hash数量和40/64位合法对象ID；空格/换行/前导dash/Unicode/executable/symlink raw tree完全一致，少hash/非法hash拒绝。对应文件4/4通过，日志workflow-git-batched-hash-tests.log；尚待与反馈分类合并全回归。Context7月度配额耗尽，使用本机官方git帮助+真实行为验证，未配置服务。
API第二候选固定typecheck已exit0通过，但新增接缝测试仍待Reviewer核验。

20:35 第二API候选Reviewer owner-3d2918e84145585bd170b8f2be3c89b0490eb709拒绝：typecheck已通过，但local匿名edge HTTP/业务401被无条件转NotAuthedError，与生产仅有token时转换不一致；聚焦接缝测试仍缺。根线程自动workflow_retry_task在20:35派发第三次API修复，action act-2056e34651766b0cb5aea0c6ef0078ac58b257d3/attempt try-e83959dc2a39bedff140384617e9f60740fe1f9e，总恢复9/12。20:36测试操作者要求暂停后续恢复准备正常重载，但该消息晚于派发；已再次澄清保留在途第三次修复正常完成，不增加恢复次数，不把根线程暂停误称所有动作停稳。

补充上下文观察：第二候选Reviewer prompt约10045字符，无repair.instructions和此前review.reasons，仍自行发现测试缺失与新的401行为不一致。此处记录审查上下文连续性风险，当前未据此扩展改动范围。

第三API Owner于20:42:34正式提交（页面4分36秒、1.1M token），只修改service.ts的401分支，仍未新增接缝测试；再次上报旧kind=verification_environment资源观察，形成issue-fb8014cc546dc551b2f9c607b849f3724d74cb6a。根线程继续遵守暂停，不修改来源。seal_candidate act-af18bb358e090d0a9e5b77fd6e73430c977ce012已成功，verify_candidate act-32ff419a0da9947d1f222cfd8a2c4f86a70707d7运行中；尚不能判定第三候选通过。

独立只读上下文量化：第三API action.input为214360字符，repair211773字符；candidate manifest1222项206256字符，占repair97.40%，含Figma路径860项约149973字符。修复instructions613字符。纯模型投影估算3563字符可保留修复指令、候选/issue/attempt/decision身份、失败验证与审查摘要，Runtime仍保留完整manifest。Reviewer现有自定义prompt确实绕过repair上下文；已授权实现共用纯投影与严格持久action身份绑定，不改变验证协议。payload大小与三次Owner墙钟不呈单调关系，不能将漏测试单因归咎上下文长度。

第三候选8c52959d5c8c288ee16adaaad690b6697ff8699638e8ccea9c007af30d010459的Runtime typecheck再次exit0通过。依赖cacheHit=true、installRuns=0、fullTreeCopies=0、baseHashedBytes=0，overlay19.594秒、安装信息处理24.129秒。独立Reviewer owner-f46e02d3c9a66c0ede656d13ef89d4f42488b8c2在原浏览器可见，实际阅读local transport/service/credentials、fixtures、多个API消费者并检查入口与配置，尚未提交结论；不是空等。

反馈分类修复已冻结：新入口仅显式public_contract_gap(contractId)与runner_resource_observation(verificationId/observedExitCode)。历史typecheck-unavailable和verification_environment仅按精确结构、真实task及冻结typecheck argv迁移，不从detail猜测。资源问题只能由同attempt真实verify_candidate的候选/命令/依赖binding与受控终止事实关闭；退出0..125且不同于观察值才可成为资源恢复证据，126/127/128+保持open。exit2仍保留独立verification failure。未知旧反馈保持unclassified且阻塞，不会伪造公共契约或放宽最终门禁。定向日志保存在feedback-classification/，未直接修改live状态。

第三候选Reviewer最终失败，实际审查约8分43秒：walletTradeUnary独立fetch路径未覆盖本地fake；既有standalone fixture未引用production seam，无法证明API行为。审查正确区分Runtime typecheck exit0与review目录自行npm typecheck exit127，没有将后者当源码错误。首次结构化报告不满足candidate身份校验被拒后，Reviewer用准确contentDigest重提并正式结算。完整第三次审查未通过，不能因typecheck绿判完成。

21:02左右出现新的编排不遵从：根线程已在20:36/20:42确认暂停后续恢复，却在第三次失败通知后再次调用workflow_retry_task，recovery从9变10/12，生成第四attempt try-c6b2d77872340c36b90e28bd8b72da6e88483526 / execute_owner act-e35f0bab1c39729ba4a7175a217b973389887791。测试操作者准备发送的暂停消息正遇根线程通知启动，UI发送按钮变排队发送；核对状态后没有伪称9/12或手工恢复预算。随后再次明确保留已派发动作结算，但任何后续通知只能报告不能retry/replan。此缺陷说明对话中的暂停承诺未形成Runtime可强制的控制约束，未因纠正消息而宣称已修复。

第四次repair文字要求“删除或重构standalone fixture”，但API scope只为src/api/**，该文字不能授权越界；已在根线程明确保留fixtures成功成果。根线程只读分析确认API内部需要可执行行为测试，而当前固定验证只有typecheck；新增API行为命令应经正式局部计划修订与独立审查，不能把它伪装成已有验证，也不能要求API Owner改quality-automation目录。

共享repair模型投影已接入native-session真实派发：Owner默认prompt与自定义Reviewer prompt收到同一持久repair投影，不读取可变task.repair。真实Owner/Reviewer派发测试4/4、纯投影3/3通过；真实第三API输入投影3553字符，对比211773字符，instructions与前次review完整保留。完整Runtime candidate/manifest保持原样。已启动全部组合回归，现场仍是旧454项宿主且第四API动作在途，尚未重载。

组合全量首次467/468，唯一失败是workflow-diagnostics的手工runtime夹具缺少新增ownerFeedbackObservations方法，证据combined-regression-first/。将夹具改为继承真实KernelRuntime.prototype，保留真实状态计算后，该文件测试通过。重新冻结全回归468/468通过，无跳过/取消，前后候选一致728a4a79084fa81ec8abefe02de5268069eb51061c25981476361e8f9dee5dff，证据combined-regression/。这是自研固定回归完成，第四业务Owner仍在原454宿主执行，不代表真实业务整体验收通过或已加载最新候选。

第四Owner实际修改src/api/network/local-acceptance-transport.ts、wallet-trade-client.ts和network/credentials.ts，随后owner_submit completed；仍未新增测试文件。未越界删除fixtures。新的旧自由报告形状为{issueType:verification_blocked,taskId:api_transport,detail:...}，形成issue-ba186e558fa5a2d6e8a347a66c15a105c0b54f5a；新typed schema尚未加载，因此历史变体仍可产生。已交独立诊断判断严格迁移是否有足够证据，不能直接忽略unknown或关闭final门禁。第四seal act-5859e87c835986256913f30e21874b21fe86f737 succeeded，verify act-99b70f3d622d6d21b16d96347a50714d9c2a7ff7运行中，恢复10/12。

对第四次旧格式issueType=verification_blocked的独立诊断已完成：它与verification_environment仅复用同一严格旧三字段shape/真实task/唯一typecheck argv迁移；不同enum、额外key、错task、多验证仍未知且open。新反馈前门继续拒绝三种旧格式，统一要求显式kind+verificationId+observedExitCode，未来不依赖自由文本分类。若旧report实指编译失败，同attempt typecheck exit1/2仅关闭资源观察，独立verification failure仍阻塞，未放宽交付。相关11/11、106/106通过；最终兼容候选重新全回归中。

最终历史格式兼容候选再次468/468完整通过，前后hash一致aac535856a89a172f493a6c79e9b61b21fb47af94edcb11f0692d0c86b13c1a1，无跳过/取消，证据combined-legacy-feedback-regression/。第四Owner owner-cbddb881ef5fd7cd59b54ff1a5704933c3354a2f页面显示6分19秒、1.9M token。第四候选Runtime typecheck exit0通过，尚待独立Reviewer和现场重载。

第四Reviewer owner-46a95dac1fe390ea2789ec1a23cffa5ba02b56c7（页面3分21秒、183K token）判passed，绑定候选87d81ae23662122fbf8911e05c74033de92bc8ba4229b840d3d043a927482a48；认可wallet gateway在本地mode fail-closed和认证/重连语义，并正确采用Runtime typecheck exit0。该次审查已搜索src/**/*.test.*，但没有继续处理前三次提出的API行为测试缺失，实际仍未新增测试文件。这是跨轮审查要求不连续的现场证据，不能将当前通过扩展为行为验收通过。新框架的repair投影已修复上下文传递，但此审查仍由旧宿主执行，不能宣称修复已现场生效。
Runtime随后verify succeeded，API进入integrating，act-079d23640bc6b2d84f809a1eda51f9b700da62b0运行。原页面22个子会话均显示当前未运行；当前剩余只有集成动作，不是Owner源码写入。正在独立核实正常launcher TERM在此阶段的持久集成恢复语义后再决定重载，未强杀或改状态。

正常重载现场证明：仅有integrate_candidate处于candidate.index构建、22个源码/审查子会话idle时，对刚查到的launcher PID83980发送一次TERM，旧启动exec退出0；无参数./start-owner-workflow.sh启动host2a691f18-37cd-4687-8754-cc00558c7a39（日志1789392519467-2a691f18-37cd-4687-8754-cc00558c7a39.log），刷新原标签页并自动恢复相同根会话。没有新开标签页、清理状态/history、修改Key/模型/权限/沙箱。三个资源issues均由新Runtime drive按同attempt真实typecheck事实闭为runner_resource_available，恢复计数10/12保持。

被中断的API integrate在新host observe中重建索引并完成，正式API succeeded；代码commit3fc64ea0ab7b80de587efbc562db3d561ec3ff14，附Owner历史后的集成commit bca4f7190160e9b53d94e4003475072559424ed7。memory-curator owner-6a83198390c38adbd709421b7516700be904f146实际26秒/5.6K token，明确记录没有额外行为测试，未把typecheck扩大为行为验收。

api_impact_review Owner实际2分24秒/116K token，读取API diff、registry、Panel、Web与其他消费者，声明Panel/Web/扩展需重验，Worker proxy协议未直接受影响，默认生产协议保持兼容；仅提交Owner报告，没有源码写入。该task当前仍在候选封存/后续核验，不能将Owner提交接收等同任务完成。

重载后的新锁超时独立诊断：日志只发生一次WorkflowStore.transact(drive)获取control-state.lock超时，后续dashboard Runner已恢复running/lastError:null，之后integration、memory及Owner继续完成，非持续死锁。28,409,028字节control-state含301 actions，离线完整drive约2.72秒，当前workflow/58 actions单独0.187秒；全历史重复扫描/摘要存在非线性成本。锁内还包含read/assert、整态copy与changed时28MB序列化/fsync，重载恢复突发事务与25ms非公平轮询可使请求等待10秒；日志不足以断言具体持锁者超过10秒。Owner源码写入使用action锁，不是该全局锁。未通过增加超时处理，也未在本轮临时扩展控制状态架构；建议后续用一次性索引或revision校验的锁外纯计算缩短关键区，并补大历史+重载并发验收。

代码工作区检查：main HEAD aac638899edb3f4e028d01dfd44e555847aceded，origin/main及实时远端main均154914064f5ceb2f8eb413865e10a54e8ffbc663，本地ahead1、不behind。本轮没有commit/push或清理既有脏文件。自研最终468/468固定回归及正常重载已验证；Coinhub最终journey、Panel、Worker、Web/扩展与交付尚未验收，不能标记整体验收通过。

只读公共影响任务的真实误拒：核验Reviewer owner-754ea70bbef97eabacd6ce9b14bb586fb52481f0通过Glob impact/docs、grep搜索源码，最终以“required API/protocol-owner consumer-impact record is absent；results empty；Markdown无记录”拒绝；实际Owner已在owner_submit summary完整交付。当前Reviewer prompt缺少当前submission.report，只传代码tree/task/results，因此合法的write=[]/verify=[]报告交付不可见。Reviewer还自行运行未绑定的typecheck(exit127)和fixturetest(4/4)，并把前者当兼容性未核验；这是范围/证据传递错误，不应让Owner越界补Markdown或增加无意义固定命令。首报candidate格式不符后又grep框架错误，最终读取kernel-runtime校验才提交正确格式。修复已由独立诊断进入实现：严格绑定当前submission receipt到candidate/attempt/action，再向Reviewer投影当前报告；提示区分合法只读报告与源码文件，并用candidate常量绑定提交schema。尚未回归或加载。

同时定位无固定命令报告任务的恢复闭包缺口：实际issue-76e4dd495f0187adfe16f67046d32428c5c43c61(origin execution，api_impact_review，T03)的closeWhen.verifications=[]；refreshExecutionObligations现有分支对空required直接continue，成功报告核验/集成后也可能不能关闭历史失败。已安排独立诊断及严格报告证据闭包修复，不改live或任意放宽无测试代码任务。当前恢复10/12，原api_impact_review attempt已failed，尚未再次恢复。

当前Owner报告投影修复定向4/4通过，包含无taskPackage路径与report/artifact/digest错绑拒绝。对真实act-eec56438593456a6d3247527ace8df700cde7b06直接只读调用candidateSubmissionPromptFields成功，取回同候选1f8308…的完整报告与paths=[]；报告实际已具备消费者重验与默认remote兼容判断。证据current-owner-submission-review-tests.log。尚待readonly恢复闭包修复合并全回归和现场重载。

报告审查+只读恢复组合修复471/471通过，无skip/cancel，前后候选一致2ef615f246c2671600011b6f04b9f7b66b11a4f1caab085991e37f7456c7dc91；完整证据report-review-recovery-regression/。当前无在途action、10/12时对刚核实launcher PID52204正常一次TERM，旧exec退出0；无参数入口新host5e969edf-7399-4b61-8f3f-56547b6b30c6启动，刷新原tab后原会话恢复。通过主线程明确仅授权api_impact_review一次正式恢复，不修改来源/状态，成功后既有DAG自然继续；后续失败禁止自动retry/replan。尚待真实报告复核结果。

现场正式恢复为workflow_retry_task，恢复11/12，attempt try-3ba7d50e7ef9e877b09344c1dd15b7405c7d1ae9。Owner owner-85d213a3b1f6e233992e87875606567df2dfc5e0实际1分01秒/37.5K token，合法只读报告提交，seal约228.718秒，候选仍1f8308fbc0e917c1708360ffff8c04d4b35b84b8c81fd99036a5703e08a0dc74，业务源码不变。独立Reviewer owner-3dfa8b73c18b8f134548f99bef5d800797c5520f实际2分13秒/135K token，页面确认ownerSubmission、当前sub-try和candidate绑定存在；读取报告后首次workflow_action_submit passed=true且准确digest，明确接受报告交付与静态兼容结论，未将自发typecheck视为门禁。verify act-c0b5514b544fd6b2b1430c04bf7e9fa2d3a61672成功；integrate act-69b6d4b5b2baa0e9385e9b4151638c7b108d8e09在途时两execution issues仍open，符合必须待集成的规则。子会话列表有延迟且verify action evidence未含sessionId，不能据此断言Reviewer未开始；此前准备耗时解读已纠正，以实际子会话时间为准。

真实只读恢复验收通过：integrate act-69b6d4b5b2baa0e9385e9b4151638c7b108d8e09 verified=true、commit24043f736b5043adb330a645a070992cbd1eb508。api_impact_review succeeded后，issue-76e…自动closed，evidence.kind=review_report_verified_integration；同T03 API原issue-edde…也自动closed。恢复11/12不变，Runner自动派发panel_journeys与worker_transport。完整限定证据readonly-report-live-acceptance.json；整体3/9，最终验收仍未完成。

按用户侧边讨论要求，当前两处框架修复优先完成，并已具备471/471回归及真实只读链路闭包证据；后续业务由既有Runner继续，没有扩新修补。Panel实际只修改src/panel/views/MarketView.tsx并提交，typed runner_resource_observation(typecheck,127)正确建立资源观察issue-a097…；等待Runtime固定typecheck后判定闭包。Worker仍在执行。当前整体3/9，不能描述为整体验收完成。

用户要求最终测试后：现场Panel/Worker均已固定typecheck通过、独立业务review失败，无在途action，恢复11/12。外置冻结候选定向测试连续两次3项1通过2失败：Panel真实onCommit回调的A成功/B失败交错回滚错误；Worker真实local handler响应交给真实AaBbFrameReader报BAD_MAGIC。控制项local mode opt-in且外部fetch为0。证据final-acceptance-probes/RESULT.md及脚本/两次日志。两个业务缺陷阻止下游4任务和最终页面旅程，整体验收未通过；未重试或扩新框架修复。
