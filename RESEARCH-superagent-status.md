# Superagent 状态研究：初步结果及未证实范围

问题：[确认 Superagent 状态与无模型数据接入](https://github.com/Ghost233/DSH-Workflow/issues/58)。研究时间：2026-11-05。此文是部分调查，不是“全部状态可可靠获取”的证明。现场无运行时调用，也未调用 Agent 或 LLM。Station 的本地交付源码版本未确定；路径与行号仅对本机当时安装的源码成立。

## 已观察的接缝

- Station 的 `superagent-service.mjs` 为 data root 实际路径和 project ID 构建单项目 Unix socket，并为 host 使用隔离 profile、loopback Web 服务和 stateDir（本机 `/Applications/Ghost DSH Station.app/Contents/Resources/workflow/macos-launcher/runtime/superagent-service.mjs:29–36,79–91`）。实例身份不能仅凭端口或进程名假设。
- 健康检查读取 loopback 的 `GET /orchestrator/api/state`，带 `x-orchestrator-request: 1`，1 秒超时（同文件 :108–115）。管理快照包含 projectId、revision、服务状态/ready/PID/消息/时间、模型共享、警告和日志（:120–125）。这是宿主管理状态，不等于所有工单或执行器生命周期。启动时 health ready 或 paused 即可接受（:279–285）；不可达只改变消息而非服务状态（:313–318）。
- 无模型、只读推送：内部管理 socket 的 `watch-status`，支持换行 JSON 或 `/control` WebSocket；WebSocket 要求 `dsh-control-v1` 子协议、数字 requestId，拒绝 Origin（`/Applications/Ghost DSH Station.app/Contents/Resources/workflow/macos-launcher/runtime/manager-websocket.mjs:8–64`）。通知发送初始快照及变化，比较时排除 revision 和 observedAt，待发送数据上限 4 MiB；客户端 helper 没有空闲请求、重连定时器或心跳（`/Applications/Ghost DSH Station.app/Contents/Resources/workflow/macos-launcher/runtime/status-notifications.mjs:3–46`）。socket 为 owner-only（`/Applications/Ghost DSH Station.app/Contents/Resources/workflow/macos-launcher/runtime/manager-control.mjs:13–28`）。这是交付内部接口，尚无稳定公开 API 承诺。

## 上游原型 HTTP 源码补充（2026-11-05）

以下只检查主 checkout 的上游原型，固定提交 `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`，没有启动服务或验证安装版与其一致。上游明确称其为参考性研究原型，非生产就绪，也不等于论文中的完整实现（`vendor/dsh-superagent-prototype/README.md:3–7`）。

- 所有路由位于 `/orchestrator/api/`：注册要求 Web server 绑定 `127.0.0.1`；Host 必须是对应端口的 localhost 或 127.0.0.1，要求 `x-orchestrator-request: 1`，Origin 缺省或严格匹配 HTTP Host。此检查不是用户身份认证；本机其他进程也可能构造请求，不能将该头视作秘密（`src/app/http.ts:75–79,230–244`）。API 同时包含写操作，不应将整个接口视作只读。
- `GET state` 返回 setup、load（running、queued、maxWorkers）、masterId、paused 和 health；它并不枚举工单（`src/app/http.ts:93–110,151–158`；`src/app/views/tickets.ts:50–55`）。`GET overview` 返回系统问题、等待人类的工单、执行器负载及 24 小时流量，问题包括 setup、无源、无授权发送者、源/运行时错误、执行器暂停、超时/不可用评估及发送失败（`src/app/views/overview.ts:38–78`）。负载 running 是执行 turn 占槽的 worker session 数，不是全部活跃工单；queued 仅按工单 stage/action 计算，不能单独证明 worker 就绪。
- `GET tickets?state=...` 支持 open、person、working、idle、ended；默认 open，默认分页 20，最多 1000；ended 才查询全部工单后过滤，其他 stage 查询 open 工单（`src/app/api.ts:12–14,33–34`；`src/app/http.ts:138–141,188–192`；`src/app/views/tickets.ts:35–42`）。详情包含 mandate、暂停状态、channels、decision、assignments、inputs（含 delivered）和关联 threads；启动过的 assignment 指向该 ticket 的同一 worker session（`src/app/views/tickets.ts:56–85`）。还可 GET threads、thread detail、decisions、sources、settings 和 search；接口类型供面板和 host 共享，不构成对外稳定兼容承诺（`src/app/api.ts:1–10,20–34`）。
- 上游包声明 Node `^22.19.0 || >=24.0.0`、DSH `^0.2.1-alpha.2`、版本 0.1.0 且 private（`package.json:2–6,53–57`）；这只是声明，不证明本机交付版本或实际兼容。

## 进程恢复与限制

- 意外退出进入 failed，关闭处理器未自动重启（`superagent-service.mjs:256–267`）；明确命令为 start、stop、open、status（:307–313）。start 检查现存 child 与旧进程 lease（:134–139）；stop 发 SIGINT、等待最多 300 秒且不强杀（:295–305）。管理 IPC 断开时 host 收到 SIGINT，清理时进程组收到 SIGTERM（`/Applications/Ghost DSH Station.app/Contents/Resources/workflow/macos-launcher/runtime/superagent-lifetime.mjs:3–23`）。lease 验证 PID 启动时间和命令，阻止已识别的旧 host 仍活着时重启，并负责记录与释放（`/Applications/Ghost DSH Station.app/Contents/Resources/workflow/macos-launcher/runtime/superagent-host-lease.mjs:14–55`）。以上仅证明进程管理，不能证明工单状态或事件重放恢复。
- 初步候选是以只读 state 快照与 watch-status 结合，但尚不证明快照跨请求的完整性、原子性、历史和等待原因，或后者断线后恢复。服务状态不得当成工单状态；消费者应将不可达、未知及快照过时明确标记，不能猜测完成。工单枚举和执行器负载已有上述源码依据，但 hook 覆盖面、状态实时准确性、并发/丢事件以及恢复语义仍需在版本固定的运行实例中验证。

## 失败与后续

工具自动审核多次以 `PI_AI_ERROR`（image model 不支持 complexity low）拒绝 read、grep、bash 等调用，导致未能完成 Superagent 业务层源码检查；不可将此文视作完整结论。研究中初次 `gh issue view` 发生在读取仓库要求的账号切换及 UI 身份验证约定之前；之后未再执行需认证的 gh 业务操作。未关闭 issue。共享 checkout 原有暂存改动未触碰。
