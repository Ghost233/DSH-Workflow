# 完整目标验收账本

本轮目标为完整执行 Coinhub 本地确定性用户旅程验收，不以框架回归通过替代业务交付。

当前 workflow：`wf-03d397fffe12a1d0e9726a73ccb53ba315e3d7eb`。R14 已冻结为 `planning-finalize-3235dd314dc77bc9ccadbf13` 并提交一次重规划，恢复次数 3/12。R14 Planner 因新验证 ID 被边界拒绝而未提交有效报告，动作已正式结算为 failed；对应修复已加载到正常重启的宿主，待原浏览器恢复后通过正式入口继续。尚未激活业务执行 DAG，因此下列业务完成项均未证实。

| 目标 | 完成所需证据 | 当前结论 |
| --- | --- | --- |
| 模拟登录进入 Market，未登录入口 | 运行共享 Panel 的本轮自动化断言 | 未执行 |
| Onchain/Top 列表加载、筛选 | 对本地固定数据及错误状态的断言 | 未执行 |
| 搜索与进入 Detail | 用户操作、结果与路由断言 | 未执行 |
| Chart/Data/Holders/Profit/Trades 切换 | 五个页签、懒加载、断流和重连断言 | 未执行 |
| 关注、取消、Watchlist 排序 | 成功、写失败回滚、重试和排序断言 | 未执行 |
| Trade 模拟完整路径 | quote、allowance、preflight、提交状态及失败路径断言；无真实钱包、签名或广播 | 未执行 |
| 未登录、401、网络中断、流重连 | 可控时间与 fake transport 的确定性失败矩阵 | 未执行 |
| Web/扩展共享 Panel 一致性 | 同一 fixture 下 page/float 可见状态与事件比较 | 未执行 |
| 生产行为和协议兼容 | 默认路径及 API/Worker 路由、认证、CORS 等契约验证 | 未执行 |
| Chromium 与外网阻断 | 实际浏览器启动；DOM 断言后验证外部导航阻断 | 未执行 |
| 类型检查 | 当前最终候选 `typecheck` 和 `typecheck:ext` 结果 | 未执行 |
| Web/扩展构建 | 当前最终候选 `build` 和 `build:ext` 结果 | 未执行 |
| 新增验收测试 | 每个已注册 suite 与 all-suite 的本轮实际断言结果，未知 suite 拒绝 | 未执行 |
| Owner 隔离与公共变更 | 正式 Owner 写入边界、影响评估、受影响下游重新验收 | 未执行 |
| 依赖复用 | 本轮安装、整树复制、摘要成本及污染隔离记录 | 本轮尚待执行；历史结果不充当本轮通过 |
| 可审计交付 | Spec/Ticket/DAG/Registry/Owner 历史、命令结果、问题修复、外部阻塞与收敛结论 | 尚未交付 |

## 已直接查看的 teammate 对话

以下均通过原浏览器标签中的子代理会话菜单打开，读取实际工具调用及提交；业务 Owner 尚未派发，不能将这六个规划会话冒充业务 Owner 完成记录。

| 会话 | 实际工作及关键现象 |
| --- | --- |
| `owner-ecf2dddb4ec7a99573d1a694177b27e3c24df1e9` | R11 Planner；检查 package、网络、Worker、Panel、Web/扩展和类型配置后提交计划。 |
| `owner-51fe7c89aed941b68bf222b8b5d84ff127b0f22b` | R11 Reviewer；发现缺持久验收记录 producer；提交先因 closeWhen/分类约束两次拒绝。 |
| `owner-fc1edab3de9a212bcd465d16b34eb352b12350e3` | R12 Planner；planPatch 被“缺少已接纳的旧计划”拒绝，随后提交完整计划。 |
| `owner-b52a3f25cf259cff7b6c63e3c3ca181755285a2e` | R12 Reviewer；记录 producer 已补齐，但出现 suite 注册顺序错误和最终构建验证缺失。 |
| `owner-7091a956e319c2f22770739ef52a3e2e706cb03f` | R13 Planner；提交因未改变两个宿主验证命令而拒绝，再提交计划。 |
| `owner-8bf0d8659fce851094c970414ee43f41fcd10fdb` | R13 Reviewer；三次遇到 obligation 身份/来源约束错误，最终复制旧问题提交 needs_revision。 |
| `owner-b2a15cd5618f3ecfc1383c7d59372b8743269fa7` | R14 Planner；已从主页面子代理菜单打开，实际读取 Skill、package、scripts/tests、progress；提交出现 `Verification patch exceeds revision boundary or repeats an id`。宿主随后记录 `Role finished without a structured report`，正式动作最终 failed。 |

独立 `gpt-5.6-sol`、`high` 分析已确认：未激活候选未参与后续重规划，导致局部修复退化为整图重写；验证修复只比较命令定义，错误拒绝仅修改绑定的修复。两项修复已落入自研内核，正在完成回归。只读重放真实状态已恢复 R13 的 17 个任务、14 项验证，见 `candidate-recovery-replay.json`；未变更运行状态，恢复次数仍为 2/12。

界面碰撞已改用官方 header action slot。645px 和 1280px 实测队友按钮中心命中正确元素，645px 实际打开六个子代理的菜单成功。375px 仍发现自研 Owner 模式徽标挤压原生会话导航；独立 UI 分析继续处理。地图进入和 iframe 内“对话”退出已实测，但地图显示无会话，与主页面实际六个子代理不一致，尚待修复。首次进入地图时出现短暂浏览器控制超时，刷新同一标签后恢复；没有新建标签、清理历史或改动用户配置。临时 viewport 已恢复默认。

## 本轮追加修复与未完成项

- R14 实测暴露新增验证 ID 的边界死路。新规则只允许全新验证绑定本轮授权且实际变更/新增的任务；原验证定义仍受硬边界约束，不引入新状态机。红测 0/2 → 2/2，核心 103/103。真实 R14 输入只读重放成功，见 `r14-boundary-repair.json`。
- 地图服务器实际已有当前根会话；独立诊断发现浏览器分页 roots 漏掉 current/catalog children，以及每秒约 70,158,703 字节的全工作区 projection 读取。现已统一当前会话映射，改为摘要轮询及按所选 workspace/sessionIds 取投影，测试 10/10。摘要大小约 25,427 字节是对本轮真实数据的计算结果，尚需浏览器复验。
- 窄屏地图入口已缩为 28px；Owner 徽标在 ≤520px 缩为 18px。Owner bundle 6/6，实际 375px 命中仍待浏览器恢复后核验。
- 第一轮统一回归为 stale_candidate，425 项中 424 pass、0 fail、1 cancelled。依赖准备文件前 21 项累计 177.92 秒，用尽 180 秒文件时限；不能把该轮当通过，也没有据此延长时限。独立分析建议对冻结候选重跑，必要时再无并行负载定向核验。
- 当前宿主：`3dac078a-7697-47c4-a128-94d46c52c38d`，仍由唯一无参数 `./start-owner-workflow.sh` 启动。冻结候选 `fbd87ead5ab47fb9a4408b1aac97c86c59cec1e1ee42d936bfd6dd21ad6993f2` 的统一回归已完成：430/430 pass，0 fail/cancelled/skipped/todo，Owner 客户端和审批构建均通过。原始报告及日志归档于 `framework-regression/`。总验收仍为 incomplete，因为业务与实机证据未完成。
- 原浏览器 tab 1 仍在，但多次刷新及重新取得句柄均在浏览器 focus 控制调用超时；未新建或关闭标签。已请求用户仅在原标签手动刷新，继续完成无需页面操作的验证。
