# R81 原生文件接缝核对

只读核对由 t16_cancel_proof 完成，先 CodeGraph 后精读；并非原生持久事务已经实现的证据。

- `deepseek-harness/packages/fs/tool-fs/src/write.ts:102–128`、`edit.ts:112–146`：先调用 intent waterfall，返回后才调用 native writeText/editText；成功后同步 emit fs/observed。因此 intent.next() 不能视为实际文件修改的 around hook。
- `deepseek-harness/packages/fs/fs-observation-policy/src/index.ts:61–93,116–129`：write 保留 createIfAbsent/replaceIfVersion；edit 保留必须已观察及版本约束。
- `deepseek-harness/packages/fs/fs-local/src/index.ts:166–254`：provider 每目标锁内重新观察、CAS、原子写入并返回真实结果。
- `deepseek-harness/packages/core/tools/src/index.ts:152–175,1569–1598`：tools/execute 可以等待工具 dispatch；callId/rootCallId/agent/arguments 由实际 registry 绑定。工具结果可被下游包装，不能单凭 isError 推断是否已修改。
- `deepseek-harness/packages/fs/fs/src/index.ts:68–76`：fs/observed 监听器同步，返回 Promise 不会等待；观察回调抛错不能回滚已发生的写入。

本轮选用现有 tools/execute＋intent＋同步 observed 的两阶段日志，不修改 Harness。写前持久 prepared；同次同目标的 native observation 可记录成功事实；缺失完成事实/落盘失败保持未知。原生结果摘要必须有可核验依据；无法取得可靠摘要的记录不能用于后续 checkpoint。日志与 native mutation 并非同一原子事务，不声称进程崩溃后可以恢复每一次成功事实。

T25 必须拒绝未知、不完整或断裂的来源链，再独立核验授权、Git 基线和用户改动。R81 日志本身不承担提交授权、来源恢复晋升、snapshot 或 Runner 激活。
