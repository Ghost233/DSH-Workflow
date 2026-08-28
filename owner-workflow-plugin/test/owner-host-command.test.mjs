import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'

async function fixture() {
  const worktree = await mkdtemp(join(tmpdir(), 'dsh-owner-host-command-'))
  await mkdir(join(worktree, 'flutter_app'), { recursive: true })
  const calls = { approvals: [], shells: [], logs: [], outcome: 'allowed-once' }
  const parent = {
    id: 'main-session',
    session: { id: 'main-session', header: { cwd: worktree } },
  }
  const shell = {
    resolve(spec) { return spec },
    async run(spec) {
      calls.shells.push(spec)
      return {
        kind: 'foreground',
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        timeoutMs: spec.timeoutMs ?? 30_000,
        stdout: { text: '测试通过', truncated: false },
        stderr: { text: '', truncated: false },
        sandbox: { mode: 'danger-full-access', denied: false, enforcement: 'none' },
      }
    },
  }
  const approval = {
    async request(request) {
      calls.approvals.push(request)
      return calls.outcome
    },
  }
  const runtime = createOwnerWorkflowRuntime({
    shell,
    approval,
    get(name) {
      if (name === 'shell') return shell
      if (name === 'approval') return approval
      return undefined
    },
  }, {})
  runtime.appendWorkflowLog = async (...args) => { calls.logs.push(args) }
  const active = {
    owner: { id: 'vpn-core' },
    stageId: 'T1',
    worktree,
    workflowRoot: worktree,
    workflowId: 'wf-1',
    parentAgent: parent,
  }
  runtime.activeOwners.set('owner-session', active)
  const exec = {
    agent: { id: 'owner-session', session: { id: 'owner-session', header: { cwd: worktree } } },
    signal: new AbortController().signal,
    callId: 'child-call-id',
  }
  return {
    worktree,
    runtime,
    active,
    parent,
    calls,
    exec,
    async dispose() {
      await runtime.dispose()
      await rm(worktree, { recursive: true, force: true })
    },
  }
}

test('Owner 宿主命令把授权留在当前任务现场，并只执行获批的精确命令', async () => {
  const current = await fixture()
  try {
    const result = await current.runtime.executeOwnerHostCommand({
      command: 'flutter test test/core_service_test.dart',
      description: '运行 Flutter 定向测试',
      justification: 'Flutter 需要更新 worktree 外的共享 SDK 缓存。',
      workdir: 'flutter_app',
      timeout_ms: 60_000,
    }, current.exec)

    assert.equal(result.exitCode, 0)
    assert.equal(current.calls.approvals.length, 1)
    assert.equal(current.calls.approvals[0].agent, current.exec.agent)
    assert.equal(current.calls.approvals[0].toolName, 'owner_host_exec')
    assert.equal(current.calls.approvals[0].callId, 'child-call-id')
    assert.match(current.calls.approvals[0].reason, /flutter test test\/core_service_test\.dart/u)
    assert.match(current.calls.approvals[0].reason, /共享 SDK 缓存/u)
    assert.equal(current.calls.shells.length, 1)
    assert.equal(current.calls.shells[0].command, 'flutter test test/core_service_test.dart')
    assert.equal(current.calls.shells[0].workdir, join(current.worktree, 'flutter_app'))
    assert.equal(current.calls.shells[0].sandboxPolicy.mode, 'danger-full-access')
    assert.equal(current.calls.shells[0].sandboxPolicy.workspaceRoot, current.worktree)
    assert.equal(current.calls.logs.at(-1)[2], 'owner.host-command-finished')
    assert.equal(current.active.hostCommandPending, false)
  } finally {
    await current.dispose()
  }
})

test('Owner 宿主命令接受结构化 argv，参数中的连接符不被误判为复合命令', async () => {
  const current = await fixture()
  try {
    const result = await current.runtime.executeOwnerHostCommand({
      argv: ['flutter', 'test', '--name', 'A; B'],
      description: '运行包含特殊字符名称的测试',
      justification: 'Flutter 需要访问共享 SDK 缓存。',
    }, current.exec)

    assert.equal(result.exitCode, 0)
    assert.equal(current.calls.shells[0].command, "flutter test --name 'A; B'")
    assert.match(current.calls.approvals[0].reason, /flutter test --name 'A; B'/u)
  } finally {
    await current.dispose()
  }
})

