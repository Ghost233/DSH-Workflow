import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
const exec = promisify(execFile)
for (const parallel of [false, true]) test(parallel ? 'two native Owners overlap, integrate disjoint candidates and unlock their real downstream verification' : 'native runtime executes scoped edit, async submission, real verification, integration and final verification', { timeout: 60_000 }, async () => {
  const childEnvironment = { ...process.env }; delete childEnvironment.NODE_TEST_CONTEXT
  const result = await exec(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-pipeline-smoke.mjs', import.meta.url)), ...(parallel ? ['--parallel'] : [])], {
    env: { ...childEnvironment, GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' },
    timeout: 45_000, maxBuffer: 256 * 1024,
  })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.counts.completedTasks, parallel ? 3 : 1)
  if (parallel) assert.equal(report.parallelObserved, true)
})
