import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'

const execFileAsync = promisify(execFile)

async function operationFixture({ git = true, runtimeConfig = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-operation-runtime-'))
  if (git) await execFileAsync('git', ['init', '-b', 'main'], { cwd: root })
  const calls = {
    starts: [],
    reports: [],
    followups: [],
    interrupts: [],
    drains: [],
    shells: [],
    approvals: [],
    questions: [],
    reviewerStarts: [],
    reviewerDisposals: 0,
    reviewerDecision: 'allow',
    approvalSettings: undefined,
    archives: [],
    approvalOutcome: 'allowed-once',
    questionSelection: '仅允许这一次',
    questionCustom: '',
    questionError: undefined,
    shellDenied: false,
    shellExitCode: 0,
  }
  const subagents = {
    async start(provider, spec) {
      calls.reviewerStarts.push({ provider, spec })
      return {
        result: Promise.resolve({
          stopReason: 'completed',
          structured: { decision: calls.reviewerDecision },
        }),
        async dispose() { calls.reviewerDisposals += 1 },
      }
    },
    async startContinuable(spec) {
      calls.starts.push(spec)
      return { childId: spec.childId, messageId: 'initial-message' }
    },
    async reportFrom(child, content, options) {
      calls.reports.push({ child, content, options })
      return `report-${calls.reports.length}`
    },
    async followup(parent, childId, content, options) {
      calls.followups.push({ parent, childId, content, options })
      return `followup-${calls.followups.length}`
    },
    interrupt(childId, authority) { calls.interrupts.push({ childId, authority }) },
    async drainContinuableChildren(parent, childIds) { calls.drains.push({ parent, childIds }) },
    async drainContinuableDescendants() {},
  }
  const shell = {
    resolve(spec) { return spec },
    async run(spec) {
      calls.shells.push(spec)
      return {
        exitCode: calls.shellExitCode,
        signal: null,
        timedOut: false,
        aborted: false,
        timeoutMs: spec.timeoutMs ?? 30_000,
        stdout: { text: 'diagnostic output', truncated: false },
        stderr: { text: '', truncated: false },
        sandbox: {
          mode: spec.sandboxPolicy.mode,
          denied: calls.shellDenied && spec.sandboxPolicy.mode === 'read-only',
          enforcement: spec.sandboxPolicy.mode === 'read-only' ? 'full' : 'none',
        },
      }
    },
  }
  const approval = {
    async request(request) {
      calls.approvals.push(request)
      return calls.approvalOutcome
    },
  }
  const workspaceRegistry = {
    async archiveSession(sessionId) { calls.archives.push(sessionId) },
  }
  const userQuestions = {
    async ask(request) {
      calls.questions.push(request)
      if (calls.questionError !== undefined) throw calls.questionError
      return {
        answers: [{
          id: request.questions[0].id,
          selected: calls.questionCustom === '' ? [calls.questionSelection] : [],
          ...(calls.questionCustom === '' ? {} : { custom: calls.questionCustom }),
        }],
      }
    },
  }
  const settings = {
    get(namespace) {
      if (namespace !== 'approve-for-me') return undefined
      return calls.approvalSettings
    },
  }
  const ctx = {
    subagents,
    shell,
    sandbox: {},
    approval,
    workspaceRegistry,
    userQuestions,
    settings,
    get(name) {
      if (name === 'approval') return approval
      if (name === 'workspaceRegistry') return workspaceRegistry
      if (name === 'userQuestions') return userQuestions
      if (name === 'settings') return settings
      return undefined
    },
  }
  const runtime = createOwnerWorkflowRuntime(ctx, { operationAgentModel: 'low-cost-model', ...runtimeConfig })
  const toolNames = [
    'read',
    'grep',
    'glob',
    'workflow_git_inspect',
    'operation_report',
    'operation_exec',
    'web_search',
    'web_fetch',
    'skill',
  ]
  const parent = {
    id: 'main-session',
    options: { provider: 'test-provider', model: 'main-model' },
    session: { id: 'main-session', header: { id: 'main-session', cwd: root } },
    ctx: {
      tools: { schemas: () => toolNames.map(name => ({ name })) },
      get(name) {
        if (name === 'agentPresets') return { composedPreset: () => 'owner-workflow' }
        return undefined
      },
    },
  }
  return {
    root,
    runtime,
    parent,
    calls,
    async dispose() {
      await runtime.dispose()
      await rm(root, { recursive: true, force: true })
    },
  }
}

async function waitUntil(check, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => globalThis.setTimeout(resolve, 10))
  }
  throw new Error('等待测试条件超时')
}

