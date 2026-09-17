# UKR-1 开发记录

状态：开发中。以下都是局部实现及定向测试，不代表 W01～W11、AC-01～32、KAC-01～24 全部完成。

## 当前执行状态：正式入口替换与完整流程重测

2026-09-13，本轮已把无参数 `./start-owner-workflow.sh` 接入统一 Web 宿主，公开插件与 Dashboard 入口转到同一内核，删除 npm/submodule 独立启动脚本、外置 Runner shell 和 package bin。后面的“候选入口、尚未切换”描述是先前测试历史，不再作为启动指引。

正式脚本的真实 CLI 集成测试已通过：四个自研插件就绪、退出回收宿主、原 fixture 配置不变。该测试同时复现并修复 `/var` 与 `/private/var` 路径别名导致入口 guard 静默跳过的问题。新入口与 package 同实现检查通过。

Planner 契约已与计划校验共享字段定义；现场出现的 cwd、verify、resources、entry 和空 verify 错误已纳入工具合同。给规划角色的输入只保留冻结需求及来源身份，完整授权与写入审计仍留在权威校验层。

本轮 8 项原生执行 smoke 全部通过，包括并行 Owner、真实测试、修复失败候选、Spec/Ticket 修订、Registry 收窄后重规划和最终工作区交付。首次在 Codex 外层沙箱内运行时，DSH 创建自身沙箱被 `sandbox_apply: Operation not permitted` 拒绝；获工具审批在外层沙箱外重跑后通过，未改变 DSH 自身权限或沙箱。

旧控制代码与专用测试已按新内核依赖闭包退役：27 个旧控制模块、旧 preset、48 个旧专用测试及 5 个 fixture 已移除；有效的规划授权、来源链、文档边界等测试迁入真实 Kernel。删除前保存在项目侧 `.dsh-workflow/code-retirement/2026-09-13/` 的哈希核验备份可恢复，未删除用户配置。

截至 2026-09-13 22:02 的历史候选摘要为 `528b6bf32b0451f6d7ee19a9842178f797f3a62db950bedbbc2dfa1b2cc11d07`，当时内核 366/366、默认全套 571/571。该候选曾包含 Workflow 内建依赖准备；这项设计后来确认越过工程初始化边界，已从当前实现和验收范围移除，旧数据不再代表当前能力。

正式入口 `./start-owner-workflow.sh` 已启动 Host `449e5f08-b4f1-43d6-a18b-b8cf30912e0e`，当前浏览器原标签页仍在3080；累计66个原生子会话均已检查。最后补读的seed独立Reviewer已通过并由第一次验证action受理，但不替代第二次未结算命令。

R7 已完成Spec/Ticket冻结、12任务DAG规划/审查及seed候选提交。历史实现曾在 Workflow 内启动工程依赖安装，第一次正式验证因此超时；第二次期间Host报ENOSPC退出，旧cmd-95e…仅有intent、没有范围结束凭据。该记录只解释旧现场，不再定义当前流程；当前 Workflow 不会启动同类安装。未重建或取消R7、未清理原候选或失败证据、未修改用户配置或DSH源码。

结论：完整Coinhub全流程尚未通过；旧执行结束证明缺失属于历史现场。当前实现已撤销 Workflow 内建依赖准备，后续验收必须由工程初始化先提供可运行环境，再执行固定验证。下文保留开发历史，不作为当前入口或验收通过的结论。

## 终止保证缺口与已确认的调整

263 项集中回归之后，追加真实原生子进程诊断复现了 `contract_violation`：macOS 上，命令回执已经记录 `writersStopped: true`，脱离原进程组的后代仍能在临时验证目录写入。诊断使用 DSH 原生 full 沙箱，辅助进程运行时间有界且已完成清理，不涉及用户目录、进程或配置。保存了 [原始日志](proofs/ukr1/2026-09-13/native-process-range/probe.log) 与 [源码摘要和事实记录](proofs/ukr1/2026-09-13/native-process-range/evidence.json)。该反例不在此前 263 项中，不能把此前通过视为全部写入者终止证明。