test('拒绝、取消或不可用授权都不会执行 Owner 宿主命令', async () => {
  for (const outcome of ['rejected', 'cancelled', 'unavailable']) {
    const current = await fixture()
    try {
      current.calls.outcome = outcome
      await assert.rejects(current.runtime.executeOwnerHostCommand({
        command: 'flutter test',
        description: '运行 Flutter 测试',
        justification: '需要共享 SDK 缓存。',
      }, current.exec), /没有执行/u)
      assert.equal(current.calls.shells.length, 0)
      assert.equal(current.active.hostCommandPending, false)
    } finally {
      await current.dispose()
    }
  }
})

test('Owner 宿主命令拒绝 worktree 外工作目录和授权后的失效绑定', async () => {
  const outside = await fixture()
  try {
    await assert.rejects(outside.runtime.executeOwnerHostCommand({
      command: 'pwd',
      description: '检查目录',
      justification: '测试目录边界。',
      workdir: '..',
    }, outside.exec), /只能位于当前 Owner worktree/u)
    assert.equal(outside.calls.approvals.length, 0)
  } finally {
    await outside.dispose()
  }

  const stale = await fixture()
  try {
    stale.runtime.ctx.approval.request = async request => {
      stale.calls.approvals.push(request)
      stale.runtime.activeOwners.delete('owner-session')
      return 'allowed-once'
    }
    await assert.rejects(stale.runtime.executeOwnerHostCommand({
      command: 'flutter test',
      description: '运行 Flutter 测试',
      justification: '需要共享 SDK 缓存。',
    }, stale.exec), /active Owner 绑定已经失效/u)
    assert.equal(stale.calls.shells.length, 0)
  } finally {
    await stale.dispose()
  }
})

test('Owner 宿主命令在请求授权前拒绝目录探测和复合命令', async () => {
  const current = await fixture()
  try {
    await assert.rejects(current.runtime.executeOwnerHostCommand({
      command: 'ls -la',
      description: '查看目录',
      justification: '检查工程文件。',
    }, current.exec), /不能用于 pwd、目录或 Git 状态探测/u)
    await assert.rejects(current.runtime.executeOwnerHostCommand({
      command: "pwd && printf '\\nFiles:\\n' && ls",
      description: '查看目录',
      justification: '检查工程文件。',
    }, current.exec), /只能原样重试一条命令/u)
    assert.equal(current.calls.approvals.length, 0)
    assert.equal(current.calls.shells.length, 0)
  } finally {
    await current.dispose()
  }
})

test('Owner 宿主命令的授权和执行都会在 timeout_ms 后结算', async () => {
  const approvalTimeout = await fixture()
  try {
    approvalTimeout.runtime.ctx.approval.request = async request => {
      approvalTimeout.calls.approvals.push(request)
      return new Promise(() => {})
    }
    await assert.rejects(approvalTimeout.runtime.executeOwnerHostCommand({
      command: 'flutter test',
      description: '运行 Flutter 测试',
      justification: '需要共享 SDK 缓存。',
      timeout_ms: 50,
    }, approvalTimeout.exec), /授权等待超过 50ms/u)
    assert.equal(approvalTimeout.calls.approvals.length, 1)
    assert.equal(approvalTimeout.calls.approvals[0].signal.aborted, true)
    assert.equal(approvalTimeout.active.hostCommandPending, false)
  } finally {
    await approvalTimeout.dispose()
  }

  const executionTimeout = await fixture()
  try {
    executionTimeout.runtime.ctx.shell.run = async spec => {
      executionTimeout.calls.shells.push(spec)
      return new Promise(() => {})
    }
    await assert.rejects(executionTimeout.runtime.executeOwnerHostCommand({
      command: 'flutter test',
      description: '运行 Flutter 测试',
      justification: '需要共享 SDK 缓存。',
      timeout_ms: 50,
    }, executionTimeout.exec), /执行超过 50ms/u)
    assert.equal(executionTimeout.calls.shells.length, 1)
    assert.equal(executionTimeout.calls.shells[0].signal.aborted, true)
    assert.equal(executionTimeout.active.hostCommandPending, false)
  } finally {
    await executionTimeout.dispose()
  }
})

test('Owner 任务没有开放回合时，宿主命令给出可恢复错误且不执行', async () => {
  const current = await fixture()
  try {
    current.runtime.ctx.approval.request = async () => {
      throw new Error('approval.request() outside an open turn')
    }
    await assert.rejects(current.runtime.executeOwnerHostCommand({
      command: 'flutter test',
      description: '运行 Flutter 测试',
      justification: '需要共享 SDK 缓存。',
    }, current.exec), /Owner 任务没有开放回合.*保留现场/u)
    assert.equal(current.calls.shells.length, 0)
  } finally {
    await current.dispose()
  }
})