function operationSpec() {
  return {
    goal: '使用 ADB 诊断当前 Android VPN',
    context: ['当前只分析 Android'],
    constraints: ['不修改项目文件', '不停止 VPN', '不切换网络'],
    successCriteria: ['返回设备、VPN、网络和日志证据'],
    capabilities: ['project-read', 'shell'],
  }
}

function approveForMeSettings({ mode = 'rules-only', prefixes = ['git status'] } = {}) {
  return {
    version: 1,
    mode,
    rules: {
      commandPrefixes: prefixes.map(prefix => ({ tool: process.platform === 'win32' ? 'pwsh' : 'shell', prefix })),
      reviewerInstructions: '只允许与当前 Operation 目标一致的低风险诊断命令。',
    },
    reviewer: { timeoutMs: 30_000 },
    limits: {
      trustedTranscriptChars: 12_000,
      untrustedToolDataChars: 8_000,
      reviewerOutputChars: 2_000,
    },
  }
}

test('主代理启动低成本后台 Operator，继承工具并用 read-only 文件沙箱', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    assert.equal(started.status, 'running')
    assert.match(started.nextAction, /不要.*operation_status|等待 operation_report/u)
    assert.equal(fixture.calls.starts.length, 1)
    const request = fixture.calls.starts[0].request
    assert.equal(request.agentOptions.model, 'low-cost-model')
    assert.equal(request.agentOptions.provider, 'test-provider')
    assert.equal(Object.hasOwn(request, 'toolFilter'), false)
    assert.match(request.persona, /Operation Operator/u)
    assert.match(request.prompt[0].text, /用户只与主代理沟通/u)
    const sandboxEvents = []
    const childId = fixture.calls.starts[0].childId
    const child = {
      id: childId,
      session: { id: childId, append: (type, data) => sandboxEvents.push({ type, data }) },
    }
    fixture.runtime.setupContinuableChild({ agent: child, systemPrompt: { section() {} } })
    assert.deepEqual(sandboxEvents, [
      { type: 'sandbox/mode', data: { mode: 'read-only' } },
      { type: 'approval/policy', data: { policy: 'never', source: 'delegation' } },
    ])
    assert.equal(fixture.runtime.checkToolExecution({ agent: child, name: 'operation_exec' }), undefined)
    assert.equal(fixture.runtime.checkToolExecution({ agent: child, name: 'bash' }), undefined)
    const writeDecision = fixture.runtime.checkFilesystemWrite(
      { displayPath: join(fixture.root, 'README.md') },
      { agent: child },
      { get: () => undefined },
    )
    assert.equal(writeDecision.kind, 'deny')
    assert.match(writeDecision.reason, /operator 子代理.*只读/u)
    await assert.rejects(
      fixture.runtime.operationStatus(fixture.parent, 'op-shortened'),
      error => /不存在或状态不可读/u.test(error.message) && !error.message.includes(fixture.root),
    )
  } finally {
    await fixture.dispose()
  }
})

test('Operation 在非 Git 工作区直接以当前目录持久化状态', async () => {
  const fixture = await operationFixture({ git: false })
  try {
    const agent = {
      ...fixture.parent,
      id: 'manual-session',
      session: {
        ...fixture.parent.session,
        id: 'manual-session',
        header: { ...fixture.parent.session.header, id: 'manual-session' },
      },
      ctx: {
        ...fixture.parent.ctx,
        get(name) {
          if (name === 'agentPresets') return { composedPreset: () => 'default' }
          return undefined
        },
      },
    }
    const enabled = await fixture.runtime.modeEnable(agent)
    assert.equal(enabled.root, fixture.root)
    const started = await fixture.runtime.startOperation(agent, operationSpec())
    assert.equal(started.status, 'running')
    assert.equal(fixture.runtime.actorRoot({ agent }), fixture.root)
    await access(join(fixture.root, '.dsh-workflow', 'operations'))
    await assert.rejects(access(join(fixture.root, '.dsh-workflow', 'worktrees')))
    const status = await fixture.runtime.operationStatus(agent, started.operationId)
    assert.equal(status.operationId, started.operationId)
  } finally {
    await fixture.dispose()
  }
})

