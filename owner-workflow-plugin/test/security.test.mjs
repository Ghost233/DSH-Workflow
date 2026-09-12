import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { reconcileReviewConvergence } from '../src/convergence.mjs'
import { commitFiles, head, statusRecords } from '../src/git.mjs'
import { ownerResult } from '../src/model.mjs'

const execFileAsync = promisify(execFile)

async function git(cwd, args) {
  return execFileAsync('git', args, { cwd, encoding: 'utf8' })
}

async function createRepository(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow-security@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Security Test'])
  await writeFile(join(root, 'README.md'), '安全测试仓库\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化安全测试仓库'])
  return root
}

function ownerDefinition() {
  return {
    id: 'security-owner',
    name: '安全 Owner',
    description: '安全边界测试 Owner',
    scope: ['src/owned/**', 'flutter_app/**', 'flutter_alt/**'],
    exclude: [],
  }
}

function ownerAgent(sessionId, root) {
  return {
    id: sessionId,
    session: { id: sessionId, header: { cwd: root } },
  }
}

function activeOwner(sessionId, root, workflowId = 'wf-security') {
  return {
    owner: ownerDefinition(),
    worktree: root,
    workflowRoot: root,
    workflowId,
    stageId: 'stage-security',
    ownerKey: `${root}:security-owner`,
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function fakeFileSystem() {
  return {
    sandboxMode: 'workspace-write',
    async resolve(path) {
      return path
    },
    processPath(path) {
      return path
    },
    async writeText(path, content, _encoding, _signal, policy) {
      const before = await readOptional(path)
      await writeFile(path, content, 'utf8')
      return { operation: 'write', before, after: content, policy }
    },
    async editText(path, options, _encoding, _signal, policy) {
      const before = await readFile(path, 'utf8')
      const occurrences = before.split(options.oldString).length - 1
      if (occurrences === 0) throw new Error('测试文件中不存在待替换文本')
      if (!options.replaceAll && occurrences > 1) throw new Error('测试替换文本出现多次')
      const after = options.replaceAll
        ? before.replaceAll(options.oldString, options.newString)
        : before.replace(options.oldString, options.newString)
      await writeFile(path, after, 'utf8')
      return { operation: 'edit', before, after, policy }
    },
  }
}

function fakeShell(enforcement = 'full', calls = []) {
  return {
    sandboxMode: 'workspace-write',
    resolve(spec) {
      calls.push(spec)
      return spec
    },
    async run(spec) {
      return {
        kind: 'foreground',
        ok: true,
        spec,
        sandbox: { enforcement },
      }
    },
  }
}

async function ownerVerificationFixture({ shellResult = { kind: 'foreground', exitCode: 0, sandbox: { enforcement: 'full' } } } = {}) {
  const root = await createRepository('dsh-owner-verification-')
  await mkdir(join(root, 'src', 'owned'), { recursive: true })
  await writeFile(join(root, 'src', 'owned', 'value.mjs'), 'export const value = 1\n', 'utf8')
  await git(root, ['add', 'src/owned/value.mjs'])
  await git(root, ['commit', '-m', '准备固定验证测试'])
  const worktree = join(root, '.owner-verification-worktree')
  await git(root, ['worktree', 'add', '-b', 'dsh/security-owner-verification', worktree, 'main'])
  const calls = []
  const runtime = createOwnerWorkflowRuntime({
    fs: fakeFileSystem(),
    shell: {
      sandboxMode: 'workspace-write',
      resolve(spec) {
        calls.push(spec)
        return spec
      },
      async run() {
        return typeof shellResult === 'function' ? shellResult(calls.length) : shellResult
      },
    },
    sandbox: {},
    sandboxPolicy: {},
  }, {})
  runtime.resolveRoot = async () => root
  await runtime.prepareRoot(root)
  const workflowId = 'wf-owner-verification'
  const plan = {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: 'Owner 固定验证测试计划',
    owners: [ownerDefinition()],
    verifications: [
      { id: 'unit', run: ['node', '--test', 'test/unit.test.mjs'] },
      { id: 'lint', run: ['node', 'scripts/lint.mjs'] },
    ],
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: ownerDefinition().id,
      title: '实现安全功能',
      dependsOn: [],
      write: ['src/owned/**'],
      verify: ['unit'],
      done: ['固定验证通过'],
    }],
  }
  const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const statePath = join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id: workflowId,
    root,
    status: 'running',
    plan,
    planDigest,
    revision: 0,
    tasks: [{
      taskId: 'T1',
      status: 'running',
      executorId: 'owner-verification-session',
      cursor: null,
      unchangedPolls: 0,
      reason: null,
      action: null,
    }],
    ownerRuns: {
      'T1:security-owner': {
        status: 'running',
        ownerId: 'security-owner',
        stageId: 'T1',
        worktree,
      },
    },
  }
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  const sessionId = 'owner-verification-session'
  const active = {
    ...activeOwner(sessionId, worktree, workflowId),
    workflowRoot: root,
    stageId: 'T1',
  }
  runtime.activeOwners.set(sessionId, active)
  return {
    root,
    worktree,
    runtime,
    calls,
    active,
    statePath,
    exec: { agent: ownerAgent(sessionId, worktree), signal: undefined },
    async cleanup() {
      await runtime.dispose()
      await git(root, ['worktree', 'remove', '--force', worktree]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    },
  }
}

async function legacyFlutterVerificationFixture({
  shellResult,
  packageRoots = ['flutter_app'],
  createPubspec = true,
} = {}) {
  const fixture = await ownerVerificationFixture({ shellResult })
  for (const packageRoot of packageRoots) {
    await mkdir(join(fixture.worktree, packageRoot, 'test'), { recursive: true })
    await writeFile(join(fixture.worktree, packageRoot, 'test', 'core_service_test.dart'), 'void main() {}\n', 'utf8')
    if (createPubspec) await writeFile(join(fixture.worktree, packageRoot, 'pubspec.yaml'), 'name: legacy_fixture\n', 'utf8')
  }
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  state.plan = {
    ...state.plan,
    verifications: [
      { id: 'analyze', run: ['flutter', 'analyze'] },
      { id: 'core-service-test', run: ['flutter', 'test', 'test/core_service_test.dart'] },
      { id: 'android-debug-build', run: ['flutter', 'build', 'apk', '--debug'] },
    ],
    tasks: [
      {
        id: 'T1', role: 'work', ownerId: 'security-owner', title: '修改 Flutter 测试', dependsOn: [],
        write: packageRoots.map(packageRoot => `${packageRoot}/test/core_service_test.dart`),
        verify: ['core-service-test'], done: ['测试通过'],
      },
      {
        id: 'T3', role: 'verify', ownerId: 'security-owner', title: '验证 Flutter 包', dependsOn: ['T1'],
        write: [], verify: ['analyze', 'core-service-test', 'android-debug-build'], done: ['验证通过'],
      },
    ],
  }
  state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
  state.tasks = [
    { taskId: 'T1', status: 'running', executorId: 'owner-verification-session', cursor: null, unchangedPolls: 0, reason: null, action: null },
    { taskId: 'T3', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0, reason: null, action: null },
  ]
  state.ownerRuns = {
    'T1:security-owner': {
      status: 'running', ownerId: 'security-owner', stageId: 'T1', worktree: fixture.worktree,
    },
  }
  await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  fixture.activate = async taskId => {
    const current = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    current.tasks = current.tasks.map(task => ({
      ...task,
      status: task.taskId === taskId ? 'running' : 'pending',
      executorId: task.taskId === taskId ? 'owner-verification-session' : null,
    }))
    current.ownerRuns = {
      [`${taskId}:security-owner`]: {
        status: 'running', ownerId: 'security-owner', stageId: taskId, worktree: fixture.worktree,
      },
    }
    await writeFile(fixture.statePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    fixture.active.stageId = taskId
  }
  return fixture
}

function ownerExecution(runtime, sessionId, root, name, argumentsValue = {}) {
  return runtime.checkToolExecution({
    agent: ownerAgent(sessionId, root),
    name,
    arguments: argumentsValue,
  })
}

test('Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接', async () => {
  const root = await createRepository('dsh-owner-security-tools-')
  const runtime = createOwnerWorkflowRuntime({}, {})
  const sessionId = 'security-tool-session'
  runtime.activeOwners.set(sessionId, activeOwner(sessionId, root))
  try {
    for (const name of ['read', 'write', 'edit', 'bash', 'skill', 'mcp__filesystem__write_file', 'unknown_tool']) {
      assert.equal(ownerExecution(runtime, sessionId, root, name), undefined, `Owner 工具 ${name} 不应被插件白名单拦截`)
    }
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('recordBoundVerification 把绑定验证结果写入 active、task 状态和日志', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '记录任务绑定的单元测试',
    }, fixture.exec)

    assert.deepEqual(result.argv, ['node', '--test', 'test/unit.test.mjs'])
    assert.equal(result.exitCode, 0)
    assert.equal(result.enforcement, 'full')
    assert.equal(result.passed, true)
    assert.match(result.contentDigest, /^[a-f0-9]{64}$/u)
    assert.deepEqual(fixture.active.verificationResults.unit, result)
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.calls[0].command, "'node' '--test' 'test/unit.test.mjs'")
    assert.notEqual(fixture.calls[0].workdir, fixture.worktree)
    assert.equal(fixture.calls[0].sandboxPolicy.mode, 'workspace-write')
    assert.equal(fixture.calls[0].sandboxPolicy.workspaceRoot, fixture.calls[0].workdir)

    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.deepEqual(state.tasks[0].verificationResults.unit, result)
    assert.equal(state.tasks[0].status, 'running', 'Task 7b-a 暂不改变完成或失败门禁')
    const log = (await readFile(join(fixture.root, '.dsh-workflow', 'logs', 'wf-owner-verification.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    assert.deepEqual(log.at(-1), {
      time: log.at(-1).time,
      event: 'owner.verification',
      ownerId: 'security-owner',
      taskId: 'T1',
      verificationId: 'unit',
      summary: '记录任务绑定的单元测试',
      argv: ['node', '--test', 'test/unit.test.mjs'],
      cwd: '.',
      contentDigest: result.contentDigest,
      exitCode: 0,
      enforcement: 'full',
      passed: true,
    })
  } finally {
    await fixture.cleanup()
  }
})

