import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePlan,
  normalizePlanV2,
  expandCompositeTask,
  applyPlanDelta,
  ownerAllows,
  normalizeOwner,
  ownerResult,
  nextReadyTaskIds,
  plannerResultV2,
  taskLifecycleTransition,
  TASK_STATUSES,
  WORKFLOW_STATUSES,
  STOP_REASON_ACTIONS,
  validateHandoffTargets,
  plannerResult,
  PLAN_REVIEW_SUBMISSION_SCHEMA,
  planReviewResult,
  implementationReviewResult,
} from '../src/model.mjs'

const v2Owner = (id, scope, exclude = []) => ({
  id,
  name: id,
  description: `${id} Owner`,
  scope,
  exclude,
})

function v2Plan({ owners = [v2Owner('api', ['src/api/**'])], verifications, tasks } = {}) {
  return {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: 'V2 测试计划',
    owners,
    verifications: verifications ?? [{ id: 'unit', run: ['node', '--test'] }],
    tasks: tasks ?? [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/api/route.mjs'], verify: ['unit'], done: ['通过'] }],
  }
}

function compositeTask(id, role = 'work', dependsOn = [], ownerId = 'api', overrides = {}) {
  return {
    id,
    role,
    ownerId,
    title: `${id} 标题`,
    dependsOn,
    write: role === 'work' ? [`src/${ownerId}/${id}.mjs`] : [],
    verify: ['unit'],
    done: [`${id} 完成`],
    ...overrides,
  }
}

function compositePlan() {
  return v2Plan({
    tasks: [
      compositeTask('T1'),
      compositeTask('T2', 'work', ['T1']),
      compositeTask('T3', 'work', ['T2']),
    ],
  })
}

function reviewedV2State() {
  const plan = v2Plan({
    tasks: [
      compositeTask('T1'),
      compositeTask('T2', 'review', ['T1']),
      compositeTask('T3', 'work', ['T2']),
    ],
  })
  return {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id: 'wf-model-delta',
    revision: 7,
    plan,
    planDigest: '旧计划摘要',
    tasks: {
      T1: {
        taskId: 'T1',
        status: 'running',
        executorId: 'owner-agent',
        verificationResults: { unit: { passed: true } },
        review: { status: 'passed' },
        completionEvidence: { summary: '旧完成证据' },
      },
      T2: {
        taskId: 'T2',
        status: 'pending',
        executorId: null,
        verificationResults: { unit: { passed: true } },
        review: { status: 'passed' },
        completionEvidence: { summary: '旧 Review 证据' },
      },
      T3: { taskId: 'T3', status: 'pending', executorId: null },
    },
    implementationReview: { status: 'passed', summary: '旧实现审查' },
  }
}

test('展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达', () => {
  const expanded = expandCompositeTask(compositePlan(), 'T2', {
    children: [
      compositeTask('T2-1'),
      compositeTask('T2-2', 'review', ['T2-1']),
      compositeTask('T2-3', 'verify', ['T2-2']),
    ],
    entry: ['T2-1'],
    exit: ['T2-3'],
  })

  assert.deepEqual(expanded.tasks.find(task => task.id === 'T2').dependsOn, ['T1'])
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T3').dependsOn, ['T2'])
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T2').children, ['T2-1', 'T2-2', 'T2-3'])
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T2').entry, ['T2-1'])
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T2').exit, ['T2-3'])
  assert.deepEqual(expanded.tasks.find(task => task.id === 'T2-2').dependsOn, ['T2-1'])
  assert.equal(expanded.tasks.find(task => task.id === 'T2-3').parentTaskId, 'T2')
})

test('Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子', () => {
  const first = expandCompositeTask(compositePlan(), 'T2', {
    children: [compositeTask('T2-1', 'work', [], 'api', {
      write: [],
      verify: [],
      decomposition: {
        status: 'abstract',
        kind: 'composite',
        outcome: '完成二级拆分',
        ownerCandidates: ['api'],
        unknowns: ['子任务边界待确定'],
      },
    })],
    entry: ['T2-1'],
    exit: ['T2-1'],
  })
  assert.equal(first.executable, false)

  const second = expandCompositeTask(first, 'T2-1', {
    children: [compositeTask('T2-1-1')],
    entry: ['T2-1-1'],
    exit: ['T2-1-1'],
  })
  assert.equal(second.executable, true)
  assert.equal(second.tasks.find(task => task.id === 'T2-1').parentTaskId, 'T2')
  assert.equal(second.tasks.find(task => task.id === 'T2-1-1').parentTaskId, 'T2-1')
  assert.deepEqual(second.tasks.find(task => task.id === 'T2-1').children, ['T2-1-1'])
})

test('Composite 只允许未开始且没有业务提交的 work task', () => {
  const plan = compositePlan()
  assert.throws(() => expandCompositeTask({
    ...plan,
    tasks: plan.tasks.map(task => task.id === 'T2' ? { ...task, status: 'running' } : task),
  }, 'T2', { children: [compositeTask('T2-1')], entry: ['T2-1'], exit: ['T2-1'] }), /未开始|running/u)
  assert.throws(() => expandCompositeTask({
    ...plan,
    tasks: plan.tasks.map(task => task.id === 'T2' ? { ...task, commitSha: 'abc' } : task),
  }, 'T2', { children: [compositeTask('T2-1')], entry: ['T2-1'], exit: ['T2-1'] }), /提交|commit/u)
})

test('Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证', () => {
  const plan = compositePlan()
  assert.throws(() => expandCompositeTask(plan, 'T2', {
    children: [compositeTask('T3')], entry: ['T3'], exit: ['T3'],
  }), /编号重复|冲突/u)
  assert.throws(() => expandCompositeTask(plan, 'T2', {
    children: [compositeTask('T2-1', 'work', ['T2-2']), compositeTask('T2-2', 'review', ['T2-1'])],
    entry: ['T2-1'], exit: ['T2-2'],
  }), /环/u)
  assert.throws(() => expandCompositeTask(plan, 'T2', {
    children: [compositeTask('T2-1'), compositeTask('T2-2', 'review')],
    entry: ['T2-1'], exit: ['T2-2'],
  }), /可达|依赖/u)
  assert.throws(() => expandCompositeTask(plan, 'T2', {
    children: [compositeTask('T2-1', 'work', [], 'missing')], entry: ['T2-1'], exit: ['T2-1'],
  }), /Owner/u)
  assert.throws(() => expandCompositeTask(plan, 'T2', {
    children: [compositeTask('T2-1', 'work', [], 'api', { verify: ['missing'] })],
    entry: ['T2-1'], exit: ['T2-1'],
  }), /验证/u)
})

test('局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据', () => {
  const state = reviewedV2State()
  const nextPlan = {
    ...state.plan,
    tasks: state.plan.tasks.map(task => task.id === 'T1' ? { ...task, title: '新的 T1 语义' } : task),
  }
  const next = applyPlanDelta(state, {
    plan: nextPlan,
    invalidate: ['T1'],
  })

  assert.equal(next.tasks.T1.status, 'pending')
  assert.equal(next.tasks.T1.executorId, null)
  assert.deepEqual(next.tasks.T1.verificationResults, {})
  assert.equal(next.tasks.T1.review, undefined)
  assert.equal(next.tasks.T1.completionEvidence, undefined)
  assert.equal(next.tasks.T2.status, 'pending')
  assert.equal(next.tasks.T2.executorId, null)
  assert.deepEqual(next.tasks.T2.verificationResults, {})
  assert.equal(next.tasks.T2.review, undefined)
  assert.equal(next.implementationReview, undefined)
  assert.equal(next.revision, state.revision + 1)
  assert.notEqual(next.planDigest, state.planDigest)
  assert.equal(state.tasks.T1.status, 'running')
})

test('局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交', () => {
  const state = reviewedV2State()
  const withCompleted = {
    ...state,
    tasks: {
      ...state.tasks,
      T2: { ...state.tasks.T2, status: 'completed' },
    },
  }
  assert.throws(() => applyPlanDelta(withCompleted, {
    plan: { ...withCompleted.plan, tasks: [...withCompleted.plan.tasks, compositeTask('T4', 'work', ['T3'])] },
    invalidate: [],
  }), /carryForward|完成/u)

  const completed = {
    ...state,
    tasks: {
      ...state.tasks,
      T1: { ...state.tasks.T1, status: 'completed', fixedCommit: 'fixed-t1' },
    },
  }
  assert.throws(() => applyPlanDelta(completed, {
    plan: { ...completed.plan, tasks: completed.plan.tasks.map(task => task.id === 'T1' ? { ...task, title: '不可改写' } : task) },
    carryForward: ['T1', 'T2'],
    invalidate: ['T1'],
  }), /完成|固定提交|invalidate/u)

  assert.throws(() => applyPlanDelta({
    ...state,
    tasks: {
      ...state.tasks,
      T1: { ...state.tasks.T1, status: 'completed' },
    },
  }, {
    plan: state.plan,
    carryForward: ['T2'],
    invalidate: ['T1'],
  }), /completed|完成|invalidate/u)
})

test('局部 delta 的失效闭包包含 Composite 父任务和父任务后继', () => {
  const plan = expandCompositeTask(compositePlan(), 'T2', {
    children: [
      compositeTask('T2-1'),
      compositeTask('T2-2', 'review', ['T2-1']),
    ],
    entry: ['T2-1'],
    exit: ['T2-2'],
  })
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id: 'wf-composite-delta',
    revision: 1,
    plan,
    tasks: Object.fromEntries(plan.tasks.map(task => [task.id, {
      taskId: task.id,
      status: task.id === 'T2-1' ? 'running' : 'pending',
      executorId: task.id === 'T2-1' ? 'owner' : null,
      verificationResults: { unit: { passed: true } },
      review: { status: 'passed' },
    }])),
  }
  const next = applyPlanDelta(state, { plan, invalidate: ['T2-1'] })
  for (const taskId of ['T2-1', 'T2-2', 'T2', 'T3']) {
    assert.equal(next.tasks[taskId].status, 'pending', `${taskId} 必须被失效`)
    assert.deepEqual(next.tasks[taskId].verificationResults, {})
    assert.equal(next.tasks[taskId].review, undefined)
  }
})

