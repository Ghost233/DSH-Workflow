import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPassingVerification,
  createVerificationResult,
  isVerificationCurrent,
  parseFixedArgv,
  parseVerificationResult,
  resolveBoundVerification,
  runBoundVerification,
} from '../src/verification.mjs'

const DIGEST_A = 'a'.repeat(64)
const DIGEST_B = 'b'.repeat(64)

function verificationCatalog() {
  return [
    { id: 'unit', run: ['node', '--test', 'test/unit.test.mjs'], cwd: 'packages/unit' },
    { id: 'lint', run: ['node', 'scripts/lint.mjs'] },
  ]
}

function task() {
  return { id: 'T1', verify: ['unit'] }
}

function fakeSnapshotExecutor({ contentDigest = DIGEST_A, exitCode = 0, enforcement = 'full', approvalOutcome } = {}) {
  const calls = []
  return {
    calls,
    async run(request) {
      calls.push({ argv: [...request.argv], cwd: request.cwd })
      return {
        contentDigest,
        exitCode,
        approvalOutcome,
        sandbox: { enforcement },
      }
    },
  }
}

test('固定 argv 解析复制并冻结目录定义，拒绝非 argv 输入', () => {
  const argv = parseFixedArgv(['node', '--test', 'test/unit.test.mjs'], 'unit')
  assert.deepEqual(argv, ['node', '--test', 'test/unit.test.mjs'])
  assert.ok(Object.isFrozen(argv))
  assert.throws(() => parseFixedArgv('node --test', 'unit'), /argv.*数组/u)
  assert.throws(() => parseFixedArgv([], 'unit'), /argv.*非空/u)
  assert.throws(() => parseFixedArgv(['node', ''], 'unit'), /argv\[1\].*非空/u)
})

test('绑定验证原样传递固定 argv 与 cwd，忽略调用者伪造的 argv', async () => {
  const executor = fakeSnapshotExecutor()
  const result = await runBoundVerification({
    task: task(),
    verifications: verificationCatalog(),
    verificationId: 'unit',
    argv: ['node', '--test', '--watch'],
    snapshotExecutor: executor,
  })

  assert.deepEqual(executor.calls, [{ argv: ['node', '--test', 'test/unit.test.mjs'], cwd: 'packages/unit' }])
  assert.deepEqual(result.argv, ['node', '--test', 'test/unit.test.mjs'])
  assert.equal(result.cwd, 'packages/unit')
  assert.ok(Object.isFrozen(result.argv))
})

test('绑定验证保留声明 cwd，旧验证缺省时只使用仓库根目录', () => {
  assert.deepEqual(resolveBoundVerification({
    task: task(),
    verifications: verificationCatalog(),
    verificationId: 'unit',
  }), {
    id: 'unit', argv: ['node', '--test', 'test/unit.test.mjs'], cwd: 'packages/unit',
  })
  assert.deepEqual(resolveBoundVerification({
    task: task(),
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    verificationId: 'unit',
  }), {
    id: 'unit', argv: ['node', '--test'],
  })
})

test('未知或未绑定验证 ID 在创建快照前拒绝', async () => {
  const executor = fakeSnapshotExecutor()
  for (const verificationId of ['unknown', 'lint']) {
    await assert.rejects(
      runBoundVerification({ task: task(), verifications: verificationCatalog(), verificationId, snapshotExecutor: executor }),
      /未知|未绑定/u,
    )
  }
  assert.deepEqual(executor.calls, [])
})

