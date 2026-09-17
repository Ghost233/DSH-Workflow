import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, rm, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { authorizePlanningCheckpoint, implementationRequestReceipt } from '../src/planning-authority.mjs'
import { fixture, manifest, writeBoundDocuments, sourceInput, git } from './fixtures/planning-authority-native.mjs'
import { validatePlanningSourceChain } from '../src/planning-source-chain.mjs'
import { loadPlanningCheckpointSnapshot, PlanningCheckpointError, runPlanningCheckpoint } from '../src/planning-checkpoint.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { withControlLock } from '../src/workflow-store.mjs'
import { derivePlanningBundle } from '../src/planning-bundle.mjs'

async function nativeQuestions(t, value, response = 'approve') {
  const { default: Questions } = await import('../../deepseek-harness/packages/interaction/user-questions/lib/index.js')
  const questions = await value.ctx.plugin(Questions)
  const seen = []
  const dispose = value.agent.ctx.on('user-questions/request', async request => {
      seen.push(request)
      const question = request.questions[0]
      if (response === 'custom') return { answers: [{ id: question.id, selected: [], custom: '请先修正验证命令和任务依赖，再提交规划。' }] }
      if (response === 'approve-with-custom') return { answers: [{ id: question.id,
        selected: [question.options[0].label], custom: '批准选项不覆盖这条修订意见。' }] }
      if (response === 'cancel') return { answers: [] }
      if (response === 'decline') {
        const error = new Error('用户关闭了授权问询')
        error.code = 'DECLINED'
        throw error
      }
      return { answers: [{ id: question.id, selected: [question.options[response === 'approve' ? 0 : 1].label] }] }
  })
  t.after(async () => { dispose(); await questions.dispose() })
  return seen
}

async function bindingFor(value) {
  const chains = await writeBoundDocuments(value)
  const source = await validatePlanningSourceChain(sourceInput(value, chains))
  return { root: await realpath(value.root), source,
    request: { id: 'authority-tx', manifest: manifest(value.documents), baseline: value.baseline,
      source: source.source, reason: '准备本次规划', parentSnapshotId: null } }
}

function args(value, binding) {
  return { ctx: value.ctx, agent: value.agent,
    exec: { callId: 'checkpoint-real-call', rootCallId: 'checkpoint-real-call' },
    binding, signal: new AbortController().signal }
}

function checkpointInput(value, chains, id) {
  return { id, manifest: manifest(value.documents), baseline: value.baseline,
    source: { agentId: value.agent.id, sessionId: value.agent.id, chains }, reason: '固定本次完整规格和工单', parentSnapshotId: null }
}

function processLease(root, signal) {
  return operation => withControlLock(join(root, '.dsh-workflow', 'planning.lock'), lease => operation({
    signal,
    assertLease: () => { lease.assertHeld(); signal?.throwIfAborted() },
  }), { signal })
}

function runCheckpoint(value, request, exec, options = {}) {
  const signal = options.signal ?? exec.signal ?? new AbortController().signal
  return runPlanningCheckpoint({ root: value.root, cwd: value.root, request,
    authorize: binding => authorizePlanningCheckpoint({ ctx: value.ctx, agent: value.agent, exec, binding,
      signal, directProceed: options.directProceed }),
    withLease: options.withLease ?? processLease(value.root, signal), fault: options.fault })
}