test('同一项目同一时间只启动一个 Operation，终态回收后才允许下一个', async () => {
  const fixture = await operationFixture()
  try {
    const first = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const repeated = await fixture.runtime.startOperation(fixture.parent, {
      ...operationSpec(),
      goal: '不应启动的第二个 Operation',
    })
    const otherParent = {
      ...fixture.parent,
      id: 'other-main-session',
      session: {
        ...fixture.parent.session,
        id: 'other-main-session',
        header: { ...fixture.parent.session.header, id: 'other-main-session' },
      },
    }
    const crossSession = await fixture.runtime.startOperation(otherParent, operationSpec())
    assert.equal(first.started, true)
    assert.equal(repeated.started, false)
    assert.equal(repeated.reused, true)
    assert.equal(repeated.operationId, first.operationId)
    assert.equal(crossSession.started, false)
    assert.equal(crossSession.reused, false)
    assert.equal(fixture.calls.starts.length, 1)

    const cancelled = await fixture.runtime.cancelOperation(fixture.parent, first.operationId)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(cancelled.childRecycled, true)
    assert.equal(cancelled.childArchived, true)
    assert.equal(fixture.calls.drains.length, 1)
    assert.deepEqual(fixture.calls.archives, [fixture.calls.starts[0].childId])

    const next = await fixture.runtime.startOperation(fixture.parent, {
      ...operationSpec(),
      goal: '回收后允许启动的新 Operation',
    })
    assert.equal(next.started, true)
    assert.notEqual(next.operationId, first.operationId)
    assert.equal(fixture.calls.starts.length, 2)
  } finally {
    await fixture.dispose()
  }
})

test('Operator 通过主代理补充信息并恢复同一个 continuable 子线程', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const child = { id: childId, session: { id: childId } }
    const report = await fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'need_input',
      summary: '设备尚未授权',
      question: '请确认手机已允许 USB 调试。',
    }, { agent: child, signal: new AbortController().signal })
    assert.equal(report.status, 'waiting_input')
    assert.equal(report.delivered, true)
    assert.equal(fixture.calls.reports[0].options.delivery, 'next-step')

    const continued = await fixture.runtime.continueOperation(
      fixture.parent,
      started.operationId,
      '用户确认已经允许 USB 调试',
      {},
    )
    assert.equal(continued.status, 'running')
    assert.equal(fixture.calls.followups.length, 1)
    assert.equal(fixture.calls.followups[0].childId, childId)
    assert.match(fixture.calls.followups[0].content[0].text, /已经允许 USB 调试/u)
  } finally {
    await fixture.dispose()
  }
})

test('Operation 专用审批插件先复用 approve-for-me 固定风险与白名单，并只允许当前命令一次', async () => {
  const fixture = await operationFixture()
  try {
    fixture.calls.approvalSettings = approveForMeSettings()
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = {
      agent: { id: childId, options: { provider: 'test-provider', model: 'operator-model' }, session: { id: childId } },
      signal: new AbortController().signal,
    }
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'git status --short',
      description: '读取仓库状态用于诊断',
      effect: 'state-changing',
    }, childExec)
    assert.equal(result.exitCode, 0)
    assert.equal(fixture.calls.questions.length, 0)
    assert.equal(fixture.calls.reviewerStarts.length, 0)
    assert.equal(fixture.calls.shells.length, 1)
    assert.equal(fixture.calls.shells[0].sandboxPolicy.mode, 'danger-full-access')
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.events.some(event => event.type === 'operation.command_auto_approved'), true)
  } finally {
    await fixture.dispose()
  }
})

test('Operation 接受结构化 argv 并生成可审计的精确命令', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      argv: ['printf', 'A B'],
      description: '输出带空格的诊断参数',
      effect: 'read-only',
    }, {
      agent: { id: childId, session: { id: childId } },
      signal: new AbortController().signal,
    })

    assert.equal(result.exitCode, 0)
    assert.equal(fixture.calls.shells[0].command, "printf 'A B'")
  } finally {
    await fixture.dispose()
  }
})

test('Operation 的公开资料读取必须改用 web_search/web_fetch，curl 不会被静默放行', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      argv: ['curl', '-L', '--max-time', '20', 'https://raw.githubusercontent.com/reown-com/reown-swift/main/README.md'],
      description: '读取公开 Reown 官方说明',
      effect: 'read-only',
    }, {
      agent: { id: childId, session: { id: childId } },
      signal: new AbortController().signal,
    })

    assert.equal(result.contract, 'DSH_OPERATION_ADJUSTMENT_V1')
    assert.equal(result.code, 'public_web_tool_required')
    assert.match(result.nextAction, /web_search|web_fetch/u)
    assert.equal(fixture.calls.shells.length, 0)
    assert.equal(fixture.calls.questions.length, 0)
  } finally {
    await fixture.dispose()
  }
})

