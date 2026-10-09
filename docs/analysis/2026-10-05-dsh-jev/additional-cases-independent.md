# 其他独立开发者如何使用 Jev

调研日期：2026-10-05（Asia/Shanghai）。本文件补充先前 jevcore、Jive、JevLoop、browser-use/jev-ultrafast、上下文裁剪和记忆案例之外的项目。只读取公开一手 README、源码、作者测量与用户帖子；没有安装、运行、调用付费 API 或修改第三方项目。GitHub 读取使用无需认证的公共页面/API，未使用 gh。

## 最相关的三个案例

| 案例 | 谁触发 Jev | Jev 判断什么 | 结果直接控制什么 | 主 LLM 是否逐次介入 |
|---|---|---|---|---|
| [HA-Jev](https://github.com/AboveColin/HA-Jev) | Home Assistant 的语音输入、状态变化、定时更新或 automation action | Choice 选动作/设备/房间；Noul/Score 回答用户定义的家庭状态问题 | 调用 HA 内置 intent，或更新可供 automation 使用的 sensor；不确定时交配置的 conversation agent | 简单语音命令无需 LLM；fallback agent 可配置成 LLM。不是每次判断先问 LLM |
| [Jevmail](https://github.com/fazlerocks/jevmail) | 同步邮件后的后台 worker、定时 drain、用户 Start sorting | Choice 邮件分类、Score 紧急程度、Boolean 是否个人邮件（Gateway 的 typed API） | 写 SQLite 分类结果，邮件显示在相应 tray；保留概率/不确定标记供用户纠正 | 分类链没有生成 LLM |
| [zod-jev](https://github.com/jomatsu/zod-jev) | 普通应用调用 `parseAsync`/`safeParseAsync`；示例出品表单提交/字段校验 | 每条语义规则一个 Noul，例如类别与商品描述是否匹配、联系方式是否应出现 | 标准 Zod issues；示例把结果映射为发布、拒绝或等待审核 | 校验链没有生成 LLM；中间概率交审核是应用策略 |

表中行为由下方固定提交源码核实，不把这些项目当作 DSH 原生插件或本仓库已经接入的能力。

## HA-Jev：语音小命令直接执行，复杂问题交后备 agent

作者 AboveColin 的 Home Assistant custom integration，声明与 TypeSafe 无隶属关系。它既把答案变成传感器，也提供 `jev.noul`、`jev.choice`、`jev.score`、`jev.ask` automation actions，以及 Assist conversation agent。[README](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/README.md)

具体使用方式：

- “洗衣结束但还没拿出来吗？”由功率/门状态加背景事实生成一个 Noul；答案更新 binary sensor，普通 HA automation 在其持续 on 十分钟后提醒。定时/实体变更由 coordinator 调度，无需 LLM 组织每一次问题。[README 例子](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/README.md)、[状态触发 coordinator](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/coordinator.py#L317)
- “打开厨房灯”把当前暴露的设备与状态、原句发给 Jev，Choice 等结果由本地解释器转为限定的 intent/slots；清楚且能执行时调用 `ha_intent.async_handle()`。响应由 HA intent 与固定本地文案生成，不需要再调生成模型。[conversation 执行](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/conversation.py#L474)、[结果解释器](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/interpret.py)
- 不确定或命令不支持时，`_fall_back()` 将**原句**交给配置的 conversation agent，之前没有执行部分设备动作。后备 agent 可以是 LLM，也可以是其他 HA conversation agent；配置项是 optional，默认没有后备 agent，未配置则返回无法处理的错误/解释。不会自动选择默认 HA agent 或更强模型。部分设备澄清和文字亮度会额外问 Jev，而不是固定只有一次调用。[fallback 源码](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/conversation.py#L551)、[无默认值的配置](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/config_flow.py#L414)、[亮度额外请求](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/conversation.py#L430)

执行失败也区分路径：`MatchFailedError`（找不到目标）和 `IntentHandleError`（所有目标均未成功，代码说明没有动作生效）会交后备 agent；其他 `IntentError` 只返回明确处理失败，不会笼统再次调用后备 agent。[异常分支](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/custom_components/jev/conversation.py#L505)

真实证据及边界：作者在荷兰消费网络、真实 Home Assistant 和真实 API key 上测过，设备是五个内存 fixture，三间房，16 句指令一次各一请求；记录 257–455 ms warm、重启后首请求 512–753 ms。另有 2026-09-30 的本地 snapshot/house-check 测量，文档主动区分无 API 调用的字节/本地耗时与真实 API 数据。[测量记录](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/docs/measurements.md#L153)

这不是长期生产家庭准确率验证。作者记录过 scope 不确定却设备确定时，错误的分支优先级把“厨房灯”执行成全屋；也记录过模型正确但 HA intent 目标参数不正确的失败。数值阈值比较在 Jinja/regex 中做，结果用文字交给 Jev，比要求模型自己算大小可靠。[失败/修正与数字处理](https://github.com/AboveColin/HA-Jev/blob/a71445f885e475a32b727d154d789cf22ecf9b55/docs/measurements.md#L93)

对用户原问题最有价值的是这条现成控制流：原始语音 → Jev → 确定性 intent，只有不适合直通时才走配置的后备 agent。

## Jevmail：后台代码直接处理大量邮件

作者 fazlerocks 的独立 Gmail 邮件分拣应用。同步后对待分类消息持续 drain：每封邮件把发件人、主题、unsubscribe header、是否已回复线程和裁剪正文交给 `experimental_evaluate`，模型明确为 `typesafe-ai/jev`，三题一起求值。[分类源码](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/src/lib/classify.ts)

三题为邮件进入 needs_reply/updates/promotional/sales/spam 哪个 Choice、五级 urgency Score、是否由人专门写给收件人的 Boolean（Vercel Gateway 表面名称，不能直接当成原生 SDK 的 `type:'boolean'` 请求）。后台 worker 将 category、完整概率、1–5 urgency 和 personal probability 写数据库，UI 按 tray 展示。代码用前两名概率差 `<0.15` 标 lowConfidence，**没有把此标记自动交给 LLM**；用户可做独立纠正。[drainer 写入与 worker](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/src/lib/drainer.ts#L58)、[分类不确定性](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/src/lib/classify.ts#L141)

这不是让聊天 agent 一封封生成问题：问题定义在应用里固定，普通 worker 循环和并发池推动分类。429 会等待重试，持续限流则保留 pending 并暂停本轮；没有改走生成模型。[drainer](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/src/lib/drainer.ts)、[错误处理](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/src/lib/classify.ts#L112)

证据边界：README 声称 1,000 封约一分钟/三美分，但这次没有找到配套完成日志或独立对照；只确认调用/计量代码及带真实 key 才运行的若干 synthetic classifier tests。开发 `/preview` 是内存模拟器。默认免费层配置也不是高速模式：concurrency=1、burst=5、约五分钟一 tick；README 的高速配置需要提高并发/burst 与可用额度。[README 配置与 preview](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/README.md)、[可选真实 API 测试源码](https://github.com/fazlerocks/jevmail/blob/f6f20af9c2805efd924c29cbea59547e72c558fc/src/lib/classify.test.ts)

## zod-jev：表单/接口里的语义校验直接变成产品状态

作者 jomatsu 的 Zod 4 扩展。开发者定义“应该成立的条件”，应用先做精确的形状检查，再 `parseAsync` 将共享 value/context 与多个 Noul 一次发 Jev。没有聊天模型选择调用或组织这一次问题。[judge 构建与请求](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/src/judge.ts#L76)、[semantic API](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/src/semantic.ts)

其独立作者实现的二手市场出品 demo 很具体：六项语义规则包括禁售品、外部联系方式、类别匹配、商品状态与描述一致、价格是否离谱、信息是否充分。提交先检查普通 Zod 形状，形状失败不会叫 Jev；语义结果由应用代码直接分支：[规则与表单定义](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/examples/web/listing.ts#L78)、[提交控制流](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/examples/web/listing.ts#L451)

- 在 enforce 模式，明确 rejected → 拒绝出品，并把固定原因显示在字段下。
- uncertain/unavailable → 接受资料但置为 review，等待审核。
- 全部通过 → published。shadow/off 的行为不同，不能拿模拟/观测模式当真实门控生效。

概率门槛由确定性代码解释：`p>=t` 通过、`p<=1-t` rejected，中间 uncertain；无法取得合法结果为 unavailable。库默认 t=0.95，示例针对规则配置 0.8–0.9 等不同值。这里的 review 是产品状态，没有源码中的自动 LLM 审核过程。[判定映射](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/src/judge.ts#L144)、[产品状态映射](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/examples/web/listing.ts#L477)

运行证据：作者 README 报告 2026-09-17 用 Jev 1.13.0 做过同批不同规则测量，例如 clear refund 0.99、undefined urgency 0.55，被对应成 pass/uncertain；还有 opt-in integration tests 与公开 demo。web 文档记录实际 Cloudflare isolate 导致出品记录丢失、随后用 Durable Object 的修正经历，以及真实判断中部分明确一致状态只到 0.86，需降低单规则门槛。[README Thresholds](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/README.md#thresholds)、[web 文档](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/examples/web/README.md)

这是可运行示例和作者测量，未找到独立生产精准率或提速复测；`--fake`/`FAKE_JEV=1` 只验证 UI 与分支，图片上传是 UI dummy，未实现完整认证/购买流程。不能把它说成上线市场的成熟审核系统。[demo 限制](https://github.com/jomatsu/zod-jev/blob/700bd256fe94541a2d21044027cc2dbf5036b396/examples/web/README.md)

## 两个较轻的补充案例

**[mrnugget/jev-shell-history](https://github.com/mrnugget/jev-shell-history)**：用户在 zsh 打字，插件从默认最近 100 条去重历史选候选；Choice 选最可能的补全，Noul 判断是否存在可用补全，两题一请求。代码做字面 prefix、门槛与排序；无候选或唯一字面前缀时不调用 Jev。不够匹配则不展示，没有 LLM fallback。接受建议只填 shell buffer，命令仍须用户回车执行。示范录像使用 fabricated history，脚本需要真实 TypeSafe key；此次未核到交互准确率/耗时的正式对照。[suggest 源码](https://github.com/mrnugget/jev-shell-history/blob/4b2b75d26c0ccf5726263904514a22a8e11659ea/src/suggest.ts#L154)、[zsh widget](https://github.com/mrnugget/jev-shell-history/blob/4b2b75d26c0ccf5726263904514a22a8e11659ea/zsh/jev-shell-history.plugin.zsh)、[README demo 边界](https://github.com/mrnugget/jev-shell-history/blob/4b2b75d26c0ccf5726263904514a22a8e11659ea/README.md)

**[monteduro/killmyidea](https://github.com/monteduro/killmyidea)**：用户提交项目想法，服务端一次问 8 个 Score、category Choice、understandable Noul。代码把 Score 0–4 乘 25 后加权，按阈值输出 KILL/FIX/SHIP；清晰度太低就请补资料，文字为固定模板，无生成 LLM。公开 benchmark runner 是 synthetic case + 重复分布，但没有发布的完整结果可支持预测创业成功。作者 Reddit 明确是示范项目；具名用户 zerocukor287 实际提交该网站自己的想法，并贴出 score=56/FIX 与八项结果，是用户使用迹象，不能当商业有效性验证。[请求入口](https://github.com/monteduro/killmyidea/blob/84f37b2e96922ccab12dcf44af2bf071bbdbf4c0/api/evaluate.ts)、[问题定义](https://github.com/monteduro/killmyidea/blob/84f37b2e96922ccab12dcf44af2bf071bbdbf4c0/src/lib/questions.ts)、[计分/门槛](https://github.com/monteduro/killmyidea/blob/84f37b2e96922ccab12dcf44af2bf071bbdbf4c0/README.md#6-scoring)、[作者与用户原帖](https://www.reddit.com/r/SideProject/comments/1wiw6tk/i_built_a_side_project_to_test_typesafes_jev/)

## 对原问题的意义

这些案例中的小判断由固定应用代码触发，问题定义已写在程序里，结果直接控制 intent、数据库分类、产品状态或显示候选。因此不存在为了每次小判断先跑一轮“LLM 组织问题”的固定成本。HA-Jev 还实现了可配置的后备 agent 路径。是否整体更快、哪些判断可靠仍是场景验证问题；以上作者测量、mock demo 和用户实际反馈分别列出，没有用目录推荐或 Star 替代运行证据。

固定版本记录：HA-Jev `a71445f885e475a32b727d154d789cf22ecf9b55`；Jevmail `f6f20af9c2805efd924c29cbea59547e72c558fc`；zod-jev `700bd256fe94541a2d21044027cc2dbf5036b396`；jev-shell-history `4b2b75d26c0ccf5726263904514a22a8e11659ea`；killmyidea `84f37b2e96922ccab12dcf44af2bf071bbdbf4c0`。