test('Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据', () => {
  const expanded = expandCompositeTask(compositePlan(), 'T2', {
    children: [compositeTask('T2-1')],
    entry: ['T2-1'],
    exit: ['T2-1'],
  })
  assert.throws(() => normalizePlanV2({
    ...expanded,
    tasks: expanded.tasks.map(task => task.id === 'T3' ? { ...task, dependsOn: ['T2-1'] } : task),
  }), /Composite|外部|child|父/u)

  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id: 'wf-registry-delta',
    revision: 1,
    plan: expanded,
    tasks: Object.fromEntries(expanded.tasks.map(task => [task.id, {
      taskId: task.id,
      status: task.id === 'T2' ? 'running' : 'pending',
      executorId: task.id === 'T2' ? 'owner' : null,
      verificationResults: {},
    }])),
    ownerRuns: {
      'T2:api': {
        taskId: 'T2',
        ownerId: 'api',
        stageId: 'T2',
        status: 'awaiting_finish',
        result: { commitSha: 'a'.repeat(40) },
      },
    },
  }
  assert.throws(() => applyPlanDelta(state, { plan: expanded, invalidate: ['T2'] }), /提交|commit|业务/u)
  assert.throws(() => applyPlanDelta({ ...state, ownerRuns: {} }, {
    plan: {
      ...expanded,
      owners: expanded.owners.map(owner => owner.id === 'api' ? { ...owner, scope: ['src/changed/**'] } : owner),
    },
    invalidate: ['T2'],
  }), /Registry|Owner|scope/u)
})

test('Plan delta 拒绝 V1 并规范化新增 V2 任务', () => {
  const state = reviewedV2State()
  assert.throws(() => applyPlanDelta({ ...state, plan: { contract: 'DSH_PLAN_V1' } }, {}), /V2/u)
  const next = applyPlanDelta(state, {
    plan: { ...state.plan, tasks: [...state.plan.tasks, compositeTask('T4', 'work', ['T3'])] },
    invalidate: ['T1'],
  })
  assert.equal(next.plan.tasks.at(-1).id, 'T4')
  assert.equal(next.plan.tasks.at(-1).dependsOn[0], 'T3')
})