test('验证结果包含固定 contentDigest 与可序列化证据字段', () => {
  const result = createVerificationResult({
    verificationId: 'unit',
    argv: ['node', '--test'],
    contentDigest: DIGEST_A.toUpperCase(),
    exitCode: 0,
    enforcement: 'full',
  })

  assert.deepEqual(result, {
    contract: 'DSH_VERIFICATION_RESULT_V1',
    verificationId: 'unit',
    argv: ['node', '--test'],
    cwd: '.',
    contentDigest: DIGEST_A,
    exitCode: 0,
    enforcement: 'full',
    passed: true,
  })
  assert.throws(() => createVerificationResult({ ...result, contentDigest: 'short' }), /contentDigest/u)
  assert.throws(() => createVerificationResult({ ...result, exitCode: '0' }), /exitCode/u)
  assert.throws(() => parseVerificationResult({ ...result, passed: true, enforcement: 'partial' }), /passed/u)
  assert.throws(() => parseVerificationResult({ ...result, argv: [] }), /argv/u)
  const { cwd: _cwd, ...withoutCwd } = result
  assert.throws(() => parseVerificationResult(withoutCwd), /cwd/u)

  const output = createVerificationResult({
    ...result,
    stdout: '测试标准输出',
    stderr: '测试错误输出',
    stdoutTruncated: false,
    stderrTruncated: true,
  })
  assert.equal(parseVerificationResult(output).stdout, '测试标准输出')
  assert.equal(parseVerificationResult(output).stderr, '测试错误输出')
  assert.equal(parseVerificationResult(output).stderrTruncated, true)

  const bounded = createVerificationResult({
    ...result,
    stdout: `开头-${'x'.repeat(20 * 1024)}-结尾`,
    stdoutTruncated: false,
  })
  assert.equal(Buffer.byteLength(bounded.stdout, 'utf8') <= 16 * 1024, true)
  assert.equal(bounded.stdout.endsWith('-结尾'), true)
  assert.equal(bounded.stdoutTruncated, true)
})

test('验证结果仅在 contentDigest 完全相同时有效', () => {
  const result = createVerificationResult({
    verificationId: 'unit', argv: ['node', '--test'], contentDigest: DIGEST_A, exitCode: 0, enforcement: 'full',
  })
  assert.equal(isVerificationCurrent(result, DIGEST_A), true)
  assert.equal(isVerificationCurrent(result, DIGEST_B), false)
  assert.throws(() => assertPassingVerification(result, DIGEST_B), /工作区内容已变化/u)
})

test('通过结果必须同时具备 full enforcement 与零 exitCode 证据', async () => {
  for (const evidence of [
    { exitCode: 1, enforcement: 'full' },
    { exitCode: 0, enforcement: 'partial' },
  ]) {
    const result = await runBoundVerification({
      task: task(),
      verifications: verificationCatalog(),
      verificationId: 'unit',
      snapshotExecutor: fakeSnapshotExecutor(evidence),
    })
    assert.equal(result.passed, false)
    assert.throws(() => assertPassingVerification(result, DIGEST_A), /exitCode|enforcement/u)
  }
})

test('主代理原生允许一次可以作为 approved-host 固定验证证据', async () => {
  const result = await runBoundVerification({
    task: task(),
    verifications: verificationCatalog(),
    verificationId: 'unit',
    snapshotExecutor: fakeSnapshotExecutor({
      enforcement: 'approved-host',
      approvalOutcome: 'allowed-once',
    }),
  })
  assert.equal(result.passed, true)
  assert.equal(result.enforcement, 'approved-host')
  assert.equal(result.approvalOutcome, 'allowed-once')
  assert.equal(assertPassingVerification(result, DIGEST_A).passed, true)
  assert.throws(
    () => createVerificationResult({ ...result, approvalOutcome: 'rejected' }),
    /allowed-once/u,
  )
})

test('ok:false、超时、中止或后台宿主证据绝不能成为 passed:true', async () => {
  const failures = [
    { ok: false },
    { ok: true, timedOut: true },
    { ok: true, aborted: true },
    { ok: true, kind: 'background' },
  ]
  for (const failure of failures) {
    const result = await runBoundVerification({
      task: task(),
      verifications: verificationCatalog(),
      verificationId: 'unit',
      snapshotExecutor: {
        async run(argv) {
          return {
            argv,
            ...failure,
            contentDigest: DIGEST_A,
            exitCode: 0,
            sandbox: { enforcement: 'full' },
          }
        },
      },
    })
    const parsed = parseVerificationResult(result)
    for (const [field, value] of Object.entries(failure)) assert.equal(parsed[field], value)
    assert.equal(result.passed, false, JSON.stringify(failure))
    assert.throws(() => assertPassingVerification(result, DIGEST_A), /失败|超时|中止|后台|passed/u)
  }
})
