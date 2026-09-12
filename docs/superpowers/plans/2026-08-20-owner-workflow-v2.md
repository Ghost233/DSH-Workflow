# Owner 工作流 V2 实施计划

> **供 Agent 执行：** 必须逐任务使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`；每个步骤以复选框跟踪。

**目标：** 把 Owner 工作流升级为无 Quick 模式、脚本裁决依赖与验证的任务级 DAG 系统。

**架构：** 以 `src/model.mjs` 的 V2 契约、`src/registry.mjs` 的 Git 跟踪 Owner Registry 和 `src/supervisor.mjs` 的确定性状态机为核心。`runtime.mjs` 仅把 Harness 子 Agent、Git、沙箱和控制桥适配到这些纯函数/脚本契约；外置 runner 只执行 Supervisor 返回的动作。

**技术栈：** Node.js ESM、`node:test`、Git worktree、Harness 插件 API、Unix socket、Server-Sent Events。

**设计：** `docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md`

## 全局约束

- 所有用户可见文本、注释、日志摘要、提示词和 Markdown 使用中文。
- 绝不修改 `deepseek-harness/` 子模块；每批验证都执行 `git -C deepseek-harness status --short` 并要求无输出。
- 不提供 Quick；任何写入需求都建立 workflow 分支与 worktree。
- 不重置、还原、暂存或提交当前工作区中不属于本任务的改动；当前 `main` 脏工作区内不创建开发提交。
- Owner 只能通过现有受控写入与沙箱工具修改代码；LLM 不获得 Git、普通 Shell、状态文件或依赖推进权限。
- 每项生产代码变更前先添加对应失败测试，观察预期失败，再最小实现并运行通过。

---

### Task 1：定义 V2 计划、任务生命周期与兼容读取契约

**文件：**
- 修改：`owner-workflow-plugin/src/model.mjs:1-673`
- 修改：`owner-workflow-plugin/test/model.test.mjs`

**接口：**
- 新增：`normalizePlanV2(raw)`、`plannerResultV2(raw)`、`taskLifecycleTransition(task, event)`、`nextReadyTaskIds(plan, tasks)`。
- 新增常量：`PLAN_V2_CONTRACT = 'DSH_PLAN_V2'`、有限 task/workflow 状态与 reason/action 配对。
- 保留：现有 `normalizePlan()` 和 `DSH_PLAN_V1` 只用于历史状态展示，禁止返回可执行结果。

- [ ] **步骤 1：写出 V2 DAG 与生命周期的失败测试**

```js
test('V2 计划拒绝任务环、未绑定验证和越出 Owner 范围的 write', () => {
  assert.throws(() => normalizePlanV2({
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: '非法 DAG',
    owners: [owner('api', ['src/api/**'])],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [
      { id: 'T1', role: 'work', ownerId: 'api', title: '一', dependsOn: ['T2'], write: ['src/api/a.mjs'], verify: ['unit'], done: ['通过'] },
      { id: 'T2', role: 'work', ownerId: 'api', title: '二', dependsOn: ['T1'], write: ['src/outside/a.mjs'], verify: ['missing'], done: ['通过'] },
    ],
  }), /环|验证|scope/u)
})

test('任务停止状态只接受有限的 reason/action 配对', () => {
  assert.throws(() => taskLifecycleTransition({ status: 'running' }, { type: 'stop', reason: 'unknown', action: 'guess' }), /reason|action/u)
  assert.deepEqual(taskLifecycleTransition({ status: 'running' }, { type: 'stop', reason: 'task_failed', action: 'repair_task' }), {
    status: 'stopped', reason: 'task_failed', action: 'repair_task',
  })
})
```

- [ ] **步骤 2：运行测试并确认因为 API 尚不存在而失败**

运行：`node --test owner-workflow-plugin/test/model.test.mjs`  
预期：失败信息包含 `normalizePlanV2 is not a function` 或对应导出不存在。

- [ ] **步骤 3：最小实现 V2 规范化、环检测、验证绑定和生命周期转换**

```js
export function normalizePlanV2(raw) {
  if (raw?.contract !== PLAN_V2_CONTRACT) throw new Error('计划契约必须是 DSH_PLAN_V2')
  const verifications = normalizeVerifications(raw.verifications)
  const owners = raw.owners.map(normalizeOwner)
  const tasks = raw.tasks.map(task => normalizeTaskV2(task, owners, verifications))
  assertTaskDag(tasks)
  return { contract: PLAN_V2_CONTRACT, registryDigest: sha256(raw.registryDigest), summary: text(raw.summary, 'summary'), owners, verifications, tasks }
}