test('V2 计划在构建自动机前拒绝超长 scope glob', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    owners: [v2Owner('api', ['a'.repeat(257)])],
  })), /glob.*长度.*上限/u)
})

test('V2 计划在构建自动机前拒绝字面字符种类过多的 write glob', () => {
  const literals = Array.from({ length: 65 }, (_, index) => String.fromCodePoint(0x4e00 + index)).join('')
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: [`src/${literals}`], verify: ['unit'], done: ['通过'] }],
  })), /glob.*字面字符.*上限/u)
})

test('V2 计划拒绝超出单层 Owner scope 的递归 write', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    owners: [v2Owner('api', ['src/api/*'])],
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/api/**'], verify: ['unit'], done: ['通过'] }],
  })), /scope/u)
})

test('V2 计划拒绝与 Owner exclude 相交的 write', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    owners: [v2Owner('api', ['src/**'], ['src/private/**'])],
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/**'], verify: ['unit'], done: ['通过'] }],
  })), /exclude/u)
})

test('V2 计划拒绝用单层通配符扩大问号 Owner scope', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    owners: [v2Owner('api', ['src/api/?.mjs'])],
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/api/*.mjs'], verify: ['unit'], done: ['通过'] }],
  })), /scope/u)
})

test('V2 计划拒绝未绑定的验证 ID', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/api/route.mjs'], verify: ['missing'], done: ['通过'] }],
  })), /验证/u)
})

test('V2 work task 必须绑定至少一个 required verification', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/api/route.mjs'], verify: [], done: ['通过'] }],
  })), /verify.*不能为空|验证.*不能为空|必须绑定至少一个验证/u)
})

test('V2 task保留显式稳定执行资源，旧task省略字段时不注入默认值', () => {
  const legacy = normalizePlanV2(v2Plan())
  assert.equal(Object.hasOwn(legacy.tasks[0], 'resources'), false)
  const withResources = normalizePlanV2(v2Plan({
    tasks: [{
      ...v2Plan().tasks[0],
      resources: ['tcp:localhost:5432', 'build-cache:flutter'],
    }],
  }))
  assert.deepEqual(withResources.tasks[0].resources, ['tcp:localhost:5432', 'build-cache:flutter'])
})

test('V2 task拒绝重复或不稳定的执行资源身份', () => {
  const base = v2Plan().tasks[0]
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ ...base, resources: ['db:test', 'db:test'] }],
  })), /重复资源身份/u)
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ ...base, resources: ['db:test resource'] }],
  })), /资源身份格式/u)
})

test('渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行', () => {
  const plan = normalizePlanV2(v2Plan({
    verifications: [],
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: 'api',
      title: '先确定子图边界',
      dependsOn: [],
      write: [],
      verify: [],
      done: ['子图边界已明确'],
      decomposition: {
        status: 'abstract',
        kind: 'discovery',
        outcome: '形成可执行子图',
        ownerCandidates: ['api'],
        unknowns: ['实际文件边界'],
      },
    }],
  }))
  assert.equal(plan.executable, false)
  assert.deepEqual(plan.verifications, [])
  assert.equal(plan.tasks[0].decomposition.status, 'abstract')
})

test('V2 计划拒绝未定义的 decomposition 状态并列出允许值', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: 'api',
      title: '错误状态',
      dependsOn: [],
      write: ['src/api/a.mjs'],
      verify: ['unit'],
      done: ['通过'],
      decomposition: {
        status: 'planned',
        kind: 'leaf',
        outcome: '错误状态',
        ownerCandidates: ['api'],
        unknowns: [],
      },
    }],
  })), /只允许 abstract、leaf 或 expanded/u)
})

test('V2 计划拒绝任务依赖环', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [
      { id: 'T1', role: 'work', ownerId: 'api', title: '一', dependsOn: ['T2'], write: ['src/api/a.mjs'], verify: ['unit'], done: ['通过'] },
      { id: 'T2', role: 'work', ownerId: 'api', title: '二', dependsOn: ['T1'], write: ['src/api/b.mjs'], verify: ['unit'], done: ['通过'] },
    ],
  })), /环/u)
})

test('V2 计划拒绝空验证 argv', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    verifications: [{ id: 'unit', run: [] }],
  })), /argv/u)
})

test('V2 计划拒绝用 argv 字段替代 run 并返回可修复错误', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    verifications: [{ id: 'unit', argv: ['node', '--test'] }],
  })), /字段名必须是 run，不能使用 argv/u)
})

test('V2 验证 cwd 只接受受限仓库相对目录并规范化保存', () => {
  const plan = normalizePlanV2(v2Plan({
    verifications: [{ id: 'flutter-test', run: ['flutter', 'test'], cwd: './flutter_app' }],
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '运行 Flutter 测试', dependsOn: [], write: ['src/api/route.mjs'], verify: ['flutter-test'], done: ['通过'] }],
  }))
  assert.equal(plan.verifications[0].cwd, 'flutter_app')
  assert.equal(normalizePlanV2(v2Plan({
    verifications: [{ id: 'unit', run: ['node', '--test'], cwd: '.' }],
  })).verifications[0].cwd, '.')
  for (const cwd of ['', '/private/tmp', '../flutter_app', 'flutter_app/../other', 'flutter_*', 'C:/flutter_app', null, 42]) {
    assert.throws(() => normalizePlanV2(v2Plan({
      verifications: [{ id: 'unit', run: ['node', '--test'], cwd }],
    })), /cwd|仓库相对|通配符|越界/u, String(cwd))
  }
})

test('V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型', () => {
  assert.throws(() => normalizePlanV2({
    ...v2Plan(),
    stages: [{ id: 'legacy-stage', tasks: [] }],
  }), /legacy|stages|阶段/u)
  assert.throws(() => normalizePlanV2({
    ...v2Plan(),
    completedStages: ['legacy-stage'],
  }), /legacy|completedStages|完成阶段/u)
})

test('V2 计划拒绝字符串验证 argv', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    verifications: [{ id: 'unit', run: 'node --test' }],
  })), /argv/u)
})

test('V2 生命周期使用固定 workflow 和 task 状态', () => {
  assert.deepEqual(WORKFLOW_STATUSES, [
    'initializing', 'planning', 'planned', 'registry_pending_plan', 'approved', 'running',
    'blocked', 'failed', 'completed', 'stopped', 'cancelled',
  ])
  assert.deepEqual(TASK_STATUSES, ['pending', 'running', 'completed', 'stopped'])
})

test('任务停止状态只接受固定的 reason/action 配对', () => {
  assert.deepEqual(STOP_REASON_ACTIONS, {
    input_missing: 'provide_input',
    decision_required: 'await_user',
    task_failed: 'repair_task',
    thread_failed: 'replace_thread',
    plan_invalid: 'revise_plan',
    runtime_failed: 'retry_runtime',
    owner_orphaned: 'recover_owner',
    termination_unconfirmed: 'inspect_runtime',
  })
})

test('任务停止拒绝未定义的 reason/action 配对', () => {
  assert.throws(() => taskLifecycleTransition({ status: 'running' }, { type: 'stop', reason: 'review_failed', action: 'repair_task' }), /reason|action/u)
})

test('任务停止接受 input_missing/provide_input 配对', () => {
  assert.deepEqual(taskLifecycleTransition({ status: 'running' }, { type: 'stop', reason: 'input_missing', action: 'provide_input' }), {
    status: 'stopped', reason: 'input_missing', action: 'provide_input',
  })
})

test('任务停止接受其余固定 reason/action 配对', () => {
  for (const [reason, action] of [
    ['decision_required', 'await_user'],
    ['task_failed', 'repair_task'],
    ['thread_failed', 'replace_thread'],
    ['plan_invalid', 'revise_plan'],
    ['runtime_failed', 'retry_runtime'],
    ['owner_orphaned', 'recover_owner'],
    ['termination_unconfirmed', 'inspect_runtime'],
  ]) {
    assert.deepEqual(taskLifecycleTransition({ status: 'running' }, { type: 'stop', reason, action }), {
      status: 'stopped', reason, action,
    })
  }
})

test('V2 计划拒绝 review 任务的 write', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ id: 'T1', role: 'review', ownerId: 'api', title: '审查', dependsOn: [], write: ['src/api/route.mjs'], verify: ['unit'], done: ['通过'] }],
  })), /review.*write/u)
})

test('V2 计划拒绝 verify 任务的 write', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{ id: 'T1', role: 'verify', ownerId: 'api', title: '验证', dependsOn: [], write: ['src/api/route.mjs'], verify: ['unit'], done: ['通过'] }],
  })), /verify.*write/u)
})

test('V2 计划原样保留 done 验收文本', () => {
  const plan = normalizePlanV2(v2Plan({
    tasks: [{ id: 'T1', role: 'work', ownerId: 'api', title: '实现', dependsOn: [], write: ['src/api/route.mjs'], verify: ['unit'], done: ['./验收通过'] }],
  }))
  assert.deepEqual(plan.tasks[0].done, ['./验收通过'])
})

test('V1 历史计划可读取运行时目录范围且不可执行', () => {
  const plan = normalizePlan({
    summary: '历史计划',
    owners: [{ id: 'history', name: '历史', description: '历史范围', scope: ['.owner-workflow/owners/history/memory/**'] }],
    stages: [{ id: 'stage', name: '阶段', dependsOn: [], tasks: [{ id: 'task', ownerId: 'history', title: '展示', description: '展示' }] }],
  })
  assert.equal(plan.executable, false)
})

test('V2 计划规范化显式角色，并按完成的依赖返回可执行任务', () => {
  const plan = plannerResultV2({
    contract: 'DSH_PLAN_V2',
    registryDigest: 'b'.repeat(64),
    summary: '合法 DAG',
    owners: [v2Owner('api', ['src/api/**'])],
    verifications: [{ id: 'unit', run: ['node', '--test', 'test/api.test.mjs'] }],
    tasks: [
      { id: 'T1', role: 'work', ownerId: 'api', title: '实现接口', dependsOn: [], write: ['src/api/route.mjs'], verify: ['unit'], done: ['接口通过测试'] },
      { id: 'T2', role: 'review', ownerId: 'api', title: '审查接口', dependsOn: ['T1'], write: [], verify: ['unit'], done: ['审查完成'] },
      { id: 'T3', role: 'verify', ownerId: 'api', title: '验证接口', dependsOn: ['T2'], write: [], verify: ['unit'], done: ['验证通过'] },
    ],
  })

  assert.equal(plan.contract, 'DSH_PLAN_V2')
  assert.deepEqual(plan.tasks.map(task => task.role), ['work', 'review', 'verify'])
  assert.deepEqual(plan.verifications, [{ id: 'unit', run: ['node', '--test', 'test/api.test.mjs'] }])
  assert.deepEqual(nextReadyTaskIds(plan, [
    { id: 'T1', status: 'pending' },
    { id: 'T2', status: 'pending' },
    { id: 'T3', status: 'pending' },
  ]), ['T1'])
  assert.deepEqual(nextReadyTaskIds(plan, [
    { id: 'T1', status: 'completed' },
    { id: 'T2', status: 'pending' },
    { id: 'T3', status: 'pending' },
  ]), ['T2'])
})

test('V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序', () => {
  const plan = normalizePlanV2(v2Plan({
    tasks: [
      { id: 'T1', role: 'work', ownerId: 'api', title: '一', dependsOn: [], write: ['src/api/one.mjs'], verify: ['unit'], done: ['一完成'] },
      { id: 'T2', role: 'work', ownerId: 'api', title: '二', dependsOn: [], write: ['src/api/two.mjs'], verify: ['unit'], done: ['二完成'] },
      { id: 'T3', role: 'verify', ownerId: 'api', title: '三', dependsOn: ['T1', 'T2'], write: [], verify: ['unit'], done: ['三完成'] },
    ],
  }))
  assert.deepEqual(nextReadyTaskIds(plan, [
    { id: 'T1', status: 'pending' },
    { id: 'T2', status: 'pending' },
    { id: 'T3', status: 'pending' },
  ]), ['T1', 'T2'])
  assert.deepEqual(nextReadyTaskIds(plan, [
    { id: 'T1', status: 'running' },
    { id: 'T2', status: 'stopped', reason: 'task_failed', action: 'repair_task' },
    { id: 'T3', status: 'pending' },
  ]), [])
})

test('所有者范围支持目录范围和排除范围', () => {
  const owner = normalizeOwner({
    id: 'network',
    name: '网络',
    description: '网络模块',
    scope: ['src/network/**'],
    exclude: ['src/network/generated/**'],
  })
  assert.equal(ownerAllows(owner, 'src/network/user/api.ts'), true)
  assert.equal(ownerAllows(owner, 'src/network/generated/api.ts'), false)
  assert.equal(ownerAllows(owner, 'src/feature/api.ts'), false)
})

test('所有者范围正确处理问号、单层通配符和目录边界', () => {
  const questionOwner = normalizeOwner({
    id: 'question',
    name: '问号',
    description: '问号匹配',
    scope: ['src/file-??.ts'],
  })
  assert.equal(ownerAllows(questionOwner, 'src/file-ab.ts'), true)
  assert.equal(ownerAllows(questionOwner, 'src/file-a.ts'), false)
  assert.equal(ownerAllows(questionOwner, 'src/file-abc.ts'), false)
  assert.equal(ownerAllows(questionOwner, 'src/file-ab.ts/child.ts'), false)

  const directoryOwner = normalizeOwner({
    id: 'directory',
    name: '目录',
    description: '目录边界',
    scope: ['src/module/*'],
  })
  assert.equal(ownerAllows(directoryOwner, 'src/module/file.ts'), true)
  assert.equal(ownerAllows(directoryOwner, 'src/module/nested/file.ts'), false)
  assert.equal(ownerAllows(directoryOwner, 'src/module-extra/file.ts'), false)

  const recursiveOwner = normalizeOwner({
    id: 'recursive',
    name: '递归',
    description: '递归目录',
    scope: ['src/module/**'],
  })
  assert.equal(ownerAllows(recursiveOwner, 'src/module/file.ts'), true)
  assert.equal(ownerAllows(recursiveOwner, 'src/module/nested/file.ts'), true)
  assert.equal(ownerAllows(recursiveOwner, 'src/module'), false)
  assert.equal(ownerAllows(recursiveOwner, 'src/module-extra/file.ts'), false)
})

test('计划拒绝循环和未知 Owner', () => {
  assert.throws(() => normalizePlan({
    summary: '循环计划',
    owners: [{ id: 'network', name: '网络', description: '网络', scope: ['src/network/**'] }],
    stages: [
      { id: 'a', name: '甲', dependsOn: ['b'], tasks: [{ id: 'ta', ownerId: 'network', title: '甲', description: '甲' }] },
      { id: 'b', name: '乙', dependsOn: ['a'], tasks: [{ id: 'tb', ownerId: 'missing', title: '乙', description: '乙' }] },
    ],
  }), /不存在的 Owner|存在环/u)
})

test('计划拒绝所有者范围重叠', () => {
  assert.throws(() => normalizePlan({
    summary: '重叠计划',
    owners: [
      { id: 'network', name: '网络', description: '网络', scope: ['src/network/**'] },
      { id: 'user', name: '用户', description: '用户', scope: ['src/network/user/**'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [
        { id: 'task-network', ownerId: 'network', title: '网络', description: '网络' },
        { id: 'task-user', ownerId: 'user', title: '用户', description: '用户' },
      ],
    }],
}), /scope 重叠/u)
})

test('V2 计划拒绝运行时管理目录的 Owner scope', () => {
  assert.throws(() => normalizePlanV2(v2Plan({
    owners: [v2Owner('memory-writer', ['.owner-workflow/owners/memory-writer/memory/**'])],
    tasks: [{ id: 'T1', role: 'work', ownerId: 'memory-writer', title: '写入', dependsOn: [], write: ['.owner-workflow/owners/memory-writer/memory/fact.mjs'], verify: ['unit'], done: ['完成'] }],
  })), /不能覆盖运行时管理的 \.owner-workflow\/owners/u)
})

test('父 Owner 排除完整子模块后允许合法拆分', () => {
  assert.doesNotThrow(() => normalizePlan({
    summary: '父子模块拆分',
    owners: [
      {
        id: 'module',
        name: '模块',
        description: '模块 Owner',
        scope: ['src/module/**'],
        exclude: ['src/module/user/**'],
      },
      {
        id: 'user',
        name: '用户',
        description: '用户子模块 Owner',
        scope: ['src/module/user/**'],
      },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [
        { id: 'module-task', ownerId: 'module', title: '模块任务', description: '模块任务', files: ['src/module/order.ts'] },
        { id: 'user-task', ownerId: 'user', title: '用户任务', description: '用户任务', files: ['src/module/user/api.ts'] },
      ],
    }],
  }))
})

test('局部 exclude 不能掩盖父 scope 剩余区域的重叠', () => {
  assert.throws(() => normalizePlan({
    summary: '局部排除仍然重叠',
    owners: [
      {
        id: 'module',
        name: '模块',
        description: '模块 Owner',
        scope: ['src/module/**'],
        exclude: ['src/module/user/**'],
      },
      {
        id: 'peer',
        name: '并行模块',
        description: '并行模块 Owner',
        scope: ['src/module/**'],
      },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'module', title: '任务', description: '任务' }],
    }],
  }), /scope 重叠/u)
})

test('所有者范围正确区分文件、目录和相邻路径', () => {
  assert.doesNotThrow(() => normalizePlan({
    summary: '路径边界',
    owners: [
      { id: 'directory', name: '目录', description: '目录', scope: ['src/module/**'] },
      { id: 'sibling', name: '相邻目录', description: '相邻目录', scope: ['src/module-extra/**'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'directory', title: '任务', description: '任务' }],
    }],
  }))

  assert.doesNotThrow(() => normalizePlan({
    summary: '文件边界',
    owners: [
      { id: 'file', name: '文件', description: '文件', scope: ['src/module/file.ts'] },
      { id: 'other-file', name: '其他文件', description: '其他文件', scope: ['src/module/file-extra.ts'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'file', title: '任务', description: '任务' }],
    }],
  }))

  assert.doesNotThrow(() => normalizePlan({
    summary: '目录本身与目录内容',
    owners: [
      { id: 'directory-entry', name: '目录项', description: '目录项', scope: ['src/module'] },
      { id: 'directory-content', name: '目录内容', description: '目录内容', scope: ['src/module/**'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'directory-entry', title: '任务', description: '任务' }],
    }],
  }))
})

test('所有者范围的问号和递归通配符参与重叠判断', () => {
  assert.throws(() => normalizePlan({
    summary: '问号重叠',
    owners: [
      { id: 'pattern', name: '模式', description: '模式', scope: ['src/file-??.ts'] },
      { id: 'file', name: '文件', description: '文件', scope: ['src/file-ab.ts'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'pattern', title: '任务', description: '任务' }],
    }],
  }), /scope 重叠/u)

  assert.doesNotThrow(() => normalizePlan({
    summary: '问号不重叠',
    owners: [
      { id: 'pattern', name: '模式', description: '模式', scope: ['src/file-??.ts'] },
      { id: 'file', name: '文件', description: '文件', scope: ['src/file-abc.ts'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'pattern', title: '任务', description: '任务' }],
    }],
  }))

  assert.throws(() => normalizePlan({
    summary: '递归重叠',
    owners: [
      { id: 'recursive', name: '递归', description: '递归', scope: ['src/**/api.ts'] },
      { id: 'client', name: '客户端', description: '客户端', scope: ['src/client/api.ts'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'recursive', title: '任务', description: '任务' }],
    }],
  }), /scope 重叠/u)

  assert.doesNotThrow(() => normalizePlan({
    summary: '递归不重叠',
    owners: [
      { id: 'single', name: '单层', description: '单层', scope: ['src/*/api.ts'] },
      { id: 'nested', name: '嵌套', description: '嵌套', scope: ['src/client/v1/api.ts'] },
    ],
    stages: [{
      id: 'stage',
      name: '阶段',
      dependsOn: [],
      tasks: [{ id: 'task', ownerId: 'single', title: '任务', description: '任务' }],
    }],
  }))
})