test('F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据', async () => {
  const fixture = await ownerVerificationFixture()
  let exec = fixture.exec
  const issue = {
    obligationId: 'f02-current-unit-result',
    sourceId: 'F02',
    sourceVersion: 'R4 5.10',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    title: 'T1 必须以当前固定验证结果关闭 F02',
    detail: 'Reviewer 只能提交当前 T1/unit 的关闭请求，Runtime 必须重新核验真实 Owner 记录。',
    suggestion: '重新运行 T1 的 unit 固定验证。',
  }
  const readWorkflowState = async () => JSON.parse(await readFile(fixture.statePath, 'utf8'))
  const writeWorkflowState = async update => {
    const state = await readWorkflowState()
    update(state)
    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    return state
  }
  const produce = () => fixture.runtime.recordBoundVerification({
    task_id: 'T1',
    verification_id: 'unit',
    description: '为 F02 提供当前 Owner 固定验证记录',
  }, exec)
  const evidence = async () => {
    const state = await readWorkflowState()
    assert.equal(state.planDigest, candidate.planDigest, 'F02 的每次实时重验保持同一 planDigest')
    return fixture.runtime.planReviewEvidence(state, state.plan, state.planDigest, exec.signal)
  }
  const state = await readWorkflowState()
  const candidate = {
    cycleId: 'f02-current-verification-cycle',
    planDigest: state.planDigest,
    planStructureDigest: 'f02-current-verification-structure',
    strategy: 'diagnose',
  }
  const initial = reconcileReviewConvergence({
    candidate,
    review: {
      status: 'needs_revision',
      summary: 'F02 等待当前 T1/unit 验证结果',
      issues: [issue],
      targetTaskIds: ['T1'],
    },
    evidenceDigest: 'f02-initial-evidence',
    time: '2026-09-10T00:00:00.000Z',
  })
  const closureReview = {
    status: 'passed',
    summary: 'Reviewer 请求使用当前 T1/unit 验证结果关闭 F02',
    issues: [],
    targetTaskIds: ['T1'],
    obligationClosures: [{
      obligationId: issue.obligationId,
      kind: 'task_verification_result',
      taskId: 'T1',
      verificationId: 'unit',
      planDigest: candidate.planDigest,
    }],
  }
  const reconcile = (runtimeEvidence, time) => reconcileReviewConvergence({
    previous: initial,
    candidate,
    review: closureReview,
    evidenceDigest: 'f02-realtime-evidence',
    time,
    runtimeEvidence,
  })
  const assertEmptyAndOpen = async (label, time) => {
    const current = await evidence()
    assert.equal(current.planDigest, candidate.planDigest, `${label} 保留候选计划绑定`)
    assert.deepEqual(current.taskVerificationResults, [], `${label} 不得投影过期或失败的宿主证据`)
    const convergence = reconcile(current, time)
    assert.equal(convergence.obligations[0].status, 'open', `${label} 不能关闭 F02 义务`)
  }
  const assertCurrentAndClosed = async (result, time) => {
    const current = await evidence()
    assert.deepEqual(current.planBindings, [{ taskId: 'T1', verificationId: 'unit' }])
    assert.deepEqual(current.taskVerificationResults, [{ ...result, current: true }])
    const convergence = reconcile(current, time)
    assert.equal(convergence.obligations[0].status, 'resolved')
    assert.equal(convergence.obligations[0].resolution.kind, 'task_verification_result')
    assert.equal(convergence.obligations[0].resolution.contentDigest, result.contentDigest)
  }

  try {
    let result = await produce()
    await assertCurrentAndClosed(result, '2026-09-10T00:01:00.000Z')

    await writeFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'export const value = 2\n', 'utf8')
    await assertEmptyAndOpen('真实 worktree 内容变化', '2026-09-10T00:02:00.000Z')
    result = await produce()
    await assertCurrentAndClosed(result, '2026-09-10T00:03:00.000Z')

    await writeWorkflowState(next => { next.tasks[0].writeGeneration = 1 })
    await assertEmptyAndOpen('同 planDigest 的写入代次变化', '2026-09-10T00:04:00.000Z')
    result = await produce()
    await assertCurrentAndClosed(result, '2026-09-10T00:05:00.000Z')

    const rotatedSessionId = 'owner-verification-session-rotated'
    await writeWorkflowState(next => {
      next.tasks[0].executorId = rotatedSessionId
      next.ownerRuns['T1:security-owner'].sessionId = rotatedSessionId
    })
    await assertEmptyAndOpen('同 planDigest 的 Owner session 变化', '2026-09-10T00:06:00.000Z')
    fixture.runtime.activeOwners.delete('owner-verification-session')
    fixture.runtime.activeOwners.set(rotatedSessionId, fixture.active)
    exec = { agent: ownerAgent(rotatedSessionId, fixture.worktree), signal: undefined }
    result = await produce()
    await assertCurrentAndClosed(result, '2026-09-10T00:07:00.000Z')

    await writeWorkflowState(next => {
      next.tasks[0].verificationResults.unit.argv = ['node', '--test', 'test/unbound.test.mjs']
    })
    await assertEmptyAndOpen('同 planDigest 的固定 argv 绑定变化', '2026-09-10T00:08:00.000Z')
    result = await produce()
    await assertCurrentAndClosed(result, '2026-09-10T00:09:00.000Z')

    for (const [label, hostEvidence] of [
      ['timedOut', { timedOut: true }],
      ['aborted', { aborted: true }],
      ['background', { kind: 'background' }],
      ['ok:false', { ok: false }],
    ]) {
      await writeWorkflowState(next => Object.assign(next.tasks[0].verificationResults.unit, hostEvidence))
      await assertEmptyAndOpen(`同 planDigest 的 ${label} 宿主证据`, `2026-09-10T00:10:${label.length.toString().padStart(2, '0')}Z`)
      result = await produce()
      await assertCurrentAndClosed(result, `2026-09-10T00:11:${label.length.toString().padStart(2, '0')}Z`)
    }
  } finally {
    await fixture.cleanup()
  }
})

