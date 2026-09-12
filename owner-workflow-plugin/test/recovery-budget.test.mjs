import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RECOVERY_BUDGET_CONTRACT, createRecoveryBudget, normalizeRecoveryBudget,
  registerRecoveryProblem, reserveRecoveryAttempt, startRecoveryAttempt,
  settleRecoveryAttempt, recordRecoveryEvidence, closeRecoveryProblem,
} from '../src/recovery-budget.mjs'

const ref = (id, version = 'v1') => ({ id, version })
const source = id => ref(`obligation/${id}`)
function setup(totalLimit = 3, limits = { P1: 2, P2: 2 }) {
  let ledger = createRecoveryBudget({ workflowId: 'wf', totalLimit })
  for (const [id, limit] of Object.entries(limits)) ledger = registerRecoveryProblem(ledger, { rootProblemId: id, limit, source: source(id) })
  return ledger
}
const req = (id, rootProblemId = 'P1', extra = {}) => ({ workflowId: 'wf', rootProblemId, requestId: `r-${id}`, attemptId: `a-${id}`, taskId: 'T1', ownerId: 'owner', executionVersion: 'plan-v1', ...extra })
const fact = (id, rootProblemId = 'P1', extra = {}) => ({ rootProblemId, problemSource: source(rootProblemId), fingerprint: id.repeat(64), reference: ref(`fact-${id}`), purpose: 'progress', ...extra })
const problem = (ledger, id = 'P1') => ledger.problems.find(item => item.rootProblemId === id)
const reload = value => normalizeRecoveryBudget(JSON.parse(JSON.stringify(value)))
function freeze(value) {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function failure(ledger, request, id = 'failed') {
  return settleRecoveryAttempt(ledger, { ...request, result: { status: 'failed', reference: ref(id) } }).ledger
}
function resolved(ledger, rootProblemId = 'P1') {
  const evidence = fact('f', rootProblemId, { purpose: 'closure' })
  ledger = recordRecoveryEvidence(ledger, evidence).ledger
  return closeRecoveryProblem(ledger, { rootProblemId, evidenceRef: evidence.reference }).ledger
}

test('T13 明确有限配置，没有默认无限值或隐式数值转换', () => {
  assert.equal(createRecoveryBudget({ workflowId: 'wf', totalLimit: 1 }).contract, RECOVERY_BUDGET_CONTRACT)
  for (const totalLimit of [undefined, 0, -1, 1.1, NaN, Infinity, '3', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createRecoveryBudget({ workflowId: 'wf', totalLimit }))
    assert.throws(() => registerRecoveryProblem(createRecoveryBudget({ workflowId: 'wf', totalLimit: 3 }), { rootProblemId: 'P1', limit: totalLimit, source: source('P1') }))
  }
  assert.throws(() => createRecoveryBudget({ workflowId: ' ', totalLimit: 1 }))
})

test('T13 BUD-01 两级限额原子扣减，问题用完不阻止独立问题', () => {
  let ledger = setup(3, { P1: 1, P2: 3 })
  ledger = reserveRecoveryAttempt(ledger, req(1)).ledger
  const before = reload(ledger)
  const denied = reserveRecoveryAttempt(ledger, req(2))
  assert.equal(denied.outcome, 'rejected')
  assert.equal(denied.reason, 'problem_exhausted')
  assert.deepEqual(denied.ledger, before)
  ledger = reserveRecoveryAttempt(ledger, req(3, 'P2')).ledger
  ledger = reserveRecoveryAttempt(ledger, req(4, 'P2')).ledger
  const exhausted = reserveRecoveryAttempt(ledger, req(5, 'P2'))
  assert.equal(exhausted.reason, 'workflow_exhausted')
  assert.equal(exhausted.ledger.totalUsed, 3)
  assert.equal(problem(exhausted.ledger, 'P2').used, 2)
  assert.deepEqual(exhausted.ledger, ledger)
})

test('T13 BUD-03 最后一份额度按传入的新快照串行竞争，两级不半扣', () => {
  let ledger = setup(1)
  ledger = reserveRecoveryAttempt(ledger, req(1, 'P1')).ledger
  const second = reserveRecoveryAttempt(reload(ledger), req(2, 'P2'))
  assert.equal(second.reason, 'workflow_exhausted')
  assert.equal(problem(second.ledger, 'P2').used, 0)
  assert.equal(second.ledger.attempts.length, 1)
})

test('T13 BUD-03 请求重放在耗尽后仍返回原attempt，重载不重扣', () => {
  const request = req(1)
  const first = reserveRecoveryAttempt(setup(1), request)
  const replay = reserveRecoveryAttempt(reload(first.ledger), request)
  assert.equal(replay.outcome, 'replayed')
  assert.deepEqual(replay.attempt, first.attempt)
  assert.deepEqual(replay.ledger, first.ledger)
})

for (const field of ['workflowId', 'rootProblemId', 'attemptId', 'taskId', 'ownerId', 'executionVersion']) {
  test(`T13 同request改变${field}拒绝，不借重复请求改绑定`, () => {
    const ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
    const before = reload(ledger)
    assert.throws(() => reserveRecoveryAttempt(ledger, req(1, 'P1', { [field]: field === 'rootProblemId' ? 'P2' : 'different' })))
    assert.deepEqual(ledger, before)
  })
}

test('T13 同attempt不能被不同request占用；不存在问题与外来Workflow拒绝', () => {
  const ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
  assert.throws(() => reserveRecoveryAttempt(ledger, req(2, 'P1', { attemptId: 'a-1' })))
  assert.throws(() => reserveRecoveryAttempt(ledger, req(3, 'missing')))
  assert.throws(() => reserveRecoveryAttempt(ledger, req(3, 'P1', { workflowId: 'elsewhere' })))
})

test('T13 问题注册幂等但来源和限额不可替换，同来源不能另开根问题', () => {
  const ledger = setup()
  assert.deepEqual(registerRecoveryProblem(ledger, { rootProblemId: 'P1', limit: 2, source: source('P1') }), ledger)
  for (const extra of [{ limit: 8 }, { source: ref('other') }, { rootProblemId: 'P3' }]) {
    assert.throws(() => registerRecoveryProblem(ledger, { rootProblemId: 'P1', limit: 2, source: source('P1'), ...extra }))
  }
})

test('T13 执行开始绑定不可换，未开始不能成功结算，终态不能重启', () => {
  const request = req(1)
  const reserved = reserveRecoveryAttempt(setup(), request).ledger
  const result = { status: 'succeeded', reference: ref('verification') }
  assert.throws(() => settleRecoveryAttempt(reserved, { ...request, result }))
  const first = startRecoveryAttempt(reserved, { ...request, executionRef: ref('session') })
  assert.equal(first.outcome, 'started')
  assert.equal(first.attempt.state, 'running')
  assert.deepEqual(startRecoveryAttempt(reload(first.ledger), { ...request, executionRef: ref('session') }).ledger, first.ledger)
  assert.throws(() => startRecoveryAttempt(first.ledger, { ...request, executionRef: ref('other-session') }))
  const settled = settleRecoveryAttempt(first.ledger, { ...request, result })
  assert.equal(settled.attempt.state, 'settled')
  assert.equal(settled.ledger.totalUsed, 1)
  assert.throws(() => startRecoveryAttempt(settled.ledger, { ...request, executionRef: ref('session') }))
})

for (const status of ['failed', 'cancelled']) test(`T13 启动前${status}可结算，不退额度；相同回执重放不改状态`, () => {
  const request = req(1)
  const reserved = reserveRecoveryAttempt(setup(), request).ledger
  const result = { status, reference: ref('result') }
  const first = settleRecoveryAttempt(reserved, { ...request, result })
  const replay = settleRecoveryAttempt(reload(first.ledger), { ...request, result })
  assert.equal(replay.outcome, 'replayed')
  assert.deepEqual(replay.ledger, first.ledger)
  assert.equal(first.ledger.totalUsed, 1)
  assert.equal(problem(first.ledger).used, 1)
  assert.throws(() => settleRecoveryAttempt(first.ledger, { ...request, result: { ...result, reference: ref('different') } }))
})

test('T13 开始及结算都重新核验完整绑定，调用错误不能写状态', () => {
  const request = req(1)
  const ledger = reserveRecoveryAttempt(setup(), request).ledger
  for (const field of Object.keys(request)) {
    const before = reload(ledger)
    assert.throws(() => startRecoveryAttempt(ledger, { ...request, [field]: 'wrong', executionRef: ref('session') }))
    assert.throws(() => settleRecoveryAttempt(ledger, { ...request, [field]: 'wrong', result: { status: 'failed', reference: ref('result') } }))
    assert.deepEqual(ledger, before)
  }
})

test('T13 BUD-04/05 相关新证据不退预算，A/B/A与换引用重放只留两份事实', () => {
  let ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
  ledger = failure(ledger, req(1))
  for (const f of [fact('a'), fact('b'), fact('a'), fact('a', 'P1', { reference: ref('another-view') })]) ledger = recordRecoveryEvidence(reload(ledger), f).ledger
  assert.equal(problem(ledger).evidence.length, 2)
  assert.equal(ledger.totalUsed, 1)
  assert.equal(problem(ledger).used, 1)
  ledger = recordRecoveryEvidence(ledger, fact('c', 'P2')).ledger
  assert.equal(problem(ledger).evidence.length, 2)
  assert.equal(problem(ledger, 'P2').used, 0)
  assert.equal(ledger.totalUsed, 1)
  const sameA = recordRecoveryEvidence(ledger, fact('a'))
  assert.equal(sameA.outcome, 'replayed')
})

test('T13 来源不匹配、相同引用内容冲突、进展升格关闭都拒绝', () => {
  let ledger = recordRecoveryEvidence(setup(), fact('a')).ledger
  assert.throws(() => recordRecoveryEvidence(ledger, fact('b', 'P1', { problemSource: source('P2') })))
  assert.throws(() => recordRecoveryEvidence(ledger, fact('b', 'P1', { reference: fact('a').reference })))
  assert.throws(() => recordRecoveryEvidence(ledger, fact('a', 'P1', { purpose: 'closure' })))
  assert.throws(() => closeRecoveryProblem(ledger, { rootProblemId: 'P1', evidenceRef: fact('a').reference }))
  assert.throws(() => closeRecoveryProblem(ledger, { rootProblemId: 'P1', evidenceRef: ref('unrecorded') }))
  assert.throws(() => closeRecoveryProblem(ledger, { rootProblemId: 'P1', evidenceRef: true }))
})

test('T13 问题关闭需当前根的关闭引用且无未结算attempt，关闭不擦历史', () => {
  const request = req(1)
  let ledger = reserveRecoveryAttempt(setup(), request).ledger
  const closure = fact('f', 'P1', { purpose: 'closure' })
  ledger = recordRecoveryEvidence(ledger, closure).ledger
  assert.throws(() => closeRecoveryProblem(ledger, { rootProblemId: 'P1', evidenceRef: closure.reference }))
  ledger = failure(ledger, request)
  const closing = { rootProblemId: 'P1', evidenceRef: closure.reference }
  const closed = closeRecoveryProblem(ledger, closing)
  assert.equal(closed.outcome, 'closed')
  assert.equal(problem(closed.ledger).status, 'resolved')
  assert.equal(closed.ledger.totalUsed, 1)
  assert.equal(closed.ledger.attempts.length, 1)
  assert.equal(closeRecoveryProblem(reload(closed.ledger), closing).outcome, 'replayed')
  assert.equal(reserveRecoveryAttempt(closed.ledger, req(2)).reason, 'problem_resolved')
  assert.equal(reserveRecoveryAttempt(closed.ledger, request).outcome, 'replayed')
  assert.deepEqual(failure(closed.ledger, request), closed.ledger)
  assert.throws(() => closeRecoveryProblem(closed.ledger, { rootProblemId: 'P2', evidenceRef: closure.reference }))
  assert.throws(() => closeRecoveryProblem(closed.ledger, { rootProblemId: 'P1', evidenceRef: ref('other-close') }))
  assert.deepEqual(resolved(ledger), closed.ledger)
})

test('T13 序列化账本严格校验，不接纳未知版本、重复记录或被改写的计数', () => {
  const valid = reserveRecoveryAttempt(setup(), req(1)).ledger
  assert.deepEqual(reload(valid), valid)
  const mutations = [
    l => { l.contract = 'unknown' }, l => { l.totalUsed = 0 }, l => { problem(l).used = 0 },
    l => { l.totalLimit = 0 }, l => { l.totalUsed = Number.MAX_SAFE_INTEGER },
    l => { l.attempts.push(structuredClone(l.attempts[0])) },
    l => { l.problems.push(structuredClone(l.problems[0])) },
    l => { l.attempts[0].rootProblemId = 'missing' },
    l => { l.attempts[0].workflowId = 'other' },
    l => { l.attempts[0].state = 'settled' },
    l => { l.attempts[0].state = 'running' }, l => { problem(l).status = 'resolved' },
    l => { l.problems = {} }, l => { l.surprise = 'must-not-disappear' },
  ]
  for (const mutate of mutations) { const bad = structuredClone(valid); mutate(bad); assert.throws(() => normalizeRecoveryBudget(bad)) }
})

test('T13 返回对象和输入无共享可写引用；冻结输入仍可工作', () => {
  const ledger = freeze(setup())
  const request = freeze(req(1))
  const first = reserveRecoveryAttempt(ledger, request)
  assert.equal(ledger.totalUsed, 0)
  first.ledger.problems[0].source.id = 'modified'
  assert.equal(ledger.problems[0].source.id, source('P1').id)
  const normalized = normalizeRecoveryBudget(ledger)
  normalized.problems[0].source.id = 'changed-copy'
  assert.equal(ledger.problems[0].source.id, source('P1').id)
})

test('T13 原型敏感字符串只作为ID数据，不能串改其他问题', () => {
  let ledger = setup(2, { ['__proto__']: 1, constructor: 1 })
  ledger = reserveRecoveryAttempt(ledger, req(1, '__proto__')).ledger
  ledger = reserveRecoveryAttempt(ledger, req(2, 'constructor')).ledger
  assert.equal(ledger.totalUsed, 2)
  assert.equal(problem(ledger, '__proto__').used, 1)
  assert.equal(problem(ledger, 'constructor').used, 1)
  assert.deepEqual(reload(ledger), ledger)
})


test('T13 严格输入不静默丢弃错误字段或伪证据标记', () => {
  const ledger = setup()
  assert.throws(() => reserveRecoveryAttempt(ledger, { ...req(1), budgetBypass: true }))
  assert.throws(() => registerRecoveryProblem(ledger, { rootProblemId: 'P3', limit: 1, source: ref('s'), reset: true }))
  assert.throws(() => recordRecoveryEvidence(ledger, { ...fact('a'), verified: true }))
  assert.throws(() => recordRecoveryEvidence(ledger, { ...fact('a'), fingerprint: 'not-a-fact-digest' }))
  assert.throws(() => recordRecoveryEvidence(ledger, { ...fact('a'), reference: { id: 'fact', version: '' } }))
  assert.throws(() => reserveRecoveryAttempt(ledger, { ...req(1), requestId: ' r-1' }))
})

test('T13 同根问题换task、Owner或版本仍共享已用额度，不重新注册预算', () => {
  let ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
  ledger = failure(ledger, req(1))
  const child = req(2, 'P1', { taskId: 'T1-child', ownerId: 'new-owner', executionVersion: 'plan-v2' })
  ledger = reserveRecoveryAttempt(reload(ledger), child).ledger
  assert.equal(problem(ledger).used, 2)
  assert.equal(ledger.totalUsed, 2)
  assert.equal(ledger.problems.length, 2)
  const denied = reserveRecoveryAttempt(ledger, req(3, 'P1', { taskId: 'T1-child-2', executionVersion: 'plan-v3' }))
  assert.equal(denied.reason, 'problem_exhausted')
  assert.deepEqual(denied.ledger, ledger)
})

test('T13 同一核验事实可分别关联多个根问题，各自核验来源和关闭引用', () => {
  let ledger = setup()
  for (const rootProblemId of ['P1', 'P2']) {
    ledger = recordRecoveryEvidence(ledger, fact('a', rootProblemId)).ledger
    ledger = recordRecoveryEvidence(ledger, fact('f', rootProblemId, { purpose: 'closure' })).ledger
  }
  assert.equal(problem(ledger, 'P1').evidence.length, 2)
  assert.equal(problem(ledger, 'P2').evidence.length, 2)
  ledger = closeRecoveryProblem(reload(ledger), { rootProblemId: 'P1', evidenceRef: fact('f').reference }).ledger
  assert.equal(problem(ledger, 'P2').status, 'open')
  ledger = closeRecoveryProblem(reload(ledger), { rootProblemId: 'P2', evidenceRef: fact('f').reference }).ledger
  assert.equal(problem(ledger, 'P1').status, 'resolved')
  assert.equal(problem(ledger, 'P2').status, 'resolved')
  assert.equal(ledger.totalUsed, 0)
})

for (const executionFirst of [true, false]) {
  test(`T13 F-14 跨attempt跨字段引用拒绝：${executionFirst ? '先执行后结算' : '先结算后执行'}`, () => {
    let ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
    ledger = reserveRecoveryAttempt(ledger, req(2, 'P2')).ledger
    const shared = ref('shared-receipt')
    ledger = executionFirst
      ? startRecoveryAttempt(ledger, { ...req(1), executionRef: shared }).ledger
      : failure(ledger, req(1), shared.id)
    const before = reload(ledger)
    freeze(ledger)
    assert.throws(() => executionFirst
      ? failure(ledger, req(2, 'P2'), shared.id)
      : startRecoveryAttempt(ledger, { ...req(2, 'P2'), executionRef: shared }), /其他 attempt/)
    assert.deepEqual(ledger, before)
    assert.equal(ledger.totalUsed, 2)
  })
}

for (const reverse of [false, true]) {
  test(`T13 F-14 JSON导入拒绝跨字段串用回执，reverse=${reverse}`, () => {
    let ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
    ledger = reserveRecoveryAttempt(ledger, req(2, 'P2')).ledger
    ledger = startRecoveryAttempt(ledger, { ...req(1), executionRef: ref('shared-receipt') }).ledger
    const snapshot = JSON.parse(JSON.stringify(ledger))
    snapshot.attempts[1].state = 'settled'
    snapshot.attempts[1].result = { status: 'failed', reference: ref('shared-receipt') }
    if (reverse) snapshot.attempts.reverse()
    assert.throws(() => normalizeRecoveryBudget(snapshot), /其他 attempt/)
  })
}

test('T13 F-14 同attempt跨字段引用及重放合法，不同版本引用仍独立', () => {
  let ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
  const shared = ref('shared-receipt')
  ledger = startRecoveryAttempt(ledger, { ...req(1), executionRef: shared }).ledger
  const result = { status: 'succeeded', reference: shared }
  ledger = settleRecoveryAttempt(ledger, { ...req(1), result }).ledger
  const replay = settleRecoveryAttempt(reload(ledger), { ...req(1), result })
  assert.equal(replay.outcome, 'replayed')
  assert.deepEqual(replay.ledger, ledger)
  ledger = reserveRecoveryAttempt(replay.ledger, req(2, 'P2')).ledger
  ledger = startRecoveryAttempt(ledger, { ...req(2, 'P2'), executionRef: ref(shared.id, 'v2') }).ledger
  assert.equal(ledger.attempts[1].state, 'running')
  assert.equal(reload(ledger).totalUsed, 2)
})

for (const kind of ['execution', 'result']) {
  test(`T13 F-14 保留同字段跨attempt去重：${kind}`, () => {
    let ledger = reserveRecoveryAttempt(setup(), req(1)).ledger
    ledger = reserveRecoveryAttempt(ledger, req(2, 'P2')).ledger
    const record = (value, request) => kind === 'execution'
      ? startRecoveryAttempt(value, { ...request, executionRef: ref('one-receipt') }).ledger
      : failure(value, request, 'one-receipt')
    ledger = record(ledger, req(1))
    assert.throws(() => record(ledger, req(2, 'P2')), /其他 attempt/)
    const snapshot = JSON.parse(JSON.stringify(ledger))
    snapshot.attempts[1].state = snapshot.attempts[0].state
    if (kind === 'execution') snapshot.attempts[1].executionRef = ref('one-receipt')
    else snapshot.attempts[1].result = { status: 'failed', reference: ref('one-receipt') }
    assert.throws(() => normalizeRecoveryBudget(snapshot), /其他 attempt/)
  })
}

const replanReq = (id, rootProblemId = 'P1', extra = {}) => ({
  workflowId: 'wf', rootProblemId, requestId: `r-${id}`, attemptId: `a-${id}`,
  executionVersion: 'plan-v1', executionKind: 'replan_operation',
  operationId: 'revision-cycle-1', operationKind: 'revision_plan', ...extra,
})

test('T15 Owner恢复与重规划共用问题预算，换操作类型/版本不重置额度', () => {
  let ledger = reserveRecoveryAttempt(setup(5), req(1)).ledger
  ledger = failure(ledger, req(1))
  const planner = replanReq(2)
  ledger = reserveRecoveryAttempt(reload(ledger), planner).ledger
  ledger = startRecoveryAttempt(ledger, { ...planner, executionRef: ref('planner-session') }).ledger
  ledger = failure(ledger, planner, 'planner-failed')
  for (const operationKind of ['revision_plan', 'revision_review', 'handoff_replan', 'owner_consultation']) {
    const denied = reserveRecoveryAttempt(ledger, replanReq(3, 'P1', {
      operationId: 'new-cycle', operationKind, executionVersion: 'plan-v2',
    }))
    assert.equal(denied.reason, 'problem_exhausted')
    assert.deepEqual(denied.ledger, ledger)
  }
  assert.equal(problem(ledger).used, 2)
  assert.equal(ledger.totalUsed, 2)
  assert.equal(Object.hasOwn(ledger.attempts[1], 'ownerId'), false)
  assert.equal(Object.hasOwn(ledger.attempts[1], 'taskId'), false)
  assert.deepEqual(reload(ledger), ledger)
})

test('T15 重规划与Owner跨根共用Workflow额度，独立问题只在总额尚有余量时继续', () => {
  let ledger = reserveRecoveryAttempt(setup(2), replanReq(1)).ledger
  ledger = reserveRecoveryAttempt(ledger, req(2, 'P2')).ledger
  assert.equal(reserveRecoveryAttempt(ledger, replanReq(3, 'P2')).reason, 'workflow_exhausted')
  assert.equal(reserveRecoveryAttempt(ledger, req(4)).reason, 'workflow_exhausted')
  assert.equal(problem(ledger, 'P2').used, 1)
  assert.equal(ledger.attempts.length, 2)
})

for (const operationKind of ['revision_plan', 'revision_review', 'handoff_replan', 'owner_consultation']) {
  test(`T15 ${operationKind}持久重放/实际引用开始/结算使用同一绑定，耗尽后不重扣`, () => {
    const request = replanReq(1, 'P1', { operationKind })
    const reserved = reserveRecoveryAttempt(setup(1), request)
    assert.equal(reserveRecoveryAttempt(reload(reserved.ledger), request).outcome, 'replayed')
    assert.throws(() => settleRecoveryAttempt(reserved.ledger, {
      ...request, result: { status: 'succeeded', reference: ref('result') },
    }), /未启动/)
    const running = startRecoveryAttempt(reserved.ledger, { ...request, executionRef: ref('session') })
    assert.equal(startRecoveryAttempt(reload(running.ledger), { ...request, executionRef: ref('session') }).outcome, 'replayed')
    const result = { status: 'succeeded', reference: ref('result') }
    const settled = settleRecoveryAttempt(reload(running.ledger), { ...request, result })
    assert.equal(settleRecoveryAttempt(reload(settled.ledger), { ...request, result }).outcome, 'replayed')
    assert.equal(reserveRecoveryAttempt(reload(settled.ledger), request).outcome, 'replayed')
    assert.equal(settled.ledger.totalUsed, 1)
    assert.equal(settled.attempt.state, 'settled')
    assert.throws(() => startRecoveryAttempt(settled.ledger, { ...request, executionRef: ref('session') }), /已结算/)
    assert.deepEqual(settled.ledger.attempts[0], { ...request, state: 'settled', executionRef: ref('session'), result })
  })
}

for (const field of Object.keys(replanReq(1))) {
  test(`T15 重规划${field}改变时reserve/start/settle均拒绝且不修改账本`, () => {
    const request = replanReq(1)
    const ledger = freeze(reserveRecoveryAttempt(setup(), request).ledger)
    const before = reload(ledger)
    const changed = { ...request, [field]: field === 'operationKind' ? 'revision_review' : 'different' }
    assert.throws(() => reserveRecoveryAttempt(ledger, changed))
    assert.throws(() => startRecoveryAttempt(ledger, { ...changed, executionRef: ref('session') }))
    assert.throws(() => settleRecoveryAttempt(ledger, { ...changed, result: { status: 'failed', reference: ref('result') } }))
    assert.deepEqual(ledger, before)
  })
}

test('T15 重规划绑定严格拒绝混合身份、未知类型、缺失字段以及静默降级', () => {
  const valid = replanReq(1)
  const mutations = [
    r => { r.ownerId = 'fake' }, r => { r.taskId = 'fake' },
    r => { r.executionKind = 'owner' }, r => { r.operationKind = 'unknown' },
    r => { r.operationKind = '' }, r => { r.operationId = ' ' },
    r => { delete r.executionKind }, r => { delete r.operationKind },
    r => { delete r.operationId }, r => { r.extra = true },
  ]
  for (const mutate of mutations) {
    const bad = structuredClone(valid); mutate(bad)
    assert.throws(() => reserveRecoveryAttempt(setup(), bad))
    const snapshot = reserveRecoveryAttempt(setup(), valid).ledger
    mutate(snapshot.attempts[0])
    assert.throws(() => reload(snapshot))
  }
  for (const extra of [{ executionKind: 'owner' }, { operationId: 'oops' }, { operationKind: 'revision_plan' }]) {
    assert.throws(() => reserveRecoveryAttempt(setup(), req(1, 'P1', extra)))
  }
  const accessor = { ...valid }
  Object.defineProperty(accessor, 'executionKind', { get() { assert.fail('must not invoke accessor') }, enumerable: true })
  assert.throws(() => reserveRecoveryAttempt(setup(), accessor), /数据字段/)
})

test('T15 同request不能在Owner和replan之间换绑，回执也不能跨执行类型串用', () => {
  for (const replanFirst of [true, false]) {
    const first = replanFirst ? replanReq(1) : req(1)
    const changed = replanFirst ? req(1) : replanReq(1)
    let ledger = reserveRecoveryAttempt(setup(), first).ledger
    assert.throws(() => reserveRecoveryAttempt(ledger, changed), /绑定/)
    assert.throws(() => startRecoveryAttempt(ledger, { ...changed, executionRef: ref('session') }), /绑定/)
    assert.throws(() => settleRecoveryAttempt(ledger, { ...changed, result: { status: 'failed', reference: ref('result') } }), /绑定/)
    const second = replanFirst ? req(2) : replanReq(2)
    ledger = reserveRecoveryAttempt(ledger, second).ledger
    ledger = startRecoveryAttempt(ledger, { ...first, executionRef: ref('shared') }).ledger
    assert.throws(() => failure(ledger, second, 'shared'), /其他 attempt/)
    const malformed = structuredClone(ledger)
    malformed.attempts[1].state = 'settled'
    malformed.attempts[1].result = { status: 'failed', reference: ref('shared') }
    assert.throws(() => reload(malformed), /其他 attempt/)
  }
})

test('T15 未启动重规划取消不退预算，存在未结算操作时根问题不能关闭', () => {
  const request = replanReq(1)
  let ledger = reserveRecoveryAttempt(setup(1), request).ledger
  const closure = fact('f', 'P1', { purpose: 'closure' })
  ledger = recordRecoveryEvidence(ledger, closure).ledger
  const closing = { rootProblemId: 'P1', evidenceRef: closure.reference }
  assert.throws(() => closeRecoveryProblem(ledger, closing), /结算/)
  ledger = settleRecoveryAttempt(ledger, { ...request, result: { status: 'cancelled', reference: ref('cancelled') } }).ledger
  ledger = closeRecoveryProblem(reload(ledger), closing).ledger
  assert.equal(ledger.totalUsed, 1)
  assert.equal(reserveRecoveryAttempt(ledger, replanReq(2)).reason, 'problem_resolved')
  assert.equal(reserveRecoveryAttempt(ledger, request).outcome, 'replayed')
})