test('规划和所有者结果契约未知时按关闭处理', () => {
  assert.throws(() => plannerResult({ summary: '缺少契约', owners: [], stages: [] }), /规划结果契约/u)
  assert.equal(ownerResult({ contract: 'DSH_OWNER_RESULT_V1', status: 'blocked', summary: '被阻塞' }, 'fallback').status, 'blocked')
  assert.throws(() => ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '',
    changes: [],
  }, 'fallback'), /owner\.summary 必须是非空字符串/u)
  assert.throws(() => ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '完成修改',
    changes: [{ files: ['src/file.ts'], tests: [] }],
  }, 'fallback'), /changes\[0\]\.summary 必须是非空字符串/u)
  assert.throws(() => ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '完成修改',
    changes: [{ summary: '  ', files: ['src/file.ts'], tests: [] }],
  }, 'fallback'), /changes\[0\]\.summary 必须是非空字符串/u)
  assert.throws(() => ownerResult({ summary: '缺少状态' }, 'fallback'), /Owner 结果契约/u)
  assert.throws(() => ownerResult({ contract: 'DSH_OWNER_RESULT_V1', summary: '缺少状态' }, 'fallback'), /Owner 结果状态/u)
  assert.throws(() => ownerResult({ contract: 'DSH_OWNER_RESULT_V1', status: 'unknown', summary: '未知' }, 'fallback'), /Owner 结果状态/u)
  assert.deepEqual(ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'blocked',
    summary: '需要转交',
    handoffs: [{ targetType: 'owner', targetOwnerId: 'network-api', summary: '转交接口', reason: '超出当前 scope', files: ['src/network/api.ts'] }],
  }, 'fallback').handoffs[0], {
    targetType: 'owner',
    targetOwnerId: 'network-api',
    summary: '转交接口',
    reason: '超出当前 scope',
    files: ['src/network/api.ts'],
  })
  assert.equal(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'passed',
    summary: '通过',
    issues: [],
  }).status, 'passed')
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_revision',
    summary: '需要修订',
    issues: [{
      severity: 'high',
      title: '缺少验证',
      detail: '计划修改 native 模块但没有固定验证。',
      suggestion: '增加对应测试。',
      obligationId: 'ac32-native-verification',
      sourceId: 'AC-32',
      sourceVersion: 'R4',
      targetTaskIds: ['T1'],
      closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    }],
  }).issues[0], {
    severity: 'high',
    title: '缺少验证',
    detail: '计划修改 native 模块但没有固定验证。',
    suggestion: '增加对应测试。',
    obligationId: 'ac32-native-verification',
    sourceId: 'AC-32',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
  })
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'passed',
    summary: '关闭现有义务',
    issues: [],
    obligationClosures: [{
      obligationId: 'ac32-native-verification',
      kind: 'plan_verification_binding',
      taskId: 'T1',
      verificationId: 'unit',
      planDigest: 'a'.repeat(64),
    }],
  }).obligationClosures, [{
    obligationId: 'ac32-native-verification',
    kind: 'plan_verification_binding',
    taskId: 'T1',
    verificationId: 'unit',
    planDigest: 'a'.repeat(64),
  }])
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_split',
    summary: '需要拆分',
    issues: [],
    targetTaskIds: ['T1'],
  }).targetTaskIds, ['T1'])
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_decision',
    summary: '需要决策',
    issues: [],
    decisionQuestions: ['是否允许真实外部服务？'],
  }, { allowLegacyObligations: true }).decisionQuestions, ['是否允许真实外部服务？'])
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_discovery',
    summary: '需要调查',
    issues: [],
    discoveryQuestions: ['仓库是否已有测试 harness？'],
  }, { allowLegacyObligations: true }).discoveryQuestions, ['仓库是否已有测试 harness？'])
  assert.throws(() => planReviewResult({ status: 'passed' }), /计划审查结果契约/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'failed', summary: '失败', issues: [],
  }), /计划审查状态不受支持/u)
  assert.equal(implementationReviewResult({
    contract: 'DSH_IMPLEMENTATION_REVIEW_V1',
    status: 'passed',
    summary: '实现通过',
    issues: [],
  }).status, 'passed')
  assert.deepEqual(implementationReviewResult({
    contract: 'DSH_IMPLEMENTATION_REVIEW_V1',
    status: 'needs_repair',
    summary: '发现实现问题',
    issues: [{ severity: 'high', title: '边界遗漏', detail: '测试未覆盖异常路径', suggestion: '补充回归测试' }],
  }).issues, ['[high] 边界遗漏：测试未覆盖异常路径 建议：补充回归测试'])
  assert.throws(() => implementationReviewResult({ status: 'passed' }), /实现审查结果契约/u)
})