test('实际原生问询先持久原始授权，同根重复核验复用，不因后续规格修订扩大实施范围', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value)
  const binding = await bindingFor(value)
  const grant = await authorizePlanningCheckpoint(args(value, binding))
  assert.equal(seen.length, 1)
  assert.equal(seen[0].agent, value.agent)
  assert.equal(grant.receipt.kind, 'native-user-question')
  assert.equal(grant.receipt.callId, 'checkpoint-real-call')
  assert.equal(grant.receipt.rootCallId, 'checkpoint-real-call')
  assert.deepEqual(grant.receipt.question, seen[0].questions[0])
  assert.deepEqual(grant.receipt.answer, {
    answers: [{ id: grant.receipt.question.id, selected: [grant.receipt.question.options[0].label] }],
  })
  assert.equal(grant.outcome, 'granted')
  assert.equal(grant.implementationScope.content, binding.source.references.spec.content)
  const directory = join(value.root, '.dsh-workflow/planning-authority')
  const files = await readdir(directory)
  assert.equal(files.length, 1)
  assert.deepEqual(JSON.parse(await readFile(join(directory, files[0]), 'utf8')), grant)
  assert.deepEqual(await authorizePlanningCheckpoint(args(value, { ...binding, authorizationId: grant.id })), grant)
  // The permission resolver can reuse document scope; the kernel separately
  // validates every changed source, and T27 separately validates implementation scope.
  const later = structuredClone(binding)
  later.source.references.spec.revision = 'R2'
  later.source.references.spec.content += '\n新讨论，尚未成为实施授权'
  assert.deepEqual(await authorizePlanningCheckpoint(args(value, later)), grant)
  assert.equal(seen.length, 1)
  const cancelled = new AbortController()
  cancelled.abort(new Error('cancelled-grant-reuse'))
  await assert.rejects(authorizePlanningCheckpoint({ ...args(value, binding), signal: cancelled.signal }), /cancelled-grant-reuse/)
  assert.equal(seen.length, 1)
  await rm(join(directory, files[0]))
  await assert.rejects(authorizePlanningCheckpoint(args(value, { ...binding, authorizationId: grant.id })), /ORIGINAL_GRANT_UNAVAILABLE/)
  assert.equal(seen.length, 1, '恢复时原grant消失不得重新询问并换一份授权')
})

for (const [response, outcome, custom] of [
  ['reject', 'rejected', null],
  ['custom', 'revision_requested', '请先修正验证命令和任务依赖，再提交规划。'],
  ['approve-with-custom', 'revision_requested', '批准选项不覆盖这条修订意见。'],
  ['cancel', 'cancelled', null],
  ['decline', 'cancelled', null],
]) test(`原生${response}决定不会创建grant或提交代码`, async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value, response)
  const binding = await bindingFor(value)
  const index = await readFile(join(value.root, '.git/index'))
  await assert.rejects(authorizePlanningCheckpoint(args(value, binding)), error => {
    assert.equal(error.outcome, outcome)
    assert.equal(error.decision.outcome, outcome)
    assert.equal(error.decision.custom, custom)
    assert.deepEqual(error.decision.question, seen[0].questions[0])
    if (response === 'cancel') assert.deepEqual(error.decision.answer, { answers: [] })
    else if (response === 'decline') assert.equal(error.decision.answer, null)
    else {
      assert.equal(error.decision.answer.answers.length, 1)
      assert.equal(error.decision.answer.answers[0].id, error.decision.question.id)
      if (custom !== null) assert.equal(error.decision.answer.answers[0].custom, custom)
    }
    assert.equal(error.decision.source.kind, 'native-user-question')
    return true
  })
  assert.equal(seen.length, 1)
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-authority')), { code: 'ENOENT' })
  assert.deepEqual(await readFile(join(value.root, '.git/index')), index)
})

test('规划 checkpoint 拒绝保留主线程可读的修订决定，且不产生授权或提交', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value, 'custom')
  const chains = await writeBoundDocuments(value)
  const index = await readFile(join(value.root, '.git/index'))
  const input = { id: 'runtime-revision-requested', manifest: manifest(value.documents), baseline: value.baseline,
    chains, reason: '请求固定规划' }
  const root = await realpath(value.root)
  const exec = { callId: 'planning-finalize-revision', rootCallId: 'planning-finalize-revision' }
  const signal = new AbortController().signal
  const { chains: selectedChains, ...request } = input
  await assert.rejects(runPlanningCheckpoint({ root, cwd: root, request: { ...request,
    source: { agentId: value.agent.id, sessionId: value.agent.id, chains: selectedChains }, parentSnapshotId: null },
    authorize: binding => authorizePlanningCheckpoint({ ctx: value.ctx, agent: value.agent, exec, binding, signal }),
    withLease: operation => operation({ signal, assertLease: async () => {} }),
  }), error => {
    const result = error.decision
    assert.equal(result.outcome, 'revision_requested')
    assert.equal(result.custom, '请先修正验证命令和任务依赖，再提交规划。')
    assert.deepEqual(result.question, seen[0].questions[0])
    assert.deepEqual(result.answer, {
      answers: [{ id: result.question.id, selected: [], custom: result.custom }],
    })
    assert.deepEqual(result.source, {
      kind: 'native-user-question',
      callId: 'planning-finalize-revision',
      rootCallId: 'planning-finalize-revision',
      agentId: value.agent.id,
      sessionId: value.agent.id,
    })
    assert.match(error.message, /请先修正验证命令和任务依赖/)
    return true
  })
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.baseline.head)
  assert.deepEqual(await readFile(join(value.root, '.git/index')), index)
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-authority')), { code: 'ENOENT' })
})

