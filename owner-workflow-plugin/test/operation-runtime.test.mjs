import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'

const execFileAsync = promisify(execFile)

async function operationFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-operation-runtime-'))
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: root })
  const calls = {
    starts: [],
    reports: [],
    followups: [],
    interrupts: [],
    drains: [],
    shells: [],
    approvals: [],
    approvalOutcome: 'allowed-once',
  }
  const subagents = {
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
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        timeoutMs: spec.timeoutMs ?? 30_000,
        stdout: { text: 'diagnostic output', truncated: false },
        stderr: { text: '', truncated: false },
        sandbox: { mode: 'read-only', denied: false, enforcement: 'full' },
      }
    },
  }
  const approval = {
    async request(request) {
      calls.approvals.push(request)
      return calls.approvalOutcome
    },
  }
  const ctx = {
    subagents,
    shell,
    sandbox: {},
    approval,
    get(name) { return name === 'approval' ? approval : undefined },
  }
  const runtime = createOwnerWorkflowRuntime(ctx, { operationAgentModel: 'low-cost-model' })
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

function operationSpec() {
  return {
    goal: '使用 ADB 诊断当前 Android VPN',
    context: ['当前只分析 Android'],
    constraints: ['不修改项目文件', '不停止 VPN', '不切换网络'],
    successCriteria: ['返回设备、VPN、网络和日志证据'],
    capabilities: ['project-read', 'shell'],
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

test('外部副作用命令必须经过主对话的精确一次性授权', async () => {
  const fixture = await operationFixture()
  try {
    const started = await fixture.runtime.startOperation(fixture.parent, operationSpec())
    const childId = fixture.calls.starts[0].childId
    const child = { id: childId, session: { id: childId } }
    const childExec = { agent: child, signal: new AbortController().signal }

    await assert.rejects(fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '关闭 Wi-Fi 验证网络切换',
      effect: 'read-only',
    }, childExec), /need_approval/u)

    const request = await fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'need_approval',
      summary: '需要切换网络验证恢复路径',
      question: '是否允许短暂关闭 Wi-Fi？',
      action: '关闭 Wi-Fi 后重新检查 VPN',
      risk: '手机网络会短暂中断',
      proposed_command: 'adb shell svc wifi disable',
    }, childExec)
    assert.match(request.approvalId, /^approval-/u)
    assert.match(fixture.calls.reports.at(-1).content[0].text, /operation_approve/u)

    await assert.rejects(fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'failed',
      summary: '错误地把等待授权解释为审批不可用',
    }, childExec), /必须停止本轮|等待主代理/u)
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
    ), /只能通过 operation_approve.*原生授权卡片/u)

    const approved = await fixture.runtime.approveOperation(
      fixture.parent,
      started.operationId,
      request.approvalId,
      'adb shell svc wifi disable',
      { callId: 'approval-call-1', signal: new AbortController().signal },
    )
    assert.equal(approved.approvalOutcome, 'allowed-once')
    assert.equal(fixture.calls.approvals.length, 1)
    assert.equal(fixture.calls.approvals[0].agent, fixture.parent)
    assert.equal(fixture.calls.approvals[0].toolName, 'operation_approve')
    assert.equal(fixture.calls.approvals[0].callId, 'approval-call-1')
    assert.match(fixture.calls.approvals[0].reason, /关闭 Wi-Fi|手机网络会短暂中断/u)
    const result = await fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '关闭 Wi-Fi 验证网络切换',
      effect: 'state-changing',
      approval_id: request.approvalId,
    }, childExec)
    assert.equal(result.exitCode, 0)
    assert.equal(fixture.calls.shells.length, 1)
    assert.equal(fixture.calls.shells[0].sandboxPolicy.mode, 'read-only')

    await assert.rejects(fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '重复使用授权',
      effect: 'state-changing',
      approval_id: request.approvalId,
    }, childExec), /一次|授权/u)
  } finally {
    await fixture.dispose()
  }
})

test('原生卡片拒绝会被转发给同一个 Operator，而不是留下可执行授权', async () => {
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
    fixture.calls.approvalOutcome = 'rejected'
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
    await assert.rejects(fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command: 'adb shell svc wifi disable',
      description: '不得执行的拒绝命令',
      effect: 'state-changing',
      approval_id: request.approvalId,
    }, { agent: { id: childId, session: { id: childId } }, signal: new AbortController().signal }), /尚未使用的用户精确授权/u)
  } finally {
    await fixture.dispose()
  }
})

test('原生授权通道不可用时保留等待状态，不得伪造用户拒绝或失败', async () => {
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
    fixture.calls.approvalOutcome = 'unavailable'
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
    await assert.rejects(fixture.runtime.executeOperationCommand({
      operation_id: started.operationId,
      command,
      description: '批量读取设备和 VPN 状态',
      effect: 'read-only',
    }, childExec), /每次只能执行一条|拆分/u)
    await assert.rejects(fixture.runtime.reportOperation({
      operation_id: started.operationId,
      type: 'need_approval',
      summary: '错误地把只读复合命令当作副作用',
      question: '是否授权？',
      action: '读取设备状态',
      risk: '仅只读',
      proposed_command: command,
    }, childExec), /只能包含一条|拆成多次/u)
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.status, 'running')
    assert.equal(status.pending, null)
    assert.equal(fixture.calls.shells.length, 0)
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
    const status = await fixture.runtime.operationStatus(fixture.parent, started.operationId)
    assert.equal(status.result.summary, 'VPN 服务存活，但底层网络绑定可能已经失效。')
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
    assert.match(status.events.at(-1).summary, /没有提交/u)
  } finally {
    await fixture.dispose()
  }
})