export function taskLifecycleTransition(task, event) {
  if (event.type === 'complete' && task.status === 'running') return { status: 'completed', reason: null, action: null }
  if (event.type === 'stop' && STOP_MATRIX[event.reason] === event.action) return { status: 'stopped', reason: event.reason, action: event.action }
  throw new Error('非法任务生命周期迁移')
}
```

- [ ] **步骤 4：运行模型测试并确认通过**

运行：`node --test owner-workflow-plugin/test/model.test.mjs`  
预期：通过，现有 V1 范围与 Owner 测试仍通过。

### Task 2：实现版本化、Git 跟踪的 Owner Registry

**文件：**
- 新建：`owner-workflow-plugin/src/registry.mjs`
- 新建：`owner-workflow-plugin/test/registry.test.mjs`
- 修改：`owner-workflow-plugin/src/model.mjs`

**接口：**
- 新增：`ensureRegistry(root)`、`loadRegistry(root)`、`proposeRegistryChange(registry, operation)`、`applyApprovedRegistryChange(root, proposal)`。
- 目录：`.owner-workflow/config.json` 与 `.owner-workflow/owners/<id>/owner.md`；同一 Owner 的长期资料位于相邻 `memory/`。
- proposal 结构：`{ contract: 'DSH_OWNER_REGISTRY_PROPOSAL_V1', digest, operation, before, after, affectedOwnerIds }`。

- [ ] **步骤 1：写出提案不可直接应用、digest 不匹配和 scope 重叠的失败测试**

```js
test('Owner Registry 只有匹配 digest 的已批准提案才能写入', async () => {
  const root = await repositoryFixture()
  const registry = await ensureRegistry(root)
  const proposal = proposeRegistryChange(registry, {
    type: 'add', owner: owner('network-user', ['src/network/user/**']), reason: '拆分用户接口',
  })
  await assert.rejects(applyApprovedRegistryChange(root, { ...proposal, approvedDigest: '0'.repeat(64) }), /digest/u)
  await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
  assert.match(await readFile(join(root, '.owner-workflow/owners/network-user/owner.md'), 'utf8'), /用户接口/u)
})
```

- [ ] **步骤 2：运行 Registry 测试并确认失败**

运行：`node --test owner-workflow-plugin/test/registry.test.mjs`  
预期：失败信息包含找不到 `../src/registry.mjs`。

- [ ] **步骤 3：实现 Registry 文件编码、受管根校验和 add/remove/split/merge/transfer 提案**

```js
export async function ensureRegistry(root) {
  const directory = join(root, '.owner-workflow', 'owners')
  await mkdir(directory, { recursive: true })
  const config = { contract: 'DSH_OWNER_REGISTRY_V1', version: 1, managedRoots: ['**'], parallel: 4, profiles: DEFAULT_PROFILES }
  if (!existsSync(join(root, '.owner-workflow/config.json'))) await writeJsonAtomic(join(root, '.owner-workflow/config.json'), config)
  return loadRegistry(root)
}