test('R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    await writeFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'export const value = 7\n')
    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1', verification_id: 'unit', description: 'R07 当前宿主验证',
    }, fixture.exec)
    const original = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    for (const workflowWorktree of [undefined, '', null, 42, join(fixture.root, 'missing', 'workflow'), '/unavailable-r07/workflow']) {
      const state = { ...original, workflowWorktree }
      await writeFile(fixture.statePath, JSON.stringify(state))
      const evidence = await fixture.runtime.planReviewEvidence(state, state.plan, state.planDigest)
      assert.deepEqual(evidence.verifiedFiles, [], `不可用发现路径：${String(workflowWorktree)}`)
      assert.deepEqual(evidence.taskVerificationResults, [{ ...result, current: true }])
    }
    const discoverable = { ...original, workflowWorktree: join(fixture.root, 'workflow') }
    await writeFile(fixture.statePath, JSON.stringify(discoverable))
    const available = await fixture.runtime.planReviewEvidence(discoverable, discoverable.plan, discoverable.planDigest)
    assert.ok(available.verifiedFiles.some(file => file.taskId === 'T1' && file.path === 'src/owned/value.mjs'))
    assert.deepEqual(available.taskVerificationResults, [{ ...result, current: true }])

    const canceled = new AbortController()
    canceled.abort(new Error('R07 请求取消'))
    await assert.rejects(fixture.runtime.planReviewEvidence(original, original.plan, original.planDigest, canceled.signal), /Owner 工作流已被调用方取消/)

    const duringVerification = new AbortController()
    const originalCheck = fixture.runtime.assertRequiredTaskVerifications
    fixture.runtime.assertRequiredTaskVerifications = async (...args) => {
      const checked = await originalCheck(...args)
      duringVerification.abort()
      return checked
    }
    try {
      await assert.rejects(fixture.runtime.planReviewEvidence(discoverable, discoverable.plan, discoverable.planDigest, duringVerification.signal), /Owner 工作流已被调用方取消/)
    } finally {
      fixture.runtime.assertRequiredTaskVerifications = originalCheck
    }

    const changed = structuredClone(discoverable)
    changed.plan.summary = 'R07 新候选'
    changed.planDigest = createHash('sha256').update(JSON.stringify(changed.plan)).digest('hex')
    await writeFile(fixture.statePath, JSON.stringify(changed))
    const stale = await fixture.runtime.planReviewEvidence(discoverable, discoverable.plan, discoverable.planDigest)
    assert.deepEqual(stale.verifiedFiles, [])
    assert.deepEqual(stale.taskVerificationResults, [])
    assert.deepEqual(stale.planBindings, [])
  } finally {
    await fixture.cleanup()
  }
})

test('旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证', async () => {
  const fixture = await legacyFlutterVerificationFixture()
  try {
    const core = await fixture.runtime.recordBoundVerification({
      task_id: 'T1', verification_id: 'core-service-test', description: '运行旧计划 Flutter 测试',
    }, fixture.exec)
    assert.equal(core.cwd, 'flutter_app')
    assert.equal(fixture.calls[0].workdir.endsWith(join('workspace', 'flutter_app')), true)
    assert.notEqual(fixture.calls[0].workdir, fixture.calls[0].sandboxPolicy.workspaceRoot)

    await fixture.activate('T3')
    const analyze = await fixture.runtime.recordBoundVerification({
      task_id: 'T3', verification_id: 'analyze', description: '运行旧计划 Flutter 分析',
    }, fixture.exec)
    const build = await fixture.runtime.recordBoundVerification({
      task_id: 'T3', verification_id: 'android-debug-build', description: '运行旧计划 Android 构建',
    }, fixture.exec)
    assert.deepEqual([analyze.cwd, build.cwd], ['flutter_app', 'flutter_app'])
    assert.equal(fixture.calls[1].workdir.endsWith(join('workspace', 'flutter_app')), true)
    assert.equal(fixture.calls[2].workdir.endsWith(join('workspace', 'flutter_app')), true)

    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.tasks.find(task => task.taskId === 'T1').verificationResults['core-service-test'].cwd, 'flutter_app')
  } finally {
    await fixture.cleanup()
  }
})

test('旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app', async () => {
  const fixture = await legacyFlutterVerificationFixture({
    shellResult: callCount => callCount === 1
      ? { kind: 'foreground', ok: false, exitCode: 1, sandbox: { denied: true, enforcement: 'full' } }
      : { kind: 'foreground', ok: true, exitCode: 0, sandbox: { denied: false, enforcement: 'none' } },
  })
  fixture.active.parentAgent = { id: 'main-owner-agent', session: { id: 'main-owner-agent' } }
  fixture.runtime.ctx.approval = { async request() { return 'allowed-once' } }
  try {
    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1', verification_id: 'core-service-test', description: '授权重试旧计划 Flutter 测试',
    }, fixture.exec)
    assert.equal(result.cwd, 'flutter_app')
    assert.equal(result.enforcement, 'approved-host')
    assert.equal(fixture.calls.length, 2)
    for (const call of fixture.calls) {
      assert.equal(call.workdir.endsWith(join('workspace', 'flutter_app')), true)
      assert.equal(call.sandboxPolicy.workspaceRoot.endsWith('workspace'), true)
    }
    assert.equal(fixture.calls[0].sandboxPolicy.mode, 'workspace-write')
    assert.equal(fixture.calls[1].sandboxPolicy.mode, 'danger-full-access')
  } finally {
    await fixture.cleanup()
  }
})

test('旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed', async () => {
  const missing = await legacyFlutterVerificationFixture({ createPubspec: false })
  try {
    await assert.rejects(
      missing.runtime.recordBoundVerification({
        task_id: 'T1', verification_id: 'core-service-test', description: '拒绝缺失包根的旧计划',
      }, missing.exec),
      /旧计划 Flutter cwd.*唯一.*pubspec/u,
    )
    assert.equal(missing.calls.length, 0)
  } finally {
    await missing.cleanup()
  }

  const ambiguous = await legacyFlutterVerificationFixture({ packageRoots: ['flutter_app', 'flutter_alt'] })
  try {
    await assert.rejects(
      ambiguous.runtime.recordBoundVerification({
        task_id: 'T1', verification_id: 'core-service-test', description: '拒绝多包根旧计划',
      }, ambiguous.exec),
      /多个包根|拒绝任意选择/u,
    )
    assert.equal(ambiguous.calls.length, 0)
  } finally {
    await ambiguous.cleanup()
  }
})

test('验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    await symlink('README.md', join(fixture.worktree, 'AGENTS.md'))
    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '验证相对符号链接快照一致性',
    }, fixture.exec)
    assert.equal(result.passed, true)
    assert.equal(result.enforcement, 'full')
  } finally {
    await fixture.cleanup()
  }
})

test('固定验证快照和内容摘要跳过 Git 忽略的构建产物', async () => {
  let fixture
  fixture = await ownerVerificationFixture({
    shellResult: async () => {
      const snapshotRoot = fixture.calls.at(-1).sandboxPolicy.workspaceRoot
      await assert.rejects(readFile(join(snapshotRoot, 'generated', 'verification.bin')), /ENOENT/u)
      return { kind: 'foreground', ok: true, exitCode: 0, sandbox: { enforcement: 'full' } }
    },
  })
  try {
    await writeFile(join(fixture.root, '.git', 'info', 'exclude'), 'generated/\n')
    await mkdir(join(fixture.worktree, 'generated'), { recursive: true })
    await writeFile(join(fixture.worktree, 'generated', 'verification.bin'), '不应进入验证快照的构建产物\n')
    const ignored = await statusRecords(fixture.worktree, undefined, { includeIgnored: true, untracked: 'normal' })
    assert.equal(ignored.some(record => record.code === '!!' && record.path === 'generated/'), true)

    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '跳过 Git 忽略构建产物的固定验证',
    }, fixture.exec)
    assert.equal(result.passed, true)
  } finally {
    await fixture.cleanup()
  }
})

test('固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容', async () => {
  let fixture
  fixture = await ownerVerificationFixture({
    shellResult: async () => {
      const snapshotRoot = fixture.calls.at(-1).sandboxPolicy.workspaceRoot
      assert.equal(
        await readFile(join(snapshotRoot, 'node_modules', '.bin', 'fixture-cli'), 'utf8'),
        'fixture cli\n',
      )
      return { kind: 'foreground', ok: true, exitCode: 0, sandbox: { enforcement: 'full' } }
    },
  })
  try {
    await writeFile(join(fixture.root, '.git', 'info', 'exclude'), 'node_modules/\n')
    await mkdir(join(fixture.worktree, 'node_modules', '.bin'), { recursive: true })
    await writeFile(join(fixture.worktree, 'node_modules', '.bin', 'fixture-cli'), 'fixture cli\n')
    const ignored = await statusRecords(fixture.worktree, undefined, { includeIgnored: true, untracked: 'normal' })
    assert.equal(ignored.some(record => record.code === '!!' && record.path === 'node_modules/'), true)

    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '在隔离快照中使用锁定依赖 CLI',
    }, fixture.exec)
    assert.equal(result.passed, true)
    assert.equal(result.enforcement, 'full')
  } finally {
    await fixture.cleanup()
  }
})