test('新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取', () => {
  const incompleteIssue = {
    severity: 'high',
    title: '缺少关闭合同',
    detail: '必须补齐。',
    suggestion: '重新提交。',
  }
  const raw = {
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_revision',
    summary: '缺少义务合同',
    issues: [incompleteIssue],
  }
  assert.throws(() => planReviewResult(raw), /obligationId|来源|sourceId|targetTaskIds|closeWhen|关闭/u)
  assert.equal(planReviewResult(raw, { allowLegacyObligations: true }).issues[0].title, '缺少关闭合同')
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_discovery',
    summary: '只有自由文本问题',
    issues: [],
    discoveryQuestions: ['仓库是否已有测试 harness？'],
  }), /结构化 issues|closeWhen/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_revision',
    summary: '同 ID 不同合同',
    issues: [
      {
        ...incompleteIssue,
        obligationId: 'AC-16-proof',
        sourceId: 'AC-16',
        sourceVersion: 'R4',
        targetTaskIds: ['T1'],
        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
      },
      {
        ...incompleteIssue,
        obligationId: 'AC-16-proof',
        sourceId: 'AC-16',
        sourceVersion: 'R4',
        targetTaskIds: ['T1'],
        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'integration' },
      },
    ],
  }), /同一.*义务|obligationId.*合同/u)
})