export function proposeRegistryChange(registry, operation) {
  const after = applyRegistryOperationInMemory(registry, operation)
  assertOwnerScopesDisjoint(after.owners)
  return freezeProposal({ operation, before: registry, after, affectedOwnerIds: affectedOwnerIds(operation), digest: digestRegistry(after) })
}
```

- [ ] **步骤 4：运行 Registry 测试并确认通过**

运行：`node --test owner-workflow-plugin/test/registry.test.mjs`  
预期：通过；不写入 `.dsh-workflow/owners`。

### Task 3：将 Registry 提案/批准接入主编排工具与计划门禁

**文件：**
- 修改：`owner-workflow-plugin/src/runtime.mjs:852-3589`
- 修改：`owner-workflow-plugin/index.js`
- 修改：`owner-workflow-plugin/test/control.test.mjs`

**接口：**
- `owner_workflow` 新动作：`registry_status`、`owner_change_propose`、`owner_change_approve`。
- `start` 读取正式 Registry；Planner 输出 registry operation，但运行时在用户批准前不写入。
- `plan_approve` 同时校验 `registry_digest` 与 `plan_digest`。

- [ ] **步骤 1：写出运行中拒绝 Registry 变更和批准后使计划失效的失败测试**

```js
test('Registry 批准写入 workflow worktree 并使旧计划审查失效', async () => {
  const { runtime, agent, state } = await plannedWorkflowFixture()
  const proposal = await runtime.proposeOwnerChange(agent, state.id, addOwnerOperation())
  const result = await runtime.approveOwnerChange(agent, state.id, proposal.digest)
  assert.equal(result.registryDigest, proposal.digest)
  assert.equal(result.workflow.planReview, undefined)
  assert.equal((await readState(runtime, state.root, state.id)).status, 'registry_pending_plan')
})

test('运行中任务存在时拒绝正式 Registry 变更', async () => {
  const { runtime, agent, state } = await runningWorkflowFixture()
  await assert.rejects(runtime.proposeOwnerChange(agent, state.id, addOwnerOperation()), /运行中|安全边界/u)
})
```

- [ ] **步骤 2：运行控制测试并确认失败**

运行：`node --test owner-workflow-plugin/test/control.test.mjs`  
预期：失败信息包含 `proposeOwnerChange is not a function`。

- [ ] **步骤 3：替换旧的 `owner_add/remove/scope` 直写动作并增加审批门禁**

```js
async proposeOwnerChange(agent, workflowId, operation) {
  const state = await readState(runtime, await runtime.resolveRoot(agent), workflowId)
  assertNoActiveTasks(state)
  const proposal = proposeRegistryChange(await loadRegistry(state.workflowWorktree), operation)
  state.pendingRegistryProposal = proposal
  await saveState(runtime, state)
  return proposal
}

async approveOwnerChange(agent, workflowId, digest) {
  const state = await readState(runtime, await runtime.resolveRoot(agent), workflowId)
  assertDigest(state.pendingRegistryProposal, digest)
  await applyApprovedRegistryChange(state.workflowWorktree, { ...state.pendingRegistryProposal, approvedDigest: digest })
  invalidatePlanReview(state)
  state.status = 'registry_pending_plan'
  await saveState(runtime, state)
  return runtime.workflowSummary(state)
}
```

- [ ] **步骤 4：运行控制测试并确认通过**

运行：`node --test owner-workflow-plugin/test/control.test.mjs`  
预期：通过，旧 workflow 无法通过旧直接 scope 动作绕过审批。

### Task 4：实现任务级状态投影与确定性 Scheduler Reducer

**文件：**
- 新建：`owner-workflow-plugin/src/supervisor.mjs`
- 新建：`owner-workflow-plugin/test/supervisor.test.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs`

**接口：**
- `createTaskState(plan)`、`supervisorNext(state, now)`、`ackSupervisorAction(state, actionId, observation)`、`projectProgress(state)`。
- 动作仅为 `create`、`wait`、`notify`、`inspect`、`stop`。

- [ ] **步骤 1：写出 ready 任务并行、显式 Review 阻塞与十轮无进展 inspect 的失败测试**

```js
test('Supervisor 只派发依赖满足的 work 任务，并让 Review 阻塞下游', () => {
  const state = workflowState(v2Plan([
    task('T1', 'work', [], 'api'), task('T2', 'review', ['T1'], 'api'), task('T3', 'work', ['T2'], 'web'),
  ]))
  assert.deepEqual(supervisorNext(state, CLOCK).tasks.map(item => item.taskId), ['T1'])
  complete(state, 'T1')
  assert.deepEqual(supervisorNext(state, CLOCK).tasks.map(item => item.taskId), ['T2'])
})

