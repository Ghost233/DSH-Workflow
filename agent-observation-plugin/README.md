# DSH agent observation

JEV 中心与 DSH 原生代理监控独立提供设置和只读监控。根包 `dsh-workflow` 导出 `/jev-center`、`/agent-monitor` 与 `/client`。

固定配置 entry IDs `workflow-jev-center` 和 `workflow-agent-monitor` 延续使用；入口迁移保留配置和凭据，监控仅检测、通知和记录。

运行 `node agent-observation-plugin/scripts/build-client.mjs --check` 核对客户端产物，`node scripts/run-project-tests.mjs` 执行当前剩余自研测试。