test('新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId', () => {
  assert.ok(PLAN_REVIEW_SUBMISSION_SCHEMA.properties.issues.items.required.includes('obligationId'))
  const otherwiseComplete = {
    severity: 'high',
    title: '缺少独立义务身份',
    detail: '同一来源可以包含多个独立要求。',
    suggestion: '为每项要求提供稳定 ID。',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
  }
  const review = {
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_revision',
    summary: '缺少 obligationId',
    issues: [otherwiseComplete],
  }
  assert.throws(() => planReviewResult(review), /obligationId/u)
  assert.equal(
    planReviewResult(review, { allowLegacyObligations: true }).issues[0].sourceId,
    'AC-16',
  )
})

test('计划审查关闭合同支持结构可执行与版本化决定，并按类型要求字段', () => {
  const issueCloseWhenSchema = PLAN_REVIEW_SUBMISSION_SCHEMA.properties.issues.items.properties.closeWhen
  const classificationBasisSchema = PLAN_REVIEW_SUBMISSION_SCHEMA.properties.issues.items.properties.classificationBasis
  const closureSchema = PLAN_REVIEW_SUBMISSION_SCHEMA.properties.obligationClosures.items
  assert.deepEqual(issueCloseWhenSchema.required, ['kind', 'taskId'])
  assert.ok(issueCloseWhenSchema.allOf.some(rule => rule.then?.required?.includes('verificationId')))
  assert.ok(issueCloseWhenSchema.allOf.some(rule => rule.then?.required?.includes('authority')))
  assert.deepEqual(classificationBasisSchema.required, ['source', 'technicalFacts'])
  assert.ok(closureSchema.allOf.some(rule => rule.then?.required?.includes('decisionId')))
  const baseIssue = {
    severity: 'high',
    title: '需要结构或决定凭据',
    detail: '义务必须由 Runtime 记录解除。',
    suggestion: '提交对应的关闭合同。',
    sourceId: 'AC-32',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
  }
  const executable = planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_split',
    summary: '任务必须可执行',
    issues: [{
      ...baseIssue,
      obligationId: 'ac32-structural-executable',
      closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
    }],
  })
  assert.deepEqual(executable.issues[0].closeWhen, { kind: 'plan_task_executable', taskId: 'T1' })

  const decision = planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_decision',
    summary: '需要用户确认范围',
    issues: [{
      ...baseIssue,
      obligationId: 'ac32-user-decision',
      closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' },
      classificationBasis: {
        source: { id: 'AC-32', version: 'R4' },
        technicalFacts: ['当前恢复实现会继续读取取消前的缓存。'],
        businessCommitmentDelta: {
          currentCommitment: '取消后允许恢复消费者使用缓存',
          proposedCommitment: '取消后立即清空缓存',
          consequence: '恢复消费者无法继续按原承诺恢复。',
        },
      },
    }],
    obligationClosures: [{
      obligationId: 'ac32-user-decision',
      kind: 'decision_record',
      taskId: 'T1',
      planDigest: 'a'.repeat(64),
      decisionId: 'decision-1',
    }],
  })
  assert.deepEqual(decision.issues[0].closeWhen, { kind: 'decision_record', taskId: 'T1', authority: 'user' })
  assert.equal(decision.issues[0].classificationBasis.businessCommitmentDelta.currentCommitment, '取消后允许恢复消费者使用缓存')
  assert.deepEqual(decision.obligationClosures, [{
    obligationId: 'ac32-user-decision', kind: 'decision_record', taskId: 'T1', planDigest: 'a'.repeat(64), decisionId: 'decision-1',
  }])
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'passed',
    summary: '结构可执行',
    issues: [],
    obligationClosures: [{
      obligationId: 'ac32-structural-executable',
      kind: 'plan_task_executable',
      taskId: 'T1',
      planDigest: 'a'.repeat(64),
    }],
  }).obligationClosures[0], {
    obligationId: 'ac32-structural-executable', kind: 'plan_task_executable', taskId: 'T1', planDigest: 'a'.repeat(64),
  })

  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: '缺少验证名',
    issues: [{ ...baseIssue, obligationId: 'missing-verification', closeWhen: { kind: 'plan_verification_binding', taskId: 'T1' } }],
  }), /verificationId/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '缺少权限',
    issues: [{ ...baseIssue, obligationId: 'missing-authority', closeWhen: { kind: 'decision_record', taskId: 'T1' } }],
  }), /authority/u)
  const technicalBasis = {
    source: { id: 'AC-32', version: 'R4' },
    technicalFacts: ['取消回调必须先读取连接状态。'],
  }
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '新决定缺依据',
    issues: [{ ...baseIssue, obligationId: 'missing-basis', closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' } }],
  }), /classificationBasis/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '技术问题不能转人工',
    issues: [{ ...baseIssue, obligationId: 'technical-user-conflict', closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' }, classificationBasis: technicalBasis }],
  }), /classificationBasis.*技术事实|authority/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '业务承诺不能自动关闭',
    issues: [{
      ...baseIssue,
      obligationId: 'business-auto-close-conflict',
      closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
      classificationBasis: {
        ...technicalBasis,
        businessCommitmentDelta: {
          currentCommitment: '保留恢复', proposedCommitment: '清空恢复', consequence: '恢复承诺变化。',
        },
      },
    }],
  }), /业务承诺.*decision_record|外部权限/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '依据来源不能漂移',
    issues: [{
      ...baseIssue,
      obligationId: 'mismatched-basis-source',
      closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
      classificationBasis: { ...technicalBasis, source: { id: 'AC-15', version: 'R4' } },
    }],
  }), /source.*sourceId|来源/u)
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '读取旧决定',
    issues: [{ ...baseIssue, obligationId: 'legacy-user-decision', closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' } }],
  }, { allowLegacyObligations: true }).issues[0].closeWhen.authority, 'user')
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '缺少决定 ID', issues: [],
    obligationClosures: [{ obligationId: 'ac32-user-decision', kind: 'decision_record', taskId: 'T1', planDigest: 'a'.repeat(64) }],
  }), /decisionId/u)
  assert.throws(() => planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '未知字段', issues: [],
    obligationClosures: [{ obligationId: 'ac32-structural-executable', kind: 'plan_task_executable', taskId: 'T1', planDigest: 'a'.repeat(64), authority: 'user' }],
  }), /不受支持的字段/u)
  assert.deepEqual(planReviewResult({
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '保留旧决定形状', issues: [],
    obligationClosures: [{
      obligationId: 'legacy-alternative', kind: 'alternative_decision', planDigest: 'a'.repeat(64),
      decisionId: 'historical-decision', sourceId: 'AC-16', sourceVersion: 'R4',
    }],
  }).obligationClosures[0], {
    obligationId: 'legacy-alternative', kind: 'alternative_decision', planDigest: 'a'.repeat(64),
    decisionId: 'historical-decision', sourceId: 'AC-16', sourceVersion: 'R4',
  })
})

