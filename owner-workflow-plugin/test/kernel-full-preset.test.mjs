import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
test('complete production preset mounts native capabilities and delivers without manual kernel registration', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_FULL_PRESET_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualFullPreset, true)
})