test('连续十次无 cursor 变化时返回 inspect 而不是猜测完成', () => {
  const state = runningTaskState('T1', { unchangedPolls: 10 })
  assert.equal(supervisorNext(state, CLOCK).action, 'inspect')
})
```

- [ ] **步骤 2：运行 Supervisor 测试并确认失败**

运行：`node --test owner-workflow-plugin/test/supervisor.test.mjs`  
预期：失败信息包含找不到 `../src/supervisor.mjs`。

- [ ] **步骤 3：实现纯函数状态机与 `progress.json/events.jsonl` 投影**

```js
export function supervisorNext(state, now) {
  const active = activeTaskRecords(state)
  if (active.some(record => record.unchangedPolls >= 10)) return action('inspect', active.filter(record => record.unchangedPolls >= 10))
  const ready = readyTasks(state.plan, state.tasks).filter(task => !task.executorId)
  if (ready.length > 0) return action('create', ready.slice(0, state.config.parallel))
  if (active.length > 0) return action('wait', active.slice(0, state.config.parallel))
  return allTasksTerminal(state.tasks) ? action('stop') : action('notify', { kind: 'main', reason: 'decision_required' })
}
```

- [ ] **步骤 4：运行 Supervisor 测试并确认通过**

运行：`node --test owner-workflow-plugin/test/supervisor.test.mjs`  
预期：通过；每个 action 带不透明 actionId 且无 `unknown` 分支。

### Task 5：把外置 runner 改为 Supervisor 协议客户端

**文件：**
- 修改：`owner-workflow-plugin/src/external-runner.mjs:1-384`
- 修改：`owner-workflow-plugin/test/runner.test.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs:1740-1780`

**接口：**
- 控制桥新增：`supervisor-start`、`supervisor-next`、`supervisor-ack`、`supervisor-inspect`、`supervisor-stop`。
- runner 不再读取/遍历 `plan.stages`，只处理控制桥的动作收据。

- [ ] **步骤 1：用伪控制桥写出 create/wait/ack/stop 顺序的失败测试**

```js
test('runner 只执行 Supervisor 指定动作且逐个回传 actionId', async () => {
  const requests = await runRunnerAgainst([
    { action: 'create', actionId: 'a1', task: { taskId: 'T1', ownerId: 'api' } },
    { action: 'wait', actionId: 'a2', watches: [{ taskId: 'T1', cursor: 'c1' }] },
    { action: 'stop', actionId: 'a3' },
  ])
  assert.deepEqual(requests.map(item => item.action), ['supervisor-start', 'supervisor-next', 'supervisor-ack', 'supervisor-next', 'supervisor-ack', 'supervisor-stop'])
  assert.equal(requests[2].actionId, 'a1')
})
```

- [ ] **步骤 2：运行 runner 测试并确认旧阶段调度断言失败**

运行：`node --test owner-workflow-plugin/test/runner.test.mjs`  
预期：失败信息表明 runner 仍发送 `owner-sync` 或 `merge-stage`。

- [ ] **步骤 3：最小替换 runner 循环，并在控制桥中适配纯 Supervisor Reducer**

```js
for (;;) {
  const receipt = await request('supervisor-next')
  if (receipt.action === 'create') await request('supervisor-ack', await dispatchOwner(receipt))
  else if (receipt.action === 'wait') await request('supervisor-ack', await observe(receipt.watches, options.waitMs))
  else if (receipt.action === 'inspect') await request('supervisor-ack', await inspect(receipt.watch))
  else if (receipt.action === 'notify') reportMain(receipt)
  else if (receipt.action === 'stop') { await request('supervisor-stop', { actionId: receipt.actionId }); break }
  else throw new Error(`未知 Supervisor 动作：${receipt.action}`)
}
```

- [ ] **步骤 4：运行 runner 与 Supervisor 测试并确认通过**

运行：`node --test owner-workflow-plugin/test/runner.test.mjs owner-workflow-plugin/test/supervisor.test.mjs`  
预期：通过；runner 不再基于 LLM/本地读取计划决定下一任务。

### Task 6：固定 Owner 分支/worktree，并实现脚本化 owner-sync

**文件：**
- 修改：`owner-workflow-plugin/src/git.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs:203-221、1936-2055、2550-2660`
- 修改：`owner-workflow-plugin/test/git.test.mjs`
- 修改：`owner-workflow-plugin/test/resilience.test.mjs`

**接口：**
- `syncOwnerBranchToWorkflow(root, ownerWorktree, ownerBranch, workflowBranch, signal)`。
- Owner 路径固定为 `.dsh-workflow/worktrees/<workflow>/owners/<owner>`；不再含 stage/attempt。

- [ ] **步骤 1：写出同一 Owner 两个任务复用 worktree，并在首任务合并后快进的失败测试**

```js
test('同一 Owner 的第二个任务复用分支/worktree 并同步到最新 workflow HEAD', async () => {
  const fixture = await workflowRepositoryFixture()
  const first = await runtime.createOwnerEntry(fixture.state, task('T1'), 'api')
  await mergeOwnerCommitIntoWorkflow(fixture, first)
  const second = await runtime.createOwnerEntry(fixture.state, task('T2'), 'api')
  assert.equal(second.worktree, first.worktree)
  assert.equal(second.branch, first.branch)
  assert.equal(await head(second.worktree), await head(fixture.state.workflowWorktree))
})
```

- [ ] **步骤 2：运行 Git/恢复测试并确认失败**

运行：`node --test owner-workflow-plugin/test/git.test.mjs owner-workflow-plugin/test/resilience.test.mjs`  
预期：失败信息显示第二轮仍产生 stage 路径或无法快进。

- [ ] **步骤 3：实现固定路径、干净检查与 ff-only 同步**

```js
export async function syncOwnerBranchToWorkflow(root, worktree, ownerBranch, workflowBranch, signal) {
  const dirty = await statusRecords(worktree, signal, { includeIgnored: true })
  if (dirty.length > 0) throw new Error('Owner worktree 不干净，拒绝同步覆盖')
  await git(worktree, ['merge', '--ff-only', workflowBranch], signal)
  if (await currentBranch(worktree, signal) !== ownerBranch) throw new Error('Owner worktree 未绑定正确分支')
  return head(worktree, signal)
}
```

- [ ] **步骤 4：运行 Git/恢复测试并确认通过**

运行：`node --test owner-workflow-plugin/test/git.test.mjs owner-workflow-plugin/test/resilience.test.mjs`  
预期：通过；worktree 只在 finalize/cancel 的明确清理中删除。

### Task 7：实现不可伪造的固定 argv 验证

**文件：**
- 新建：`owner-workflow-plugin/src/verification.mjs`
- 新建：`owner-workflow-plugin/test/verification.test.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs`
- 修改：`owner-workflow-plugin/src/skills.mjs`

**接口：**
- `runBoundVerification(runtime, activeOwner, task, verificationId, exec)`。
- Owner 工具：`owner_verify({ task_id, verification_id, description })`。
- task state 记录 `verificationResults[verificationId] = { contentDigest, exitCode, enforcement, passed }`。

- [ ] **步骤 1：写出不存在 ID、变更内容后旧验证失效、失败验证阻断完成的失败测试**

```js
test('Owner 只能执行当前任务绑定的固定验证，内容变化后必须重跑', async () => {
  const { runtime, active, exec } = await activeOwnerFixture({ verify: ['unit'] })
  await assert.rejects(runtime.ownerVerify({ task_id: 'T1', verification_id: 'other', description: '非法' }, exec), /绑定/u)
  await runtime.ownerVerify({ task_id: 'T1', verification_id: 'unit', description: '运行单元测试' }, exec)
  await runtime.ownerEdit(editArgs('src/api/a.mjs'), exec)
  await assert.rejects(runtime.completeOwnerTask(exec), /重新运行|验证/u)
})
```

- [ ] **步骤 2：运行验证测试并确认失败**

运行：`node --test owner-workflow-plugin/test/verification.test.mjs`  
预期：失败信息包含找不到 `../src/verification.mjs` 或 `ownerVerify` 不存在。

- [ ] **步骤 3：在独立快照中执行绑定 argv，并把内容 digest 写入状态/日志**

```js
export async function runBoundVerification(runtime, active, task, verificationId, exec) {
  const verification = task.verifications.get(verificationId)
  if (verification === undefined) throw new Error('验证不属于当前任务')
  const contentDigest = await worktreeContentDigest(active.worktree)
  const result = await runtime.runSandboxArgv(active.worktree, verification.run, exec.signal)
  if (result.sandbox?.enforcement !== 'full') throw new Error('验证沙箱未达到 full enforcement')
  return { verificationId, contentDigest, argv: verification.run, exitCode: result.exitCode, passed: result.exitCode === 0 }
}
```

- [ ] **步骤 4：运行验证与安全测试并确认通过**

运行：`node --test owner-workflow-plugin/test/verification.test.mjs owner-workflow-plugin/test/security.test.mjs`  
预期：通过；Owner 完成操作拒绝缺失、失败或过期验证。

### Task 8：实现显式 Review、Composite 子图与局部 delta 重规划

**文件：**
- 修改：`owner-workflow-plugin/src/model.mjs`
- 修改：`owner-workflow-plugin/src/supervisor.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs`
- 修改：`owner-workflow-plugin/test/model.test.mjs`
- 修改：`owner-workflow-plugin/test/supervisor.test.mjs`
- 修改：`owner-workflow-plugin/test/resilience.test.mjs`

**接口：**
- `expandCompositeTask(plan, parentTaskId, proposal)`、`applyPlanDelta(state, delta)`。
- 任务动作：`request_subgraph`、`request_handoff`；已有完成节点只能 carry-forward。

- [ ] **步骤 1：写出父节点外部依赖保持不变、旧 Review 在 delta 后失效的失败测试**

```js
test('展开 Composite 子图后后继仍依赖父节点，子节点只在父内部依赖', () => {
  const expanded = expandCompositeTask(planWithParent('T2', ['T1'], ['T3']), 'T2', {
    children: [task('T2-1', 'work', [], 'api'), task('T2-2', 'review', ['T2-1'], 'api')], entry: ['T2-1'], exit: ['T2-2'],
  })
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T3').dependsOn, ['T2'])
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T2-2').dependsOn, ['T2-1'])
})