test('带计划上下文时验证转交目标所有者和文件范围', () => {
  const plan = {
    owners: [
      { id: 'network', name: '网络', description: '网络', scope: ['src/network/**'] },
      { id: 'client', name: '客户端', description: '客户端', scope: ['src/client/**'] },
    ],
  }
  const handoff = {
    targetType: 'owner',
    targetOwnerId: 'client',
    summary: '转交客户端接口',
    reason: '文件属于客户端范围',
    files: ['src/client/api.ts'],
  }
  assert.doesNotThrow(() => validateHandoffTargets([handoff], plan, 'network'))
  assert.doesNotThrow(() => ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'blocked',
    summary: '需要转交',
    handoffs: [handoff],
  }, 'fallback', { plan, sourceOwnerId: 'network' }))
  assert.throws(() => validateHandoffTargets([{
    ...handoff,
    targetOwnerId: 'missing',
  }], plan, 'network'), /不存在的目标 Owner/u)
  assert.throws(() => validateHandoffTargets([{
    ...handoff,
    files: ['src/network/api.ts'],
  }], plan, 'network'), /不属于目标 Owner/u)
  assert.throws(() => validateHandoffTargets([{
    ...handoff,
    targetOwnerId: 'network',
  }], plan, 'network'), /不能转交给当前 Owner/u)
  assert.throws(() => ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'blocked',
    summary: '需要转交',
    handoffs: [handoff],
  }, 'fallback', { sourceOwnerId: 'network' }), /必须提供包含 owners 的 plan/u)
})