官方 `subprocess-local/src/index.ts` 的 `selectContainmentMode` / `warnFallback` 明确说明 macOS 没有持久进程范围隔离，逃离进程组或直接父子树的后代不保证被终止，也不保证阻止 `waitForExit()` 返回。公开 `subprocess/src/index.ts` 同样只承诺 provider 管理范围。自研 `native-command-effects.mjs` 将这个返回值扩大解释为全部写入者已经停止，需要修正；该事实不是模型能力或重试次数问题。

用户在收到具体调整说明后要求“帮我继续调整修改”，已据此将计划第 4.4 节明确为 macOS 原生托管范围保证。仅 Linux 平台名称不足以证明更强能力，原生 provider 仍可能 fallback。

本轮修改：命令输出明确的 `managedRangeStopped/terminationScope/terminationId`；Action 以 `executionSettled` 表达受控动作结算，Owner 另需持久冻结及在途原生修改锁屏障形成 `sourceWritesClosed`。审批、来源准备、Git 交付与验证的消费端同步修改，不再使用混合 `writersStopped`。候选控制合同升为 V2，旧控制文件直接拒绝，旧命令/Session/验证回执不能静默升级或据此重跑命令。原 macOS 反例转为正式回归：允许观察到逃逸后代，但回执绝不能声明全部写入者停止。Owner 只读 shell、实际越界拒绝、有限对账及未知占用保留不变。

本轮同候选 268 项回归及两项构建检查通过，完整验收仍为 incomplete。原反例的新版回执再次实测：escapedWriter=true、managedRangeStopped=true、terminationScope=dsh-managed-range、claimsAllWritersStopped=false、sandbox=full，辅助进程结束；见 [原始新版诊断](proofs/ukr1/2026-09-13/native-process-range/probe-scoped.log) 和 [源码与候选绑定](proofs/ukr1/2026-09-13/native-process-range/scoped-evidence.json)。此前 263 项及原诊断红灯保留，未切换生产入口、未释放现场旧 Owner 占用。

## 已编写并局部验证