test('等待授权时可原子拒绝当前命令并改向同一 Operator，且不会强制中断或并发普通问询', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = {
      agent: { id: childId, session: { id: childId } },
      signal: new AbortController().signal,
    }
    const waiting = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      argv: ['adb', 'shell', 'svc', 'wifi', 'disable'],
      description: '关闭 Wi-Fi',
      effect: 'state-changing',
    }, childExec)
    await new Promise(resolve => globalThis.setTimeout(resolve, 20))

    assert.equal(waiting.status, 'waiting_approval')
    assert.equal(fixture.calls.interrupts.length, 0)
    assert.match(fixture.runtime.checkToolExecution({
      agent: fixture.parent,
      name: 'ask_user_question',
      arguments: {},
    }), /已有.*授权.*operation_continue/u)

    const redirected = await fixture.runtime.continueOperation(
      fixture.parent,
      started.operationId,
      '停止继续查询 Swift，基于已有证据立即提交报告。',
      { rejectPendingApproval: true },
      new AbortController().signal,
    )
    assert.equal(redirected.status, 'running')
    assert.equal(redirected.pending, null)
    assert.equal(fixture.calls.followups.length, 1)
    assert.equal(fixture.calls.followups[0].childId, childId)
    assert.match(fixture.calls.followups[0].content[0].text, /停止继续查询 Swift/u)
    assert.equal(fixture.runtime.checkToolExecution({
      agent: fixture.parent,
      name: 'ask_user_question',
      arguments: {},
    }), undefined)
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.events.at(-1).type, 'operation.approval_rejected_with_redirect')
  } finally {
    await fixture.dispose()
  }
})

test('Operation 连续命令失败达到预算后不再执行新命令并要求提交已有证据', async () => {
  const fixture = await operationFixture({ runtimeConfig: { maxOperationCommandFailures: 2 } })
  try {
    fixture.calls.shellExitCode = 1
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = {
      agent: { id: childId, session: { id: childId } },
      signal: new AbortController().signal,
    }
    const args = index => ({
      operation_id: started.operationId,
      argv: ['git', 'status', `--short=${index}`],
      description: `第 ${index} 次失败诊断`,
      effect: 'read-only',
    })
    await fixture.runtime.executeOperationCommand(args(1), childExec)
    const second = await fixture.runtime.executeOperationCommand(args(2), childExec)
    const third = await fixture.runtime.executeOperationCommand(args(3), childExec)

    assert.equal(second.commandBudgetExhausted, true)
    assert.equal(third.contract, 'DSH_OPERATION_COMMAND_BUDGET_EXHAUSTED_V1')
    assert.equal(fixture.calls.shells.length, 2)
    assert.match(third.nextAction, /已有证据.*operation_report/u)
  } finally {
    await fixture.dispose()
  }
})

test('Operation 达到人工授权请求预算后停止生成新卡片', async () => {
  const fixture = await operationFixture({ runtimeConfig: { maxOperationManualApprovals: 2 } })
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = {
      agent: { id: childId, session: { id: childId } },
      signal: new AbortController().signal,
    }
    const request = async index => fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      argv: ['adb', 'shell', 'svc', 'wifi', index % 2 === 0 ? 'enable' : 'disable'],
      description: `第 ${index} 次副作用请求`,
      effect: 'state-changing',
    }, childExec)

    const first = await request(1)
    await fixture.runtime.continueOperation(
      fixture.parent,
      started.operationId,
      '拒绝并继续检查。',
      { rejectPendingApproval: true },
      new AbortController().signal,
    )
    const second = await request(2)
    await fixture.runtime.continueOperation(
      fixture.parent,
      started.operationId,
      '再次拒绝，基于已有证据收尾。',
      { rejectPendingApproval: true },
      new AbortController().signal,
    )
    const third = await request(3)

    assert.equal(first.status, 'waiting_approval')
    assert.equal(second.status, 'waiting_approval')
    assert.equal(third.contract, 'DSH_OPERATION_COMMAND_BUDGET_EXHAUSTED_V1')
    assert.equal(third.reason, 'manual_approval_limit')
    assert.equal(fixture.calls.reports.length, 2)
    assert.match(third.nextAction, /已有证据.*operation_report/u)
  } finally {
    await fixture.dispose()
  }
})

test('Operation 超过总时长预算后不再启动命令', async () => {
  const fixture = await operationFixture({ runtimeConfig: { maxOperationDurationMs: 1 } })
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    await new Promise(resolve => globalThis.setTimeout(resolve, 5))
    const childId = fixture.calls.starts[0].childId
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      argv: ['git', 'status', '--short'],
      description: '超时后的诊断',
      effect: 'read-only',
    }, {
      agent: { id: childId, session: { id: childId } },
      signal: new AbortController().signal,
    })

    assert.equal(result.contract, 'DSH_OPERATION_COMMAND_BUDGET_EXHAUSTED_V1')
    assert.equal(result.reason, 'duration_limit')
    assert.equal(fixture.calls.shells.length, 0)
    assert.match(result.nextAction, /已有证据.*operation_report/u)
  } finally {
    await fixture.dispose()
  }
})