test('Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录', () => {
  const result = ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '完成接口并提出长期记忆',
    changes: [{ summary: '新增接口', files: ['src/network/api.ts'], tests: [] }],
    tests: [],
    handoffs: [],
    memory_updates: [{
      type: 'interface',
      title: '网络接口',
      summary: '接口返回统一结果',
      files: ['src/network/api.ts'],
      ownerIds: ['network'],
      supersedes: [],
    }],
  })
  assert.equal(result.memoryUpdates[0].type, 'interface')
  assert.equal(result.memoryUpdates[0].title, '网络接口')
  assert.throws(() => ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '非法记忆来源',
    memory_updates: [{
      type: 'history',
      title: '运行时状态',
      summary: '不能把运行时文件编译成长期事实',
      files: ['.dsh-workflow/state.json'],
    }],
  }), /不能引用运行时或记忆管理路径/u)
})

test('V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略', () => {
  const normalized = normalizePlanV2(v2Plan({
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: 'api',
      title: '高优先级任务',
      dependsOn: [],
      write: ['src/api/route.mjs'],
      verify: ['unit'],
      done: ['通过'],
      priority: 100,
      onFailure: { action: 'repair_owner', maxAttempts: 2 },
      onBlocked: { action: 'handoff_replan' },
      onTimeout: { action: 'notify_main' },
    }],
  }))
  assert.deepEqual(normalized.tasks[0].onFailure, { action: 'repair_owner', maxAttempts: 2 })
  assert.equal(normalized.tasks[0].priority, 100)
  assert.deepEqual(normalized.tasks[0].onBlocked, { action: 'handoff_replan' })
  assert.deepEqual(normalized.tasks[0].onTimeout, { action: 'notify_main', afterMs: 30 * 60 * 1000 })
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{
      id: 'T1', role: 'work', ownerId: 'api', title: '错误策略', dependsOn: [],
      write: ['src/api/route.mjs'], verify: ['unit'], done: ['通过'],
      onFailure: { action: 'repair_owner' },
    }],
  })), /maxAttempts/u)
  assert.throws(() => normalizePlanV2(v2Plan({
    tasks: [{
      id: 'T1', role: 'work', ownerId: 'api', title: '错误阻塞策略', dependsOn: [],
      write: ['src/api/route.mjs'], verify: ['unit'], done: ['通过'],
      onBlocked: { action: 'repair_owner', maxAttempts: 1 },
    }],
  })), /onBlocked.*不受支持/u)
})