- 纯状态转换内核、跨 Workflow 的 Owner/资源/容量准入、异步提交、候选封存、固定验证、集成与最终原分支快进交付。
- 一个控制 JSON，实际写入进程通过 `fs-ext` 持有 OS 文件锁，锁不按 PID/年龄抢占；文件数据先持久化，再原子替换并持久化目录。原 Python 锁助手已删除，避免锁助手退出但 Node 原生写入仍未结束的窗口。该能力针对本机文件系统；不承诺 NFS。接口依据：[fs-ext 官方文档](https://github.com/baudehlo/node-fs-ext#flockfd-flags-callback)。Context7 查询因月度额度不足，已明确告知并使用官方来源核验。
- 单一事件/定时驱动、显式观察与有限终止隔离、正确根会话原生持久通知。
- 真实 DSH Agent/Session、原生 write/edit 与 CAS、实际沙箱、托管子进程范围停止、独立 Git 候选与回执。
- 编写规划及独立审查动作接线、用户问题适配；这些部分的完整业务/恢复验收尚未完成。
- 改图先冻结受影响尝试并等待结算，保留无关执行和被替换任务历史；来源改变使相关用户问题失效。公共 Owner 请求/决定接入同一 Action，并复用完整消费者与计划绑定领域校验。
- 原始 Owner 历史随集成提交保存在 `.owner-workflow/owners/<owner>/memory/.sources/`，记录改动理由、版本与验证结果；派发时读取历史，摘要作为独立可延后 Action。
- 已增加实际 Git 交付中断恢复和用户未提交文件保护的定向用例。
- 每个 catalog 的实际宿主持有 `executor.lock`，同机两个 preset 共享一个内核；实际进程退出释放 OS 锁，不凭 PID/年龄抢占。工具约束按原生 ToolRegistry 的 Agent scope 识别，普通根会话不受 Owner 主线程限制。
- Operation 已接入相同 Action/Runner/容量/终止和 Decision 路径；无需 Git 或虚构 DAG。实际命令保持只读沙箱，精确副作用决定回到根会话。允许、拒绝及取消均有原生测试；这不等于所有外部能力、自动审批和恢复情形均已验收。
- 主线程工具新增候选接线 `kernel-tools.mjs` / `kernel-plugin.mjs`，真实 Spec/Ticket 写入、checkpoint、Registry 校验、独立 Planner/Reviewer、Owner、测试和交付已联通。自动补写 Git 身份的实现已禁用，checkpoint 使用实际可解析的现有 author/committer；旧生产提示词和工具注册仍待切换时删除。
- 已修复复合 DAG 子节点提前派发：子节点继承所有祖先的外部依赖，输入引用真实前置集成产物；父依赖变化使相应子任务授权失效，复合出口产物传给后继。
- 已修复控制快照读取竞争：原子替换可使已打开旧 inode 的链接数变为 0，读取方使用同一文件句柄获取完整旧快照，不误报损坏。事务后订阅者异常不会把已提交事务报告为失败。
- 并行复制发生异常后等待所有已启动复制退出，才释放清理权限；封存内容在发布引用之前持久化。命令计时器在同步 spawn 失败时同样清理。
- 准备 Workflow Git 引用已变成先登记、后执行的普通 Action；准备 Owner worktree 的身份先于文件副作用保存，中断后在同一目录恢复一次派发。验证命令回执先于汇总存在时复用命令结果，不重复执行。
- 真实固定测试失败会保留候选、反馈根会话并通过原任务重试；原生回归已证明第二次 Attempt 恢复原候选、累计使用一次恢复额度后完成交付。

新增接线和验证：

- Registry 初次批量治理使用普通 Action 和一个真实原生问题；允许后以已有 Git 身份提交自研治理文件，拒绝或取消不创建 Registry。已补充执行中治理及安装中断对账的确定性原生接线，完整组合故障矩阵仍未关闭。
- 执行中主线程原生 Spec/Ticket R2 写入形成父子 checkpoint，通过独立 Planner/Reviewer 与串行 `prepare_revision` 动作把新文档基线和已集成代码结合；真实 Git 崩溃对账、同一 Workflow 的新来源执行及原分支交付均有确定性原生测试。文档写入日志保留全部历史，按当前 Git 基线选取本轮链。
- 执行问题按 Ticket 和原始固定验证绑定，任务改名、拆分及 Ticket 版本变化继承问题和额度；同一验证 ID 更换命令不能关闭旧失败，拆分后需全部相关叶子集成并覆盖原验证。失败但可修复的 Workflow 继续占用项目，避免新建绕开旧预算。
- Operation 复用现有审批设置与只读上游策略核心：规则直通、原生模型复核放行/拒绝、用户精确允许/拒绝/取消已验证。复核 Agent 只有结构化报告工具；会话前缀授权明确记录原生决定、宿主、根会话和目录，实际测试覆盖重复命令、参数边界和不同目录。跨宿主恢复等完整矩阵尚未完成。
- 新 Dashboard 与客户端读取同一规范视图，缺失/损坏状态不初始化或伪报健康，Runner 离线和技术失败可见；HTTP/SSE 读取不推进引擎。已过期失败保留历史和有来源的解决记录。生产 Dashboard 后端尚未切换。
- 候选主线程 prompt 和原生 skill 共用 `kernel-guidance.mjs`，真实双根会话验证了 scope 和共享宿主生命周期。
- 实施授权移除了固定口令：主线程解释最新真实用户消息的含义，提交原文引用及理由，运行时核对原生消息身份、序号和内容摘要。后续用户消息使旧解释失效；插件通知、模型文字和 `approved` 标志不能冒充用户来源。运行时不承诺识别任意自然语言的语义，讨论、仅 Spec、否定及业务范围变化仍必须由主线程正确解释。原生来源烟测已去掉固定授权措辞。
- 公共 Owner 六种决定均有实际原生会话接线测试；补充事实使用原 request 的新版本，同一问题沿用额度，重复事实不能再开会诊。最新决定可替代旧版本决定；能力足够由原生判断关闭，扩展/迁移义务仍需实际实现及消费者集成结果关闭。完整迁移代码交付和业务替代验收尚未完成。
- `workflow_retry_action` 复用普通 Action，支持已证实停止的 Registry 安装、Workflow/来源准备、Planner/Reviewer、最终验证和交付技术失败。新动作保留前驱、原来源、失败回执与恢复额度；不清除用户文件。真实 Git 测试覆盖交付被测试夹具的修改阻挡、夹具恢复自己的修改后成功快进。规划审查自动重试及技术重试同样继承原执行问题额度，不能另开计数绕过限制。
- 首次 DAG 返回原图时明确记录 `planning_no_progress` 失败，主线程诊断绑定进重试输入；首次计划尚未激活也可在原 Workflow 更新 Spec/Ticket。来源父链由 `planningSources` 统一记录，后续修订不依赖已经存在成功的 DAG。真实原生用例覆盖首次审查要求修改 → 原图无进展 → 原生 R2 文档/checkpoint → 独立规划与审查 → 原分支交付，累计额度保留。
- 待激活方案的来源准备失败后，仅在相关动作实际停止、无隔离写入者、实际集成引用仍与控制记录一致时允许替代；旧方案及原因归档。重规划不会清空执行问题；新审查激活可关闭已被真实替代的规划技术问题。Git 来源合并支持有原生父链的连续文档 checkpoint。
- Registry 普通 Action 支持原提案重试及安装对账。批准记录和提交意图按同一逻辑动作保存；安装完成或 Git 分支更新后丢失返回时，不重复询问、不重复更新分支。实际 Git 用例保留用户已有暂存 blob，提交只包含正式治理文件，不夹带记忆和其他用户变更。测试时钟仅推进至既定对账时间，实际安装、原生问题与 Git 操作没有模拟。
- 执行中职责治理在原 Workflow 冻结旧 Owner，只有实际停止后才呈现整批原生决定；旧 Owner 的待答问题同步过期。拒绝沿用原职责；批准后保存精确治理提交基线并要求独立重规划，不能用治理完成冒充业务完成。真实 Spec/Ticket 烟测覆盖固定验证失败 → 原生批准收窄 Owner 范围 → 旧问题与预算保留 → 原 DAG 重新审查 → 新范围执行 → 原分支交付，Spec/Ticket 快照保持原样。
- 启动监督组件按创建的子进程实例、随机标识和自研插件加载状态确认就绪，拒绝无关端口占用及错误实例，日志每次独立保存。插件健康标记使用 Cordis 自带服务及卸载生命周期，删除自建计数表和插件之间的辅助文件依赖；健康表示插件已加载，不冒充 Runner 已执行任务。启动组件尚未接入生产入口。
- 统一测试入口解析固定官方构建依赖，执行前核对每个指定测试是存在且不重复的普通文件。已验证缺失文件、重复项、目录项均在任何测试执行前失败，避免部分收集误报成功。
- 新增的真实双 Owner 并行执行测试复现并修复四处接线问题：FS intent 是宿主级事件，不能让每个 Owner 的监听器拒绝兄弟 Owner，因此集中按实际原生 actor 路由；组合验证只选择当前及已集成任务的固定命令，不能提前运行未来消费者场景；源码快照独立放入 `artifacts/sources/`，避免与同 ID 的验证回执共用 `result.json`；工具执行等待真实派发回执持久化，解决快速模型先于 `action.started` 提交/编辑的竞争。
- 该并行用例确认两个真实原生 Owner 的活动时间重叠、合法各自编辑成功、跨 Owner 写入被拒绝、候选依次集成后下游获取两个真实输入并完成最终原分支交付。模型回答仍是确定性夹具。另有延迟派发回执及回执写入失败测试：前者等待后成功，后者取消工具且不接受候选，不用延时重试掩盖竞争。
- 真实 preset 检查又复现了工具继承缺口：仅保存 `agentPreset` 元数据不会挂载父线程能力。Owner Team 现于原生 setup 中通过 `AgentPresets.composeFrom` 加入父线程正在使用的同一 standing mount，恢复时也不重新读取并切换到另一代次；角色工具限制按实际子 Agent scope 查询，角色提示词覆盖主线程流程段。新增测试把 FS 工具只装在 preset 内，全局明确没有 `read`，验证 Owner 能实际 read/edit 并完成 Spec/Ticket 到交付，且不携带主编排者提示词。继承与 Team 生命周期专项 6 项通过；原生来源及 Owner 专项中的完整流程通过，完整候选报告须随后更新。
- 新建 `kernel-presets/owner-workflow/` 作为切换候选，主线程流程只引用内核 guidance，移除旧 preflight/recover/逐图批准、Ralph 和第二套 workflow 编排工具的指令。它尚未挂载到生产启动；完整原生 Web 组合和客户端发现现已有专项通过证据，原有用户 preset 文件保持原样。内核插件声明补上实际需要的 `subprocess` 依赖。
- 完整候选 preset 经官方 Loader 实际挂载，复现并修复自研入口返回 Runtime 导致 Cordis 报 `Invalid effect`：入口现在按原生插件约定返回空值，Runtime 的销毁仍由原作用域持有。原生完整 preset 流程已完成主线程 Spec/Ticket → Planner/Reviewer → Owner 原生修改 → 固定测试 → Git 交付；全局未直接注册 FS 工具，也未手动注册 kernel 入口。
- 新增 `scripts/kernel-launch-composition.mjs` 和候选 `kernel-web-launch.mjs`：复用已解析的原生 profile，仅组合自研运行条目及项目 preset 根；保留用户自定义根、SoL/Synapse 配置、权限和设置。候选启动路径使用原有数值端口/官方默认值，在修改项目启动元数据前拒绝已占用端口，再通过独立实例和四个自研组件确认就绪；不安装用户 preset、不启动旧 Runner、不自动打开浏览器。旧日常入口尚未切换。
- 真实 Web 联合专项在临时 profile/临时端口启动固定官方宿主，四个自研组件 HTTP 就绪、四个客户端模块实际发现、主线程完整 preset 挂载全部通过；夹具原权限 preset 与 profile 文件内容保持不变。临时夹具不作为用户原配置模型验收。启动组合、端口和监督器联合专项 9 项通过，完整 preset 交付专项 1 项通过；随后统一入口重算同一候选，不累加为额外全量证据。
- 旧状态导入修正了 terminal 标签的连带漏洞：若仍有 Owner 终止待核实，`completed/failed/cancelled` 记录也必须核对预算及规划来源，不能按历史记录跳过。旧状态内容保持不变。
- 公共 Owner 真实迁移交付专项已通过：独立原生会话读取公共模块及两个下游，作出迁移决定；公共模块保留旧接口并新增 scoped reset，应用模块实际迁移，未修改的恢复消费者由自己的 Owner 执行固定兼容性测试，最终真实 Git 交付后才关闭义务。该用例复现并修复 `public-owner-plan` 把兼容性验证也强制要求为 work 节点的错误；`compatible` 允许带固定验证的 verify 节点，`update_required` 仍必须是 work。6 项相关专项通过；模型与规划授权仍为明确夹具，不冒充原配置模型验收。
- 原生 Operation 前缀许可专项扩展到另一真实主线程与同 catalog 的执行宿主重建：均重新呈现原生权限问题，拒绝后无额外原生命令；旧许可仍保留并绑定原宿主，不通过修改记录实现失效。该专项是执行宿主生命周期重建，不能冒充操作系统进程崩溃或全部审批恢复矩阵。
- 宿主主动关闭可能中断尚未持久确认的通知。动作仍保留 uncertain 和对账时间，仅不把本次 AbortSignal 的同一 reason 对象作为运行错误报告；关闭期间的独立异常继续报告。新增正反用例验证没有用过滤错误隐藏清理故障。
- 候选启动器已通过实际 CLI 子进程专项：从自研临时发行目录执行项目插件准备、加载固定官方 CLI、原生 Web 和四个自研插件、接收实例就绪回执、关闭本次宿主、验证端口释放与 profile 原文不变。该测试补出了 SoL 未进入项目包解析表及 Synapse 缺少默认 dataFile 两处集成缺口；SoL 现为自研准备清单的正式成员，Synapse 沿用已有配置路径或原 DSH home 下的既有默认路径。没有修改第三方 Synapse 源码。旧日常 shell 入口尚未切换。
- 原项目原生审批测试的夹具原先缺少必需的 Owner/Synapse 清单，现改为完整真实自研包清单；原生权限默认值、自定义规则与 profile 原文仍保留。项目准备 16 项与真实 CLI/原生审批 2 项专项通过，均只操作临时夹具。
- 已提供 `npm run acceptance:kernel`。入口核对同一自研源码、规格、固定 DSH Git/lockfile 与全部构建产物摘要，执行集中回归及 Owner/审批构建检查，逐项列出 32 个 AC 和 24 个 KAC。尚未收集完整证据的条目明确为 `not_run`，总体 `incomplete` 返回 2；局部测试标签不会自动变成整个 AC 通过。

新组合入口暂为 `src/kernel-runtime.mjs`，不调用旧 Runtime。现有生产入口仍未切换，禁止把两套引擎同时接入实际 Workflow。

## 测试边界

2026-09-13，终止保证调整后的集中回归对同一候选运行 43 个测试文件，268 项通过，失败、取消、跳过及 todo 均为 0；Owner 客户端与自研审批构建一致性检查通过。候选摘要：`f754724949b0b806ca86d1b607044e98b79ac741eaf9f82490251117f2d3cf3f`。保存了 [候选摘要与回归结果](proofs/ukr1/2026-09-13/kernel-regression-268/report.json)、[完整测试日志](proofs/ukr1/2026-09-13/kernel-regression-268/tests.log) 和 [完整验收入口报告](proofs/ukr1/2026-09-13/kernel-regression-268/acceptance.json)。完整验收的 32 个 AC、24 个 KAC 仍为 `not_run`，总体 `incomplete`，返回码 2；不得把集中回归当作生产切换或真实模型验收。运行前后候选摘要一致，没有使用 force-exit。

本轮首个全量候选 267 通过、1 失败，[失败报告与日志](proofs/ukr1/2026-09-13/kernel-regression-268-failed/report.json) 保留。失败时修订后的任务已集成、最终验证仍 running、无执行错误，超过夹具原 20 秒期限；原用例单独重放约 8 秒完成，全部 6 个来源烟测也通过。测试入口改为固定最多 4 个文件并行，控制多套原生宿主的外层资源争用，然后全量 268 通过；未延长场景期限、未改变产品并发、用户模型/沙箱/审批设置。该修改是测试调度修正，不证明产品所有性能场景已验收。原 142、167、219、263 项报告及所有失败日志作为历史证据保留，不累加为额外通过数。

这是集中开发回归，报告中 `completeUkrAcceptance=false`，不是 UKR-1 最终验收。源码后续变化会形成新候选，不能沿用本次通过结论。

原生烟测包含真实主线程文档写入 → checkpoint → 独立规划/审查 → Owner 编辑 → 接收提交 → 独立目录真实测试 → 审查 → Workflow 引用集成 → 最终测试 → 原分支快进。完整来源烟测采用真实原生用户消息绑定与 Registry 校验；另一执行烟测的规划来源使用显式夹具。所有模型回答均为确定性夹具，不作为真实配置模型的能力验收。

烟测曾发现夹具将 Session 日志写进业务仓库，最终交付正确拒绝覆盖未提交文件。已将夹具自己的持久日志目录设在临时测试项目之外，重跑通过；没有放宽交付检查，也没有修改用户配置。

原生执行测试须在 Codex 外层沙箱之外运行，仍使用 DSH 自身真实沙箱。所有资源属于独立临时测试项目，不占用用户 3080 服务。

## 整体完成前仍需处理

以下仍未完成，不得用局部通过替代：

1. Registry 治理、安装中断、首次来源修订与待激活方案替代已有局部实现和原生烟测；仍须覆盖现场导入后的组合恢复与全量验收。实施授权的真实模型讨论/仅 Spec/明确实施/业务范围变化解释仍待整体确认。
2. 公共 Owner 的六种决定、补事实及公共模块/迁移方/兼容消费者完整交付已有原生专项；仍须覆盖义务替代的完整业务决定和组合故障恢复；Operation 审批接线已有局部证据，前缀许可跨主线程/执行宿主失效已验证，操作系统崩溃、外部能力、审批中重启等完整验收仍待补齐。
3. 旧 Workflow 的终止证明及导入激活。Coinhub 只读预检已找到与原记录严格匹配的 Git 元数据 checkpoint，原生用户问题授权有效；预算证明包含旧规划已用 1 次，不能当作 0。该现场当前只剩 `legacy_writers_unconfirmed`，仍未写入现场或激活。追加只读核对发现原 Owner 的 V3 日志共 78 条记录，19 次工具调用只有 18 次结果，末尾停在 `owner_submit`，没有 `turn/end`；空的原生 `session.lock` 是文件锁载体，不代表执行者已停止。更复杂旧版本/重试历史不套用此窄范围对账规则。
4. 生产 `index.js` / Runtime / 外部 Runner 的一次替换、Dashboard / 客户端 / 自研消费者同步、旧控制路径删除、启动实例归属与打包检查。
5. 全量 AC/KAC 同候选证据及原配置真实模型的完整 Spec → Ticket → DAG → Owner → 交付联合测试。原配置模型的 Operation 允许/拒绝及回传、现有浏览器显示已在后续测试通过；不能替代完整 DAG 验收。当前没有宣称完整验收，也未执行日常入口切换。

此前调整未停止/重启用户服务，未修改 DSH/第三方源码或任何凭据、Provider、模型、审批、沙箱、Git 身份及全局缓存配置。后续候选服务启动情况见下文。

候选服务启动前的现场只读核对：复用了原有浏览器唯一 3080 标签，渲染内容仍为 Coinhub 原根会话、当前模型 gpt-5.6-terra。随后在 Codex 外层沙箱之外核对：3080 没有监听，HTTP 请求返回连接拒绝；页面已有内容不证明服务仍在线。旧运行记录中的 PID 19729 已不存在，但这也不证明所有后代停止，不能替代旧 Owner 终止证据。未刷新、发送新消息、开新页、停止或重启用户服务，没有据此推断服务退出原因。DSH 子模块源码状态检查无内部改动。


## 2026-09-13 原配置模型与现有浏览器实测

确认 3080 无监听后，通过候选 `scripts/kernel-web-launch.mjs` 启动 Web，实例为 `d3389156-7a98-4254-b57d-6f0422a2b064`。复用 `/Users/admin/.dsh` 的原 profile、原根会话、gpt-5.6-terra 和现有唯一 3080 标签，刷新该页后执行测试；没有新开标签或清空配置。Owner、SoL、Synapse、自研审批四组件均 ready。抽取核对的 11 个原配置文件在启动前后及测试后摘要一致。该候选宿主保持运行；日常 `./start-owner-workflow.sh` 与旧生产入口仍未完成切换，不能把候选试运行描述为完整上线。

真实模型的两个只读 Operation 已完成：

- 允许路径：原生权限卡片选择“仅允许这一次”，只执行 `node -e "console.log('UKR_NATIVE_OPERATION_OK')"`；退出码 0、stdout 精确匹配，原生沙箱 enforcement=full，Operation completed。
- 拒绝路径：为另一固定输出命令选择“拒绝”，返回 executed=false、permission_rejected、passed=false，Operation failed；没有重试、替代 Operation 或该命令的派发记录。这里的 failed 是预期的拒绝结果，不是把拒绝伪装成执行成功。
- 两个 Operation 合计仅有一个原生命令记录，四条审批/结束通知均已持久化并返回原主线程。浏览器与控制状态共同验证结果；不只依据模型自述。

实测修复了三个自研客户端映射问题：已结束的失败任务仍计入“活动”、运行中的 Runner 被标为离线、已结束任务仍显示“等待/停滞”。最终实现分别保留 terminal 状态、独立计算活动数、映射 Runner 运行状态，并对终态结果使用明确文案。失败记录仍在总览和待查看结果中；没有删除失败状态以获得零活动数。刷新原标签确认“待处理 1 · 活动 0”“Runner 在线；调度器运行中”“任务已结束；结果已保留”。

第一次活动数修改误将失败任务从总览隐藏，现有回归准确捕获该错误：268 通过、1 失败，保留 [失败记录](proofs/ukr1/2026-09-13/kernel-regression-269-display-failed/acceptance.json)。修正后先通过一次 269 项回归；随后追加 Runner/等待文案修复和断言，最终对同一候选运行 43 个文件、269 项全部通过，两项构建一致性检查通过，运行前后摘要一致：`564240a27471b0115d9ca7da63d3afe463c9a323bd3ca696594d41b0c2a69394`。见 [最终回归](proofs/ukr1/2026-09-13/kernel-regression-269-final/report.json)、[完整测试日志](proofs/ukr1/2026-09-13/kernel-regression-269-final/tests.log) 和 [验收报告](proofs/ukr1/2026-09-13/kernel-regression-269-final/acceptance.json)。完整验收仍为 incomplete、返回码 2；56 个 AC/KAC 尚未具备该候选的完整逐项证据，仍为 not_run。

旧 Coinhub Workflow `wf-mtytv0hv-f4ee79f0` 的只读查询返回 `Unknown workflow`，它尚未导入新内核。追加只读预检仍为 revision 551、blocked，来源摘要 `69ec65c64d60cfbc3e9d0b65b01ab2bab3cc6928bd613f80d9979336f4e86b01` 未变，唯一剩余导入阻塞为 `legacy_writers_unconfirmed`。没有凭不存在的 PID 或空锁文件制造终止证明，没有改写旧现场或强行释放占用。新建 Workflow 的 Store 准入也会检查旧记录，不通过另建任务绕开该问题。

[真实模型、权限、命令、通知、UI 与配置核对证据](proofs/ukr1/2026-09-13/live-original-model/report.json) 和 [旧现场只读预检](proofs/ukr1/2026-09-13/live-original-model/legacy-preflight.json) 已保存。本轮证明原配置模型的 Operation/UI 链路可用，仍不证明旧任务导入后的完整 DAG 交付或故障恢复矩阵通过。候选宿主启动早于本轮仅涉及客户端的修复，运行时未变化；最终浏览器刷新加载修订后客户端。这些观察与最终回归分别记录，不拼接为全量同候选验收。


## 2026-09-13 用户取消旧任务并清理活动记录

用户明确要求“那就清理掉”，旧 Coinhub 测试任务 `wf-mtytv0hv-f4ee79f0` 不再计划导入/续跑。核对原状态摘要和 revision 551、两个旧宿主 PID 均不存在，且进程 cwd 清单未发现该任务工作树后，将其状态、控制入口、Dashboard、两个租约、四个任务关联运行状态及旧 Runner 派发目录共 10 项移出活动目录。此次属于用户放弃旧任务后的归档，不构造 Owner 正常终止或迁移验收通过的证据。

可恢复备份及逐文件摘要清单位于 `.dsh-workflow/archived-tasks/wf-mtytv0hv-f4ee79f0-20260913T053932Z/manifest.json`，保留原代码、Git 分支和两个工作树、规划文档及 DSH 会话/配置。三个代码工作目录清理前后 HEAD、已跟踪文件状态与 diff 摘要一致。复查旧任务预检 `records=[]`、退出 0；当前 3080 实例未改变，Owner/SoL/Synapse/审批四组件仍 ready。旧任务导入不再列为该现场后续测试的前置项；新任务完整流程和日常入口切换仍需各自验收。


## 2026-09-13 新任务真实模型测试：规划试错与取消反馈

旧任务清理后，在同一 3080 标签和原 gpt-5.6-terra 配置下创建“离线验收前置检查器”新任务，计划由 build-tooling、quality-automation、product-docs 三个既有 Owner 实施。新 Spec/Ticket 原生 checkpoint 和 Workflow 创建通过，ID 为 `wf-b709c7b88104c4cfeb0d6618f7c746b7c3c5227b`。

本轮复现三个缺口：初始规格混入旧任务完整构建要求，测试者拒绝并给出修订备注后，工具只返回 NOT_GRANTED，主线程未收到具体理由；需补发同一意见才完成 R2。Planner 连续五次因 cwd/verify/resources/entry 等未充分公开的格式拒绝，约 248 秒后最终提交成功；不能称为死循环，但工具合同缺失导致明显试错。测试者决定取消时已进入独立审查，原生停止成功且最终 cancelled；主线程只收到 execution_failure/Persisted action stopped，仍等待最终通知，追加一次只读 status 才结束等待。

Owner 实施和交付尚未到达，本轮不是完整端到端通过。取消现场及代码/会话均保留，3080 服务未停止，11 个原配置文件核对无变化。详见 [测试观察与修复方向](proofs/ukr1/2026-09-13/live-new-dag/observations.md) 和 [真实控制状态、动作、终止及通知证据](proofs/ukr1/2026-09-13/live-new-dag/report.json)。未用新建 Workflow 重置此次失败预算；旧的 269 项回归报告保持历史结论，本轮没有重跑或修改源码。