test('rules-and-llm 使用无工具短生命周期复核子代理，完成后立即回收', async () => {
  const fixture = await operationFixture()
  try {
    fixture.calls.approvalSettings = approveForMeSettings({ mode: 'rules-and-llm' })
    fixture.parent.session.surface = { nodes: [0] }
    fixture.parent.session.events = {
      0: {
        type: 'user/message',
        data: {
          source: { kind: 'user' },
          content: [{ type: 'text', text: '检查仓库当前状态，不做任何修改。' }],
        },
      },
    }
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const child = { id: childId, options: { provider: 'test-provider', model: 'operator-model' }, session: { id: childId } }
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'git status --short',
      description: '读取仓库状态用于诊断',
      effect: 'state-changing',
    }, { agent: child, signal: new AbortController().signal })
    assert.equal(result.exitCode, 0)
    assert.equal(fixture.calls.reviewerStarts.length, 1)
    assert.equal(fixture.calls.reviewerStarts[0].provider, 'spawn')
    assert.equal(fixture.calls.reviewerStarts[0].spec.parent, child)
    assert.deepEqual(fixture.calls.reviewerStarts[0].spec.toolFilter, { allow: [] })
    assert.equal(fixture.calls.reviewerStarts[0].spec.agentOptions.model, 'operator-model')
    assert.match(fixture.calls.reviewerStarts[0].spec.prompt[0].text, /检查仓库当前状态/u)
    assert.equal(fixture.calls.reviewerDisposals, 1)
    assert.equal(fixture.calls.questions.length, 0)
  } finally {
    await fixture.dispose()
  }
})

test('固定高风险命令不能被 approve-for-me 白名单或模型越权，仍回到主线程问询', async () => {
  const fixture = await operationFixture()
  try {
    fixture.calls.approvalSettings = approveForMeSettings({
      mode: 'rules-and-llm',
      prefixes: ['adb shell input'],
    })
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const waiting = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell input tap 720 596',
      description: '点击设备确认按钮',
      effect: 'state-changing',
    }, {
      agent: { id: childId, options: { provider: 'test-provider', model: 'operator-model' }, session: { id: childId } },
      signal: new AbortController().signal,
    })
    assert.equal(waiting.status, 'waiting_approval')
    assert.equal(fixture.calls.reviewerStarts.length, 0)
    assert.equal(fixture.calls.shells.length, 0)
  } finally {
    await fixture.dispose()
  }
})

test('只读沙箱阻塞后才触发自动审批，并用同一精确命令升级重试一次', async () => {
  const fixture = await operationFixture()
  try {
    fixture.calls.approvalSettings = approveForMeSettings()
    fixture.calls.shellDenied = true
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'git status --short',
      description: '读取仓库状态用于诊断',
      effect: 'read-only',
    }, {
      agent: { id: childId, options: { provider: 'test-provider', model: 'operator-model' }, session: { id: childId } },
      signal: new AbortController().signal,
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(fixture.calls.shells.map(item => item.sandboxPolicy.mode), [
      'read-only',
      'danger-full-access',
    ])
    assert.equal(fixture.calls.questions.length, 0)
    assert.equal(fixture.calls.reports.length, 0)
  } finally {
    await fixture.dispose()
  }
})

