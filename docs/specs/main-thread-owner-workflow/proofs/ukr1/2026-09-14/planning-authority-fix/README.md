# Web 用户来源识别与规划授权复用修复

2026-09-14。本记录只证明本次授权缺陷修复；完整 Coinhub 业务验收尚未结束。

## 根因

真实 DSH Web `user/message.source` 为 `{ kind: 'user', rpcId, clientTimeZone }`。自研 `implementationRequestReceipt` 要求来源只有 `kind` 一个字段，把合法原生消息误判为 `IMPLEMENTATION_REQUEST_NOT_NATIVE_USER`。上游合同在 `deepseek-harness/packages/api/session-controller/src/types.ts` 的 `MessageSourceMap['user-rpc']`，上游未修改。

`KernelRuntime.finalizePlanningDocuments` 在读取可复用授权前调用上述校验，使同范围技术修订也可能被旧消息引用阻塞。

## 修复

- 识别原生本地用户和 Web RPC 用户两种来源形态；保留未知字段、错误字段类型、非用户来源及引用不匹配的拒绝。
- 在授权服务核验活跃主线程、授权身份、作用域及原授权恢复约束之后，优先复用有效授权。仅需新授权时解析 `implementationRequest`。没有可复用授权的无效引用仍拒绝，不静默生成授权。
- 工具描述和主线程指导明确：既有授权范围内的技术修订用空参数 finalize；业务范围改变仍由用户决定。

## 验证

- 修复前定向回归 19 项：16 通过、3 失败，分别覆盖 Web 来源、原生文档提交以及 Kernel 授权复用。
- 修复后定向回归 19/19，通过且无跳过。
- 完整回归 418/418，通过且无跳过；Owner 与审批前端构建检查通过。见 `framework-acceptance.json`、`framework-report.json`、`framework-tests.log`。报告的 `incomplete` 表示完整 AC/KAC 业务证据仍未收集完，不表示这些回归失败。
- `trace-replay.json` 重放真实会话第 232 条调用及第 154 条 Web 用户消息，修复后可生成对应原生凭据；没有写入或重写会话。
- 通过无参数 `./start-owner-workflow.sh` 正常重载。`restart.json` 记录服务健康、用户配置和密钥文件摘要不变，新旧工作流的计划、任务、候选、恢复计数和集成基线保持不变。
- 在同一浏览器标签与主线程执行 finalize，成功产生 `planning-finalize-9edc6b05edd093601c13d7ce`。`live-finalize.json` 证明 R12 与 R11 复用同一授权，提交为 `56db60bb1c39000a179ae06587a452041b86abed`。
- 原 workflow `wf-03d397fffe12a1d0e9726a73ccb53ba315e3d7eb` 的首个空影响集重规划被正确拒绝；主代理随后补全影响范围，原流程接受修订，恢复计数为 1，重新编排动作 `act-4f8dba20835bc2174b31bbc4adcca55cdd045e57` 已入队。没有新建或清空工作流。

此前浏览器控制超时已恢复，但具体根因未证实；不将授权修复宣称为浏览器控制层修复。
