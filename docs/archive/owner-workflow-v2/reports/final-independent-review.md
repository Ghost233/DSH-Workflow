# Final Independent Review

审查对象：`/Users/admin/code/DSH-Workflow` 当前工作树。

审查依据：`docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md`、`docs/superpowers/plans/2026-08-20-owner-workflow-v2.md`、当前 `docs/`、插件源码与测试。除本报告外未修改工作区；审查开始前工作区已经存在大量 staged、unstaged 和 untracked 改动。

## 结论

不建议按当前状态独立发布。插件测试全量通过，但仍有 1 项 Critical 和 3 项 Important，均是测试未覆盖的发布门禁或运行时边界问题。

## Critical

### C-1：Review/Verify 任务的只读与 task.write 门禁没有落到运行时

证据：

- 设计要求 Review 是显式只读节点：`docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md:82`。
- 模型层只把非 `work` 任务的 `write` 规范化为空：`owner-workflow-plugin/src/model.mjs:770-779`。
- Owner 工具允许集合对所有 Owner 任务都包含 `owner_write`、`owner_edit`：`owner-workflow-plugin/src/runtime.mjs:118-130`。
- `owner_write`/`owner_edit` 只调用 `ownerTarget`：`owner-workflow-plugin/src/runtime.mjs:5252-5257`、`5286-5290`；`ownerTarget` 只校验 Owner scope、受保护路径、链接和 worktree，没有读取当前 task role 或 task.write：`owner-workflow-plugin/src/runtime.mjs:4947-4962`。
- 提交前审计和提交后二次校验同样只用 `ownerAllows`，没有用 task.write：`owner-workflow-plugin/src/runtime.mjs:4391-4414`、`4432-4456`。

因此，`review`/`verify` 节点仍可通过受控写入修改 Owner scope 内代码；`work` 节点也可写入并提交其声明的 `task.write` 之外、但仍属于 Owner scope 的文件。模型中的空 write 不是实际权限边界，Review 结果与计划级文件范围均可被执行会话绕过。

## Important

### I-1：finalize 拒绝启动分支的新 HEAD，没有实现设计要求的 latest-base 预合并

证据：设计和计划要求把已审查 workflow HEAD 预合并到启动分支最新 HEAD，并在冲突时保留现场：`docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md:160`、`docs/superpowers/plans/2026-08-20-owner-workflow-v2.md:515-555`。

当前实现直接拒绝 base HEAD 变化：`owner-workflow-plugin/src/runtime.mjs:4273-4278`。对应测试也固定了相反行为：`owner-workflow-plugin/test/resilience.test.mjs:2356`。

结果是启动分支出现任意合法的新提交后，最终交付必然失败，无法执行要求的临时预合并、冲突保留和审计路径；这不是“审查外提交被带入”的安全保护替代，而是缺少 latest-base merge workflow。

### I-2：Dashboard 的 `workflow-id` 没有真正绑定，多个 workflow 会共享并覆盖同一投影

证据：runner 接收 `--workflow-id` 后只把它打印出来，启动 Dashboard 时没有传入：`owner-workflow-plugin/src/external-runner.mjs:320-323`。Dashboard 固定读取工作区级 `.dsh-workflow/progress.json` 与 `.dsh-workflow/events.jsonl`：`owner-workflow-plugin/src/dashboard.mjs:21-31`、`431-462`；runtime 每次保存任意 workflow 都写同一投影路径：`owner-workflow-plugin/src/runtime.mjs:478-493`。

因此同时存在多个 workflow 时，后保存者会覆盖进度，SSE 也会混入其他 workflow 的事件；命令行的 `--workflow-id` 不能保证用户看到指定 workflow。当前 Dashboard 测试只使用单一 workflow fixture，未覆盖交叉污染。

### I-3：V2 workflow 状态没有遵守设计声明的有限状态契约

设计和模型声明的 workflow 状态是 `active`、`completed`、`stopped`、`cancelled`：`docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md:119-121`、`owner-workflow-plugin/src/model.mjs:20-21`。runtime 实际持久化并对外返回 `initializing`、`planning`、`planned`、`approved`、`running`、`blocked`、`failed`、`registry_pending_plan` 等额外状态：`owner-workflow-plugin/src/runtime.mjs:2441-2456`、`2215-2219`、`2953-2956`、`3470-3475`、`4918-4920`。

这使 Dashboard、Supervisor 恢复和外部状态消费者不能按 V2 声明的状态机解释 workflow；例如 Supervisor 专用投影只接受 `running`：`owner-workflow-plugin/src/runtime.mjs:1433-1449`，而模型导出的有限状态集合从未成为 runtime gate。应统一持久化状态契约，或在设计/文档中明确并测试扩展状态的映射。

## Minor

### M-1：纯 V2 清理未完成，公开文案与运行时仍保留阶段化接口/术语

V2 控制桥会拒绝 legacy 动作，但旧路径和阶段语义仍存在于 runtime：`owner-workflow-plugin/src/runtime.mjs:2936-3070`、`4008-4207`；公开入口仍暴露 `stage_id` 和“阶段”文案：`owner-workflow-plugin/index.js:57`、`70-80`，runner 帮助仍写“同一阶段”：`owner-workflow-plugin/src/external-runner.mjs:43`。这增加了 V1/V2 操作混淆，也与纯任务级 DAG 的发布叙述不一致。

### M-2：仓库顶层 README 被删除

当前状态显示 `README.md` 为工作树删除，且 `git show HEAD:README.md` 仍包含项目安装、子模块和启动说明。计划 Task 11 明确要求更新根 README；当前详细说明只剩插件 README 和 docs，顶层发布入口缺失。

## 已运行验证

- `npm test --prefix owner-workflow-plugin`：257 passed，0 failed，0 skipped。
- 已使用 `rg` 对 V2/V1、Quick、stage/legacy 控制动作、Registry、scope、worktree、verification、sandbox、Supervisor、Dashboard、cancel 和 submodule 进行静态检索。
- 已检查 V2 model、Registry、Supervisor、runner、runtime、Git、verification、Dashboard、插件入口、中文文档和脚本。
- 复审期间 `deepseek-harness/` 子模块未见工作树修改；该项仍应在发布前以 `git -C deepseek-harness status --short` 作为最终 gate。

测试全绿只能证明现有回归集通过；上述 C/I 项对应的 Review task 写入、latest-base finalize、多 workflow Dashboard 隔离和发布文档缺失仍未被现有测试覆盖或已被现有测试固定为不符合 V2 设计的行为。