test('外部副作用命令必须经过主对话的精确一次性授权', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const child = { id: childId, session: { id: childId } }
    const childExec = { agent: child, signal: new AbortController().signal }

    const request = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '关闭 Wi-Fi 验证网络切换',
      effect: 'read-only',
    }, childExec)
    assert.equal(request.executed, false)
    assert.equal(request.status, 'waiting_approval')
    assert.match(request.approvalId, /^approval-/u)
    assert.match(fixture.calls.reports.at(-1).content[0].text, /operation_approve/u)

    const ignored = await fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'failed',
      summary: '错误地把等待授权解释为审批不可用',
    }, childExec)
    assert.equal(ignored.contract, 'DSH_OPERATION_REPORT_IGNORED_V1')
    assert.equal(ignored.status, 'waiting_approval')
    assert.equal((await fixture.runtime.operationStatus(fixture.parent, started.operationId)).status, 'waiting_approval')

    await assert.rejects(fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      request.approvalId,
      'adb shell svc wifi enable',
      { callId: 'approval-call-mismatch', signal: new AbortController().signal },
    ), /command.*不匹配/u)
    assert.equal(fixture.calls.approvals.length, 0)

    await assert.rejects(fixture.runtime.continueOperation(
      fixture.parent,
      started.operationId,
      '尝试用普通文本直接批准',
      { approvalId: request.approvalId, approved: true },
    ), /只能通过 operation_approve.*原生多选项问询/u)

    const approved = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      request.approvalId,
      'adb shell svc wifi disable',
      { callId: 'approval-call-1', signal: new AbortController().signal },
    )
    assert.equal(approved.approvalOutcome, 'allowed-once')
    assert.equal(fixture.calls.approvals.length, 0)
    assert.equal(fixture.calls.questions.length, 1)
    assert.deepEqual(fixture.calls.questions[0].questions[0].options.map(option => option.label), ['仅允许这一次', '拒绝'])
    assert.match(fixture.calls.questions[0].questions[0].detail, /关闭 Wi-Fi|外部状态/u)
    const stale = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      request.approvalId,
      'adb shell svc wifi disable',
      { callId: 'approval-call-stale', signal: new AbortController().signal },
    )
    assert.equal(stale.approvalOutcome, 'stale')
    assert.equal(stale.applied, false)
    assert.equal(fixture.calls.questions.length, 1)
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '关闭 Wi-Fi 验证网络切换',
      effect: 'state-changing',
      approval_id: request.approvalId,
    }, childExec)
    assert.equal(result.exitCode, 0)
    assert.equal(fixture.calls.shells.length, 1)
    assert.equal(fixture.calls.shells[0].sandboxPolicy.mode, 'danger-full-access')

    const repeated = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '重复使用授权',
      effect: 'state-changing',
      approval_id: request.approvalId,
    }, childExec)
    assert.equal(repeated.contract, 'DSH_OPERATION_ADJUSTMENT_V1')
    assert.equal(repeated.status, 'running')
  } finally {
    await fixture.dispose()
  }
})

test('用户可以在原生问询中按字面前缀放行本次主会话的后续命令', async () => {
  const fixture = await operationFixture()
  try {
    const first = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const firstChildId = fixture.calls.starts[0].childId
    const firstExec = { agent: { id: firstChildId, session: { id: firstChildId } }, signal: new AbortController().signal }
    const prefix = 'adb -s 10AFAU29QR003JA shell input'
    const command = `${prefix} tap 720 596`
    const waiting = await fixture.runtime.executeOperationCommand({
      operation_id: first.operationId,
      command,
      description: '点击设备上的确认按钮',
      effect: 'state-changing',
      approval_prefix: prefix,
    }, firstExec)
    assert.equal(waiting.status, 'waiting_approval')
    assert.equal((await fixture.runtime.operationStatus(fixture.parent, first.operationId)).pending.commandPrefix, prefix)

    fixture.calls.questionSelection = '本次会话允许此前缀'
    const approved = await fixture.runtime.approveOperation(
      fixture.parent,
      first.operationId,
      waiting.approvalId,
      command,
      { callId: 'approval-prefix-session', signal: new AbortController().signal },
    )
    assert.equal(approved.approvalOutcome, 'allowed-session-prefix')
    assert.equal(approved.approvedPrefix, prefix)
    assert.equal(fixture.calls.approvals.length, 0)
    assert.deepEqual(fixture.calls.questions[0].questions[0].options.map(option => option.label), [
      '仅允许这一次',
      '本次会话允许此前缀',
      '拒绝',
    ])

    const firstResult = await fixture.runtime.executeOperationCommand({
      operation_id: first.operationId,
      command,
      description: '执行首次获批点击',
      effect: 'state-changing',
      approval_id: waiting.approvalId,
    }, firstExec)
    const secondResult = await fixture.runtime.executeOperationCommand({
      operation_id: first.operationId,
      command: `${prefix} swipe 720 596 720 300 250`,
      description: '执行同前缀的滑动操作',
      effect: 'state-changing',
    }, firstExec)
    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)
    assert.equal(fixture.calls.shells[0].sandboxPolicy.mode, 'danger-full-access')
    assert.equal(fixture.calls.shells[1].sandboxPolicy.mode, 'danger-full-access')
    assert.equal(fixture.calls.questions.length, 1)

    await fixture.runtime.reportOperation({
      operation_id: first.operationId,
      type: 'completed',
      summary: '第一轮设备操作完成',
      result: { summary: '完成', findings: [], evidence: [], nextActions: [] },
    }, firstExec)
    await waitUntil(() => fixture.calls.drains.length === 1)

    const next = await fixture.runtime.startOperation(fixture.parent, {
      ...operationSpec(),
      goal: '验证同一主会话中的前缀授权仍然有效',
    })
    const nextChildId = fixture.calls.starts[1].childId
    const nextResult = await fixture.runtime.executeOperationCommand({
      operation_id: next.operationId,
      command: `${prefix} tap 100 200`,
      description: '在下一次 Operation 复用会话级前缀授权',
      effect: 'state-changing',
    }, { agent: { id: nextChildId, session: { id: nextChildId } }, signal: new AbortController().signal })
    assert.equal(nextResult.exitCode, 0)
    assert.equal(fixture.calls.questions.length, 1)
    assert.equal(fixture.calls.shells[2].sandboxPolicy.mode, 'danger-full-access')
  } finally {
    await fixture.dispose()
  }
})