test('固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次', async () => {
  const approvalCalls = []
  const fixture = await ownerVerificationFixture({
    shellResult: callCount => callCount === 1
      ? {
          kind: 'foreground',
          ok: false,
          exitCode: 1,
          sandbox: { denied: true, enforcement: 'full' },
        }
      : {
          kind: 'foreground',
          ok: true,
          exitCode: 0,
          sandbox: { denied: false, enforcement: 'none' },
        },
  })
  const parentAgent = { id: 'main-owner-agent', session: { id: 'main-owner-agent' } }
  fixture.active.parentAgent = parentAgent
  fixture.runtime.ctx.approval = {
    async request(request) {
      approvalCalls.push(request)
      return 'allowed-once'
    },
  }
  try {
    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '验证 Owner 现场宿主授权重试',
    }, fixture.exec)
    assert.equal(result.passed, true)
    assert.equal(result.enforcement, 'approved-host')
    assert.equal(result.approvalOutcome, 'allowed-once')
    assert.equal(fixture.calls.length, 2)
    assert.equal(fixture.calls[0].sandboxPolicy.mode, 'workspace-write')
    assert.equal(fixture.calls[1].sandboxPolicy.mode, 'danger-full-access')
    assert.equal(approvalCalls.length, 1)
    assert.equal(approvalCalls[0].agent, fixture.exec.agent)
    assert.equal(approvalCalls[0].toolName, 'owner_submit')
    assert.match(approvalCalls[0].reason, /固定验证：unit/u)
  } finally {
    await fixture.cleanup()
  }
})

test('固定验证获批后 Owner 绑定失效时不执行宿主重试', async () => {
  const fixture = await ownerVerificationFixture({
    shellResult: {
      kind: 'foreground',
      ok: false,
      exitCode: 1,
      sandbox: { denied: true, enforcement: 'full' },
    },
  })
  fixture.active.parentAgent = { id: 'main-owner-agent', session: { id: 'main-owner-agent' } }
  fixture.runtime.ctx.approval = {
    async request() {
      fixture.runtime.activeOwners.delete('owner-verification-session')
      return 'allowed-once'
    },
  }
  try {
    await assert.rejects(
      fixture.runtime.recordBoundVerification({
        task_id: 'T1',
        verification_id: 'unit',
        description: '验证授权后的 Owner 绑定',
      }, fixture.exec),
      /active Owner 绑定已经失效/u,
    )
    assert.equal(fixture.calls.length, 1)
  } finally {
    await fixture.cleanup()
  }
})

test('固定验证失败会持久化并返回有界 stdout 与 stderr', async () => {
  const fixture = await ownerVerificationFixture({
    shellResult: {
      kind: 'foreground',
      ok: false,
      exitCode: 1,
      stdout: { text: 'Expected: 1\nActual: 0', truncated: false },
      stderr: { text: 'core_service_test.dart:42 测试失败', truncated: false },
      sandbox: { denied: false, enforcement: 'full' },
    },
  })
  try {
    await assert.rejects(
      fixture.runtime.recordBoundVerification({
        task_id: 'T1',
        verification_id: 'unit',
        description: '记录固定验证失败输出',
      }, fixture.exec),
      /core_service_test\.dart:42.*Expected: 1/su,
    )
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const result = state.tasks[0].verificationResults.unit
    assert.equal(result.stderr, 'core_service_test.dart:42 测试失败')
    assert.equal(result.stdout, 'Expected: 1\nActual: 0')
    assert.equal(fixture.active.verificationResults.unit.stderr, result.stderr)
  } finally {
    await fixture.cleanup()
  }
})

test('required verification result 必须绑定当前 V2 plan/task/Owner/session/status', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '生成用于绑定检查的验证证据',
    }, fixture.exec)
    const baseline = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const currentResult = baseline.tasks[0].verificationResults.unit
    assert.equal(currentResult.planDigest, baseline.planDigest)
    assert.equal(currentResult.taskId, 'T1')
    assert.equal(currentResult.ownerId, 'security-owner')
    assert.equal(currentResult.sessionId, 'owner-verification-session')
    assert.equal(currentResult.workflowStatus, 'running')
    assert.equal(currentResult.taskStatus, 'running')

    const mutations = [
      ['planDigest', 'b'.repeat(64), /planDigest|计划摘要/u],
      ['taskId', 'T2', /task|任务/u],
      ['ownerId', 'other-owner', /Owner|owner/u],
      ['sessionId', 'other-session', /session|会话/u],
      ['workflowStatus', 'completed', /status|状态/u],
      ['taskStatus', 'completed', /status|状态/u],
    ]
    for (const [field, value, pattern] of mutations) {
      const state = JSON.parse(JSON.stringify(baseline))
      state.tasks[0].verificationResults.unit[field] = value
      await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      await assert.rejects(
        fixture.runtime.assertRequiredTaskVerifications(
          state,
          'T1',
          'security-owner',
          fixture.worktree,
        ),
        pattern,
        `字段 ${field} 漂移时必须拒绝旧验证证据`,
      )
    }
  } finally {
    await fixture.cleanup()
  }
})

test('persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场', async () => {
  const fixture = await ownerVerificationFixture()
  const agent = ownerAgent('parent-session', fixture.root)
  try {
    await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '生成重放路径的验证证据',
    }, fixture.exec)
    const base = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const commitSha = await head(fixture.worktree)
    for (const status of ['completed', 'awaiting_finish', 'committed']) {
      const state = JSON.parse(JSON.stringify(base))
      state.ownerRuns['T1:security-owner'] = {
        status,
        ownerId: 'security-owner',
        stageId: 'T1',
        branch: 'dsh/security-owner-verification',
        worktree: fixture.worktree,
        result: {
          ownerId: 'security-owner',
          branch: 'dsh/security-owner-verification',
          worktree: fixture.worktree,
          baseCommit: commitSha,
          commitSha,
          sessionId: 'owner-verification-session',
          report: { summary: '重放测试', changes: [], tests: [] },
          changedFiles: [],
          ahead: 0,
        },
      }
      state.tasks[0].verificationResults.unit.planDigest = 'b'.repeat(64)
      await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      await assert.rejects(
        fixture.runtime.runExternalOwner(agent, state.id, 'T1', 'security-owner', undefined, { deferFinish: true }),
        /planDigest|计划摘要|验证/u,
        `${status} 快路径不能重放旧 planDigest 证据`,
      )

      const cleanState = JSON.parse(JSON.stringify(base))
      cleanState.ownerRuns['T1:security-owner'] = state.ownerRuns['T1:security-owner']
      await writeFile(fixture.statePath, `${JSON.stringify(cleanState, null, 2)}\n`, 'utf8')
      await writeFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'export const value = 2\n', 'utf8')
      await assert.rejects(
        fixture.runtime.runExternalOwner(agent, state.id, 'T1', 'security-owner', undefined, { deferFinish: true }),
        /不干净|内容|验证/u,
        `${status} 快路径不能重放脏 worktree`,
      )
      await writeFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'export const value = 1\n', 'utf8')
    }
  } finally {
    await fixture.cleanup()
  }
})

test.skip('旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果）', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '为最终结算竞态生成验证证据',
    }, fixture.exec)
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const stage = {
      id: 'T1',
      name: '实现安全功能',
      dependsOn: [],
      tasks: [{
        id: 'T1',
        ownerId: 'security-owner',
        title: '实现安全功能',
        description: '实现安全功能',
        files: ['src/owned/value.mjs'],
        acceptance: ['固定验证通过'],
      }],
    }
    const entry = {
      owner: ownerDefinition(),
      tasks: stage.tasks,
      branch: 'dsh/security-owner-verification',
      worktree: fixture.worktree,
      baseCommit: await head(fixture.worktree),
      stageId: 'T1',
    }
    fixture.runtime.runOwnerContinuable = async () => ({
      sessionId: 'owner-verification-session',
      output: JSON.stringify({
        contract: 'DSH_OWNER_RESULT_V1',
        status: 'completed',
        summary: '最终结算竞态测试',
        changes: [],
        tests: [],
        handoffs: [],
      }),
    })
    const commitOwnerAttempt = fixture.runtime.commitOwnerAttempt.bind(fixture.runtime)
    fixture.runtime.commitOwnerAttempt = async (...args) => {
      const committed = await commitOwnerAttempt(...args)
      const drifted = JSON.parse(await readFile(fixture.statePath, 'utf8'))
      drifted.tasks[0].status = 'stopped'
      drifted.tasks[0].reason = 'decision_required'
      drifted.tasks[0].action = 'await_user'
      await writeFile(fixture.statePath, `${JSON.stringify(drifted, null, 2)}\n`, 'utf8')
      return committed
    }

    await assert.rejects(
      fixture.runtime.runOwnerEntry(
        ownerAgent('parent-session', fixture.root),
        state,
        stage,
        entry,
      ),
      /状态|running|漂移|验证/u,
    )
    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.notEqual(saved.ownerRuns['T1:security-owner']?.status, 'committed')
  } finally {
    await fixture.cleanup()
  }
})