test('Kernel finalize 将 checkpoint 修订决定作为普通结果返回主线程', async t => {
  const value = await fixture(t)
  if (!value) return
  await writeBoundDocuments(value)
  const root = await realpath(value.root)
  const decision = {
    contract: 'DSH_PLANNING_AUTHORIZATION_DECISION_V1',
    outcome: 'revision_requested',
    question: { id: 'planning-authority-test', question: '是否继续？' },
    answer: { answers: [{ id: 'planning-authority-test', selected: [], custom: '先修正依赖关系。' }] },
    custom: '先修正依赖关系。',
    source: { kind: 'native-user-question', callId: 'finalize-decision', rootCallId: 'finalize-decision',
      agentId: value.agent.id, sessionId: value.agent.id },
  }
  const checkpointError = new PlanningCheckpointError('AUTHORIZATION_REFUSED', 'authorize', 'revision requested', { decision })
  const seam = {
    ready: Promise.resolve(),
    rootFor: async () => root,
    store: { read: async () => ({ workflows: {}, actions: {} }) },
    assertPlanningSourceWritable: KernelRuntime.prototype.assertPlanningSourceWritable,
    checkpointPlanningDocuments: async () => { throw checkpointError },
  }
  const result = await KernelRuntime.prototype.finalizePlanningDocuments.call(seam, value.agent,
    { callId: 'finalize-decision', rootCallId: 'finalize-decision', signal: new AbortController().signal })
  assert.deepEqual(result, decision)
  assert.notEqual(result, decision, '工具结果不应暴露 Error 持有的可变对象')
})

export { nativeQuestions }

for (const reusable of [true, false]) test(`Kernel finalize ${reusable ? '复用已有授权后不再解释历史引用' : '无已有授权仍拒绝无原生来源的引用'}`, async t => {
  const value = await fixture(t)
  if (!value) return
  const binding = await bindingFor(value)
  const seen = await nativeQuestions(t, value)
  const original = reusable ? await authorizePlanningCheckpoint(args(value, binding)) : undefined
  const root = await realpath(value.root)
  const seam = {
    ready: Promise.resolve(), ctx: value.ctx, rootFor: async () => root,
    store: { read: async () => ({ workflows: {} }), bindProject: async () => {} },
    withPlanningSourceWrite: async (_agent, callback) => callback(),
    checkpointPlanningDocuments: KernelRuntime.prototype.checkpointPlanningDocuments,
  }
  const finalize = () => KernelRuntime.prototype.finalizePlanningDocuments.call(seam, value.agent,
    { callId: 'finalize-reuse', signal: new AbortController().signal },
    { quote: '继续原验收', rationale: '技术修订沿用原验收范围' })
  if (reusable) {
    const result = await finalize()
    assert.equal(result.snapshot.authorization.id, original.id)
    assert.equal(result.snapshot.authorization.receipt.kind, 'native-user-question')
    assert.equal(seen.length, 1, '已有授权不应再次提问')
    assert.equal(await git(root, 'rev-parse', 'HEAD'), value.baseline.head)
    assert.equal(await git(root, 'rev-parse', `refs/dsh/planning/${result.checkpointId}`), result.checkpointCommit)
  } else {
    await assert.rejects(finalize(), /IMPLEMENTATION_REQUEST_NOT_NATIVE_USER/)
    assert.equal(seen.length, 0, '无效引用不得变成授权或自动回退确认')
    assert.equal(await git(root, 'rev-parse', 'HEAD'), value.baseline.head)
  }
})