test('原生问询的其他输入只接受当前命令的更窄字面前缀', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }
    const command = 'adb shell input tap 720 596'
    const waiting = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command,
      description: '点击设备确认按钮',
      effect: 'state-changing',
    }, childExec)

    fixture.calls.questionCustom = 'adb shell settings put'
    const invalid = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      waiting.approvalId,
      command,
      { callId: 'approval-custom-invalid', signal: new AbortController().signal },
    )
    assert.equal(invalid.approvalOutcome, 'invalid-prefix')
    assert.equal(invalid.status, 'waiting_approval')

    fixture.calls.questionCustom = 'adb shell input'
    const approved = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      waiting.approvalId,
      command,
      { callId: 'approval-custom-valid', signal: new AbortController().signal },
    )
    assert.equal(approved.approvalOutcome, 'allowed-session-prefix')
    assert.equal(approved.approvedPrefix, 'adb shell input')
    assert.equal(fixture.calls.questions.length, 2)
  } finally {
    await fixture.dispose()
  }
})

test('主会话结束后前缀授权和当前命令的持久授权都立即失效', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }
    const prefix = 'adb shell input'
    const command = `${prefix} tap 720 596`
    const waiting = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command,
      description: '点击设备确认按钮',
      effect: 'state-changing',
      approval_prefix: prefix,
    }, childExec)
    fixture.calls.questionSelection = '本次会话允许此前缀'
    await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      waiting.approvalId,
      command,
      { callId: 'approval-prefix-expiry', signal: new AbortController().signal },
    )

    await fixture.runtime.onAgentDisposed(fixture.parent)
    const expired = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command,
      description: '不得在主会话结束后执行',
      effect: 'state-changing',
      approval_id: waiting.approvalId,
    }, childExec)
    assert.equal(expired.contract, 'DSH_OPERATION_ADJUSTMENT_V1')
    assert.equal(expired.code, 'invalid_approval')
    assert.equal(fixture.calls.shells.length, 0)
  } finally {
    await fixture.dispose()
  }
})

test('只读沙箱拒绝宿主诊断时自动通知主线程授权，不产生 Tool Error', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }
    fixture.calls.shellDenied = true
    const waiting = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'lsof -nP -p 97836',
      description: '读取目标进程打开的文件与网络连接',
      effect: 'read-only',
    }, childExec)
    assert.equal(waiting.status, 'waiting_approval')
    assert.equal(waiting.executed, false)
    assert.match(waiting.approvalId, /^approval-/u)
    assert.equal(fixture.calls.shells[0].sandboxPolicy.mode, 'read-only')
    assert.match(fixture.calls.reports.at(-1).content[0].text, /operation_approve/u)

    fixture.calls.shellDenied = false
    await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      waiting.approvalId,
      'lsof -nP -p 97836',
      { callId: 'approval-host-read', signal: new AbortController().signal },
    )
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'lsof -nP -p 97836',
      description: '读取目标进程打开的文件与网络连接',
      effect: 'read-only',
      approval_id: waiting.approvalId,
    }, childExec)
    assert.equal(result.exitCode, 0)
    assert.equal(fixture.calls.shells[1].sandboxPolicy.mode, 'danger-full-access')
  } finally {
    await fixture.dispose()
  }
})

test('原生多选项问询拒绝会被转发给同一个 Operator，而不是留下可执行授权', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const request = await fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'need_approval',
      summary: '请求切换 Wi-Fi',
      question: '是否允许切换？',
      action: '关闭 Wi-Fi',
      risk: '网络会中断',
      proposed_command: 'adb shell svc wifi disable',
    }, { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal })
    fixture.calls.questionSelection = '拒绝'
    const rejected = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      request.approvalId,
      'adb shell svc wifi disable',
      { callId: 'approval-call-rejected', signal: new AbortController().signal },
    )
    assert.equal(rejected.approvalOutcome, 'rejected')
    assert.equal(rejected.status, 'running')
    assert.match(fixture.calls.followups.at(-1).content[0].text, /"approved": false/u)
    const blocked = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '不得执行的拒绝命令',
      effect: 'state-changing',
      approval_id: request.approvalId,
    }, { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal })
    assert.equal(blocked.contract, 'DSH_OPERATION_ADJUSTMENT_V1')
    assert.equal(fixture.calls.shells.length, 0)
  } finally {
    await fixture.dispose()
  }
})