test('recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    for (const args of [
      { task_id: 'T2', verification_id: 'unit', description: '伪造当前任务' },
      { task_id: 'T1', verification_id: 'lint', description: '执行未绑定验证' },
      { task_id: 'T1', verification_id: 'unknown', description: '执行未知验证' },
    ]) {
      await assert.rejects(
        fixture.runtime.recordBoundVerification(args, fixture.exec),
        /当前任务|绑定|未知/u,
      )
    }
    const stopped = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    stopped.tasks[0].status = 'stopped'
    await writeFile(fixture.statePath, `${JSON.stringify(stopped, null, 2)}\n`, 'utf8')
    await assert.rejects(
      fixture.runtime.recordBoundVerification(
        { task_id: 'T1', verification_id: 'unit', description: '停止后伪造验证' },
        fixture.exec,
      ),
      /running|运行/u,
    )
    assert.equal(fixture.calls.length, 0)
  } finally {
    await fixture.cleanup()
  }
})

test('recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败', async () => {
  const outcomes = [
    { kind: 'foreground', exitCode: 0, sandbox: { enforcement: 'partial' } },
    { kind: 'foreground', exitCode: 7, sandbox: { enforcement: 'full' } },
  ]
  const fixture = await ownerVerificationFixture({ shellResult: call => outcomes[call - 1] })
  try {
    await assert.rejects(
      fixture.runtime.recordBoundVerification(
        { task_id: 'T1', verification_id: 'unit', description: '拒绝部分沙箱证据' },
        fixture.exec,
      ),
      /full enforcement|partial/u,
    )
    let state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.tasks[0].verificationResults.unit.passed, false)
    assert.equal(state.tasks[0].verificationResults.unit.enforcement, 'partial')
    const entry = {
      owner: ownerDefinition(),
      branch: 'dsh/security-owner-verification',
      worktree: fixture.worktree,
      baseCommit: await head(fixture.worktree),
    }
    const emptyInspection = { files: [], ignoredFiles: [], ahead: 0, dirtyFiles: [] }
    await assert.rejects(
      fixture.runtime.commitOwnerAttempt(state, { id: 'T1', name: '实现安全功能' }, entry, emptyInspection),
      /full enforcement|partial/u,
    )

    await assert.rejects(
      fixture.runtime.recordBoundVerification(
        { task_id: 'T1', verification_id: 'unit', description: '拒绝失败退出状态' },
        fixture.exec,
      ),
      /exitCode|退出|7/u,
    )
    state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.tasks[0].verificationResults.unit.passed, false)
    assert.equal(state.tasks[0].verificationResults.unit.exitCode, 7)
    assert.equal(fixture.active.verificationResults.unit.exitCode, 7)
    assert.equal(state.tasks[0].status, 'running')
    await assert.rejects(
      fixture.runtime.commitOwnerAttempt(state, { id: 'T1', name: '实现安全功能' }, entry, emptyInspection),
      /exitCode|退出|7/u,
    )

    state.ownerRuns['T1:security-owner'] = {
      ...state.ownerRuns['T1:security-owner'],
      status: 'awaiting_finish',
      branch: entry.branch,
      worktree: entry.worktree,
      result: {
        ownerId: 'security-owner',
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        commitSha: entry.baseCommit,
        report: { summary: '失败验证不能完成', changes: [], tests: [] },
        changedFiles: [],
        ahead: 0,
      },
    }
    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await assert.rejects(
      fixture.runtime.finishOwner(
        { id: 'parent', session: { id: 'parent', header: { cwd: fixture.root } } },
        state.id,
        'T1',
        'security-owner',
      ),
      /exitCode|退出|7/u,
    )
  } finally {
    await fixture.cleanup()
  }
})

test.skip('旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证）', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const task = state.plan.tasks[0]
    const stage = {
      id: task.id,
      name: task.title,
      dependsOn: [],
      tasks: [{
        id: task.id,
        ownerId: task.ownerId,
        title: task.title,
        description: task.title,
        files: [...task.write],
        acceptance: [...task.done],
      }],
    }
    fixture.runtime.runOwnerContinuable = async () => ({
      sessionId: 'owner-verification-session',
      output: JSON.stringify({
        contract: 'DSH_OWNER_RESULT_V1',
        status: 'completed',
        summary: '尝试在没有固定验证时完成任务',
        changes: [],
        tests: [],
        handoffs: [],
      }),
    })

    await assert.rejects(
      fixture.runtime.runOwnerEntry(
        { id: 'parent', session: { id: 'parent', header: { cwd: fixture.root } } },
        state,
        stage,
        {
          owner: ownerDefinition(),
          tasks: stage.tasks,
          branch: 'dsh/security-owner-verification',
          worktree: fixture.worktree,
          baseCommit: await head(fixture.worktree),
          stageId: task.id,
        },
      ),
      /必需验证.*unit|unit.*验证/u,
    )
  } finally {
    await fixture.cleanup()
  }
})

test.skip('旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代）', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    const first = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '验证初始任务内容',
    }, fixture.exec)
    await fixture.runtime.ownerWrite({
      file_path: 'src/owned/value.mjs',
      content: 'export const value = 2\n',
      description: '修改已经验证过的任务内容',
    }, fixture.exec)

    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const stage = { id: 'T1', name: '实现安全功能' }
    const entry = {
      owner: ownerDefinition(),
      branch: 'dsh/security-owner-verification',
      worktree: fixture.worktree,
      baseCommit: await head(fixture.worktree),
    }
    const inspection = {
      files: ['src/owned/value.mjs'],
      ignoredFiles: [],
      ahead: 0,
      dirtyFiles: ['src/owned/value.mjs'],
    }
    await assert.rejects(
      fixture.runtime.commitOwnerAttempt(state, stage, entry, inspection, undefined),
      /验证结果已过期|内容已变化|写入代次/u,
    )

    const rerun = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '内容变化后重新运行单元测试',
    }, fixture.exec)
    assert.notEqual(rerun.contentDigest, first.contentDigest)
    const committed = await fixture.runtime.commitOwnerAttempt(state, stage, entry, inspection, undefined)
    assert.deepEqual(committed.changed, ['src/owned/value.mjs'])

    const pending = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    pending.ownerRuns['T1:security-owner'] = {
      ...pending.ownerRuns['T1:security-owner'],
      status: 'awaiting_finish',
      branch: entry.branch,
      worktree: entry.worktree,
      result: {
        ownerId: 'security-owner',
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        commitSha: committed.commitSha,
        report: { summary: '重新验证后完成', changes: [], tests: [] },
        changedFiles: committed.changed,
        ahead: committed.ahead,
      },
    }
    await writeFile(fixture.statePath, `${JSON.stringify(pending, null, 2)}\n`, 'utf8')
    const finished = await fixture.runtime.finishOwner(
      { id: 'parent', session: { id: 'parent', header: { cwd: fixture.root } } },
      pending.id,
      'T1',
      'security-owner',
    )
    assert.equal(finished.report.summary, '重新验证后完成')
    assert.equal(JSON.parse(await readFile(fixture.statePath, 'utf8')).ownerRuns['T1:security-owner'].status, 'completed')
  } finally {
    await fixture.cleanup()
  }
})

test.skip('旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代）', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '验证回滚前的任务内容',
    }, fixture.exec)
    await fixture.runtime.ownerEdit({
      file_path: 'src/owned/value.mjs',
      old_string: 'value = 1',
      new_string: 'value = 2',
      description: '临时修改已验证的任务内容',
    }, fixture.exec)
    await fixture.runtime.ownerEdit({
      file_path: 'src/owned/value.mjs',
      old_string: 'value = 2',
      new_string: 'value = 1',
      description: '把任务内容回滚到验证前的原样',
    }, fixture.exec)

    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    await assert.rejects(
      fixture.runtime.commitOwnerAttempt(
        state,
        { id: 'T1', name: '实现安全功能' },
        { owner: ownerDefinition(), branch: 'dsh/security-owner-verification', worktree: fixture.worktree, baseCommit: await head(fixture.worktree) },
        { files: [], ignoredFiles: [], ahead: 0, dirtyFiles: [] },
        undefined,
      ),
      /重新运行|写入代次|验证结果已过期/u,
    )
  } finally {
    await fixture.cleanup()
  }
})