test('checkpoint 在 snapshot 发布前中断后只恢复同一事务并复用原始 grant', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value)
  const request = checkpointInput(value, await writeBoundDocuments(value), 'authority-interrupted')
  const signal = new AbortController().signal
  await assert.rejects(runCheckpoint(value, request, { callId: 'authority-interrupted', signal }, {
    fault: stage => { if (stage === 'after-index-sync') throw new Error('injected-before-snapshot') },
  }), /injected-before-snapshot/)
  assert.equal(await git(value.root, 'diff', '--cached', '--name-only'), '')
  await assert.rejects(loadPlanningCheckpointSnapshot({ root: value.root, id: request.id }), /CHECKPOINT_SNAPSHOT_INCOMPLETE/)
  const resumed = await runCheckpoint(value, request, { callId: 'authority-interrupted-resume', signal })
  assert.equal(resumed.phase, 'checkpointed')
  assert.equal(seen.length, 1)
  assert.equal(await git(value.root, 'rev-list', '--count', resumed.checkpointCommit), '2')
})

test('checkpoint 重放返回同一冻结 source、grant 和 commit', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value)
  const chains = await writeBoundDocuments(value)
  const request = checkpointInput(value, chains, 'authority-idempotent')
  const exec = { callId: 'authority-idempotent', rootCallId: 'authority-idempotent', signal: new AbortController().signal }
  const first = await runCheckpoint(value, request, exec)
  const second = await runCheckpoint(value, request, exec)
  assert.deepEqual(second, first)
  assert.equal(first.snapshot.source.references.spec.content, value.documents.finalSpec)
  assert.equal(first.snapshot.source.references.tickets[0].document.content, value.documents.finalTicket)
  assert.equal(first.snapshot.authorization.initialSourceDigest, first.sourceDigest)
  assert.equal(seen.length, 1)
  assert.equal(await git(value.root, 'rev-list', '--count', first.checkpointCommit), '2')
})

test('原生用户实施请求只能经受信解释绑定到最新消息并作为 directProceed receipt', async t => {
  const value = await fixture(t)
  if (!value) return
  await writeBoundDocuments(value)
  const supportingPath = join(value.root, 'docs/specs/source-chain/progress.md')
  assert.equal((await value.call('write', { file_path: supportingPath, content: '# Progress\n\nReady.\n' })).isError, false)
  value.agent.session.append('user/message', { id: 'direct-proceed-message', role: 'user',
    content: [{ type: 'text', text: '请按本轮规格直接推进实现。' }],
    source: { kind: 'user', rpcId: 'native-web-request', clientTimeZone: 'Asia/Shanghai' } }, { surfaceOp: 'append' })
  const directProceed = implementationRequestReceipt(value.agent, {
    quote: '直接推进实现', rationale: '用户在当前原生主线程明确请求进入实施',
  })
  const bundle = await derivePlanningBundle({ root: value.root, cwd: value.root,
    agentId: value.agent.id, sessionId: value.agent.id })
  const { chains, ...bundleRequest } = bundle
  const request = { ...bundleRequest, id: 'authority-direct-proceed',
    source: { agentId: value.agent.id, sessionId: value.agent.id, chains }, parentSnapshotId: null }
  const result = await runCheckpoint(value, request, { callId: 'authority-direct-proceed', signal: new AbortController().signal }, { directProceed })
  assert.equal(result.snapshot.authorization.receipt.kind, 'direct-user-proceed')
  assert.equal(result.snapshot.authorization.receipt.messageId, 'direct-proceed-message')
  assert.equal(result.snapshot.authorization.receipt.sourceDigest, result.sourceDigest)
  assert.equal(result.snapshot.authorization.receipt.baselineHead, value.baseline.head)
  assert.deepEqual(result.snapshot.source.references.supporting, [{
    path: 'docs/specs/source-chain/progress.md', sha256: result.snapshot.source.references.supporting[0].sha256,
  }])
  assert.deepEqual((await git(value.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.checkpointCommit)).split('\n').filter(Boolean).sort(), [
    value.documents.spec.path, value.documents.ticket.path, 'docs/specs/source-chain/progress.md',
  ].sort())
  assert.throws(() => implementationRequestReceipt(value.agent, {
    quote: '不存在于消息的授权', rationale: '不得凭模型解释伪造用户原文',
  }), /IMPLEMENTATION_QUOTE_NOT_IN_LATEST_USER_MESSAGE/)
})

