import test from 'node:test'
import assert from 'node:assert/strict'
import { submitOwnerResult } from '../src/owner-submission.mjs'
import { OwnerVerificationApprovalRequiredError } from '../src/owner-lifecycle.mjs'

function report(status = 'completed') {
  return {
    contract: 'DSH_OWNER_RESULT_V1',
    status,
    summary: status === 'completed' ? '完成提交关卡测试' : '等待其他 Owner',
    changes: status === 'completed'
      ? [{ summary: '修改测试文件', files: ['src/value.ts'], tests: ['单元测试通过'] }]
      : [],
    tests: status === 'completed' ? ['单元测试通过'] : ['未运行：等待转交'],
    handoffs: [],
    memory_updates: [],
  }
}

function fixture() {
  const active = {
    owner: { id: 'code-owner' },
    stage: { id: 'T1' },
    state: {
      plan: {
        contract: 'DSH_PLAN_V2',
        tasks: [{ id: 'T1', ownerId: 'code-owner', verify: ['unit'] }],
        owners: [{ id: 'code-owner', scope: ['src/**'], exclude: [] }],
      },
    },
    entry: {},
  }
  const calls = []
  const runtime = {
    activeOwners: new Map([['owner-session', active]]),
    async inspectOwnerAttempt() {
      calls.push('inspect')
      return { violations: [] }
    },
    async recordBoundVerification(args) {
      calls.push(`verify:${args.verification_id}`)
    },
    async commitOwnerAttempt() {
      calls.push('commit')
      return { changed: ['src/value.ts'], commitSha: 'a'.repeat(40) }
    },
  }
  const exec = { agent: { id: 'owner-session' }, signal: new AbortController().signal }
  return { active, calls, runtime, exec }
}

test('owner_submit 顺序执行边界检查、固定验证和提交', async () => {
  const { active, calls, runtime, exec } = fixture()
  const result = await submitOwnerResult(runtime, report(), exec)
  assert.deepEqual(calls, ['inspect', 'verify:unit', 'commit'])
  assert.equal(result.status, 'completed')
  assert.equal(result.commitSha, 'a'.repeat(40))
  assert.equal(active.submission.report.summary, '完成提交关卡测试')
})

test('Owner blocked 报告不会运行验证或提交', async () => {
  const { calls, runtime, exec } = fixture()
  const result = await submitOwnerResult(runtime, report('blocked'), exec)
  assert.deepEqual(calls, [])
  assert.equal(result.status, 'blocked')
})

test('Owner needs_repair 留在当前子线程继续调整，不能制造脏现场恢复循环', async () => {
  const { active, calls, runtime, exec } = fixture()
  await assert.rejects(submitOwnerResult(runtime, report('needs_repair'), exec), /不接受 needs_repair.*继续修复/u)
  assert.deepEqual(calls, [])
  assert.equal(active.submissionAttempted, true)
  assert.equal(active.submission, undefined)
})

test('固定验证等待主代理授权时自动结算为 blocked，不依赖 Owner 模型猜测', async () => {
  const { active, calls, runtime, exec } = fixture()
  runtime.recordBoundVerification = async () => {
    calls.push('verify:unit')
    throw new OwnerVerificationApprovalRequiredError('等待主代理授权固定验证')
  }
  const result = await submitOwnerResult(runtime, report(), exec)
  assert.equal(result.status, 'blocked')
  assert.equal(result.accepted, true)
  assert.match(result.nextAction, /主代理原生授权/u)
  assert.equal(active.submission.report.status, 'blocked')
  assert.deepEqual(calls, ['inspect', 'verify:unit'])
})

test('固定验证已经执行失败后拒绝 Owner 错报为 blocked', async () => {
  const { active, calls, runtime, exec } = fixture()
  active.verificationResults = {
    unit: {
      verificationId: 'unit',
      exitCode: 1,
      passed: false,
      enforcement: 'approved-host',
      approvalOutcome: 'allowed-once',
      stderr: 'core_service_test.dart:42 断言失败',
    },
  }
  await assert.rejects(
    submitOwnerResult(runtime, report('blocked'), exec),
    /已实际执行并失败.*不是授权阻塞.*断言失败/su,
  )
  assert.deepEqual(calls, [])
  assert.equal(active.submission, undefined)
})

test('未获得可执行权限的验证结果仍允许 Owner 报告 blocked', async () => {
  const { active, calls, runtime, exec } = fixture()
  active.verificationResults = {
    unit: {
      verificationId: 'unit',
      exitCode: 1,
      passed: false,
      enforcement: 'partial',
      stderr: 'sandbox denied',
    },
  }
  const result = await submitOwnerResult(runtime, report('blocked'), exec)
  assert.equal(result.status, 'blocked')
  assert.deepEqual(calls, [])
})