test.skip('旧版 owner_write 相同内容代次测试（逐写入包装已移除）', async () => {
  const fixture = await ownerVerificationFixture()
  try {
    const original = await readFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'utf8')
    await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '验证相同内容写入前的任务内容',
    }, fixture.exec)
    await fixture.runtime.ownerWrite({
      file_path: 'src/owned/value.mjs',
      content: original,
      description: '写回相同内容以验证写入代次门禁',
    }, fixture.exec)

    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    await assert.rejects(
      fixture.runtime.commitOwnerAttempt(
        state,
        { id: 'T1', name: '实现安全功能' },
        { owner: ownerDefinition(), branch: 'dsh/security-owner-verification', worktree: fixture.worktree, baseCommit: await head(fixture.worktree) },
        { files: [], ignoredFiles: [], ahead: 0, dirtyFiles: [] },
        undefined,
      ),
      /重新运行|写入代次|验证结果已过期/u,
    )
  } finally {
    await fixture.cleanup()
  }
})

test('owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功', async () => {
  let statePath
  let worktree
  const fixture = await ownerVerificationFixture({
    shellResult: async () => {
      const state = JSON.parse(await readFile(statePath, 'utf8'))
      state.plan.summary = '验证执行期间被修改的计划'
      state.revision = Number(state.revision ?? 0) + 1
      await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      await writeFile(join(worktree, 'src', 'owned', 'value.mjs'), 'export const value = 99\n', 'utf8')
      return { kind: 'foreground', ok: true, exitCode: 0, sandbox: { enforcement: 'full' } }
    },
  })
  statePath = fixture.statePath
  worktree = fixture.worktree
  try {
    await assert.rejects(
      fixture.runtime.recordBoundVerification({
        task_id: 'T1',
        verification_id: 'unit',
        description: '验证期间检测计划和 worktree 漂移',
      }, fixture.exec),
      /漂移|一致|revision|计划|worktree/u,
    )
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.tasks[0].verificationResults?.unit, undefined)
  } finally {
    await fixture.cleanup()
  }
})

test('owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化', async () => {
  let statePath
  const fixture = await ownerVerificationFixture({
    shellResult: async () => {
      const state = JSON.parse(await readFile(statePath, 'utf8'))
      // 模拟另一个 task 的 wait receipt 落盘；当前任务、计划和 worktree 都没有变化。
      state.revision = Number(state.revision ?? 0) + 1
      state.supervisorRevision = Number(state.supervisorRevision ?? 0) + 1
      await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      return { kind: 'foreground', ok: true, exitCode: 0, sandbox: { enforcement: 'full' } }
    },
  })
  statePath = fixture.statePath
  try {
    const result = await fixture.runtime.recordBoundVerification({
      task_id: 'T1',
      verification_id: 'unit',
      description: '验证无关 Supervisor 记账不会中断当前固定验证',
    }, fixture.exec)
    assert.equal(result.passed, true)
    assert.equal(result.exitCode, 0)
  } finally {
    await fixture.cleanup()
  }
})

test('owner_verify 执行固定验证前必须确认 shell 为 workspace-write', async () => {
  const fixture = await ownerVerificationFixture()
  fixture.runtime.ctx.shell.sandboxMode = 'read-only'
  try {
    await assert.rejects(
      fixture.runtime.recordBoundVerification({
        task_id: 'T1',
        verification_id: 'unit',
        description: '拒绝非 workspace-write 的固定验证',
      }, fixture.exec),
      /workspace-write|沙箱模式/u,
    )
    assert.equal(fixture.calls.length, 0)
  } finally {
    await fixture.cleanup()
  }
})

