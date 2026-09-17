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
    commitSha: digest('4'),
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
    adapter: 'command',
    ...overrides,
  }
}

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

test('集中验收只按项目命令的退出状态分类，不解释测试框架输出', async () => {
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
          return { exitCode: 1, aborted: true, commitSha: fixedCandidate.commitSha, codeCommitSha: fixedCandidate.codeCommitSha }
        }
        if (request.itemId === 'incomplete') {
          return { exitCode: 0, stdout: '没有用例计数', commitSha: fixedCandidate.commitSha, codeCommitSha: fixedCandidate.codeCommitSha }
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
            commitSha: fixedCandidate.commitSha,
            codeCommitSha: fixedCandidate.codeCommitSha,
          }
        } catch (error) {
          return {
            exitCode: Number.isInteger(error.code) ? error.code : 1,
            timedOut: error.killed === true,
            stdout: error.stdout,
            stderr: error.stderr,
            commitSha: fixedCandidate.commitSha,
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
        zero: 'passed',
        cancelled: 'cancelled',
        incomplete: 'passed',
        'declared-skip': 'skipped',
        'declared-not-run': 'not_run',
        blocked: 'blocked',
      },
    )
    assert.deepEqual(result.results.find(entry => entry.itemId === 'blocked').blockedBy, [
      { itemId: 'fail', status: 'failed' },
    ])
    assert.match(result.results.find(entry => entry.itemId === 'fail').stdout, /tests 1/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('中断和超时保留原始输出，但不解释项目测试格式', async () => {
  const fixedCandidate = candidate()
  for (const [flags, status] of [[{ timedOut: true }, 'timed_out'], [{ aborted: true }, 'cancelled']]) {
    const result = await runAcceptanceSuite({
      candidate: fixedCandidate,
      items: [item('interrupted')],
      executor: { async run() { return {
        ...flags, exitCode: 1, codeCommitSha: fixedCandidate.codeCommitSha,
        commitSha: fixedCandidate.commitSha,
        stdout: '# tests 3\n# pass 2\n# fail 0\n# cancelled 1\n',
      } } },
    })
    assert.equal(result.results[0].status, status)
    assert.match(result.results[0].stdout, /tests 3/u)
    assert.equal(result.results[0].testSummary, undefined)
    assert.notEqual(result.status, 'passed')
  }
})

test('代码提交变化时旧结果不能计为通过', async () => {
  const fixedCandidate = candidate()
  const result = await runAcceptanceSuite({
    candidate: fixedCandidate,
    items: [item('stale')],
    executor: {
      async run() {
        return {
          exitCode: 0,
          stdout: '# tests 1\n# pass 1\n# fail 0\n',
          codeCommitSha: digest('a').slice(0, 40),
        }
      },
    },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.results[0].status, 'stale_candidate')
})