test('局部 delta 改变被审任务时使 Review 与验证结果失效', () => {
  const next = applyPlanDelta(reviewedTaskState(), { invalidate: ['T1'] })
  assert.equal(next.tasks.T1.status, 'pending')
  assert.equal(next.tasks.T2.status, 'pending')
  assert.deepEqual(next.tasks.T1.verificationResults, {})
})
```

- [ ] **步骤 2：运行模型、Supervisor、恢复测试并确认失败**

运行：`node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/resilience.test.mjs`  
预期：失败信息包含对应 expansion/delta API 不存在。

- [ ] **步骤 3：实现局部图校验、不可变已完成节点和确定性失效传播**

```js
export function applyPlanDelta(state, delta) {
  assertCompletedTasksUnchanged(state.plan, delta.plan)
  const next = cloneState(state)
  for (const taskId of invalidationClosure(delta.plan, delta.invalidate)) resetTask(next.tasks[taskId])
  next.plan = normalizePlanV2(delta.plan)
  next.planDigest = planDigest(next.plan)
  return next
}
```

- [ ] **步骤 4：运行三组测试并确认通过**

运行：`node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/resilience.test.mjs`  
预期：通过；模型不能直接修改已完成任务或绕过 Registry 审批。

### Task 9：实现可恢复的 Dashboard 状态投影与 SSE 服务

**文件：**
- 新建：`owner-workflow-plugin/src/dashboard.mjs`
- 新建：`owner-workflow-plugin/test/dashboard.test.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs`
- 修改：`owner-workflow-plugin/src/external-runner.mjs`
- 修改：`owner-workflow-plugin/package.json`

**接口：**
- CLI：`run-owner-workflow --dashboard --workflow-id <id>`。
- `writeProgressProjection(root, state)`、`startDashboard(workspace, { port: 57357 })`。
- `GET /events` 返回 SSE；`GET /api/progress` 返回 JSON。

- [ ] **步骤 1：写出只读进度 API 与 SSE 接收 runtime 事件的失败测试**

```js
test('Dashboard 只读取 progress 投影并将事件作为 SSE 推送', async () => {
  const dashboard = await startDashboard(root, { port: 0 })
  await writeProgressProjection(root, progressFixture({ taskId: 'T1', status: 'running' }))
  assert.deepEqual(await fetch(`${dashboard.url}/api/progress`).then(response => response.json()), { tasks: [{ id: 'T1', status: 'running' }] })
  const event = await readOneSseEvent(`${dashboard.url}/events`)
  assert.equal(event.type, 'task.updated')
})
```

- [ ] **步骤 2：运行 Dashboard 测试并确认失败**

运行：`node --test owner-workflow-plugin/test/dashboard.test.mjs`  
预期：失败信息包含找不到 `../src/dashboard.mjs`。

- [ ] **步骤 3：实现仅绑定回环地址的 HTTP/SSE 服务和原子投影写入**

```js
export async function startDashboard(workspace, { port = 57357 } = {}) {
  const server = createServer((request, response) => serveProjectionOrSse(workspace, request, response))
  await listen(server, '127.0.0.1', port)
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
```

- [ ] **步骤 4：运行 Dashboard 测试并确认通过**

运行：`node --test owner-workflow-plugin/test/dashboard.test.mjs`  
预期：通过；服务没有 workflow 写入端点，端口冲突不改为公网绑定。

### Task 10：支持取消、有限恢复与合并到启动分支最新 HEAD

**文件：**
- 修改：`owner-workflow-plugin/src/git.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs:2696-2797`
- 修改：`owner-workflow-plugin/test/git.test.mjs`
- 修改：`owner-workflow-plugin/test/resilience.test.mjs`

**接口：**
- `owner_workflow(action=cancel)`；`preflightFinalMerge(root, baseBranch, workflowSha, signal)`。
- failed/blocked workflow 保留分支/worktree 供恢复；cancelled workflow 经用户明确同意后删除临时分支/worktree，只保留状态与日志；finalize 对最新 base HEAD 使用预合并并在交付后清理。

- [ ] **步骤 1：写出取消后清理临时现场、启动分支新增提交可预合并、冲突保留现场的失败测试**

```js
test('明确取消 workflow 后删除 Owner/workflow 临时现场并保留状态日志', async () => {
  const { runtime, agent, state } = await runningWorkflowFixture()
  await runtime.cancelWorkflow(agent, state.id)
  const saved = await readState(runtime, state.root, state.id)
  assert.equal(saved.status, 'cancelled')
  assert.equal(saved.temporaryArtifactsCleaned, true)
  assert.equal(existsSync(saved.ownerRuns.T1.worktree), false)
})

test('finalize 在启动分支有新提交时预合并审查 SHA', async () => {
  const fixture = await completedWorkflowFixture()
  await commitFile(fixture.root, 'unrelated.md', '新提交')
  await fixture.runtime.finalizeWorkflow(fixture.agent, fixture.state.id)
  assert.equal(await isCommitAncestor(fixture.root, fixture.reviewedSha, await head(fixture.root)), true)
})
```

- [ ] **步骤 2：运行 Git/恢复测试并确认失败**

运行：`node --test owner-workflow-plugin/test/git.test.mjs owner-workflow-plugin/test/resilience.test.mjs`  
预期：失败信息显示没有 `cancelWorkflow`，或 finalize 仍拒绝 base HEAD 改变。

- [ ] **步骤 3：实现 cancel、最终预合并与冲突保留路径**

```js
async cancelWorkflow(agent, workflowId) {
  const state = await readState(runtime, await runtime.resolveRoot(agent), workflowId)
  assertNoFinalMerge(state)
  stopPendingTasks(state.tasks, 'decision_required', 'await_user')
  state.status = 'cancelled'
  await saveState(runtime, state)
  await cleanupWorkflowArtifacts(state, { discardUncommitted: true })
  state.temporaryArtifactsCleaned = true
  await saveState(runtime, state)
  return runtime.workflowSummary(state)
}

async preflightFinalMerge(root, baseBranch, reviewedSha, signal) {
  return createTemporaryMergeWorktree(root, baseBranch, reviewedSha, signal)
}
```

- [ ] **步骤 4：运行 Git/恢复测试并确认通过**

运行：`node --test owner-workflow-plugin/test/git.test.mjs owner-workflow-plugin/test/resilience.test.mjs`  
预期：通过；冲突时状态保留并拒绝清理。

### Task 11：更新 Skill、提示词、安装文档与迁移说明

**文件：**
- 修改：`owner-workflow-plugin/src/skills.mjs`
- 修改：`owner-workflow-plugin/README.zh.md`
- 修改：`README.md`
- 修改：`docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md`
- 新建：`docs/OWNER-WORKFLOW-V2-MIGRATION.md`
- 修改：`owner-workflow-plugin/test/plugin.test.mjs`

**接口：**
- 主 Skill 只允许 `audit` 或 V2 workflow 动作；明确没有 Quick。
- Planner 返回 V2 task/verification/registry proposal；Owner 使用 `owner_verify`；Supervisor 只执行有限动作。

- [ ] **步骤 1：写出 Skill 文案声明 V2 验证与无 Quick 模式的失败测试**

```js
test('Owner 工作流 Skill 明确要求 V2 固定验证且不提供 Quick', () => {
  const skill = OWNER_WORKFLOW_SKILLS.find(item => item.name === 'owner-workflow')
  assert.match(skill.content, /DSH_PLAN_V2/u)
  assert.match(skill.content, /不提供 Quick/u)
  assert.match(OWNER_WORKFLOW_SKILLS.find(item => item.name === 'owner-worker').content, /owner_verify/u)
})
```

- [ ] **步骤 2：运行插件测试并确认失败**

运行：`node --test owner-workflow-plugin/test/plugin.test.mjs`  
预期：失败信息显示当前 Skill 未包含 V2 约束。

- [ ] **步骤 3：更新中文 Skill、技术路线、迁移文档和启动说明**

```md
## 旧 workflow 的处理

`DSH_PLAN_V1` workflow 仅允许查询和导出，不能由 runner 继续执行。请从当前分支重新调用 `owner_workflow(action=start)` 生成经 Registry 审批的 `DSH_PLAN_V2`。
```

- [ ] **步骤 4：运行插件测试并确认通过**

运行：`node --test owner-workflow-plugin/test/plugin.test.mjs`  
预期：通过；文档与运行时动作名称一致且均为中文说明。

### Task 12：全量回归、静态检查与子模块完整性验证

**文件：**
- 修改：仅修复前述任务测试发现的 V2 实现缺陷。

**接口：**
- 不新增接口；验证所有已声明 V2 契约与现有安全边界协同工作。

- [ ] **步骤 1：运行所有插件测试**

运行：`npm test --prefix owner-workflow-plugin`  
预期：全部通过；不跳过 V2、scope、memory、runner、sandbox、恢复或 Dashboard 测试。

- [ ] **步骤 2：运行脚本与模块语法检查**

运行：

```sh
node --check owner-workflow-plugin/index.js
node --check owner-workflow-plugin/src/model.mjs
node --check owner-workflow-plugin/src/registry.mjs
node --check owner-workflow-plugin/src/supervisor.mjs
node --check owner-workflow-plugin/src/verification.mjs
node --check owner-workflow-plugin/src/dashboard.mjs
node --check owner-workflow-plugin/src/runtime.mjs
node --check owner-workflow-plugin/src/external-runner.mjs
bash -n start-owner-workflow.sh
bash -n run-owner-workflow.sh
```

预期：全部退出码为 0。

- [ ] **步骤 3：检查差异和 Harness 子模块**

运行：

```sh
git diff --check
git diff --cached --check
git -C deepseek-harness status --short
```

预期：前两项无空白错误，最后一项无输出。

- [ ] **步骤 4：执行本地启动前自检**

运行：`./run-owner-workflow.sh --self-check`  
预期：返回 preset 与 runner 自检成功；不启动 workflow、不修改 Harness 子模块。

## 覆盖自检

- Registry 的 Git 跟踪、digest 审批、受管根、split/merge/transfer：Task 2-3。
- V2 任务 DAG、显式 Review、固定验证、V1 不可继续：Task 1、4、7、8、11。
- 固定 Owner 分支/worktree、脚本同步、固定 SHA：Task 6、10。
- Supervisor、状态机、超时、恢复、取消：Task 4-5、10。
- Dashboard/SSE：Task 9。
- 中文文档/提示词、无 Quick、子模块不变：Task 11-12。