test('owner_verify 对宿主失败证据持久化负面结果并拒绝通过', async () => {
  const failures = [
    { kind: 'foreground', ok: false, exitCode: 0, sandbox: { enforcement: 'full' } },
    { kind: 'foreground', ok: true, timedOut: true, exitCode: 0, sandbox: { enforcement: 'full' } },
    { kind: 'foreground', ok: true, aborted: true, exitCode: 0, sandbox: { enforcement: 'full' } },
    { kind: 'background', ok: true, exitCode: 0, sandbox: { enforcement: 'full' } },
  ]
  for (const failure of failures) {
    const fixture = await ownerVerificationFixture({ shellResult: failure })
    try {
      await assert.rejects(
        fixture.runtime.recordBoundVerification({
          task_id: 'T1',
          verification_id: 'unit',
          description: '记录宿主失败证据并拒绝伪造通过',
        }, fixture.exec),
        /宿主|失败|超时|中止|后台|passed/u,
      )
      const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
      const result = state.tasks[0].verificationResults.unit
      assert.equal(result.passed, false)
      const log = (await readFile(join(fixture.root, '.dsh-workflow', 'logs', 'wf-owner-verification.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
      assert.equal(log.at(-1).passed, false)
    } finally {
      await fixture.cleanup()
    }
  }
})

test.skip('旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试）', async () => {
  const root = await createRepository('dsh-owner-security-files-')
  await mkdir(join(root, 'src', 'owned'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'src', 'owned', 'value.ts'), 'const size = 14\n', 'utf8')
  await writeFile(join(root, 'docs', 'readme.md'), '可读取的其他区域\n', 'utf8')
  await git(root, ['add', 'src/owned/value.ts', 'docs/readme.md'])
  await git(root, ['commit', '-m', '准备 Owner 文件边界测试'])
  const ownerWorktree = join(root, '.owner-security-worktree')
  await git(root, ['worktree', 'add', '-b', 'dsh/security-owner-files', ownerWorktree, 'main'])
  const fs = fakeFileSystem()
  const runtime = createOwnerWorkflowRuntime({ fs, sandboxPolicy: {} }, {})
  const sessionId = 'security-file-session'
  const active = {
    ...activeOwner(sessionId, ownerWorktree),
    workflowRoot: root,
    workflowId: 'wf-security-files',
  }
  runtime.activeOwners.set(sessionId, active)
  await runtime.prepareRoot(root)
  const exec = { agent: ownerAgent(sessionId, ownerWorktree), signal: undefined }
  try {
    const writeResult = await runtime.ownerWrite({
      file_path: 'src/owned/value.ts',
      content: 'const size = 15\n',
      description: '把字体大小临时调整为 15',
    }, exec)
    assert.equal(writeResult.path, 'src/owned/value.ts')
    assert.equal((await readFile(join(ownerWorktree, 'src', 'owned', 'value.ts'), 'utf8')), 'const size = 15\n')

    const editResult = await runtime.ownerEdit({
      file_path: 'src/owned/value.ts',
      old_string: '15',
      new_string: '16',
      description: '把字体大小调整为 16',
    }, exec)
    assert.equal(editResult.path, 'src/owned/value.ts')
    assert.equal((await readFile(join(ownerWorktree, 'src', 'owned', 'value.ts'), 'utf8')), 'const size = 16\n')

    assert.equal(
      runtime.checkToolExecution({
        agent: ownerAgent(sessionId, ownerWorktree),
        name: 'read',
        arguments: { file_path: join(root, 'docs', 'readme.md') },
      }),
      undefined,
    )
    await assert.rejects(
      runtime.ownerWrite({
        file_path: 'docs/readme.md',
        content: '禁止写入其他区域\n',
        description: '越界写入测试',
      }, exec),
      /scope|不能修改/u,
    )
    await assert.rejects(
      runtime.ownerEdit({
        file_path: join(root, 'docs', 'readme.md'),
        old_string: '可读取',
        new_string: '禁止修改',
        description: '越界编辑测试',
      }, exec),
      /scope|不能修改|worktree|链接/u,
    )
    assert.equal((await readFile(join(root, 'docs', 'readme.md'), 'utf8')), '可读取的其他区域\n')
    assert.equal((await readFile(join(ownerWorktree, 'docs', 'readme.md'), 'utf8')), '可读取的其他区域\n')
    assert.deepEqual(await statusRecords(ownerWorktree), [{ code: ' M', path: 'src/owned/value.ts' }])
  } finally {
    await runtime.dispose()
    await git(root, ['worktree', 'remove', '--force', ownerWorktree]).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场）', async () => {
  const root = await createRepository('dsh-owner-security-links-')
  await mkdir(join(root, 'src', 'owned'), { recursive: true })
  await mkdir(join(root, 'src', 'outside'), { recursive: true })
  await writeFile(join(root, 'src', 'outside', 'real.ts'), '真实文件\n', 'utf8')
  await symlink('../outside', join(root, 'src', 'owned', 'link'))
  await link(join(root, 'src', 'outside', 'real.ts'), join(root, 'src', 'owned', 'hard.ts'))
  const runtime = createOwnerWorkflowRuntime({ fs: fakeFileSystem(), sandboxPolicy: {} }, {})
  const sessionId = 'security-link-session'
  runtime.activeOwners.set(sessionId, activeOwner(sessionId, root))
  const exec = { agent: ownerAgent(sessionId, root), signal: undefined }
  try {
    await assert.rejects(
      runtime.ownerWrite({
        file_path: 'src/owned/link/new.ts',
        content: '禁止经过符号链接祖先\n',
        description: '符号链接祖先测试',
      }, exec),
      /链接|越过 worktree/u,
    )
    await assert.rejects(
      runtime.ownerEdit({
        file_path: 'src/owned/hard.ts',
        old_string: '真实文件',
        new_string: '禁止修改硬链接',
        description: '硬链接目标测试',
      }, exec),
      /链接|越过 worktree/u,
    )
    assert.equal((await readFile(join(root, 'src', 'outside', 'real.ts'), 'utf8')), '真实文件\n')
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖）', async () => {
  const root = await createRepository('dsh-owner-memory-protected-')
  const runtime = createOwnerWorkflowRuntime({ fs: fakeFileSystem(), sandboxPolicy: {} }, {})
  const sessionId = 'memory-protected-owner'
  runtime.activeOwners.set(sessionId, {
    ...activeOwner(sessionId, root),
    owner: { ...ownerDefinition(), scope: ['**'] },
  })
  try {
    await assert.rejects(runtime.ownerWrite({
      file_path: '.owner-workflow/owners/security-owner/memory/index.md',
      content: '禁止 Owner 直接改写长期记忆\n',
      description: '尝试绕过记忆整理流程',
    }, { agent: ownerAgent(sessionId, root), signal: undefined }), /受保护路径/u)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖）', async () => {
  const root = await createRepository('dsh-owner-registry-protected-')
  const runtime = createOwnerWorkflowRuntime({ fs: fakeFileSystem(), sandboxPolicy: {} }, {})
  const sessionId = 'registry-protected-owner'
  runtime.activeOwners.set(sessionId, {
    ...activeOwner(sessionId, root),
    owner: { ...ownerDefinition(), scope: ['**'] },
  })
  try {
    await assert.rejects(runtime.ownerWrite({
      file_path: '.owner-workflow/owners/x/owner.md',
      content: '禁止 Owner 直接改写正式 Owner Registry\n',
      description: '尝试绕过 Owner Registry 提案审批',
    }, { agent: ownerAgent(sessionId, root), signal: undefined }), /受保护路径/u)
    await assert.rejects(runtime.ownerEdit({
      file_path: '.owner-workflow/owners/x/owner.md',
      old_string: '旧内容',
      new_string: '禁止修改',
      description: '尝试通过编辑绕过 Owner Registry 提案审批',
    }, { agent: ownerAgent(sessionId, root), signal: undefined }), /受保护路径/u)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖）', async () => {
  const root = await createRepository('dsh-owner-registry-case-alias-')
  await writeFile(join(root, 'ordinary-Case.txt'), '普通大小写文件\n', 'utf8')
  const runtime = createOwnerWorkflowRuntime({ fs: fakeFileSystem(), sandboxPolicy: {} }, {})
  const sessionId = 'registry-case-alias-owner'
  runtime.activeOwners.set(sessionId, {
    ...activeOwner(sessionId, root),
    owner: { ...ownerDefinition(), scope: ['**'] },
  })
  const exec = { agent: ownerAgent(sessionId, root), signal: undefined }
  try {
    await assert.rejects(runtime.ownerWrite({
      file_path: '.OWNER-WORKFLOW/config.json',
      content: '禁止大小写别名写入\n',
      description: '尝试通过大小写别名写入 Owner Registry',
    }, exec), /受保护路径/u)
    await assert.rejects(runtime.ownerEdit({
      file_path: '.OwNeR-WoRkFlOw/config.json',
      old_string: '旧内容',
      new_string: '禁止大小写别名编辑',
      description: '尝试通过大小写别名编辑 Owner Registry',
    }, exec), /受保护路径/u)

    const ordinaryWrite = await runtime.ownerWrite({
      file_path: 'ordinary-Case.txt',
      content: '普通大小写文件已写入\n',
      description: '验证普通大小写文件不受保护路径折叠影响',
    }, exec)
    assert.equal(ordinaryWrite.path, 'ordinary-Case.txt')
    assert.equal(await readFile(join(root, 'ordinary-Case.txt'), 'utf8'), '普通大小写文件已写入\n')
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名', async () => {
  const root = await createRepository('dsh-owner-registry-case-commit-')
  const protectedFile = '.OWNER-WORKFLOW/config.json'
  await mkdir(join(root, '.OWNER-WORKFLOW'), { recursive: true })
  await writeFile(join(root, protectedFile), '禁止直接提交 Registry 大小写别名\n', 'utf8')
  const baseCommit = await head(root)
  const runtime = createOwnerWorkflowRuntime({}, {})
  const owner = { ...ownerDefinition(), scope: ['**'] }
  const entry = {
    owner,
    branch: 'main',
    worktree: root,
    baseCommit,
  }
  const report = ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '尝试提交受保护 Registry 大小写别名',
    changes: [{ summary: '修改正式 Registry 大小写别名', files: [protectedFile], tests: [] }],
    tests: [],
    handoffs: [],
  })
  try {
    const inspection = await runtime.inspectOwnerAttempt(
      { root },
      entry,
      report,
      undefined,
    )
    assert.deepEqual(inspection.protectedFiles, [protectedFile])
    assert.match(inspection.violations.join('；'), /受保护路径/u)
    await assert.rejects(
      runtime.commitOwnerAttempt(
        {},
        { id: 'stage-security', name: '提交安全阶段' },
        entry,
        {
          files: [protectedFile],
          ignoredFiles: [],
          ahead: 0,
          dirtyFiles: [protectedFile],
        },
        undefined,
      ),
      /提交越过边界|二次边界校验失败/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner scope 过宽时提交检查拒绝 .owner-workflow 路径', async () => {
  const root = await createRepository('dsh-owner-registry-commit-protected-')
  const protectedFile = '.owner-workflow/owners/x/owner.md'
  await mkdir(join(root, '.owner-workflow', 'owners', 'x'), { recursive: true })
  await writeFile(join(root, protectedFile), '禁止直接提交 Registry\n', 'utf8')
  const baseCommit = await head(root)
  const runtime = createOwnerWorkflowRuntime({}, {})
  const owner = { ...ownerDefinition(), scope: ['**'] }
  const entry = {
    owner,
    branch: 'main',
    worktree: root,
    baseCommit,
  }
  const report = ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '尝试提交受保护 Registry 文件',
    changes: [{ summary: '修改正式 Registry', files: [protectedFile], tests: [] }],
    tests: [],
    handoffs: [],
  })
  try {
    const inspection = await runtime.inspectOwnerAttempt(
      { root },
      entry,
      report,
      undefined,
    )
    assert.deepEqual(inspection.protectedFiles, [protectedFile])
    assert.match(inspection.violations.join('；'), /受保护路径/u)
    await assert.rejects(
      runtime.commitOwnerAttempt(
        {},
        { id: 'stage-security', name: '提交安全阶段' },
        entry,
        {
          files: [protectedFile],
          ignoredFiles: [],
          ahead: 0,
          dirtyFiles: [protectedFile],
        },
        undefined,
      ),
      /提交越过边界|二次边界校验失败/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell）', async () => {
  const root = await createRepository('dsh-owner-security-shell-')
  const calls = []
  const runtime = createOwnerWorkflowRuntime({
    shell: fakeShell('full', calls),
    sandbox: {},
    sandboxPolicy: {},
  }, {})
  const sessionId = 'security-shell-session'
  runtime.activeOwners.set(sessionId, activeOwner(sessionId, root))
  const exec = { agent: ownerAgent(sessionId, root), signal: undefined }
  try {
    const rejectedCommands = [
      'git push origin HEAD',
      'git fetch origin',
      'git pull --rebase',
      'git merge feature',
      'git update-ref refs/heads/main HEAD',
      'git add src/owned/value.ts',
      'git commit -m 禁止提交',
      './deploy.sh',
      'npm publish',
      'pnpm deploy',
      'curl https://example.invalid',
      'wget https://example.invalid/file',
      'ssh example.invalid',
      'git status; touch src/owned/value.ts',
      'printf x > src/owned/value.ts',
      'bash -c "cat README.md"',
    ]
    for (const command of rejectedCommands) {
      assert.match(
        ownerExecution(runtime, sessionId, root, 'owner_bash', { command }),
        /拒绝|只允许|不得/u,
        `命令 ${command} 必须被工具守卫拒绝`,
      )
      await assert.rejects(
        runtime.runOwnerShell({ command, description: '安全拒绝测试' }, exec),
        /拒绝|只允许|不得/u,
        `命令 ${command} 必须被运行时拒绝`,
      )
    }

    for (const command of ['git status --short', 'git diff -- README.md', 'git log -1', 'npm run test', 'pnpm run build', 'cargo test']) {
      assert.equal(ownerExecution(runtime, sessionId, root, 'owner_bash', { command }), undefined, `命令 ${command} 应被允许`)
    }
    const result = await runtime.runOwnerShell({ command: 'git status --short', description: '读取工作树状态' }, exec)
    assert.equal(result.sandbox.enforcement, 'full')
    assert.notEqual(calls[0].workdir, root)
    assert.match(calls[0].workdir, /dsh-owner-shell-security-owner-[^/]+\/workspace$/u)
    assert.equal(calls[0].sandboxPolicy.mode, 'workspace-write')
    assert.equal(calls[0].sandboxPolicy.workspaceRoot, calls[0].workdir)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 owner_bash 沙箱测试（固定验证仍保留快照证据）', async () => {
  const root = await createRepository('dsh-owner-security-enforcement-')
  const runtime = createOwnerWorkflowRuntime({
    shell: fakeShell('partial'),
    sandbox: {},
    sandboxPolicy: {},
  }, {})
  const sessionId = 'security-enforcement-session'
  runtime.activeOwners.set(sessionId, activeOwner(sessionId, root))
  try {
    await assert.rejects(
      runtime.runOwnerShell(
        { command: 'git status', description: '检查部分沙箱执行结果' },
        { agent: ownerAgent(sessionId, root), signal: undefined },
      ),
      /full enforcement|partial/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree）', async () => {
  const root = await createRepository('dsh-owner-shell-isolated-git-')
  const originalHead = await head(root)
  const runtime = createOwnerWorkflowRuntime({
    fs: fakeFileSystem(),
    shell: {
      sandboxMode: 'workspace-write',
      resolve(spec) { return spec },
      async run(spec) {
        await git(spec.workdir, ['config', 'user.email', 'snapshot@test.invalid'])
        await git(spec.workdir, ['config', 'user.name', 'Snapshot Test'])
        await git(spec.workdir, ['commit', '--allow-empty', '-m', '一次性副本提交'])
        return { kind: 'foreground', ok: true, exitCode: 0, sandbox: { enforcement: 'full' } }
      },
    },
    sandbox: {},
    sandboxPolicy: {},
  }, {})
  try {
    const owner = ownerDefinition()
    runtime.activeOwners.set('isolated-shell-owner', {
      owner,
      worktree: root,
      workflowRoot: root,
      workflowId: 'wf-isolated-shell',
      stageId: 'stage-1',
      ownerKey: 'wf-isolated-shell:security-owner',
    })
    await runtime.runOwnerShell(
      { command: 'npm run test', description: '验证项目测试脚本的 Git 隔离' },
      { agent: { id: 'isolated-shell-owner', session: { id: 'isolated-shell-owner' } }, signal: new AbortController().signal },
    )
    assert.equal(await head(root), originalHead)
    assert.equal(await readFile(join(root, 'README.md'), 'utf8'), '安全测试仓库\n')
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff）', async () => {
  const root = await createRepository('dsh-owner-security-log-')
  await mkdir(join(root, 'src', 'owned'), { recursive: true })
  const file = join(root, 'src', 'owned', 'font.ts')
  await writeFile(file, 'const fontSize = 14\n', 'utf8')
  await git(root, ['add', 'src/owned/font.ts'])
  await git(root, ['commit', '-m', '添加字体测试文件'])
  const runtime = createOwnerWorkflowRuntime({ fs: fakeFileSystem(), sandboxPolicy: {} }, {})
  const sessionId = 'security-log-session'
  const active = activeOwner(sessionId, root, 'wf-security-log')
  runtime.activeOwners.set(sessionId, active)
  await runtime.prepareRoot(root)
  const exec = { agent: ownerAgent(sessionId, root), signal: undefined }
  const report = ownerResult({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: '最终文件恢复为 14',
    changes: [],
    tests: [],
    handoffs: [],
  }, '日志测试')
  const baseCommit = await head(root)
  try {
    await runtime.ownerEdit({
      file_path: 'src/owned/font.ts',
      old_string: '14',
      new_string: '16',
      description: '把字体大小从 14 调整为 16',
    }, exec)
    await runtime.ownerEdit({
      file_path: 'src/owned/font.ts',
      old_string: '16',
      new_string: '14',
      description: '把字体大小从 16 恢复为 14',
    }, exec)
    assert.equal(await readFile(file, 'utf8'), 'const fontSize = 14\n')

    const inspection = await runtime.inspectOwnerAttempt(
      {
        root,
        workflowBranch: 'main',
      },
      {
        owner: ownerDefinition(),
        branch: 'main',
        worktree: root,
        baseCommit,
      },
      report,
      undefined,
      active,
    )
    assert.deepEqual(inspection.files, [])
    assert.deepEqual(inspection.missingReportFiles, ['src/owned/font.ts'])
    assert.match(inspection.violations.join('\n'), /没有覆盖实际操作或修改文件/u)

    const log = (await readFile(join(root, '.dsh-workflow', 'logs', 'wf-security-log.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const operations = log.filter(item => item.event === 'owner.edit')
    assert.equal(operations.length, 2)
    assert.deepEqual(operations.map(item => [item.before, item.after]), [
      ['const fontSize = 14\n', 'const fontSize = 16\n'],
      ['const fontSize = 16\n', 'const fontSize = 14\n'],
    ])
    assert.deepEqual(operations.map(item => item.summary), [
      '把字体大小从 14 调整为 16',
      '把字体大小从 16 恢复为 14',
    ])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围', async () => {
  const root = await createRepository('dsh-owner-security-commit-')
  const hookDirectory = join(root, '.githooks')
  const marker = join(root, 'hook-ran.txt')
  await mkdir(hookDirectory, { recursive: true })
  const hook = join(hookDirectory, 'pre-commit')
  await writeFile(hook, `#!/bin/sh\nprintf 'hook 不应执行\\n' > '${marker}'\n`, 'utf8')
  await chmod(hook, 0o755)
  await git(root, ['config', 'core.hooksPath', '.githooks'])
  await git(root, ['-c', 'core.hooksPath=/dev/null', 'add', '.githooks/pre-commit'])
  await git(root, ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', '准备禁用 hook 的测试基线'])
  await mkdir(join(root, 'src', 'owned'), { recursive: true })
  await writeFile(join(root, 'src', 'owned', 'allowed.ts'), 'export const allowed = true\n', 'utf8')
  const commitResult = await commitFiles(root, ['src/owned/allowed.ts'], '运行时安全提交')
  assert.equal(commitResult.committed, true)
  await assert.rejects(readFile(marker, 'utf8'), { code: 'ENOENT' })

  const baseCommit = await head(root)
  await writeFile(join(root, 'outside.ts'), 'export const outside = true\n', 'utf8')
  await git(root, ['add', 'outside.ts'])
  await git(root, ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', '制造提交后越界校验场景'])
  await writeFile(join(root, 'src', 'owned', 'next.ts'), 'export const next = true\n', 'utf8')
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await assert.rejects(
      runtime.commitOwnerAttempt(
        {},
        { id: 'stage-security', name: '提交安全阶段' },
        {
          owner: ownerDefinition(),
          branch: 'main',
          worktree: root,
          baseCommit,
        },
        {
          files: ['src/owned/next.ts'],
          ignoredFiles: [],
          ahead: 1,
          dirtyFiles: ['src/owned/next.ts'],
        },
        undefined,
      ),
      /提交代理越界|二次校验失败|outside/u,
    )
    assert.equal((await readFile(join(root, 'outside.ts'), 'utf8')), 'export const outside = true\n')
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算', async () => {
  const root = await createRepository('dsh-owner-ignored-file-')
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await mkdir(join(root, 'src', 'owned'), { recursive: true })
    await writeFile(join(root, '.gitignore'), 'src/owned/ignored.txt\n', 'utf8')
    await git(root, ['add', '.gitignore'])
    await git(root, ['commit', '-m', '登记忽略文件规则'])
    const baseCommit = await head(root)
    await writeFile(join(root, 'src', 'owned', 'ignored.txt'), '不能静默丢弃\n', 'utf8')
    const owner = ownerDefinition()
    const report = ownerResult({
      contract: 'DSH_OWNER_RESULT_V1',
      status: 'completed',
      summary: '尝试交付忽略文件',
      changes: [{ summary: '写入忽略文件', files: ['src/owned/ignored.txt'], tests: [] }],
      tests: [],
      handoffs: [],
    })
    const inspection = await runtime.inspectOwnerAttempt(
      { root, id: 'wf-ignored' },
      { owner, worktree: root, branch: 'main', baseCommit },
      report,
      undefined,
      { operationFiles: new Set(['src/owned/ignored.txt']) },
    )
    assert.deepEqual(inspection.files, [])
    assert.deepEqual(inspection.violations, [])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
