import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  ACCEPTANCE_CANDIDATE_CONTRACT,
  normalizeAcceptanceItems,
  parseNodeTestSummary,
  runAcceptanceSuite,
} from '../src/acceptance-runner.mjs'

const execFileAsync = promisify(execFile)
const digest = character => character.repeat(64)

function candidate() {
  return {
    contract: ACCEPTANCE_CANDIDATE_CONTRACT,
    candidateId: 'candidate-ca01-r1',
    workflowId: 'wf-ca01',
    planningSnapshotDigest: digest('1'),
    planDigest: digest('2'),
    codeCommitSha: '3'.repeat(40),
    contentDigest: digest('4'),
    spec: { id: 'SPEC-CA01', revision: 'R4', digest: digest('5') },
    tickets: [{ id: 'T-12', revision: 'R4', digest: digest('6') }],
  }
}

function item(id, overrides = {}) {
  return {
    id,
    title: id,
    dependsOn: [],
    argv: [process.execPath, '--test', `${id}.test.mjs`],
    cwd: '.',
    timeoutMs: 2_000,
    adapter: 'node-test',
    ...overrides,
  }
}

test('Node test适配器只把有非零用例且证据完整的结果识别为可通过', () => {
  assert.deepEqual(parseNodeTestSummary('# tests 2\n# pass 2\n# fail 0\n'), {
    tests: 2,
    pass: 2,
    fail: 0,
  })
  assert.deepEqual(parseNodeTestSummary('ℹ tests 0\nℹ pass 0\nℹ fail 0\n'), {
    tests: 0,
    pass: 0,
    fail: 0,
  })
  assert.equal(parseNodeTestSummary('command succeeded without test summary'), undefined)
})

test('集中验收拒绝未知依赖、依赖环和空命令', () => {
  assert.throws(() => normalizeAcceptanceItems([
    item('a', { dependsOn: ['missing'] }),
  ]), /依赖未知项/u)
  assert.throws(() => normalizeAcceptanceItems([
    item('a', { dependsOn: ['b'] }),
    item('b', { dependsOn: ['a'] }),
  ]), /依赖环/u)
  assert.throws(() => normalizeAcceptanceItems([
    item('a', { argv: [] }),
  ]), /argv必须非空/u)
})

test('真实Node入口在首项失败后继续独立项，并分类阻塞、超时、取消、零用例和未运行', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-acceptance-runner-'))
  const fixedCandidate = candidate()
  try {
    await writeFile(join(root, 'fail.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('fails',()=>assert.equal(1,2));\n")
    await writeFile(join(root, 'pass.test.mjs'), "import test from 'node:test'; test('passes',()=>{});\n")
    await mkdir(join(root, 'empty'))
    await writeFile(join(root, 'timeout.test.mjs'), "import test from 'node:test'; test('waits',async()=>new Promise(resolve=>setTimeout(resolve,10_000)));\n")

    const childEnvironment = { ...process.env }
    delete childEnvironment.NODE_TEST_CONTEXT
    const executor = {
      async run(request) {
        if (request.itemId === 'cancelled') {
          return { exitCode: 1, aborted: true, contentDigest: fixedCandidate.contentDigest, codeCommitSha: fixedCandidate.codeCommitSha }
        }
        if (request.itemId === 'incomplete') {
          return { exitCode: 0, stdout: '没有用例计数', contentDigest: fixedCandidate.contentDigest, codeCommitSha: fixedCandidate.codeCommitSha }
        }
        try {
          const result = await execFileAsync(request.argv[0], request.argv.slice(1), {
            cwd: join(root, request.cwd),
            encoding: 'utf8',
            timeout: request.timeoutMs,
            env: childEnvironment,
          })
          return {
            exitCode: 0,
            stdout: result.stdout,
            stderr: result.stderr,
            contentDigest: fixedCandidate.contentDigest,
            codeCommitSha: fixedCandidate.codeCommitSha,
          }
        } catch (error) {
          return {
            exitCode: Number.isInteger(error.code) ? error.code : 1,
            timedOut: error.killed === true,
            stdout: error.stdout,
            stderr: error.stderr,
            contentDigest: fixedCandidate.contentDigest,
            codeCommitSha: fixedCandidate.codeCommitSha,
          }
        }
      },
    }
    const result = await runAcceptanceSuite({
      candidate: fixedCandidate,
      executor,
      items: [
        item('fail'),
        item('blocked', { dependsOn: ['fail'] }),
        item('pass'),
        item('timeout', { timeoutMs: 100 }),
        item('zero', { argv: [process.execPath, '--test'], cwd: 'empty' }),
        item('cancelled'),
        item('incomplete'),
        item('declared-skip', { disposition: { kind: 'skip', reason: '当前平台不适用' } }),
        item('declared-not-run', { disposition: { kind: 'not_run', reason: '所需设备未接入' } }),
      ],
    })
    assert.equal(result.status, 'cancelled')
    assert.deepEqual(
      Object.fromEntries(result.results.map(entry => [entry.itemId, entry.status])),
      {
        fail: 'failed',
        pass: 'passed',
        timeout: 'timed_out',
        zero: 'zero_tests',
        cancelled: 'cancelled',
        incomplete: 'evidence_incomplete',
        'declared-skip': 'skipped',
        'declared-not-run': 'not_run',
        blocked: 'blocked',
      },
    )
    assert.deepEqual(result.results.find(entry => entry.itemId === 'blocked').blockedBy, [
      { itemId: 'fail', status: 'failed' },
    ])
    assert.equal(result.results.find(entry => entry.itemId === 'pass').testSummary.tests, 1)
    assert.equal(result.results.find(entry => entry.itemId === 'zero').testSummary.tests, 0)
    assert.match(result.results.find(entry => entry.itemId === 'fail').stdout, /tests 1/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('候选摘要或代码提交变化时旧结果不能计为通过', async () => {
  const fixedCandidate = candidate()
  const result = await runAcceptanceSuite({
    candidate: fixedCandidate,
    items: [item('stale')],
    executor: {
      async run() {
        return {
          exitCode: 0,
          stdout: '# tests 1\n# pass 1\n# fail 0\n',
          contentDigest: digest('a'),
          codeCommitSha: fixedCandidate.codeCommitSha,
        }
      },
    },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.results[0].status, 'stale_candidate')
})