test('没有 directProceed receipt 时同一 checkpoint 必须经过原生问询', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value)
  const request = checkpointInput(value, await writeBoundDocuments(value), 'authority-native-required')
  const result = await runCheckpoint(value, request, { callId: 'authority-native-required', signal: new AbortController().signal })
  assert.equal(result.snapshot.authorization.receipt.kind, 'native-user-question')
  assert.equal(seen.length, 1)
})

test('技术拆分只改 T01 并新增 T06 时从唯一父 checkpoint 继承未变 Spec 与 T02-T05', async t => {
  const value = await fixture(t, { existingDocuments: false })
  if (!value) return
  const root = await realpath(value.root)
  const topic = 'docs/specs/partial-finalize'
  const other = 'docs/specs/historical'
  const spec = {
    id: 'SPEC-PARTIAL-FINALIZE', revision: 'R1', acceptanceCriteria: ['AC-01', 'AC-09'],
    contracts: [{ id: 'acceptance-v1', revision: 'R1' }],
  }
  const frontmatter = (kind, document) => {
    const declaration = kind === 'spec'
      ? { id: document.id, revision: document.revision, acceptanceCriteria: document.acceptanceCriteria, contracts: document.contracts }
      : { id: document.id, revision: document.revision, spec: document.spec,
          acceptanceCriteria: document.acceptanceCriteria, contracts: document.contracts,
          dependsOn: document.dependsOn, work: document.work }
    return [
      '---',
      'planning_document: DSH_PLANNING_DOCUMENT_V1',
      `document_kind: ${kind}`,
      `document_id: ${document.id}`,
      `document_revision: ${document.revision}`,
      ...(kind === 'ticket' ? [`spec_id: ${document.spec.id}`, `spec_revision: ${document.spec.revision}`] : []),
      `planning_declaration: ${JSON.stringify(declaration)}`,
      '---',
      '',
      `# ${document.id}`,
      '',
    ].join('\n')
  }
  const specContent = `${frontmatter('spec', spec)}Stable acceptance scope.\n`
  const ticket = (id, { revision = 'R1', dependsOn = [], workId = 'implementation', body = `${id} work.` } = {}) => {
    const document = {
      id, revision, spec: { id: spec.id, revision: spec.revision },
      acceptanceCriteria: [{ id: id === 'T-06' ? 'AC-09' : 'AC-01', specId: spec.id, specRevision: spec.revision }],
      contracts: [{ id: 'acceptance-v1', revision: 'R1' }], dependsOn,
      work: { ready: [{ id: workId }], blocked: [] },
    }
    return `${frontmatter('ticket', document)}${body}\n`
  }

  // A separate, valid historical Spec is committed but is never part of this
  // workflow's source closure.
  await mkdir(join(root, other), { recursive: true })
  const historical = { id: 'SPEC-HISTORICAL', revision: 'R1', acceptanceCriteria: ['AC-H'], contracts: [] }
  await writeFile(join(root, other, 'spec.md'), `${frontmatter('spec', historical)}Historical source.\n`)
  await git(root, 'add', `${other}/spec.md`)
  await git(root, 'commit', '-m', 'historical planning source')

  const specPath = join(root, topic, 'spec.md')
  assert.equal((await value.call('write', { file_path: specPath, content: specContent })).isError, false)
  const initialTickets = new Map()
  for (let index = 1; index <= 5; index += 1) {
    const id = `T-0${index}`
    const content = ticket(id, { dependsOn: index === 1 ? [] : ['T-01'] })
    initialTickets.set(id, content)
    assert.equal((await value.call('write', { file_path: join(root, topic, `${id}.md`), content })).isError, false)
  }
  const progressPath = join(root, topic, 'progress.md')
  assert.equal((await value.call('write', { file_path: progressPath, content: '# Progress\n\nInitial freeze.\n' })).isError, false)
  const initialBundle = await derivePlanningBundle({ root, cwd: root, agentId: value.agent.id, sessionId: value.agent.id })
  const { chains: initialChains, ...initialRequest } = initialBundle
  const decisions = await nativeQuestions(t, value)
  const parent = await runCheckpoint(value, { ...initialRequest,
    source: { agentId: value.agent.id, sessionId: value.agent.id, chains: initialChains }, parentSnapshotId: null },
  { callId: 'partial-finalize-parent', signal: new AbortController().signal })
  assert.equal(decisions.length, 1)

  const workflow = { id: 'wf-partial-finalize', root, rootSessionId: value.agent.id, cancelRequested: false, delivery: null,
    planningSources: { checkpointId: parent.snapshot.checkpointId, snapshotDigest: 'parent', sourceDigest: parent.snapshot.sourceDigest,
      codeBaseline: parent.snapshot.codeBaseline } }
  const restarted = {
    ready: Promise.resolve(), ctx: value.ctx, rootFor: async () => root,
    store: { read: async () => ({ workflows: { [workflow.id]: workflow } }), bindProject: async () => {} },
    withPlanningSourceWrite: async (_agent, callback) => callback(),
    checkpointPlanningDocuments: KernelRuntime.prototype.checkpointPlanningDocuments,
  }

  const t01Path = join(root, topic, 'T-01.md')
  assert.equal((await value.call('read', { file_path: t01Path })).isError, false)
  assert.equal((await value.call('edit', { file_path: t01Path, old_string: initialTickets.get('T-01'),
    new_string: ticket('T-01', { revision: 'R2', workId: 'fixtures', body: 'Fixture implementation only; final acceptance moved to T-06.' }) })).isError, false)
  assert.equal((await value.call('write', { file_path: join(root, topic, 'T-06.md'),
    content: ticket('T-06', { dependsOn: ['T-01', 'T-02', 'T-03', 'T-04', 'T-05'], workId: 'final-acceptance' }) })).isError, false)
  assert.equal((await value.call('read', { file_path: progressPath })).isError, false)
  assert.equal((await value.call('edit', { file_path: progressPath, old_string: '# Progress\n\nInitial freeze.\n',
    new_string: '# Progress\n\nT-06 owns final acceptance.\n' })).isError, false)

  await assert.rejects(derivePlanningBundle({ root, cwd: root, agentId: value.agent.id, sessionId: value.agent.id,
    parentSnapshot: { ...parent.snapshot, projectRoot: join(root, 'other-project') } }), /PARENT_SNAPSHOT_MISMATCH/)

  const ambiguous = { ...restarted, store: { ...restarted.store, read: async () => ({ workflows: {
    first: workflow, second: { ...workflow, id: 'wf-partial-finalize-second' },
  } }) } }
  await assert.rejects(KernelRuntime.prototype.finalizePlanningDocuments.call(ambiguous, value.agent,
    { callId: 'partial-finalize-ambiguous', signal: new AbortController().signal }), /Multiple active source parents/)

  // A direct, unjournaled mutation of an otherwise inherited parent file must
  // fail closed. Restoring its exact bytes leaves it clean and eligible for
  // inheritance; no synthetic current-turn journal is created.
  await writeFile(specPath, `${specContent}\nTampered outside the native write path.\n`)
  await assert.rejects(KernelRuntime.prototype.finalizePlanningDocuments.call(restarted, value.agent,
    { callId: 'partial-finalize-tampered', signal: new AbortController().signal }), /MISSING_BASELINE_WRITE_CHAIN|UNTRACKED_PLANNING_CHANGE/)
  await writeFile(specPath, specContent)

  const revisionBundle = await derivePlanningBundle({ root, cwd: root, agentId: value.agent.id, sessionId: value.agent.id,
    parentSnapshot: parent.snapshot })
  const mismatchedParentSource = structuredClone(parent.snapshot.source)
  mismatchedParentSource.references.spec.sha256 = '0'.repeat(64)
  await assert.rejects(validatePlanningSourceChain({ root, cwd: root, manifest: revisionBundle.manifest,
    baseline: revisionBundle.baseline, source: { agentId: value.agent.id, sessionId: value.agent.id, chains: revisionBundle.chains },
    supporting: revisionBundle.supporting, parentSource: mismatchedParentSource }), /PARENT_SOURCE_MISMATCH/)
  const crossSessionParentSource = structuredClone(parent.snapshot.source)
  crossSessionParentSource.source.agentId = 'other-root-session'
  crossSessionParentSource.source.sessionId = 'other-root-session'
  await assert.rejects(validatePlanningSourceChain({ root, cwd: root, manifest: revisionBundle.manifest,
    baseline: revisionBundle.baseline, source: { agentId: value.agent.id, sessionId: value.agent.id, chains: revisionBundle.chains },
    supporting: revisionBundle.supporting, parentSource: crossSessionParentSource }), /PARENT_SOURCE_MISMATCH/)

  // A new runtime object proves that the source closure is recovered from
  // persisted workflow/checkpoint state rather than in-memory journal state.
  const revised = await KernelRuntime.prototype.finalizePlanningDocuments.call(restarted, value.agent,
    { callId: 'partial-finalize-child', signal: new AbortController().signal })
  assert.equal(revised.snapshot.parentSnapshotId, parent.snapshot.id)
  assert.equal(decisions.length, 1, 'unchanged implementation scope reuses the original native grant')
  assert.equal(revised.snapshot.source.references.spec.sha256, parent.snapshot.source.references.spec.sha256)
  assert.equal(revised.snapshot.source.references.spec.revision, 'R1')
  assert.equal(revised.snapshot.source.references.tickets.length, 6)
  assert.deepEqual(revised.snapshot.source.references.tickets.map(item => item.id), ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06'])
  const parentTickets = new Map(parent.snapshot.source.references.tickets.map(item => [item.id, item]))
  for (const id of ['T-02', 'T-03', 'T-04', 'T-05']) {
    const current = revised.snapshot.source.references.tickets.find(item => item.id === id)
    assert.equal(current.revision, 'R1')
    assert.equal(current.document.sha256, parentTickets.get(id).document.sha256)
  }
  assert.equal(revised.snapshot.source.references.tickets[0].revision, 'R2')
  assert.equal(revised.snapshot.source.references.tickets.some(item => item.id === historical.id), false)
  assert.deepEqual((await git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', revised.checkpointCommit))
    .split('\n').filter(Boolean).toSorted(), [`${topic}/T-01.md`, `${topic}/T-06.md`, `${topic}/progress.md`])

  const revisedWorkflow = { ...workflow, planningSources: { ...workflow.planningSources,
    checkpointId: revised.snapshot.checkpointId, sourceDigest: revised.snapshot.sourceDigest,
    codeBaseline: revised.snapshot.codeBaseline } }
  const restartedAgain = { ...restarted, store: { ...restarted.store,
    read: async () => ({ workflows: { [revisedWorkflow.id]: revisedWorkflow } }) } }

  const t03Path = join(root, topic, 'T-03.md')
  await rm(t03Path)
  await assert.rejects(KernelRuntime.prototype.finalizePlanningDocuments.call(restartedAgain, value.agent,
    { callId: 'partial-finalize-deleted', signal: new AbortController().signal }), /UNSUPPORTED_WORKTREE_CHANGE/)
  await writeFile(t03Path, initialTickets.get('T-03'))

  const t02Path = join(root, topic, 'T-02.md')
  assert.equal((await value.call('read', { file_path: t02Path })).isError, false)
  assert.equal((await value.call('edit', { file_path: t02Path, old_string: initialTickets.get('T-02'),
    new_string: ticket('T-02', { revision: 'R2', dependsOn: ['T-01'], workId: 'network-contract',
      body: 'Network contract implementation revised in the second generation.' }) })).isError, false)
  assert.equal((await value.call('read', { file_path: progressPath })).isError, false)
  assert.equal((await value.call('edit', { file_path: progressPath, old_string: '# Progress\n\nT-06 owns final acceptance.\n',
    new_string: '# Progress\n\nT-02 network contract revised after T-06 split.\n' })).isError, false)
  const secondRevision = await KernelRuntime.prototype.finalizePlanningDocuments.call(restartedAgain, value.agent,
    { callId: 'partial-finalize-second-generation', signal: new AbortController().signal })
  assert.equal(secondRevision.snapshot.parentSnapshotId, revised.snapshot.id)
  assert.equal(decisions.length, 1)
  const secondTickets = new Map(secondRevision.snapshot.source.references.tickets.map(item => [item.id, item]))
  assert.equal(secondTickets.get('T-01').revision, 'R2')
  assert.equal(secondTickets.get('T-01').document.sha256,
    revised.snapshot.source.references.tickets.find(item => item.id === 'T-01').document.sha256)
  assert.equal(secondTickets.get('T-02').revision, 'R2')
  for (const id of ['T-03', 'T-04', 'T-05', 'T-06']) {
    assert.equal(secondTickets.get(id).document.sha256,
      revised.snapshot.source.references.tickets.find(item => item.id === id).document.sha256)
  }
  assert.equal(secondRevision.snapshot.source.references.spec.sha256, revised.snapshot.source.references.spec.sha256)
  assert.equal(secondRevision.snapshot.source.references.tickets.length, 6)
  assert.deepEqual((await git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', secondRevision.checkpointCommit))
    .split('\n').filter(Boolean).toSorted(), [`${topic}/T-02.md`, `${topic}/progress.md`])
})

test('规划包之外的脏文件在授权前拒绝且不改变 HEAD 或 index', async t => {
  const value = await fixture(t)
  if (!value) return
  const chains = await writeBoundDocuments(value)
  await writeFile(join(value.root, 'code.txt'), 'unrelated business edit\n')
  const before = await readFile(join(value.root, '.git/index'))
  await assert.rejects(runCheckpoint(value, checkpointInput(value, chains, 'authority-dirty'), {
    callId: 'authority-dirty', signal: new AbortController().signal,
  }), /UNRELATED_WORKTREE_CHANGE/)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.baseline.head)
  assert.deepEqual(await readFile(join(value.root, '.git/index')), before)
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-authority')), { code: 'ENOENT' })
})

test('同一规划锁阻止第二 checkpoint 在获取授权前并发进入', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value)
  const request = checkpointInput(value, await writeBoundDocuments(value), 'authority-racing')
  const signal = new AbortController().signal
  await withControlLock(join(value.root, '.dsh-workflow', 'planning.lock'), async () => {
    const blockedLease = operation => withControlLock(join(value.root, '.dsh-workflow', 'planning.lock'), lease => operation({
      signal, assertLease: () => lease.assertHeld(),
    }), { signal, timeoutMs: 50 })
    await assert.rejects(runCheckpoint(value, request, { callId: 'authority-racing', signal }, { withLease: blockedLease }), /already held|occupied|lock/i)
  }, { signal })
  assert.equal(seen.length, 0)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.baseline.head)
})

test('授权后取消阻止 ref CAS，恢复时复用同一原始授权', async t => {
  const value = await fixture(t)
  if (!value) return
  const seen = await nativeQuestions(t, value)
  const request = checkpointInput(value, await writeBoundDocuments(value), 'authority-cancelled')
  const controller = new AbortController()
  await assert.rejects(runCheckpoint(value, request, { callId: 'authority-cancelled', signal: controller.signal }, {
    signal: controller.signal,
    fault: stage => { if (stage === 'after-commit-object') controller.abort(new Error('cancel-before-ref')) },
  }), /LEASE_ABORTED|cancel-before-ref/)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.baseline.head)
  assert.equal(await git(value.root, 'diff', '--cached', '--name-only'), '')
  const resumed = await runCheckpoint(value, request, { callId: 'authority-cancelled-resume', signal: new AbortController().signal })
  assert.equal(resumed.phase, 'checkpointed')
  assert.equal(seen.length, 1)
})