test('原生问询通道不可用时保留等待状态，不得伪造用户拒绝或失败', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }
    const request = await fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'need_approval',
      summary: '请求执行一次真实点击',
      question: '是否允许点击？',
      action: '点击唯一连接按钮',
      risk: '会改变设备网络状态',
      proposed_command: 'adb shell input tap 720 596',
    }, childExec)
    fixture.calls.questionError = new Error('原生问询通道不可用')
    const result = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      request.approvalId,
      'adb shell input tap 720 596',
      { callId: 'approval-call-unavailable', signal: new AbortController().signal },
    )
    assert.equal(result.status, 'waiting_approval')
    assert.equal(result.approvalOutcome, 'unavailable')
    assert.match(result.nextAction, /仍保持等待|不得.*用户拒绝/u)
    assert.equal(fixture.calls.followups.length, 0)
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.pending.id, request.approvalId)
    assert.equal(status.events.at(-1).type, 'operation.approval_unavailable')
  } finally {
    await fixture.dispose()
  }
})

test('多个只读命令必须逐条执行，不能被误转成用户副作用授权', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }
    const command = 'adb devices -l && adb shell dumpsys vpn'
    const adjustment = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command,
      description: '批量读取设备和 VPN 状态',
      effect: 'read-only',
    }, childExec)
    assert.equal(adjustment.contract, 'DSH_OPERATION_ADJUSTMENT_V1')
    assert.equal(adjustment.status, 'running')
    await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb devices -l',
      description: '读取设备列表',
      effect: 'read-only',
    }, childExec)
    await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell dumpsys vpn',
      description: '读取 VPN 状态',
      effect: 'read-only',
    }, childExec)
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.status, 'running')
    assert.equal(status.pending, null)
    assert.equal(fixture.calls.shells.length, 2)
  } finally {
    await fixture.dispose()
  }
})

test('Operator 连续违反命令契约时有界停止并主动回报主线程', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const childExec = { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }
    const args = {
      operation_id: started.operationId,
      command: 'adb devices -l && adb shell dumpsys vpn',
      description: '错误地拼接多个检查',
      effect: 'read-only',
    }
    const first = await fixture.runtime.executeOperationCommand(args, childExec)
    const second = await fixture.runtime.executeOperationCommand(args, childExec)
    assert.equal(first.status, 'running')
    assert.equal(second.status, 'failed')
    assert.equal(second.adjustmentCount, 2)
    assert.match(fixture.calls.reports.at(-1).content[0].text, /连续两次/u)
    await waitUntil(() => fixture.calls.drains.length === 1)
    assert.deepEqual(fixture.calls.drains[0].childIds, [childId])
  } finally {
    await fixture.dispose()
  }
})

test('Operator 完成后结果回到主代理，修改仓库仍由 Owner 流程接管', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const child = { id: childId, session: { id: childId } }
    const completed = await fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'completed',
      summary: 'ADB 只读诊断完成',
      result: {
        summary: 'VPN 服务存活，但底层网络绑定可能已经失效。',
        findings: ['默认网络对象发生变化后 VPN 没有重新绑定。'],
        evidence: ['dumpsys vpn 与 connectivity 的 Network 标识不一致。'],
        nextActions: ['如需修复代码，由主代理创建 Owner 开发 workflow。'],
      },
    }, { agent: child, signal: new AbortController().signal })
    assert.equal(completed.status, 'completed')
    await waitUntil(() => fixture.calls.drains.length === 1)
    await waitUntil(async () => (
      await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    ).childRecycled === true)
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.result.summary, 'VPN 服务存活，但底层网络绑定可能已经失效。')
    assert.equal(status.childRecycled, true)
    assert.equal(status.childArchived, true)
    assert.ok(status.events.some(event => /保留.*审计/u.test(event.summary)))
    assert.match(fixture.calls.reports.at(-1).content[0].text, /Owner 开发工作流/u)
  } finally {
    await fixture.dispose()
  }
})

test('Operator 子线程未报告就结束时 Runtime 不把 Operation 留在伪运行状态', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const child = { id: childId, session: { id: childId } }
    fixture.runtime.onAgentCreated(child)
    await fixture.runtime.onAgentDisposed(child)
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.status, 'failed')
    assert.equal(status.childRecycled, true)
    assert.ok(status.events.some(event => /没有提交/u.test(event.summary)))
  } finally {
    await fixture.dispose()
  }
})
